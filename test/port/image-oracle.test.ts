// Vérification de la pile image (port/imageio*.ts, port/thumbnailator.ts, infrastructure/image) contre Komga (JVM 23 avec
// libwebp/libheif/libjxl, comme l'image Docker de Komga). Oracle : tools/jshell-komga.sh sur toutes les images de
// test/resources (dont les échantillons construits dans test/resources/port/image : JPEG, PNG, GIF, WebP, AVIF, HEIC,
// JPEG XL, BMP, TIFF, BigTIFF, PNM, PCX, WBMP, JPEG 2000, formats non lisibles, fichiers tronqués ou corrompus) :
// ImageAnalyzer.getDimension, lecteur choisi par ImageIO, ImageIO.read, ImageConverter.convertImage (JPEG, PNG),
// resizeImageToByteArray (JPEG/PNG, 100/300/400/5000), resizeImageToBufferedImage, canConvertMediaType,
// listes des formats, MosaicGenerator (fixtures/image-oracle.json).
// Comparés strictement : succès ou classe d'erreur, type de sortie, dimensions, alpha, nombre de bandes, "même tableau".
// Les pixels ne sont comparés qu'à gros grain (couleur dominante d'un point, tolérance large) : décodeurs différents.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { ImageAnalyzer } from '../../src/infrastructure/image/ImageAnalyzer.js'
import { ImageConverter } from '../../src/infrastructure/image/ImageConverter.js'
import { ImageType } from '../../src/infrastructure/image/ImageType.js'
import { ContentDetector } from '../../src/infrastructure/mediacontainer/ContentDetector.js'
import { type BufferedImage, ImageIO } from '../../src/port/imageio-codecs.js'
import { ByteArrayInputStream } from '../../src/port/java-io.js'
import { setLogLevel } from '../../src/port/logging.js'
import { TikaConfig } from '../../src/port/tika.js'

setLogLevel('ERROR', 'org.gotson.komga.infrastructure.image')

// KomgaSettingsProvider remplacé par un objet ne portant que thumbnailSize (seule propriété lue par MosaicGenerator)
vi.mock('../../src/infrastructure/configuration/KomgaSettingsProvider.js', () => ({ KomgaSettingsProvider: class {} }))

type Err = { error: string; message: string }
type Out = 'same' | Err | { length: 0 } | { mediaType: string; width: number; height: number; alpha: boolean; bands: number; px: number[] }
type Read = null | Err | { width: number; height: number; alpha: boolean; bands: number; px: number[] }
type OracleFile = {
  file: string
  mediaType: string | Err
  dimension: [number, number] | null
  readers: string[] | Err
  read: Read
  convertJPEG: Out
  convertPNG: Out
  resizeBI150: Err | { width: number; height: number; alpha: boolean }
} & Record<string, unknown>

const here = dirname(fileURLToPath(import.meta.url))
const oracle = JSON.parse(readFileSync(join(here, 'fixtures/image-oracle.json'), 'utf8')) as {
  files: OracleFile[]
  canConvert: [string, string, boolean][]
  lists: Record<string, string[]>
  mosaic: { size: string; images: number; result: Out }[]
}
const resources = join(here, '../resources')
const contentDetector = new ContentDetector(new TikaConfig())
const imageAnalyzer = new ImageAnalyzer()
const imageConverter = new ImageConverter(imageAnalyzer, contentDetector)

/** Exceptions JVM attendues -> classes du portage */
const errorNames: Record<string, string[]> = {
  IIOException: ['IIOException'],
  IOException: ['IOException', 'IIOException'],
  NullPointerException: ['NullPointerException'],
  UnsupportedFormatException: ['UnsupportedFormatException'],
}

/** Gris linéaire (ColorSpace CS_GRAY de Java) -> sRGB, comme BufferedImage.getRGB */
function linearGrayToSrgb(v: number): number {
  const l = v / 255
  const s = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055
  return Math.round(s * 255)
}

function px(im: BufferedImage): number[] {
  const x = Math.trunc(im.width * 0.1)
  const y = Math.trunc(im.height * 0.1)
  const o = (y * im.width + x) * im.channels
  const d = im.data
  if (im.channels <= 2) {
    const g = linearGrayToSrgb(d[o]!)
    return [g, g, g, im.channels === 2 ? d[o + 1]! : 255]
  }
  return [d[o]!, d[o + 1]!, d[o + 2]!, im.channels === 4 ? d[o + 3]! : 255]
}

function bands(im: BufferedImage): number {
  return im.info.indexed ? 1 : im.info.cmyk ? 4 : im.channels
}

async function describeOutput(out: Uint8Array, input: Uint8Array | null): Promise<Out> {
  if (out === input) return 'same'
  if (out.length === 0) return { length: 0 }
  const meta = await sharp(out).metadata()
  const im = (await ImageIO.read(new ByteArrayInputStream(out))) as BufferedImage
  return { mediaType: `image/${meta.format === 'jpeg' ? 'jpeg' : meta.format}`, width: im.width, height: im.height, alpha: im.colorModel.hasAlpha(), bands: bands(im), px: px(im) }
}

async function attempt<T>(f: () => Promise<T>): Promise<T | Err> {
  try {
    return await f()
  } catch (e) {
    return { error: (e as Error).constructor.name, message: (e as Error).message }
  }
}

function sameOutcome(actual: unknown, expected: unknown, label: string, pixels: boolean): string[] {
  const problems: string[] = []
  const isErr = (v: unknown): v is Err => v !== null && typeof v === 'object' && 'error' in (v as object)
  if (isErr(expected)) {
    if (!isErr(actual)) problems.push(`${label}: expected error ${expected.error} (${expected.message}), got ${JSON.stringify(actual)}`)
    else if (!(errorNames[expected.error] ?? [expected.error]).includes(actual.error)) problems.push(`${label}: expected ${expected.error}, got ${actual.error} (${actual.message})`)
    return problems
  }
  if (isErr(actual)) return [`${label}: unexpected error ${actual.error}: ${actual.message}`]
  if (expected === null || typeof expected !== 'object') {
    if (actual !== expected) problems.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    return problems
  }
  const e = expected as Record<string, unknown>
  const a = actual as Record<string, unknown>
  for (const k of ['mediaType', 'width', 'height', 'alpha', 'bands', 'length'])
    if (k in e && a[k] !== e[k]) problems.push(`${label}.${k}: expected ${JSON.stringify(e[k])}, got ${JSON.stringify(a[k])}`)
  // pixels non comparés : décodage 16 bits PNM de jai-imageio erroné côté Komga, CMYK TIFF converti par profil ICC
  // (TwelveMonkeys) contre conversion naïve ici ; couleur d'un pixel entièrement transparent sans objet
  const skipPx = /raw16\.ppm|cmyk\.tiff/.test(label)
  const transparent = Array.isArray(e.px) && Array.isArray(a.px) && (e.px as number[])[3] === 0 && (a.px as number[])[3] === 0
  if (pixels && !skipPx && !transparent && Array.isArray(e.px) && Array.isArray(a.px)) {
    const diff = Math.max(...(e.px as number[]).map((v, i) => Math.abs(v - (a.px as number[])[i]!)))
    if (diff > 60) problems.push(`${label}.px: expected ${JSON.stringify(e.px)}, got ${JSON.stringify(a.px)}`)
  }
  return problems
}

describe('image oracle', () => {
  it('supported formats and media types match ImageIO in Komga', () => {
    // ordre d'itération d'un HashSet côté JVM, variable d'un démarrage à l'autre : comparaison des ensembles
    const sorted = (l: string[] | undefined) => [...(l ?? [])].sort()
    expect(sorted(imageConverter.supportedReadFormats)).toEqual(sorted(oracle.lists.READ_FORMATS))
    expect(sorted(imageConverter.supportedReadMediaTypes)).toEqual(sorted(oracle.lists.READ_MT))
    expect(sorted(imageConverter.supportedWriteFormats)).toEqual(sorted(oracle.lists.WRITE_FORMATS))
    expect(sorted(imageConverter.supportedWriteMediaTypes)).toEqual(sorted(oracle.lists.WRITE_MT))
  })

  it('canConvertMediaType matches Komga', () => {
    for (const [from, to, expected] of oracle.canConvert) expect(imageConverter.canConvertMediaType(from, to), `${from} -> ${to}`).toBe(expected)
  })

  it('reader selection and getDimension match Komga', () => {
    const problems: string[] = []
    for (const o of oracle.files) {
      const bytes = readFileSync(join(resources, o.file))
      const stream = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))
      const first = ImageIO.getImageReaders(stream).next()
      // l'ordre du registre IIORegistry (ordre partiel) varie d'un démarrage de la JVM à l'autre : le lecteur choisi doit
      // être l'un de ceux qui acceptent le flux côté Komga
      const expectedReaders = Array.isArray(o.readers) ? o.readers.map((r) => r.split(':')[0]) : []
      const actualReader = first.done ? null : first.value.getOriginatingProvider().className
      if (actualReader === null ? expectedReaders.length > 0 : !expectedReaders.includes(actualReader))
        problems.push(`${o.file}: reader expected one of ${JSON.stringify(expectedReaders)}, got ${actualReader}`)
      const d = imageAnalyzer.getDimension(new ByteArrayInputStream(bytes))
      const actual = d === null ? null : [d.width, d.height]
      if (JSON.stringify(actual) !== JSON.stringify(o.dimension)) problems.push(`${o.file}: dimension expected ${JSON.stringify(o.dimension)}, got ${JSON.stringify(actual)}`)
    }
    expect(problems).toEqual([])
  })

  it('ImageIO.read matches Komga', async () => {
    const problems: string[] = []
    for (const o of oracle.files) {
      const bytes = readFileSync(join(resources, o.file))
      const actual = await attempt(async () => {
        const im = await ImageIO.read(new ByteArrayInputStream(bytes))
        return im === null ? null : { width: im.width, height: im.height, alpha: im.colorModel.hasAlpha(), bands: bands(im), px: px(im) }
      })
      problems.push(...sameOutcome(actual, o.read, `${o.file} read`, true))
    }
    expect(problems).toEqual([])
  }, 120_000)

  it('convertImage matches Komga', async () => {
    const problems: string[] = []
    for (const o of oracle.files) {
      const bytes = readFileSync(join(resources, o.file))
      for (const f of ['JPEG', 'PNG'] as const) {
        const actual = await attempt(async () => describeOutput(await imageConverter.convertImage(bytes, f), null))
        problems.push(...sameOutcome(actual, o[`convert${f}`], `${o.file} convert${f}`, true))
      }
    }
    expect(problems).toEqual([])
  }, 300_000)

  it('resizeImageToByteArray matches Komga', async () => {
    const problems: string[] = []
    for (const o of oracle.files) {
      const bytes = readFileSync(join(resources, o.file))
      for (const t of [ImageType.JPEG, ImageType.PNG])
        for (const s of [100, 300, 400, 5000]) {
          const actual = await attempt(async () => describeOutput(await imageConverter.resizeImageToByteArray(bytes, t, s), bytes))
          problems.push(...sameOutcome(actual, o[`resize${t.name}${s}`], `${o.file} resize${t.name}${s}`, true))
        }
    }
    expect(problems).toEqual([])
  }, 600_000)

  it('resizeImageToBufferedImage matches Komga', async () => {
    const problems: string[] = []
    for (const o of oracle.files) {
      const bytes = readFileSync(join(resources, o.file))
      const actual = await attempt(async () => {
        const im = await imageConverter.resizeImageToBufferedImage(bytes, ImageType.JPEG, 150)
        return { width: im.width, height: im.height, alpha: im.colorModel.hasAlpha() }
      })
      problems.push(...sameOutcome(actual, o.resizeBI150, `${o.file} resizeBI150`, false))
    }
    expect(problems).toEqual([])
  }, 300_000)
})

describe('mosaic oracle', () => {
  it('MosaicGenerator.createMosaic matches Komga', async () => {
    const { MosaicGenerator } = await import('../../src/infrastructure/image/MosaicGenerator.js')
    const { ThumbnailSize } = await import('../../src/domain/model/ThumbnailSize.js')
    const sets = [[], ['rgb.jpg'], ['rgb.jpg', 'rgba.png'], ['rgb.jpg', 'rgba.png', 'tiny-1x1.png', 'large-3000x1200.jpg'], ['rgb.jpg', 'rgba.png', 'tiny-1x1.png', 'large-3000x1200.jpg', 'static.gif']]
    const problems: string[] = []
    for (const o of oracle.mosaic) {
      const settings = { thumbnailSize: ThumbnailSize.valueOf(o.size) } as never
      const generator = new MosaicGenerator(settings, ImageType.JPEG, imageConverter)
      const images = sets.find((s) => s.length === o.images)!.map((f) => new Uint8Array(readFileSync(join(resources, 'port/image', f))))
      const actual = await attempt(async () => describeOutput(await generator.createMosaic(images), null))
      problems.push(...sameOutcome(actual, o.result, `mosaic ${o.size} ${o.images}`, true))
    }
    expect(problems).toEqual([])
  }, 120_000)
})
