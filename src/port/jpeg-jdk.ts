// Support de portage : lecture et écriture JPEG identiques, octet pour octet, à celles de Komga sur la JVM.
// Ce fichier n'a pas de jumeau Kotlin.
//
// Sur la JVM, `ImageIO.read` d'un JPEG passe par le lecteur TwelveMonkeys (imageio-jpeg), qui délègue le décodage au
// lecteur du JDK (libjavajpeg = IJG libjpeg 6b) et fait lui-même certaines conversions de couleurs (profils ICC via
// LittleCMS, CMYK, YCCK) ; `ImageIO.write(…, "jpeg", …)` passe par l'écrivain TwelveMonkeys qui délègue à l'écrivain du
// JDK (libjpeg 6b, paramètres et métadonnées par défaut). Les octets écrits entrent dans le hachage des pages
// (BookAnalyzer.hashPage) : ils doivent être identiques.
//
// Ici : le décodage et l'encodage sont faits par la même libjpeg 6b et le même LittleCMS (2.19) que le JDK 21, compilés
// dans build/komgajpeg.node (native/komga_jpeg.c, `npm run build:native`) ; la logique Java (choix du chemin de lecture,
// flux filtré vu par le lecteur du JDK, conversions de TwelveMonkeys, métadonnées de l'écrivain) est reproduite ci-dessous.
// Cas non reproduits (null : l'appelant garde son décodeur) : JPEG sans perte (SOF3), profil ICC CMYK incompatible avec
// les composantes (ColorConvertOp sur l'espace CMYK non ICC de TwelveMonkeys), profil ICC sur une image avec alpha.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IIOException } from './imageio.js'

type Native = {
  jpegHeader(bytes: Uint8Array): { tablesOnly: boolean; width: number; height: number; jpegColorSpace: number; outColorSpace: number; numComponents: number; progressive: boolean }
  jpegDecode(bytes: Uint8Array, outColorSpace: number): { width: number; height: number; components: number; data: Uint8Array }
  jpegEncode(
    pixels: Uint8Array,
    width: number,
    height: number,
    components: number,
    inCs: number,
    outCs: number,
    qtables: Int32Array,
    ids: Int32Array,
    hSamp: Int32Array,
    vSamp: Int32Array,
    qSel: Int32Array,
    markers: Uint8Array,
    restartInterval: number,
  ): Uint8Array
  iccSave(profile: Uint8Array, srgb?: Uint8Array): Uint8Array
  iccTransform(src: Uint8Array, dst: Uint8Array, intent: number, inFormat: number, outFormat: number, pixels: Uint8Array, width: number, height: number, inStride: number, outStride: number): Uint8Array
}

const here = dirname(fileURLToPath(import.meta.url))

function findFile(rel: string): string | null {
  for (const p of [join(here, '../..', rel), join(here, '../../..', rel), join(process.cwd(), rel)]) if (existsSync(p)) return p
  return null
}

let nativeModule: Native | null = null
function native(): Native {
  if (nativeModule === null) {
    const p = findFile('build/komgajpeg.node')
    if (p === null) throw new Error('build/komgajpeg.node introuvable : lancer `npm run build:native`')
    nativeModule = createRequire(import.meta.url)(p) as Native
  }
  return nativeModule
}

// J_COLOR_SPACE de libjpeg (4 : CMYK, 5 : YCCK)
const JCS_UNKNOWN = 0
const JCS_GRAYSCALE = 1
const JCS_RGB = 2
const JCS_YCbCr = 3

/** Exception de la bibliothèque native (message de libjpeg) -> IIOException */
function nativeCall<T>(f: () => T): T {
  try {
    return f()
  } catch (e) {
    if (e instanceof IIOException) throw e
    throw new IIOException((e as Error).message, e)
  }
}

// ---------------------------------------------------------------------------
// Profils ICC (java.awt.color.ICC_Profile sur LittleCMS, com.twelvemonkeys.imageio.color.ColorProfiles)
// ---------------------------------------------------------------------------

type StandardProfile = 'sRGB' | 'GRAY' | 'LINEAR_RGB'

/** ICC_Profile : octets donnés à LittleCMS (cmsOpenProfileFromMem) et, pour les profils du JDK, leur nom */
class IccProfile {
  constructor(
    readonly raw: Uint8Array,
    readonly standard: StandardProfile | null = null,
    public savedCache: Uint8Array | null = null,
  ) {}

  /** getData() : profil réécrit par LittleCMS (cmsSaveProfileToMem) */
  getData(): Uint8Array {
    this.savedCache ??= native().iccSave(this.raw)
    return this.savedCache
  }

  private headerSig(offset: number): string {
    const d = this.getData()
    return String.fromCharCode(d[offset]!, d[offset + 1]!, d[offset + 2]!, d[offset + 3]!)
  }

  /** getProfileClass() : 'scnr', 'mntr', 'prtr'... */
  profileClass(): string {
    return this.headerSig(12)
  }

  colorSpaceSig(): string {
    return this.headerSig(16)
  }

  getNumComponents(): number {
    return numComponentsOf(this.colorSpaceSig())
  }
}

function numComponentsOf(sig: string): number {
  switch (sig) {
    case 'GRAY':
      return 1
    case 'CMYK':
      return 4
    case '2CLR':
      return 2
    case '4CLR':
      return 4
    case '5CLR':
      return 5
    case '6CLR':
      return 6
    case '7CLR':
      return 7
    case '8CLR':
      return 8
    case '9CLR':
      return 9
    case 'ACLR':
      return 10
    case 'BCLR':
      return 11
    case 'CCLR':
      return 12
    case 'DCLR':
      return 13
    case 'ECLR':
      return 14
    case 'FCLR':
      return 15
    default:
      return 3
  }
}

const standardProfiles = new Map<StandardProfile, IccProfile>()
/** ICC_Profile.getInstance(ColorSpace.CS_xxx) : profils du JDK (native/jdk-profiles, copiés de java.desktop) */
function standardProfile(name: StandardProfile): IccProfile {
  let p = standardProfiles.get(name)
  if (p === undefined) {
    const file = findFile(`native/jdk-profiles/${name}.pf`)
    if (file === null) throw new Error(`native/jdk-profiles/${name}.pf introuvable`)
    p = new IccProfile(new Uint8Array(readFileSync(file)), name)
    standardProfiles.set(name, p)
  }
  return p
}

/**
 * ColorProfiles.getProfileHeaderWithProfileId : en-tête sans CMM, plateforme, intention, créateur ni identifiant,
 * suivi d'un MD5 de tout le profil. Ici, clé de comparaison équivalente : en-tête nettoyé + reste des données.
 */
function headerKey(data: Uint8Array): string {
  const h = Uint8Array.from(data.subarray(0, 128))
  h.fill(0, 4, 8) // icHdrCmmId
  h.fill(0, 40, 44) // icHdrPlatform
  h.fill(0, 64, 68) // icHdrRenderingIntent
  h.fill(0, 80, 84) // icHdrCreator
  h.fill(0, 84, 100) // icHdrProfileID
  return Buffer.from(h).toString('latin1') + Buffer.from(data.buffer, data.byteOffset + 128, Math.max(0, data.length - 128)).toString('latin1')
}

let standardKeys: Map<string, StandardProfile> | null = null
/** ColorProfiles.getInternalProfile / ColorSpaces.getInternalCS : profil identique à un profil du JDK */
function internalProfileOf(data: Uint8Array): StandardProfile | null {
  if (standardKeys === null) {
    standardKeys = new Map()
    for (const name of ['sRGB', 'GRAY', 'LINEAR_RGB'] as const) standardKeys.set(headerKey(standardProfile(name).getData()), name)
  }
  if (data.length < 128) return null
  const found = standardKeys.get(headerKey(data))
  // l'en-tête comparé contient le type d'espace : RGB pour sRGB et LINEAR_RGB, GRAY pour GRAY
  return found ?? null
}

const PROFILE_CLASSES = new Set(['scnr', 'mntr', 'prtr', 'link', 'abst', 'spac', 'nmcl'])
const COLOR_SPACES = new Set(['XYZ ', 'Lab ', 'Luv ', 'YCbr', 'Yxy ', 'RGB ', 'GRAY', 'HSV ', 'HLS ', 'CMYK', 'CMY ', '2CLR', '3CLR', '4CLR', '5CLR', '6CLR', '7CLR', '8CLR', '9CLR', 'ACLR', 'BCLR', 'CCLR', 'DCLR', 'ECLR', 'FCLR'])

/** ICC_Profile.getInstance(byte[]) : ProfileDataVerifier.verify + verifyHeader (IllegalArgumentException) */
function verifyProfileData(data: Uint8Array): void {
  const int32 = (o: number): number => (data[o]! << 24) | (data[o + 1]! << 16) | (data[o + 2]! << 8) | data[o + 3]!
  const sig = (o: number): string => String.fromCharCode(data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!)
  if (data.length < 132) throw new Error('Invalid ICC Profile Data')
  const size = int32(0)
  const tagCount = int32(128)
  if (tagCount < 0 || tagCount > 100) throw new Error('Invalid ICC Profile Data')
  if (size < 132 + tagCount * 12 || size > data.length) throw new Error('Invalid ICC Profile Data')
  if (int32(36) !== 0x61637370) throw new Error('Invalid ICC Profile Data')
  for (let i = 0; i < tagCount; i++) {
    const offset = int32(132 + i * 12 + 4)
    const tagSize = int32(132 + i * 12 + 8)
    if (offset < 132 || offset > size) throw new Error('Invalid ICC Profile Data')
    if (tagSize < 0 || tagSize > 0x7fffffff - offset || tagSize + offset > size) throw new Error('Invalid ICC Profile Data')
  }
  if (!PROFILE_CLASSES.has(sig(12)) || !COLOR_SPACES.has(sig(16)) || !COLOR_SPACES.has(sig(20))) throw new Error('Invalid ICC Profile Data')
  const intent = (data[66]! << 8) | data[67]!
  if (intent > 3) throw new Error('Unknown Rendering Intent')
}

/**
 * Cache de ColorSpaces (LRUHashMap de 16 espaces, global à la JVM) : clé = en-tête avec identifiant du profil. Deux
 * profils qui ne diffèrent que par les champs ignorés de l'en-tête (CMM, plateforme, intention, créateur, identifiant)
 * partagent l'espace (et donc le profil) créé en premier. Reproduit ici pour le processus courant.
 */
const csCache = new Map<string, IccProfile>()
function cacheGet(key: string): IccProfile | undefined {
  const v = csCache.get(key)
  if (v !== undefined) {
    // ordre d'accès
    csCache.delete(key)
    csCache.set(key, v)
  }
  return v
}
function cachePut(key: string, value: IccProfile): void {
  csCache.delete(key)
  csCache.set(key, value)
  if (csCache.size > 16) csCache.delete(csCache.keys().next().value!)
}

/** ColorSpaces.createColorSpace(profile).getProfile() : profil du JDK, profil du cache, ou profil validé et mis en cache */
function createColorSpace(profile: IccProfile): IccProfile {
  if (profile.standard !== null) return profile
  const key = headerKey(profile.getData())
  const internal = internalProfileOf(profile.getData())
  if (internal !== null) return standardProfile(internal)
  const cached = cacheGet(key)
  if (cached !== undefined) return cached
  // new ICC_ColorSpace(profile) + validateColorSpace (fromRGB : CMMException si pas de transformation possible) ;
  // LittleCMS réécrit ensuite les balises lues, getData() peut changer
  profile.savedCache = native().iccSave(profile.raw, standardProfile('sRGB').raw)
  cachePut(key, profile)
  cachePut(headerKey(profile.savedCache), profile)
  return profile
}

/** ColorProfiles.createProfile(data) (taille déjà validée) */
function createProfile(data: Uint8Array): IccProfile {
  const internal = internalProfileOf(data)
  if (internal !== null) return standardProfile(internal)
  const cached = cacheGet(headerKey(data))
  if (cached !== undefined) return cached
  // ICC_Profile.getInstance : vérifications puis chargement par LittleCMS (IllegalArgumentException si invalide)
  verifyProfileData(data)
  return createColorSpace(new IccProfile(data, null, native().iccSave(data)))
}

/** ColorProfiles.readProfile(stream) puis JPEGImageReader.ensureDisplayProfile ; null si le profil est ignoré */
function readICCProfileSafe(bytes: Uint8Array): IccProfile | null {
  try {
    if (bytes.length < 128) return null // Truncated ICC Profile data
    const size = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0
    if (((bytes[36]! << 24) | (bytes[37]! << 16) | (bytes[38]! << 8) | bytes[39]!) >>> 0 !== 0x61637370) return null // 'acsp'
    if (size < 128 || size > bytes.length) return null
    const profile = createProfile(bytes.subarray(0, size))
    // ensureDisplayProfile : profil non « display » dont le premier octet de l'intention est 0 (perceptuelle)
    if (profile.profileClass() !== 'mntr') {
      const data = Uint8Array.from(profile.getData())
      if (data[64] === 0) {
        data[12] = 0x6d // 'mntr'
        data[13] = 0x6e
        data[14] = 0x74
        data[15] = 0x72
        return createProfile(data)
      }
    }
    return profile
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Segments JPEG (JPEGSegmentUtil.readSegments + Segment.read de TwelveMonkeys)
// ---------------------------------------------------------------------------

const SOF_MARKERS = new Set([0xffc0, 0xffc1, 0xffc2, 0xffc3, 0xffc5, 0xffc6, 0xffc7, 0xffc9, 0xffca, 0xffcb, 0xffcd, 0xffce, 0xffcf])
const KNOWN_MARKERS = new Set([
  0xffd8, 0xffd9, 0xffc4, 0xffda, 0xffdb, 0xfffe, ...SOF_MARKERS, 0xfff7, 0xffe0, 0xffe1, 0xffe2, 0xffe3, 0xffe4, 0xffe5, 0xffe6, 0xffe7, 0xffe8, 0xffe9, 0xffea,
  0xffeb, 0xffec, 0xffed, 0xffee, 0xffef, 0xffdd, 0xff01, 0xffcc, 0xffde, 0xffdc, 0xffdf, 0xfff8,
])

type Frame = { marker: number; lines: number; samplesPerLine: number; components: { id: number; hSub: number; vSub: number }[] }
type Header = { frame: Frame; jfif: boolean; adobeTransform: number | null; iccChunks: Uint8Array[] }

class Eof extends Error {}

/** asNullTerminatedAsciiString : jusqu'au premier octet < 20 (octets signés : >= 0x80 aussi), null sinon */
function appIdentifier(data: Uint8Array): string | null {
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!
    if (v < 20 || v >= 0x80 || i > 255) return String.fromCharCode(...data.subarray(0, i))
  }
  return null
}

function readHeader(b: Uint8Array): Header {
  let p = 0
  const u8 = (): number => {
    if (p >= b.length) throw new Eof()
    return b[p++]!
  }
  const u16 = (): number => (u8() << 8) | u8()
  if (b.length < 2 || ((b[0]! << 8) | b[1]!) !== 0xffd8) throw new IIOException('Not a JPEG stream')
  p = 2
  let frame: Frame | undefined
  let jfif = false
  let adobeTransform: number | null = null
  const iccChunks: Uint8Array[] = []
  try {
    for (;;) {
      let marker = u8()
      while (!KNOWN_MARKERS.has(marker)) {
        while (marker !== 0xff) marker = u8()
        marker = 0xff00 | u8()
        while (marker === 0xffff) marker = 0xff00 | u8()
      }
      const length = u16()
      const n = Math.max(0, length - 2)
      if (p + n > b.length) throw new Eof()
      const data = b.subarray(p, p + n)
      p += n
      if (SOF_MARKERS.has(marker)) {
        // Frame.read
        if (data.length < 6) throw new IIOException('Unexpected EOF')
        const count = data[5]!
        const expected = 8 + count * 3
        if (length !== expected) throw new IIOException(`Unexpected SOF length: ${length} != ${expected}`)
        if (frame === undefined) {
          const components = []
          for (let i = 0; i < count; i++) components.push({ id: data[6 + i * 3]!, hSub: data[7 + i * 3]! >> 4, vSub: data[7 + i * 3]! & 0xf })
          frame = { marker, lines: (data[1]! << 8) | data[2]!, samplesPerLine: (data[3]! << 8) | data[4]!, components }
        }
      } else if (marker >= 0xffe0 && marker <= 0xffef) {
        // Application.read : segments APPn mal formés ignorés
        const id = appIdentifier(data)
        if (marker === 0xffe0 && id === 'JFIF') {
          if (length >= 16) jfif = true
        } else if (marker === 0xffe2 && id === 'ICC_PROFILE') {
          iccChunks.push(data)
        } else if (marker === 0xffee && id === 'Adobe') {
          if (data.length >= 12) adobeTransform = data[11]!
        }
      }
      if (marker === 0xffda || marker === 0xffd9 || marker === 0xffd8) break
    }
  } catch (e) {
    if (!(e instanceof Eof)) throw e
  }
  if (frame === undefined) throw new IIOException('No SOF segment in stream')
  return { frame, jfif, adobeTransform, iccChunks }
}

/** JPEGImageReader.getEmbeddedICCProfile(false) */
function embeddedICCProfile(chunks: Uint8Array[]): IccProfile | null {
  if (chunks.length === 0) return null
  // Application.data() : après « ICC_PROFILE\0 », numéro et nombre de morceaux
  if (chunks.length === 1) {
    const c = chunks[0]!
    if (c.length < 14) return null
    if (c[12] !== 1 && c[13] !== 1) return null
    return readICCProfileSafe(c.subarray(14))
  }
  const first = chunks[0]!
  if (first.length < 14) return null
  const chunkCount = first[13]!
  if (chunkCount !== chunks.length) return null // Bad 'ICC_PROFILE' chunk count
  const chunkNumber = first[12]!
  if (chunkNumber < 1 || chunkNumber > chunkCount) return null
  const parts: (Uint8Array | undefined)[] = new Array(chunkCount)
  parts[chunkNumber - 1] = first.subarray(14)
  for (let i = 1; i < chunkCount; i++) {
    const c = chunks[i]!
    if (c.length < 14) return null
    if (c[13] !== chunkCount) throw new IIOException(`Bad number of 'ICC_PROFILE' chunks: ${c[12]} of ${chunkCount}.`)
    const index = c[12]! - 1
    if (index < 0 || index >= chunkCount) return null
    parts[index] = c.subarray(14)
  }
  // SequenceInputStream : un morceau manquant (null) fait échouer la lecture
  if (parts.some((x) => x === undefined)) return null
  return readICCProfileSafe(Buffer.concat(parts as Uint8Array[]))
}

// ---------------------------------------------------------------------------
// Flux vu par le lecteur du JDK (JPEGSegmentImageInputStream de TwelveMonkeys)
// ---------------------------------------------------------------------------

/**
 * Segments APPn retirés sauf APP1/Exif et APP14/Adobe (ramené à 16 octets), octets parasites avant les marqueurs
 * retirés, DQT 16 bits ramenées à 8 bits, identifiants de composantes en double remplacés dans SOF/SOS ;
 * après SOS, le reste du flux tel quel.
 */
function segmentFilteredStream(b: Uint8Array): Uint8Array {
  if (b.length < 2) throw new IIOException('Not a JPEG stream (short stream. expected SOI: 0xffd8)')
  const soi = (b[0]! << 8) | b[1]!
  if (soi !== 0xffd8) throw new IIOException(`Not a JPEG stream (starts with: 0x${soi.toString(16).padStart(4, '0')}, expected SOI: 0xffd8)`)
  const out: Uint8Array[] = [b.subarray(0, 2)]
  const componentIds: number[] = []
  const addId = (id: number): boolean => {
    if (componentIds.includes(id) || componentIds.length >= 4) return false
    componentIds.push(id)
    return true
  }
  let p = 2
  // fin réelle (dans le flux d'origine) du dernier segment retenu : en cas de fin de flux pendant l'analyse, la suite
  // du flux d'origine est lue telle quelle à partir de là
  let lastRealEnd = 2
  const push = (data: Uint8Array, realEnd: number): void => {
    out.push(data)
    lastRealEnd = realEnd
  }
  const u8 = (): number => {
    if (p >= b.length) throw new Eof()
    return b[p++]!
  }
  const u16 = (): number => (u8() << 8) | u8()
  /** octets [start, start + len) du flux, tronqués à la fin des données */
  const slice = (start: number, len: number): Uint8Array => b.subarray(Math.min(start, b.length), Math.min(start + len, b.length))
  try {
    for (;;) {
      let marker = u8()
      while (!KNOWN_MARKERS.has(marker)) {
        marker &= 0xff
        while (marker !== 0xff) marker = u8()
        marker = 0xff00 | u8()
        while (marker === 0xffff) marker = 0xff00 | u8()
      }
      const realPosition = p - 2
      const isApp = marker >= 0xffe0 && marker <= 0xffef
      const appId = (id: string): boolean => {
        if (p + 2 > b.length) throw new Eof()
        const length = (b[p]! << 8) | b[p + 1]!
        const n = Math.min(id.length + 1, length - 2)
        if (n < 0 || p + 2 + n > b.length) throw new Eof()
        const data = b.subarray(p + 2, p + 2 + n)
        const z = data.indexOf(0)
        return z >= 0 && String.fromCharCode(...data.subarray(0, z)) === id
      }
      const isAdobe = marker === 0xffee && appId('Adobe')
      const isExif = marker === 0xffe1 && appId('Exif')
      if (isApp && !(isExif || isAdobe)) {
        const length = u16()
        p = realPosition + 2 + length
        continue
      }
      if (marker === 0xffd9) {
        push(slice(realPosition, 2), realPosition + 2)
        p = realPosition + 2
        continue
      }
      const length = 2 + u16()
      if (isAdobe && length !== 16) {
        // AdobeAPP14Replacement : 16 octets (longueur 14)
        const r = new Uint8Array(16)
        r[0] = 0xff
        r[1] = 0xee
        r[2] = 0
        r[3] = 14
        const src = slice(p, 12)
        if (src.length < 12) throw new Eof()
        r.set(src, 4)
        push(r, realPosition + length)
      } else if (marker === 0xffdb) {
        const qtInfo = b[p]
        if (qtInfo !== undefined && (qtInfo & 0x10) === 0x10) {
          // DownsampledDQTReplacement
          const numQTs = Math.floor(length / 128)
          const newSegmentLength = 2 + (1 + 64) * numQTs
          const r = new Uint8Array(length)
          r[0] = 0xff
          r[1] = 0xdb
          r[2] = (newSegmentLength >> 8) & 0xff
          r[3] = newSegmentLength & 0xff
          r[4] = qtInfo & 0x0f
          const src = b.subarray(p + 1, p + 1 + (length - 5))
          if (src.length < length - 5) throw new Eof()
          r.set(src, 5)
          let newOff = 4
          let oldOff = 4
          for (let q = 0; q < numQTs; q++) {
            r[newOff++] = r[oldOff++]! & 0x0f
            for (let i = 0; i < 64; i++) r[newOff + i] = r[oldOff + 1 + i * 2]!
            newOff += 64
            oldOff += 128
          }
          push(r.subarray(0, newSegmentLength + 2), realPosition + length)
        } else push(slice(realPosition, length), realPosition + length)
      } else if (SOF_MARKERS.has(marker)) {
        const r = Uint8Array.from(slice(realPosition, length))
        if (r.length < length) throw new Eof()
        for (let off = 10; off < length; off += 3) {
          let id = r[off]!
          if (!addId(id)) {
            id++
            while (componentIds.length < 4 && !addId(id) && id < 255) id++
            r[off] = id
          }
        }
        push(r, realPosition + length)
      } else if (marker === 0xffda) {
        const r = Uint8Array.from(slice(realPosition, length))
        if (r.length < length) throw new Eof()
        const selectors: number[] = []
        let duplicates = false
        for (let off = 5; off < length - 3; off += 2) {
          const s = r[off]!
          if (selectors.includes(s) || selectors.length >= 4) duplicates = true
          else selectors.push(s)
        }
        if (duplicates) {
          let off = 5
          for (let i = 0; i < componentIds.length && off < length - 3; i++, off += 2) r[off] = componentIds[i]!
        }
        push(r, realPosition + length)
        out.push(b.subarray(Math.min(realPosition + length, b.length)))
        break
      } else push(slice(realPosition, length), realPosition + length)
      p = realPosition + length
    }
  } catch (e) {
    if (!(e instanceof Eof)) throw e
    out.push(b.subarray(Math.min(lastRealEnd, b.length)))
  }
  return Buffer.concat(out)
}

// ---------------------------------------------------------------------------
// Lecture (TwelveMonkeys JPEGImageReader.read(0, null))
// ---------------------------------------------------------------------------

type JPEGColorSpace = 'Gray' | 'GrayA' | 'RGB' | 'RGBA' | 'YCbCr' | 'YCbCrA' | 'PhotoYCC' | 'PhotoYCCA' | 'CMYK' | 'YCCK'

/** JPEGImageReader.getSourceCSType */
function sourceCSType(jfif: boolean, adobeTransform: number | null, frame: Frame): JPEGColorSpace {
  const c = frame.components
  switch (c.length) {
    case 1:
      return 'Gray'
    case 2:
      return 'GrayA'
    case 3:
      if (jfif) return 'YCbCr'
      if (adobeTransform !== null) return adobeTransform === 0 ? 'RGB' : 'YCbCr'
      if (c[0]!.id === 1 && c[1]!.id === 2 && c[2]!.id === 3) return 'YCbCr'
      if (c[0]!.id === 0x52 && c[1]!.id === 0x47 && c[2]!.id === 0x42) return 'RGB'
      if (c[0]!.id === 0x59 && c[1]!.id === 0x43 && c[2]!.id === 0x63) return 'PhotoYCC'
      return 'YCbCr'
    case 4:
      if (adobeTransform !== null) return adobeTransform === 0 ? 'CMYK' : 'YCCK'
      if (c[0]!.id === 1 && c[1]!.id === 2 && c[2]!.id === 3 && c[3]!.id === 4) return 'YCbCrA'
      if (c[0]!.id === 0x52 && c[1]!.id === 0x47 && c[2]!.id === 0x42 && c[3]!.id === 0x41) return 'RGBA'
      if (c[0]!.id === 0x59 && c[1]!.id === 0x43 && c[2]!.id === 0x63 && c[3]!.id === 0x41) return 'PhotoYCCA'
      return 'CMYK'
    default:
      throw new IIOException('Cannot determine source color space')
  }
}

/** Type d'image « brut » du lecteur du JDK (getRawImageType) : 'gray', 'rgb', ou null (NullPointerException) */
function jdkRawType(jpegColorSpace: number): 'gray' | 'rgb' | null {
  if (jpegColorSpace === JCS_GRAYSCALE) return 'gray'
  if (jpegColorSpace === JCS_RGB || jpegColorSpace === JCS_YCbCr) return 'rgb'
  return null
}

/** JPEGImageReader.delegateCSTypeMismatch */
function delegateCSTypeMismatch(jfif: boolean, adobeTransform: number | null, frame: Frame, cs: JPEGColorSpace, jdk: { jpegColorSpace: number } | null): boolean {
  switch (cs) {
    case 'GrayA':
    case 'RGBA':
    case 'YCbCrA':
    case 'PhotoYCC':
    case 'PhotoYCCA':
    case 'CMYK':
    case 'YCCK':
      return true
  }
  // en-tête illisible par le JDK (IIOException) ou espace inconnu (NullPointerException) : conversion par TwelveMonkeys
  if (jdk === null || jdk.jpegColorSpace === JCS_UNKNOWN) return true
  // CMYK / YCCK : type brut null
  const raw = jdkRawType(jdk.jpegColorSpace)
  const c = frame.components
  switch (cs) {
    case 'Gray':
      return raw !== 'gray'
    case 'YCbCr': {
      if (raw === null) return false
      const ids123 = c[0]!.id === 1 && c[1]!.id === 2 && c[2]!.id === 3
      if (jfif && !ids123) return true
      if (adobeTransform === null && !ids123 && c.slice(0, 3).some((x) => x.hSub === 1 || x.vSub === 1)) return true
      return raw !== 'rgb'
    }
    case 'RGB':
      return raw !== 'rgb'
    default:
      return false
  }
}

/** YCbCrConverter (table JPEG de TwelveMonkeys, arithmétique entière de Java) */
const SCALEBITS = 16
const ONE_HALF = 1 << (SCALEBITS - 1)
const Cr_R_LUT = new Int32Array(256)
const Cb_B_LUT = new Int32Array(256)
const Cr_G_LUT = new Int32Array(256)
const Cb_G_LUT = new Int32Array(256)
for (let i = 0, x = -128; i <= 255; i++, x++) {
  Cr_R_LUT[i] = Math.trunc((1.402 * (1 << SCALEBITS) + 0.5) * x + ONE_HALF) >> SCALEBITS
  Cb_B_LUT[i] = Math.trunc((1.772 * (1 << SCALEBITS) + 0.5) * x + ONE_HALF) >> SCALEBITS
  Cr_G_LUT[i] = Math.imul(-Math.trunc(0.71414 * (1 << SCALEBITS) + 0.5), x)
  Cb_G_LUT[i] = (Math.imul(-Math.trunc(0.34414 * (1 << SCALEBITS) + 0.5), x) + ONE_HALF) | 0
}
const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v)

function convertYCbCr2RGB(data: Uint8Array, numComponents: number): void {
  for (let o = 0; o < data.length; o += numComponents) {
    const y = data[o]!
    const cb = data[o + 1]!
    const cr = data[o + 2]!
    data[o] = clamp(y + Cr_R_LUT[cr]!)
    data[o + 1] = clamp(y + ((Cb_G_LUT[cb]! + Cr_G_LUT[cr]!) >> SCALEBITS))
    data[o + 2] = clamp(y + Cb_B_LUT[cb]!)
  }
}

/** LittleCMS : formats des LCMSImageLayout (octets, n canaux, DOSWAP pour les bandes inversées) */
const CHANNELS_SH = (n: number): number => n << 3
const BYTES_SH = (n: number): number => n
const DOSWAP = 1 << 10

/** ColorConvertOp(srcProfile, sRGB).filter(raster, dest) avec dest = raster TYPE_3BYTE_BGR ; résultat RGB */
function convertToSRGB(profile: IccProfile, data: Uint8Array, bands: number, width: number, height: number): Uint8Array {
  // première profil de classe « output » : colorimétrie relative, sinon perceptuelle
  const intent = profile.profileClass() === 'prtr' ? 1 : 0
  const bgr = native().iccTransform(
    profile.raw,
    standardProfile('sRGB').raw,
    intent,
    CHANNELS_SH(bands) | BYTES_SH(1),
    CHANNELS_SH(3) | BYTES_SH(1) | DOSWAP,
    data,
    width,
    height,
    width * bands,
    width * 3,
  )
  // DOSWAP : B, G, R en mémoire
  for (let o = 0; o < bgr.length; o += 3) {
    const t = bgr[o]!
    bgr[o] = bgr[o + 2]!
    bgr[o + 2] = t
  }
  return bgr
}

export type JdkJpegImage = { width: number; height: number; channels: 1 | 2 | 3 | 4; hasAlpha: boolean; data: Uint8Array; iccProfile: Uint8Array | null }

/**
 * `ImageIO.read` d'un JPEG sur la JVM de Komga (TwelveMonkeys + JDK) : pixels RGB (TYPE_3BYTE_BGR) ou gris
 * (TYPE_BYTE_GRAY), RGBA ou gris + alpha pour les JPEG à 4 ou 2 composantes avec alpha, et le profil ICC de l'espace de couleur de l'image quand il n'est pas standard (gris avec profil
 * embarqué), que l'écrivain JPEG du JDK réécrit. Null pour les cas non reproduits.
 */
export function readJpegLikeJdk(bytes: Uint8Array): JdkJpegImage | null {
  const nat = native()
  const header = readHeader(bytes)
  const sof = header.frame
  let adobe = header.adobeTransform
  const profile = embeddedICCProfile(header.iccChunks)
  let bogusAdobeDCT = false
  if (adobe !== null && ((adobe === 1 && sof.components.length !== 3) || (adobe === 2 && sof.components.length !== 4))) {
    bogusAdobeDCT = true
    adobe = null
  }
  const csType = sourceCSType(header.jfif, adobe, sof)
  if (sof.marker === 0xffc3) return null // sans perte : décodeur TwelveMonkeys
  const stream = segmentFilteredStream(bytes)
  let jdk: ReturnType<Native['jpegHeader']> | null = null
  let headerError: IIOException | null = null
  try {
    jdk = nat.jpegHeader(stream)
    if (jdk.tablesOnly) {
      jdk = null
      headerError = new IIOException('No image data present to read')
    }
  } catch (e) {
    headerError = new IIOException((e as Error).message, e)
  }
  const isSRGB = (p: IccProfile): boolean => p.standard === 'sRGB'
  const forced = bogusAdobeDCT || (profile !== null && !isSRGB(profile)) || sof.lines * sof.samplesPerLine > 0x7fffffff
  // delegateCSTypeMismatch n'interroge le lecteur du JDK (getRawImageType) que pour Gray, YCbCr et RGB
  const askedRawType = !forced && (csType === 'Gray' || csType === 'YCbCr' || csType === 'RGB')
  const useRaster = forced || delegateCSTypeMismatch(header.jfif, adobe, sof, csType, jdk)

  if (!useRaster) {
    // delegate.read : destination TYPE_3BYTE_BGR (sortie RGB de libjpeg) ou TYPE_BYTE_GRAY
    const d = nativeCall(() => nat.jpegDecode(stream, -1))
    if (d.components !== 1 && d.components !== 3) throw new IIOException('Invalid argument to native readImage')
    return { width: d.width, height: d.height, channels: d.components as 1 | 3, hasAlpha: false, data: d.data, iccProfile: null }
  }

  // readImageAsRasterAndReplaceColorProfile
  if (jdk === null) {
    // delegate.readRaster lève l'erreur du lecteur natif. Si TwelveMonkeys a d'abord demandé le type brut au lecteur du
    // JDK (delegateCSTypeMismatch) et que l'en-tête s'est arrêté sur la fin du flux sans SOS, la seconde lecture de
    // l'en-tête trouve un flux « tables seules » : IIOException « No image data present to read ».
    if (askedRawType && headerError!.message === 'Invalid JPEG file structure: missing SOS marker') throw new IIOException('No image data present to read')
    throw headerError!
  }
  const alpha = csType === 'GrayA' || csType === 'RGBA' || csType === 'YCbCrA' || csType === 'PhotoYCCA'
  const gray = csType === 'Gray' || csType === 'GrayA'
  // getRawImageType (Gray) : espace du profil embarqué s'il a une composante
  const grayProfile = gray && profile !== null && profile.getNumComponents() === 1 ? createColorSpace(profile) : null
  const raw = nativeCall(() => nat.jpegDecode(stream, jdk.jpegColorSpace))
  const { width, height } = raw
  const data = raw.data
  const bands = raw.components
  if (csType === 'YCbCr' || csType === 'YCbCrA') convertYCbCr2RGB(data, bands)
  else if (csType === 'YCCK') {
    convertYCbCr2RGB(data, 4)
    for (let o = 3; o < data.length; o += 4) data[o] = 255 - data[o]!
  } else if (csType === 'CMYK') for (let i = 0; i < data.length; i++) data[i] = 255 - data[i]!

  // destination : TYPE_BYTE_GRAY (ou gris + alpha), TYPE_3BYTE_BGR, ou TYPE_INT_ARGB pour les types avec alpha
  const destBands = (gray ? 1 : 3) + (alpha ? 1 : 0)
  let out: Uint8Array
  if (profile !== null && gray) {
    out = data
  } else if (profile !== null) {
    if (sof.components.length !== profile.getNumComponents()) {
      // profil ignoré ; CMYK : ColorConvertOp avec l'espace CMYK non ICC de TwelveMonkeys, non reproduit
      if (csType === 'CMYK') return null
      out = data
    } else if (createColorSpace(profile).standard === 'sRGB') {
      out = data
    } else if (alpha) {
      return null // ColorConvertOp vers une destination avec alpha : non reproduit
    } else out = convertToSRGB(createColorSpace(profile), data, bands, width, height)
  } else if (csType === 'YCCK' || csType === 'CMYK') {
    // FastCMYKToRGB
    out = new Uint8Array(width * height * 3)
    for (let i = 0, o = 0; i < data.length; i += 4, o += 3) {
      const k = data[i + 3]!
      out[o] = 255 - (Math.floor((data[i]! * (255 - k)) / 255) + k)
      out[o + 1] = 255 - (Math.floor((data[i + 1]! * (255 - k)) / 255) + k)
      out[o + 2] = 255 - (Math.floor((data[i + 2]! * (255 - k)) / 255) + k)
    }
  } else out = data
  // dest.setRect(raster) avec un nombre de bandes différent : non reproduit
  if (out.length !== width * height * destBands) return null
  const iccProfile = grayProfile !== null && grayProfile.standard === null ? grayProfile.getData() : null
  return { width, height, channels: destBands as 1 | 2 | 3 | 4, hasAlpha: alpha, data: out, iccProfile }
}

// ---------------------------------------------------------------------------
// Écriture (JPEGImageWriter du JDK, métadonnées par défaut)
// ---------------------------------------------------------------------------

// JPEGQTable (ordre naturel)
const K1Luminance = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24,
  35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]
const K1Div2Luminance = [
  8, 6, 5, 8, 12, 20, 26, 31, 6, 6, 7, 10, 13, 29, 30, 28, 7, 7, 8, 12, 20, 29, 35, 28, 7, 9, 11, 15, 26, 44, 40, 31, 9, 11, 19, 28, 34, 55, 52, 39, 12, 18, 28, 32, 41,
  52, 57, 46, 25, 32, 39, 44, 52, 61, 60, 51, 36, 46, 48, 49, 56, 50, 52, 50,
]
const K2Chrominance = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, ...new Array<number>(32).fill(99),
]
const K2Div2Chrominance = [
  9, 9, 12, 24, 50, 50, 50, 50, 9, 11, 13, 33, 50, 50, 50, 50, 12, 13, 28, 50, 50, 50, 50, 50, 24, 33, 50, 50, 50, 50, 50, 50, ...new Array<number>(32).fill(50),
]

/** JPEGQTable.getScaledInstance(scaleFactor, true) (arithmétique float de Java) */
function scaledTable(table: number[], scaleFactor: number): number[] {
  const f = Math.fround
  return table.map((v) => {
    let sv = Math.trunc(f(f(v * scaleFactor) + 0.5))
    if (sv < 1) sv = 1
    if (sv > 255) sv = 255
    return sv
  })
}

/** JPEG.convertToLinearQuality (float) */
function convertToLinearQuality(quality: number): number {
  const f = Math.fround
  let q = f(quality)
  if (q <= 0) q = f(0.01)
  if (q > 1) q = 1
  if (q < 0.5) q = f(f(0.5) / q)
  else q = f(2 - f(q * 2))
  return q
}

/** Segment APP0 JFIF par défaut (version 1.02, sans unité, densité 1x1, sans vignette) */
const JFIF_APP0 = Uint8Array.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])

/** JFIFMarkerSegment.writeICC : profil découpé en segments APP2 « ICC_PROFILE » */
function iccSegments(data: Uint8Array): Uint8Array[] {
  const MAX_ICC_CHUNK_SIZE = 65535 - 2 - 12 - 2
  let numChunks = Math.floor(data.length / MAX_ICC_CHUNK_SIZE)
  if (data.length % MAX_ICC_CHUNK_SIZE !== 0) numChunks++
  const out: Uint8Array[] = []
  let offset = 0
  for (let i = 0; i < numChunks; i++) {
    const dataLength = Math.min(data.length - offset, MAX_ICC_CHUNK_SIZE)
    const segLength = dataLength + 2 + 12 + 2
    const s = new Uint8Array(2 + segLength)
    s[0] = 0xff
    s[1] = 0xe2
    s[2] = (segLength >> 8) & 0xff
    s[3] = segLength & 0xff
    s.set([0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00], 4)
    s[16] = (i + 1) & 0xff
    s[17] = numChunks & 0xff
    s.set(data.subarray(offset, offset + dataLength), 18)
    offset += dataLength
    out.push(s)
  }
  return out
}

/**
 * `ImageIO.write(image, "jpeg", out)` (compressionQuality : ImageWriteParam en MODE_EXPLICIT) pour une image
 * TYPE_3BYTE_BGR / TYPE_INT_RGB (3 canaux RGB) ou TYPE_BYTE_GRAY (1 canal), sans alpha. `iccProfile` : profil d'un
 * espace de couleur non standard, écrit après le segment JFIF.
 */
export function writeJpegLikeJdk(
  image: { width: number; height: number; channels: 1 | 3; data: Uint8Array },
  iccProfile: Uint8Array | null = null,
  compressionQuality: number | undefined = undefined,
): Uint8Array {
  const gray = image.channels === 1
  let tables: number[][]
  if (compressionQuality === undefined) tables = [K1Div2Luminance, K2Div2Chrominance]
  else {
    const q = convertToLinearQuality(compressionQuality)
    tables = [scaledTable(K1Luminance, q), scaledTable(K2Chrominance, q)]
  }
  const markers = Buffer.concat([JFIF_APP0, ...(iccProfile !== null ? iccSegments(iccProfile) : [])])
  return nativeCall(() =>
    native().jpegEncode(
      image.data,
      image.width,
      image.height,
      image.channels,
      gray ? JCS_GRAYSCALE : JCS_RGB,
      gray ? JCS_GRAYSCALE : JCS_YCbCr,
      Int32Array.from(tables.flat()),
      gray ? Int32Array.of(1) : Int32Array.of(1, 2, 3),
      gray ? Int32Array.of(1) : Int32Array.of(2, 1, 1),
      gray ? Int32Array.of(1) : Int32Array.of(2, 1, 1),
      gray ? Int32Array.of(0) : Int32Array.of(0, 1, 1),
      markers,
      0,
    ),
  )
}
