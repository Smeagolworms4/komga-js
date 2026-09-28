// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/SeriesSearchTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Duration, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { describe, expect, it } from 'vitest'
import { ReadStatus } from '../../../src/domain/model/ReadStatus.js'
import { SearchCondition } from '../../../src/domain/model/SearchCondition.js'
import { SearchOperator } from '../../../src/domain/model/SearchOperator.js'
import { SeriesMetadata } from '../../../src/domain/model/SeriesMetadata.js'
import { SeriesSearch } from '../../../src/domain/model/SeriesSearch.js'
import { objectMapper } from '../../../src/port/extra-search.js'
import { eq } from '../../../src/port/kotlin.js'

// PORT: @SpringBootTest / ObjectMapper injecté → objectMapper de port/extra-search.ts
describe('SeriesSearchTest', () => {
  const mapper = objectMapper
  const writer = mapper.writerWithDefaultPrettyPrinter()

  it('given seriesSearch entity when serializing then it looks alright', () => {
    const search = new SeriesSearch({
      condition:
        SearchCondition.AllOfSeries.of(
          new SearchCondition.AnyOfSeries({
            conditions: [],
          }),
          SearchCondition.AnyOfSeries.of(
            new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: 'library1' }) }),
            new SearchCondition.LibraryId({ operator: new SearchOperator.IsNot({ value: 'library1' }) }),
          ),
          new SearchCondition.CollectionId({ operator: new SearchOperator.Is({ value: 'collection1' }) }),
          new SearchCondition.CollectionId({ operator: new SearchOperator.IsNot({ value: 'collection1' }) }),
          new SearchCondition.Deleted({ operator: SearchOperator.IsFalse }),
          new SearchCondition.Deleted({ operator: SearchOperator.IsTrue }),
          new SearchCondition.Complete({ operator: SearchOperator.IsTrue }),
          new SearchCondition.Complete({ operator: SearchOperator.IsFalse }),
          new SearchCondition.ReleaseDate({ operator: new SearchOperator.Before({ dateTime: ZonedDateTime.now(ZoneOffset.UTC).minusMonths(1) }) }),
          new SearchCondition.ReleaseDate({ operator: new SearchOperator.After({ dateTime: ZonedDateTime.now(ZoneOffset.UTC).minusMonths(1) }) }),
          new SearchCondition.ReleaseDate({ operator: new SearchOperator.IsNotInTheLast({ duration: Duration.ofDays(5) }) }),
          new SearchCondition.ReleaseDate({ operator: new SearchOperator.IsInTheLast({ duration: Duration.ofDays(5) }) }),
          new SearchCondition.ReleaseDate({ operator: SearchOperator.IsNotNull }),
          new SearchCondition.ReleaseDate({ operator: SearchOperator.IsNull }),
          new SearchCondition.AgeRating({ operator: new SearchOperator.LessThan({ value: 5 }) }),
          new SearchCondition.AgeRating({ operator: new SearchOperator.Is({ value: 5 }) }),
          new SearchCondition.AgeRating({ operator: new SearchOperator.IsNullT() }),
          new SearchCondition.AgeRating({ operator: new SearchOperator.IsNot({ value: 5 }) }),
          new SearchCondition.AgeRating({ operator: new SearchOperator.IsNotNullT() }),
          new SearchCondition.Tag({ operator: new SearchOperator.Is({ value: 'fiction' }) }),
          new SearchCondition.Tag({ operator: new SearchOperator.IsNot({ value: 'fantasy' }) }),
          new SearchCondition.Tag({ operator: new SearchOperator.IsNullT() }),
          new SearchCondition.Tag({ operator: new SearchOperator.IsNotNullT() }),
          new SearchCondition.SharingLabel({ operator: new SearchOperator.Is({ value: 'label1' }) }),
          new SearchCondition.SharingLabel({ operator: new SearchOperator.IsNot({ value: 'label1' }) }),
          new SearchCondition.SharingLabel({ operator: new SearchOperator.IsNullT() }),
          new SearchCondition.SharingLabel({ operator: new SearchOperator.IsNotNullT() }),
          new SearchCondition.Publisher({ operator: new SearchOperator.Is({ value: 'publisher1' }) }),
          new SearchCondition.Publisher({ operator: new SearchOperator.IsNot({ value: 'publisher1' }) }),
          new SearchCondition.Language({ operator: new SearchOperator.Is({ value: 'en' }) }),
          new SearchCondition.Language({ operator: new SearchOperator.IsNot({ value: 'en' }) }),
          new SearchCondition.Genre({ operator: new SearchOperator.Is({ value: 'genre1' }) }),
          new SearchCondition.Genre({ operator: new SearchOperator.IsNot({ value: 'genre1' }) }),
          new SearchCondition.Genre({ operator: new SearchOperator.IsNullT() }),
          new SearchCondition.Genre({ operator: new SearchOperator.IsNotNullT() }),
          new SearchCondition.ReadStatus({ operator: new SearchOperator.IsNot({ value: ReadStatus.READ }) }),
          new SearchCondition.ReadStatus({ operator: new SearchOperator.Is({ value: ReadStatus.READ }) }),
          new SearchCondition.SeriesStatus({ operator: new SearchOperator.Is({ value: SeriesMetadata.Status.ENDED }) }),
          new SearchCondition.SeriesStatus({ operator: new SearchOperator.IsNot({ value: SeriesMetadata.Status.ONGOING }) }),
          new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ name: 'john', role: 'writer' }) }) }),
          new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch({ name: 'jack', role: 'writer' }) }) }),
          new SearchCondition.Author({ operator: new SearchOperator.Is({ value: new SearchCondition.AuthorMatch({ role: 'writer' }) }) }),
          new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch({ name: 'jim' }) }) }),
          new SearchCondition.Author({ operator: new SearchOperator.IsNot({ value: new SearchCondition.AuthorMatch() }) }),
          new SearchCondition.OneShot({ operator: SearchOperator.IsFalse }),
          new SearchCondition.OneShot({ operator: SearchOperator.IsTrue }),
          new SearchCondition.Title({ operator: new SearchOperator.Is({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.IsNot({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.Contains({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.DoesNotContain({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.BeginsWith({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.DoesNotBeginWith({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.EndsWith({ value: 'abc' }) }),
          new SearchCondition.Title({ operator: new SearchOperator.DoesNotEndWith({ value: 'abc' }) }),
          new SearchCondition.TitleSort({ operator: new SearchOperator.Is({ value: 'abc' }) }),
          new SearchCondition.TitleSort({ operator: new SearchOperator.IsNot({ value: 'abc' }) }),
          new SearchCondition.TitleSort({ operator: new SearchOperator.Contains({ value: 'abc' }) }),
          new SearchCondition.TitleSort({ operator: new SearchOperator.DoesNotContain({ value: 'abc' }) }),
          new SearchCondition.TitleSort({ operator: new SearchOperator.BeginsWith({ value: 'abc' }) }),
          new SearchCondition.TitleSort({ operator: new SearchOperator.DoesNotBeginWith({ value: 'abc' }) }),
          new SearchCondition.TitleSort({ operator: new SearchOperator.EndsWith({ value: 'abc' }) }),
          new SearchCondition.TitleSort({ operator: new SearchOperator.DoesNotEndWith({ value: 'abc' }) }),
        ),
    })

    const json = writer.writeValueAsString(search)

    console.log(json)

    const entity = mapper.readValue<SeriesSearch>(json, { class: SeriesSearch })

    expect(eq(entity, search)).toBe(true)
  })
})
