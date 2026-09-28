// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/image/ImageConverter.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import sharp from 'sharp'
import { BufferedImage, ByteArrayOutputStream, drawableRgba, ImageIO } from '../../port/imageio-codecs.js'
import { Thumbnails, type ThumbnailsBuilder } from '../../port/thumbnailator.js'
import { ByteArrayInputStream } from '../../port/java-io.js'
import { IllegalArgumentException, lazy, NullPointerException } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'
import { ContentDetector } from '../mediacontainer/ContentDetector.js'
import { ImageAnalyzer } from './ImageAnalyzer.js'
import type { ImageType } from './ImageType.js'

// PORT: ImageIO + TwelveMonkeys/NightMonkeys + Thumbnailator -> port/imageio*.ts et port/thumbnailator.ts (sharp, mupdf,
// libheif-js, @jsquash/jxl). Décisions (formats lisibles / inscriptibles, lecteur choisi, dimensions, type de sortie)
// vérifiées contre Komga (jshell) : test/port/image-oracle.test.ts. Les pixels produits peuvent différer (décodeurs,
// rééchantillonnage et encodeurs différents). Les conversions et redimensionnements sont asynchrones (PORT: async).
const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.image.ImageConverter')

const WEBP_NIGHT_MONKEYS = 'com.github.gotson.nightmonkeys.webp.imageio.plugins.WebpImageReaderSpi'

export class ImageConverter {
  get supportedReadFormats(): string[] {
    return lazy(this, 'supportedReadFormats', () => ImageIO.getReaderFormatNames())
  }
  get supportedReadMediaTypes(): string[] {
    return lazy(this, 'supportedReadMediaTypes', () => ImageIO.getReaderMIMETypes())
  }
  get supportedWriteFormats(): string[] {
    return lazy(this, 'supportedWriteFormats', () => ImageIO.getWriterFormatNames())
  }
  get supportedWriteMediaTypes(): string[] {
    return lazy(this, 'supportedWriteMediaTypes', () => ImageIO.getWriterMIMETypes())
  }

  constructor(
    private readonly imageAnalyzer: ImageAnalyzer,
    private readonly contentDetector: ContentDetector,
  ) {
    this.chooseWebpReader()
    logger.info(() => `Supported read formats: [${this.supportedReadFormats.join(', ')}]`)
    logger.info(() => `Supported read mediaTypes: [${this.supportedReadMediaTypes.join(', ')}]`)
    logger.info(() => `Supported write formats: [${this.supportedWriteFormats.join(', ')}]`)
    logger.info(() => `Supported write mediaTypes: [${this.supportedWriteMediaTypes.join(', ')}]`)
  }

  private chooseWebpReader(): void {
    // PORT: le registre de port/imageio-readers.ts ne contient que le lecteur WebP de NightMonkeys (${WEBP_NIGHT_MONKEYS}),
    // état obtenu par Komga après le retrait des autres fournisseurs WebP (TwelveMonkeys)
    logger.debug(() => `WebP reader providers: [${WEBP_NIGHT_MONKEYS}]`)
  }

  private readonly supportsTransparency = ['png']

  canConvertMediaType(from: string, to: string): boolean {
    return this.supportedReadMediaTypes.includes(from) && this.supportedWriteMediaTypes.includes(to)
  }

  // PORT: async
  async convertImage(imageBytes: Uint8Array, format: string): Promise<Uint8Array> {
    const baos = new ByteArrayOutputStream()
    try {
      const image = await ImageIO.read(new ByteArrayInputStream(imageBytes))

      // PORT: ImageIO.read renvoie null si aucun lecteur : image.colorModel -> NullPointerException quand le canal alpha
      // est testé, sinon ImageIO.write(null, ...) -> IllegalArgumentException("im == null!")
      if (image === null) {
        if (!this.supportsTransparency.includes(format)) throw new NullPointerException()
        throw new IllegalArgumentException('im == null!')
      }
      // UPSTREAM-BUG: supportsTransparency contient "png" en minuscules alors que les appelants passent ImageType.imageIOFormat
      // ("PNG") : la transparence est aussi aplatie sur fond blanc pour une conversion en PNG (reproduit)
      const result =
        !this.supportsTransparency.includes(format) && this.containsAlphaChannel(image)
          ? await (async () => {
              if (this.containsTransparency(image)) logger.info(() => 'Image contains alpha channel but is not opaque, visual artifacts may appear')
              else logger.info(() => 'Image contains alpha channel but is opaque, conversion should not generate any visual artifacts')
              // BufferedImage(image.width, image.height, TYPE_INT_RGB) + drawImage(image, 0, 0, Color.WHITE, null)
              const it = await sharp(drawableRgba(image), { raw: { width: image.width, height: image.height, channels: 4 } })
                .flatten({ background: '#ffffff' })
                .raw()
                .toBuffer({ resolveWithObject: true })
              return BufferedImage.of(it.info.width, it.info.height, new Uint8Array(it.data.buffer, it.data.byteOffset, it.data.byteLength), it.info.channels as 3, false, {
                type: BufferedImage.TYPE_INT_RGB,
              })
            })()
          : image

      await ImageIO.write(result, format, baos)

      return baos.toByteArray()
    } finally {
      baos.close()
    }
  }

  // PORT: async
  async resizeImageToByteArray(imageBytes: Uint8Array, format: ImageType, size: number): Promise<Uint8Array> {
    const builder = this.resizeImageBuilder(imageBytes, format, size)
    if (builder === null) return imageBytes

    const it = new ByteArrayOutputStream()
    try {
      await builder.toOutputStream(it)
      return it.toByteArray()
    } finally {
      it.close()
    }
  }

  // PORT: async
  async resizeImageToBufferedImage(imageBytes: Uint8Array, format: ImageType, size: number): Promise<BufferedImage> {
    const builder = this.resizeImageBuilder(imageBytes, format, size)
    // PORT: ImageIO.read(...) peut renvoyer null (type Kotlin plateforme) : NullPointerException à l'usage, ici immédiatement
    if (builder === null) {
      const image = await ImageIO.read(new ByteArrayInputStream(imageBytes))
      if (image === null) throw new NullPointerException()
      return image
    }

    return builder.asBufferedImage()
  }

  private resizeImageBuilder(imageBytes: Uint8Array, format: ImageType, size: number): ThumbnailsBuilder | null {
    const dimension = this.imageAnalyzer.getDimension(new ByteArrayInputStream(imageBytes))
    let longestEdge: number | null = null
    if (dimension !== null) {
      const mediaType = this.contentDetector.detectMediaType(new ByteArrayInputStream(imageBytes))
      const edge = Math.max(dimension.height, dimension.width)
      // don't resize if source and target format is the same, and source is smaller than desired
      if (mediaType === format.mediaType && edge <= size) return null
      longestEdge = edge
    }

    // prevent upscaling
    const resizeTo = longestEdge !== null ? Math.min(longestEdge, size) : size

    return Thumbnails.of(new ByteArrayInputStream(imageBytes)).size(resizeTo, resizeTo).imageType(BufferedImage.TYPE_INT_ARGB).outputFormat(format.imageIOFormat)
  }

  private containsAlphaChannel(image: BufferedImage): boolean {
    return image.colorModel.hasAlpha()
  }

  private containsTransparency(image: BufferedImage): boolean {
    for (let x = 0; x < image.width; x++) {
      for (let y = 0; y < image.height; y++) {
        // pixel shr 24 == 0x00 : alpha nul
        if (image.alphaAt(x, y) === 0x00) return true
      }
    }
    return false
  }
}

// @Service
component(ImageConverter, { inject: [ImageAnalyzer, ContentDetector] })
