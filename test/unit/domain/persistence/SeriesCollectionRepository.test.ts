// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/persistence/SeriesCollectionRepositoryOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Library } from '../../../../src/domain/model/Library.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { Series } from '../../../../src/domain/model/Series.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import type { SeriesCollectionRepository } from '../../../../src/domain/persistence/SeriesCollectionRepository.js'
import { URL } from '../../../../src/port/java-net.js'
import { Direction, PageRequest, Pageable, Sort } from '../../../../src/port/spring-data.js'
import { OracleDb } from '../../db.js'
import { oracle, stable } from '../../oracle.js'

const { func, kase } = oracle('domain/persistence/SeriesCollectionRepository')

const db = new OracleDb()
const repo: SeriesCollectionRepository = db.seriesCollectionDao
const date = LocalDateTime.of(2020, 1, 1, 0, 0)

func('findAll', () => {
  kase('empty', () => repo.findAll(SearchContext.empty(), Pageable.unpaged()))
  kase('setup', () => {
    db.libraryDao.insert(new Library({ name: 'lib', root: new URL('file:/lib'), id: 'L1' }))
    db.seriesDao.insert(new Series({ name: 's1', url: new URL('file:/lib/s1'), fileLastModified: date, id: 'S1', libraryId: 'L1', createdDate: date }))
    db.seriesDao.insert(new Series({ name: 's2', url: new URL('file:/lib/s2'), fileLastModified: date, id: 'S2', libraryId: 'L1', createdDate: date }))
    repo.insert(new SeriesCollection({ name: 'Beta', seriesIds: ['S2', 'S1'], id: 'C1', createdDate: date }))
    repo.insert(new SeriesCollection({ name: 'alpha', ordered: true, seriesIds: ['S1'], id: 'C2', createdDate: date }))
    repo.insert(new SeriesCollection({ name: 'Émpty', id: 'C3', createdDate: date }))
    return repo.count()
  })
  kase('defaults, unpaged', () => stable(repo.findAll(SearchContext.empty(), Pageable.unpaged())))
  kase('defaults, sorted by name', () => stable(repo.findAll(SearchContext.empty(), PageRequest.of(0, 2, Sort.by('name')))))
  kase('defaults, second page', () => stable(repo.findAll(SearchContext.empty(), PageRequest.of(1, 2, Sort.by(Direction.DESC, 'name')))))
  kase('anonymous context', () => stable(repo.findAll(SearchContext.ofAnonymousUser(), Pageable.unpaged())))
})
