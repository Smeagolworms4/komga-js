// Support de portage : lecteurs ImageIO de Komga (SPI + lecture d'en-tête), voir imageio.ts. Ce fichier n'a pas de jumeau Kotlin.
// Chaque canDecodeInput est porté depuis la source de son plugin (JDK 23, TwelveMonkeys 3.14, jai-imageio 1.4,
// jbig2-imageio 3.0.5, NightMonkeys 1.1 : WebPGetInfo, heif_check_filetype, JxlSignatureCheck), et chaque lecture
// d'en-tête reproduit le calcul de getWidth/getHeight du lecteur correspondant.
import { EOFException, IOException } from './java-io.js'
import { type Dim, IIOException, ImageInputStream, ImageReader, ImageReaderSpi } from './imageio.js'

// ---------------------------------------------------------------------------
// Informations d'en-tête utiles au décodage (équivalent de ImageTypeSpecifier)
// ---------------------------------------------------------------------------

export type HeaderInfo = Dim & {
  /** bandes du raster lu par ImageIO : 1 gris/palette, 2 gris+alpha, 3 RGB, 4 RGBA/CMYK */
  bands?: number
  alpha?: boolean
  indexed?: boolean
  extra?: Record<string, unknown>
}

/** Lecteur dont l'en-tête décrit aussi le type d'image produit */
export abstract class HeaderImageReader extends ImageReader {
  private info: HeaderInfo | null = null

  protected abstract readInfo(): HeaderInfo

  protected readHeader(): Dim {
    this.info = this.readInfo()
    return this.info
  }

  headerInfo(): HeaderInfo {
    this.getWidth(0)
    return this.info as HeaderInfo
  }
}

// ---------------------------------------------------------------------------
// Utilitaires de lecture
// ---------------------------------------------------------------------------

function u16be(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0
}
function u16le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8)
}
function u24le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)
}
function u32le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0
}
function ascii(b: Uint8Array, o: number, n: number): string {
  let s = ''
  for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]!)
  return s
}

/** `ReaderUtil.tryReadFully` : lit b.length octets, faux si fin de flux avant */
function tryReadFully(stream: ImageInputStream, b: Uint8Array): boolean {
  let off = 0
  while (off < b.length) {
    const n = stream.readInto(b, off, b.length - off)
    if (n < 0) return false
    off += n
  }
  return true
}

/** `stream.read(byte[n])` (lecture partielle, octets manquants à 0) */
function readPadded(stream: ImageInputStream, n: number): Uint8Array {
  const b = new Uint8Array(n)
  stream.readInto(b)
  return b
}

// ---------------------------------------------------------------------------
// 1. jai-imageio RAW (com.github.jaiimageio.impl.plugins.raw.RawImageReaderSpi) : ne décode que des RawImageInputStream
// ---------------------------------------------------------------------------

class RawImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.github.jaiimageio.impl.plugins.raw.RawImageReaderSpi', ['raw', 'RAW'], ['image/x-raw'])
  }
  canDecodeInput(): boolean {
    return false
  }
  createReaderInstance(): ImageReader {
    throw new Error('unreachable')
  }
}

// ---------------------------------------------------------------------------
// TIFF (TwelveMonkeys TIFF / BigTIFF, jai TIFF, JDK TIFF)
// ---------------------------------------------------------------------------

type TiffEntry = { tag: number; type: number; count: number; value: number | number[] }
export type TiffIfd = Map<number, TiffEntry>

const TIFF_TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4, 16: 8, 17: 8, 18: 8 }

/** Lecture des IFD (TIFFReader de TwelveMonkeys, simplifiée) : première IFD */
export function readTiffIfd0(b: ImageInputStream): { ifd: TiffIfd; le: boolean; big: boolean } {
  const all = b.allBytes()
  if (all.length < 8) throw new EOFException()
  const le = all[0] === 0x49
  const dv = new DataView(all.buffer, all.byteOffset, all.byteLength)
  const magic = dv.getUint16(2, le)
  const big = magic === 43
  let offset: number
  if (big) {
    if (all.length < 16) throw new EOFException()
    offset = Number(dv.getBigUint64(8, le))
  } else offset = dv.getUint32(4, le)
  const entrySize = big ? 20 : 12
  if (offset + (big ? 8 : 2) > all.length) throw new EOFException()
  const count = big ? Number(dv.getBigUint64(offset, le)) : dv.getUint16(offset, le)
  const ifd: TiffIfd = new Map()
  let p = offset + (big ? 8 : 2)
  for (let i = 0; i < count; i++, p += entrySize) {
    if (p + entrySize > all.length) throw new EOFException()
    const tag = dv.getUint16(p, le)
    const type = dv.getUint16(p + 2, le)
    const n = big ? Number(dv.getBigUint64(p + 4, le)) : dv.getUint32(p + 4, le)
    const size = TIFF_TYPE_SIZE[type] ?? 0
    if (size === 0) continue
    const inline = size * n <= (big ? 8 : 4)
    let vo = inline ? p + (big ? 12 : 8) : big ? Number(dv.getBigUint64(p + 12, le)) : dv.getUint32(p + 8, le)
    const read = (o: number): number => {
      if (o + size > all.length) throw new EOFException()
      switch (type) {
        case 1:
        case 2:
        case 7:
          return all[o]!
        case 6:
          return dv.getInt8(o)
        case 3:
          return dv.getUint16(o, le)
        case 8:
          return dv.getInt16(o, le)
        case 4:
        case 13:
          return dv.getUint32(o, le)
        case 9:
          return dv.getInt32(o, le)
        case 16:
        case 17:
        case 18:
          return Number(dv.getBigUint64(o, le))
        default:
          return 0
      }
    }
    if (n === 1) ifd.set(tag, { tag, type, count: n, value: read(vo) })
    else {
      const values: number[] = []
      for (let k = 0; k < Math.min(n, 4096); k++, vo += size) values.push(read(vo))
      ifd.set(tag, { tag, type, count: n, value: values })
    }
  }
  return { ifd, le, big }
}

function tiffInt(ifd: TiffIfd, tag: number, name: string): number {
  const e = ifd.get(tag)
  if (e === undefined) throw new IIOException(`Missing TIFF tag: ${name}`)
  // (Number) entry.getValue() : ClassCastException pour une valeur multiple
  if (typeof e.value !== 'number') throw new TypeError('class [J cannot be cast to class java.lang.Number')
  return e.value
}

function tiffIntOr(ifd: TiffIfd, tag: number, def: number): number {
  const e = ifd.get(tag)
  if (e === undefined) return def
  return typeof e.value === 'number' ? e.value : (e.value[0] ?? def)
}

function canDecodeTiffAs(stream: ImageInputStream, versionMagic: number): boolean {
  stream.mark()
  try {
    const magic = new Uint8Array(4)
    stream.readFully(magic)
    return (
      (magic[0] === 0x49 && magic[1] === 0x49 && magic[2] === (versionMagic & 0xff) && magic[3] === versionMagic >>> 8) ||
      (magic[0] === 0x4d && magic[1] === 0x4d && magic[2] === versionMagic >>> 8 && magic[3] === (versionMagic & 0xff))
    )
  } catch (e) {
    if (e instanceof EOFException) return false
    throw e
  } finally {
    stream.reset()
  }
}

export class TiffImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const { ifd } = readTiffIfd0(this.iis)
    const width = tiffInt(ifd, 256, 'ImageWidth')
    const height = tiffInt(ifd, 257, 'ImageHeight')
    const samples = tiffIntOr(ifd, 277, 1)
    const photometric = tiffIntOr(ifd, 262, -1)
    const extra = ifd.get(338)
    const alphaSample = extra !== undefined && (typeof extra.value === 'number' ? extra.value : extra.value[0]) !== 0
    return {
      width,
      height,
      bands: samples,
      alpha: alphaSample,
      indexed: photometric === 3 || (samples === 1 && tiffIntOr(ifd, 258, 1) === 1),
      extra: { ifd, photometric },
    }
  }
}

class TMBigTIFFImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.twelvemonkeys.imageio.plugins.tiff.BigTIFFImageReaderSpi', ['bigtiff', 'BigTIFF', 'BIGTIFF'], ['image/tiff', 'image/x-tiff'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    return canDecodeTiffAs(stream, 43)
  }
  createReaderInstance(): ImageReader {
    return new TiffImageReader(this)
  }
}

class TMTIFFImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.twelvemonkeys.imageio.plugins.tiff.TIFFImageReaderSpi', ['tif', 'TIF', 'tiff', 'TIFF'], ['image/tiff', 'image/x-tiff'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    return canDecodeTiffAs(stream, 42)
  }
  createReaderInstance(): ImageReader {
    return new TiffImageReader(this)
  }
}

class JaiTIFFImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.github.jaiimageio.impl.plugins.tiff.TIFFImageReaderSpi', ['tif', 'TIF', 'tiff', 'TIFF'], ['image/tiff'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    const b = new Uint8Array(4)
    stream.mark()
    stream.readFully(b)
    stream.reset()
    return (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)
  }
  createReaderInstance(): ImageReader {
    return new TiffImageReader(this)
  }
}

class JdkTIFFImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.sun.imageio.plugins.tiff.TIFFImageReaderSpi', ['tif', 'TIF', 'tiff', 'TIFF'], ['image/tiff'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    const b = new Uint8Array(4)
    stream.mark()
    const full = tryReadFully(stream, b)
    stream.reset()
    return full && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a))
  }
  createReaderInstance(): ImageReader {
    return new TiffImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// WBMP (jai-imageio, puis JDK)
// ---------------------------------------------------------------------------

/** `ImageUtil.readMultiByteInteger` / `ReaderUtil.readMultiByteInteger` */
function readMultiByteInteger(iis: ImageInputStream): number {
  let value = iis.readByte()
  let result = value & 0x7f
  while ((value & 0x80) === 0x80) {
    result <<= 7
    value = iis.readByte()
    result |= value & 0x7f
  }
  return result
}

class JaiWBMPImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.github.jaiimageio.impl.plugins.wbmp.WBMPImageReaderSpi', ['wbmp', 'WBMP'], ['image/vnd.wap.wbmp'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    // pas de reset si la lecture atteint la fin du flux (EOFException) : la position reste avancée, comme dans jai-imageio
    stream.mark()
    const type = stream.readByte()
    const fixHeaderField = stream.readByte()
    const width = readMultiByteInteger(stream)
    const height = readMultiByteInteger(stream)
    const remainingBytes = stream.length() - stream.getStreamPosition()
    stream.reset()
    if (type !== 0 || fixHeaderField !== 0) return false
    if (width <= 0 || height <= 0) return false
    const scanSize = Math.trunc(width / 8) + (width % 8 === 0 ? 0 : 1)
    return remainingBytes === scanSize * height
  }
  createReaderInstance(): ImageReader {
    return new WbmpImageReader(this)
  }
}

export class WbmpImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const iis = this.iis
    iis.seek(0)
    const wbmpType = iis.readByte()
    const fixHeaderField = iis.readByte()
    if (fixHeaderField !== 0 || wbmpType !== 0) throw new IIOException('Bad WBMP header.')
    const width = readMultiByteInteger(iis)
    const height = readMultiByteInteger(iis)
    return { width, height, bands: 1, indexed: true, extra: { dataOffset: iis.getStreamPosition() } }
  }
}

class JdkWBMPImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.sun.imageio.plugins.wbmp.WBMPImageReaderSpi', ['wbmp', 'WBMP'], ['image/vnd.wap.wbmp'])
  }
  private tryReadMultiByteInteger(stream: ImageInputStream): number {
    let value = stream.read()
    if (value < 0) return -1
    let result = value & 0x7f
    let i = 0
    while ((value & 0x80) === 0x80) {
      i++
      if (i > 4) return -1
      result <<= 7
      value = stream.read()
      if (value < 0) return -1
      result |= value & 0x7f
    }
    return result
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    stream.mark()
    try {
      const type = stream.read()
      const fixHeaderField = stream.read()
      if (type !== 0 || fixHeaderField !== 0) return false
      const width = this.tryReadMultiByteInteger(stream)
      const height = this.tryReadMultiByteInteger(stream)
      if (width <= 0 || height <= 0) return false
      let dataLength = stream.length()
      if (dataLength === -1) return width < 1024 && height < 768
      dataLength -= stream.getStreamPosition()
      const scanSize = Math.trunc(width / 8) + (width % 8 === 0 ? 0 : 1)
      return dataLength === scanSize * height
    } finally {
      stream.reset()
    }
  }
  createReaderInstance(): ImageReader {
    return new WbmpImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// JPEG XL (NightMonkeys, libjxl)
// ---------------------------------------------------------------------------

/** Lecteur de bits LSB d'abord (codestream JPEG XL) */
class BitReader {
  private pos = 0
  constructor(private readonly b: Uint8Array) {}
  u(n: number): number {
    let v = 0
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.pos >> 3]
      if (byte === undefined) throw new EOFException()
      v += ((byte >> (this.pos & 7)) & 1) * 2 ** i
      this.pos++
    }
    return v
  }
  bool(): boolean {
    return this.u(1) === 1
  }
  u32(d: ([number, number] | number)[]): number {
    const sel = this.u(2)
    const x = d[sel]!
    return typeof x === 'number' ? x : x[0] + this.u(x[1])
  }
}

/** Codestream JPEG XL (conteneur ISOBMFF : boîtes jxlc / jxlp) */
function jxlCodestream(all: Uint8Array): Uint8Array {
  if (all[0] === 0xff && all[1] === 0x0a) return all
  let p = 0
  const parts: Uint8Array[] = []
  while (p + 8 <= all.length) {
    let size = u32be(all, p)
    const type = ascii(all, p + 4, 4)
    let header = 8
    if (size === 1) {
      size = Number(new DataView(all.buffer, all.byteOffset + p + 8, 8).getBigUint64(0))
      header = 16
    } else if (size === 0) size = all.length - p
    if (size < header) throw new IIOException('Invalid JPEG XL box')
    if (type === 'jxlc') return all.subarray(p + header, p + size)
    if (type === 'jxlp') parts.push(all.subarray(p + header + 4, Math.min(all.length, p + size)))
    p += size
  }
  if (parts.length) return parts[0]!
  throw new IIOException('Decoder error')
}

export class JxlImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const cs = jxlCodestream(this.iis.allBytes())
    if (cs[0] !== 0xff || cs[1] !== 0x0a) throw new IIOException('Decoder error')
    const br = new BitReader(cs.subarray(2))
    // SizeHeader
    let ysize: number
    let xsize: number
    const small = br.bool()
    const dist: [number, number][] = [
      [1, 9],
      [1, 13],
      [1, 18],
      [1, 30],
    ]
    if (small) ysize = (br.u(5) + 1) * 8
    else ysize = br.u32(dist)
    const ratio = br.u(3)
    const ratioOf = (r: number, y: number): number => {
      const [n, d] = ([[1, 1], [12, 10], [4, 3], [3, 2], [16, 9], [5, 4], [2, 1]] as [number, number][])[r - 1]!
      return Math.floor((y * n) / d)
    }
    if (ratio !== 0) xsize = ratioOf(ratio, ysize)
    else if (small) xsize = (br.u(5) + 1) * 8
    else xsize = br.u32(dist)
    // ImageMetadata : orientation (JxlDecoderSetKeepOrientation(false) : dimensions permutées si orientation > 4)
    let orientation = 1
    if (!br.bool()) {
      if (br.bool()) orientation = 1 + br.u(3)
    }
    if (orientation > 4) [xsize, ysize] = [ysize, xsize]
    return { width: xsize, height: ysize, bands: 4, alpha: true }
  }
}

class JxlImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.github.gotson.nightmonkeys.jxl.imageio.plugins.JxlImageReaderSpi', ['jxl', 'JXL', 'Jpeg XL'], ['image/jxl'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    stream.mark()
    const b = readPadded(stream, 12)
    stream.reset()
    // JxlSignatureCheck : JXL_SIG_CODESTREAM ou JXL_SIG_CONTAINER
    if (b[0] === 0xff && b[1] === 0x0a) return true
    const container = [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]
    return container.every((v, i) => b[i] === v)
  }
  createReaderInstance(): ImageReader {
    return new JxlImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// HEIF / AVIF (NightMonkeys, libheif)
// ---------------------------------------------------------------------------

type Box = { type: string; start: number; header: number; end: number }

function* boxes(b: Uint8Array, from: number, to: number): Generator<Box> {
  let p = from
  while (p + 8 <= to) {
    let size = u32be(b, p)
    const type = ascii(b, p + 4, 4)
    let header = 8
    if (size === 1) {
      if (p + 16 > to) throw new EOFException()
      size = Number(new DataView(b.buffer, b.byteOffset + p + 8, 8).getBigUint64(0))
      header = 16
    } else if (size === 0) size = to - p
    if (size < header || p + size > to) throw new IIOException(`Invalid input: box size ${size} exceeds file`)
    yield { type, start: p, header, end: p + size }
    p += size
  }
}

/** Dimensions de l'image primaire (heif_image_handle_get_width : ispe puis transformations irot / clap) */
export function heifPrimaryInfo(b: Uint8Array): { width: number; height: number; alpha: boolean; av1: boolean } {
  let meta: Box | null = null
  for (const bx of boxes(b, 0, b.length)) if (bx.type === 'meta') meta = bx
  if (meta === null) throw new IIOException("No 'meta' box")
  const mstart = meta.start + meta.header + 4
  let primary = -1
  const itemTypes = new Map<number, string>()
  const auxTypes = new Map<number, string>()
  const props: { type: string; data: Uint8Array }[] = []
  const assoc = new Map<number, number[]>()
  const refs: { type: string; from: number; to: number[] }[] = []
  for (const bx of boxes(b, mstart, meta.end)) {
    const d = b.subarray(bx.start + bx.header, bx.end)
    if (bx.type === 'pitm') primary = d[0] === 0 ? u16be(d, 4) : u32be(d, 4)
    else if (bx.type === 'iinf') {
      const v = d[0]!
      const off = v === 0 ? 6 : 8
      for (const ib of boxes(d, off, d.length)) {
        if (ib.type !== 'infe') continue
        const e = d.subarray(ib.start + ib.header, ib.end)
        const ver = e[0]!
        if (ver >= 2) {
          const id = ver === 2 ? u16be(e, 4) : u32be(e, 4)
          const o = ver === 2 ? 8 : 10
          itemTypes.set(id, ascii(e, o, 4))
        }
      }
    } else if (bx.type === 'iprp') {
      for (const pb of boxes(d, 0, d.length)) {
        const pd = d.subarray(pb.start + pb.header, pb.end)
        if (pb.type === 'ipco') {
          for (const pr of boxes(pd, 0, pd.length)) {
            const prd = pd.subarray(pr.start + pr.header, pr.end)
            props.push({ type: pr.type, data: prd })
            if (pr.type === 'auxC') {
              let s = ''
              for (let i = 4; i < prd.length && prd[i] !== 0; i++) s += String.fromCharCode(prd[i]!)
              auxTypes.set(props.length, s)
            }
          }
        } else if (pb.type === 'ipma') {
          const ver = pd[0]!
          const flags = u32be(pd, 0) & 0xffffff
          let o = 4
          const n = u32be(pd, o)
          o += 4
          for (let i = 0; i < n; i++) {
            const id = ver < 1 ? u16be(pd, o) : u32be(pd, o)
            o += ver < 1 ? 2 : 4
            const cnt = pd[o++]!
            const list: number[] = []
            for (let k = 0; k < cnt; k++) {
              if (flags & 1) {
                list.push(u16be(pd, o) & 0x7fff)
                o += 2
              } else list.push(pd[o++]! & 0x7f)
            }
            assoc.set(id, list)
          }
        }
      }
    } else if (bx.type === 'iref') {
      const v = d[0]!
      for (const rb of boxes(d, 4, d.length)) {
        const r = d.subarray(rb.start + rb.header, rb.end)
        let o = 0
        const from = v === 0 ? u16be(r, o) : u32be(r, o)
        o += v === 0 ? 2 : 4
        const cnt = u16be(r, o)
        o += 2
        const to: number[] = []
        for (let k = 0; k < cnt; k++) {
          to.push(v === 0 ? u16be(r, o) : u32be(r, o))
          o += v === 0 ? 2 : 4
        }
        refs.push({ type: rb.type, from, to })
      }
    }
  }
  if (primary < 0) throw new IIOException("No 'pitm' box")
  const ps = assoc.get(primary) ?? []
  let width = -1
  let height = -1
  for (const idx of ps) {
    const pr = props[idx - 1]
    if (pr === undefined) continue
    if (pr.type === 'ispe') {
      width = u32be(pr.data, 4)
      height = u32be(pr.data, 8)
    }
  }
  if (width < 0) throw new IIOException("No ispe property for item")
  for (const idx of ps) {
    const pr = props[idx - 1]
    if (pr === undefined) continue
    if (pr.type === 'irot') {
      if ((pr.data[0]! & 3) % 2 === 1) [width, height] = [height, width]
    } else if (pr.type === 'clap') {
      const dv = new DataView(pr.data.buffer, pr.data.byteOffset, pr.data.byteLength)
      const cw = dv.getInt32(0) / dv.getInt32(4)
      const ch = dv.getInt32(8) / dv.getInt32(12)
      const ho = dv.getInt32(16) / dv.getInt32(20)
      const vo = dv.getInt32(24) / dv.getInt32(28)
      // libheif : bords arrondis (left/right, top/bottom) du rectangle centré
      const pcX = ho + (width - 1) / 2
      const pcY = vo + (height - 1) / 2
      const left = Math.max(0, Math.round(pcX - (cw - 1) / 2))
      const right = Math.min(width - 1, Math.round(pcX + (cw - 1) / 2))
      const top = Math.max(0, Math.round(pcY - (ch - 1) / 2))
      const bottom = Math.min(height - 1, Math.round(pcY + (ch - 1) / 2))
      width = right - left + 1
      height = bottom - top + 1
    }
  }
  let alpha = false
  for (const r of refs)
    if (r.type === 'auxl' && r.to.includes(primary)) {
      for (const idx of assoc.get(r.from) ?? []) {
        const t = auxTypes.get(idx)
        if (t === 'urn:mpeg:mpegB:cicp:systems:auxiliary:alpha' || t === 'urn:mpeg:hevc:2015:auxid:1') alpha = true
      }
    }
  const primaryType = itemTypes.get(primary)
  let av1 = primaryType === 'av01'
  if (primaryType === 'grid') {
    const dimg = refs.find((r) => r.type === 'dimg' && r.from === primary)
    if (dimg && itemTypes.get(dimg.to[0]!) === 'av01') av1 = true
  }
  return { width, height, alpha, av1 }
}

export class HeifImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const info = heifPrimaryInfo(this.iis.allBytes())
    return { width: info.width, height: info.height, bands: 4, alpha: true, extra: { av1: info.av1, hasAlpha: info.alpha } }
  }
}

class HeifImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.github.gotson.nightmonkeys.heif.imageio.plugins.HeifImageReaderSpi', ['heif', 'HEIF', 'heic', 'HEIC', 'avif', 'AVIF'], ['image/avif', 'image/heif', 'image/heif-sequence', 'image/heic', 'image/heic-sequence'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    stream.mark()
    const b = readPadded(stream, 12)
    stream.reset()
    // heif_check_filetype(data, 12) : YES_SUPPORTED, YES_UNSUPPORTED ou MAYBE dès qu'une boîte ftyp commence le fichier
    return b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70
  }
  createReaderInstance(): ImageReader {
    return new HeifImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// WebP (NightMonkeys, libwebp : WebPGetInfo, WebPDemux)
// ---------------------------------------------------------------------------

const VP8_STATUS_OK = 0
const VP8_STATUS_BITSTREAM_ERROR = 3
const VP8_STATUS_NOT_ENOUGH_DATA = 7
const MAX_CHUNK_PAYLOAD = 0xffffffff - 8 - 1

/** `VP8GetInfo` */
function vp8GetInfo(d: Uint8Array, o: number, size: number, chunkSize: number): Dim | null {
  if (size < 10) return null
  if (d[o + 3] !== 0x9d || d[o + 4] !== 0x01 || d[o + 5] !== 0x2a) return null
  const bits = d[o]! | (d[o + 1]! << 8) | (d[o + 2]! << 16)
  const keyFrame = !(bits & 1)
  const w = u16le(d, o + 6) & 0x3fff
  const h = u16le(d, o + 8) & 0x3fff
  if (!keyFrame) return null
  if (((bits >> 1) & 7) > 3) return null
  if (!((bits >> 4) & 1)) return null
  if (bits >> 5 >= chunkSize) return null
  if (w === 0 || h === 0) return null
  return { width: w, height: h }
}

/** `VP8LCheckSignature` */
function vp8lCheckSignature(d: Uint8Array, o: number, size: number): boolean {
  return size >= 5 && d[o] === 0x2f && d[o + 4]! >> 5 === 0
}

/** `VP8LGetInfo` */
function vp8lGetInfo(d: Uint8Array, o: number, size: number): (Dim & { alpha: boolean }) | null {
  if (size < 5) return null
  if (!vp8lCheckSignature(d, o, size)) return null
  const v = u32le(d, o + 1)
  const width = (v & 0x3fff) + 1
  const height = ((v >>> 14) & 0x3fff) + 1
  const alpha = ((v >>> 28) & 1) === 1
  const version = v >>> 29
  if (version !== 0) return null
  return { width, height, alpha }
}

type WebPFeatures = { status: number; width: number; height: number; alpha: boolean; animation: boolean }

/** `ParseHeadersInternal` de libwebp (sans en-têtes de décodage : WebPGetFeatures) */
function webpParseHeaders(d: Uint8Array, dataSize: number, haveAllData: boolean): WebPFeatures {
  const res: WebPFeatures = { status: VP8_STATUS_OK, width: 0, height: 0, alpha: false, animation: false }
  let p = 0
  let size = dataSize
  let foundRiff = false
  let foundVp8x = false
  let riffSize = 0
  let imageWidth = 0
  let imageHeight = 0
  let alphaData = false
  const done = (status: number): WebPFeatures => {
    if (status === VP8_STATUS_OK || (status === VP8_STATUS_NOT_ENOUGH_DATA && foundVp8x)) {
      res.alpha ||= alphaData
      res.width = imageWidth
      res.height = imageHeight
      res.status = VP8_STATUS_OK
    } else res.status = status
    return res
  }
  if (d === null || size < 12) return done(VP8_STATUS_NOT_ENOUGH_DATA)
  // ParseRIFF
  if (size >= 12 && ascii(d, 0, 4) === 'RIFF') {
    if (ascii(d, 8, 4) !== 'WEBP') return done(VP8_STATUS_BITSTREAM_ERROR)
    const s = u32le(d, 4)
    if (s < 12) return done(VP8_STATUS_BITSTREAM_ERROR)
    if (s > MAX_CHUNK_PAYLOAD) return done(VP8_STATUS_BITSTREAM_ERROR)
    if (haveAllData && s > size - 8) return done(VP8_STATUS_NOT_ENOUGH_DATA)
    riffSize = s
    p += 12
    size -= 12
    foundRiff = true
  }
  // ParseVP8X
  if (size < 8) return done(VP8_STATUS_NOT_ENOUGH_DATA)
  let flags = 0
  if (ascii(d, p, 4) === 'VP8X') {
    const chunkSize = u32le(d, p + 4)
    if (chunkSize !== 10) return done(VP8_STATUS_BITSTREAM_ERROR)
    if (size < 18) return done(VP8_STATUS_NOT_ENOUGH_DATA)
    flags = u32le(d, p + 8)
    const w = 1 + u24le(d, p + 12)
    const h = 1 + u24le(d, p + 15)
    if (w * h >= 2 ** 32) return done(VP8_STATUS_BITSTREAM_ERROR)
    foundVp8x = true
    imageWidth = w
    imageHeight = h
    p += 18
    size -= 18
  }
  const animationPresent = (flags & 0x02) !== 0
  if (!foundRiff && foundVp8x) return done(VP8_STATUS_BITSTREAM_ERROR)
  res.alpha = (flags & 0x10) !== 0
  res.animation = animationPresent
  if (foundVp8x && animationPresent) return done(VP8_STATUS_OK)
  if (size < 4) return done(VP8_STATUS_NOT_ENOUGH_DATA)
  // ParseOptionalChunks
  if ((foundRiff && foundVp8x) || (!foundRiff && !foundVp8x && ascii(d, p, 4) === 'ALPH')) {
    let totalSize = 4 + 8 + 10
    for (;;) {
      if (size < 8) return done(VP8_STATUS_NOT_ENOUGH_DATA)
      const chunkSize = u32le(d, p + 4)
      if (chunkSize > MAX_CHUNK_PAYLOAD) return done(VP8_STATUS_BITSTREAM_ERROR)
      const diskChunkSize = (8 + chunkSize + 1) & ~1
      totalSize += diskChunkSize
      if (riffSize > 0 && totalSize > riffSize) return done(VP8_STATUS_BITSTREAM_ERROR)
      const tag = ascii(d, p, 4)
      if (tag === 'VP8 ' || tag === 'VP8L') break
      if (size < diskChunkSize) return done(VP8_STATUS_NOT_ENOUGH_DATA)
      if (tag === 'ALPH') alphaData = true
      p += diskChunkSize
      size -= diskChunkSize
    }
  }
  // ParseVP8Header
  if (size < 8) return done(VP8_STATUS_NOT_ENOUGH_DATA)
  const tag = ascii(d, p, 4)
  const isVp8 = tag === 'VP8 '
  const isVp8l = tag === 'VP8L'
  let isLossless: boolean
  let chunkSize: number
  if (isVp8 || isVp8l) {
    const s = u32le(d, p + 4)
    if (riffSize >= 12 && s > riffSize - 12) return done(VP8_STATUS_BITSTREAM_ERROR)
    if (haveAllData && s > size - 8) return done(VP8_STATUS_NOT_ENOUGH_DATA)
    chunkSize = s
    p += 8
    size -= 8
    isLossless = isVp8l
  } else {
    isLossless = vp8lCheckSignature(d, p, size)
    chunkSize = size
  }
  if (chunkSize > MAX_CHUNK_PAYLOAD) return done(VP8_STATUS_BITSTREAM_ERROR)
  if (foundVp8x || !animationPresent) {
    // format
  }
  if (size < 10) return done(VP8_STATUS_NOT_ENOUGH_DATA)
  let dims: Dim | null
  if (!isLossless) {
    if (size < 10) return done(VP8_STATUS_NOT_ENOUGH_DATA)
    dims = vp8GetInfo(d, p, size, chunkSize)
    if (dims === null) return done(VP8_STATUS_BITSTREAM_ERROR)
  } else {
    if (size < 5) return done(VP8_STATUS_NOT_ENOUGH_DATA)
    const l = vp8lGetInfo(d, p, size)
    if (l === null) return done(VP8_STATUS_BITSTREAM_ERROR)
    if (!foundVp8x) res.alpha = l.alpha
    dims = l
  }
  if (foundVp8x && (imageWidth !== dims.width || imageHeight !== dims.height)) return done(VP8_STATUS_BITSTREAM_ERROR)
  imageWidth = dims.width
  imageHeight = dims.height
  return done(VP8_STATUS_OK)
}

/** `WebPDemux` (données complètes, non partielles) : dimensions du canevas et drapeaux, ou null */
export function webpDemuxInfo(all: Uint8Array): { width: number; height: number; alpha: boolean; animation: boolean } | null {
  // ReadHeader
  if (all.length >= 12 && ascii(all, 0, 4) === 'RIFF' && ascii(all, 8, 4) === 'WEBP') {
    const riffSize = u32le(all, 4)
    if (riffSize < 8 || riffSize > MAX_CHUNK_PAYLOAD) return null
    const end = riffSize + 8
    if (all.length < end) return null
    const data = all.subarray(0, end)
    const f = webpParseHeaders(data, data.length, true)
    if (f.status !== VP8_STATUS_OK) return null
    // validation des chunks jusqu'à la fin du RIFF
    let p = 12
    let hasImage = false
    let isVp8x = false
    while (p + 8 <= end) {
      const tag = ascii(all, p, 4)
      const size = u32le(all, p + 4)
      const disk = (8 + size + 1) & ~1
      if (p + 8 + size > end) return null
      if (tag === 'VP8X') isVp8x = true
      if (tag === 'VP8 ' || tag === 'VP8L' || tag === 'ANMF') hasImage = true
      p += disk
    }
    if (!hasImage && !(isVp8x && f.animation)) return null
    return { width: f.width, height: f.height, alpha: f.alpha, animation: f.animation }
  }
  if (all.length >= 12 && ascii(all, 0, 4) === 'RIFF') return null
  // CreateRawImageDemuxer : flux VP8/VP8L brut
  const f = webpParseHeaders(all, all.length, true)
  if (f.status !== VP8_STATUS_OK || f.animation) return null
  return { width: f.width, height: f.height, alpha: f.alpha, animation: false }
}

export class WebpImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const info = webpDemuxInfo(this.iis.allBytes())
    if (info === null) throw new IOException('com.github.gotson.nightmonkeys.webp.WebpException: Couldn\'t get basic information')
    const argb = info.alpha || info.animation
    return { width: info.width, height: info.height, bands: argb ? 4 : 3, alpha: argb, extra: { animation: info.animation } }
  }
}

class WebpImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.github.gotson.nightmonkeys.webp.imageio.plugins.WebpImageReaderSpi', ['webp', 'WEBP', 'WebP'], ['image/webp'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    stream.mark()
    const b = readPadded(stream, 30)
    stream.reset()
    return webpParseHeaders(b, 30, false).status === VP8_STATUS_OK
  }
  createReaderInstance(): ImageReader {
    return new WebpImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// JPEG (TwelveMonkeys, délégation de canDecodeInput au lecteur du JDK)
// ---------------------------------------------------------------------------

const JPEG_KNOWN_MARKERS = new Set([
  0xffd8, 0xffd9, 0xffc4, 0xffda, 0xffdb, 0xfffe, 0xffc0, 0xffc1, 0xffc2, 0xffc3, 0xffc5, 0xffc6, 0xffc7, 0xffc9, 0xffca, 0xffcb, 0xffcd, 0xffce, 0xffcf, 0xfff7,
  0xffe0, 0xffe1, 0xffe2, 0xffe3, 0xffe4, 0xffe5, 0xffe6, 0xffe7, 0xffe8, 0xffe9, 0xffea, 0xffeb, 0xffec, 0xffed, 0xffee, 0xffef, 0xffdd, 0xff01, 0xffcc, 0xffde,
  0xffdc, 0xffdf, 0xfff8,
])
const SOF_MARKERS = new Set([0xffc0, 0xffc1, 0xffc2, 0xffc3, 0xffc5, 0xffc6, 0xffc7, 0xffc9, 0xffca, 0xffcb, 0xffcd, 0xffce, 0xffcf])

type JpegSegment = { marker: number; data: Uint8Array; length: number }

/** `JPEGSegmentUtil.readSegments(stream, ALL_SEGMENTS)` : segments jusqu'à SOS/EOI, EOF toléré */
function readJpegSegments(iis: ImageInputStream): JpegSegment[] {
  iis.seek(0)
  if (iis.readUnsignedShort() !== 0xffd8) throw new IIOException('Not a JPEG stream')
  const segments: JpegSegment[] = []
  try {
    for (;;) {
      let marker = iis.readUnsignedByte()
      while (!JPEG_KNOWN_MARKERS.has(marker)) {
        while (marker !== 0xff) marker = iis.readUnsignedByte()
        marker = 0xff00 | iis.readUnsignedByte()
        while (marker === 0xffff) marker = 0xff00 | iis.readUnsignedByte()
      }
      if (((marker >> 8) & 0xff) !== 0xff) throw new IIOException(`Bad marker: ${marker.toString(16).padStart(4, '0')}`)
      const length = iis.readUnsignedShort()
      const data = new Uint8Array(Math.max(0, length - 2))
      iis.readFully(data)
      segments.push({ marker, data, length })
      if (marker === 0xffda || marker === 0xffd9 || marker === 0xffd8) break
    }
  } catch (e) {
    if (!(e instanceof EOFException)) throw e
  }
  return segments
}

/** Lecture d'un segment (Segment.read de TwelveMonkeys) : validations levant une IIOException */
function parseJpegSegment(s: JpegSegment): { frame?: { lines: number; samplesPerLine: number; components: number } } {
  const d = s.data
  let o = 0
  const ub = (): number => {
    if (o >= d.length) throw new EOFException()
    return d[o++]!
  }
  const us = (): number => (ub() << 8) | ub()
  const length = s.length
  if (SOF_MARKERS.has(s.marker)) {
    ub()
    const lines = us()
    const samplesPerLine = us()
    const componentsInFrame = ub()
    const expected = 8 + componentsInFrame * 3
    if (length !== expected) throw new IIOException(`Unexpected SOF length: ${length} != ${expected}`)
    for (let i = 0; i < componentsInFrame * 3; i++) ub()
    return { frame: { lines, samplesPerLine, components: componentsInFrame } }
  }
  switch (s.marker) {
    case 0xffc4: {
      let count = 2
      while (count < length) {
        const temp = ub()
        count++
        const t = temp & 0x0f
        if (t > 3) throw new IIOException(`Unexpected JPEG Huffman Table Id (> 3):${t}`)
        const c = temp >> 4
        if (c > 1) throw new IIOException(`Unexpected JPEG Huffman Table class (> 1): ${c}`)
        const l: number[] = []
        for (let i = 0; i < 16; i++) {
          l.push(ub())
          count++
        }
        for (let i = 0; i < 16; i++)
          for (let j = 0; j < l[i]!; j++) {
            if (count > length) throw new IIOException('JPEG Huffman Table format error')
            ub()
            count++
          }
      }
      if (count !== length) throw new IIOException(`JPEG Huffman Table format error, bad segment length: ${length}`)
      return {}
    }
    case 0xffdb: {
      let count = 2
      while (count < length) {
        const temp = ub()
        count++
        const t = temp & 0x0f
        if (t > 3) throw new IIOException(`Unexpected JPEG Quantization Table Id (> 3): ${t}`)
        let precision = temp >> 4
        if (precision === 0) precision = 8
        else if (precision === 1) precision = 16
        else throw new IIOException(`Unexpected JPEG Quantization Table precision: ${precision}`)
        for (let i = 0; i < 64; i++) {
          if (count > length) throw new IIOException('JPEG Quantization Table format error')
          if (precision === 8) {
            ub()
            count++
          } else {
            us()
            count += 2
          }
        }
      }
      if (count !== length) throw new IIOException(`JPEG Quantization Table error, bad segment length: ${length}`)
      return {}
    }
    case 0xffda: {
      const numComp = ub()
      const expected = 6 + numComp * 2
      if (expected !== length) throw new IIOException(`Unexpected SOS length: ${length} != ${expected}`)
      for (let i = 0; i < numComp * 2 + 3; i++) ub()
      return {}
    }
    case 0xffdd:
      if (length !== 4) throw new IIOException(`Unexpected length of DRI segment: ${length}`)
      us()
      return {}
    default:
      // COM / Unknown : new byte[length - 2] (NegativeArraySizeException si length < 2)
      if (s.marker < 0xffe0 || s.marker > 0xffef) {
        if (length < 2) throw new RangeError(`${length - 2}`)
        if (d.length < length - 2) throw new EOFException()
      }
      return {}
  }
}

export class JpegImageReader extends HeaderImageReader {
  private segmentsCache: JpegSegment[] | null = null

  private segments(): JpegSegment[] {
    if (this.segmentsCache === null) {
      const iis = this.iis
      iis.mark()
      try {
        this.segmentsCache = readJpegSegments(iis)
      } catch (e) {
        // readSegments : IIOException / IllegalArgumentException -> liste vide
        if (e instanceof IIOException) this.segmentsCache = []
        else throw e
      } finally {
        iis.reset()
      }
    }
    return this.segmentsCache
  }

  protected readInfo(): HeaderInfo {
    let frame: { lines: number; samplesPerLine: number; components: number } | undefined
    for (const s of this.segments()) {
      try {
        const r = parseJpegSegment(s)
        if (frame === undefined && r.frame) frame = r.frame
      } catch (e) {
        // segments APPn invalides ignorés
        if (s.marker >= 0xffe0 && s.marker <= 0xffef) continue
        throw e
      }
    }
    if (frame === undefined) throw new IIOException('No SOF segment in stream')
    return { width: frame.samplesPerLine, height: frame.lines, bands: frame.components === 1 ? 1 : 3, alpha: false }
  }

  override getJpegAppSegments(): Uint8Array[] {
    return this.segments()
      .filter((s) => s.marker >= 0xffe0 && s.marker <= 0xffef)
      .map((s) => s.data)
  }
}

class TMJPEGImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.twelvemonkeys.imageio.plugins.jpeg.JPEGImageReaderSpi', ['JPEG', 'jpeg', 'JPG', 'jpg', 'jpeg-lossless', 'JPEG-LOSSLESS'], ['image/jpeg'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    return jdkJpegCanDecode(stream)
  }
  createReaderInstance(): ImageReader {
    return new JpegImageReader(this)
  }
}

function jdkJpegCanDecode(iis: ImageInputStream): boolean {
  iis.mark()
  const byte1 = iis.read()
  const byte2 = iis.read()
  iis.reset()
  return byte1 === 0xff && byte2 === 0xd8
}

class JdkJPEGImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.sun.imageio.plugins.jpeg.JPEGImageReaderSpi', ['JPEG', 'jpeg', 'JPG', 'jpg'], ['image/jpeg'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    return jdkJpegCanDecode(stream)
  }
  createReaderInstance(): ImageReader {
    return new JpegImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// PNM (jai-imageio)
// ---------------------------------------------------------------------------

export class PnmImageReader extends HeaderImageReader {
  private aLine: string | null = null
  private tokens: string[] = []

  /** `readInteger` (StringTokenizer, Integer.parseInt) */
  private readInteger(stream: ImageInputStream): number {
    while (this.aLine === null) {
      this.aLine = stream.readLine()
      if (this.aLine === null) return 0
      const pos = this.aLine.indexOf('#')
      if (pos === 0) this.aLine = null
      else if (pos > 0) this.aLine = this.aLine.substring(0, pos - 1)
      if (this.aLine !== null) this.tokens = this.aLine.split(/[ \t\n\r\f]+/).filter((t) => t.length > 0)
    }
    while (this.tokens.length > 0) {
      const s = this.tokens.shift() as string
      if (/^[+-]?\d+$/.test(s)) {
        const v = Number(s)
        if (v >= -2147483648 && v <= 2147483647) return v
      }
    }
    this.aLine = null
    return this.readInteger(stream)
  }

  protected readInfo(): HeaderInfo {
    const iis = this.iis
    iis.seek(0)
    if (iis.readByte() !== 0x50) throw new Error('Invalid file header')
    const variant = iis.readByte()
    if (variant < 0x31 || variant > 0x36) throw new Error('Invalid file header')
    iis.readLine()
    // readComments : lecture puis reset
    iis.mark()
    for (let line = iis.readLine(); line !== null && line.indexOf('#') >= 0; line = iis.readLine()) {
      // commentaire
    }
    iis.reset()
    const width = this.readInteger(iis)
    const height = this.readInteger(iis)
    const maxValue = variant === 0x31 || variant === 0x34 ? 1 : this.readInteger(iis)
    const color = variant === 0x33 || variant === 0x36
    return { width, height, bands: color ? 3 : 1, alpha: false, indexed: variant === 0x31 || variant === 0x34, extra: { variant, maxValue } }
  }
}

class PNMImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.github.jaiimageio.impl.plugins.pnm.PNMImageReaderSpi', ['pnm', 'PNM'], ['image/x-portable-anymap', 'image/x-portable-bitmap', 'image/x-portable-graymap', 'image/x-portable-pixmap'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    const b = new Uint8Array(2)
    stream.mark()
    stream.readFully(b)
    stream.reset()
    return b[0] === 0x50 && b[1]! >= 0x31 && b[1]! <= 0x36
  }
  createReaderInstance(): ImageReader {
    return new PnmImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// BMP (JDK, puis jai-imageio)
// ---------------------------------------------------------------------------

export class BmpImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const iis = this.iis
    iis.seek(0)
    iis.byteOrder = 'LE'
    const marker = readPadded(iis, 2)
    if (marker[0] !== 0x42 || marker[1] !== 0x4d) throw new Error('Invalid magic value for BMP file.')
    const bitmapFileSize = iis.readUnsignedInt()
    iis.skipBytes(4)
    const bitmapOffset = iis.readUnsignedInt()
    const size = iis.readUnsignedInt()
    let width: number
    let height: number
    if (size === 12) {
      width = iis.readShort()
      height = iis.readShort()
    } else {
      width = iis.readInt()
      height = iis.readInt()
    }
    iis.readUnsignedShort() // planes
    const bitsPerPixel = iis.readUnsignedShort()
    let compression = 0
    let alphaMask = 0
    let paletteSize = 0
    if (size === 12) {
      if (![1, 4, 8, 24].includes(bitsPerPixel)) throw new IIOException('Invalid bitsPerPixel in BMP header')
      paletteSize = bitsPerPixel <= 8 ? (bitmapOffset - 26) / 3 : 0
    } else if ([40, 52, 56, 108, 124].includes(size)) {
      compression = iis.readUnsignedInt()
      iis.readInt() // imageSize
      iis.readInt()
      iis.readInt()
      const colorsUsed = iis.readUnsignedInt()
      iis.readUnsignedInt()
      paletteSize = size === 40 ? (bitmapOffset - 14 - size) / 4 : colorsUsed
      if (size >= 56 || (size === 40 && compression === 3 && false)) {
        iis.readInt()
        iis.readInt()
        iis.readInt()
        alphaMask = iis.readInt()
      } else if (size === 52) {
        iis.readInt()
        iis.readInt()
        iis.readInt()
      }
      if (size === 40 && ![0, 1, 2, 3, 4, 5].includes(compression)) throw new IIOException('Invalid compression specified in BMP stream.')
    } else throw new IIOException('BMP version not recognized.')
    if (height < 0) height = Math.abs(height)
    if (compression === 0 && paletteSize === 0 && bitsPerPixel >= 16) {
      const imageDataSize = Math.floor((width * height * bitsPerPixel) / 8)
      if (imageDataSize > bitmapFileSize - bitmapOffset) throw new IIOException('Invalid BMP image data size.')
    }
    const alpha = size >= 56 && bitsPerPixel === 32 && alphaMask !== 0
    return {
      width,
      height,
      bands: bitsPerPixel <= 8 ? 1 : alpha ? 4 : 3,
      alpha,
      indexed: bitsPerPixel <= 8,
      extra: { bitsPerPixel, size, compression },
    }
  }
}

class JdkBMPImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.sun.imageio.plugins.bmp.BMPImageReaderSpi', ['bmp', 'BMP'], ['image/bmp'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    const b = new Uint8Array(2)
    stream.mark()
    const full = tryReadFully(stream, b)
    stream.reset()
    return full && b[0] === 0x42 && b[1] === 0x4d
  }
  createReaderInstance(): ImageReader {
    return new BmpImageReader(this)
  }
}

class JaiBMPImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.github.jaiimageio.impl.plugins.bmp.BMPImageReaderSpi', ['bmp', 'BMP'], ['image/bmp', 'image/x-bmp', 'image/x-windows-bmp'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    const b = new Uint8Array(2)
    stream.mark()
    stream.readFully(b)
    stream.reset()
    return b[0] === 0x42 && b[1] === 0x4d
  }
  createReaderInstance(): ImageReader {
    return new BmpImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// JPEG 2000 (jai-imageio-jpeg2000)
// ---------------------------------------------------------------------------

export class J2kImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const all = this.iis.allBytes()
    let cs = 0
    if (!(all[0] === 0xff && all[1] === 0x4f)) {
      cs = -1
      let p = 0
      while (p + 8 <= all.length) {
        let size = u32be(all, p)
        const type = ascii(all, p + 4, 4)
        let header = 8
        if (size === 1) {
          size = Number(new DataView(all.buffer, all.byteOffset + p + 8, 8).getBigUint64(0))
          header = 16
        } else if (size === 0) size = all.length - p
        if (type === 'jp2c') {
          cs = p + header
          break
        }
        if (size < header) break
        p += size
      }
      if (cs < 0) throw new IIOException('No codestream box')
    }
    if (cs + 4 + 38 > all.length || u16be(all, cs + 2) !== 0xff51) throw new EOFException()
    const siz = cs + 4
    const xsiz = u32be(all, siz + 4)
    const ysiz = u32be(all, siz + 8)
    const xo = u32be(all, siz + 12)
    const yo = u32be(all, siz + 16)
    const csiz = u16be(all, siz + 36)
    return { width: xsiz - xo, height: ysiz - yo, bands: csiz >= 3 ? 3 : 1, alpha: false }
  }
}

class J2KImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.github.jaiimageio.jpeg2000.impl.J2KImageReaderSpi', ['jpeg 2000', 'JPEG 2000', 'jpeg2000', 'JPEG2000'], ['image/jp2', 'image/jpeg2000'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    stream.mark()
    const marker = (stream.read() << 8) | stream.read()
    if (marker === 0xff4f) {
      stream.reset()
      return true
    }
    stream.reset()
    stream.mark()
    const b = new Uint8Array(12)
    stream.readFully(b)
    stream.reset()
    if (b[0] !== 0 || b[1] !== 0 || b[2] !== 0 || b[3] !== 12) return false
    if (b[4] !== 0x6a || b[5] !== 0x50 || b[6] !== 0x20 || b[7] !== 0x20) return false
    if (b[8] !== 0x0d || b[9] !== 0x0a || b[10] !== 0x87 || b[11] !== 0x0a) return false
    return true
  }
  createReaderInstance(): ImageReader {
    return new J2kImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// PCX (jai-imageio)
// ---------------------------------------------------------------------------

export class PcxImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const iis = this.iis
    iis.seek(0)
    iis.byteOrder = 'LE'
    const manufacturer = iis.readByte()
    if (manufacturer !== 0x0a) throw new Error('image is not a PCX file')
    iis.readByte() // version
    const encoding = iis.readByte()
    if (encoding !== 1) throw new Error(`image is not a PCX file, invalid encoding ${encoding}`)
    const bitsPerPixel = iis.readByte()
    const xmin = iis.readShort()
    const ymin = iis.readShort()
    const xmax = iis.readShort()
    const ymax = iis.readShort()
    iis.readShort()
    iis.readShort()
    iis.readFully(new Uint8Array(48))
    iis.readByte()
    const colorPlanes = iis.readByte()
    const bytesPerLine = iis.readShort()
    iis.readShort()
    iis.readShort()
    iis.readShort()
    iis.skipBytes(54)
    const width = xmax - xmin + 1
    const height = ymax - ymin + 1
    const rgb = colorPlanes === 3 && bitsPerPixel === 8
    return { width, height, bands: rgb ? 3 : 1, alpha: false, indexed: !rgb, extra: { bitsPerPixel, colorPlanes, bytesPerLine } }
  }
}

class PCXImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.github.jaiimageio.impl.plugins.pcx.PCXImageReaderSpi', ['pcx', 'PCX'], ['image/pcx', 'image/x-pcx', 'image/x-windows-pcx', 'image/x-pc-paintbrush'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    stream.mark()
    const b = stream.readByte()
    stream.reset()
    return b === 0x0a
  }
  createReaderInstance(): ImageReader {
    return new PcxImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// PNG (JDK)
// ---------------------------------------------------------------------------

export class PngImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const iis = this.iis
    iis.seek(0)
    try {
      const signature: number[] = Array.from(iis.readBytes(8))
      if (!(signature[0] === 137 && signature[1] === 80 && signature[2] === 78 && signature[3] === 71 && signature[4] === 13 && signature[5] === 10 && signature[6] === 26 && signature[7] === 10))
        throw new IIOException('Bad PNG signature!')
      if (iis.readInt() !== 13) throw new IIOException('Bad length for IHDR chunk!')
      if (iis.readInt() !== 0x49484452) throw new IIOException('Bad type for IHDR chunk!')
      const width = iis.readInt()
      const height = iis.readInt()
      const fields: number[] = Array.from(iis.readBytes(5))
      const bitDepth = fields[0]!
      const colorType = fields[1]!
      const compressionMethod = fields[2]!
      const filterMethod = fields[3]!
      const interlaceMethod = fields[4]!
      iis.skipBytes(4)
      if (width <= 0) throw new IIOException('Image width <= 0!')
      if (height <= 0) throw new IIOException('Image height <= 0!')
      if (![1, 2, 4, 8, 16].includes(bitDepth)) throw new IIOException('Bit depth must be 1, 2, 4, 8, or 16!')
      if (![0, 2, 3, 4, 6].includes(colorType)) throw new IIOException('Color type must be 0, 2, 3, 4, or 6!')
      if (colorType === 3 && bitDepth === 16) throw new IIOException('Bad color type/bit depth combination!')
      if ((colorType === 2 || colorType === 6 || colorType === 4) && bitDepth !== 8 && bitDepth !== 16) throw new IIOException('Bad color type/bit depth combination!')
      if (compressionMethod !== 0) throw new IIOException('Unknown compression method (not 0)!')
      if (filterMethod !== 0) throw new IIOException('Unknown filter method (not 0)!')
      if (interlaceMethod !== 0 && interlaceMethod !== 1) throw new IIOException('Unknown interlace method (not 0 or 1)!')
      // tRNS (JDK 11+ : RGB / gris avec tRNS lus en ARGB)
      const all = iis.allBytes()
      let trns = false
      let p = 33
      while (p + 8 <= all.length) {
        const len = u32be(all, p)
        const type = ascii(all, p + 4, 4)
        if (type === 'tRNS') trns = true
        if (type === 'IDAT' || type === 'IEND') break
        p += 12 + len
      }
      const alpha = colorType === 4 || colorType === 6 || trns
      const bands = colorType === 3 ? 1 : colorType === 0 ? (trns ? 4 : 1) : colorType === 4 ? 2 : colorType === 2 ? (trns ? 4 : 3) : 4
      return { width, height, bands, alpha, indexed: colorType === 3, extra: { colorType, bitDepth } }
    } catch (e) {
      if (e instanceof IOException) throw new IIOException('I/O error reading PNG header!', e)
      throw e
    }
  }
}

/**
 * `PNGImageReader.readMetadata()` (lecture des métadonnées, ignoreMetadata = false) : parcours des chunks jusqu'à IEND,
 * « Error reading PNG metadata » si le flux se termine avant.
 */
export function pngReadMetadata(all: Uint8Array): void {
  let p = 8
  for (;;) {
    if (p + 8 > all.length) throw new IIOException('Error reading PNG metadata', new EOFException())
    const len = u32be(all, p)
    const type = ascii(all, p + 4, 4)
    if (p + 12 + len > all.length) throw new IIOException('Error reading PNG metadata', new EOFException())
    if (type === 'IEND') return
    p += 12 + len
  }
}

class PNGImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.sun.imageio.plugins.png.PNGImageReaderSpi', ['png', 'PNG'], ['image/png', 'image/x-png'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    const b = new Uint8Array(8)
    stream.mark()
    const full = tryReadFully(stream, b)
    stream.reset()
    return full && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71 && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10
  }
  createReaderInstance(): ImageReader {
    return new PngImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// GIF (JDK)
// ---------------------------------------------------------------------------

export class GifImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const stream = this.iis
    stream.seek(0)
    stream.byteOrder = 'LE'
    try {
      stream.readFully(new Uint8Array(6))
      stream.readUnsignedShort()
      stream.readUnsignedShort()
      const packedFields = stream.readUnsignedByte()
      stream.readUnsignedByte()
      stream.readUnsignedByte()
      if ((packedFields & 0x80) !== 0) stream.readFully(new Uint8Array(3 * (1 << ((packedFields & 0x7) + 1))))
    } catch (e) {
      if (e instanceof IOException) throw new IIOException('I/O error reading header!', e)
      throw e
    }
    const concatenateBlocks = (): void => {
      let length: number
      do {
        length = stream.readUnsignedByte()
        stream.readFully(new Uint8Array(length))
      } while (length > 0)
    }
    let transparentColorFlag = false
    try {
      for (;;) {
        const blockType = stream.readUnsignedByte()
        if (blockType === 0x2c) {
          const left = stream.readUnsignedShort()
          const top = stream.readUnsignedShort()
          const width = stream.readUnsignedShort()
          const height = stream.readUnsignedShort()
          return { width, height, bands: 1, alpha: transparentColorFlag, indexed: true, extra: { left, top } }
        } else if (blockType === 0x21) {
          const label = stream.readUnsignedByte()
          if (label === 0xf9) {
            stream.readUnsignedByte()
            const gcePackedFields = stream.readUnsignedByte()
            transparentColorFlag = (gcePackedFields & 0x1) !== 0
            stream.readUnsignedShort()
            stream.readUnsignedByte()
            stream.readUnsignedByte()
          } else if (label === 0x1) {
            const length = stream.readUnsignedByte()
            stream.readFully(new Uint8Array(Math.min(length, 12)))
            if (length > 12) stream.skipBytes(length - 12)
            concatenateBlocks()
          } else if (label === 0xfe) {
            concatenateBlocks()
          } else if (label === 0xff) {
            const blockSize = stream.readUnsignedByte()
            stream.readFully(new Uint8Array(blockSize))
            concatenateBlocks()
          } else {
            let length: number
            do {
              length = stream.readUnsignedByte()
              stream.skipBytes(length)
            } while (length > 0)
          }
        } else if (blockType === 0x3b) {
          throw new RangeError('Attempt to read past end of image sequence!')
        } else throw new IIOException(`Unexpected block type ${blockType}!`)
      }
    } catch (e) {
      if (e instanceof IIOException || !(e instanceof IOException)) throw e
      throw new IIOException('I/O error reading image metadata!', e)
    }
  }
}

class GIFImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('com.sun.imageio.plugins.gif.GIFImageReaderSpi', ['gif', 'GIF'], ['image/gif'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    const b = new Uint8Array(6)
    stream.mark()
    const full = tryReadFully(stream, b)
    stream.reset()
    return full && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61
  }
  createReaderInstance(): ImageReader {
    return new GifImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// JBIG2 (pdfbox jbig2-imageio)
// ---------------------------------------------------------------------------

export class Jbig2ImageReader extends HeaderImageReader {
  protected readInfo(): HeaderInfo {
    const all = this.iis.allBytes()
    // en-tête de fichier : préambule (8), drapeaux (1), nombre de pages (4, si le bit 1 des drapeaux est à 0)
    let p = 8
    if (p >= all.length) throw new EOFException()
    const flags = all[p++]!
    if ((flags & 2) === 0) p += 4
    // segments (organisation séquentielle) : premier segment « page information » (type 48)
    while (p + 11 <= all.length) {
      const segNum = u32be(all, p)
      p += 4
      const segFlags = all[p++]!
      const type = segFlags & 0x3f
      const pageAssocLong = (segFlags & 0x40) !== 0
      let refCount = all[p]! >> 5
      if (refCount === 7) {
        refCount = u32be(all, p) & 0x1fffffff
        p += 4 + Math.ceil((refCount + 1) / 8)
      } else p += 1
      const refSize = segNum <= 256 ? 1 : segNum <= 65536 ? 2 : 4
      p += refCount * refSize
      p += pageAssocLong ? 4 : 1
      if (p + 4 > all.length) break
      const dataLength = u32be(all, p)
      p += 4
      if (type === 48) {
        if (p + 8 > all.length) throw new EOFException()
        return { width: u32be(all, p), height: u32be(all, p + 4), bands: 1, alpha: false, indexed: true }
      }
      if (dataLength === 0xffffffff) break
      p += dataLength
    }
    throw new IIOException('No page information segment')
  }
}

class JBIG2ImageReaderSpi extends ImageReaderSpi {
  constructor() {
    super('org.apache.pdfbox.jbig2.JBIG2ImageReaderSpi', ['jbig2', 'JBIG2'], ['image/x-jbig2', 'image/x-jb2'])
  }
  canDecodeInput(stream: ImageInputStream): boolean {
    // sans reset en cas d'échec (comme jbig2-imageio)
    const preamble = [0x97, 0x4a, 0x42, 0x32, 0x0d, 0x0a, 0x1a, 0x0a]
    stream.mark()
    for (const p of preamble) {
      const read = stream.read() & 0xff
      if (read !== p) return false
    }
    stream.reset()
    return true
  }
  createReaderInstance(): ImageReader {
    return new Jbig2ImageReader(this)
  }
}

// ---------------------------------------------------------------------------
// Registre (ordre de IIORegistry.getServiceProviders(ImageReaderSpi, useOrdering = true) dans Komga,
// après ImageConverter.chooseWebpReader qui retire le lecteur WebP de TwelveMonkeys)
// ---------------------------------------------------------------------------

export const readerSpis: ImageReaderSpi[] = [
  new RawImageReaderSpi(),
  new TMBigTIFFImageReaderSpi(),
  new JaiWBMPImageReaderSpi(),
  new JxlImageReaderSpi(),
  new TMTIFFImageReaderSpi(),
  new HeifImageReaderSpi(),
  new WebpImageReaderSpi(),
  new TMJPEGImageReaderSpi(),
  new PNMImageReaderSpi(),
  new JdkBMPImageReaderSpi(),
  new J2KImageReaderSpi(),
  new JaiBMPImageReaderSpi(),
  new PCXImageReaderSpi(),
  new JdkWBMPImageReaderSpi(),
  new PNGImageReaderSpi(),
  new GIFImageReaderSpi(),
  new JaiTIFFImageReaderSpi(),
  new JBIG2ImageReaderSpi(),
  new JdkTIFFImageReaderSpi(),
  new JdkJPEGImageReaderSpi(),
]
