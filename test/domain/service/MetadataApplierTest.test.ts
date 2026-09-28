// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/MetadataApplierTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDate } from '@js-joda/core'
import { describe, expect, it } from 'vitest'
import { Author } from '../../../src/domain/model/Author.js'
import { BookMetadata } from '../../../src/domain/model/BookMetadata.js'
import { BookMetadataPatch } from '../../../src/domain/model/BookMetadataPatch.js'
import { SeriesMetadata } from '../../../src/domain/model/SeriesMetadata.js'
import { SeriesMetadataPatch } from '../../../src/domain/model/SeriesMetadataPatch.js'
import { WebLink } from '../../../src/domain/model/WebLink.js'
import { MetadataApplier } from '../../../src/domain/service/MetadataApplier.js'
import { URI } from '../../../src/port/java-net.js'
import { eq } from '../../../src/port/kotlin.js'

describe('MetadataApplierTest', () => {
  const metadataApplier = new MetadataApplier()

  describe('Book', () => {
    it('given locked metadata when applying patch then metadata is not changed', () => {
      const metadata = new BookMetadata({
        title: 'title',
        number: '1',
        numberSort: 1,
        titleLock: true,
        summaryLock: true,
        numberLock: true,
        numberSortLock: true,
        releaseDateLock: true,
        authorsLock: true,
        tagsLock: true,
        isbnLock: true,
        linksLock: true,
      })

      const patch = new BookMetadataPatch({
        title: 'new title',
        summary: 'new summary',
        number: '2',
        numberSort: 2,
        releaseDate: LocalDate.of(2020, 12, 2),
        authors: [new Author({ name: 'Marcel', role: 'writer' })],
        isbn: '9782811632397',
        links: [new WebLink({ label: 'Comixology', url: new URI('https://www.comixology.com/Sandman/digital-comic/727888') })],
        tags: new Set(['tag1', 'tag2']),
      })

      const patched = metadataApplier.apply(patch, metadata)

      expect(patched.title).toBe(metadata.title)
      expect(patched.number).toBe(metadata.number)
      expect(patched.numberSort).toBe(metadata.numberSort)
      expect(patched.summary).toBe('')
      expect(patched.authors).toHaveLength(0)
      expect(patched.releaseDate).toBeNull()
      expect(patched.tags.size).toBe(0)
      expect(patched.isbn).toBe('')
      expect(patched.links).toHaveLength(0)
      expect(patched.tags.size).toBe(0)
    })

    it('given unlocked metadata when applying patch then metadata is changed', () => {
      const metadata = new BookMetadata({
        title: 'title',
        number: '1',
        numberSort: 1,
      })

      const patch = new BookMetadataPatch({
        title: 'new title',
        summary: 'new summary',
        number: '2',
        numberSort: 2,
        releaseDate: LocalDate.of(2020, 12, 2),
        authors: [new Author({ name: 'Marcel', role: 'writer' })],
        isbn: '9782811632397',
        links: [new WebLink({ label: 'Comixology', url: new URI('https://www.comixology.com/Sandman/digital-comic/727888') })],
        tags: new Set(['tag1', 'tag2']),
      })

      const patched = metadataApplier.apply(patch, metadata)

      expect(patched.title).toBe(patch.title)
      expect(patched.number).toBe(patch.number)
      expect(patched.numberSort).toBe(patch.numberSort)
      expect(patched.summary).toBe(patch.summary)
      expect(patched.authors).toHaveLength(1)
      expect(eq(patched.authors, [new Author({ name: 'Marcel', role: 'writer' })])).toBe(true)
      expect(eq(patched.releaseDate, patch.releaseDate)).toBe(true)
      expect(patched.isbn).toBe(patch.isbn)
      expect(patched.links).toHaveLength(1)
      expect(eq(patched.links, [new WebLink({ label: 'Comixology', url: new URI('https://www.comixology.com/Sandman/digital-comic/727888') })])).toBe(true)
      expect(patched.tags.size).toBe(2)
      expect([...patched.tags].sort()).toEqual(['tag1', 'tag2'])
    })
  })

  describe('Series', () => {
    it('given locked metadata when applying patch then metadata is not changed', () => {
      const metadata = new SeriesMetadata({
        title: 'title',
        statusLock: true,
        titleLock: true,
        titleSortLock: true,
        summaryLock: true,
        readingDirectionLock: true,
        publisherLock: true,
        ageRatingLock: true,
        languageLock: true,
        genresLock: true,
        tagsLock: true,
        totalBookCountLock: true,
      })

      const patch = new SeriesMetadataPatch({
        title: 'new title',
        titleSort: 'new title sort',
        status: SeriesMetadata.Status.ENDED,
        summary: 'new summary',
        readingDirection: SeriesMetadata.ReadingDirection.VERTICAL,
        publisher: 'new publisher',
        ageRating: 12,
        language: 'en',
        genres: new Set(['shonen']),
        totalBookCount: 12,
        collections: new Set(),
      })

      const patched = metadataApplier.apply(patch, metadata)

      expect(patched.title).toBe(metadata.title)
      expect(patched.titleSort).toBe(metadata.titleSort)
      expect(patched.status).toBe(metadata.status)
      expect(patched.summary).toBe(metadata.summary)
      expect(patched.readingDirection).toBe(metadata.readingDirection)
      expect(patched.publisher).toBe(metadata.publisher)
      expect(patched.ageRating).toBe(metadata.ageRating)
      expect(patched.language).toBe(metadata.language)
      expect(patched.genres.size).toBe(0)
      expect(patched.totalBookCount).toBeNull()
      expect(patched.tags.size).toBe(0)
    })

    it('given unlocked metadata when applying patch then metadata is changed', () => {
      const metadata = new SeriesMetadata({
        title: 'title',
      })

      const patch = new SeriesMetadataPatch({
        title: 'new title',
        titleSort: 'new title sort',
        status: SeriesMetadata.Status.ENDED,
        summary: 'new summary',
        readingDirection: SeriesMetadata.ReadingDirection.VERTICAL,
        publisher: 'new publisher',
        ageRating: 12,
        language: 'en',
        genres: new Set(['shonen']),
        totalBookCount: 12,
        collections: new Set(),
      })

      const patched = metadataApplier.apply(patch, metadata)

      expect(patched.title).toBe(patch.title)
      expect(patched.titleSort).toBe(patch.titleSort)
      expect(patched.status).toBe(patch.status)
      expect(patched.summary).toBe(patch.summary)
      expect(patched.readingDirection).toBe(patch.readingDirection)
      expect(patched.publisher).toBe(patch.publisher)
      expect(patched.ageRating).toBe(patch.ageRating)
      expect(patched.language).toBe(patch.language)
      expect(patched.totalBookCount).toBe(patch.totalBookCount)
      expect(patched.genres.size).toBe(1)
      expect([...patched.genres]).toEqual(['shonen'])
      expect(patched.tags.size).toBe(0)
    })
  })
})
