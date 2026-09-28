// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/oneshot/OneShotSeriesProviderOracleTest.kt
import { BookMetadata } from '../../../../../src/domain/model/BookMetadata.js'
import { MetadataPatchTarget } from '../../../../../src/domain/model/MetadataPatchTarget.js'
import { Series } from '../../../../../src/domain/model/Series.js'
import type { BookMetadataRepository } from '../../../../../src/domain/persistence/BookMetadataRepository.js'
import type { BookRepository } from '../../../../../src/domain/persistence/BookRepository.js'
import { OneShotSeriesProvider } from '../../../../../src/infrastructure/metadata/oneshot/OneShotSeriesProvider.js'
import { URL } from '../../../../../src/port/java-net.js'
import { NoSuchElementException } from '../../../../../src/port/kotlin.js'
import { oracle } from '../../../oracle.js'
import { date, libraries } from '../metadataSamples.js'

const { func, kase } = oracle('infrastructure/metadata/oneshot/OneShotSeriesProvider')

const series = (oneshot: boolean) => new Series({ name: 'series', url: new URL('file:/komga/series'), fileLastModified: date, id: 'SERIES', oneshot, createdDate: date })

/** Fournisseur dont la série SERIES contient les livres `ids`, avec les métadonnées `metadata` (par id de livre) */
function provider(ids: string[], metadata: Map<string, BookMetadata>): OneShotSeriesProvider {
  const bookRepository = { findAllIdsBySeriesId: (id: string) => (id === 'SERIES' ? ids : []) } as unknown as BookRepository
  const bookMetadataRepository = {
    findById: (id: string) => {
      const m = metadata.get(id)
      if (m === undefined) throw new NoSuchElementException('No metadata')
      return m
    },
  } as unknown as BookMetadataRepository
  return new OneShotSeriesProvider(bookRepository, bookMetadataRepository)
}

const metadata = (title: string, summary: string) => new BookMetadata({ title, summary, number: '1', numberSort: 1, bookId: 'B1', createdDate: date })

func('getSeriesMetadata', () => {
  kase('not a oneshot', () => provider(['B1'], new Map([['B1', metadata('T', 'S')]])).getSeriesMetadata(series(false)))
  kase('oneshot', () => provider(['B1'], new Map([['B1', metadata('Title', 'Summary')]])).getSeriesMetadata(series(true)))
  kase('oneshot with blank metadata', () => provider(['B1'], new Map([['B1', metadata('', '')]])).getSeriesMetadata(series(true)))
  kase('several books: first one', () =>
    provider(
      ['B2', 'B1'],
      new Map([
        ['B1', metadata('One', '1')],
        ['B2', metadata('Two', '2')],
      ]),
    ).getSeriesMetadata(series(true)),
  )
  kase('no book', () => provider([], new Map()).getSeriesMetadata(series(true)))
  kase('no metadata', () => provider(['B1'], new Map()).getSeriesMetadata(series(true)))
})

func('shouldLibraryHandlePatch', () => {
  const p = provider([], new Map())
  for (const [name, library] of libraries) {
    for (const target of MetadataPatchTarget.entries()) kase(`${name}, ${target}`, () => p.shouldLibraryHandlePatch(library, target))
  }
})
