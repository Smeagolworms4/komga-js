// @port-of komga/src/test/kotlin/org/gotson/komga/application/tasks/TaskProcessorTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires
import '../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDao.js'
import '../../../src/infrastructure/jooq/main/SeriesMetadataDao.js'
import '../../../src/infrastructure/jooq/main/SeriesCollectionDao.js'
import '../../../src/infrastructure/jooq/main/SidecarDao.js'
import '../../../src/infrastructure/jooq/main/BookDao.js'
import '../../../src/infrastructure/jooq/main/BookMetadataDao.js'
import '../../../src/infrastructure/jooq/main/BookMetadataAggregationDao.js'
import '../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../src/infrastructure/jooq/main/MediaDao.js'
import '../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../src/infrastructure/jooq/main/ReadListDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailBookDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailSeriesDao.js'
import '../../../src/infrastructure/jooq/main/HistoricalEventDao.js'
import '../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import '../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../src/infrastructure/jooq/main/PageHashDao.js'
import '../../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import '../../../src/infrastructure/jooq/main/SyncPointDao.js'
import '../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import '../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../src/infrastructure/jooq/tasks/TasksDao.js'
import '../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import '../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../src/infrastructure/transaction/TransactionConfiguration.js'
import '../../../src/infrastructure/cache/TransientBookCache.js'
import '../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../src/infrastructure/search/LuceneHelper.js'
import '../../../src/infrastructure/search/SearchIndexLifecycle.js'
import '../../../src/infrastructure/security/PasswordEncoderConfiguration.js'
import '../../../src/infrastructure/security/session/SessionConfiguration.js'
import '../../../src/infrastructure/metadata/barcode/IsbnConfiguration.js'
import '../../../src/infrastructure/metadata/comicrack/ComicInfoProvider.js'
import '../../../src/infrastructure/metadata/localartwork/LocalArtworkProvider.js'
import '../../../src/infrastructure/metadata/mylar/MylarSeriesProvider.js'
import '../../../src/infrastructure/jooq/main/ReadListRequestDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailReadListDao.js'
import '../../../src/infrastructure/jooq/main/ThumbnailSeriesCollectionDao.js'
import '../../../src/domain/service/FileSystemScanner.js'
import '../../../src/domain/service/SeriesLifecycle.js'
import '../../../src/domain/service/BookLifecycle.js'
import '../../../src/domain/service/ReadListLifecycle.js'
import '../../../src/domain/service/SeriesCollectionLifecycle.js'
import '../../../src/domain/service/KomgaUserLifecycle.js'
import '../../../src/domain/service/LibraryLifecycle.js'
import '../../../src/domain/service/LibraryContentLifecycle.js'
import '../../../src/infrastructure/kobo/KepubConverter.js'
import '../../../src/domain/service/BookMetadataLifecycle.js'
import '../../../src/domain/service/SeriesMetadataLifecycle.js'
import '../../../src/domain/service/LocalArtworkLifecycle.js'
import '../../../src/domain/service/BookImporter.js'
import '../../../src/domain/service/BookConverter.js'
import '../../../src/domain/service/BookPageEditor.js'
import '../../../src/domain/service/PageHashLifecycle.js'
import '../../../src/port/micrometer.js'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { TaskEmitter } from '../../../src/application/tasks/TaskEmitter.js'
import { TaskProcessor } from '../../../src/application/tasks/TaskProcessor.js'
import type { Book } from '../../../src/domain/model/Book.js'
import { BookRepository } from '../../../src/domain/persistence/BookRepository.js'
import { BookLifecycle } from '../../../src/domain/service/BookLifecycle.js'
import { threadSleep } from '../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { any, capture, clearMocks, every, mockk, slot, verify } from '../../support/mockk.js'
import { makeBook } from '../../domain/model/Utils.js'

describe('TaskProcessorTest', () => {
  // @MockkBean
  const mockBookLifecycle = mockk(BookLifecycle)

  // @MockkBean
  const mockBookRepository = mockk(BookRepository)

  const ctx = springBootTest({}, [
    { type: BookLifecycle, instance: mockBookLifecycle },
    { type: BookRepository, instance: mockBookRepository },
  ])
  const taskEmitter = ctx.getBean(TaskEmitter)
  const taskProcessor = ctx.getBean(TaskProcessor)
  afterAll(() => closeContext(ctx))

  // PORT: springmockk réinitialise les @MockkBean après chaque test
  afterEach(() => clearMocks(mockBookLifecycle, mockBookRepository))

  // PORT: Thread.sleep(sleep) -> attente asynchrone : les tâches s'exécutent sur la boucle d'événements
  // (port/spring-scheduling.ts), qu'une attente bloquante empêcherait de tourner
  async function testTasks(block: () => void, sleep = 3_000): Promise<void> {
    taskProcessor.processTasks = false
    block()
    taskProcessor.processTasks = true
    taskProcessor.processAvailableTask()
    await delay(sleep)
  }

  it('when similar tasks are submitted then only one is executed', async () => {
    every(() => mockBookRepository.findByIdOrNull(any())).returns(makeBook('id'))
    every(() => mockBookLifecycle.analyzeAndPersist(any())).returns(new Set())

    const book = makeBook('book')

    await testTasks(() => {
      for (let i = 0; i < 100; i++) {
        taskEmitter.analyzeBook(book)
      }
    })

    verify({ exactly: 1 }, () => mockBookLifecycle.analyzeAndPersist(any()))
  }, 10_000)

  it('when high priority tasks are submitted then they are executed first', async () => {
    const s = slot<string>()
    const calls: Book[] = []
    every(() => mockBookRepository.findByIdOrNull(capture(s))).answers(() => {
      threadSleep(1_00)
      return makeBook(s.captured)
    })
    every(() => mockBookLifecycle.analyzeAndPersist(capture(calls))).returns(new Set())

    await testTasks(() => {
      for (let it = 0; it <= 9; it++) {
        taskEmitter.analyzeBook(makeBook(`${it}`, { id: `${it}` }), { priority: it })
      }
    })

    verify({ exactly: 10 }, () => mockBookLifecycle.analyzeAndPersist(any()))
    expect(calls.map((it) => it.name)).toEqual(Array.from({ length: 10 }, (_, i) => `${9 - i}`))
  }, 10_000)
})
