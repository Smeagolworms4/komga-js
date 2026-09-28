// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/image/MosaicGeneratorOracleTest.kt
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ThumbnailSize } from '../../../../src/domain/model/ThumbnailSize.js'
import { KomgaSettingsProvider } from '../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { ImageAnalyzer } from '../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ImageConverter } from '../../../../src/infrastructure/image/ImageConverter.js'
import { ImageType } from '../../../../src/infrastructure/image/ImageType.js'
import { MosaicGenerator } from '../../../../src/infrastructure/image/MosaicGenerator.js'
import { ContentDetector } from '../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { ImageIO } from '../../../../src/port/imageio-codecs.js'
import { ByteArrayInputStream } from '../../../../src/port/java-io.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { TikaConfig } from '../../../../src/port/tika.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle, oracleBytes } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/image/MosaicGenerator')

const db = new OracleDb()
const contentDetector = new ContentDetector(new TikaConfig())
const converter = new ImageConverter(new ImageAnalyzer(), contentDetector)
const settings = new KomgaSettingsProvider(db.serverSettingsDao, new (class extends ApplicationEventPublisher {
  publishEvent(): void {}
})())

const res = (p: string) => new Uint8Array(readFileSync(join('test/resources', p)))
const png = res('barcode/komga.png')
const jpg = res('barcode/page_384.jpg')
const gif = res('hashpage/tr.gif/1.gif')

async function describe(out: Uint8Array): Promise<unknown> {
  const image = await ImageIO.read(new ByteArrayInputStream(out))
  return [contentDetector.detectMediaType(new ByteArrayInputStream(out)), image?.width ?? null, image?.height ?? null, image?.colorModel.hasAlpha() ?? null]
}

func('createMosaic', () => {
  const jpeg = new MosaicGenerator(settings, ImageType.JPEG, converter)
  kase('no image', async () => describe(await jpeg.createMosaic([])))
  kase('one image', async () => describe(await jpeg.createMosaic([jpg])))
  kase('four images', async () => describe(await jpeg.createMosaic([jpg, png, gif, jpg])))
  kase('five images', async () => describe(await jpeg.createMosaic([jpg, png, gif, jpg, png])))
  kase('png thumbnail type', async () => describe(await new MosaicGenerator(settings, ImageType.PNG, converter).createMosaic([png, jpg])))
  kase('large thumbnail size', async () => {
    settings.thumbnailSize = ThumbnailSize.LARGE
    return describe(await jpeg.createMosaic([gif]))
  })
  kase('garbage image', () => exceptionType(() => jpeg.createMosaic([oracleBytes(10)])))
})
