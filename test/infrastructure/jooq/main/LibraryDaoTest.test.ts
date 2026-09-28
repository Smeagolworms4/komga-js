// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/LibraryDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { Library } from '../../../../src/domain/model/Library.js'
import { LibraryDao } from '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import { URL } from '../../../../src/port/java-net.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { expectCloseTo } from '../TestUtils.js'

describe('LibraryDaoTest', () => {
  const ctx = springBootTest()
  const libraryDao = ctx.getBean(LibraryDao)
  afterAll(() => closeContext(ctx))

  afterEach(() => {
    libraryDao.deleteAll()
    expect(libraryDao.count()).toBe(0)
  })

  it('given a library when inserting then it is persisted', () => {
    const now = LocalDateTime.now()
    const library = new Library({
      name: 'Library',
      root: new URL('file://library'),
    })

    libraryDao.insert(library)
    const created = libraryDao.findById(library.id)

    expectCloseTo(created.createdDate, now)
    expectCloseTo(created.lastModifiedDate, now)
    expect(created.name).toBe(library.name)
    expect(created.root.equals(library.root)).toBe(true)
  })

  it('given existing library when updating then it is persisted', () => {
    const library = new Library({
      name: 'Library',
      root: new URL('file://library'),
    })
    libraryDao.insert(library)

    const modificationDate = LocalDateTime.now()

    const updated = libraryDao.findById(library.id).copy({
      name: 'LibraryUpdated',
      root: new URL('file://library2'),
      importEpubSeries: false,
      importEpubBook: false,
      importComicInfoCollection: false,
      importComicInfoSeries: false,
      importComicInfoBook: false,
      importComicInfoReadList: false,
      importComicInfoSeriesAppendVolume: false,
      importMylarSeries: false,
      importBarcodeIsbn: false,
      importLocalArtwork: false,
      repairExtensions: true,
      convertToCbz: true,
      emptyTrashAfterScan: true,
      seriesCover: Library.SeriesCover.LAST,
      hashFiles: false,
      hashPages: true,
      analyzeDimensions: false,
      scanForceModifiedTime: true,
      scanCbx: false,
      scanEpub: false,
      scanPdf: false,
      scanInterval: Library.ScanInterval.DAILY,
      scanOnStartup: true,
      scanDirectoryExclusions: new Set(['a', 'b']),
    })

    libraryDao.update(updated)
    const modified = libraryDao.findById(updated.id)

    expect(modified.id).toBe(updated.id)
    expect(modified.createdDate.equals(updated.createdDate)).toBe(true)
    expectCloseTo(modified.lastModifiedDate, modificationDate)
    expect(modified.lastModifiedDate.equals(updated.lastModifiedDate)).toBe(false)

    expect(modified.name).toBe(updated.name)
    expect(modified.root.equals(updated.root)).toBe(true)
    expect(modified.importEpubSeries).toBe(updated.importEpubSeries)
    expect(modified.importEpubBook).toBe(updated.importEpubBook)
    expect(modified.importComicInfoCollection).toBe(updated.importComicInfoCollection)
    expect(modified.importComicInfoSeries).toBe(updated.importComicInfoSeries)
    expect(modified.importComicInfoBook).toBe(updated.importComicInfoBook)
    expect(modified.importComicInfoReadList).toBe(updated.importComicInfoReadList)
    expect(modified.importComicInfoSeriesAppendVolume).toBe(updated.importComicInfoSeriesAppendVolume)
    expect(modified.importBarcodeIsbn).toBe(updated.importBarcodeIsbn)
    expect(modified.importLocalArtwork).toBe(updated.importLocalArtwork)
    expect(modified.importMylarSeries).toBe(updated.importMylarSeries)
    expect(modified.repairExtensions).toBe(updated.repairExtensions)
    expect(modified.convertToCbz).toBe(updated.convertToCbz)
    expect(modified.emptyTrashAfterScan).toBe(updated.emptyTrashAfterScan)
    expect(modified.seriesCover).toBe(updated.seriesCover)
    expect(modified.hashFiles).toBe(updated.hashFiles)
    expect(modified.hashPages).toBe(updated.hashPages)
    expect(modified.analyzeDimensions).toBe(updated.analyzeDimensions)
    expect(modified.scanForceModifiedTime).toBe(updated.scanForceModifiedTime)
    expect(modified.scanCbx).toBe(updated.scanCbx)
    expect(modified.scanEpub).toBe(updated.scanEpub)
    expect(modified.scanPdf).toBe(updated.scanPdf)
    expect(modified.scanInterval).toBe(updated.scanInterval)
    expect(modified.scanOnStartup).toBe(updated.scanOnStartup)
    expect([...modified.scanDirectoryExclusions].sort()).toEqual([...updated.scanDirectoryExclusions].sort())
  })

  it('given a library when deleting then it is deleted', () => {
    const library = new Library({
      name: 'Library',
      root: new URL('file://library'),
    })

    libraryDao.insert(library)
    expect(libraryDao.count()).toBe(1)

    libraryDao.delete(library.id)

    expect(libraryDao.count()).toBe(0)
  })

  it('given libraries when deleting all then all are deleted', () => {
    const library = new Library({
      name: 'Library',
      root: new URL('file://library'),
    })
    const library2 = new Library({
      name: 'Library2',
      root: new URL('file://library2'),
    })

    libraryDao.insert(library)
    libraryDao.insert(library2)
    expect(libraryDao.count()).toBe(2)

    libraryDao.deleteAll()

    expect(libraryDao.count()).toBe(0)
  })

  it('given libraries when finding all then all are returned', () => {
    const library = new Library({
      name: 'Library',
      root: new URL('file://library'),
    })
    const library2 = new Library({
      name: 'Library2',
      root: new URL('file://library2'),
    })

    libraryDao.insert(library)
    libraryDao.insert(library2)

    const all = libraryDao.findAll()

    expect(all).toHaveLength(2)
    expect(all.map((it) => it.name).sort()).toEqual(['Library', 'Library2'])
  })

  it('given libraries when finding all by id then all are returned', () => {
    const library = new Library({
      name: 'Library',
      root: new URL('file://library'),
    })
    const library2 = new Library({
      name: 'Library2',
      root: new URL('file://library2'),
    })

    libraryDao.insert(library)
    libraryDao.insert(library2)

    const all = libraryDao.findAllByIds([library.id, library2.id])

    expect(all).toHaveLength(2)
    expect(all.map((it) => it.name).sort()).toEqual(['Library', 'Library2'])
  })

  it('given existing library when finding by id then library is returned', () => {
    const library = new Library({
      name: 'Library',
      root: new URL('file://library'),
    })

    libraryDao.insert(library)

    const found = libraryDao.findByIdOrNull(library.id)

    expect(found).not.toBeNull()
    expect(found?.name).toBe('Library')
  })

  it('given non-existing library when finding by id then null is returned', () => {
    const found = libraryDao.findByIdOrNull('1287386')

    expect(found).toBeNull()
  })
})
