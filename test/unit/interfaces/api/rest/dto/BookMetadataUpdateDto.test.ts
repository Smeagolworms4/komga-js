// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/BookMetadataUpdateDtoOracleTest.kt
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { Author } from '../../../../../../src/domain/model/Author.js'
import { BookMetadata } from '../../../../../../src/domain/model/BookMetadata.js'
import { WebLink } from '../../../../../../src/domain/model/WebLink.js'
import { BookMetadataUpdateDto, patch } from '../../../../../../src/interfaces/api/rest/dto/BookMetadataUpdateDto.js'
import { URI } from '../../../../../../src/port/java-net.js'
import { kFloat } from '../../../../../../src/port/kotlin.js'
import { exceptionType, oracle } from '../../../../oracle.js'
import { read } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/BookMetadataUpdateDto')

const props = ['summary', 'releaseDate', 'authors', 'tags', 'isbn', 'links', 'title', 'number']

const meta = new BookMetadata({
  title: 'Title',
  summary: 'Summary',
  number: '1',
  numberSort: kFloat(1),
  releaseDate: LocalDate.of(2020, 1, 1),
  authors: [new Author({ name: 'John', role: 'writer' })],
  tags: new Set(['t1']),
  isbn: '9781234567897',
  links: [new WebLink({ label: 'site', url: new URI('https://example.org') })],
  bookId: 'B1',
  createdDate: LocalDateTime.of(2020, 1, 1, 0, 0),
})

const dto = (src: string) => read<BookMetadataUpdateDto>(src, { class: BookMetadataUpdateDto })
const flags = (d: BookMetadataUpdateDto) => props.map((it) => d.isSet(it))

func('isSet', () => {
  kase('empty body', () => flags(dto('{}')))
  kase('nulls', () => flags(dto('{"summary":null,"releaseDate":null,"authors":null,"tags":null,"isbn":null,"links":null,"title":null}')))
  kase('values', () => flags(dto('{"summary":"s","releaseDate":"2021-02-03","authors":[],"tags":["a"],"isbn":"1","links":[]}')))
})
func('patch', () => {
  kase('empty patch', () => patch(meta, dto('{}')))
  kase('all null', () =>
    patch(meta, dto('{"title":null,"titleLock":null,"summary":null,"number":null,"numberSort":null,"releaseDate":null,"authors":null,"tags":null,"isbn":null,"links":null}')),
  )
  kase('all values', () =>
    patch(
      meta,
      dto(
        `{"title":"T2","titleLock":true,"summary":"S2","summaryLock":true,"number":"2","numberLock":true,"numberSort":2.5,"numberSortLock":true,
"releaseDate":"2021-02-03","releaseDateLock":true,"authors":[{"name":"Jane","role":"PENCILLER"},{"name":" x ","role":" Y "}],"authorsLock":true,
"tags":["b","a"],"tagsLock":true,"isbn":"978-1-4028-9462-6","isbnLock":true,"links":[{"label":"l","url":"https://x.org/p?q=1"}],"linksLock":true}`,
      ),
    ),
  )
  kase('isbn with letters', () => patch(meta, dto('{"isbn":"ISBN 12-3x"}')).isbn)
  kase('author with null fields', () => patch(meta, dto('{"authors":[{}]}')).authors)
  kase('link with null label', () => exceptionType(() => patch(meta, dto('{"links":[{"url":"https://x"}]}'))))
  kase('link with invalid uri', () => exceptionType(() => patch(meta, dto('{"links":[{"label":"l","url":"not a uri"}]}'))))
})
