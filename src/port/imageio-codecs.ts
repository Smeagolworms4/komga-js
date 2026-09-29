// Support de portage : façade javax.imageio.ImageIO (listes de formats, getImageReaders, read, write) et décodage /
// encodage des pixels. Ce fichier n'a pas de jumeau Kotlin.
//
// Décodage (`ImageIO.read`, asynchrone : PORT: async) :
// - JPEG : port/jpeg-jdk.ts (libjpeg 6b et LittleCMS du JDK, logique de TwelveMonkeys) : pixels identiques à la JVM ;
//   sharp pour les rares cas non reproduits
// - PNG, GIF, WebP, TIFF/BigTIFF, AVIF : sharp (libvips) ; GIF : rectangle de la première image (comme le lecteur du JDK)
// - HEIC (HEVC) : libheif-js (wasm) ; JPEG XL : @jsquash/jxl (wasm)
// - BMP, PNM, JPEG 2000, JBIG2 : mupdf (wasm)
// - PCX, WBMP : décodeurs ci-dessous
// Les pixels peuvent différer légèrement de ceux de la JVM (décodeurs différents) ; dimensions, bandes et présence
// d'alpha suivent le type d'image que produit le lecteur ImageIO correspondant (voir imageio-readers.ts).
// Encodage (`ImageIO.write`) : JPEG gris ou RGB par port/jpeg-jdk.ts (octets identiques au JPEGImageWriter du JDK), autres
// JPEG (CMYK) et PNG (palette pour les images indexées) via sharp ; GIF, TIFF et AVIF/HEIF via sharp ; les autres formats en écriture
// (BMP, WBMP, PNM, PCX, JPEG 2000, RAW) ne sont pas portés (jamais utilisés par Komga) : UnsupportedOperationException.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import sharp, { type Sharp, type SharpOptions } from 'sharp'

// Mémoire : pas de cache d'opérations libvips (Komga ne relit pas les mêmes images). Threads natifs libvips par
// opération : 2 par défaut (miniatures ~20 % plus rapides qu'avec 1, pour quelques Mo natifs ; 4 n'apporte rien de
// plus) ; Thumbnailator/ImageIO sont mono-thread par appel. KOMGAJS_IMAGE_THREADS le règle.
sharp.cache(false)
sharp.concurrency(imageThreads(process.env.KOMGAJS_IMAGE_THREADS))

/** KOMGAJS_IMAGE_THREADS : entier ≥ 1 ; 0 laisse libvips choisir (nombre de cœurs) ; absent ou invalide : 2 */
export function imageThreads(value: string | undefined): number {
  const n = value === undefined ? Number.NaN : Number(value.trim())
  return Number.isInteger(n) && n >= 0 ? n : 2
}
import { ByteArrayOutputStream, type InputStream, IOException } from './java-io.js'
import { UnsupportedOperationException } from './kotlin.js'
import { BufferedImage, IIOException, ImageInputStream, type ImageReader } from './imageio.js'
import {
  BmpImageReader,
  GifImageReader,
  HeaderImageReader,
  HeifImageReader,
  type HeaderInfo,
  J2kImageReader,
  Jbig2ImageReader,
  JpegImageReader,
  JxlImageReader,
  PcxImageReader,
  PngImageReader,
  PnmImageReader,
  readerSpis,
  type TiffIfd,
  TiffImageReader,
  WbmpImageReader,
  WebpImageReader,
} from './imageio-readers.js'
import { readJpegLikeJdk, writeJpegLikeJdk } from './jpeg-jdk.js'

const require = createRequire(import.meta.url)

// ---------------------------------------------------------------------------
// Listes de formats (ImageIO.getReaderFormatNames() etc., relevées sur Komga : JDK 23 + libwebp/libheif/libjxl)
// ---------------------------------------------------------------------------

const READER_FORMAT_NAMES = [
  'JPG', 'JPEG 2000', 'tiff', 'bigtiff', 'bmp', 'PCX', 'gif', 'WBMP', 'PNG', 'RAW', 'JPEG', 'AVIF', 'PNM', 'BigTIFF', 'tif', 'TIFF', 'wbmp', 'jpeg', 'jxl',
  'jpeg-lossless', 'jbig2', 'jpg', 'JPEG2000', 'BMP', 'pcx', 'GIF', 'Jpeg XL', 'heic', 'png', 'raw', 'BIGTIFF', 'heif', 'webp', 'JPEG-LOSSLESS', 'JBIG2', 'pnm',
  'TIF', 'jpeg2000', 'WebP', 'HEIC', 'jpeg 2000', 'HEIF', 'avif',
]
const READER_MIME_TYPES = [
  'image/vnd.wap.wbmp', 'image/jpeg', 'image/x-portable-graymap', 'image/bmp', 'image/x-windows-pcx', 'image/gif', 'image/x-pc-paintbrush', 'image/x-raw',
  'image/webp', 'image/heif-sequence', 'image/x-pcx', 'image/heic-sequence', 'image/avif', 'image/x-portable-bitmap', 'image/heif', 'image/heic', 'image/png',
  'image/x-jb2', 'image/pcx', 'image/x-windows-bmp', 'image/jpeg2000', 'image/jp2', 'image/x-bmp', 'image/x-png', 'image/x-portable-pixmap', 'image/tiff',
  'image/x-tiff', 'image/x-jbig2', 'image/x-portable-anymap', 'image/jxl',
]
const WRITER_FORMAT_NAMES = [
  'JPEG 2000', 'JPG', 'tiff', 'bmp', 'bigtiff', 'PCX', 'gif', 'WBMP', 'PNG', 'RAW', 'JPEG', 'AVIF', 'PNM', 'BigTIFF', 'tif', 'TIFF', 'wbmp', 'jpeg', 'jpg',
  'JPEG2000', 'BMP', 'pcx', 'GIF', 'heic', 'png', 'raw', 'BIGTIFF', 'heif', 'pnm', 'TIF', 'jpeg2000', 'HEIC', 'jpeg 2000', 'HEIF', 'avif',
]
const WRITER_MIME_TYPES = [
  'image/vnd.wap.wbmp', 'image/jpeg', 'image/x-portable-graymap', 'image/bmp', 'image/gif', 'image/x-windows-pcx', 'image/x-pc-paintbrush', 'image/x-raw',
  'image/heif-sequence', 'image/x-pcx', 'image/heic-sequence', 'image/avif', 'image/x-portable-bitmap', 'image/heif', 'image/heic', 'image/png', 'image/pcx',
  'image/x-windows-bmp', 'image/jpeg2000', 'image/x-bmp', 'image/jp2', 'image/x-png', 'image/x-portable-pixmap', 'image/tiff', 'image/x-tiff',
  'image/x-portable-anymap',
]

// ---------------------------------------------------------------------------
// Conversion vers BufferedImage
// ---------------------------------------------------------------------------

type Raw = { data: Uint8Array; width: number; height: number; channels: number }

/** Conversion de pixels 8 bits entrelacés entre 1 (gris), 2 (gris+alpha), 3 (RGB) et 4 (RGBA) canaux */
export function convertChannels(src: Uint8Array, pixels: number, from: number, to: number): Uint8Array {
  if (from === to) return src
  const out = new Uint8Array(pixels * to)
  for (let i = 0; i < pixels; i++) {
    const s = i * from
    let r: number
    let g: number
    let b: number
    let a = 255
    if (from <= 2) {
      r = g = b = src[s]!
      if (from === 2) a = src[s + 1]!
    } else {
      r = src[s]!
      g = src[s + 1]!
      b = src[s + 2]!
      if (from === 4) a = src[s + 3]!
    }
    const d = i * to
    if (to <= 2) {
      out[d] = from <= 2 ? r : Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      if (to === 2) out[d + 1] = a
    } else {
      out[d] = r
      out[d + 1] = g
      out[d + 2] = b
      if (to === 4) out[d + 3] = a
    }
  }
  return out
}

const LINEAR_GRAY_TO_SRGB = Uint8Array.from({ length: 256 }, (_, v) => {
  const l = v / 255
  return Math.round((l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055) * 255)
})

/**
 * Pixels RGBA d'une image dessinée par Java2D (`Graphics.drawImage`) sur une image sRGB : une image grise avec alpha
 * (ComponentColorModel sur CS_GRAY, linéaire) est convertie en sRGB, une image TYPE_BYTE_GRAY est recopiée telle quelle.
 */
export function drawableRgba(image: BufferedImage): Uint8Array {
  const rgba = convertChannels(image.data, image.width * image.height, image.channels, 4)
  if (image.channels === 2) for (let i = 0; i < rgba.length; i += 4) rgba[i] = rgba[i + 1] = rgba[i + 2] = LINEAR_GRAY_TO_SRGB[rgba[i]!]!
  return rgba
}

/** Ramène des pixels 8 bits (1 à 4 canaux) au type d'image du lecteur ImageIO */
function toBufferedImage(raw: Raw, info: HeaderInfo, extra: { cmyk?: boolean } = {}): BufferedImage {
  const alpha = info.alpha === true
  let target: 1 | 2 | 3 | 4
  if (info.indexed) target = alpha ? 4 : 3
  else if (info.bands === 1) target = 1
  else if (info.bands === 2) target = 2
  else target = alpha ? 4 : 3
  const data = convertChannels(raw.data, raw.width * raw.height, raw.channels, target)
  return BufferedImage.of(raw.width, raw.height, data, target, alpha, { indexed: info.indexed === true, cmyk: extra.cmyk === true })
}

async function sharpRaw(input: Uint8Array, opts: SharpOptions = {}): Promise<Raw> {
  const o: SharpOptions = { failOn: 'none', limitInputPixels: false, ...opts }
  const meta = await sharp(input, o).metadata()
  if (meta.space === 'cmyk') {
    // CMYK sans profil : conversion naïve (celle de TwelveMonkeys pour un JPEG CMYK sans ICC), pas le profil CMYK de libvips
    const r = await sharp(input, o).pipelineColourspace('cmyk').toColourspace('cmyk').raw().toBuffer({ resolveWithObject: true })
    const n = r.info.width * r.info.height
    const c = r.info.channels
    const out = new Uint8Array(n * 3)
    for (let i = 0; i < n; i++) {
      const k = 255 - r.data[i * c + 3]!
      for (let j = 0; j < 3; j++) out[i * 3 + j] = Math.round(((255 - r.data[i * c + j]!) * k) / 255)
    }
    return { data: out, width: r.info.width, height: r.info.height, channels: 3 }
  }
  let img = sharp(input, o)
  // sortie brute de sharp en sRGB par défaut : les images grises restent grises
  if (meta.channels !== undefined && meta.channels <= 2 && (meta.space === 'b-w' || meta.space === 'grey16')) img = img.toColourspace('b-w')
  const r = await img.raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true })
  let data = new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength)
  let channels = r.info.channels
  // toColourspace('b-w') retire l'alpha : réintégré depuis l'image source
  if (channels === 1 && meta.hasAlpha) {
    const a = await sharp(input, o).extractChannel('alpha').raw({ depth: 'uchar' }).toBuffer()
    const ga = new Uint8Array(data.length * 2)
    for (let i = 0; i < data.length; i++) {
      ga[i * 2] = data[i]!
      ga[i * 2 + 1] = a[i]!
    }
    data = ga
    channels = 2
  }
  return { data, width: r.info.width, height: r.info.height, channels }
}

// mupdf (wasm, chargé à la demande)
let mupdfModule: Promise<typeof import('mupdf')> | null = null
async function mupdfRaw(input: Uint8Array): Promise<Raw> {
  mupdfModule ??= import('mupdf')
  const mupdf = await mupdfModule
  let image: InstanceType<typeof mupdf.Image>
  try {
    image = new mupdf.Image(input)
  } catch (e) {
    throw new IIOException((e as Error).message, e)
  }
  const pix = image.toPixmap()
  const n = pix.getNumberOfComponents()
  let data = pix.getPixels() as unknown as Uint8Array
  const width = pix.getWidth()
  const height = pix.getHeight()
  let channels = n
  if (pix.getColorSpace()?.isCMYK()) {
    const rgb = pix.convertToColorSpace(mupdf.ColorSpace.DeviceRGB)
    data = rgb.getPixels() as unknown as Uint8Array
    channels = rgb.getNumberOfComponents()
  }
  return { data: new Uint8Array(data), width, height, channels }
}

// libheif-js (HEIC / HEVC)
let libheif: { HeifDecoder: new () => { decode(b: Uint8Array): HeifImage[] } } | null = null
type HeifImage = { get_width(): number; get_height(): number; is_primary(): boolean; display(d: { data: Uint8ClampedArray; width: number; height: number }, cb: (r: unknown) => void): void }
async function heifRaw(input: Uint8Array): Promise<Raw> {
  libheif ??= require('libheif-js/wasm-bundle')
  const images = libheif!.HeifDecoder.prototype ? new libheif!.HeifDecoder().decode(input) : []
  const image = images.find((i) => i.is_primary()) ?? images[0]
  if (image === undefined) throw new IIOException('com.github.gotson.nightmonkeys.heif.HeifException: Could not decode image')
  const width = image.get_width()
  const height = image.get_height()
  const buf = new Uint8ClampedArray(width * height * 4)
  await new Promise<void>((resolve, reject) =>
    image.display({ data: buf, width, height }, (r) => (r ? resolve() : reject(new IIOException('com.github.gotson.nightmonkeys.heif.HeifException: Could not decode image')))),
  )
  return { data: new Uint8Array(buf.buffer), width, height, channels: 4 }
}

// @jsquash/jxl (JPEG XL)
let jxlDecode: Promise<(b: ArrayBuffer) => Promise<{ data: Uint8ClampedArray; width: number; height: number }>> | null = null
async function jxlRaw(input: Uint8Array): Promise<Raw> {
  jxlDecode ??= (async () => {
    const mod = (await import('@jsquash/jxl/decode.js')) as unknown as { init(m: WebAssembly.Module): Promise<unknown>; default(b: ArrayBuffer): Promise<{ data: Uint8ClampedArray; width: number; height: number }> }
    await mod.init(await WebAssembly.compile(readFileSync(require.resolve('@jsquash/jxl/codec/dec/jxl_dec.wasm'))))
    return mod.default
  })()
  const decode = await jxlDecode
  try {
    const r = await decode(input.slice().buffer)
    return { data: new Uint8Array(r.data.buffer), width: r.width, height: r.height, channels: 4 }
  } catch (e) {
    throw new IIOException('com.github.gotson.nightmonkeys.jxl.JxlException: Decoder error', e)
  }
}

/** Décodeur PCX (RLE, 8 bits 1 plan avec palette VGA, ou 24 bits 3 plans ; 1 bit monochrome) */
function pcxRaw(b: Uint8Array, info: HeaderInfo): Raw {
  const { bitsPerPixel, colorPlanes, bytesPerLine } = info.extra as { bitsPerPixel: number; colorPlanes: number; bytesPerLine: number }
  const { width, height } = info
  const scan = bytesPerLine * colorPlanes
  const lines = new Uint8Array(scan * height)
  let p = 128
  for (let o = 0; o < lines.length && p < b.length; ) {
    const c = b[p++]!
    if ((c & 0xc0) === 0xc0) {
      const count = c & 0x3f
      const v = b[p++] ?? 0
      for (let k = 0; k < count && o < lines.length; k++) lines[o++] = v
    } else lines[o++] = c
  }
  if (colorPlanes === 3 && bitsPerPixel === 8) {
    const out = new Uint8Array(width * height * 3)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) out[(y * width + x) * 3 + c] = lines[y * scan + c * bytesPerLine + x]!
    return { data: out, width, height, channels: 3 }
  }
  const out = new Uint8Array(width * height * 3)
  if (bitsPerPixel === 8 && colorPlanes === 1) {
    const pal = b.length >= 769 && b[b.length - 769] === 0x0c ? b.subarray(b.length - 768) : null
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = lines[y * scan + x]!
        for (let c = 0; c < 3; c++) out[(y * width + x) * 3 + c] = pal ? pal[i * 3 + c]! : i
      }
  } else {
    // 1 à 4 plans de 1 bit : palette EGA de l'en-tête
    const pal = b.subarray(16, 64)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let i = 0
        for (let pl = 0; pl < colorPlanes; pl++) i |= ((lines[y * scan + pl * bytesPerLine + (x >> 3)]! >> (7 - (x & 7))) & 1) << pl
        for (let c = 0; c < 3; c++) out[(y * width + x) * 3 + c] = colorPlanes === 1 && bitsPerPixel === 1 ? (i ? 255 : 0) : pal[i * 3 + c]!
      }
  }
  return { data: out, width, height, channels: 3 }
}

/** Décodeur WBMP (type 0 : 1 bit par pixel, 1 = blanc) */
function wbmpRaw(b: Uint8Array, info: HeaderInfo): Raw {
  const { width, height } = info
  const offset = (info.extra as { dataOffset: number }).dataOffset
  const scan = Math.ceil(width / 8)
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) out[y * width + x] = ((b[offset + y * scan + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1 ? 255 : 0
  return { data: out, width, height, channels: 1 }
}

/** Profil ICC de l'espace de couleur d'une image lue (JPEG gris avec profil embarqué), réécrit par l'écrivain JPEG */
const iccProfiles = new WeakMap<BufferedImage, Uint8Array>()

/** `reader.read(0, param)` : décodage de la première image */
export async function readImage(reader: ImageReader): Promise<BufferedImage> {
  if (!(reader instanceof HeaderImageReader)) throw new IIOException('Unsupported reader')
  const info = reader.headerInfo()
  const bytes = reader.sourceBytes()
  try {
    if (reader instanceof JpegImageReader) {
      const jpeg = await readJpegLikeJdk(bytes)
      if (jpeg === null) return toBufferedImage(await sharpRaw(bytes), info)
      const image = BufferedImage.of(jpeg.width, jpeg.height, jpeg.data, jpeg.channels, jpeg.hasAlpha)
      if (jpeg.iccProfile !== null) iccProfiles.set(image, jpeg.iccProfile)
      return image
    }
    if (reader instanceof PngImageReader) {
      try {
        return toBufferedImage(await sharpRaw(bytes, { failOn: 'error' }), info)
      } catch (e) {
        throw new IIOException('Error reading PNG image data', e)
      }
    }
    if (reader instanceof GifImageReader) {
      const raw = await sharpRaw(bytes, { page: 0 })
      const { left, top } = info.extra as { left: number; top: number }
      const width = Math.max(0, Math.min(info.width, raw.width - left))
      const height = Math.max(0, Math.min(info.height, raw.height - top))
      if (width !== raw.width || height !== raw.height) {
        const r = await sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: raw.channels as 1 | 2 | 3 | 4 } })
          .extract({ left, top, width, height })
          .raw()
          .toBuffer({ resolveWithObject: true })
        return toBufferedImage({ data: new Uint8Array(r.data), width: r.info.width, height: r.info.height, channels: r.info.channels }, info)
      }
      return toBufferedImage(raw, info)
    }
    if (reader instanceof WebpImageReader) return toBufferedImage(await sharpRaw(bytes, { page: 0 }), info)
    if (reader instanceof TiffImageReader) {
      const { ifd, photometric } = info.extra as { ifd: TiffIfd; photometric: number }
      const bits = ifd.get(258)
      const bitsPerSample = bits === undefined ? 1 : typeof bits.value === 'number' ? bits.value : (bits.value[0] ?? 1)
      if ((ifd.get(317)?.value ?? 1) === 2 && bitsPerSample === 16) throw new IIOException('16-bit samples are not supported for Horizontal differencing Predictor')
      const cmyk = photometric === 5 && !info.alpha
      return toBufferedImage(await sharpRaw(bytes, { page: 0 }), cmyk ? { ...info, bands: 3 } : info, { cmyk })
    }
    if (reader instanceof HeifImageReader) {
      const av1 = (info.extra as { av1: boolean }).av1
      return toBufferedImage(av1 ? await sharpRaw(bytes) : await heifRaw(bytes), info)
    }
    if (reader instanceof JxlImageReader) return toBufferedImage(await jxlRaw(bytes), info)
    if (reader instanceof BmpImageReader || reader instanceof PnmImageReader || reader instanceof J2kImageReader || reader instanceof Jbig2ImageReader)
      return toBufferedImage(await mupdfRaw(bytes), info)
    if (reader instanceof PcxImageReader) return toBufferedImage(pcxRaw(bytes, info), info)
    if (reader instanceof WbmpImageReader) return toBufferedImage(wbmpRaw(bytes, info), info)
  } catch (e) {
    if (e instanceof IIOException) throw e
    throw new IIOException((e as Error).message, e)
  }
  throw new IIOException('Unsupported reader')
}

// ---------------------------------------------------------------------------
// Encodage
// ---------------------------------------------------------------------------

export type WriteParam = { compressionQuality?: number }

function sharpOf(image: BufferedImage): Sharp {
  return sharp(image.data, { raw: { width: image.width, height: image.height, channels: image.channels } })
}

/** Écrivains ImageIO : null si aucun écrivain ne peut encoder ce type d'image (ImageIO.write renvoie false) */
async function encode(image: BufferedImage, formatName: string, param: WriteParam): Promise<Uint8Array | null> {
  const f = formatName.toLowerCase()
  let out: Buffer
  if (f === 'jpeg' || f === 'jpg') {
    // JPEGImageWriterSpi.canEncodeImage : pas d'alpha
    if (image.colorModel.hasAlpha()) return null
    if ((image.channels === 1 || image.channels === 3) && image.info.cmyk !== true)
      return await writeJpegLikeJdk(image as BufferedImage & { channels: 1 | 3 }, iccProfiles.get(image) ?? null, param.compressionQuality)
    let img = sharpOf(image)
    if (image.channels === 2 || image.channels === 4) img = img.removeAlpha()
    if (image.channels <= 2) img = img.toColourspace('b-w')
    out = await img.jpeg({ quality: Math.round((param.compressionQuality ?? 0.75) * 100), chromaSubsampling: '4:2:0' }).toBuffer()
  } else if (f === 'png') {
    // PNGImageWriterSpi.canEncodeImage : pas de raster CMYK
    if (image.info.cmyk) return null
    const level = param.compressionQuality === undefined ? 4 : Math.round(9 * (1 - param.compressionQuality))
    let img = sharpOf(image)
    if (!image.colorModel.hasAlpha() && (image.channels === 2 || image.channels === 4)) img = img.removeAlpha()
    if (image.channels === 1) img = img.toColourspace('b-w')
    out = await img.png({ compressionLevel: level, palette: image.info.indexed === true, colours: 256, dither: 0 }).toBuffer()
  } else if (f === 'gif') out = await sharpOf(image).gif().toBuffer()
  else if (f === 'tiff' || f === 'tif') out = await sharpOf(image).tiff().toBuffer()
  else if (f === 'avif' || f === 'heif' || f === 'heic') out = await sharpOf(image).avif().toBuffer()
  else if (WRITER_FORMAT_NAMES.includes(formatName)) throw new UnsupportedOperationException(`ImageIO writer not ported: ${formatName}`)
  else return null
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
}

// ---------------------------------------------------------------------------
// ImageIO
// ---------------------------------------------------------------------------

export const ImageIO = {
  getReaderFormatNames(): string[] {
    return [...READER_FORMAT_NAMES]
  },
  getReaderMIMETypes(): string[] {
    return [...READER_MIME_TYPES]
  },
  getWriterFormatNames(): string[] {
    return [...WRITER_FORMAT_NAMES]
  },
  getWriterMIMETypes(): string[] {
    return [...WRITER_MIME_TYPES]
  },

  /** `createImageInputStream(input)` */
  createImageInputStream(input: InputStream | Uint8Array): ImageInputStream {
    return new ImageInputStream(input)
  },

  /** `getImageReaders(stream)` : itérateur paresseux (canDecodeInput évalué à la demande, IOException -> lecteur ignoré) */
  *getImageReaders(stream: ImageInputStream): Generator<ImageReader> {
    for (const spi of readerSpis) {
      let ok: boolean
      try {
        ok = spi.canDecodeInput(stream)
      } catch (e) {
        // ImageIO.CanDecodeInputFilter : les IOException écartent le lecteur
        if (!(e instanceof IOException)) throw e
        ok = false
      }
      if (ok) yield spi.createReaderInstance()
    }
  },

  /** `ImageIO.read(input)` : null si aucun lecteur ne reconnaît le flux (PORT: async) */
  async read(input: InputStream | Uint8Array): Promise<BufferedImage | null> {
    const stream = ImageIO.createImageInputStream(input)
    const readers = ImageIO.getImageReaders(stream)
    const next = readers.next()
    if (next.done) return null
    const reader = next.value
    reader.setInput(stream)
    try {
      return await readImage(reader)
    } finally {
      reader.dispose()
      stream.close()
    }
  },

  /** `ImageIO.write(im, formatName, output)` : faux si aucun écrivain ne convient (PORT: async) */
  async write(im: BufferedImage, formatName: string, output: ByteArrayOutputStream, param: WriteParam = {}): Promise<boolean> {
    const bytes = await encode(im, formatName, param)
    if (bytes === null) return false
    output.write(bytes)
    return true
  },

  /** `getImageWritersByFormatName(formatName).hasNext()` */
  hasWriterForFormatName(formatName: string): boolean {
    return WRITER_FORMAT_NAMES.includes(formatName)
  },
}

export { BufferedImage, ByteArrayOutputStream }
