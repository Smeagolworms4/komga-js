// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/search/LuceneEntityOracleTest.kt
import { LuceneEntity, oneshotDocument, toDocument } from '../../../../src/infrastructure/search/LuceneEntity.js'
import { oracle } from '../../oracle.js'
import { books, collections, fields, readLists, series } from './searchSamples.js'

const { func, kase } = oracle('infrastructure/search/LuceneEntity')

// PORT: surcharges toDocument (BookDto, SeriesDto, SeriesCollection, ReadList) -> une fonction
func('toDocument@30', () => {
  for (const b of books) kase(b.id, () => fields(toDocument(b)))
})

func('toDocument@50', () => {
  for (const s of series) kase(s.id, () => fields(toDocument(s)))
})

func('oneshotDocument', () => {
  const book = books.find((it) => it.oneshot)!
  for (const s of series) kase(s.id, () => fields(oneshotDocument(s, toDocument(book))))
})

func('toDocument@105', () => {
  for (const c of collections) kase(c.id, () => fields(toDocument(c)))
})

func('toDocument@112', () => {
  for (const r of readLists) kase(r.id, () => fields(toDocument(r)))
})

func('entries', () => {
  kase('properties', () => LuceneEntity.entries().map((it) => [it, it.type, it.id, [...it.defaultFields]]))
  kase('TYPE', () => LuceneEntity.TYPE)
})
