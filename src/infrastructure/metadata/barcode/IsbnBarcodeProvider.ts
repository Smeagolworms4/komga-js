// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/barcode/IsbnBarcodeProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import zxing from '@zxing/library'
import { BookMetadataPatch, BookMetadataPatchCapability } from '../../../domain/model/BookMetadataPatch.js'
import type { BookWithMedia } from '../../../domain/model/BookWithMedia.js'
import type { Library } from '../../../domain/model/Library.js'
import { MediaProfile } from '../../../domain/model/MediaProfile.js'
import { MetadataPatchTarget } from '../../../domain/model/MetadataPatchTarget.js'
import { BookAnalyzer } from '../../../domain/service/BookAnalyzer.js'
import { ISBNValidator } from '../../../port/commons-validator.js'
import { type BufferedImage, ImageIO } from '../../../port/imageio-codecs.js'
import { distinct, str } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { component } from '../../../port/spring.js'
// PORT: com.google.zxing -> @zxing/library ; RGBLuminanceSource de ZXing 3.5.4 (rotation) portée dans port/zxing.ts
import { quietly, RGBLuminanceSource } from '../../../port/zxing.js'
import { BookMetadataProvider } from '../BookMetadataProvider.js'

// PORT: exports lus sur l'export par défaut du module CommonJS (Node 22, runtime de l'image linux/arm/v7, ne voit pas
// ses exports nommés)
const { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader } = zxing
type DecodeHintType = import('@zxing/library').DecodeHintType

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.metadata.barcode.IsbnBarcodeProvider')

const PAGES_LAST = 3
const PAGES_FIRST = 3

/**
 * `image.getRGB(0, 0, width, height, null, 0, width)` : pixels ARGB empaquetés à partir des pixels 8 bits entrelacés
 * du BufferedImage de port/imageio.ts (1 gris, 2 gris+alpha, 3 RGB, 4 RGBA).
 * PORT: raster CMYK (TIFF CMYK) converti sans profil ICC (Java passe par l'espace colorimétrique de l'image).
 */
function getRGB(image: BufferedImage): Int32Array {
  const { width, height, data, channels } = image
  const pixels = new Int32Array(width * height)
  const n = pixels.length
  // invariants sortis de la boucle (un appel de hasAlpha() par pixel coûtait autant que la conversion)
  const alpha = (channels === 2 || channels === 4) && image.colorModel.hasAlpha()
  const cmyk = image.info.cmyk === true && channels === 4
  if (channels <= 2) {
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const v = data[p] as number
      const a = alpha ? (data[p + 1] as number) : 255
      pixels[i] = (a << 24) | (v << 16) | (v << 8) | v
    }
  } else if (cmyk) {
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const k = data[p + 3] as number
      const r = 255 - Math.min(255, (data[p] as number) + k)
      const g = 255 - Math.min(255, (data[p + 1] as number) + k)
      const b = 255 - Math.min(255, (data[p + 2] as number) + k)
      pixels[i] = (255 << 24) | (r << 16) | (g << 8) | b
    }
  } else {
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const a = alpha ? (data[p + 3] as number) : 255
      pixels[i] = (a << 24) | ((data[p] as number) << 16) | ((data[p + 1] as number) << 8) | (data[p + 2] as number)
    }
  }
  return pixels
}

export class IsbnBarcodeProvider implements BookMetadataProvider {
  private readonly hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
    [DecodeHintType.TRY_HARDER, true],
  ])

  constructor(
    private readonly bookAnalyzer: BookAnalyzer,
    private readonly validator: ISBNValidator,
  ) {}

  readonly capabilities: ReadonlySet<BookMetadataPatchCapability> = new Set([BookMetadataPatchCapability.ISBN])

  // PORT: async (ImageIO.read et BookAnalyzer.getPageContent asynchrones)
  async getBookMetadataFromBook(book: BookWithMedia): Promise<BookMetadataPatch | null> {
    if (book.media.profile === MediaProfile.EPUB) return null

    const pages = Array.from({ length: Math.max(book.media.pageCount, 0) }, (_, i) => i + 1)
    const pagesToTry = distinct([...pages.slice(Math.max(pages.length - PAGES_LAST, 0)).reverse(), ...pages.slice(0, PAGES_FIRST)])

    for (const p of pagesToTry) {
      try {
        const imageBytes = await this.bookAnalyzer.getPageContent(book, p)
        // PORT: async (ImageIO.read décode avec sharp)
        const image = await ImageIO.read(imageBytes)
        if (image !== null) {
          const pixels = getRGB(image)
          const source = new RGBLuminanceSource(image.getWidth(), image.getHeight(), pixels)
          const bitmap = new BinaryBitmap(new HybridBinarizer(source))

          let result
          try {
            // PORT: décodage sans piles d'exception ni sortie console de @zxing/library (voir port/zxing.ts)
            result = quietly(() => new MultiFormatReader().decode(bitmap, this.hints))
          } catch (e) {
            result = null
          }

          if (result === null || result.getText() === null) {
            logger.debug(() => `Book page ${p} does not contain a barcode: ${str(book)}`)
          } else {
            if (this.validator.isValid(result.getText())) {
              logger.debug(() => `Book page ${p} contains barcode which is valid ISBN: '${result.getText()}'. ${str(book)}`)
              return new BookMetadataPatch({ isbn: this.validator.validate(result.getText()) })
            } else {
              logger.debug(() => `Book page ${p} contains barcode which is invalid ISBN: '${result.getText()}'. ${str(book)}`)
            }
          }
        }
      } catch (e) {
        logger.error(e as Error, () => 'Error while processing page')
      }
    }

    return null
  }

  shouldLibraryHandlePatch(library: Library, target: MetadataPatchTarget): boolean {
    switch (target) {
      case MetadataPatchTarget.BOOK:
        return library.importBarcodeIsbn
      default:
        return false
    }
  }
}

// @Service
component(IsbnBarcodeProvider, { inject: [BookAnalyzer, ISBNValidator], types: [BookMetadataProvider] })
