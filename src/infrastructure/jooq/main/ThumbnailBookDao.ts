// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ThumbnailBookDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Dimension } from '../../../domain/model/Dimension.js'
import { ThumbnailBook } from '../../../domain/model/ThumbnailBook.js'
import { ThumbnailBookRepository } from '../../../domain/persistence/ThumbnailBookRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { Tables, type ThumbnailBookRecord } from '../../../port/jooq/generated/main/Tables.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { component } from '../../../port/spring.js'
import { URL } from '../../../port/java-net.js'
import { firstOrNull } from '../../../port/kotlin.js'

export class ThumbnailBookDao extends SplitDslDaoBase implements ThumbnailBookRepository {
  private readonly tb = Tables.THUMBNAIL_BOOK
  private readonly b = Tables.BOOK

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  findAllByBookId(bookId: string): ThumbnailBook[] {
    return this.dslRO
      .selectFrom(this.tb)
      .where(this.tb.BOOK_ID.eq(bookId))
      .fetchInto(this.tb)
      .map((it) => this.toDomain(it))
  }

  findAllByBookIdAndType(bookId: string, type: ReadonlySet<ThumbnailBook.Type>): ThumbnailBook[] {
    return this.dslRO
      .selectFrom(this.tb)
      .where(this.tb.BOOK_ID.eq(bookId))
      .and(this.tb.TYPE.in([...type].map((it) => it.name)))
      .fetchInto(this.tb)
      .map((it) => this.toDomain(it))
  }

  findByIdOrNull(thumbnailId: string): ThumbnailBook | null {
    const r = this.dslRO.selectFrom(this.tb).where(this.tb.ID.eq(thumbnailId)).fetchOneInto(this.tb)
    return r !== null ? this.toDomain(r) : null
  }

  findSelectedByBookIdOrNull(bookId: string): ThumbnailBook | null {
    return firstOrNull(
      this.dslRO
        .selectFrom(this.tb)
        .where(this.tb.BOOK_ID.eq(bookId))
        .and(this.tb.SELECTED.isTrue())
        .limit(1)
        .fetchInto(this.tb)
        .map((it) => this.toDomain(it)),
    )
  }

  findAllBookIdsByThumbnailTypeAndDimensionSmallerThan(type: ThumbnailBook.Type, size: number): string[] {
    return this.dslRO
      .select(this.tb.BOOK_ID)
      .from(this.tb)
      .where(this.tb.TYPE.eq(type.toString()))
      .and(this.tb.WIDTH.lt(size))
      .and(this.tb.HEIGHT.lt(size))
      .fetch(this.tb.BOOK_ID)
  }

  existsById(thumbnailId: string): boolean {
    return this.dslRO.fetchExists(this.tb, this.tb.ID.eq(thumbnailId))
  }

  getLibraryIdOrNull(thumbnailId: string): string | null {
    return this.dslRO
      .select(this.b.LIBRARY_ID)
      .from(this.tb)
      .leftJoin(this.b)
      .on(this.tb.BOOK_ID.eq(this.b.ID))
      .where(this.tb.ID.eq(thumbnailId))
      .fetchOne(this.b.LIBRARY_ID)
  }

  getSeriesIdOrNull(thumbnailId: string): string | null {
    return this.dslRO
      .select(this.b.SERIES_ID)
      .from(this.tb)
      .leftJoin(this.b)
      .on(this.tb.BOOK_ID.eq(this.b.ID))
      .where(this.tb.ID.eq(thumbnailId))
      .fetchOne(this.b.SERIES_ID)
  }

  insert(thumbnail: ThumbnailBook): void {
    this.dslRW
      .insertInto(this.tb)
      .set(this.tb.ID, thumbnail.id)
      .set(this.tb.BOOK_ID, thumbnail.bookId)
      .set(this.tb.THUMBNAIL, thumbnail.thumbnail)
      .set(this.tb.URL, thumbnail.url !== null ? thumbnail.url.toString() : null)
      .set(this.tb.SELECTED, thumbnail.selected)
      .set(this.tb.TYPE, thumbnail.type.toString())
      .set(this.tb.MEDIA_TYPE, thumbnail.mediaType)
      .set(this.tb.WIDTH, thumbnail.dimension.width)
      .set(this.tb.HEIGHT, thumbnail.dimension.height)
      .set(this.tb.FILE_SIZE, thumbnail.fileSize)
      .execute()
  }

  update(thumbnail: ThumbnailBook): void {
    this.dslRW
      .update(this.tb)
      .set(this.tb.BOOK_ID, thumbnail.bookId)
      .set(this.tb.THUMBNAIL, thumbnail.thumbnail)
      .set(this.tb.URL, thumbnail.url !== null ? thumbnail.url.toString() : null)
      .set(this.tb.SELECTED, thumbnail.selected)
      .set(this.tb.TYPE, thumbnail.type.toString())
      .set(this.tb.MEDIA_TYPE, thumbnail.mediaType)
      .set(this.tb.WIDTH, thumbnail.dimension.width)
      .set(this.tb.HEIGHT, thumbnail.dimension.height)
      .set(this.tb.FILE_SIZE, thumbnail.fileSize)
      .where(this.tb.ID.eq(thumbnail.id))
      .execute()
  }

  // @Transactional
  markSelected(thumbnail: ThumbnailBook): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .update(this.tb)
        .set(this.tb.SELECTED, false)
        .where(this.tb.BOOK_ID.eq(thumbnail.bookId))
        .and(this.tb.ID.ne(thumbnail.id))
        .execute()

      this.dslRW
        .update(this.tb)
        .set(this.tb.SELECTED, true)
        .where(this.tb.BOOK_ID.eq(thumbnail.bookId))
        .and(this.tb.ID.eq(thumbnail.id))
        .execute()
    })
  }

  delete(thumbnailBookId: string): void {
    this.dslRW.deleteFrom(this.tb).where(this.tb.ID.eq(thumbnailBookId)).execute()
  }

  deleteByBookId(bookId: string): void {
    this.dslRW.deleteFrom(this.tb).where(this.tb.BOOK_ID.eq(bookId)).execute()
  }

  // @Transactional
  deleteByBookIds(bookIds: Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      use(TempTable.withTempTable(this.dslRW, this.batchSize, bookIds), (it) => {
        this.dslRW.deleteFrom(this.tb).where(this.tb.BOOK_ID.in(it.selectTempStrings())).execute()
      })
    })
  }

  deleteByBookIdAndType(bookId: string, type: ThumbnailBook.Type): void {
    this.dslRW
      .deleteFrom(this.tb)
      .where(this.tb.BOOK_ID.eq(bookId))
      .and(this.tb.TYPE.eq(type.toString()))
      .execute()
  }

  private toDomain(self: ThumbnailBookRecord): ThumbnailBook {
    return new ThumbnailBook({
      thumbnail: self.thumbnail,
      url: self.url !== null ? new URL(self.url) : null,
      selected: self.selected,
      type: ThumbnailBook.Type.valueOf(self.type),
      mediaType: self.mediaType,
      fileSize: self.fileSize,
      dimension: new Dimension({ width: self.width, height: self.height }),
      id: self.id,
      bookId: self.bookId,
      createdDate: self.createdDate,
      lastModifiedDate: self.lastModifiedDate,
    })
  }
}

component(ThumbnailBookDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [ThumbnailBookRepository],
})
