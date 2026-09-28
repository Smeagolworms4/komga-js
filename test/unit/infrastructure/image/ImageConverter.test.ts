// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/image/ImageConverterOracleTest.kt
// Pixels différents entre la JVM et KomgaJS (PORTING.md, images) : sorties décrites par type détecté, dimensions et alpha.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageAnalyzer } from '../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ImageConverter } from '../../../../src/infrastructure/image/ImageConverter.js'
import { ImageType } from '../../../../src/infrastructure/image/ImageType.js'
import { ContentDetector } from '../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { type BufferedImage, ImageIO } from '../../../../src/port/imageio-codecs.js'
import { ByteArrayInputStream } from '../../../../src/port/java-io.js'
import { TikaConfig } from '../../../../src/port/tika.js'
import { exceptionType, oracle, oracleBytes } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/image/ImageConverter')

const contentDetector = new ContentDetector(new TikaConfig())
const converter = new ImageConverter(new ImageAnalyzer(), contentDetector)

const res = (p: string) => new Uint8Array(readFileSync(join('test/resources', p)))
const png = res('barcode/komga.png')
const jpg = res('barcode/page_384.jpg')
const indexed = res('hashpage/dd.png/1.png')
const gif = res('hashpage/tr.gif/1.gif')
const opaque = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAH0lEQVR4nGP4z8DwHwwZ/v9n4BKR+69hZPPfLSDqPwCJ2wq6OEinjgAAAABJRU5ErkJggg==', 'base64'))
const transparent = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4zwAE/xkaQOR/Ribm/wAt+QWCAUaJagAAAABJRU5ErkJggg==', 'base64'))
const garbage = oracleBytes(64)

async function describe(out: Uint8Array, input: Uint8Array | null = null): Promise<unknown> {
  if (out === input) return 'same'
  if (out.length === 0) return 'empty'
  const image = await ImageIO.read(new ByteArrayInputStream(out))
  return [contentDetector.detectMediaType(new ByteArrayInputStream(out)), image?.width ?? null, image?.height ?? null, image?.colorModel.hasAlpha() ?? null]
}

const describeImage = (image: BufferedImage) => [image.width, image.height, image.colorModel.hasAlpha()]

func('chooseWebpReader', () => {
  kase('constructor succeeds', () => {
    new ImageConverter(new ImageAnalyzer(), contentDetector)
    return true
  })
})

func('canConvertMediaType', () => {
  for (const [from, to] of [
    ['image/jpeg', 'image/png'],
    ['image/png', 'image/jpeg'],
    ['image/gif', 'image/png'],
    ['image/bmp', 'image/jpeg'],
    ['image/jpeg', 'image/gif'],
    ['image/jpeg', 'image/jpeg'],
    ['application/pdf', 'image/jpeg'],
    ['image/jpeg', 'application/pdf'],
    ['IMAGE/JPEG', 'image/png'],
    ['image/jpg', 'image/png'],
    ['', ''],
  ] as const) {
    kase(`${from} -> ${to}`, () => converter.canConvertMediaType(from, to))
  }
})

func('convertImage', () => {
  kase('png with transparency to jpeg', async () => describe(await converter.convertImage(png, 'jpeg')))
  kase('png with transparency to png', async () => describe(await converter.convertImage(png, 'png')))
  kase('opaque rgba png to jpeg', async () => describe(await converter.convertImage(opaque, 'jpeg')))
  kase('jpeg to png', async () => describe(await converter.convertImage(jpg, 'png')))
  kase('jpeg to jpeg', async () => describe(await converter.convertImage(jpg, 'jpeg')))
  kase('indexed png to jpeg', async () => describe(await converter.convertImage(indexed, 'jpeg')))
  kase('gif to png', async () => describe(await converter.convertImage(gif, 'png')))
  kase('upper case format', async () => describe(await converter.convertImage(opaque, 'JPEG')))
  kase('unknown format', async () => describe(await converter.convertImage(opaque, 'xyz')))
  kase('garbage input', () => exceptionType(() => converter.convertImage(garbage, 'png')))
  kase('empty input', () => exceptionType(() => converter.convertImage(new Uint8Array(0), 'png')))
})

func('containsAlphaChannel', () => {
  kase('rgba to jpeg drops alpha', async () => describe(await converter.convertImage(transparent, 'jpeg')))
  kase('rgb stays rgb', async () => describe(await converter.convertImage(jpg, 'jpeg')))
})

func('containsTransparency', () => {
  kase('transparent pixels', async () => describe(await converter.convertImage(transparent, 'jpeg')))
  kase('opaque pixels', async () => describe(await converter.convertImage(opaque, 'jpeg')))
})

func('resizeImageToByteArray', () => {
  kase('png to jpeg, no upscale', async () => describe(await converter.resizeImageToByteArray(png, ImageType.JPEG, 100), png))
  kase('png to png, smaller than size', async () => describe(await converter.resizeImageToByteArray(png, ImageType.PNG, 100), png))
  kase('png to png, equal size', async () => describe(await converter.resizeImageToByteArray(png, ImageType.PNG, 48), png))
  kase('png to png, downscale', async () => describe(await converter.resizeImageToByteArray(png, ImageType.PNG, 24), png))
  kase('jpeg to jpeg, downscale', async () => describe(await converter.resizeImageToByteArray(jpg, ImageType.JPEG, 300), jpg))
  kase('jpeg to jpeg, huge size', async () => describe(await converter.resizeImageToByteArray(jpg, ImageType.JPEG, 5000), jpg))
  kase('jpeg to png', async () => describe(await converter.resizeImageToByteArray(jpg, ImageType.PNG, 150), jpg))
  kase('gif to jpeg', async () => describe(await converter.resizeImageToByteArray(gif, ImageType.JPEG, 100), gif))
  kase('size 1', async () => describe(await converter.resizeImageToByteArray(indexed, ImageType.PNG, 1), indexed))
  kase('garbage', () => exceptionType(() => converter.resizeImageToByteArray(garbage, ImageType.JPEG, 100)))
})

func('resizeImageToBufferedImage', () => {
  kase('png smaller than size', async () => describeImage(await converter.resizeImageToBufferedImage(png, ImageType.PNG, 100)))
  kase('png to jpeg', async () => describeImage(await converter.resizeImageToBufferedImage(png, ImageType.JPEG, 100)))
  kase('png downscale', async () => describeImage(await converter.resizeImageToBufferedImage(png, ImageType.PNG, 10)))
  kase('jpeg downscale', async () => describeImage(await converter.resizeImageToBufferedImage(jpg, ImageType.JPEG, 150)))
  kase('opaque upscale prevented', async () => describeImage(await converter.resizeImageToBufferedImage(opaque, ImageType.JPEG, 300)))
  kase('garbage', () => exceptionType(() => converter.resizeImageToBufferedImage(garbage, ImageType.JPEG, 100)))
})

func('resizeImageBuilder', () => {
  kase('same type and smaller keeps bytes', async () => (await converter.resizeImageToByteArray(opaque, ImageType.PNG, 3)) === opaque)
  kase('other type converts', async () => (await converter.resizeImageToByteArray(opaque, ImageType.JPEG, 3)) === opaque)
})
