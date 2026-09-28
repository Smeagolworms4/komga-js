// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/persistence/BookDtoRepositoryOracleTest.kt
import { AgeRestriction, AllowExclude } from '../../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../../src/domain/model/ContentRestrictions.js'
import { SearchContext } from '../../../../../src/domain/model/SearchContext.js'
import type { BookDtoRepository } from '../../../../../src/interfaces/api/persistence/BookDtoRepository.js'
import type { BookDto } from '../../../../../src/interfaces/api/rest/dto/BookDto.js'
import { type Page, PageRequest, Pageable } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { admin, limited, setup } from '../../data.js'

const { func, kase } = oracle('interfaces/api/persistence/BookDtoRepository')

const db = new OracleDb()
const repo: BookDtoRepository = db.bookDtoDao

const ids = (p: Page<BookDto>) => [p.content.map((it) => it.id), p.totalElements, p.number, p.size]

func('findAllOnDeck', () => {
  kase('setup', () => setup(db))
  kase('admin, default restrictions', () => ids(repo.findAllOnDeck('U1', null, Pageable.unpaged())))
  kase('admin, library filter', () => ids(repo.findAllOnDeck('U1', ['L2'], PageRequest.of(0, 10))))
  kase('admin, restricted', () => ids(repo.findAllOnDeck('U1', null, Pageable.unpaged(), { restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 10, restriction: AllowExclude.ALLOW_ONLY }) }) })))
  kase('other user', () => ids(repo.findAllOnDeck('U2', null, Pageable.unpaged())))
})

func('findNextInReadListOrNull', () => {
  const next = (bookId: string, user: typeof admin = admin) => {
    const it = db.readListDao.findByIdOrNull('R1', SearchContext.empty())
    return it === null ? null : (repo.findNextInReadListOrNull(it, bookId, new SearchContext(user))?.id ?? null)
  }
  kase('next of first', () => next('B2'))
  kase('next of last', () => next('B4'))
  kase('limited user', () => next('B2', limited))
  kase('not in read list', () => next('B1'))
})
