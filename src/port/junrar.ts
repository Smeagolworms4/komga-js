// Support de portage : sous-ensemble de com.github.junrar (junrar 8.1.0) utilisé par Komga, sans jumeau Kotlin.
// Les en-têtes sont lus par un portage de la lecture d'en-têtes de junrar (Archive.readHeaders / readHeadersRar5,
// FileHeader, FileNameDecoder, Rar5FileHeaderReader) : mêmes entrées, mêmes noms (octets stockés, `\` en RAR 1.5-4.x,
// UTF-8 strict sinon ISO-8859-1, nom Unicode encodé), mêmes tailles, mêmes exceptions à l'ouverture, mêmes en-têtes
// « cassés » (CRC). La décompression est faite par node-unrar-js (unrar officiel 6.1.7 en WebAssembly).
// Comportements reproduits :
//  - `new Archive(file)` : lève CorruptHeaderException, BadRarArchiveException, UnsupportedRarVersionException,
//    WrongPasswordException (RAR5 à en-têtes chiffrés) comme junrar ; les autres erreurs de lecture d'en-têtes sont
//    journalisées par junrar et les en-têtes déjà lus sont conservés ;
//  - `isPasswordProtected` : en-têtes chiffrés ou au moins une entrée chiffrée ; MainHeaderNullException sans en-tête
//    principal (RAR 1.5-4.x) ;
//  - `mainHeader` : null en RAR5 (junrar ne le renseigne pas) ;
//  - `getInputStream(header)` : junrar extrait dans un thread et ignore les erreurs : flux vide pour un en-tête au CRC
//    faux, des données tronquées ou une entrée commencée dans un volume précédent, sinon les octets produits.
// Lecture de l'archive à la demande (fs.readSync), jamais en entier en mémoire ; les extractions successives dans une
// même archive continuent la passe en cours au lieu de repartir du début (archives solides), comme junrar.
// PORT: les archives RAR 1.4 (signature RE~^) sont listées par unrar.
// Vérifié contre la vraie bibliothèque (jshell) : test/infrastructure/mediacontainer/divina/DivinaExtractorOracle.test.ts.
import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs'
import { crc32 } from 'node:zlib'
import { Extractor } from 'node-unrar-js/dist/js/Extractor.js'
import { getUnrar } from 'node-unrar-js/dist/js/unrar.singleton.js'
import { Exception } from './kotlin.js'
import { ByteArrayInputStream, EOFException, IOException, InputStream } from './java-io.js'
import { KotlinLogging } from './logging.js'

const logger = KotlinLogging.logger('com.github.junrar.Archive')

// PORT: async imposé par l'instanciation du module WebAssembly, faite une seule fois au chargement du module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unrar: any = await getUnrar()

export class RarException extends Exception {}
export class WrongPasswordException extends RarException {}
export class CorruptHeaderException extends RarException {}
export class BadRarArchiveException extends RarException {}
export class UnsupportedRarVersionException extends RarException {}
export class NotRarArchiveException extends RarException {}
export class MainHeaderNullException extends RarException {}
export class InitDeciphererFailedException extends RarException {}

const MHD_VOLUME = 0x0001
const MHD_PASSWORD = 0x0080
const MHD_ENCRYPTVER = 0x0200
const LHD_PASSWORD = 0x0004
const LHD_COMMENT = 0x0008
const LHD_WINDOWMASK = 0x00e0
const LHD_DIRECTORY = 0x00e0
const LHD_LARGE = 0x0100
const LHD_UNICODE = 0x0200
const LHD_SPLIT_BEFORE = 0x0001
const EARC_DATACRC = 0x0002
const EARC_VOLNUMBER = 0x0008
const MAX_HEADER_SIZE = 20971520
const MAXSFXSIZE = 0x400000
const MAX_HEADER_SIZE_RAR5 = 0x200000

export class MainHeader {
  constructor(readonly flags: number) {}

  get isMultiVolume(): boolean {
    return (this.flags & MHD_VOLUME) !== 0
  }

  get isEncrypted(): boolean {
    return (this.flags & MHD_PASSWORD) !== 0
  }
}

export class FileHeader {
  /** position de l'en-tête, taille de l'en-tête, taille des données compressées */
  positionInFile = 0
  headerSize = 0
  fullPackSize = 0
  brokenHeader = false
  splitBefore = false
  /** entrée de fichier (et non en-tête de service NewSubHeader) */
  isFileHeader = true
  /** position après les champs lus (FileHeader.getParsedLength) */
  parsedLength = 0

  constructor(
    readonly fileName: string,
    readonly isDirectory: boolean,
    readonly isEncrypted: boolean,
    readonly fullUnpackSize: number,
  ) {}
}

// ---------------------------------------------------------------------------
// Lecture des en-têtes
// ---------------------------------------------------------------------------

class Channel {
  pos = 0
  readonly length: number

  constructor(readonly fd: number) {
    this.length = fstatSync(fd).size
  }

  /** `fill` : lit au plus `len` octets */
  fill(len: number): Uint8Array {
    const b = new Uint8Array(Math.max(0, len))
    let n = 0
    while (n < len) {
      const r = readSync(this.fd, b, n, len - n, this.pos + n)
      if (r <= 0) break
      n += r
    }
    this.pos += n
    return n < len ? b.slice(0, n) : b
  }

  /** `readFully` (RandomAccessFile) : EOFException si incomplet */
  readFully(len: number): Uint8Array {
    const b = this.fill(len)
    if (b.length < len) throw new EOFException()
    return b
  }
}

function u16(b: Uint8Array, o: number): number {
  return (b[o] as number) | ((b[o + 1] as number) << 8)
}

function i16(b: Uint8Array, o: number): number {
  return (u16(b, o) << 16) >> 16
}

function u32(b: Uint8Array, o: number): number {
  return ((b[o] as number) | ((b[o + 1] as number) << 8) | ((b[o + 2] as number) << 16)) + (b[o + 3] as number) * 0x1000000
}

function concatBytes(...segments: Uint8Array[]): Uint8Array {
  return concat(segments)
}

/** `RarCRC.computeHeaderCrc16(header, 2, coverage - 2)` comparé à HEAD_CRC */
function headerCrcMatches(headCrc: number, header: Uint8Array, coverage = header.length): boolean {
  return (crc32(header.subarray(2, coverage)) & 0xffff) === headCrc
}

/** `decodeNarrowName` : ASCII, sinon UTF-8 strict, sinon ISO-8859-1 */
function decodeNarrowName(bytes: Uint8Array, offset: number, length: number): string {
  const sub = bytes.subarray(offset, offset + length)
  if (sub.every((b) => b < 0x80)) return Buffer.from(sub).toString('latin1')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(sub)
  } catch {
    return Buffer.from(sub).toString('latin1')
  }
}

/** `FileNameDecoder.decode` */
function decodeUnicodeName(name: Uint8Array, nameSize: number, encPos: number): string {
  let decPos = 0
  let flags = 0
  let flagBits = 0
  const get = (p: number): number => name[p] as number
  const truncated = (): CorruptHeaderException => new CorruptHeaderException('Truncated encoded file name')
  const highByte = encPos < name.length ? get(encPos++) : 0
  let buf = ''
  while (encPos < name.length) {
    if (flagBits === 0) {
      flags = get(encPos++)
      flagBits = 8
    }
    switch (flags >>> 6) {
      case 0:
        if (encPos >= name.length) throw truncated()
        buf += String.fromCharCode(get(encPos++))
        ++decPos
        break
      case 1:
        if (encPos >= name.length) throw truncated()
        buf += String.fromCharCode((get(encPos++) + (highByte << 8)) & 0xffff)
        ++decPos
        break
      case 2: {
        if (encPos + 1 >= name.length) throw truncated()
        const low = get(encPos)
        const high = get(encPos + 1)
        buf += String.fromCharCode(((high << 8) + low) & 0xffff)
        ++decPos
        encPos += 2
        break
      }
      case 3: {
        if (encPos >= name.length) throw truncated()
        let length = get(encPos++)
        if ((length & 0x80) !== 0) {
          if (encPos >= name.length) throw truncated()
          const correction = get(encPos++)
          for (length = (length & 0x7f) + 2; length > 0 && decPos < nameSize; length--, decPos++) {
            const low = (get(decPos) + correction) & 0xff
            buf += String.fromCharCode(((highByte << 8) + low) & 0xffff)
          }
        } else {
          for (length += 2; length > 0 && decPos < nameSize; length--, decPos++) buf += String.fromCharCode(get(decPos))
        }
        break
      }
    }
    flags = (flags << 2) & 0xff
    flagBits -= 2
  }
  return buf
}

/** `new FileHeader(blockHead, fileHeaderBuffer)` (RAR 1.5-4.x) */
function parseFileHeader(type: number, flags: number, packSize: number, fh: Uint8Array): FileHeader {
  const at = (i: number): number => {
    if (i >= fh.length) throw new RangeError('ArrayIndexOutOfBoundsException')
    return fh[i] as number
  }
  at(20)
  const unpSize = u32(fh, 0)
  let nameSize = i16(fh, 15)
  let position = 21
  let highPackSize = 0
  let highUnpackSize = 0
  if ((flags & LHD_LARGE) !== 0) {
    at(position + 7)
    highPackSize = u32(fh, position)
    position += 4
    highUnpackSize = u32(fh, position)
    position += 4
  } else if (unpSize === 0xffffffff) {
    highUnpackSize = 0x7fffffff
  }
  const fullPackSize = highPackSize * 0x100000000 + packSize
  const fullUnpackSize = highUnpackSize * 0x100000000 + unpSize
  nameSize = nameSize > 4 * 1024 ? 4 * 1024 : nameSize
  if (nameSize <= 0) throw new CorruptHeaderException('Invalid file name with negative size')
  at(position + nameSize - 1)
  const fileNameBytes = fh.slice(position, position + nameSize)
  let fileName = ''
  let fileNameW = ''
  const isFileHeader = type === 0x74
  if (isFileHeader) {
    if ((flags & LHD_UNICODE) !== 0) {
      let length = 0
      while (length < fileNameBytes.length && fileNameBytes[length] !== 0) length++
      fileName = decodeNarrowName(fileNameBytes, 0, length)
      if (length !== nameSize) {
        const ansiNameLen = length
        length++
        fileNameW = decodeUnicodeName(fileNameBytes, ansiNameLen, length)
      } else {
        fileNameW = decodeNarrowName(fileNameBytes, 0, nameSize)
      }
    } else {
      fileName = decodeNarrowName(fileNameBytes, 0, nameSize)
    }
    const name = (flags & LHD_UNICODE) !== 0 && fileNameW !== '' ? fileNameW : fileName
    // isFilenameValid : File.getCanonicalPath échoue sur un caractère NUL
    if (name.includes('\0')) throw new CorruptHeaderException(`Invalid filename: ${name}`)
  }
  const name = (flags & LHD_UNICODE) !== 0 && fileNameW !== '' ? fileNameW : fileName
  const h = new FileHeader(name, (flags & LHD_WINDOWMASK) === LHD_DIRECTORY, (flags & LHD_PASSWORD) !== 0, fullUnpackSize)
  h.fullPackSize = fullPackSize
  h.isFileHeader = isFileHeader
  h.splitBefore = (flags & LHD_SPLIT_BEFORE) !== 0
  // PORT: temps étendus (LHD_EXTTIME) non décodés : seule la couverture du CRC étroit en dépend
  h.parsedLength = position + nameSize + ((flags & 0x0400) !== 0 ? 8 : 0)
  return h
}

type ReadResult = { headers: FileHeader[]; mainHeader: MainHeader | null; rar5: boolean; rar5HeadersEncrypted: boolean; rar14: boolean }

const SIG_NONE = 0
const SIG_RAR14 = 1
const SIG_RAR15 = 2
const SIG_RAR50 = 3
const SIG_FUTURE = 4

function signatureType(d: Uint8Array, off: number, len: number): number {
  if (len < 1 || d[off] !== 0x52) return SIG_NONE
  if (len >= 4 && d[off + 1] === 0x45 && d[off + 2] === 0x7e && d[off + 3] === 0x5e) return SIG_RAR14
  if (len >= 7 && d[off + 1] === 0x61 && d[off + 2] === 0x72 && d[off + 3] === 0x21 && d[off + 4] === 0x1a && d[off + 5] === 0x07) {
    const version = d[off + 6] as number
    if (version === 0) return SIG_RAR15
    if (version === 1) return SIG_RAR50
    if (version > 1 && version < 5) return SIG_FUTURE
  }
  return SIG_NONE
}

function detectFormatAndSeek(ch: Channel): number {
  ch.pos = 0
  const head = ch.fill(7)
  const type0 = signatureType(head, 0, head.length)
  const toFormat = (t: number): number => {
    if (t === SIG_FUTURE) throw new UnsupportedRarVersionException()
    return t
  }
  if (type0 !== SIG_NONE) {
    ch.pos = 0
    return toFormat(type0)
  }
  const scanLen = Math.min(Math.max(ch.length - 1, 0), MAXSFXSIZE)
  ch.pos = 1
  const buffer = ch.fill(scanLen)
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] !== 0x52) continue
    const type = signatureType(buffer, i, buffer.length - i)
    if (type === SIG_NONE) continue
    if (type === SIG_RAR14 && !(i === 0 || buffer.length <= 31 || (buffer[27] === 0x52 && buffer[28] === 0x53 && buffer[29] === 0x46 && buffer[30] === 0x58))) continue
    ch.pos = 1 + i
    return toFormat(type)
  }
  throw new BadRarArchiveException()
}

function safelyAllocate(len: number, max: number): number {
  if (len < 0 || len > max) throw new BadRarArchiveException()
  return len
}

/** `Archive.readHeaders` (RAR 1.5-4.x) */
function readHeaders15(ch: Channel, res: ReadResult): void {
  const processed = new Set<number>()
  for (;;) {
    if (res.mainHeader !== null && res.mainHeader.isEncrypted) {
      ch.readFully(8)
      // pas de mot de passe : buildDecipherer échoue
      throw new InitDeciphererFailedException('password should be specified')
    }
    const position = ch.pos
    if (position >= ch.length) break
    const base = ch.readFully(7)
    const headCrc = u16(base, 0)
    const type = base[2] as number
    const flags = u16(base, 3)
    const headerSize = u16(base, 5)
    if (type < 0x72 || type > 0x7b) {
      logger.warn(() => 'unknown block header!')
      throw new CorruptHeaderException()
    }
    const encrypted = res.mainHeader !== null && res.mainHeader.isEncrypted
    const hs = encrypted ? headerSize + ((~headerSize + 1) & 0xf) : headerSize
    switch (type) {
      case 0x72: {
        if (!(base[0] === 0x52 && ((base[1] === 0x45 && base[2] === 0x7e && base[3] === 0x5e) || (base[1] === 0x61 && base[2] === 0x72 && base[3] === 0x21 && base[4] === 0x1a && base[5] === 0x07))))
          throw new BadRarArchiveException()
        if (!(headCrc === 0x6152 && flags === 0x1a21 && headerSize === 7)) throw new CorruptHeaderException('Invalid Mark Header')
        break
      }
      case 0x73: {
        const main = ch.readFully(safelyAllocate((flags & MHD_ENCRYPTVER) !== 0 ? 7 : 6, MAX_HEADER_SIZE))
        void headerCrcMatches(headCrc, concatBytes(base, main))
        res.mainHeader = new MainHeader(flags)
        break
      }
      case 0x79:
        ch.readFully(8)
        break
      case 0x76:
        ch.readFully(7)
        break
      case 0x75: {
        ch.readFully(6)
        const newpos = position + hs
        ch.pos = newpos
        if (processed.has(newpos)) throw new BadRarArchiveException()
        processed.add(newpos)
        break
      }
      case 0x7b: {
        let toRead = 0
        if ((flags & EARC_DATACRC) !== 0) toRead += 4
        if ((flags & EARC_VOLNUMBER) !== 0) toRead += 2
        if (toRead > 0) ch.readFully(toRead)
        const valid = headCrc === 0x3dc4 && flags === 0x4000 && headerSize === 7
        if (!(res.mainHeader as MainHeader).isMultiVolume && !valid) throw new CorruptHeaderException('Invalid End Archive Header')
        return
      }
      default: {
        const block = ch.readFully(4)
        const packSize = u32(block, 0)
        switch (type) {
          case 0x7a:
          case 0x74: {
            const toRead = safelyAllocate(headerSize - 7 - 4, MAX_HEADER_SIZE)
            let fhBuf: Uint8Array
            try {
              fhBuf = ch.readFully(toRead)
            } catch (e) {
              if (e instanceof EOFException) throw new CorruptHeaderException('Unexpected end of file')
              throw e
            }
            const fh = parseFileHeader(type, flags, packSize, fhBuf)
            const header = concatBytes(base, block, fhBuf)
            // en-tête avec commentaire (LHD_COMMENT) : couverture étroite puis complète
            const ok = headerCrcMatches(headCrc, header)
            if (!ok) {
              fh.brokenHeader = true
              logger.warn(() => `Header CRC mismatch for ${type === 0x74 ? 'FileHeader' : 'NewSubHeader'} at position ${position}`)
            }
            if (fh.isFileHeader && (flags & LHD_COMMENT) !== 0 && !headerCrcMatches(headCrc, header, 7 + 4 + Math.min(fh.parsedLength, fhBuf.length))) fh.brokenHeader = true
            fh.positionInFile = position
            fh.headerSize = hs
            res.headers.push(fh)
            const newpos = position + hs + fh.fullPackSize
            ch.pos = newpos
            if (processed.has(newpos)) throw new BadRarArchiveException()
            processed.add(newpos)
            break
          }
          case 0x78: {
            ch.readFully(safelyAllocate(headerSize - 7 - 4, MAX_HEADER_SIZE))
            const newpos = position + hs + packSize
            ch.pos = newpos
            if (processed.has(newpos)) throw new BadRarArchiveException()
            processed.add(newpos)
            break
          }
          case 0x77: {
            ch.readFully(3)
            const newpos = position + hs + packSize
            ch.pos = newpos
            if (processed.has(newpos)) throw new BadRarArchiveException()
            processed.add(newpos)
            break
          }
          default:
            logger.warn(() => 'Unknown Header')
            throw new NotRarArchiveException()
        }
      }
    }
  }
}

/** `VInt.read` */
class VInt {
  constructor(
    private readonly data: Uint8Array,
    public pos: number,
  ) {}

  read(): number {
    let result = 0
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.data.length) throw new CorruptHeaderException('Truncated variable-length integer')
      const b = this.data[this.pos++] as number
      result += (b & 0x7f) * 2 ** (i * 7)
      if ((b & 0x80) === 0) return result
    }
    throw new CorruptHeaderException('Variable-length integer exceeds 10 bytes')
  }
}

/** `Archive.readHeadersRar5` + `Rar5BaseBlock.parse` + `Rar5FileHeaderReader.read` (champs utiles à Komga) */
function readHeadersRar5(ch: Channel, res: ReadResult): void {
  const marker = ch.fill(8)
  if (marker.length < 8 || signatureType(marker, 0, 8) !== SIG_RAR50) throw new CorruptHeaderException('Invalid RAR5 marker')
  const processed = new Set<number>()
  let crypto = false
  for (;;) {
    const position = ch.pos
    if (position >= ch.length) break
    if (crypto) throw new WrongPasswordException('Missing password for header-encrypted RAR5 archive')
    const first = ch.fill(7)
    if (first.length === 0) break
    if (first.length < 7) throw new CorruptHeaderException('Truncated RAR5 block header')
    // Rar5BaseBlock.checkHeaderSize
    const sizeReader = new VInt(first, 4)
    const blockSize = sizeReader.read()
    const sizeBytes = sizeReader.pos - 4
    if (sizeBytes > 3) throw new CorruptHeaderException('RAR5 header size field exceeds 3 vint bytes')
    if (blockSize === 0) throw new CorruptHeaderException('RAR5 block size is zero')
    const headerSize = 4 + sizeBytes + blockSize
    if (headerSize < 7) throw new CorruptHeaderException('RAR5 header smaller than the minimum block size')
    if (headerSize > MAX_HEADER_SIZE_RAR5) throw new CorruptHeaderException('RAR5 header exceeds the 2 MB maximum')
    const rest = ch.fill(headerSize - 7)
    if (rest.length < headerSize - 7) throw new CorruptHeaderException('Truncated RAR5 header body')
    const header = concatBytes(first, rest)
    // Rar5BaseBlock.parse
    const broken = u32(header, 0) !== crc32(header.subarray(4)) >>> 0
    const r = new VInt(header, 4)
    r.read()
    const typeValue = r.read()
    const flags = r.read()
    if ((typeValue < 1 || typeValue > 5) && (flags & 0x0004) === 0) throw new CorruptHeaderException(`Unknown non-skippable RAR5 block type: ${typeValue}`)
    let extraSize = 0
    if ((flags & 0x0001) !== 0) {
      extraSize = r.read()
      if (extraSize >= header.length) throw new CorruptHeaderException('RAR5 ExtraSize >= HeaderSize')
    }
    let dataSize = 0
    if ((flags & 0x0002) !== 0) dataSize = r.read()
    const fieldsOffset = r.pos
    if (typeValue === 1 || typeValue === 4 || typeValue === 5) {
      // Rar5MainHeader.from
      if (typeValue === 1) {
        const m = new VInt(header, fieldsOffset)
        const archiveFlags = m.read()
        if ((archiveFlags & 0x0002) !== 0) m.read()
      }
    } else if (typeValue === 2 || typeValue === 3) {
      const fh = readRar5FileHeader(header, typeValue === 3, fieldsOffset, extraSize, dataSize, flags)
      fh.brokenHeader = broken
      fh.positionInFile = position
      fh.headerSize = headerSize
      res.headers.push(fh)
    }
    if (typeValue === 4) {
      crypto = true
      res.rar5HeadersEncrypted = true
    }
    const newpos = position + headerSize + dataSize
    if (newpos <= position) throw new CorruptHeaderException('RAR5 block does not advance (corrupt DataSize)')
    ch.pos = newpos
    if (processed.has(newpos)) throw new BadRarArchiveException()
    processed.add(newpos)
    if (typeValue === 5) break
  }
}

function readRar5FileHeader(header: Uint8Array, service: boolean, fieldsOffset: number, extraSize: number, dataSize: number, blockFlags: number): FileHeader {
  let v = new VInt(header, fieldsOffset)
  const fileFlags = v.read()
  const directory = (fileFlags & 0x0001) !== 0
  const rawUnpSize = v.read()
  const unknownUnpSize = (fileFlags & 0x0008) !== 0
  const unpSize = unknownUnpSize ? -1 : rawUnpSize
  v.read() // attributes
  let pos = v.pos
  const requireBytes = (len: number): void => {
    if (pos + len > header.length) throw new CorruptHeaderException('Truncated RAR5 file header')
  }
  if ((fileFlags & 0x0002) !== 0) {
    requireBytes(4)
    pos += 4
  }
  if ((fileFlags & 0x0004) !== 0) {
    requireBytes(4)
    pos += 4
  }
  v = new VInt(header, pos)
  v.read() // compression info
  v.read() // host OS
  const nameSize = v.read()
  pos = v.pos
  if (nameSize <= 0) throw new CorruptHeaderException('RAR5 file header has non-positive name size')
  if (nameSize > 4 * 1024 || pos + nameSize > header.length) throw new CorruptHeaderException('RAR5 file name size out of bounds')
  let fileName = new TextDecoder('utf-8').decode(header.subarray(pos, pos + nameSize))
  let encrypted = false
  let fileVersion = 0
  if (extraSize !== 0) {
    const headerSize = header.length
    let p = headerSize - extraSize
    while (headerSize - p >= 2) {
      const sizeReader = new VInt(header, p)
      const fieldSize = sizeReader.read()
      const afterSize = sizeReader.pos
      if (fieldSize <= 0 || fieldSize > headerSize - afterSize) break
      const nextPos = afterSize + fieldSize
      const typeReader = new VInt(header, afterSize)
      const fieldType = typeReader.read()
      const start = typeReader.pos
      if (start > nextPos) break
      if (fieldType === 1) {
        // parseCrypt
        const c = new VInt(header, start)
        if (c.read() === 0) {
          c.read()
          let q = c.pos
          if (q < nextPos) {
            q++
            if (q + 32 <= nextPos) encrypted = true
          }
        }
      } else if (fieldType === 4) {
        // parseVersion
        if (nextPos - start >= 1) {
          const c = new VInt(header, start)
          c.read()
          if (c.pos < nextPos) {
            const version = c.read()
            if (version !== 0) fileVersion = version
          }
        }
      }
      p = nextPos
    }
  }
  if (fileVersion !== 0) fileName = `${fileName};${fileVersion}`
  const fh = new FileHeader(fileName, directory, encrypted, unpSize)
  fh.fullPackSize = dataSize
  fh.isFileHeader = !service
  fh.splitBefore = (blockFlags & 0x0008) !== 0
  return fh
}

/** `Archive.setChannel` : exceptions relancées ou journalisées comme junrar */
function readHeaders(ch: Channel): ReadResult {
  const res: ReadResult = { headers: [], mainHeader: null, rar5: false, rar5HeadersEncrypted: false, rar14: false }
  try {
    const format = detectFormatAndSeek(ch)
    if (format === SIG_RAR50) {
      res.rar5 = true
      readHeadersRar5(ch, res)
    } else if (format === SIG_RAR14) {
      res.rar14 = true
    } else {
      readHeaders15(ch, res)
    }
  } catch (e) {
    if (e instanceof CorruptHeaderException || e instanceof BadRarArchiveException || e instanceof WrongPasswordException || e instanceof UnsupportedRarVersionException) {
      logger.warn(e, () => 'exception in archive constructor maybe file is encrypted, corrupt or support not yet implemented')
      throw e
    }
    logger.warn(e as Error, () => 'exception in archive constructor maybe file is encrypted, corrupt or support not yet implemented')
  }
  return res
}

// ---------------------------------------------------------------------------
// Extraction (node-unrar-js)
// ---------------------------------------------------------------------------

type UnrarFileHeader = { name: string; flags: { encrypted: boolean; solid: boolean; directory: boolean }; unpSize: number }

/** Extracteur node-unrar-js : archive lue sur disque, fichiers extraits en mémoire */
class FileExtractor extends (Extractor as unknown as new (unrar: unknown, password?: string) => object) {
  protected _filePath: string
  private readonly files = new Map<number, { fd: number | null; size: number; pos: number; chunks: Uint8Array[] }>()
  private nextFd = 1_000_000
  /** données de l'entrée en cours d'extraction */
  current: Uint8Array[] = []

  constructor(path: string) {
    super(unrar, '')
    this._filePath = path
  }

  protected open(filename: string): number {
    // PORT: seul le volume demandé est ouvert (pas de volume suivant, comme junrar sur un fichier seul)
    if (filename !== this._filePath) return 0
    const fd = openSync(filename, 'r')
    this.files.set(fd, { fd, size: fstatSync(fd).size, pos: 0, chunks: [] })
    return fd
  }

  protected create(_filename: string): number {
    const fd = this.nextFd++
    this.current = []
    this.files.set(fd, { fd: null, size: 0, pos: 0, chunks: this.current })
    return fd
  }

  protected closeFile(fd: number): void {
    const f = this.files.get(fd)
    this.files.delete(fd)
    if (f && f.fd !== null) closeSync(f.fd)
  }

  protected read(fd: number, buf: number, size: number): number {
    const f = this.files.get(fd)
    if (!f || f.fd === null) return -1
    const n = readSync(f.fd, unrar.HEAPU8 as Uint8Array, buf, Math.max(0, Math.min(size, f.size - f.pos)), f.pos)
    f.pos += n
    return n
  }

  protected write(fd: number, buf: number, size: number): boolean {
    const f = this.files.get(fd)
    if (!f) return false
    f.chunks.push((unrar.HEAPU8 as Uint8Array).slice(buf, buf + size))
    f.pos += size
    f.size += size
    return true
  }

  protected tell(fd: number): number {
    return this.files.get(fd)?.pos ?? 0
  }

  protected seek(fd: number, pos: number, method: 'CUR' | 'SET' | 'END'): boolean {
    const f = this.files.get(fd)
    if (!f) return false
    let newPos = f.pos
    if (method === 'SET') newPos = 0
    else if (method === 'END') newPos = f.size
    newPos += pos
    if (newPos < 0 || newPos > f.size) return false
    f.pos = newPos
    return true
  }

  /** fermeture de l'archive wasm (passe interrompue) */
  abort(): void {
    const self = this as unknown as { _archive: { delete(): void } | null }
    if (self._archive) {
      self._archive.delete()
      self._archive = null
    }
    for (const fd of [...this.files.keys()]) this.closeFile(fd)
  }

  list(): UnrarFileHeader[] {
    const out: UnrarFileHeader[] = []
    unrar.extractor = this
    try {
      const l = (this as unknown as { getFileList(): { fileHeaders: Generator<UnrarFileHeader> } }).getFileList()
      for (const h of l.fileHeaders) out.push(h)
    } catch {
      // en-têtes lus avant l'erreur
    }
    return out
  }
}

type Session = { gen: Generator<unknown>; headerIndex: number; target: number; done: boolean }

export class Archive {
  private readonly headers: FileHeader[]
  private readonly newMhd: MainHeader | null
  private readonly rar5: boolean
  private readonly rar5HeadersEncrypted: boolean
  private readonly extractor: FileExtractor
  private readonly file: string
  private unrarHeaders: UnrarFileHeader[] | null = null
  private session: Session | null = null

  constructor(file: string) {
    this.file = file
    const ch = new Channel(openSync(file, 'r'))
    let res: ReadResult
    try {
      res = readHeaders(ch)
    } finally {
      closeSync(ch.fd)
    }
    this.extractor = new FileExtractor(file)
    this.rar5 = res.rar5
    this.rar5HeadersEncrypted = res.rar5HeadersEncrypted
    this.newMhd = res.mainHeader
    if (res.rar14) {
      // PORT: RAR 1.4 listé par unrar
      this.unrarHeaders = this.extractor.list()
      this.newMhd = new MainHeader(0)
      this.headers = this.unrarHeaders.map((h) => {
        const fh = new FileHeader(h.name.replace(/\//g, '\\'), h.flags.directory, h.flags.encrypted, h.unpSize)
        fh.fullPackSize = 0
        return fh
      })
    } else this.headers = res.headers
  }

  /** `isEncrypted()` */
  private isEncrypted(): boolean {
    if (this.rar5) return this.rar5HeadersEncrypted
    if (this.newMhd !== null) return this.newMhd.isEncrypted
    throw new MainHeaderNullException()
  }

  get isPasswordProtected(): boolean {
    if (this.isEncrypted()) return true
    return this.getFileHeaders().some((it) => it.isEncrypted)
  }

  get mainHeader(): MainHeader | null {
    return this.newMhd
  }

  get fileHeaders(): FileHeader[] {
    return this.getFileHeaders()
  }

  private getFileHeaders(): FileHeader[] {
    return this.headers.filter((it) => it.isFileHeader)
  }

  /** Extrait l'entrée ; junrar ignore les erreurs d'extraction : flux vide ou tronqué */
  getInputStream(hd: FileHeader | null | undefined): InputStream {
    if (hd === null || hd === undefined) throw new IOException('Cannot invoke "com.github.junrar.rarfile.FileHeader.getFullUnpackSize()" because "hd" is null')
    if (hd.fullUnpackSize <= 0) return new ByteArrayInputStream(new Uint8Array(0))
    return new ByteArrayInputStream(this.extractFile(hd))
  }

  private extractFile(hd: FileHeader): Uint8Array {
    const fileHeaders = this.getFileHeaders()
    const targetIdx = fileHeaders.indexOf(hd)
    if (targetIdx < 0) return new Uint8Array(0)
    // doExtractFile : en-tête cassé, entrée commencée dans un volume précédent
    if (hd.brokenHeader || hd.splitBefore) return new Uint8Array(0)
    // données tronquées : junrar ne produit rien
    const length = statSync(this.file).size
    if (hd.positionInFile + hd.headerSize + hd.fullPackSize > length && hd.fullPackSize > 0) return new Uint8Array(0)
    if (this.unrarHeaders === null) this.unrarHeaders = this.extractor.list()
    // correspondance par rang parmi les entrées de fichier (unrar ne liste pas les en-têtes de service)
    if (this.unrarHeaders[targetIdx] === undefined) return new Uint8Array(0)
    return this.extract(targetIdx)
  }

  private startSession(): Session {
    const session: Session = { gen: undefined as unknown as Generator<unknown>, headerIndex: 0, target: -1, done: false }
    unrar.extractor = this.extractor
    const res = (this.extractor as unknown as { extract(o: { files: (h: UnrarFileHeader) => boolean }): { files: Generator<unknown> } }).extract({
      files: () => session.headerIndex++ === session.target,
    })
    session.gen = res.files
    return session
  }

  private extract(index: number): Uint8Array {
    try {
      if (this.session === null || this.session.done || this.session.headerIndex > index) {
        this.abortSession()
        this.session = this.startSession()
      }
      const s = this.session
      s.target = index
      this.extractor.current = []
      unrar.extractor = this.extractor
      for (;;) {
        const r = s.gen.next()
        if (r.done) {
          s.done = true
          break
        }
        if (s.headerIndex - 1 === index) break
      }
      return concat(this.extractor.current)
    } catch {
      // junrar : erreur ignorée, flux tronqué
      if (this.session) this.session.done = true
      return concat(this.extractor.current)
    }
  }

  private abortSession(): void {
    if (this.session !== null && !this.session.done) this.extractor.abort()
    this.session = null
  }

  close(): void {
    this.abortSession()
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let len = 0
  for (const c of chunks) len += c.length
  const out = new Uint8Array(len)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}
