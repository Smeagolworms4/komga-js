// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/ComicInfoProviderTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDate } from '@js-joda/core'
import { describe, expect, it, vi } from 'vitest'

// PORT: mockk<BookAnalyzer>() -> objet factice ; le module est remplacé (ses dépendances ne sont pas nécessaires ici)
vi.mock('../../../../src/domain/service/BookAnalyzer.js', () => ({ BookAnalyzer: class BookAnalyzer {} }))

const { BookMetadataPatch } = await import('../../../../src/domain/model/BookMetadataPatch.js')
const { BookWithMedia } = await import('../../../../src/domain/model/BookWithMedia.js')
const { Media } = await import('../../../../src/domain/model/Media.js')
const { MediaFile } = await import('../../../../src/domain/model/MediaFile.js')
const { SeriesMetadata } = await import('../../../../src/domain/model/SeriesMetadata.js')
const { WebLink } = await import('../../../../src/domain/model/WebLink.js')
const { ComicInfoProvider, computeSeriesFromSeriesAndVolume } = await import('../../../../src/infrastructure/metadata/comicrack/ComicInfoProvider.js')
const { AgeRating } = await import('../../../../src/infrastructure/metadata/comicrack/dto/AgeRating.js')
const { ComicInfo } = await import('../../../../src/infrastructure/metadata/comicrack/dto/ComicInfo.js')
const { Manga } = await import('../../../../src/infrastructure/metadata/comicrack/dto/Manga.js')
const { ISBNValidator } = await import('../../../../src/port/commons-validator.js')
const { URI } = await import('../../../../src/port/java-net.js')
const { isBlank } = await import('../../../../src/port/kotlin.js')
const { makeBook } = await import('../../../domain/model/Utils.js')

type ComicInfoT = InstanceType<typeof ComicInfo>

/** `ComicInfo().apply { ... }` */
function comicInfo(values: Partial<ComicInfoT>): ComicInfoT {
  return Object.assign(new ComicInfo(), values)
}

/** `assertThat(actual).containsExactlyInAnyOrder(...expected)` */
function expectExactlyInAnyOrder<T>(actual: Iterable<T> | null | undefined, ...expected: T[]): void {
  const a = [...(actual ?? [])]
  expect(a).toHaveLength(expected.length)
  expect(a).toEqual(expect.arrayContaining(expected as unknown[]))
}

describe('ComicInfoProviderTest', () => {
  const mockMapper = { readValue: vi.fn() }
  const mockAnalyzer = { getFileContent: vi.fn(() => new Uint8Array(0)) }
  const isbnValidator = new ISBNValidator(true)

  const comicInfoProvider = new ComicInfoProvider(mockMapper as never, mockAnalyzer as never, isbnValidator)

  const book = makeBook('book')
  const media = new Media({
    status: Media.Status.READY,
    mediaType: 'application/zip',
    files: [new MediaFile({ fileName: 'ComicInfo.xml' })],
  })

  describe('Book', () => {
    it('given comicInfo when getting book metadata then metadata patch is valid', () => {
      const ci = comicInfo({
        title: 'title',
        summary: 'summary',
        number: '010',
        year: 2020,
        month: 2,
        alternateSeries: 'story arc',
        alternateNumber: '5',
        storyArc: 'one, two, three',
        web: '   https://www.comixology.com/Sandman/digital-comic/727888    https://www.comics.com/Sandman/digital-comic/727889   ',
        tags: 'dark, Occult',
        gtin: '9783440077894',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.title).toBe('title')
      expect(patch.summary).toBe('summary')
      expect(patch.number).toBe('010')
      expect(patch.numberSort).toBe(10)
      expect(patch.releaseDate).toEqual(LocalDate.of(2020, 2, 1))
      expect(patch.isbn).toBe('9783440077894')

      expect(patch.readLists).toHaveLength(4)
      expectExactlyInAnyOrder(
        patch.readLists,
        new BookMetadataPatch.ReadListEntry({ name: 'story arc', number: 5 }),
        new BookMetadataPatch.ReadListEntry({ name: 'one' }),
        new BookMetadataPatch.ReadListEntry({ name: 'two' }),
        new BookMetadataPatch.ReadListEntry({ name: 'three' }),
      )

      expectExactlyInAnyOrder(
        patch.links,
        new WebLink({ label: 'www.comixology.com', url: new URI('https://www.comixology.com/Sandman/digital-comic/727888') }),
        new WebLink({ label: 'www.comics.com', url: new URI('https://www.comics.com/Sandman/digital-comic/727889') }),
      )

      expect([...patch.tags!]).toHaveLength(2)
      expectExactlyInAnyOrder(patch.tags, 'dark', 'occult')
    })

    it('given comicInfo with single link when getting book metadata then metadata patch is valid', () => {
      const ci = comicInfo({
        web: 'https://www.comixology.com/Sandman/digital-comic/727888',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expectExactlyInAnyOrder(patch.links, new WebLink({ label: 'www.comixology.com', url: new URI('https://www.comixology.com/Sandman/digital-comic/727888') }))
    })

    it('given comicInfo with StoryArcNumber when getting book metadata then metadata patch is valid', () => {
      const ci = comicInfo({
        storyArc: 'one',
        storyArcNumber: '6',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.readLists).toHaveLength(1)
      expectExactlyInAnyOrder(patch.readLists, new BookMetadataPatch.ReadListEntry({ name: 'one', number: 6 }))
    })

    it('given comicInfo with multiple StoryArcNumber when getting book metadata then metadata patch is valid', () => {
      const ci = comicInfo({
        alternateSeries: 'story arc',
        alternateNumber: '5',
        storyArc: 'one, two, three',
        storyArcNumber: '6, 7, 8',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.readLists).toHaveLength(4)
      expectExactlyInAnyOrder(
        patch.readLists,
        new BookMetadataPatch.ReadListEntry({ name: 'story arc', number: 5 }),
        new BookMetadataPatch.ReadListEntry({ name: 'one', number: 6 }),
        new BookMetadataPatch.ReadListEntry({ name: 'two', number: 7 }),
        new BookMetadataPatch.ReadListEntry({ name: 'three', number: 8 }),
      )
    })

    it('given comicInfo with uneven StoryArcNumber when getting book metadata then metadata patch is valid', () => {
      const ci = comicInfo({
        storyArc: 'one, two',
        storyArcNumber: '6, 7, 8',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.readLists).toHaveLength(2)
      expectExactlyInAnyOrder(
        patch.readLists,
        new BookMetadataPatch.ReadListEntry({ name: 'one', number: 6 }),
        new BookMetadataPatch.ReadListEntry({ name: 'two', number: 7 }),
      )
    })

    it('given another comicInfo with uneven StoryArcNumber when getting book metadata then metadata patch is valid', () => {
      const ci = comicInfo({
        storyArc: 'one, two, three',
        storyArcNumber: '6, 7',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.readLists).toHaveLength(2)
      expectExactlyInAnyOrder(
        patch.readLists,
        new BookMetadataPatch.ReadListEntry({ name: 'one', number: 6 }),
        new BookMetadataPatch.ReadListEntry({ name: 'two', number: 7 }),
      )
    })

    it('given comicInfo with invalid StoryArcNumber when getting book metadata then invalid pairs are omitted', () => {
      const ci = comicInfo({
        storyArc: 'one, two, three',
        storyArcNumber: '6, x, 8',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.readLists).toHaveLength(2)
      expectExactlyInAnyOrder(
        patch.readLists,
        new BookMetadataPatch.ReadListEntry({ name: 'one', number: 6 }),
        new BookMetadataPatch.ReadListEntry({ name: 'three', number: 8 }),
      )
    })

    it('given comicInfo with invalid StoryArc when getting book metadata then invalid pairs are omitted', () => {
      const ci = comicInfo({
        storyArc: 'one, , three',
        storyArcNumber: '6, 7, 8',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.readLists).toHaveLength(2)
      expectExactlyInAnyOrder(
        patch.readLists,
        new BookMetadataPatch.ReadListEntry({ name: 'one', number: 6 }),
        new BookMetadataPatch.ReadListEntry({ name: 'three', number: 8 }),
      )
    })

    it('given comicInfo with blank values when getting series metadata then blank values are omitted', () => {
      const ci = comicInfo({
        title: '',
        summary: '',
        number: '',
        alternateSeries: '',
        alternateNumber: '',
        storyArc: '',
        penciller: '',
        gtin: '',
        web: '',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.title).toBeNull()
      expect(patch.summary).toBeNull()
      expect(patch.number).toBeNull()
      expect(patch.numberSort).toBeNull()
      expect(patch.authors).toBeNull()
      expect(patch.readLists).toHaveLength(0)
      expect(patch.isbn).toBeNull()
      expect(patch.links).toBeNull()
    })

    it('given comicInfo without year when getting book metadata then release date is null', () => {
      const ci = comicInfo({
        month: 2,
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.releaseDate).toBeNull()
    })

    it('given comicInfo with year but without month when getting book metadata then release date is set', () => {
      const ci = comicInfo({
        year: 2020,
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.releaseDate).toEqual(LocalDate.of(2020, 1, 1))
    })

    it('given comicInfo with authors when getting book metadata then authors are set', () => {
      const ci = comicInfo({
        writer: 'writer',
        penciller: 'penciller',
        inker: 'inker',
        colorist: 'colorist',
        editor: 'editor',
        translator: 'translator',
        letterer: 'letterer',
        coverArtist: 'coverArtist',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.authors).toHaveLength(8)
      expectExactlyInAnyOrder(
        patch.authors?.map((it) => it.name),
        'writer',
        'penciller',
        'inker',
        'colorist',
        'editor',
        'letterer',
        'translator',
        'coverArtist',
      )
      expectExactlyInAnyOrder(
        patch.authors?.map((it) => it.role),
        'writer',
        'penciller',
        'inker',
        'colorist',
        'editor',
        'letterer',
        'translator',
        'cover',
      )
    })

    it('given comicInfo with multiple authors when getting book metadata then authors are set', () => {
      const ci = comicInfo({
        writer: 'writer, writer2',
        penciller: 'penciller, penciller2',
        inker: 'inker, inker2',
        colorist: 'colorist, colorist2',
        editor: 'editor, editor2',
        translator: 'translator, translator2',
        letterer: 'letterer, letterer2',
        coverArtist: 'coverArtist, coverArtist2',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.authors).toHaveLength(16)
      expectExactlyInAnyOrder(
        patch.authors?.map((it) => it.name),
        'writer',
        'penciller',
        'inker',
        'colorist',
        'editor',
        'letterer',
        'coverArtist',
        'writer2',
        'penciller2',
        'inker2',
        'colorist2',
        'editor2',
        'letterer2',
        'coverArtist2',
        'translator',
        'translator2',
      )
      expectExactlyInAnyOrder(
        [...new Set(patch.authors?.map((it) => it.role))],
        'writer',
        'penciller',
        'inker',
        'colorist',
        'editor',
        'letterer',
        'cover',
        'translator',
      )
    })

    it('given book without comicInfo file when getting book metadata then return null', () => {
      const book = makeBook('book')
      const media = new Media({ status: Media.Status.READY })

      const patch = comicInfoProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))

      expect(patch).toBeNull()
    })
  })

  describe('Series', () => {
    it('given comicInfo when getting series metadata then metadata patch is valid', () => {
      const ci = comicInfo({
        series: 'séries',
        seriesGroup: 'multiple,collections',
        publisher: 'publisher',
        ageRating: AgeRating.MA_15,
        manga: Manga.YES_AND_RIGHT_TO_LEFT,
        languageISO: 'en',
        count: 10,
        genre: 'Action, Adventure',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), true)!

      expect(patch.title).toBe('séries')
      expect(patch.titleSort).toBe('séries')
      expect(patch.status).toBeNull()
      expectExactlyInAnyOrder(patch.collections, 'collections', 'multiple')
      expect(patch.publisher).toBe('publisher')
      expect(patch.ageRating).toBe(15)
      expect(patch.readingDirection).toBe(SeriesMetadata.ReadingDirection.RIGHT_TO_LEFT)
      expect(patch.language).toBe('en')
      expect(isBlank(patch.summary)).toBe(true)
      expect(patch.totalBookCount).toBe(10)
      expectExactlyInAnyOrder(patch.genres, 'Action', 'Adventure')
    })

    it('given comicInfo with volume when getting series metadata then metadata patch is valid', () => {
      const ci = comicInfo({
        series: 'series',
        volume: 2020,
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), true)!

      expect(patch.title).toBe('series (2020)')

      const patchNoAppend = comicInfoProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), false)!

      expect(patchNoAppend.title).toBe('series')
    })

    it('given comicInfo with volume as 1 when getting series metadata then metadata title omits volume', () => {
      const ci = comicInfo({
        series: 'series',
        volume: 1,
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), true)!

      expect(patch.title).toBe('series')

      const patchNoAppend = comicInfoProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), false)!

      expect(patchNoAppend.title).toBe('series')
    })

    it('given comicInfo with incorrect values when getting series metadata then metadata patch is valid', () => {
      const ci = comicInfo({
        languageISO: 'japanese',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), true)!

      expect(patch.language).toBeNull()
    })

    it.each(languagesSource())('given comicInfo with malformed BCP-47 language when getting series metadata then patch language is normalized', (source, expected) => {
      const ci = comicInfo({
        languageISO: source,
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), true)!

      expect(patch.language).toBe(expected)
    })

    function languagesSource(): [string, string][] {
      return [
        ['fra', 'fr'],
        ['fra-be', 'fr-BE'],
        ['JA', 'ja'],
        ['en-us', 'en-US'],
      ]
    }

    it('given comicInfo with blank values when getting series metadata then blank values are omitted', () => {
      const ci = comicInfo({
        title: '',
        storyArc: '',
        genre: '',
        languageISO: '',
        publisher: '',
        seriesGroup: '',
      })

      mockMapper.readValue.mockReturnValue(ci)

      const patch = comicInfoProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), true)!

      expect(patch.title).toBeNull()
      expect(patch.titleSort).toBeNull()
      expect(patch.genres).toBeNull()
      expect(patch.language).toBeNull()
      expect(patch.publisher).toBeNull()
      expect([...patch.collections]).toHaveLength(0)
    })
  })

  // companion object
  function computeSeriesFromSeriesAndVolumeArguments(): [string | null, number | null, string | null][] {
    return [
      ['', null, null],
      [null, null, null],
      ['Series', null, 'Series'],
      ['Series', 1, 'Series'],
      ['Series', 10, 'Series (10)'],
    ]
  }

  it.each(computeSeriesFromSeriesAndVolumeArguments())('given series and volume when computing series name then it is correct', (series, volume, expected) => {
    expect(computeSeriesFromSeriesAndVolume(series, volume)).toBe(expected)
  })
})
