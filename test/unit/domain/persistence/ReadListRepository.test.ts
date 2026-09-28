// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/persistence/ReadListRepositoryOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Book } from '../../../../src/domain/model/Book.js'
import { Library } from '../../../../src/domain/model/Library.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { Series } from '../../../../src/domain/model/Series.js'
import type { ReadListRepository } from '../../../../src/domain/persistence/ReadListRepository.js'
import { sortedMapOf } from '../../../../src/port/extra-metadata.js'
import { URL } from '../../../../src/port/java-net.js'
import { PageRequest, Pageable, Sort } from '../../../../src/port/spring-data.js'
import { OracleDb } from '../../db.js'
import { oracle, stable } from '../../oracle.js'

const { func, kase } = oracle('domain/persistence/ReadListRepository')

const db = new OracleDb()
const repo: ReadListRepository = db.readListDao
const date = LocalDateTime.of(2020, 1, 1, 0, 0)

func('findAll', () => {
  kase('empty', () => repo.findAll(SearchContext.empty(), Pageable.unpaged()))
  kase('setup', () => {
    db.libraryDao.insert(new Library({ name: 'lib', root: new URL('file:/lib'), id: 'L1' }))
    db.seriesDao.insert(new Series({ name: 's1', url: new URL('file:/lib/s1'), fileLastModified: date, id: 'S1', libraryId: 'L1', createdDate: date }))
    db.bookDao.insert(new Book({ name: 'b1', url: new URL('file:/lib/s1/b1.cbz'), fileLastModified: date, id: 'B1', seriesId: 'S1', libraryId: 'L1', createdDate: date }))
    db.bookDao.insert(new Book({ name: 'b2', url: new URL('file:/lib/s1/b2.cbz'), fileLastModified: date, id: 'B2', seriesId: 'S1', libraryId: 'L1', createdDate: date }))
    repo.insert(new ReadList({ name: 'Zed', summary: 'summary', bookIds: sortedMapOf<number, string>([2, 'B1'], [1, 'B2']), id: 'R1', createdDate: date }))
    repo.insert(new ReadList({ name: 'arc', ordered: false, bookIds: sortedMapOf<number, string>([0, 'B2']), id: 'R2', createdDate: date }))
    return repo.count()
  })
  kase('defaults, unpaged', () => stable(repo.findAll(SearchContext.empty(), Pageable.unpaged())))
  kase('defaults, sorted by name', () => stable(repo.findAll(SearchContext.empty(), PageRequest.of(0, 1, Sort.by('name')))))
  kase('defaults, last page', () => stable(repo.findAll(SearchContext.empty(), PageRequest.of(1, 1, Sort.by('name')))))
  kase('anonymous context', () => stable(repo.findAll(SearchContext.ofAnonymousUser(), Pageable.unpaged())))
})
