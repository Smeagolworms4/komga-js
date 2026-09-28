// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/SyncPointDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import type { BookSearch } from '../../../domain/model/BookSearch.js'
import type { SearchContext } from '../../../domain/model/SearchContext.js'
import { SyncPoint } from '../../../domain/model/SyncPoint.js'
import { SyncPointRepository } from '../../../domain/persistence/SyncPointRepository.js'
import { BookSearchHelper } from '../BookSearchHelper.js'
import { RequiredJoin } from '../RequiredJoin.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { BookCommonDao } from './BookCommonDao.js'
import { Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toZonedDateTime } from '../../../language/LanguageUtils.js'
import type { Field, IntoType, Select } from '../../../port/jooq/core.js'
import { DSL, DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { component } from '../../../port/spring.js'
import { firstOrNull, nn, require } from '../../../port/kotlin.js'
import { TsidCreator } from '../../../port/tsid.js'

// PORT: import SyncPoint.ReadList.Companion.ON_DECK_ID -> constante locale
const ON_DECK_ID = SyncPoint.ReadList.ON_DECK_ID

export class SyncPointDao extends SplitDslDaoBase implements SyncPointRepository {
  private readonly b = Tables.BOOK
  private readonly m = Tables.MEDIA
  private readonly d = Tables.BOOK_METADATA
  private readonly bt = Tables.THUMBNAIL_BOOK
  private readonly r = Tables.READ_PROGRESS
  private readonly sd = Tables.SERIES_METADATA
  private readonly sp = Tables.SYNC_POINT
  private readonly spb = Tables.SYNC_POINT_BOOK
  private readonly spbs = Tables.SYNC_POINT_BOOK_REMOVED_SYNCED
  private readonly sprl = Tables.SYNC_POINT_READLIST
  private readonly sprlb = Tables.SYNC_POINT_READLIST_BOOK
  private readonly sprls = Tables.SYNC_POINT_READLIST_REMOVED_SYNCED

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly bookCommonDao: BookCommonDao,
  ) {
    super(dslRW, dslRO)
  }

  // @Transactional
  create(apiKeyId: string | null, search: BookSearch, context: SearchContext): SyncPoint {
    return transactional(this.dslRW.db, () => {
      // PORT: requireNotNull -> require(x !== null)
      require(context.userId !== null, () => 'userId is required to create a SyncPoint')

      const [condition, joins] = new BookSearchHelper(context).toCondition(search.condition)

      const syncPointId = TsidCreator.getTsid256().toString()
      const createdAt = LocalDateTime.now(ZoneId.of('Z'))

      this.dslRW
        .insertInto(this.sp, this.sp.ID, this.sp.USER_ID, this.sp.API_KEY_ID, this.sp.CREATED_DATE)
        .values(syncPointId, context.userId, apiKeyId, createdAt)
        .execute()

      const select = this.dslRW
        .select(
          DSL.val(syncPointId),
          this.b.ID,
          this.b.CREATED_DATE,
          this.b.LAST_MODIFIED_DATE,
          this.b.FILE_LAST_MODIFIED,
          this.b.FILE_SIZE,
          this.b.FILE_HASH,
          this.d.LAST_MODIFIED_DATE,
          this.r.LAST_MODIFIED_DATE,
          this.bt.ID,
        )
        .from(this.b)
      for (const it of joins) {
        if (it instanceof RequiredJoin.ReadList) {
          // for future work
        } else if (it === RequiredJoin.BookMetadata) {
          // we don't have to handle those since we already join on those tables anyway, the 'when' is here for future proofing
        } else if (it === RequiredJoin.SeriesMetadata) {
          // Unit
        } else if (it === RequiredJoin.Media) {
          // Unit
        } else if (it instanceof RequiredJoin.ReadProgress) {
          // Unit
        } else if (it === RequiredJoin.BookMetadataAggregation) {
          // Unit
        } else if (it instanceof RequiredJoin.Collection) {
          // Unit
        }
      }
      select
        .join(this.m)
        .on(this.b.ID.eq(this.m.BOOK_ID))
        .join(this.d)
        .on(this.b.ID.eq(this.d.BOOK_ID))
        .join(this.sd)
        .on(this.b.SERIES_ID.eq(this.sd.SERIES_ID))
        .leftJoin(this.r)
        .on(this.b.ID.eq(this.r.BOOK_ID))
        .and(this.r.USER_ID.eq(context.userId))
        .leftJoin(this.bt)
        .on(this.b.ID.eq(this.bt.BOOK_ID))
        .and(this.bt.SELECTED.isTrue())
        .where(condition)

      this.dslRW
        .insertInto(
          this.spb,
          this.spb.SYNC_POINT_ID,
          this.spb.BOOK_ID,
          this.spb.BOOK_CREATED_DATE,
          this.spb.BOOK_LAST_MODIFIED_DATE,
          this.spb.BOOK_FILE_LAST_MODIFIED,
          this.spb.BOOK_FILE_SIZE,
          this.spb.BOOK_FILE_HASH,
          this.spb.BOOK_METADATA_LAST_MODIFIED_DATE,
          this.spb.BOOK_READ_PROGRESS_LAST_MODIFIED_DATE,
          this.spb.BOOK_THUMBNAIL_ID,
        )
        .select(select)
        .execute()

      return nn(this.findByIdOrNull(syncPointId))
    })
  }

  // @Transactional
  addOnDeck(syncPointId: string, context: SearchContext, filterOnLibraryIds: string[] | null): void {
    transactional(this.dslRW.db, () => {
      // PORT: requireNotNull -> require(x !== null)
      require(context.userId !== null, () => 'Missing userId in search context')

      const createdAt = LocalDateTime.now(ZoneId.of('Z'))
      const onDeckFields: Field<unknown>[] = [DSL.val(syncPointId), DSL.val(ON_DECK_ID), this.b.ID]

      const [query, , queryMostRecentDate] = this.bookCommonDao.getBooksOnDeckQuery(context.userId, context.restrictions, filterOnLibraryIds, onDeckFields)

      const count = this.dslRW.insertInto(this.sprlb).select(query).execute()

      // only add the read list entry if some books were added
      if (count > 0) {
        // PORT: into(LocalDateTime::class.java) : valeurs déjà typées LocalDateTime
        const mostRecentDate = firstOrNull(this.dslRW.fetch(queryMostRecentDate).into(LocalDateTime as unknown as IntoType<LocalDateTime>)) ?? createdAt

        this.dslRW
          .insertInto(
            this.sprl,
            this.sprl.SYNC_POINT_ID,
            this.sprl.READLIST_ID,
            this.sprl.READLIST_NAME,
            this.sprl.READLIST_CREATED_DATE,
            this.sprl.READLIST_LAST_MODIFIED_DATE,
          )
          .values(syncPointId, ON_DECK_ID, 'On Deck', createdAt, mostRecentDate)
          .execute()
      }
    })
  }

  findByIdOrNull(syncPointId: string): SyncPoint | null {
    return firstOrNull(
      this.dslRO
        .selectFrom(this.sp)
        .where(this.sp.ID.eq(syncPointId))
        .fetchInto(this.sp)
        .map(
          (it) =>
            new SyncPoint({
              id: it.id,
              userId: it.userId,
              apiKeyId: it.apiKeyId,
              createdDate: toZonedDateTime(it.createdDate),
            }),
        ),
    )
  }

  findBooksById(syncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.Book> {
    const query = this.dslRO.selectFrom(this.spb).where(this.spb.SYNC_POINT_ID.eq(syncPointId))
    if (onlyNotSynced) {
      query.and(this.spb.SYNCED.isFalse())
    }

    return this.queryToPageBook(this.dslRO, query, pageable)
  }

  findBooksAdded(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.Book> {
    const query = this.dslRO.selectFrom(this.spb).where(this.spb.SYNC_POINT_ID.eq(toSyncPointId))
    if (onlyNotSynced) {
      query.and(this.spb.SYNCED.isFalse())
    }
    query.and(this.spb.BOOK_ID.notIn(this.dslRO.select(this.spb.BOOK_ID).from(this.spb).where(this.spb.SYNC_POINT_ID.eq(fromSyncPointId))))

    return this.queryToPageBook(this.dslRO, query, pageable)
  }

  findBooksRemoved(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.Book> {
    const query = this.dslRO
      .selectFrom(this.spb)
      .where(this.spb.SYNC_POINT_ID.eq(fromSyncPointId))
      .and(this.spb.BOOK_ID.notIn(this.dslRO.select(this.spb.BOOK_ID).from(this.spb).where(this.spb.SYNC_POINT_ID.eq(toSyncPointId))))
    if (onlyNotSynced)
      query.and(this.spb.BOOK_ID.notIn(this.dslRO.select(this.spbs.BOOK_ID).from(this.spbs).where(this.spbs.SYNC_POINT_ID.eq(toSyncPointId))))

    return this.queryToPageBook(this.dslRO, query, pageable)
  }

  findBooksChanged(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.Book> {
    const spbFrom = this.spb.as('spbFrom')
    const query = this.dslRO
      .select(...this.spb.fields())
      .from(this.spb)
      .join(spbFrom)
      .on(this.spb.BOOK_ID.eq(spbFrom.BOOK_ID))
      .where(this.spb.SYNC_POINT_ID.eq(toSyncPointId))
      .and(spbFrom.SYNC_POINT_ID.eq(fromSyncPointId))
    if (onlyNotSynced) {
      query.and(this.spb.SYNCED.isFalse())
    }
    query.and(
      this.spb.BOOK_FILE_LAST_MODIFIED.ne(spbFrom.BOOK_FILE_LAST_MODIFIED)
        .or(this.spb.BOOK_FILE_SIZE.ne(spbFrom.BOOK_FILE_SIZE))
        .or(this.spb.BOOK_FILE_HASH.ne(spbFrom.BOOK_FILE_HASH).and(spbFrom.BOOK_FILE_HASH.isNotNull()))
        .or(this.spb.BOOK_METADATA_LAST_MODIFIED_DATE.ne(spbFrom.BOOK_METADATA_LAST_MODIFIED_DATE))
        .or(this.spb.BOOK_THUMBNAIL_ID.ne(spbFrom.BOOK_THUMBNAIL_ID)),
    )

    return this.queryToPageBook(this.dslRO, query, pageable)
  }

  findBooksReadProgressChanged(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.Book> {
    const spbFrom = this.spb.as('spbFrom')
    const query = this.dslRO
      .select(...this.spb.fields())
      .from(this.spb)
      .join(spbFrom)
      .on(this.spb.BOOK_ID.eq(spbFrom.BOOK_ID))
      .where(this.spb.SYNC_POINT_ID.eq(toSyncPointId))
      .and(spbFrom.SYNC_POINT_ID.eq(fromSyncPointId))
    if (onlyNotSynced) {
      query.and(this.spb.SYNCED.isFalse())
    }
    query.and(
      // unchanged book
      this.spb.BOOK_FILE_LAST_MODIFIED.eq(spbFrom.BOOK_FILE_LAST_MODIFIED)
        .and(this.spb.BOOK_FILE_SIZE.eq(spbFrom.BOOK_FILE_SIZE))
        .and(this.spb.BOOK_FILE_HASH.eq(spbFrom.BOOK_FILE_HASH).or(spbFrom.BOOK_FILE_HASH.isNull()))
        .and(this.spb.BOOK_METADATA_LAST_MODIFIED_DATE.eq(spbFrom.BOOK_METADATA_LAST_MODIFIED_DATE))
        .and(this.spb.BOOK_THUMBNAIL_ID.eq(spbFrom.BOOK_THUMBNAIL_ID))
        // with changed read progress
        .and(
          this.spb.BOOK_READ_PROGRESS_LAST_MODIFIED_DATE.ne(spbFrom.BOOK_READ_PROGRESS_LAST_MODIFIED_DATE)
            .or(this.spb.BOOK_READ_PROGRESS_LAST_MODIFIED_DATE.isNull().and(spbFrom.BOOK_READ_PROGRESS_LAST_MODIFIED_DATE.isNotNull()))
            .or(this.spb.BOOK_READ_PROGRESS_LAST_MODIFIED_DATE.isNotNull().and(spbFrom.BOOK_READ_PROGRESS_LAST_MODIFIED_DATE.isNull())),
        ),
    )

    return this.queryToPageBook(this.dslRO, query, pageable)
  }

  findReadListsById(syncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.ReadList> {
    const query = this.dslRO.selectFrom(this.sprl).where(this.sprl.SYNC_POINT_ID.eq(syncPointId))
    if (onlyNotSynced) {
      query.and(this.sprl.SYNCED.isFalse())
    }

    return this.queryToPageReadList(this.dslRO, query, pageable)
  }

  findReadListsAdded(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.ReadList> {
    const to = this.sprl.as('to')
    const from = this.sprl.as('from')
    const query = this.dslRO
      .select(...to.fields())
      .from(to)
      .leftOuterJoin(from)
      .on(to.READLIST_ID.eq(from.READLIST_ID).and(from.SYNC_POINT_ID.eq(fromSyncPointId)))
      .where(to.SYNC_POINT_ID.eq(toSyncPointId))
    if (onlyNotSynced) query.and(to.SYNCED.isFalse())
    query.and(from.READLIST_ID.isNull())

    return this.queryToPageReadList(this.dslRO, query, pageable)
  }

  findReadListsChanged(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.ReadList> {
    const from = this.sprl.as('from')
    const query = this.dslRO
      .select(...this.sprl.fields())
      .from(this.sprl)
      .join(from)
      .on(this.sprl.READLIST_ID.eq(from.READLIST_ID))
      .where(this.sprl.SYNC_POINT_ID.eq(toSyncPointId))
      .and(from.SYNC_POINT_ID.eq(fromSyncPointId))
    if (onlyNotSynced) query.and(this.sprl.SYNCED.isFalse())
    query.and(this.sprl.READLIST_LAST_MODIFIED_DATE.ne(from.READLIST_LAST_MODIFIED_DATE).or(this.sprl.READLIST_NAME.ne(from.READLIST_NAME)))

    return this.queryToPageReadList(this.dslRO, query, pageable)
  }

  findReadListsRemoved(fromSyncPointId: string, toSyncPointId: string, onlyNotSynced: boolean, pageable: Pageable): Page<SyncPoint.ReadList> {
    const from = this.sprl.as('from')
    const to = this.sprl.as('to')
    const query = this.dslRO
      .select(...from.fields())
      .from(from)
      .leftOuterJoin(to)
      .on(from.READLIST_ID.eq(to.READLIST_ID).and(to.SYNC_POINT_ID.eq(toSyncPointId)))
      .where(from.SYNC_POINT_ID.eq(fromSyncPointId))
    if (onlyNotSynced)
      query.and(from.READLIST_ID.notIn(this.dslRO.select(this.sprls.READLIST_ID).from(this.sprls).where(this.sprls.SYNC_POINT_ID.eq(toSyncPointId))))
    query.and(to.READLIST_ID.isNull())

    return this.queryToPageReadList(this.dslRO, query, pageable)
  }

  findBookIdsByReadListIds(syncPointId: string, readListIds: Iterable<string>): SyncPoint.ReadList.Book[] {
    return this.dslRO
      .select(...this.sprlb.fields())
      .from(this.sprlb)
      .where(this.sprlb.SYNC_POINT_ID.eq(syncPointId))
      .and(this.sprlb.READLIST_ID.in(readListIds))
      .fetchInto(this.sprlb)
      .map((it) => new SyncPoint.ReadList.Book({ syncPointId: it.syncPointId, readListId: it.readlistId, bookId: it.bookId }))
  }

  markBooksSynced(syncPointId: string, forRemovedBooks: boolean, bookIds: Iterable<string>): void {
    // removed books are not present in the 'to' SyncPoint, only in the 'from' SyncPoint
    // we store status in a separate table
    if ([...bookIds].length > 0) {
      if (forRemovedBooks) {
        const step = this.dslRW.batch(this.dslRW.insertInto(this.spbs, this.spbs.SYNC_POINT_ID, this.spbs.BOOK_ID).values(null, null).onDuplicateKeyIgnore())
        for (const it of bookIds) step.bind(syncPointId, it)
        step.execute()
      } else
        this.dslRW
          .update(this.spb)
          .set(this.spb.SYNCED, true)
          .where(this.spb.SYNC_POINT_ID.eq(syncPointId))
          .and(this.spb.BOOK_ID.in(bookIds))
          .execute()
    }
  }

  markReadListsSynced(syncPointId: string, forRemovedReadLists: boolean, readListIds: Iterable<string>): void {
    // removed read lists are not present in the 'to' SyncPoint, only in the 'from' SyncPoint
    // we store status in a separate table
    if ([...readListIds].length > 0) {
      if (forRemovedReadLists) {
        const step = this.dslRW.batch(this.dslRW.insertInto(this.sprls, this.sprls.SYNC_POINT_ID, this.sprls.READLIST_ID).values(null, null).onDuplicateKeyIgnore())
        for (const it of readListIds) step.bind(syncPointId, it)
        step.execute()
      } else
        this.dslRW
          .update(this.sprl)
          .set(this.sprl.SYNCED, true)
          .where(this.sprl.SYNC_POINT_ID.eq(syncPointId))
          .and(this.sprl.READLIST_ID.in(readListIds))
          .execute()
    }
  }

  deleteByUserId(userId: string): void {
    this.deleteSubEntities(this.dslRW, this.dslRW.select(this.sp.ID).from(this.sp).where(this.sp.USER_ID.eq(userId)))
    this.dslRW.deleteFrom(this.sp).where(this.sp.USER_ID.eq(userId)).execute()
  }

  deleteByUserIdAndApiKeyIds(userId: string, apiKeyIds: Iterable<string>): void {
    this.deleteSubEntities(this.dslRW, this.dslRW.select(this.sp.ID).from(this.sp).where(this.sp.USER_ID.eq(userId).and(this.sp.API_KEY_ID.in(apiKeyIds))))
    this.dslRW.deleteFrom(this.sp).where(this.sp.USER_ID.eq(userId).and(this.sp.API_KEY_ID.in(apiKeyIds))).execute()
  }

  private deleteSubEntities(self: DSLContext, condition: Select): void {
    self.deleteFrom(this.sprls).where(this.sprls.SYNC_POINT_ID.in(condition)).execute()
    self.deleteFrom(this.sprlb).where(this.sprlb.SYNC_POINT_ID.in(condition)).execute()
    self.deleteFrom(this.sprl).where(this.sprl.SYNC_POINT_ID.in(condition)).execute()
    self.deleteFrom(this.spbs).where(this.spbs.SYNC_POINT_ID.in(condition)).execute()
    self.deleteFrom(this.spb).where(this.spb.SYNC_POINT_ID.in(condition)).execute()
  }

  deleteOne(syncPointId: string): void {
    this.dslRW.deleteFrom(this.sprls).where(this.sprls.SYNC_POINT_ID.eq(syncPointId)).execute()
    this.dslRW.deleteFrom(this.sprlb).where(this.sprlb.SYNC_POINT_ID.eq(syncPointId)).execute()
    this.dslRW.deleteFrom(this.sprl).where(this.sprl.SYNC_POINT_ID.eq(syncPointId)).execute()
    this.dslRW.deleteFrom(this.spbs).where(this.spbs.SYNC_POINT_ID.eq(syncPointId)).execute()
    this.dslRW.deleteFrom(this.spb).where(this.spb.SYNC_POINT_ID.eq(syncPointId)).execute()
    this.dslRW.deleteFrom(this.sp).where(this.sp.ID.eq(syncPointId)).execute()
  }

  deleteAll(): void {
    this.dslRW.deleteFrom(this.sprls).execute()
    this.dslRW.deleteFrom(this.sprlb).execute()
    this.dslRW.deleteFrom(this.sprl).execute()
    this.dslRW.deleteFrom(this.spbs).execute()
    this.dslRW.deleteFrom(this.spb).execute()
    this.dslRW.deleteFrom(this.sp).execute()
  }

  private queryToPageBook(self: DSLContext, query: Select, pageable: Pageable): Page<SyncPoint.Book> {
    const count = self.fetchCount(query)

    if (pageable.isPaged) query.limit(pageable.pageSize).offset(pageable.offset)
    const items = query.fetchInto(this.spb).map(
      (it) =>
        new SyncPoint.Book({
          syncPointId: it.syncPointId,
          bookId: it.bookId,
          createdDate: it.bookCreatedDate.atZone(ZoneId.of('Z')),
          lastModifiedDate: it.bookLastModifiedDate.atZone(ZoneId.of('Z')),
          fileLastModified: it.bookFileLastModified.atZone(ZoneId.of('Z')),
          fileSize: it.bookFileSize,
          fileHash: it.bookFileHash,
          metadataLastModifiedDate: it.bookMetadataLastModifiedDate.atZone(ZoneId.of('Z')),
          thumbnailId: it.bookThumbnailId,
          synced: it.synced,
        }),
    )

    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, Sort.unsorted()) : PageRequest.of(0, Math.max(count, 20), Sort.unsorted()),
      count,
    )
  }

  private queryToPageReadList(self: DSLContext, query: Select, pageable: Pageable): Page<SyncPoint.ReadList> {
    const count = self.fetchCount(query)

    if (pageable.isPaged) query.limit(pageable.pageSize).offset(pageable.offset)
    const items = query.fetchInto(this.sprl).map(
      (it) =>
        new SyncPoint.ReadList({
          syncPointId: it.syncPointId,
          readListId: it.readlistId,
          readListName: it.readlistName,
          createdDate: it.readlistCreatedDate.atZone(ZoneId.of('Z')),
          lastModifiedDate: it.readlistLastModifiedDate.atZone(ZoneId.of('Z')),
          synced: it.synced,
        }),
    )

    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, Sort.unsorted()) : PageRequest.of(0, Math.max(count, 20), Sort.unsorted()),
      count,
    )
  }
}

component(SyncPointDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }, BookCommonDao],
  types: [SyncPointRepository],
})
