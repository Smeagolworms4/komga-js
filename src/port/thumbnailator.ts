// Support de portage : net.coobird.thumbnailator 0.4.21 (Thumbnails.of(InputStream).size(w, h).imageType(t).outputFormat(f),
// puis toOutputStream / asBufferedImage), sur ImageIO (imageio*.ts) et sharp. Ce fichier n'a pas de jumeau Kotlin.
// Reproduit : choix du lecteur ImageIO (UnsupportedFormatException sans lecteur), orientation EXIF des JPEG
// (ExifUtils : premier segment APPn commençant par « Exif », IFD0 supposée juste après l'en-tête TIFF), calcul des
// dimensions de FixedSizeThumbnailMaker (ratio conservé, Math.round, minimum 1), filtres d'orientation appliqués après
// redimensionnement, image ARGB, copie en RGB sur fond noir pour JPEG/BMP, PNG en compression maximale.
// Écarts : rééchantillonnage de sharp (lanczos3) au lieu de l'interpolation bilinéaire progressive (pixels différents) ;
// capture brute de l'EXIF (ExifCaptureInputStream, repli si les métadonnées du lecteur échouent) non portée.
import sharp, { type Sharp } from 'sharp'
import { BufferedImage, IIOException, type ImageReader } from './imageio.js'
import { drawableRgba, ImageIO, readImage } from './imageio-codecs.js'
import { PngImageReader, pngReadMetadata } from './imageio-readers.js'
import { type ByteArrayOutputStream, IOException, type InputStream } from './java-io.js'

/** `net.coobird.thumbnailator.tasks.UnsupportedFormatException` */
export class UnsupportedFormatException extends IOException {
  constructor(
    readonly formatName: string,
    message: string,
  ) {
    super(message)
  }
}

/** `net.coobird.thumbnailator.util.exif.Orientation` */
type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

const IFD_TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

/** `ExifUtils.getOrientationFromExif(exifData)` */
function getOrientationFromExif(exifData: Uint8Array): Orientation | null {
  const dv = new DataView(exifData.buffer, exifData.byteOffset, exifData.byteLength)
  let pos = 0
  const need = (n: number) => {
    if (pos + n > exifData.length) throw new RangeError('BufferUnderflowException')
  }
  need(4)
  if (String.fromCharCode(...exifData.subarray(0, 4)) !== 'Exif') return null
  pos = 4
  need(2)
  pos += 2
  need(8)
  const le = exifData[pos] === 0x49 && exifData[pos + 1] === 0x49
  pos += 8
  need(2)
  const nFields = dv.getInt16(pos, le)
  pos += 2
  for (let i = 0; i < nFields; i++) {
    need(12)
    const tag = dv.getInt16(pos, le)
    const type = dv.getInt16(pos + 2, le)
    const count = dv.getInt32(pos + 4, le)
    const size = IFD_TYPE_SIZE[type]
    // IfdType.typeOf(type) nul -> NullPointerException (orientation ignorée)
    if (size === undefined) throw new TypeError('NullPointerException')
    let offsetValue = 0
    let v = pos + 8
    if (count * size <= 4) {
      if (type === 3) {
        for (let k = 0; k < count; k++, v += 2) offsetValue = dv.getInt16(v, le)
      } else if (type === 1 || type === 2 || type === 7) {
        for (let k = 0; k < count; k++, v += 1) offsetValue = dv.getInt8(v)
      } else offsetValue = dv.getInt32(v, le)
    } else offsetValue = dv.getInt32(v, le)
    pos += 12
    if (tag === 0x0112) return offsetValue >= 1 && offsetValue <= 8 ? (offsetValue as Orientation) : null
  }
  return null
}

/** `ExifUtils.getExifOrientation(reader, 0)` */
function getExifOrientation(reader: ImageReader): Orientation | null {
  for (const bytes of reader.getJpegAppSegments()) {
    if (bytes.length < 4) throw new RangeError('BufferUnderflowException')
    if (String.fromCharCode(...bytes.subarray(0, 4)) === 'Exif') return getOrientationFromExif(bytes)
  }
  return null
}

/** Filtres de ExifFilterUtils.getFilterForOrientation */
function orientationFilters(o: Orientation): ((img: Sharp) => Sharp)[] {
  const flipH = (img: Sharp) => img.flop()
  const rot = (deg: number) => (img: Sharp) => img.rotate(deg)
  switch (o) {
    case 2:
      return [flipH]
    case 3:
      return [rot(180)]
    case 4:
      return [rot(180), flipH]
    case 5:
      return [rot(90), flipH]
    case 6:
      return [rot(90)]
    case 7:
      return [rot(-90), flipH]
    case 8:
      return [rot(-90)]
    default:
      return []
  }
}

/** `FixedSizeThumbnailMaker.make` : dimensions de la vignette */
export function fixedSizeDimensions(sourceWidth: number, sourceHeight: number, width: number, height: number): { width: number; height: number } {
  let targetWidth = width
  let targetHeight = height
  const sourceRatio = sourceWidth / sourceHeight
  const targetRatio = targetWidth / targetHeight
  if (sourceRatio !== targetRatio) {
    // fitWithinDimensions = true ; Math.round de Java : floor(x + 0.5)
    if (sourceRatio > targetRatio) {
      targetWidth = width
      targetHeight = Math.floor(targetWidth / sourceRatio + 0.5)
    } else {
      targetWidth = Math.floor(targetHeight * sourceRatio + 0.5)
      targetHeight = height
    }
  }
  targetWidth = targetWidth === 0 ? 1 : targetWidth
  targetHeight = targetHeight === 0 ? 1 : targetHeight
  return { width: targetWidth, height: targetHeight }
}

async function toRaw(img: Sharp, hasAlpha: boolean): Promise<BufferedImage> {
  const r = await img.raw().toBuffer({ resolveWithObject: true })
  return BufferedImage.of(r.info.width, r.info.height, new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength), r.info.channels as 1 | 2 | 3 | 4, hasAlpha, {
    type: BufferedImage.TYPE_INT_ARGB,
  })
}

export class ThumbnailsBuilder {
  private width = -1
  private height = -1
  private type = BufferedImage.TYPE_INT_ARGB
  private format: string | null = null

  constructor(private readonly input: InputStream | Uint8Array) {}

  size(width: number, height: number): this {
    this.width = width
    this.height = height
    return this
  }

  imageType(type: number): this {
    this.type = type
    return this
  }

  outputFormat(format: string): this {
    this.format = format
    return this
  }

  /** `Thumbnailator.createThumbnail` jusqu'aux filtres (image ARGB) */
  private async make(): Promise<BufferedImage> {
    // InputStreamImageSource.read
    const iis = ImageIO.createImageInputStream(this.input)
    const readers = ImageIO.getImageReaders(iis)
    const next = readers.next()
    if (next.done) throw new UnsupportedFormatException('<unknown>', 'No suitable ImageReader found for source data.')
    const reader = next.value
    reader.setInput(iis)
    let orientation: Orientation | null = null
    let sourceImage: BufferedImage
    try {
      try {
        orientation = getExifOrientation(reader)
      } catch {
        // orientation ignorée
      }
      reader.getWidth(0)
      reader.getHeight(0)
      // lecture avec métadonnées : le PNGImageReader relit les chunks jusqu'à IEND
      if (reader instanceof PngImageReader) pngReadMetadata(reader.sourceBytes())
      sourceImage = await readImage(reader)
    } finally {
      reader.dispose()
      iis.close()
    }
    // FixedSizeThumbnailMaker (filtre SwapDimensions : taille demandée permutée, sans effet pour une taille carrée)
    const swap = orientation !== null && orientation >= 5
    const dims = fixedSizeDimensions(sourceImage.width, sourceImage.height, swap ? this.height : this.width, swap ? this.width : this.height)
    // image ARGB (imageType TYPE_INT_ARGB) : dessin Java2D de la source
    let img = sharp(drawableRgba(sourceImage), { raw: { width: sourceImage.width, height: sourceImage.height, channels: 4 } })
    if (dims.width !== sourceImage.width || dims.height !== sourceImage.height) img = img.resize(dims.width, dims.height, { fit: 'fill' })
    let thumbnail = await toRaw(img, true)
    if (orientation !== null && orientation !== 1)
      for (const f of orientationFilters(orientation)) thumbnail = await toRaw(f(sharp(thumbnail.data, { raw: { width: thumbnail.width, height: thumbnail.height, channels: thumbnail.channels } })), true)
    return thumbnail
  }

  /** `toOutputStream(os)` (PORT: async) */
  async toOutputStream(os: ByteArrayOutputStream): Promise<void> {
    const img = await this.make()
    const formatName = this.format
    if (formatName === null) throw new IIOException('Output format has not been set.')
    if (!ImageIO.hasWriterForFormatName(formatName)) throw new UnsupportedFormatException(formatName, `No suitable ImageWriter found for ${formatName}.`)
    const f = formatName.toLowerCase()
    let out = img
    if (f === 'jpeg' || f === 'jpg' || f === 'bmp') {
      // BufferedImages.copy(img, TYPE_INT_RGB) : dessin sur fond noir
      out = await toRaw(sharp(img.data, { raw: { width: img.width, height: img.height, channels: img.channels } }).flatten({ background: '#000000' }), false)
    }
    // PNG : qualité 0.0 (compression maximale), autres formats : qualité par défaut de l'écrivain
    await ImageIO.write(out, formatName, os, f === 'png' ? { compressionQuality: 0 } : {})
  }

  /** `asBufferedImage()` (PORT: async) */
  async asBufferedImage(): Promise<BufferedImage> {
    return this.make()
  }
}

/** `net.coobird.thumbnailator.Thumbnails` */
export const Thumbnails = {
  of(input: InputStream | Uint8Array): ThumbnailsBuilder {
    return new ThumbnailsBuilder(input)
  },
}
