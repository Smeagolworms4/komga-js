// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/LibraryDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { Library } from '../../../domain/model/Library.js'
import { LibraryRepository } from '../../../domain/persistence/LibraryRepository.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import { URL } from '../../../port/java-net.js'
import type { Record, Select } from '../../../port/jooq/core.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { type LibraryRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { distinctSet, first, firstOrNull, mapNotNull } from '../../../port/kotlin.js'
import { component } from '../../../port/spring.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'

export class LibraryDao extends SplitDslDaoBase implements LibraryRepository {
  private readonly l = Tables.LIBRARY
  private readonly ul = Tables.USER_LIBRARY_SHARING
  private readonly le = Tables.LIBRARY_EXCLUSIONS

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  findByIdOrNull(libraryId: string): Library | null {
    return firstOrNull(this.fetchAndMap(this.findOne(libraryId)))
  }

  findById(libraryId: string): Library {
    return first(this.fetchAndMap(this.findOne(libraryId)))
  }

  private findOne(libraryId: string): Select {
    return this.selectBase(this.dslRO).where(this.l.ID.eq(libraryId))
  }

  findAll(): Library[] {
    return this.fetchAndMap(this.selectBase(this.dslRO))
  }

  findAllByIds(libraryIds: Iterable<string>): Library[] {
    return this.fetchAndMap(this.selectBase(this.dslRO).where(this.l.ID.in(libraryIds)))
  }

  private selectBase(self: DSLContext): Select {
    return self.select().from(this.l).leftJoin(this.le).onKey()
  }

  private fetchAndMap(self: Select): Library[] {
    return [
      ...self.fetchGroups(
        (it: Record) => it.into(this.l),
        (it: Record) => it.into(this.le),
      ),
    ].map(([lr, ler]) => this.toDomain(lr, distinctSet(mapNotNull(ler, (it) => it.exclusion))))
  }

  // @Transactional
  delete(libraryId: string): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.le).where(this.le.LIBRARY_ID.eq(libraryId)).execute()
      this.dslRW.deleteFrom(this.ul).where(this.ul.LIBRARY_ID.eq(libraryId)).execute()
      this.dslRW.deleteFrom(this.l).where(this.l.ID.eq(libraryId)).execute()
    })
  }

  // @Transactional
  deleteAll(): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.le).execute()
      this.dslRW.deleteFrom(this.ul).execute()
      this.dslRW.deleteFrom(this.l).execute()
    })
  }

  // @Transactional
  insert(library: Library): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .insertInto(this.l)
        .set(this.l.ID, library.id)
        .set(this.l.NAME, library.name)
        .set(this.l.ROOT, library.root.toString())
        .set(this.l.IMPORT_COMICINFO_BOOK, library.importComicInfoBook)
        .set(this.l.IMPORT_COMICINFO_SERIES, library.importComicInfoSeries)
        .set(this.l.IMPORT_COMICINFO_COLLECTION, library.importComicInfoCollection)
        .set(this.l.IMPORT_COMICINFO_READLIST, library.importComicInfoReadList)
        .set(this.l.IMPORT_COMICINFO_SERIES_APPEND_VOLUME, library.importComicInfoSeriesAppendVolume)
        .set(this.l.IMPORT_EPUB_BOOK, library.importEpubBook)
        .set(this.l.IMPORT_EPUB_SERIES, library.importEpubSeries)
        .set(this.l.IMPORT_MYLAR_SERIES, library.importMylarSeries)
        .set(this.l.IMPORT_LOCAL_ARTWORK, library.importLocalArtwork)
        .set(this.l.IMPORT_BARCODE_ISBN, library.importBarcodeIsbn)
        .set(this.l.SCAN_FORCE_MODIFIED_TIME, library.scanForceModifiedTime)
        .set(this.l.SCAN_CBX, library.scanCbx)
        .set(this.l.SCAN_PDF, library.scanPdf)
        .set(this.l.SCAN_EPUB, library.scanEpub)
        .set(this.l.SCAN_STARTUP, library.scanOnStartup)
        .set(this.l.SCAN_INTERVAL, library.scanInterval.toString())
        .set(this.l.REPAIR_EXTENSIONS, library.repairExtensions)
        .set(this.l.CONVERT_TO_CBZ, library.convertToCbz)
        .set(this.l.EMPTY_TRASH_AFTER_SCAN, library.emptyTrashAfterScan)
        .set(this.l.SERIES_COVER, library.seriesCover.toString())
        .set(this.l.HASH_FILES, library.hashFiles)
        .set(this.l.HASH_PAGES, library.hashPages)
        .set(this.l.HASH_KOREADER, library.hashKoreader)
        .set(this.l.ANALYZE_DIMENSIONS, library.analyzeDimensions)
        .set(this.l.ONESHOTS_DIRECTORY, library.oneshotsDirectory)
        .set(this.l.UNAVAILABLE_DATE, library.unavailableDate)
        .execute()

      this.insertDirectoryExclusions(this.dslRW, library)
    })
  }

  // @Transactional
  update(library: Library): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .update(this.l)
        .set(this.l.NAME, library.name)
        .set(this.l.ROOT, library.root.toString())
        .set(this.l.IMPORT_COMICINFO_BOOK, library.importComicInfoBook)
        .set(this.l.IMPORT_COMICINFO_SERIES, library.importComicInfoSeries)
        .set(this.l.IMPORT_COMICINFO_COLLECTION, library.importComicInfoCollection)
        .set(this.l.IMPORT_COMICINFO_READLIST, library.importComicInfoReadList)
        .set(this.l.IMPORT_COMICINFO_SERIES_APPEND_VOLUME, library.importComicInfoSeriesAppendVolume)
        .set(this.l.IMPORT_EPUB_BOOK, library.importEpubBook)
        .set(this.l.IMPORT_EPUB_SERIES, library.importEpubSeries)
        .set(this.l.IMPORT_MYLAR_SERIES, library.importMylarSeries)
        .set(this.l.IMPORT_LOCAL_ARTWORK, library.importLocalArtwork)
        .set(this.l.IMPORT_BARCODE_ISBN, library.importBarcodeIsbn)
        .set(this.l.SCAN_FORCE_MODIFIED_TIME, library.scanForceModifiedTime)
        .set(this.l.SCAN_CBX, library.scanCbx)
        .set(this.l.SCAN_PDF, library.scanPdf)
        .set(this.l.SCAN_EPUB, library.scanEpub)
        .set(this.l.SCAN_STARTUP, library.scanOnStartup)
        .set(this.l.SCAN_INTERVAL, library.scanInterval.toString())
        .set(this.l.REPAIR_EXTENSIONS, library.repairExtensions)
        .set(this.l.CONVERT_TO_CBZ, library.convertToCbz)
        .set(this.l.EMPTY_TRASH_AFTER_SCAN, library.emptyTrashAfterScan)
        .set(this.l.SERIES_COVER, library.seriesCover.toString())
        .set(this.l.HASH_FILES, library.hashFiles)
        .set(this.l.HASH_PAGES, library.hashPages)
        .set(this.l.HASH_KOREADER, library.hashKoreader)
        .set(this.l.ANALYZE_DIMENSIONS, library.analyzeDimensions)
        .set(this.l.ONESHOTS_DIRECTORY, library.oneshotsDirectory)
        .set(this.l.UNAVAILABLE_DATE, library.unavailableDate)
        .set(this.l.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
        .where(this.l.ID.eq(library.id))
        .execute()

      this.dslRW.deleteFrom(this.le).where(this.le.LIBRARY_ID.eq(library.id)).execute()
      this.insertDirectoryExclusions(this.dslRW, library)
    })
  }

  count(): number {
    return this.dslRO.fetchCount(this.l)
  }

  private insertDirectoryExclusions(self: DSLContext, library: Library): void {
    if (library.scanDirectoryExclusions.size > 0) {
      const step = self.batch(self.insertInto(this.le, this.le.LIBRARY_ID, this.le.EXCLUSION).values(null, null))
      for (const it of library.scanDirectoryExclusions) step.bind(library.id, it)
      step.execute()
    }
  }

  private toDomain(self: LibraryRecord, directoryExclusions: Set<string>): Library {
    return new Library({
      name: self.name,
      root: new URL(self.root),
      importComicInfoBook: self.importComicinfoBook,
      importComicInfoSeries: self.importComicinfoSeries,
      importComicInfoCollection: self.importComicinfoCollection,
      importComicInfoReadList: self.importComicinfoReadlist,
      importComicInfoSeriesAppendVolume: self.importComicinfoSeriesAppendVolume,
      importEpubBook: self.importEpubBook,
      importEpubSeries: self.importEpubSeries,
      importMylarSeries: self.importMylarSeries,
      importLocalArtwork: self.importLocalArtwork,
      importBarcodeIsbn: self.importBarcodeIsbn,
      scanForceModifiedTime: self.scanForceModifiedTime,
      scanCbx: self.scanCbx,
      scanPdf: self.scanPdf,
      scanEpub: self.scanEpub,
      scanOnStartup: self.scanStartup,
      scanInterval: Library.ScanInterval.valueOf(self.scanInterval),
      scanDirectoryExclusions: directoryExclusions,
      repairExtensions: self.repairExtensions,
      convertToCbz: self.convertToCbz,
      emptyTrashAfterScan: self.emptyTrashAfterScan,
      seriesCover: Library.SeriesCover.valueOf(self.seriesCover),
      hashFiles: self.hashFiles,
      hashPages: self.hashPages,
      hashKoreader: self.hashKoreader,
      analyzeDimensions: self.analyzeDimensions,
      oneshotsDirectory: self.oneshotsDirectory,
      unavailableDate: self.unavailableDate,
      id: self.id,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
    })
  }
}

component(LibraryDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
  types: [LibraryRepository],
})
