// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/ReferentialDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import '../../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import '../../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import '../../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../../src/infrastructure/jooq/main/ReferentialDao.js'
import '../../../../src/domain/service/KomgaUserLifecycle.js'
import '../../../../src/domain/service/LibraryLifecycle.js'
import '../../../../src/domain/service/SeriesLifecycle.js'
import '../../../../src/domain/service/SeriesMetadataLifecycle.js'
// PORT: équivalent du scan de composants (contexte complet de @SpringBootTest) : dépendances des services
import '../../../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import '../../../../src/infrastructure/jooq/main/BookCommonDao.js'
import '../../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import '../../../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import '../../../../src/infrastructure/jooq/main/HistoricalEventDtoDao.js'
import '../../../../src/infrastructure/jooq/main/KoboDtoDao.js'
import '../../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../../src/infrastructure/jooq/main/PageHashDao.js'
import '../../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../../src/infrastructure/jooq/main/ReadListRequestDao.js'
import '../../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../../src/infrastructure/jooq/main/ReadProgressDtoDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import '../../../../src/infrastructure/jooq/main/SidecarDao.js'
import '../../../../src/infrastructure/jooq/main/SyncPointDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailBookDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailReadListDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailSeriesCollectionDao.js'
import '../../../../src/infrastructure/jooq/main/ThumbnailSeriesDao.js'
import '../../../../src/infrastructure/jooq/tasks/TasksDao.js'
import '../../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../../src/infrastructure/kobo/KepubConverter.js'
import '../../../../src/infrastructure/metadata/barcode/IsbnConfiguration.js'
import '../../../../src/infrastructure/security/PasswordEncoderConfiguration.js'
import '../../../../src/infrastructure/security/session/SessionConfiguration.js'
import '../../../../src/infrastructure/transaction/TransactionConfiguration.js'
import '../../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../../src/infrastructure/search/LuceneHelper.js'
import '../../../../src/infrastructure/search/SearchIndexLifecycle.js'
import { LocalDate } from '@js-joda/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { Author } from '../../../../src/domain/model/Author.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { FilterBy, FilterByEntity, FilterTags } from '../../../../src/domain/model/FilterBy.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { BookMetadataRepository } from '../../../../src/domain/persistence/BookMetadataRepository.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { SeriesMetadataRepository } from '../../../../src/domain/persistence/SeriesMetadataRepository.js'
import { KomgaUserLifecycle } from '../../../../src/domain/service/KomgaUserLifecycle.js'
import { LibraryLifecycle } from '../../../../src/domain/service/LibraryLifecycle.js'
import { SeriesLifecycle } from '../../../../src/domain/service/SeriesLifecycle.js'
import { SeriesMetadataLifecycle } from '../../../../src/domain/service/SeriesMetadataLifecycle.js'
import { ReferentialDao } from '../../../../src/infrastructure/jooq/main/ReferentialDao.js'
import { Pageable } from '../../../../src/port/spring-data.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { any, every, mockk } from '../../../support/mockk.js'
import { makeBook, makeLibrary, makeSeries } from '../../../domain/model/Utils.js'

describe('ReferentialDaoTest', () => {
  // @MockkBean private lateinit var mockEventPublisher: ApplicationEventPublisher
  const mockEventPublisher = mockk<ApplicationEventPublisher>(ApplicationEventPublisher)

  const ctx = springBootTest({}, [{ type: ApplicationEventPublisher, instance: mockEventPublisher }])
  const referentialDao = ctx.getBean(ReferentialDao)
  const userRepository = ctx.getBean(KomgaUserRepository)
  const seriesMetadataLifecycle = ctx.getBean(SeriesMetadataLifecycle)
  const bookMetadataRepository = ctx.getBean(BookMetadataRepository)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const seriesLifecycle = ctx.getBean(SeriesLifecycle)
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  const seriesMetadataRepository = ctx.getBean(SeriesMetadataRepository)

  const library1 = makeLibrary()
  const library2 = makeLibrary()
  const series1 = makeSeries('Series 1').copy({ libraryId: library1.id })
  const series2 = makeSeries('Series 2').copy({ libraryId: library2.id })
  const seriesEmpty = makeSeries('Series Empty').copy({ libraryId: library2.id })
  const seriesShared = makeSeries('Series Shared').copy({ libraryId: library1.id })
  const seriesAge10 = makeSeries('Series Age 10').copy({ libraryId: library1.id })
  const userAll = new KomgaUser({ email: 'user1@example.org', password: 'p' })
  const userLib1 = new KomgaUser({ email: 'user2@example.org', password: 'p', sharedLibrariesIds: new Set([library1.id]), sharedAllLibraries: false })
  const userLabelAllow = new KomgaUser({ email: 'user3@example.org', password: 'p', restrictions: new ContentRestrictions({ labelsAllow: new Set(['item_shared']) }) })
  const userAge10 = new KomgaUser({
    email: 'user4@example.org',
    password: 'p',
    restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 10, restriction: AllowExclude.ALLOW_ONLY }) }),
  })

  // every { mockEventPublisher.publishEvent(any()) } just Runs
  const everyPublishEventJustRuns = () => every(() => mockEventPublisher.publishEvent(any())).justRuns()

  beforeAll(() => {
    everyPublishEventJustRuns()
    libraryRepository.insert(library1)
    libraryRepository.insert(library2)
    seriesLifecycle.createSeries(series1)
    seriesLifecycle.createSeries(series2)
    seriesLifecycle.createSeries(seriesEmpty)
    seriesLifecycle.createSeries(seriesShared)
    seriesLifecycle.createSeries(seriesAge10)
    userRepository.insert(userAll)
    userRepository.insert(userLib1)
    userRepository.insert(userLabelAllow)
    userRepository.insert(userAge10)

    // setup restrictions context
    {
      const it = seriesMetadataRepository.findById(seriesShared.id)
      seriesMetadataRepository.update(it.copy({ sharingLabels: new Set(['item_shared']) }))
    }

    {
      const it = seriesMetadataRepository.findById(seriesAge10.id)
      seriesMetadataRepository.update(it.copy({ ageRating: 10 }))
    }

    // prepare metadata
    {
      const book = makeBook('1', { libraryId: library1.id, seriesId: series1.id })
      seriesLifecycle.addBooks(series1, [book])
      {
        const it = bookMetadataRepository.findById(book.id)
        bookMetadataRepository.update(it.copy({ authors: [new Author({ name: 'item1', role: 'writer' })], releaseDate: LocalDate.of(2002, 1, 1), tags: new Set(['bt1']) }))
      }
      {
        const it = seriesMetadataRepository.findById(series1.id)
        seriesMetadataRepository.update(it.copy({ genres: new Set(['item1']), sharingLabels: new Set(['item1']), language: 'fr', publisher: 'item1', ageRating: 18, tags: new Set(['st1']) }))
      }
    }
    seriesMetadataLifecycle.aggregateMetadata(series1)

    {
      const book = makeBook('2', { libraryId: library2.id, seriesId: series2.id })
      seriesLifecycle.addBooks(series2, [book])
      {
        const it = bookMetadataRepository.findById(book.id)
        bookMetadataRepository.update(
          it.copy({ authors: [new Author({ name: 'item2', role: 'inker' }), new Author({ name: 'item2', role: 'translator' })], releaseDate: LocalDate.of(2002, 2, 1), tags: new Set(['bt2']) }),
        )
      }
      {
        const it = seriesMetadataRepository.findById(series2.id)
        seriesMetadataRepository.update(it.copy({ genres: new Set(['item2']), sharingLabels: new Set(['item2']), language: 'en', publisher: 'item2', ageRating: 19, tags: new Set(['st2']) }))
      }
    }
    seriesMetadataLifecycle.aggregateMetadata(series2)

    {
      const book = makeBook('Empty', { libraryId: library2.id, seriesId: seriesEmpty.id })
      seriesLifecycle.addBooks(seriesEmpty, [book])
    }
    seriesMetadataLifecycle.aggregateMetadata(seriesEmpty)

    {
      const book = makeBook('shared', { libraryId: library1.id, seriesId: seriesShared.id })
      seriesLifecycle.addBooks(seriesShared, [book])
      {
        const it = bookMetadataRepository.findById(book.id)
        bookMetadataRepository.update(it.copy({ authors: [new Author({ name: 'item_shared', role: 'penciller' })], releaseDate: LocalDate.of(2003, 1, 1), tags: new Set(['bt_shared']) }))
      }
      {
        const it = seriesMetadataRepository.findById(seriesShared.id)
        seriesMetadataRepository.update(it.copy({ genres: new Set(['item_shared']), language: 'ja', publisher: 'item_shared', tags: new Set(['st_shared']) }))
      }
    }
    seriesMetadataLifecycle.aggregateMetadata(seriesShared)

    {
      const book = makeBook('10', { libraryId: library1.id, seriesId: seriesAge10.id })
      seriesLifecycle.addBooks(seriesAge10, [book])
      {
        const it = bookMetadataRepository.findById(book.id)
        bookMetadataRepository.update(it.copy({ authors: [new Author({ name: 'item_10', role: 'cover' })], releaseDate: LocalDate.of(2004, 1, 1), tags: new Set(['bt_10']) }))
      }
      {
        const it = seriesMetadataRepository.findById(seriesAge10.id)
        seriesMetadataRepository.update(it.copy({ genres: new Set(['item_10']), sharingLabels: new Set(['item_10']), language: 'sp', publisher: 'item_10', tags: new Set(['st_10']) }))
      }
    }
    seriesMetadataLifecycle.aggregateMetadata(seriesAge10)
  })

  beforeEach(() => {
    everyPublishEventJustRuns()
  })

  afterAll(() => {
    everyPublishEventJustRuns()
    userRepository.findAll().forEach((it) => {
      userLifecycle.deleteUser(it)
    })
    libraryRepository.findAll().forEach((it) => {
      libraryLifecycle.deleteLibrary(it)
    })
    closeContext(ctx)
  })

  describe('Author', () => {
    it('given search when getting authors then matching authors are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAuthors(context, 'shared', null, null, Pageable.unpaged()).content

      expect([...items.map((it) => it.name)].sort()).toEqual(['item_shared'].sort())
    })

    it('given role when getting authors then matching authors are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAuthors(context, null, 'writer', null, Pageable.unpaged()).content

      expect([...items.map((it) => it.name)].sort()).toEqual(['item1'].sort())
    })

    it('given filter by library when getting authors then only matching authors are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAuthors(context, null, null, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), Pageable.unpaged()).content

      expect([...new Set(items.map((it) => it.name))].sort()).toEqual(['item2'].sort())
    })

    it('given user without restrictions when getting authors then all authors are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAuthors(context, null, null, null, Pageable.unpaged()).content

      expect([...new Set(items.map((it) => it.name))].sort()).toEqual(['item1', 'item2', 'item_shared', 'item_10'].sort())
    })

    it('given user with restricted library access when getting authors then only allowed authors are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findAuthors(context, null, null, null, Pageable.unpaged()).content

      expect([...items.map((it) => it.name)].sort()).toEqual(['item1', 'item_shared', 'item_10'].sort())
    })

    it('given user with restricted label access when getting authors then only allowed authors are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findAuthors(context, null, null, null, Pageable.unpaged()).content

      expect([...items.map((it) => it.name)].sort()).toEqual(['item_shared'].sort())
    })

    it('given user with restricted age access when getting authors then only allowed authors are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findAuthors(context, null, null, null, Pageable.unpaged()).content

      expect([...items.map((it) => it.name)].sort()).toEqual(['item_10'].sort())
    })
  })

  describe('AuthorName', () => {
    it('given search when getting authors then matching authors are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAuthorsNames(context, 'shared', null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_shared'].sort())
    })

    it('given role when getting authors then matching authors are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAuthorsNames(context, null, 'writer', null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item1'].sort())
    })

    it('given filter by library when getting authors then only matching authors are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAuthorsNames(context, null, null, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item2'].sort())
    })

    it('given user without restrictions when getting authors then all authors are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAuthorsNames(context, null, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item1', 'item2', 'item_shared', 'item_10'].sort())
    })

    it('given user with restricted library access when getting authors then only allowed authors are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findAuthorsNames(context, null, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item1', 'item_shared', 'item_10'].sort())
    })

    it('given user with restricted label access when getting authors then only allowed authors are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findAuthorsNames(context, null, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_shared'].sort())
    })

    it('given user with restricted age access when getting authors then only allowed authors are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findAuthorsNames(context, null, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_10'].sort())
    })
  })

  describe('AuthorRole', () => {
    it('given filter by library when getting authors then only matching authors are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAuthorsRoles(context, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['inker', 'translator'].sort())
    })

    it('given user without restrictions when getting authors then all authors are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAuthorsRoles(context, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['writer', 'inker', 'penciller', 'cover', 'translator'].sort())
    })

    it('given user with restricted library access when getting authors then only allowed authors are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findAuthorsRoles(context, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['writer', 'penciller', 'cover'].sort())
    })

    it('given user with restricted label access when getting authors then only allowed authors are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findAuthorsRoles(context, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['penciller'].sort())
    })

    it('given user with restricted age access when getting authors then only allowed authors are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findAuthorsRoles(context, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['cover'].sort())
    })
  })

  describe('Genre', () => {
    it('given search when getting genres then all genres are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findGenres(context, 'shared', null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_shared'].sort())
    })

    it('given filter by library when getting genres then only matching genres are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findGenres(context, null, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item2'].sort())
    })

    it('given user without restrictions when getting genres then all genres are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findGenres(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item1', 'item2', 'item_shared', 'item_10'].sort())
    })

    it('given user with restricted library access when getting genres then only allowed genres are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findGenres(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item1', 'item_shared', 'item_10'].sort())
    })

    it('given user with restricted label access when getting genres then only allowed genres are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findGenres(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_shared'].sort())
    })

    it('given user with restricted age access when getting genres then only allowed genres are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findGenres(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_10'].sort())
    })
  })

  describe('BookTag', () => {
    it('given search when getting tags then all tags are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findTags(context, 'shared', null, FilterTags.BOOK, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['bt_shared'].sort())
    })

    it('given filter by library when getting tags then only matching tags are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findTags(context, null, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), FilterTags.BOOK, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['bt2'].sort())
    })

    it('given user without restrictions when getting tags then all tags are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findTags(context, null, null, FilterTags.BOOK, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['bt1', 'bt2', 'bt_shared', 'bt_10'].sort())
    })

    it('given user with restricted library access when getting tags then only allowed tags are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findTags(context, null, null, FilterTags.BOOK, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['bt1', 'bt_shared', 'bt_10'].sort())
    })

    it('given user with restricted label access when getting tags then only allowed tags are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findTags(context, null, null, FilterTags.BOOK, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['bt_shared'].sort())
    })

    it('given user with restricted age access when getting tags then only allowed tags are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findTags(context, null, null, FilterTags.BOOK, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['bt_10'].sort())
    })
  })

  describe('SeriesTag', () => {
    it('given search when getting tags then all tags are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findTags(context, 'shared', null, FilterTags.SERIES, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st_shared'].sort())
    })

    it('given filter by library when getting tags then only matching tags are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findTags(context, null, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), FilterTags.SERIES, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st2'].sort())
    })

    it('given user without restrictions when getting tags then all tags are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findTags(context, null, null, FilterTags.SERIES, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st1', 'st2', 'st_shared', 'st_10'].sort())
    })

    it('given user with restricted library access when getting tags then only allowed tags are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findTags(context, null, null, FilterTags.SERIES, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st1', 'st_shared', 'st_10'].sort())
    })

    it('given user with restricted label access when getting tags then only allowed tags are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findTags(context, null, null, FilterTags.SERIES, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st_shared'].sort())
    })

    it('given user with restricted age access when getting tags then only allowed tags are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findTags(context, null, null, FilterTags.SERIES, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st_10'].sort())
    })
  })

  describe('BothTag', () => {
    it('given search when getting tags then all tags are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findTags(context, 'shared', null, FilterTags.BOTH, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st_shared', 'bt_shared'].sort())
    })

    it('given filter by library when getting tags then only matching tags are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findTags(context, null, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), FilterTags.BOTH, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st2', 'bt2'].sort())
    })

    it('given user without restrictions when getting tags then all tags are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findTags(context, null, null, FilterTags.BOTH, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st1', 'st2', 'st_shared', 'st_10', 'bt1', 'bt2', 'bt_shared', 'bt_10'].sort())
    })

    it('given user with restricted library access when getting tags then only allowed tags are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findTags(context, null, null, FilterTags.BOTH, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st1', 'st_shared', 'st_10', 'bt1', 'bt_shared', 'bt_10'].sort())
    })

    it('given user with restricted label access when getting tags then only allowed tags are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findTags(context, null, null, FilterTags.BOTH, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st_shared', 'bt_shared'].sort())
    })

    it('given user with restricted age access when getting tags then only allowed tags are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findTags(context, null, null, FilterTags.BOTH, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['st_10', 'bt_10'].sort())
    })
  })

  describe('SharingLabel', () => {
    it('given search when getting sharing labels then all sharing labels are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findSharingLabels(context, 'shared', null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_shared'].sort())
    })

    it('given filter by library when getting sharing labels then only matching sharing labels are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findSharingLabels(context, null, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item2'].sort())
    })

    it('given user without restrictions when getting sharing labels then all sharing labels are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findSharingLabels(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item1', 'item2', 'item_shared', 'item_10'].sort())
    })

    it('given user with restricted library access when getting sharing labels then only allowed sharing labels are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findSharingLabels(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item1', 'item_shared', 'item_10'].sort())
    })

    it('given user with restricted label access when getting sharing labels then only allowed sharing labels are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findSharingLabels(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_shared'].sort())
    })

    it('given user with restricted age access when getting sharing labels then only allowed sharing labels are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findSharingLabels(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_10'].sort())
    })
  })

  describe('Publisher', () => {
    it('given search when getting publishers then all publishers are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findPublishers(context, 'shared', null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_shared'].sort())
    })

    it('given filter by library when getting publishers then only matching publishers are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findPublishers(context, null, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item2'].sort())
    })

    it('given user without restrictions when getting publishers then all publishers are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findPublishers(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item1', 'item2', 'item_shared', 'item_10'].sort())
    })

    it('given user with restricted library access when getting publishers then only allowed publishers are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findPublishers(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item1', 'item_shared', 'item_10'].sort())
    })

    it('given user with restricted label access when getting publishers then only allowed publishers are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findPublishers(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_shared'].sort())
    })

    it('given user with restricted age access when getting publishers then only allowed publishers are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findPublishers(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['item_10'].sort())
    })
  })

  describe('Language', () => {
    it('given search when getting languages then all languages are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findLanguages(context, 'j', null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['ja'].sort())
    })

    it('given filter by library when getting languages then only matching languages are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findLanguages(context, null, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['en'].sort())
    })

    it('given user without restrictions when getting languages then all languages are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findLanguages(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['fr', 'en', 'ja', 'sp'].sort())
    })

    it('given user with restricted library access when getting languages then only allowed languages are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findLanguages(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['fr', 'ja', 'sp'].sort())
    })

    it('given user with restricted label access when getting languages then only allowed languages are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findLanguages(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['ja'].sort())
    })

    it('given user with restricted age access when getting languages then only allowed languages are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findLanguages(context, null, null, Pageable.unpaged()).content

      expect([...items].sort()).toEqual(['sp'].sort())
    })
  })

  describe('AgeRating', () => {
    it('given filter by library when getting age ratings then only matching age ratings are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAgeRatings(context, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), Pageable.unpaged()).content

      expect(items).toEqual([19])
    })

    it('given user without restrictions when getting age ratings then all age ratings are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findAgeRatings(context, null, Pageable.unpaged()).content

      expect(items).toEqual([10, 18, 19])
    })

    it('given user with restricted library access when getting age ratings then only allowed age ratings are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findAgeRatings(context, null, Pageable.unpaged()).content

      expect(items).toEqual([10, 18])
    })

    it('given user with restricted label access when getting age ratings then only allowed age ratings are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findAgeRatings(context, null, Pageable.unpaged()).content

      expect(items).toEqual([])
    })

    it('given user with restricted age access when getting age ratings then only allowed age ratings are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findAgeRatings(context, null, Pageable.unpaged()).content

      expect(items).toEqual([10])
    })
  })

  describe('SeriesReleaseYear', () => {
    it('given filter by library when getting series release dates then only matching series release dates are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findSeriesReleaseYears(context, new FilterBy({ type: FilterByEntity.LIBRARY, ids: new Set([library2.id]) }), Pageable.unpaged()).content

      expect(items).toEqual(['2002'])
    })

    it('given user without restrictions when getting series release dates then all series release dates are returned', () => {
      const context = new SearchContext(userAll)
      const items = referentialDao.findSeriesReleaseYears(context, null, Pageable.unpaged()).content

      expect(items).toEqual(['2004', '2003', '2002'])
    })

    it('given user with restricted library access when getting series release dates then only allowed series release dates are returned', () => {
      const context = new SearchContext(userLib1)
      const items = referentialDao.findSeriesReleaseYears(context, null, Pageable.unpaged()).content

      expect(items).toEqual(['2004', '2003', '2002'])
    })

    it('given user with restricted label access when getting series release dates then only allowed series release dates are returned', () => {
      const context = new SearchContext(userLabelAllow)
      const items = referentialDao.findSeriesReleaseYears(context, null, Pageable.unpaged()).content

      expect(items).toEqual(['2003'])
    })

    it('given user with restricted age access when getting series release dates then only allowed series release dates are returned', () => {
      const context = new SearchContext(userAge10)
      const items = referentialDao.findSeriesReleaseYears(context, null, Pageable.unpaged()).content

      expect(items).toEqual(['2004'])
    })
  })
})
