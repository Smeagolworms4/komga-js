// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/image/ImageAnalyzer.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Dimension } from '../../domain/model/Dimension.js'
import { ImageIO } from '../../port/imageio-codecs.js'
import { type InputStream, use } from '../../port/java-io.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.image.ImageAnalyzer')

export class ImageAnalyzer {
  /**
   * Returns the Dimension of the image contained in the stream.
   * The stream will not be closed, nor marked or reset.
   */
  // PORT: ImageIO (TwelveMonkeys / NightMonkeys / jai-imageio) -> port/imageio*.ts : lecture synchrone des en-têtes
  getDimension(stream: InputStream): Dimension | null {
    try {
      return use(ImageIO.createImageInputStream(stream), (fis) => {
        const readers = ImageIO.getImageReaders(fis)
        const next = readers.next()
        if (!next.done) {
          const reader = next.value
          reader.setInput(fis)
          return new Dimension({ width: reader.getWidth(0), height: reader.getHeight(0) })
        } else {
          logger.warn(() => 'no reader found')
          return null
        }
      })
    } catch (e) {
      logger.warn(e as Error, () => 'Could not get image dimensions')
      return null
    }
  }
}

// @Service
component(ImageAnalyzer)
