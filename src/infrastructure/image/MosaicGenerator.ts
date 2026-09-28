// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/image/MosaicGenerator.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import sharp, { type OverlayOptions } from 'sharp'
import { type BufferedImage, ByteArrayOutputStream, drawableRgba, ImageIO } from '../../port/imageio-codecs.js'
import { BufferedImage as BI } from '../../port/imageio.js'
import { component, type Token } from '../../port/spring.js'
import { KomgaSettingsProvider } from '../configuration/KomgaSettingsProvider.js'
import { ImageConverter } from './ImageConverter.js'
import { ImageType } from './ImageType.js'

export class MosaicGenerator {
  private readonly ratio = 0.7066666667

  constructor(
    private readonly komgaSettingsProvider: KomgaSettingsProvider,
    private readonly thumbnailType: ImageType,
    private readonly imageConverter: ImageConverter,
  ) {}

  // PORT: async
  async createMosaic(images: Uint8Array[]): Promise<Uint8Array> {
    const height = this.komgaSettingsProvider.thumbnailSize.maxEdge
    // roundToInt()
    const width = Math.round(height * this.ratio)
    const thumbs: BufferedImage[] = []
    for (const it of images) thumbs.push(await this.imageConverter.resizeImageToBufferedImage(it, this.thumbnailType, Math.trunc(height / 2)))

    const baos = new ByteArrayOutputStream()
    try {
      // BufferedImage(width, height, TYPE_INT_RGB) : fond noir ; drawImage(it, x, y, null) : composition alpha, découpe aux bords
      const overlays: OverlayOptions[] = []
      const positions: [number, number][] = [
        [0, 0],
        [Math.trunc(width / 2), 0],
        [0, Math.trunc(height / 2)],
        [Math.trunc(width / 2), Math.trunc(height / 2)],
      ]
      for (const [index, [x, y]] of positions.entries()) {
        const it = thumbs[index]
        if (it === undefined) continue
        const w = Math.min(it.width, width - x)
        const h = Math.min(it.height, height - y)
        if (w <= 0 || h <= 0) continue
        let img = sharp(drawableRgba(it), { raw: { width: it.width, height: it.height, channels: 4 } })
        if (w !== it.width || h !== it.height) img = img.extract({ left: 0, top: 0, width: w, height: h })
        const r = await img.raw().toBuffer({ resolveWithObject: true })
        overlays.push({ input: r.data, raw: { width: r.info.width, height: r.info.height, channels: r.info.channels }, left: x, top: y })
      }
      const mosaicRaw = await sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .composite(overlays)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const mosaic = BI.of(width, height, new Uint8Array(mosaicRaw.data.buffer, mosaicRaw.data.byteOffset, mosaicRaw.data.byteLength), 3, false, { type: BI.TYPE_INT_RGB })

      await ImageIO.write(mosaic, this.thumbnailType.imageIOFormat, baos)

      return baos.toByteArray()
    } finally {
      baos.close()
    }
  }
}

// @Service
component(MosaicGenerator, {
  // PORT: ImageType (enum, constructeur privé) converti en jeton d'injection
  inject: [KomgaSettingsProvider, { type: ImageType as unknown as Token, qualifier: 'thumbnailType' }, ImageConverter],
})
