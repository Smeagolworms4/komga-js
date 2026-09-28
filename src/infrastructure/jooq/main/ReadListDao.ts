// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ReadListDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { ContentRestrictions } from '../../../domain/model/ContentRestrictions.js'
import { ReadList } from '../../../domain/model/ReadList.js'
import type { SearchContext } from '../../../domain/model/SearchContext.js'
import { ReadListRepository } from '../../../domain/persistence/ReadListRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { inOrNoCondition, sortByValues, toCondition, toSortField, unicode3 } from '../Utils.js'
import { LuceneEntity } from '../../search/LuceneEntity.js'
import { LuceneHelper } from '../../search/LuceneHelper.js'
import { type ReadlistRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import type { Field, Select } from '../../../port/jooq/core.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { type SortedMap, sortedMapOf, toSortedMap } from '../../../port/extra-metadata.js'
import { firstOrNull, mapNotNull } from '../../../port/kotlin.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { component } from '../../../port/spring.js'

export class ReadListDao extends SplitDslDaoBase implements ReadListRepository {
  private readonly rl = Tables.READLIST
  private readonly rlb = Tables.READLIST_BOOK
  private readonly b = Tables.BOOK
  private readonly sd = Tables.SERIES_METADATA

  private readonly sorts = new Map<string, Field<unknown>>([
    ['name', unicode3(this.rl.NAME)],
    ['createdDate', this.rl.CREATED_DATE],
    ['lastModifiedDate', this.rl.LAST_MODIFIED_DATE],
  ])

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly luceneHelper: LuceneHelper,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  findByIdOrNull(readListId: string, context: SearchContext): ReadList | null {
    const q = this.selectBase(this.dslRO, context.restrictions.isRestricted).where(this.rl.ID.eq(readListId))
    if (context.libraryIds !== null) q.and(this.b.LIBRARY_ID.in(context.libraryIds))
    if (context.restrictions.isRestricted) q.and(toCondition(context.restrictions))
    return firstOrNull(this.fetchAndMap(q, this.dslRO, context.libraryIds, context.restrictions))
  }

  findAll(
    context: SearchContext,
    pageable: Pageable,
    { belongsToLibraryIds = null, search = null }: { belongsToLibraryIds?: Iterable<string> | null; search?: string | null } = {},
  ): Page<ReadList> {
    const readListIds = this.luceneHelper.searchEntitiesIds(search, LuceneEntity.ReadList)
    const searchCondition = inOrNoCondition(this.rl.ID, readListIds)

    const conditions = searchCondition
      .and(inOrNoCondition(this.b.LIBRARY_ID, belongsToLibraryIds))
      .and(inOrNoCondition(this.b.LIBRARY_ID, context.libraryIds))
      .and(toCondition(context.restrictions))

    let queryIds: Select | null
    if (belongsToLibraryIds === null && context.libraryIds === null && !context.restrictions.isRestricted) queryIds = null
    else {
      queryIds = this.dslRO
        .selectDistinct(this.rl.ID)
        .from(this.rl)
        .leftJoin(this.rlb)
        .on(this.rl.ID.eq(this.rlb.READLIST_ID))
        .leftJoin(this.b)
        .on(this.rlb.BOOK_ID.eq(this.b.ID))
      if (context.restrictions.isRestricted) queryIds.leftJoin(this.sd).on(this.sd.SERIES_ID.eq(this.b.SERIES_ID))
      queryIds.where(conditions)
    }

    const count = queryIds !== null ? this.dslRO.fetchCount(queryIds) : this.dslRO.fetchCount(this.rl, searchCondition)

    const orderBy = mapNotNull(pageable.sort, (it) => {
      if (it.property === 'relevance' && !(readListIds === null || readListIds.length === 0))
        return sortByValues(this.rl.ID, readListIds, { asc: it.isAscending })
      else return toSortField(it, this.sorts)
    })

    const itemsQuery = this.selectBase(this.dslRO, context.restrictions.isRestricted).where(conditions)
    if (queryIds !== null) itemsQuery.and(this.rl.ID.in(queryIds))
    itemsQuery.orderBy(orderBy)
    if (pageable.isPaged) itemsQuery.limit(pageable.pageSize).offset(pageable.offset)
    const items = this.fetchAndMap(itemsQuery, this.dslRO, context.libraryIds, context.restrictions)

    const pageSort = orderBy.length > 0 ? pageable.sort : Sort.unsorted()
    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
      count,
    )
  }

  findAllContainingBookId(containsBookId: string, context: SearchContext): ReadList[] {
    const queryIds = this.dslRO.select(this.rl.ID).from(this.rl).leftJoin(this.rlb).on(this.rl.ID.eq(this.rlb.READLIST_ID))
    if (context.restrictions.isRestricted)
      queryIds.leftJoin(this.b).on(this.rlb.BOOK_ID.eq(this.b.ID)).leftJoin(this.sd).on(this.sd.SERIES_ID.eq(this.b.SERIES_ID))
    queryIds.where(this.rlb.BOOK_ID.eq(containsBookId))
    if (context.restrictions.isRestricted) queryIds.and(toCondition(context.restrictions))

    const q = this.selectBase(this.dslRO, context.restrictions.isRestricted).where(this.rl.ID.in(queryIds))
    if (context.libraryIds !== null) q.and(this.b.LIBRARY_ID.in(context.libraryIds))
    if (context.restrictions.isRestricted) q.and(toCondition(context.restrictions))
    return this.fetchAndMap(q, this.dslRO, context.libraryIds, context.restrictions)
  }

  findAllEmpty(): ReadList[] {
    return this.dslRO
      .selectFrom(this.rl)
      .where(
        this.rl.ID.in(
          this.dslRO
            .select(this.rl.ID)
            .from(this.rl)
            .leftJoin(this.rlb)
            .on(this.rl.ID.eq(this.rlb.READLIST_ID))
            .where(this.rlb.READLIST_ID.isNull()),
        ),
      )
      .fetchInto(this.rl)
      .map((it) => this.toDomain(it, sortedMapOf()))
  }

  findByNameOrNull(name: string): ReadList | null {
    return firstOrNull(this.fetchAndMap(this.selectBase(this.dslRO).where(this.rl.NAME.equalIgnoreCase(name)), this.dslRO, null))
  }

  private selectBase(self: DSLContext, joinOnSeriesMetadata = false): Select {
    const q = self
      .selectDistinct(...this.rl.fields())
      .from(this.rl)
      .leftJoin(this.rlb)
      .on(this.rl.ID.eq(this.rlb.READLIST_ID))
      .leftJoin(this.b)
      .on(this.rlb.BOOK_ID.eq(this.b.ID))
    if (joinOnSeriesMetadata) q.leftJoin(this.sd).on(this.sd.SERIES_ID.eq(this.b.SERIES_ID))
    return q
  }

  private fetchAndMap(
    self: Select,
    dsl: DSLContext,
    filterOnLibraryIds: Iterable<string> | null,
    restrictions: ContentRestrictions = new ContentRestrictions(),
  ): ReadList[] {
    return self.fetchInto(this.rl).map((rr) => {
      const q = dsl
        .select(...this.rlb.fields())
        .from(this.rlb)
        .leftJoin(this.b)
        .on(this.rlb.BOOK_ID.eq(this.b.ID))
      if (restrictions.isRestricted) q.leftJoin(this.sd).on(this.sd.SERIES_ID.eq(this.b.SERIES_ID))
      q.where(this.rlb.READLIST_ID.eq(rr.id))
      if (filterOnLibraryIds !== null) q.and(this.b.LIBRARY_ID.in(filterOnLibraryIds))
      if (restrictions.isRestricted) q.and(toCondition(restrictions))
      const bookIds = toSortedMap(
        new Map(
          mapNotNull(
            q.orderBy(this.rlb.NUMBER.asc()).fetchInto(this.rlb),
            (it) => [it.number, it.bookId] as [number, string],
          ),
        ),
      )
      return this.toDomain(rr, bookIds)
    })
  }

  // @Transactional
  insert(readList: ReadList): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .insertInto(this.rl)
        .set(this.rl.ID, readList.id)
        .set(this.rl.NAME, readList.name)
        .set(this.rl.SUMMARY, readList.summary)
        .set(this.rl.ORDERED, readList.ordered)
        .set(this.rl.BOOK_COUNT, readList.bookIds.size)
        .execute()

      this.insertBooks(this.dslRW, readList)
    })
  }

  private insertBooks(self: DSLContext, readList: ReadList): void {
    ;[...readList.bookIds].map(([index, id]) =>
      self.insertInto(this.rlb).set(this.rlb.READLIST_ID, readList.id).set(this.rlb.BOOK_ID, id).set(this.rlb.NUMBER, index).execute(),
    )
  }

  // @Transactional
  update(readList: ReadList): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .update(this.rl)
        .set(this.rl.NAME, readList.name)
        .set(this.rl.SUMMARY, readList.summary)
        .set(this.rl.ORDERED, readList.ordered)
        .set(this.rl.BOOK_COUNT, readList.bookIds.size)
        .set(this.rl.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
        .where(this.rl.ID.eq(readList.id))
        .execute()

      this.dslRW.deleteFrom(this.rlb).where(this.rlb.READLIST_ID.eq(readList.id)).execute()

      this.insertBooks(this.dslRW, readList)
    })
  }

  removeBookFromAll(bookId: string): void {
    this.dslRW.deleteFrom(this.rlb).where(this.rlb.BOOK_ID.eq(bookId)).execute()
  }

  // @Transactional
  removeBooksFromAll(bookIds: Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      use(TempTable.withTempTable(this.dslRW, this.batchSize, bookIds), (it) => {
        this.dslRW.deleteFrom(this.rlb).where(this.rlb.BOOK_ID.in(it.selectTempStrings())).execute()
      })
    })
  }

  // PORT: surcharges delete(readListId: String) / delete(readListIds: Collection<String>) fusionnées (union de types)
  delete(readListIdOrIds: string | Iterable<string>): void {
    if (typeof readListIdOrIds === 'string') this.deleteOne(readListIdOrIds)
    else this.deleteMany(readListIdOrIds)
  }

  // PORT: override fun delete(readListId: String), appelée par delete() ci-dessus
  // @Transactional
  private deleteOne(readListId: string): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.rlb).where(this.rlb.READLIST_ID.eq(readListId)).execute()
      this.dslRW.deleteFrom(this.rl).where(this.rl.ID.eq(readListId)).execute()
    })
  }

  // PORT: override fun delete(readListIds: Collection<String>), appelée par delete() ci-dessus
  // @Transactional
  private deleteMany(readListIds: Iterable<string>): void {
    // PORT: Collection -> Iterable, matérialisé (utilisé deux fois)
    const ids = [...readListIds]
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.rlb).where(this.rlb.READLIST_ID.in(ids)).execute()
      this.dslRW.deleteFrom(this.rl).where(this.rl.ID.in(ids)).execute()
    })
  }

  // @Transactional
  deleteAll(): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.rlb).execute()
      this.dslRW.deleteFrom(this.rl).execute()
    })
  }

  existsByName(name: string): boolean {
    return this.dslRO.fetchExists(this.dslRO.selectFrom(this.rl).where(this.rl.NAME.equalIgnoreCase(name)))
  }

  count(): number {
    return this.dslRO.fetchCount(this.rl)
  }

  private toDomain(self: ReadlistRecord, bookIds: SortedMap<number, string>): ReadList {
    return new ReadList({
      name: self.name,
      summary: self.summary,
      ordered: self.ordered,
      bookIds: bookIds,
      id: self.id,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
      filtered: self.bookCount !== bookIds.size,
    })
  }
}

component(ReadListDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    LuceneHelper,
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [ReadListRepository],
})
