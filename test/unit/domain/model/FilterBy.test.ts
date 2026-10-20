// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/FilterByOracleTest.kt
import { unpackFilters } from '../../../../src/domain/model/FilterBy.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/FilterBy')

const set = (...ids: string[]) => new Set(ids)

func('unpackFilters', () => {
  kase('nothing', () => unpackFilters())
  kase('library', () => unpackFilters({ libraryIds: set('L1', 'L2') }))
  kase('collection', () => unpackFilters({ collectionIds: set('C1') }))
  kase('series', () => unpackFilters({ seriesIds: set('S1') }))
  kase('read list', () => unpackFilters({ readListIds: set('R1') }))
  kase('library wins', () => unpackFilters({ libraryIds: set('L1'), collectionIds: set('C1'), seriesIds: set('S1'), readListIds: set('R1') }))
  kase('collection over series', () => unpackFilters({ libraryIds: set(), collectionIds: set('C1'), seriesIds: set('S1'), readListIds: set('R1') }))
  kase('series over read list', () => unpackFilters({ seriesIds: set('S1'), readListIds: set('R1') }))
  kase('all empty', () => unpackFilters({ libraryIds: set(), collectionIds: set(), seriesIds: set(), readListIds: set() }))
})
