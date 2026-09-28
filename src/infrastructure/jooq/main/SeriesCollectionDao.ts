// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/SeriesCollectionDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { ContentRestrictions } from '../../../domain/model/ContentRestrictions.js'
import type { SearchContext } from '../../../domain/model/SearchContext.js'
import { SeriesCollection } from '../../../domain/model/SeriesCollection.js'
import { SeriesCollectionRepository } from '../../../domain/persistence/SeriesCollectionRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { inOrNoCondition, sortByValues, toCondition, toSortField, unicode3 } from '../Utils.js'
import { LuceneEntity } from '../../search/LuceneEntity.js'
import { LuceneHelper } from '../../search/LuceneHelper.js'
import { type CollectionRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import type { Field, Select } from '../../../port/jooq/core.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { firstOrNull, mapNotNull } from '../../../port/kotlin.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { component } from '../../../port/spring.js'

export class SeriesCollectionDao extends SplitDslDaoBase implements SeriesCollectionRepository {
  private readonly c = Tables.COLLECTION
  private readonly cs = Tables.COLLECTION_SERIES
  private readonly s = Tables.SERIES
  private readonly sd = Tables.SERIES_METADATA

  private readonly sorts = new Map<string, Field<unknown>>([
    ['name', unicode3(this.c.NAME)],
    ['createdDate', this.c.CREATED_DATE],
    ['lastModifiedDate', this.c.LAST_MODIFIED_DATE],
  ])

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly luceneHelper: LuceneHelper,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  findByIdOrNull(collectionId: string, context: SearchContext): SeriesCollection | null {
    const q = this.selectBase(this.dslRO, context.restrictions.isRestricted).where(this.c.ID.eq(collectionId))
    if (context.libraryIds !== null) q.and(this.s.LIBRARY_ID.in(context.libraryIds))
    if (context.restrictions.isRestricted) q.and(toCondition(context.restrictions))
    return firstOrNull(this.fetchAndMap(q, this.dslRO, context.libraryIds, context.restrictions))
  }

  findAll(
    context: SearchContext,
    pageable: Pageable,
    { belongsToLibraryIds = null, search = null }: { belongsToLibraryIds?: Iterable<string> | null; search?: string | null } = {},
  ): Page<SeriesCollection> {
    const collectionIds = this.luceneHelper.searchEntitiesIds(search, LuceneEntity.Collection)
    const searchCondition = inOrNoCondition(this.c.ID, collectionIds)

    const conditions = searchCondition
      .and(inOrNoCondition(this.s.LIBRARY_ID, belongsToLibraryIds))
      .and(inOrNoCondition(this.s.LIBRARY_ID, context.libraryIds))
      .and(toCondition(context.restrictions))

    const queryIds =
      belongsToLibraryIds === null && context.libraryIds === null && !context.restrictions.isRestricted
        ? null
        : this.dslRO
            .selectDistinct(this.c.ID)
            .from(this.c)
            .leftJoin(this.cs)
            .on(this.c.ID.eq(this.cs.COLLECTION_ID))
            .leftJoin(this.s)
            .on(this.cs.SERIES_ID.eq(this.s.ID))
            .leftJoin(this.sd)
            .on(this.cs.SERIES_ID.eq(this.sd.SERIES_ID))
            .where(conditions)

    const count = queryIds !== null ? this.dslRO.fetchCount(queryIds) : this.dslRO.fetchCount(this.c, searchCondition)

    const orderBy = mapNotNull(pageable.sort, (it) => {
      if (it.property === 'relevance' && !(collectionIds === null || collectionIds.length === 0))
        return sortByValues(this.c.ID, collectionIds, { asc: it.isAscending })
      else return toSortField(it, this.sorts)
    })

    const itemsQuery = this.selectBase(this.dslRO, context.restrictions.isRestricted).where(conditions)
    if (queryIds !== null) itemsQuery.and(this.c.ID.in(queryIds))
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

  findAllContainingSeriesId(containsSeriesId: string, context: SearchContext): SeriesCollection[] {
    const queryIds = this.dslRO.select(this.c.ID).from(this.c).leftJoin(this.cs).on(this.c.ID.eq(this.cs.COLLECTION_ID))
    if (context.restrictions.isRestricted) queryIds.leftJoin(this.sd).on(this.cs.SERIES_ID.eq(this.sd.SERIES_ID))
    queryIds.where(this.cs.SERIES_ID.eq(containsSeriesId))
    if (context.restrictions.isRestricted) queryIds.and(toCondition(context.restrictions))

    const q = this.selectBase(this.dslRO, context.restrictions.isRestricted).where(this.c.ID.in(queryIds))
    if (context.libraryIds !== null) q.and(this.s.LIBRARY_ID.in(context.libraryIds))
    if (context.restrictions.isRestricted) q.and(toCondition(context.restrictions))
    return this.fetchAndMap(q, this.dslRO, context.libraryIds, context.restrictions)
  }

  findAllEmpty(): SeriesCollection[] {
    return this.dslRO
      .selectFrom(this.c)
      .where(
        this.c.ID.in(
          this.dslRO
            .select(this.c.ID)
            .from(this.c)
            .leftJoin(this.cs)
            .on(this.c.ID.eq(this.cs.COLLECTION_ID))
            .where(this.cs.COLLECTION_ID.isNull()),
        ),
      )
      .fetchInto(this.c)
      .map((it) => this.toDomain(it, []))
  }

  findByNameOrNull(name: string): SeriesCollection | null {
    return firstOrNull(this.fetchAndMap(this.selectBase(this.dslRO).where(this.c.NAME.equalIgnoreCase(name)), this.dslRO, null))
  }

  private selectBase(self: DSLContext, joinOnSeriesMetadata = false): Select {
    const q = self
      .selectDistinct(...this.c.fields())
      .from(this.c)
      .leftJoin(this.cs)
      .on(this.c.ID.eq(this.cs.COLLECTION_ID))
      .leftJoin(this.s)
      .on(this.cs.SERIES_ID.eq(this.s.ID))
    if (joinOnSeriesMetadata) q.leftJoin(this.sd).on(this.cs.SERIES_ID.eq(this.sd.SERIES_ID))
    return q
  }

  private fetchAndMap(
    self: Select,
    dsl: DSLContext,
    filterOnLibraryIds: Iterable<string> | null,
    restrictions: ContentRestrictions = new ContentRestrictions(),
  ): SeriesCollection[] {
    return self.fetchInto(this.c).map((cr) => {
      const q = dsl
        .select(...this.cs.fields())
        .from(this.cs)
        .leftJoin(this.s)
        .on(this.cs.SERIES_ID.eq(this.s.ID))
      if (restrictions.isRestricted) q.leftJoin(this.sd).on(this.cs.SERIES_ID.eq(this.sd.SERIES_ID))
      q.where(this.cs.COLLECTION_ID.eq(cr.id))
      if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
      if (restrictions.isRestricted) q.and(toCondition(restrictions))
      const seriesIds = mapNotNull(q.orderBy(this.cs.NUMBER.asc()).fetchInto(this.cs), (it) => it.seriesId)
      return this.toDomain(cr, seriesIds)
    })
  }

  // @Transactional
  insert(collection: SeriesCollection): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .insertInto(this.c)
        .set(this.c.ID, collection.id)
        .set(this.c.NAME, collection.name)
        .set(this.c.ORDERED, collection.ordered)
        .set(this.c.SERIES_COUNT, collection.seriesIds.length)
        .execute()

      this.insertSeries(this.dslRW, collection)
    })
  }

  private insertSeries(self: DSLContext, collection: SeriesCollection): void {
    collection.seriesIds.forEach((id, index) => {
      self.insertInto(this.cs).set(this.cs.COLLECTION_ID, collection.id).set(this.cs.SERIES_ID, id).set(this.cs.NUMBER, index).execute()
    })
  }

  // @Transactional
  update(collection: SeriesCollection): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .update(this.c)
        .set(this.c.NAME, collection.name)
        .set(this.c.ORDERED, collection.ordered)
        .set(this.c.SERIES_COUNT, collection.seriesIds.length)
        .set(this.c.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
        .where(this.c.ID.eq(collection.id))
        .execute()

      this.dslRW.deleteFrom(this.cs).where(this.cs.COLLECTION_ID.eq(collection.id)).execute()

      this.insertSeries(this.dslRW, collection)
    })
  }

  // PORT: surcharges removeSeriesFromAll(seriesId: String) / removeSeriesFromAll(seriesIds: Collection<String>) fusionnées (union de types)
  removeSeriesFromAll(seriesIdOrIds: string | Iterable<string>): void {
    if (typeof seriesIdOrIds === 'string') this.removeSeriesFromAllOne(seriesIdOrIds)
    else this.removeSeriesFromAllMany(seriesIdOrIds)
  }

  // PORT: override fun removeSeriesFromAll(seriesId: String), appelée par removeSeriesFromAll() ci-dessus
  // @Transactional
  private removeSeriesFromAllOne(seriesId: string): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.cs).where(this.cs.SERIES_ID.eq(seriesId)).execute()
    })
  }

  // PORT: override fun removeSeriesFromAll(seriesIds: Collection<String>), appelée par removeSeriesFromAll() ci-dessus
  // @Transactional
  private removeSeriesFromAllMany(seriesIds: Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      use(TempTable.withTempTable(this.dslRW, this.batchSize, seriesIds), (it) => {
        this.dslRW.deleteFrom(this.cs).where(this.cs.SERIES_ID.in(it.selectTempStrings())).execute()
      })
    })
  }

  // PORT: surcharges delete(collectionId: String) / delete(collectionIds: Collection<String>) fusionnées (union de types)
  delete(collectionIdOrIds: string | Iterable<string>): void {
    if (typeof collectionIdOrIds === 'string') this.deleteOne(collectionIdOrIds)
    else this.deleteMany(collectionIdOrIds)
  }

  // PORT: override fun delete(collectionId: String), appelée par delete() ci-dessus
  // @Transactional
  private deleteOne(collectionId: string): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.cs).where(this.cs.COLLECTION_ID.eq(collectionId)).execute()
      this.dslRW.deleteFrom(this.c).where(this.c.ID.eq(collectionId)).execute()
    })
  }

  // PORT: override fun delete(collectionIds: Collection<String>), appelée par delete() ci-dessus
  // @Transactional
  private deleteMany(collectionIds: Iterable<string>): void {
    // PORT: Collection -> Iterable, matérialisé (utilisé deux fois)
    const ids = [...collectionIds]
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.cs).where(this.cs.COLLECTION_ID.in(ids)).execute()
      this.dslRW.deleteFrom(this.c).where(this.c.ID.in(ids)).execute()
    })
  }

  // @Transactional
  deleteAll(): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.cs).execute()
      this.dslRW.deleteFrom(this.c).execute()
    })
  }

  existsByName(name: string): boolean {
    return this.dslRO.fetchExists(this.dslRO.selectFrom(this.c).where(this.c.NAME.equalIgnoreCase(name)))
  }

  count(): number {
    return this.dslRO.fetchCount(this.c)
  }

  private toDomain(self: CollectionRecord, seriesIds: string[]): SeriesCollection {
    return new SeriesCollection({
      name: self.name,
      ordered: self.ordered,
      seriesIds: seriesIds,
      id: self.id,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
      filtered: self.seriesCount !== seriesIds.length,
    })
  }
}

component(SeriesCollectionDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    LuceneHelper,
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [SeriesCollectionRepository],
})
