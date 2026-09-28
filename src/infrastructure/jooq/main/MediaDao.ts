// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/MediaDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { BookPage } from '../../../domain/model/BookPage.js'
import { Dimension } from '../../../domain/model/Dimension.js'
import { Media } from '../../../domain/model/Media.js'
import { type MediaExtension, ProxyExtension } from '../../../domain/model/MediaExtension.js'
import { MediaFile } from '../../../domain/model/MediaFile.js'
import { MediaRepository } from '../../../domain/persistence/MediaRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { deserializeMediaExtension, serializeJsonGz } from '../Utils.js'
import { type MediaFileRecord, type MediaPageRecord, type MediaRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import type { Field, Record } from '../../../port/jooq/core.js'
import { DSL, DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { SQLDataType } from '../../../port/jooq/types.js'
import { ObjectMapper } from '../../../port/jackson-mapper.js'
import { qualifiedNameOf } from '../../../port/jackson.js'
import { KotlinLogging } from '../../../port/logging.js'
import { component } from '../../../port/spring.js'
import { chunked, firstOrNull, nn } from '../../../port/kotlin.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.jooq.main.MediaDao')

export class MediaDao extends SplitDslDaoBase implements MediaRepository {
  private readonly m = Tables.MEDIA
  private readonly p = Tables.MEDIA_PAGE
  private readonly f = Tables.MEDIA_FILE
  private readonly b = Tables.BOOK

  private readonly groupFields: Field<unknown>[] = [
    this.m.BOOK_ID,
    this.m.MEDIA_TYPE,
    this.m.STATUS,
    this.m.CREATED_DATE,
    this.m.LAST_MODIFIED_DATE,
    this.m.COMMENT,
    this.m.PAGE_COUNT,
    this.m.EXTENSION_CLASS,
    this.m.EPUB_DIVINA_COMPATIBLE,
    this.m.EPUB_IS_KEPUB,
    ...this.p.fields(),
  ]

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
    private readonly mapper: ObjectMapper,
  ) {
    super(dslRW, dslRO)
  }

  findById(bookId: string): Media {
    return nn(this.find(this.dslRO, bookId))
  }

  findByIdOrNull(bookId: string): Media | null {
    return this.find(this.dslRO, bookId)
  }

  findExtensionByIdOrNull(bookId: string): MediaExtension | null {
    const it = this.dslRO
      .select(this.m.EXTENSION_CLASS, this.m.EXTENSION_VALUE_BLOB)
      .from(this.m)
      .where(this.m.BOOK_ID.eq(bookId))
      .fetchOne()
    return it !== null ? deserializeMediaExtension(this.mapper, it.get(this.m.EXTENSION_CLASS), it.get(this.m.EXTENSION_VALUE_BLOB)) : null
  }

  findAllBookIdsByLibraryIdAndMediaTypeAndWithMissingPageHash(libraryId: string, mediaTypes: Iterable<string>, pageHashing: number): string[] {
    const pagesCount = DSL.count(this.p.BOOK_ID)
    const hashedCount = DSL.sum(DSL.when(this.p.FILE_HASH.eq(''), 0).otherwise(1)).cast(SQLDataType.INTEGER)
    const neededHash = pageHashing * 2
    const neededHashForBook = DSL.when(pagesCount.lt(neededHash), pagesCount).otherwise(neededHash)

    return this.dslRO
      .select(this.b.ID)
      .from(this.b)
      .leftJoin(this.p)
      .on(this.b.ID.eq(this.p.BOOK_ID))
      .leftJoin(this.m)
      .on(this.b.ID.eq(this.m.BOOK_ID))
      .where(this.b.LIBRARY_ID.eq(libraryId))
      .and(this.m.STATUS.eq(Media.Status.READY.name))
      .and(this.m.MEDIA_TYPE.in(mediaTypes))
      .groupBy(this.b.ID)
      .having(hashedCount.lt(neededHashForBook))
      .fetch()
      .map((it) => it.value1<string>())
  }

  getPagesSizes(bookIds: Iterable<string>): [string, number][] {
    return this.dslRO
      .select(this.m.BOOK_ID, this.m.PAGE_COUNT)
      .from(this.m)
      .where(this.m.BOOK_ID.in(bookIds))
      .fetch()
      .map((it) => [it.get(this.m.BOOK_ID), it.get(this.m.PAGE_COUNT)])
  }

  private find(self: DSLContext, bookId: string): Media | null {
    return firstOrNull(
      [
        ...self
          .select(...this.groupFields)
          .from(this.m)
          .leftJoin(this.p)
          .on(this.m.BOOK_ID.eq(this.p.BOOK_ID))
          .where(this.m.BOOK_ID.eq(bookId))
          .groupBy(...this.groupFields)
          .orderBy(this.p.NUMBER.asc())
          .fetchGroups(
            (it: Record) => it.into(this.m),
            (it: Record) => it.into(this.p),
          ),
      ].map(([mr, pr]) => {
        const files = self.selectFrom(this.f).where(this.f.BOOK_ID.eq(bookId)).fetchInto(this.f)

        return this.toDomain(
          mr,
          pr.filter((it) => !(it.bookId === null)).map((it) => this.pageToDomain(it)),
          files.map((it) => this.fileToDomain(it)),
        )
      }),
    )
  }

  // PORT: surcharges insert(Media) / insert(Collection<Media>) fusionnées (union de types)
  // @Transactional
  insert(mediaOrMedias: Media | Iterable<Media>): void {
    transactional(this.dslRW.db, () => {
      if (mediaOrMedias instanceof Media) {
        const media = mediaOrMedias
        this.insert([media])
      } else this.insertMany([...mediaOrMedias])
    })
  }

  // PORT: override fun insert(medias: Collection<Media>), appelée par insert() ci-dessus
  // @Transactional
  private insertMany(medias: Media[]): void {
    transactional(this.dslRW.db, () => {
      if (medias.length > 0) {
        for (const chunk of chunked(medias, this.batchSize)) {
          const step = this.dslRW.batch(
            this.dslRW
              .insertInto(
                this.m,
                this.m.BOOK_ID,
                this.m.STATUS,
                this.m.MEDIA_TYPE,
                this.m.COMMENT,
                this.m.PAGE_COUNT,
                this.m.EPUB_DIVINA_COMPATIBLE,
                this.m.EPUB_IS_KEPUB,
                this.m.EXTENSION_CLASS,
                this.m.EXTENSION_VALUE_BLOB,
              )
              .values(null, null, null, null, null, null, null, null, null),
          )
          for (const media of chunk) {
            step.bind(
              media.bookId,
              media.status,
              media.mediaType,
              media.comment,
              media.pageCount,
              media.epubDivinaCompatible,
              media.epubIsKepub,
              media.extension !== null
                ? ((it: MediaExtension) => {
                    if (it instanceof ProxyExtension) {
                      logger.error(() => 'Found ProxyExtension while trying to insert Media: this is not expected and should be reported.')
                      return null
                    } else {
                      return qualifiedNameOf(it.constructor)
                    }
                  })(media.extension)
                : null,
              media.extension !== null ? (media.extension instanceof ProxyExtension ? null : serializeJsonGz(this.mapper, media.extension)) : null,
            )
          }
          step.execute()
        }

        this.insertPages(this.dslRW, medias)
        this.insertFiles(this.dslRW, medias)
      }
    })
  }

  private insertPages(self: DSLContext, medias: Media[]): void {
    if (medias.some((it) => it.pages.length > 0)) {
      for (const chunk of chunked(medias, this.batchSize)) {
        const step = self.batch(
          self
            .insertInto(
              this.p,
              this.p.BOOK_ID,
              this.p.FILE_NAME,
              this.p.MEDIA_TYPE,
              this.p.NUMBER,
              this.p.WIDTH,
              this.p.HEIGHT,
              this.p.FILE_HASH,
              this.p.FILE_SIZE,
            )
            .values(null, null, null, null, null, null, null, null),
        )
        for (const media of chunk) {
          media.pages.forEach((page, index) => {
            step.bind(
              media.bookId,
              page.fileName,
              page.mediaType,
              index,
              page.dimension?.width ?? null,
              page.dimension?.height ?? null,
              page.fileHash,
              page.fileSize,
            )
          })
        }
        step.execute()
      }
    }
  }

  private insertFiles(self: DSLContext, medias: Media[]): void {
    if (medias.some((it) => it.files.length > 0)) {
      for (const chunk of chunked(medias, this.batchSize)) {
        const step = self.batch(
          self
            .insertInto(
              this.f,
              this.f.BOOK_ID,
              this.f.FILE_NAME,
              this.f.MEDIA_TYPE,
              this.f.SUB_TYPE,
              this.f.FILE_SIZE,
            )
            .values(null, null, null, null, null),
        )
        for (const media of chunk) {
          for (const it of media.files) {
            step.bind(
              media.bookId,
              it.fileName,
              it.mediaType,
              it.subType,
              it.fileSize,
            )
          }
        }
        step.execute()
      }
    }
  }

  // @Transactional
  update(media: Media): void {
    transactional(this.dslRW.db, () => {
      const q = this.dslRW
        .update(this.m)
        .set(this.m.STATUS, media.status.toString())
        .set(this.m.MEDIA_TYPE, media.mediaType as string)
        .set(this.m.COMMENT, media.comment as string)
        .set(this.m.PAGE_COUNT, media.pageCount)
        .set(this.m.EPUB_DIVINA_COMPATIBLE, media.epubDivinaCompatible)
        .set(this.m.EPUB_IS_KEPUB, media.epubIsKepub)
      if (media.extension !== null) {
        if (!(media.extension instanceof ProxyExtension)) {
          q.set(this.m.EXTENSION_CLASS, qualifiedNameOf(media.extension.constructor) as string)
          q.set(this.m.EXTENSION_VALUE_BLOB, serializeJsonGz(this.mapper, media.extension) as Uint8Array)
        } else {
          logger.error(() => 'Found ProxyExtension while trying to update Media: this is not expected and should be reported.')
        }
      }
      q.set(this.m.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
        .where(this.m.BOOK_ID.eq(media.bookId))
        .execute()

      this.dslRW.deleteFrom(this.p).where(this.p.BOOK_ID.eq(media.bookId)).execute()

      this.dslRW.deleteFrom(this.f).where(this.f.BOOK_ID.eq(media.bookId)).execute()

      this.insertPages(this.dslRW, [media])
      this.insertFiles(this.dslRW, [media])
    })
  }

  // @Transactional
  copy(fromBookId: string, toBookId: string): void {
    transactional(this.dslRW.db, () => {
      const source = this.findById(fromBookId)
      const sourceExtension = this.findExtensionByIdOrNull(fromBookId)

      const copy = source.copy({ bookId: toBookId, extension: sourceExtension })
      this.update(copy)
    })
  }

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  // @Transactional
  delete(bookIdOrIds: string | Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      if (typeof bookIdOrIds === 'string') {
        const bookId = bookIdOrIds
        this.dslRW.deleteFrom(this.p).where(this.p.BOOK_ID.eq(bookId)).execute()
        this.dslRW.deleteFrom(this.f).where(this.f.BOOK_ID.eq(bookId)).execute()
        this.dslRW.deleteFrom(this.m).where(this.m.BOOK_ID.eq(bookId)).execute()
      } else this.deleteMany(bookIdOrIds)
    })
  }

  // PORT: override fun delete(bookIds: Collection<String>), appelée par delete() ci-dessus
  // @Transactional
  private deleteMany(bookIds: Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      use(TempTable.withTempTable(this.dslRW, this.batchSize, bookIds), (it) => {
        this.dslRW.deleteFrom(this.p).where(this.p.BOOK_ID.in(it.selectTempStrings())).execute()
        this.dslRW.deleteFrom(this.f).where(this.f.BOOK_ID.in(it.selectTempStrings())).execute()
        this.dslRW.deleteFrom(this.m).where(this.m.BOOK_ID.in(it.selectTempStrings())).execute()
      })
    })
  }

  count(): number {
    return this.dslRO.fetchCount(this.m)
  }

  private toDomain(self: MediaRecord, pages: BookPage[], files: MediaFile[]): Media {
    return new Media({
      status: Media.Status.valueOf(self.status),
      mediaType: self.mediaType,
      pages: pages,
      pageCount: self.pageCount,
      files: files,
      extension: ProxyExtension.of(self.extensionClass),
      comment: self.comment,
      bookId: self.bookId,
      epubDivinaCompatible: self.epubDivinaCompatible,
      epubIsKepub: self.epubIsKepub,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
    })
  }

  // PORT: surcharge d'extension MediaPageRecord.toDomain() renommée
  private pageToDomain(self: MediaPageRecord): BookPage {
    return new BookPage({
      fileName: self.fileName,
      mediaType: self.mediaType,
      dimension: self.width !== null && self.height !== null ? new Dimension({ width: self.width, height: self.height }) : null,
      fileHash: self.fileHash,
      fileSize: self.fileSize,
    })
  }

  // PORT: surcharge d'extension MediaFileRecord.toDomain() renommée
  private fileToDomain(self: MediaFileRecord): MediaFile {
    return new MediaFile({
      fileName: self.fileName,
      mediaType: self.mediaType,
      subType: self.subType !== null ? MediaFile.SubType.valueOf(self.subType) : null,
      fileSize: self.fileSize,
    })
  }
}

component(MediaDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
    ObjectMapper,
  ],
  types: [MediaRepository],
})
