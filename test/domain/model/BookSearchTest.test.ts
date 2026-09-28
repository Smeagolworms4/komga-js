// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/BookSearchTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Duration, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { describe, expect, it } from 'vitest'
import { BookSearch } from '../../../src/domain/model/BookSearch.js'
import { Media } from '../../../src/domain/model/Media.js'
import { MediaProfile } from '../../../src/domain/model/MediaProfile.js'
import { ReadStatus } from '../../../src/domain/model/ReadStatus.js'
import { SearchCondition } from '../../../src/domain/model/SearchCondition.js'
import { SearchOperator } from '../../../src/domain/model/SearchOperator.js'
import { objectMapper } from '../../../src/port/extra-search.js'
import { eq } from '../../../src/port/kotlin.js'

// PORT: @SpringBootTest / ObjectMapper injecté → objectMapper de port/extra-search.ts
describe('BookSearchTest', () => {
  const mapper = objectMapper
  const writer = mapper.writerWithDefaultPrettyPrinter()

  it('given bookSearch entity when serializing then it looks alright', () => {
    const search = new BookSearch({
      condition:
        SearchCondition.AllOfBook.of(
          SearchCondition.AnyOfBook.of(
            new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: 'library1' }) }),
            new SearchCondition.LibraryId({ operator: new SearchOperator.IsNot({ value: 'library1' }) }),
          ),
          new SearchCondition.SeriesId({ operator: new SearchOperator.Is({ value: 'series1' }) }),
          new SearchCondition.SeriesId({ operator: new SearchOperator.IsNot({ value: 'series1' }) }),
          new SearchCondition.ReadListId({ operator: new SearchOperator.Is({ value: 'readList1' }) }),
          new SearchCondition.ReadListId({ operator: new SearchOperator.IsNot({ value: 'readList1' }) }),
          new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }),
          new SearchCondition.Deleted({ operator: SearchOperator.IsTrue }),
          new SearchCondition.Title({ operator: new SearchOperator.BeginsWith({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.EndsWith({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.Is({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.IsNot({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.Contains({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.DoesNotContain({ value: 'abc' }) }),
          new SearchCondition.ReleaseDate({ operator: new SearchOperator.Before({ dateTime: ZonedDateTime.now(ZoneOffset.UTC).minusMonths(1) }) }),
          new SearchCondition.ReleaseDate({ operator: new SearchOperator.After({ dateTime: ZonedDateTime.now(ZoneOffset.UTC).minusMonths(1) }) }),
          new SearchCondition.ReleaseDate({ operator: new SearchOperator.IsNotInTheLast({ duration: Duration.ofDays(5) }) }),
          new SearchCondition.ReleaseDate({ operator: new SearchOperator.IsInTheLast({ duration: Duration.ofDays(5) }) }),
          new SearchCondition.ReleaseDate({ operator: SearchOperator.IsNotNull }),
          new SearchCondition.ReleaseDate({ operator: SearchOperator.IsNull }),
          new SearchCondition.NumberSort({ operator: new SearchOperator.GreaterThan({ value: 5 }) }),
          new SearchCondition.NumberSort({ operator: new SearchOperator.LessThan({ value: 5 }) }),
          new SearchCondition.NumberSort({ operator: new SearchOperator.Is({ value: 5 }) }),
          new SearchCondition.NumberSort({ operator: new SearchOperator.IsNot({ value: 5 }) }),
          new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'fiction' }) }),
          new SearchCondition.Tag({ operator: new SearchOperator.IsNot({ value: 'fantasy' }) }),
          new SearchCondition.Tag({ operator: new SearchOperator.IsNullT() }),
          new SearchCondition.Tag({ operator: new SearchOperator.IsNotNullT() }),
          new SearchCondition.ReadStatus({ operator: new SearchOperator.IsNot({ value: ReadStatus.READ }) }),
          new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }),
          new SearchCondition.MediaStatus({ operator: new SearchOperator.Is({ value: Media.Status.READY }) }),
          new SearchCondition.MediaStatus({ operator: new SearchOperator.IsNot({ value: Media.Status.READY }) }),
          new SearchCondition.MediaProfile({ operator: new SearchOperator.Is({ value: MediaProfile.PDF }) }),
          new SearchCondition.MediaProfile({ operator: new SearchOperator.IsNot({ value: MediaProfile.PDF }) }),
          new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: 'john', role: 'writer' }) }) }),
          new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch({ name: 'jack', role: 'writer' }) }) }),
          new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ role: 'writer' }) }) }),
          new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch({ name: 'jim' }) }) }),
          new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch() }) }),
          new SearchCondition.OneShot({ operator: SearchOperator.IsFalse }),
          new SearchCondition.OneShot({ operator: SearchOperator.IsTrue }),
          new SearchCondition.Poster({ operator: new SearchOperator.Is({ value: new SearchCondition.PosterMatch({ type: SearchCondition.PosterMatch.Type.GENERATED, selected: false }) }) }),
          new SearchCondition.Poster({ operator: new SearchOperator.Is({ value: new SearchCondition.PosterMatch({ selected: true }) }) }),
          new SearchCondition.Poster({ operator: new SearchOperator.IsNot({ value: new SearchCondition.PosterMatch({ type: SearchCondition.PosterMatch.Type.SIDECAR }) }) }),
          new SearchCondition.Poster({ operator: new SearchOperator.IsNot({ value: new SearchCondition.PosterMatch() }) }),
        ),
    })

    const json = writer.writeValueAsString(search)

    console.log(json)

    const entity = mapper.readValue<BookSearch>(json, { class: BookSearch })

    expect(eq(entity, search)).toBe(true)
  })
})
