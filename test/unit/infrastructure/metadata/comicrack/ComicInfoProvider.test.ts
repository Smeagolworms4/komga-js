// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/comicrack/ComicInfoProviderOracleTest.kt
import { BookWithMedia } from '../../../../../src/domain/model/BookWithMedia.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { MediaFile } from '../../../../../src/domain/model/MediaFile.js'
import { MetadataPatchTarget } from '../../../../../src/domain/model/MetadataPatchTarget.js'
import type { BookAnalyzer } from '../../../../../src/domain/service/BookAnalyzer.js'
import { ComicInfoProvider, computeSeriesFromSeriesAndVolume } from '../../../../../src/infrastructure/metadata/comicrack/ComicInfoProvider.js'
import { ISBNValidator } from '../../../../../src/port/commons-validator.js'
import { IllegalStateException } from '../../../../../src/port/kotlin.js'
import { oracle } from '../../../oracle.js'
import { book, libraries, xmlCases } from '../metadataSamples.js'

const { func, kase } = oracle('infrastructure/metadata/comicrack/ComicInfoProvider')

const withComicInfo = new BookWithMedia({ book: book(), media: new Media({ files: [new MediaFile({ fileName: 'ComicInfo.xml' })] }) })

function provider(content: Uint8Array): ComicInfoProvider {
  const analyzer = { getFileContent: () => content } as unknown as BookAnalyzer
  return new ComicInfoProvider(null, analyzer, new ISBNValidator(true))
}

const xml = (body: string) => Buffer.from(`<?xml version="1.0"?><ComicInfo>${body}</ComicInfo>`)

func('getBookMetadataFromBook', () => {
  for (const [id, cls, content] of xmlCases) kase(`${cls} #${id}`, () => provider(content).getBookMetadataFromBook(withComicInfo))
  kase('no ComicInfo.xml in media', () =>
    provider(xml('<Title>T</Title>')).getBookMetadataFromBook(new BookWithMedia({ book: book(), media: new Media({ files: [new MediaFile({ fileName: 'comicinfo.xml' })] }) })),
  )
})

func('getSeriesMetadataFromBook', () => {
  for (const [id, cls, content] of xmlCases) {
    for (const append of [true, false]) kase(`${cls} #${id} (append volume ${append})`, () => provider(content).getSeriesMetadataFromBook(withComicInfo, append))
  }
  kase('no ComicInfo.xml in media', () => provider(xml('<Series>S</Series>')).getSeriesMetadataFromBook(new BookWithMedia({ book: book(), media: new Media({}) }), true))
})

func('shouldLibraryHandlePatch', () => {
  for (const [name, library] of libraries) {
    for (const target of MetadataPatchTarget.entries()) kase(`${name}, ${target}`, () => provider(new Uint8Array(0)).shouldLibraryHandlePatch(library, target))
  }
})

// privée : appelée par getBookMetadataFromBook
func('getComicInfo', () => {
  kase('no files', () => provider(xml('<Title>T</Title>')).getBookMetadataFromBook(new BookWithMedia({ book: book(), media: new Media({}) })))
  kase('analyzer error', () => {
    const analyzer = {
      getFileContent: () => {
        throw new IllegalStateException('boom')
      },
    } as unknown as BookAnalyzer
    return new ComicInfoProvider(null, analyzer, new ISBNValidator(true)).getBookMetadataFromBook(withComicInfo)
  })
  kase('empty content', () => provider(new Uint8Array(0)).getBookMetadataFromBook(withComicInfo))
  kase('not xml', () => provider(Buffer.from('not xml')).getBookMetadataFromBook(withComicInfo))
  kase('empty root', () => provider(xml('')).getBookMetadataFromBook(withComicInfo))
  kase('other root name', () => provider(Buffer.from('<Other><Title>T</Title></Other>')).getBookMetadataFromBook(withComicInfo))
})

// privée : appelée par getBookMetadataFromBook
func('splitWithRole', () => {
  for (const v of ['', ' ', 'A', 'A,B', ' A , B ,, ', ',', 'A;B', 'A, ,B', 'Doe, John', '  ,  ,  ']) {
    kase(`'${v}'`, async () =>
      (await provider(
        xml(
          `<Writer>${v}</Writer><Penciller>${v}</Penciller><Inker>${v}</Inker><Colorist>${v}</Colorist><Letterer>${v}</Letterer><CoverArtist>${v}</CoverArtist><Editor>${v}</Editor><Translator>${v}</Translator>`,
        ),
      ).getBookMetadataFromBook(withComicInfo))?.authors ?? null,
    )
  }
})

func('computeSeriesFromSeriesAndVolume', () => {
  for (const s of [null, '', ' ', 'Batman', ' Batman ', 'X (1)']) {
    for (const v of [null, 0, 1, 2, -1, 2020, 2147483647]) kase(`'${s}' volume ${v}`, () => computeSeriesFromSeriesAndVolume(s, v))
  }
})
