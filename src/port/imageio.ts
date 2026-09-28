// Support de portage : javax.imageio (ImageIO, ImageInputStream, ImageReader/ImageReaderSpi) tel que configuré dans Komga :
// JDK 23 + TwelveMonkeys 3.14 (JPEG, TIFF, BigTIFF), NightMonkeys 1.1 (WebP, HEIF/AVIF, JPEG XL, avec libwebp/libheif/libjxl),
// jai-imageio 1.4 (PNM, BMP, PCX, WBMP, TIFF, RAW, JPEG 2000), jbig2-imageio 3.0.
// Ce fichier n'a pas de jumeau Kotlin.
//
// Partie synchrone (détection et dimensions) : chaque ImageReaderSpi est porté avec son canDecodeInput, dans l'ordre du
// registre IIORegistry de Komga (relevé par jshell), et chaque ImageReader avec la lecture d'en-tête qui sert à
// getWidth/getHeight. Les effets de bord des SPI sur la position du flux (jai WBMP sur EOF, JBIG2 sans reset) sont reproduits.
// Partie asynchrone (décodage des pixels, `read`) : voir imageio-codecs.ts (sharp/libvips, mupdf, libheif-js, @jsquash/jxl).
import { EOFException, IOException, type InputStream } from './java-io.js'

/** `javax.imageio.IIOException` */
export class IIOException extends IOException {}

// ---------------------------------------------------------------------------
// ImageInputStream (FileCacheImageInputStream / MemoryCacheImageInputStream sur un InputStream : length() = -1)
// ---------------------------------------------------------------------------

export class ImageInputStream {
  private buf: Uint8Array
  private len = 0
  private srcEof = false
  private pos = 0
  private readonly marks: number[] = []
  byteOrder: 'BE' | 'LE' = 'BE'

  constructor(private readonly src: InputStream | Uint8Array) {
    if (src instanceof Uint8Array) {
      this.buf = src
      this.len = src.length
      this.srcEof = true
    } else this.buf = new Uint8Array(65536)
  }

  /** Garantit que les octets [0, upTo) sont en cache si le flux les contient */
  private fill(upTo: number): void {
    if (this.srcEof || this.len >= upTo) return
    const src = this.src as InputStream
    while (!this.srcEof && this.len < upTo) {
      if (this.len === this.buf.length) {
        const nb = new Uint8Array(Math.min(Math.max(this.buf.length * 2, 65536), Math.max(this.buf.length * 2, Math.min(upTo, 2 ** 31))))
        nb.set(this.buf.subarray(0, this.len))
        this.buf = nb
      }
      const n = src.read(this.buf, this.len, this.buf.length - this.len)
      if (n < 0) this.srcEof = true
      else this.len += n
    }
  }

  /** `length()` : -1 pour un flux (taille inconnue), comme les ImageInputStream créés sur un InputStream */
  length(): number {
    return this.src instanceof Uint8Array ? this.len : -1
  }

  getStreamPosition(): number {
    return this.pos
  }

  seek(pos: number): void {
    this.pos = pos
  }

  mark(): void {
    this.marks.push(this.pos)
  }

  reset(): void {
    const m = this.marks.pop()
    if (m !== undefined) this.pos = m
  }

  read(): number {
    this.fill(this.pos + 1)
    if (this.pos >= this.len) return -1
    return this.buf[this.pos++]!
  }

  /** `read(b)` : nombre d'octets lus (les flux en cache lisent tout ce qui est disponible), -1 en fin de flux */
  readInto(b: Uint8Array, off = 0, len = b.length - off): number {
    if (len === 0) return 0
    this.fill(this.pos + len)
    if (this.pos >= this.len) return -1
    const n = Math.min(len, this.len - this.pos)
    b.set(this.buf.subarray(this.pos, this.pos + n), off)
    this.pos += n
    return n
  }

  readFully(b: Uint8Array, off = 0, len = b.length - off): void {
    while (len > 0) {
      const n = this.readInto(b, off, len)
      if (n < 0) throw new EOFException()
      off += n
      len -= n
    }
  }

  readBytes(n: number): Uint8Array {
    const b = new Uint8Array(n)
    this.readFully(b)
    return b
  }

  readUnsignedByte(): number {
    const c = this.read()
    if (c < 0) throw new EOFException()
    return c
  }

  readByte(): number {
    const c = this.readUnsignedByte()
    return c > 127 ? c - 256 : c
  }

  readUnsignedShort(): number {
    const a = this.readUnsignedByte()
    const b = this.readUnsignedByte()
    return this.byteOrder === 'BE' ? (a << 8) | b : (b << 8) | a
  }

  readShort(): number {
    const v = this.readUnsignedShort()
    return v > 0x7fff ? v - 0x10000 : v
  }

  readUnsignedInt(): number {
    const a = this.readUnsignedShort()
    const b = this.readUnsignedShort()
    return this.byteOrder === 'BE' ? a * 0x10000 + b : b * 0x10000 + a
  }

  readInt(): number {
    return this.readUnsignedInt() | 0
  }

  /** `skipBytes(n)` (ImageInputStreamImpl : déplacement de la position) */
  skipBytes(n: number): number {
    this.pos += n
    return n
  }

  /** `readLine()` d'ImageInputStreamImpl */
  readLine(): string | null {
    let input = ''
    let c = -1
    let eol = false
    while (!eol) {
      c = this.read()
      if (c === -1 || c === 0x0a) eol = true
      else if (c === 0x0d) {
        eol = true
        const cur = this.getStreamPosition()
        if (this.read() !== 0x0a) this.seek(cur)
      } else input += String.fromCharCode(c)
    }
    if (c === -1 && input.length === 0) return null
    return input
  }

  /** Octets [from, fin du flux) (IIOUtil.byteArrayFromStream depuis la position courante) */
  remainingFrom(from: number): Uint8Array {
    this.fill(Number.MAX_SAFE_INTEGER)
    return this.buf.subarray(Math.min(from, this.len), this.len)
  }

  /** Tout le flux, depuis 0 */
  allBytes(): Uint8Array {
    return this.remainingFrom(0)
  }

  /** Octet absolu (sans déplacer la position), -1 au-delà de la fin */
  at(i: number): number {
    this.fill(i + 1)
    return i < this.len ? this.buf[i]! : -1
  }

  close(): void {}
}

// ---------------------------------------------------------------------------
// BufferedImage
// ---------------------------------------------------------------------------

/**
 * `java.awt.image.BufferedImage` réduit à ce que Komga utilise : dimensions, présence d'un canal alpha
 * (`colorModel.hasAlpha()`) et pixels 8 bits entrelacés (`channels` = 1 gris, 2 gris+alpha, 3 RGB, 4 RGBA).
 * `indexed` : image à palette (IndexColorModel), `cmyk` : raster CMYK sans alpha (TIFF CMYK de TwelveMonkeys).
 */
export class BufferedImage {
  static readonly TYPE_CUSTOM = 0
  static readonly TYPE_INT_RGB = 1
  static readonly TYPE_INT_ARGB = 2

  constructor(
    readonly width: number,
    readonly height: number,
    readonly data: Uint8Array,
    readonly channels: 1 | 2 | 3 | 4,
    readonly colorModel: { hasAlpha(): boolean },
    readonly info: { indexed?: boolean; cmyk?: boolean; type?: number } = {},
  ) {}

  static of(width: number, height: number, data: Uint8Array, channels: 1 | 2 | 3 | 4, hasAlpha: boolean, info: { indexed?: boolean; cmyk?: boolean; type?: number } = {}): BufferedImage {
    return new BufferedImage(width, height, data, channels, { hasAlpha: () => hasAlpha }, info)
  }

  getWidth(): number {
    return this.width
  }

  getHeight(): number {
    return this.height
  }

  getType(): number {
    return this.info.type ?? BufferedImage.TYPE_CUSTOM
  }

  /** Alpha (0..255) du pixel (x, y) ; 255 sans canal alpha */
  alphaAt(x: number, y: number): number {
    if (!this.colorModel.hasAlpha() || (this.channels !== 2 && this.channels !== 4)) return 255
    return this.data[(y * this.width + x) * this.channels + this.channels - 1]!
  }
}

// ---------------------------------------------------------------------------
// ImageReader / ImageReaderSpi
// ---------------------------------------------------------------------------

export type Dim = { width: number; height: number }

/** `javax.imageio.ImageReader` */
export abstract class ImageReader {
  protected input: ImageInputStream | null = null
  private header: Dim | null = null
  private headerError: unknown = null

  constructor(readonly originatingProvider: ImageReaderSpi) {}

  getOriginatingProvider(): ImageReaderSpi {
    return this.originatingProvider
  }

  getFormatName(): string {
    return this.originatingProvider.formatNames[0] as string
  }

  setInput(input: ImageInputStream): void {
    this.input = input
    this.header = null
    this.headerError = null
  }

  protected get iis(): ImageInputStream {
    if (this.input === null) throw new Error('Input not set!')
    return this.input
  }

  /** Lecture de l'en-tête (dimensions de l'image 0), propre à chaque lecteur */
  protected abstract readHeader(): Dim

  private dims(imageIndex: number): Dim {
    if (imageIndex !== 0) throw new RangeError(`imageIndex != 0: ${imageIndex}`)
    if (this.header === null) {
      if (this.headerError !== null) throw this.headerError
      try {
        this.header = this.readHeader()
      } catch (e) {
        this.headerError = e
        throw e
      }
    }
    return this.header
  }

  getWidth(imageIndex: number): number {
    return this.dims(imageIndex).width
  }

  getHeight(imageIndex: number): number {
    return this.dims(imageIndex).height
  }

  /** Données brutes du flux, depuis le début (pour les décodeurs) */
  sourceBytes(): Uint8Array {
    return this.iis.allBytes()
  }

  /** Segments APPn des métadonnées JPEG (`markerSequence` de `javax_imageio_jpeg_image_1.0`) ; lève une exception si le format n'en a pas */
  getJpegAppSegments(): Uint8Array[] {
    throw new IIOException('Unsupported format name: javax_imageio_jpeg_image_1.0')
  }

  dispose(): void {}
}

/** `javax.imageio.spi.ImageReaderSpi` */
export abstract class ImageReaderSpi {
  constructor(
    readonly className: string,
    readonly formatNames: string[],
    readonly mimeTypes: string[],
  ) {}

  /** `canDecodeInput(stream)` : les IOException sont attrapées par ImageIO (lecteur ignoré) */
  abstract canDecodeInput(stream: ImageInputStream): boolean

  abstract createReaderInstance(): ImageReader
}
