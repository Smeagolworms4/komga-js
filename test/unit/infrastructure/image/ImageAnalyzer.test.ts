// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/image/ImageAnalyzerOracleTest.kt
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageAnalyzer } from '../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ByteArrayInputStream } from '../../../../src/port/java-io.js'
import { oracle, oracleBytes } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/image/ImageAnalyzer')

const analyzer = new ImageAnalyzer()
const res = (p: string) => new Uint8Array(readFileSync(join('test/resources', p)))
const stream = (b: Uint8Array) => new ByteArrayInputStream(b)

func('getDimension', () => {
  kase('png rgba', () => analyzer.getDimension(stream(res('barcode/komga.png'))))
  kase('jpeg', () => analyzer.getDimension(stream(res('barcode/page_384.jpg'))))
  kase('jpeg exif', () => analyzer.getDimension(stream(res('hashpage/e-z.jpeg/1.jpg'))))
  kase('indexed png', () => analyzer.getDimension(stream(res('hashpage/dd.png/1.png'))))
  kase('gif', () => analyzer.getDimension(stream(res('hashpage/tr.gif/1.gif'))))
  kase('tiny png', () =>
    analyzer.getDimension(stream(new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAH0lEQVR4nGP4z8DwHwwZ/v9n4BKR+69hZPPfLSDqPwCJ2wq6OEinjgAAAABJRU5ErkJggg==', 'base64')))),
  )
  kase('png header only', () => analyzer.getDimension(stream(res('barcode/komga.png').slice(0, 33))))
  kase('truncated jpeg', () => analyzer.getDimension(stream(res('barcode/page_384.jpg').slice(0, 2000))))
  kase('garbage', () => analyzer.getDimension(stream(oracleBytes(64))))
  kase('empty', () => analyzer.getDimension(stream(new Uint8Array(0))))
})
