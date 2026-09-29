// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/barcode/IsbnBarcodeProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BookMetadataPatch, BookMetadataPatchCapability } from '../../../domain/model/BookMetadataPatch.js'
import type { BookWithMedia } from '../../../domain/model/BookWithMedia.js'
import type { Library } from '../../../domain/model/Library.js'
import { MediaProfile } from '../../../domain/model/MediaProfile.js'
import { MetadataPatchTarget } from '../../../domain/model/MetadataPatchTarget.js'
import { BookAnalyzer } from '../../../domain/service/BookAnalyzer.js'
import { ISBNValidator } from '../../../port/commons-validator.js'
import { ImageIO } from '../../../port/imageio-codecs.js'
import { distinct, str } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { component } from '../../../port/spring.js'
// PORT: com.google.zxing -> build/komgazxing.node, ou @zxing/library chargé à la demande (port/zxing-reader.ts)
import { type BarcodeHints, decodeBarcode } from '../../../port/zxing-reader.js'
import { BookMetadataProvider } from '../BookMetadataProvider.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.metadata.barcode.IsbnBarcodeProvider')

const PAGES_LAST = 3
const PAGES_FIRST = 3

export class IsbnBarcodeProvider implements BookMetadataProvider {
  // PORT: écart — indications sans les énumérations de @zxing/library, qui n'est plus chargé qu'à la demande (voir
  // decodeBarcode) ; mêmes valeurs, traduites par port/zxing-reader.ts. Impact : aucun.
  // Kotlin :
  // private val hints =
  //   mapOf(
  //     DecodeHintType.POSSIBLE_FORMATS to EnumSet.of(BarcodeFormat.EAN_13),
  //     DecodeHintType.TRY_HARDER to true,
  //   )
  private readonly hints: BarcodeHints = { possibleFormats: ['EAN_13'], tryHarder: true }

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
          // PORT: écart — lecture du code-barres par build/komgazxing.node (portage en C du chemin de ZXing parcouru)
          // sur le pool de threads de libuv, au lieu de @zxing/library sur le thread JS : ~6 ms par page au lieu de
          // ~60 ms, sans bloquer les autres tâches ni les requêtes. Impact : aucun (mêmes résultats que ZXing Java,
          // voir port/zxing-reader.ts) ; KOMGAJS_NATIVE_BARCODE=false rétablit le code d'origine.
          // Kotlin :
          // val pixels = image.getRGB(0, 0, image.width, image.height, null, 0, image.width)
          // val source = RGBLuminanceSource(image.width, image.height, pixels)
          // val bitmap = BinaryBitmap(HybridBinarizer(source))
          //
          // val result =
          //   try {
          //     MultiFormatReader().decode(bitmap, hints)
          //   } catch (e: Exception) {
          //     null
          //   }
          const result = await decodeBarcode(image, this.hints)

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
