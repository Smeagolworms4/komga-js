// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/LibraryLifecycleTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
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
import '../../../src/infrastructure/jooq/tasks/TasksDao.js'
import '../../../src/infrastructure/configuration/StaticConfiguration.js'
import '../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import '../../../src/infrastructure/mediacontainer/divina/ZipExtractor.js'
import '../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import '../../../src/infrastructure/kobo/KepubConverter.js'
import '../../../src/infrastructure/transaction/TransactionConfiguration.js'
import '../../../src/infrastructure/jooq/main/BookDtoDao.js'
import '../../../src/infrastructure/jooq/main/SeriesDtoDao.js'
import '../../../src/infrastructure/search/LuceneConfiguration.js'
import '../../../src/infrastructure/search/LuceneSyncCommitter.js'
import '../../../src/infrastructure/search/LuceneAsyncCommitter.js'
import '../../../src/infrastructure/search/LuceneHelper.js'
import '../../../src/infrastructure/search/SearchIndexLifecycle.js'
import '../../../src/domain/service/LibraryLifecycle.js'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DirectoryNotFoundException, DuplicateNameException, PathContainedInPath } from '../../../src/domain/model/Exceptions.js'
import { Library } from '../../../src/domain/model/Library.js'
import { LibraryRepository } from '../../../src/domain/persistence/LibraryRepository.js'
import { LibraryLifecycle } from '../../../src/domain/service/LibraryLifecycle.js'
import { FileNotFoundException } from '../../../src/port/java-io.js'
import { URL, pathToUrl } from '../../../src/port/java-net.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'

// PORT: catchThrowable d'AssertJ
function catchThrowable(f: () => unknown): unknown {
  try {
    f()
    return null
  } catch (e) {
    return e
  }
}

// PORT: @TempDir -> répertoire temporaire supprimé en fin de fichier de test
const tempDirs: string[] = []
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'junit'))
  tempDirs.push(d)
  return d
}

// PORT: Files.createTempFile(null, null) (.also { it.toFile().deleteOnExit() })
function createTempFile(): string {
  const d = tempDir()
  const f = join(d, `${Date.now()}.tmp`)
  writeFileSync(f, '')
  return f
}

// PORT: Files.createTempDirectory(parent, prefix)
function createTempDirectory(parent: string, prefix: string | null): string {
  return mkdtempSync(`${parent}/${prefix ?? ''}`)
}

describe('LibraryLifecycleTest', () => {
  const ctx = springBootTest()
  const libraryRepository = ctx.getBean(LibraryRepository)
  const libraryLifecycle = ctx.getBean(LibraryLifecycle)
  afterAll(async () => {
    await closeContext(ctx)
    for (const d of tempDirs) rmSync(d, { recursive: true, force: true })
  })

  afterEach(() => {
    libraryRepository.deleteAll()
  })

  describe('Add', () => {
    it('when adding library with non-existent root folder then exception is thrown', () => {
      // when
      const thrown = catchThrowable(() => libraryLifecycle.addLibrary(new Library({ name: 'test', root: new URL('file:/non-existent') })))

      // then
      expect(thrown).toBeInstanceOf(FileNotFoundException)
    })

    it('when adding library with non-directory root folder then exception is thrown', () => {
      // when
      const thrown = catchThrowable(() => {
        libraryLifecycle.addLibrary(
          new Library({
            name: 'test',
            root: pathToUrl(createTempFile()),
          }),
        )
      })

      // then
      expect(thrown).toBeInstanceOf(DirectoryNotFoundException)
    })

    it('given existing library when adding library with same name then exception is thrown', () => {
      const path1 = tempDir()
      const path2 = tempDir()
      // given
      libraryLifecycle.addLibrary(new Library({ name: 'test', root: pathToUrl(path1) }))

      // when
      const thrown = catchThrowable(() => {
        libraryLifecycle.addLibrary(new Library({ name: 'test', root: pathToUrl(path2) }))
      })

      // then
      expect(thrown).toBeInstanceOf(DuplicateNameException)
    })

    it('given existing library when adding library with root folder as child of existing library then exception is thrown', () => {
      const parent = tempDir()
      // given
      libraryLifecycle.addLibrary(new Library({ name: 'parent', root: pathToUrl(parent) }))

      // when
      const child = createTempDirectory(parent, '')
      const thrown = catchThrowable(() => {
        libraryLifecycle.addLibrary(new Library({ name: 'child', root: pathToUrl(child) }))
      })

      // then
      expect(thrown).toBeInstanceOf(PathContainedInPath)
      expect((thrown as Error).message).toContain('child')
    })

    it('given existing library when adding library with root folder as parent of existing library then exception is thrown', () => {
      const parent = tempDir()
      // given
      const child = createTempDirectory(parent, null)
      libraryLifecycle.addLibrary(new Library({ name: 'child', root: pathToUrl(child) }))

      // when
      const thrown = catchThrowable(() => {
        libraryLifecycle.addLibrary(new Library({ name: 'parent', root: pathToUrl(parent) }))
      })

      // then
      expect(thrown).toBeInstanceOf(PathContainedInPath)
      expect((thrown as Error).message).toContain('parent')
    })
  })

  describe('Update', () => {
    let rootFolder: string
    let library: Library

    beforeAll(() => {
      const root = tempDir()
      rootFolder = root
      library = new Library({ name: 'Existing', root: pathToUrl(rootFolder) })
    })

    it('given existing library when updating with non-existent root folder then exception is thrown', () => {
      // given
      const existing = libraryLifecycle.addLibrary(library)

      // when
      const toUpdate = existing.copy({ name: 'test', root: new URL('file:/non-existent') })
      const thrown = catchThrowable(() => libraryLifecycle.updateLibrary(toUpdate))

      // then
      expect(thrown).toBeInstanceOf(FileNotFoundException)
    })

    it('given existing library when updating with non-directory root folder then exception is thrown', () => {
      // given
      const existing = libraryLifecycle.addLibrary(library)

      // when
      const toUpdate = existing.copy({
        name: 'test',
        root: pathToUrl(createTempFile()),
      })
      const thrown = catchThrowable(() => {
        libraryLifecycle.updateLibrary(toUpdate)
      })

      // then
      expect(thrown).toBeInstanceOf(DirectoryNotFoundException)
    })

    it('given single existing library when updating library with same name then it is updated', () => {
      // given
      const existing = libraryLifecycle.addLibrary(library)

      // when
      const thrown = catchThrowable(() => {
        libraryLifecycle.updateLibrary(existing)
      })

      // then
      expect(thrown).toBeNull()
    })

    it('given existing library when updating library with same name then exception is thrown', () => {
      const path1 = tempDir()
      const path2 = tempDir()
      // given
      libraryLifecycle.addLibrary(new Library({ name: 'test', root: pathToUrl(path1) }))
      const existing = libraryLifecycle.addLibrary(library)

      // when
      const toUpdate = existing.copy({ name: 'test', root: pathToUrl(path2) })
      const thrown = catchThrowable(() => {
        libraryLifecycle.updateLibrary(toUpdate)
      })

      // then
      expect(thrown).toBeInstanceOf(DuplicateNameException)
    })

    it('given single existing library when updating library with root folder as child of existing library then no exception is thrown', () => {
      // given
      const existing = libraryLifecycle.addLibrary(library)

      // when
      const child = createTempDirectory(rootFolder, '')
      const toUpdate = existing.copy({ root: pathToUrl(child) })
      const thrown = catchThrowable(() => {
        libraryLifecycle.updateLibrary(toUpdate)
      })

      // then
      expect(thrown).toBeNull()
    })

    it('given existing library when updating library with root folder as child of existing library then exception is thrown', () => {
      const parent = tempDir()
      // given
      libraryLifecycle.addLibrary(new Library({ name: 'parent', root: pathToUrl(parent) }))
      const existing = libraryLifecycle.addLibrary(library)

      // when
      const child = createTempDirectory(parent, '')
      const toUpdate = existing.copy({ root: pathToUrl(child) })
      const thrown = catchThrowable(() => {
        libraryLifecycle.updateLibrary(toUpdate)
      })

      // then
      expect(thrown).toBeInstanceOf(PathContainedInPath)
      expect((thrown as Error).message).toContain('child')
    })

    it('given single existing library when updating library with root folder as parent of existing library then no exception is thrown', () => {
      const parent = tempDir()
      // given
      const child = createTempDirectory(parent, null)
      const existing = libraryLifecycle.addLibrary(new Library({ name: 'child', root: pathToUrl(child) }))

      // when
      const toUpdate = existing.copy({ root: pathToUrl(parent) })
      const thrown = catchThrowable(() => {
        libraryLifecycle.updateLibrary(toUpdate)
      })

      // then
      expect(thrown).toBeNull()
    })

    it('given existing library when updating library with root folder as parent of existing library then exception is thrown', () => {
      const parent = tempDir()
      // given
      const child = createTempDirectory(parent, null)
      libraryLifecycle.addLibrary(new Library({ name: 'child', root: pathToUrl(child) }))
      const existing = libraryLifecycle.addLibrary(library)

      // when
      const toUpdate = existing.copy({ root: pathToUrl(parent) })
      const thrown = catchThrowable(() => {
        libraryLifecycle.updateLibrary(toUpdate)
      })

      // then
      expect(thrown).toBeInstanceOf(PathContainedInPath)
      expect((thrown as Error).message).toContain('parent')
    })
  })
})
