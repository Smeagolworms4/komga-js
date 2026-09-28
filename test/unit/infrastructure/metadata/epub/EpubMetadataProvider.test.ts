// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/epub/EpubMetadataProviderOracleTest.kt
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { BookWithMedia } from '../../../../../src/domain/model/BookWithMedia.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { MetadataPatchTarget } from '../../../../../src/domain/model/MetadataPatchTarget.js'
import { EpubMetadataProvider } from '../../../../../src/infrastructure/metadata/epub/EpubMetadataProvider.js'
import { ISBNValidator } from '../../../../../src/port/commons-validator.js'
import { pathToUrl } from '../../../../../src/port/java-net.js'
import { exceptionType, oracle, tempDir } from '../../../oracle.js'
import { t, writeZip } from '../../mediacontainer/oracleZip.js'
import { book, epubCases, libraries } from '../metadataSamples.js'

const { func, kase } = oracle('infrastructure/metadata/epub/EpubMetadataProvider')

const provider = new EpubMetadataProvider(new ISBNValidator(true))

const container =
  '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'

function epub(name: string, opf: string): BookWithMedia {
  const dir = join(tempDir(), 'epubs')
  mkdirSync(dir, { recursive: true })
  const p = join(dir, `${name}.epub`)
  writeZip(p, [t('mimetype', 'application/epub+zip'), t('META-INF/container.xml', container), t('OEBPS/content.opf', opf)])
  return new BookWithMedia({ book: book(pathToUrl(p)), media: new Media({ mediaType: 'application/epub+zip' }) })
}

const dated = (date: string) =>
  `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:date>${date}</dc:date></metadata></package>`

func('getBookMetadataFromBook', () => {
  epubCases.forEach((opf, i) => kase(`#${i}`, () => provider.getBookMetadataFromBook(epub(`book-${i}`, opf))))
  kase('not an epub media type', () => provider.getBookMetadataFromBook(epub('cbz', epubCases[0]!).copy({ media: new Media({ mediaType: 'application/zip' }) })))
  kase('missing file', () =>
    exceptionType(() => provider.getBookMetadataFromBook(epub('x', epubCases[0]!).copy({ book: book(pathToUrl(join(tempDir(), 'missing.epub'))) }))),
  )
})

func('getSeriesMetadataFromBook', () => {
  epubCases.forEach((opf, i) => {
    for (const append of [true, false]) kase(`#${i} (append volume ${append})`, () => provider.getSeriesMetadataFromBook(epub(`series-${i}`, opf), append))
  })
  kase('not an epub media type', () => provider.getSeriesMetadataFromBook(epub('cbz2', epubCases[0]!).copy({ media: new Media({ mediaType: 'application/pdf' }) }), true))
})

func('shouldLibraryHandlePatch', () => {
  for (const [name, library] of libraries) {
    for (const target of MetadataPatchTarget.entries()) kase(`${name}, ${target}`, () => provider.shouldLibraryHandlePatch(library, target))
  }
})

// privée : appelée par getBookMetadataFromBook
func('parseDate', () => {
  // prettier-ignore
  const dates = [
    '2020-01-02', '2020-1-2', '2020-01-02Z', '2020-01-02+01:00', '2020-01-02T10:15:30', '2020-01-02T10:15:30Z', '2020-01-02T10:15:30+05:00',
    '2020-01-02T10:15:30.123456789-03:30', '2020-01-02T10:15:30[Europe/Paris]', '2020-01-02T10:15:30+01:00[Europe/Paris]', '2020', '2020-01',
    '', ' 2020-01-02 ', '2020-02-30', '2019-02-29', '2020-13-01', '+12020-01-02', '-0001-01-01', '0000-01-01', '02/01/2020', '2020-01-02T25:00',
    '2020-01-02T10:15', '2020-01-02t10:15:30z', '2020-01-02 10:15:30', '2020-W01-1', '2020-001',
  ]
  dates.forEach((d, i) => kase(`'${d}'`, () => provider.getBookMetadataFromBook(epub(`date-${i}`, dated(d)))?.releaseDate ?? null))
})
