// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/BookDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { Book } from '../../../domain/model/Book.js'
import type { SearchCondition } from '../../../domain/model/SearchCondition.js'
import type { SearchContext } from '../../../domain/model/SearchContext.js'
import { BookRepository } from '../../../domain/persistence/BookRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { BookSearchHelper } from '../BookSearchHelper.js'
import { RequiredJoin } from '../RequiredJoin.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { rlbAlias, toOrderBy } from '../Utils.js'
import { type BookRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import type { Field, Select } from '../../../port/jooq/core.js'
import { DSL, DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { component } from '../../../port/spring.js'
import { URL } from '../../../port/java-net.js'
import { chunked, firstOrNull } from '../../../port/kotlin.js'

export class BookDao extends SplitDslDaoBase implements BookRepository {
  private readonly b = Tables.BOOK
  private readonly m = Tables.MEDIA
  private readonly d = Tables.BOOK_METADATA
  private readonly sd = Tables.SERIES_METADATA
  private readonly r = Tables.READ_PROGRESS

  private readonly sorts = new Map<string, Field<unknown>>([
    ['createdDate', this.b.CREATED_DATE],
    ['seriesId', this.b.SERIES_ID],
    ['number', this.b.NUMBER],
  ])

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  findByIdOrNull(bookId: string): Book | null {
    const it = this.dslRO.selectFrom(this.b).where(this.b.ID.eq(bookId)).fetchOneInto(this.b)
    return it !== null ? this.toDomain(it) : null
  }

  findNotDeletedByLibraryIdAndUrlOrNull(libraryId: string, url: URL): Book | null {
    const it = firstOrNull(
      this.dslRO
        .selectFrom(this.b)
        .where(this.b.LIBRARY_ID.eq(libraryId).and(this.b.URL.eq(url.toString())))
        .and(this.b.DELETED_DATE.isNull())
        .orderBy(this.b.LAST_MODIFIED_DATE.desc())
        .fetchInto(this.b),
    )
    return it !== null ? this.toDomain(it) : null
  }

  findAllBySeriesId(seriesId: string): Book[] {
    return this.dslRO
      .selectFrom(this.b)
      .where(this.b.SERIES_ID.eq(seriesId))
      .fetchInto(this.b)
      .map((it) => this.toDomain(it))
  }

  // @Transactional
  findAllBySeriesIds(seriesIds: Iterable<string>): Book[] {
    return transactional(this.dslRW.db, () =>
      use(TempTable.withTempTable(this.dslRO, this.batchSize, seriesIds), (tempTable) => {
        return this.dslRO
          .selectFrom(this.b)
          .where(this.b.SERIES_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.b)
          .map((it) => this.toDomain(it))
      }),
    )
  }

  // @Transactional
  findAllNotDeletedByLibraryIdAndUrlNotIn(libraryId: string, urls: Iterable<URL>): Book[] {
    return transactional(this.dslRW.db, () =>
      use(
        TempTable.withTempTable(
          this.dslRO,
          this.batchSize,
          [...urls].map((it) => it.toString()),
        ),
        (tempTable) => {
          return this.dslRO
            .selectFrom(this.b)
            .where(this.b.LIBRARY_ID.eq(libraryId))
            .and(this.b.DELETED_DATE.isNull())
            .and(this.b.URL.notIn(tempTable.selectTempStrings()))
            .fetchInto(this.b)
            .map((it) => this.toDomain(it))
        },
      ),
    )
  }

  findAllDeletedByFileSize(fileSize: number): Book[] {
    return this.dslRO
      .selectFrom(this.b)
      .where(this.b.DELETED_DATE.isNotNull().and(this.b.FILE_SIZE.eq(fileSize)))
      .fetchInto(this.b)
      .map((it) => this.toDomain(it))
  }

  // PORT: surcharges findAll() / findAll(searchCondition, searchContext, pageable) fusionnées
  findAll(): Book[]
  findAll(searchCondition: SearchCondition.Book | null, searchContext: SearchContext, pageable: Pageable): Page<Book>
  findAll(searchCondition?: SearchCondition.Book | null, searchContext?: SearchContext, pageable?: Pageable): Book[] | Page<Book> {
    if (searchContext === undefined)
      return this.dslRO
        .selectFrom(this.b)
        .fetchInto(this.b)
        .map((it) => this.toDomain(it))
    return this.findAllSearch(searchCondition ?? null, searchContext, pageable as Pageable)
  }

  // PORT: override fun findAll(searchCondition, searchContext, pageable), appelée par findAll() ci-dessus
  private findAllSearch(searchCondition: SearchCondition.Book | null, searchContext: SearchContext, pageable: Pageable): Page<Book> {
    const bookCondition = new BookSearchHelper(searchContext).toCondition(searchCondition)

    const countQuery: Select = this.dslRO.selectCount().from(this.b)
    for (const join of bookCondition[1]) {
      if (join === RequiredJoin.BookMetadata) countQuery.innerJoin(this.d).on(this.b.ID.eq(this.d.BOOK_ID))
      else if (join === RequiredJoin.SeriesMetadata) countQuery.innerJoin(this.sd).on(this.b.SERIES_ID.eq(this.sd.SERIES_ID))
      else if (join === RequiredJoin.Media) countQuery.innerJoin(this.m).on(this.b.ID.eq(this.m.BOOK_ID))
      else if (join instanceof RequiredJoin.ReadProgress) countQuery.leftJoin(this.r).on(this.b.ID.eq(this.r.BOOK_ID)).and(this.r.USER_ID.eq(join.userId))
      else if (join instanceof RequiredJoin.ReadList) {
        const rlbAlias_ = rlbAlias(join.readListId)
        countQuery.leftJoin(rlbAlias_).on(rlbAlias_.BOOK_ID.eq(this.b.ID).and(rlbAlias_.READLIST_ID.eq(join.readListId)))
      }
      // shouldn't be required for books
      else if (join === RequiredJoin.BookMetadataAggregation) {
        // Unit
      } else if (join instanceof RequiredJoin.Collection) {
        // Unit
      }
    }
    const count = countQuery.where(bookCondition[0]).fetchOne(0, Number) ?? 0

    const orderBy = toOrderBy(pageable.sort, this.sorts)

    const itemsQuery: Select = this.dslRO.select(...this.b.fields()).from(this.b)
    for (const join of bookCondition[1]) {
      if (join === RequiredJoin.BookMetadata) itemsQuery.innerJoin(this.d).on(this.b.ID.eq(this.d.BOOK_ID))
      else if (join === RequiredJoin.SeriesMetadata) itemsQuery.innerJoin(this.sd).on(this.b.SERIES_ID.eq(this.sd.SERIES_ID))
      else if (join === RequiredJoin.Media) itemsQuery.innerJoin(this.m).on(this.b.ID.eq(this.m.BOOK_ID))
      else if (join instanceof RequiredJoin.ReadProgress) itemsQuery.leftJoin(this.r).on(this.b.ID.eq(this.r.BOOK_ID)).and(this.r.USER_ID.eq(join.userId))
      else if (join instanceof RequiredJoin.ReadList) {
        const rlbAlias_ = rlbAlias(join.readListId)
        itemsQuery.leftJoin(rlbAlias_).on(rlbAlias_.BOOK_ID.eq(this.b.ID).and(rlbAlias_.READLIST_ID.eq(join.readListId)))
      }
      // shouldn't be required for books
      else if (join === RequiredJoin.BookMetadataAggregation) {
        // Unit
      } else if (join instanceof RequiredJoin.Collection) {
        // Unit
      }
    }
    itemsQuery.where(bookCondition[0]).orderBy(orderBy)
    if (pageable.isPaged) itemsQuery.limit(pageable.pageSize).offset(pageable.offset)
    const items = itemsQuery.fetchInto(this.b).map((it) => this.toDomain(it))
    const pageSort = orderBy.length > 0 ? pageable.sort : Sort.unsorted()

    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
      count,
    )
  }

  getLibraryIdOrNull(bookId: string): string | null {
    return this.dslRO.select(this.b.LIBRARY_ID).from(this.b).where(this.b.ID.eq(bookId)).fetchOne(this.b.LIBRARY_ID)
  }

  getSeriesIdOrNull(bookId: string): string | null {
    return this.dslRO.select(this.b.SERIES_ID).from(this.b).where(this.b.ID.eq(bookId)).fetchOne(this.b.SERIES_ID)
  }

  findFirstIdInSeriesOrNull(seriesId: string): string | null {
    return this.dslRO
      .select(this.b.ID)
      .from(this.b)
      .leftJoin(this.d)
      .on(this.b.ID.eq(this.d.BOOK_ID))
      .where(this.b.SERIES_ID.eq(seriesId))
      .orderBy(this.d.NUMBER_SORT)
      .limit(1)
      .fetchOne(this.b.ID)
  }

  findLastIdInSeriesOrNull(seriesId: string): string | null {
    return this.dslRO
      .select(this.b.ID)
      .from(this.b)
      .leftJoin(this.d)
      .on(this.b.ID.eq(this.d.BOOK_ID))
      .where(this.b.SERIES_ID.eq(seriesId))
      .orderBy(this.d.NUMBER_SORT.desc())
      .limit(1)
      .fetchOne(this.b.ID)
  }

  findFirstUnreadIdInSeriesOrNull(seriesId: string, userId: string): string | null {
    return this.dslRO
      .select(this.b.ID)
      .from(this.b)
      .leftJoin(this.d)
      .on(this.b.ID.eq(this.d.BOOK_ID))
      .leftJoin(this.r)
      .on(this.b.ID.eq(this.r.BOOK_ID))
      .and(this.r.USER_ID.eq(userId).or(this.r.USER_ID.isNull()))
      .where(this.b.SERIES_ID.eq(seriesId))
      .and(this.r.COMPLETED.isNull().or(this.r.COMPLETED.isFalse()))
      .orderBy(this.d.NUMBER_SORT)
      .limit(1)
      .fetchOne(this.b.ID)
  }

  findAllIdsBySeriesId(seriesId: string): string[] {
    return this.dslRO.select(this.b.ID).from(this.b).where(this.b.SERIES_ID.eq(seriesId)).fetch(this.b.ID)
  }

  findAllIdsByLibraryId(libraryId: string): string[] {
    return this.dslRO.select(this.b.ID).from(this.b).where(this.b.LIBRARY_ID.eq(libraryId)).fetch(this.b.ID)
  }

  existsById(bookId: string): boolean {
    return this.dslRO.fetchExists(this.b, this.b.ID.eq(bookId))
  }

  findAllByLibraryIdAndMediaTypes(libraryId: string, mediaTypes: Iterable<string>): Book[] {
    return this.dslRO
      .select(...this.b.fields())
      .from(this.b)
      .leftJoin(this.m)
      .on(this.b.ID.eq(this.m.BOOK_ID))
      .where(this.b.LIBRARY_ID.eq(libraryId))
      .and(this.m.MEDIA_TYPE.in(mediaTypes))
      .fetchInto(this.b)
      .map((it) => this.toDomain(it))
  }

  findAllByLibraryIdAndMismatchedExtension(libraryId: string, mediaType: string, extension: string): Book[] {
    return this.dslRO
      .select(...this.b.fields())
      .from(this.b)
      .leftJoin(this.m)
      .on(this.b.ID.eq(this.m.BOOK_ID))
      .where(this.b.LIBRARY_ID.eq(libraryId))
      .and(this.m.MEDIA_TYPE.eq(mediaType))
      .and(this.b.URL.notLike(`%.${extension}`))
      .fetchInto(this.b)
      .map((it) => this.toDomain(it))
  }

  findAllByLibraryIdAndWithEmptyHash(libraryId: string): Book[] {
    return this.dslRO
      .selectFrom(this.b)
      .where(this.b.LIBRARY_ID.eq(libraryId))
      .and(this.b.FILE_HASH.eq(''))
      .fetchInto(this.b)
      .map((it) => this.toDomain(it))
  }

  findAllByLibraryIdAndWithEmptyHashKoreader(libraryId: string): Book[] {
    return this.dslRO
      .selectFrom(this.b)
      .where(this.b.LIBRARY_ID.eq(libraryId))
      .and(this.b.FILE_HASH_KOREADER.eq(''))
      .fetchInto(this.b)
      .map((it) => this.toDomain(it))
  }

  findAllByHashKoreader(hashKoreader: string): Book[] {
    return this.dslRO
      .selectFrom(this.b)
      .where(this.b.FILE_HASH_KOREADER.eq(hashKoreader))
      .fetchInto(this.b)
      .map((it) => this.toDomain(it))
  }

  // PORT: surcharges insert(Book) / insert(Collection<Book>) fusionnées (union de types)
  // @Transactional
  insert(bookOrBooks: Book | Iterable<Book>): void {
    transactional(this.dslRW.db, () => {
      if (bookOrBooks instanceof Book) {
        const book = bookOrBooks
        this.insert([book])
      } else this.insertMany([...bookOrBooks])
    })
  }

  // PORT: override fun insert(books: Collection<Book>), appelée par insert() ci-dessus
  // @Transactional
  private insertMany(books: Book[]): void {
    transactional(this.dslRW.db, () => {
      if (books.length > 0) {
        for (const chunk of chunked(books, this.batchSize)) {
          const step = this.dslRW.batch(
            this.dslRW
              .insertInto(
                this.b,
                this.b.ID,
                this.b.NAME,
                this.b.URL,
                this.b.NUMBER,
                this.b.FILE_LAST_MODIFIED,
                this.b.FILE_SIZE,
                this.b.FILE_HASH,
                this.b.FILE_HASH_KOREADER,
                this.b.LIBRARY_ID,
                this.b.SERIES_ID,
                this.b.DELETED_DATE,
                this.b.ONESHOT,
              )
              .values(null, null, null, null, null, null, null, null, null, null, null, null),
          )
          for (const it of chunk) {
            step.bind(
              it.id,
              it.name,
              it.url,
              it.number,
              it.fileLastModified,
              it.fileSize,
              it.fileHash,
              it.fileHashKoreader,
              it.libraryId,
              it.seriesId,
              it.deletedDate,
              it.oneshot,
            )
          }
          step.execute()
        }
      }
    })
  }

  // PORT: surcharges update(Book) / update(Collection<Book>) fusionnées (union de types)
  // @Transactional
  update(bookOrBooks: Book | Iterable<Book>): void {
    transactional(this.dslRW.db, () => {
      if (bookOrBooks instanceof Book) {
        const book = bookOrBooks
        this.updateBook(book)
      } else {
        // PORT: override fun update(books: Collection<Book>)
        const books = bookOrBooks
        ;[...books].map((it) => this.updateBook(it))
      }
    })
  }

  private updateBook(book: Book): void {
    this.dslRW
      .update(this.b)
      .set(this.b.NAME, book.name)
      .set(this.b.URL, book.url.toString())
      .set(this.b.NUMBER, book.number)
      .set(this.b.FILE_LAST_MODIFIED, book.fileLastModified)
      .set(this.b.FILE_SIZE, book.fileSize)
      .set(this.b.FILE_HASH, book.fileHash)
      .set(this.b.FILE_HASH_KOREADER, book.fileHashKoreader)
      .set(this.b.LIBRARY_ID, book.libraryId)
      .set(this.b.SERIES_ID, book.seriesId)
      .set(this.b.DELETED_DATE, book.deletedDate)
      .set(this.b.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
      .set(this.b.ONESHOT, book.oneshot)
      .where(this.b.ID.eq(book.id))
      .execute()
  }

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  delete(bookIdOrIds: string | Iterable<string>): void {
    if (typeof bookIdOrIds === 'string') {
      const bookId = bookIdOrIds
      this.dslRW.deleteFrom(this.b).where(this.b.ID.eq(bookId)).execute()
    } else this.deleteMany(bookIdOrIds)
  }

  // PORT: override fun delete(bookIds: Collection<String>), appelée par delete() ci-dessus
  // @Transactional
  private deleteMany(bookIds: Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      use(TempTable.withTempTable(this.dslRW, this.batchSize, bookIds), (tempTable) => {
        this.dslRW.deleteFrom(this.b).where(this.b.ID.in(tempTable.selectTempStrings())).execute()
      })
    })
  }

  deleteAll(): void {
    this.dslRW.deleteFrom(this.b).execute()
  }

  count(): number {
    return this.dslRO.fetchCount(this.b)
  }

  countGroupedByLibraryId(): Map<string, number> {
    return this.dslRO
      .select(this.b.LIBRARY_ID, DSL.count(this.b.ID))
      .from(this.b)
      .groupBy(this.b.LIBRARY_ID)
      .fetchMap(this.b.LIBRARY_ID, DSL.count(this.b.ID))
  }

  // PORT: BigDecimal -> number
  getFilesizeGroupedByLibraryId(): Map<string, number> {
    return this.dslRO
      .select(this.b.LIBRARY_ID, DSL.sum(this.b.FILE_SIZE))
      .from(this.b)
      .groupBy(this.b.LIBRARY_ID)
      .fetchMap(this.b.LIBRARY_ID, DSL.sum(this.b.FILE_SIZE))
  }

  private toDomain(self: BookRecord): Book {
    return new Book({
      name: self.name,
      url: new URL(self.url),
      fileLastModified: self.fileLastModified,
      fileSize: self.fileSize,
      fileHash: self.fileHash,
      fileHashKoreader: self.fileHashKoreader,
      id: self.id,
      libraryId: self.libraryId,
      seriesId: self.seriesId,
      deletedDate: self.deletedDate,
      oneshot: self.oneshot,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
      number: self.number,
    })
  }
}

component(BookDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [BookRepository],
})
