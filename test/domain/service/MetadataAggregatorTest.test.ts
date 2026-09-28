// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/MetadataAggregatorTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDate } from '@js-joda/core'
import { describe, expect, it } from 'vitest'
import { Author } from '../../../src/domain/model/Author.js'
import { BookMetadata } from '../../../src/domain/model/BookMetadata.js'
import { MetadataAggregator } from '../../../src/domain/service/MetadataAggregator.js'

describe('MetadataAggregatorTest', () => {
  const aggregator = new MetadataAggregator()

  it('given metadatas when aggregating then aggregation is relevant', () => {
    const metadatas = [
      new BookMetadata({ title: 'ignored', summary: 'summary 1', number: '1', numberSort: 1, authors: [new Author({ name: 'author1', role: 'role1' }), new Author({ name: 'author2', role: 'role2' })], releaseDate: LocalDate.of(2020, 1, 1), tags: new Set(['tag1']) }),
      new BookMetadata({ title: 'ignored', summary: 'summary 2', number: '2', numberSort: 2, authors: [new Author({ name: 'author3', role: 'role3' }), new Author({ name: 'author2', role: 'role3' })], releaseDate: LocalDate.of(2021, 1, 1), tags: new Set(['tag2']) }),
    ]

    const aggregation = aggregator.aggregate(metadatas)

    expect(aggregation.authors).toHaveLength(4)
    expect(aggregation.tags.size).toBe(2)
    expect(aggregation.releaseDate?.year()).toBe(2020)
    expect(aggregation.summary).toBe('summary 1')
    expect(aggregation.summaryNumber).toBe('1')
  })

  it("given metadatas with summary only on second book when aggregating then aggregation has second book's summary", () => {
    const metadatas = [
      new BookMetadata({ title: 'ignored', number: '1', numberSort: 1 }),
      new BookMetadata({ title: 'ignored', summary: 'summary 2', number: '2', numberSort: 2 }),
    ]

    const aggregation = aggregator.aggregate(metadatas)

    expect(aggregation.summary).toBe('summary 2')
    expect(aggregation.summaryNumber).toBe('2')
  })

  it('given metadatas with second book with earlier release date when aggregating then aggregation has release date from second book', () => {
    const metadatas = [
      new BookMetadata({ title: 'ignored', number: '1', numberSort: 1, releaseDate: LocalDate.of(2020, 1, 1) }),
      new BookMetadata({ title: 'ignored', number: '2', numberSort: 2, releaseDate: LocalDate.of(2019, 1, 1) }),
    ]

    const aggregation = aggregator.aggregate(metadatas)

    expect(aggregation.releaseDate?.year()).toBe(2019)
  })

  it('given metadatas with duplicate authors or tags when aggregating then aggregation has no duplicates', () => {
    const metadatas = [
      new BookMetadata({ title: 'ignored', number: '1', numberSort: 1, authors: [new Author({ name: 'author1', role: 'role1' }), new Author({ name: 'author2', role: 'role2' })], tags: new Set(['tag1', 'tag2']) }),
      new BookMetadata({ title: 'ignored', number: '2', numberSort: 2, authors: [new Author({ name: 'author1', role: 'role1' }), new Author({ name: 'author2', role: 'role2' })], tags: new Set(['tag1']) }),
    ]

    const aggregation = aggregator.aggregate(metadatas)

    expect(aggregation.authors).toHaveLength(2)
    expect(aggregation.tags.size).toBe(2)
  })
})
