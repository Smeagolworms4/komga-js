// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/SeriesDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import type { SearchCondition } from '../../../domain/model/SearchCondition.js'
import type { SearchContext } from '../../../domain/model/SearchContext.js'
import { Series } from '../../../domain/model/Series.js'
import { SeriesRepository } from '../../../domain/persistence/SeriesRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { RequiredJoin } from '../RequiredJoin.js'
import { SeriesSearchHelper } from '../SeriesSearchHelper.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { csAlias } from '../Utils.js'
import { type SeriesRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import { DSL, DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { component } from '../../../port/spring.js'
import { URL } from '../../../port/java-net.js'
import { firstOrNull } from '../../../port/kotlin.js'

export class SeriesDao extends SplitDslDaoBase implements SeriesRepository {
  private readonly s = Tables.SERIES
  private readonly d = Tables.SERIES_METADATA
  private readonly rs = Tables.READ_PROGRESS_SERIES
  private readonly bma = Tables.BOOK_METADATA_AGGREGATION

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  // PORT: surcharges findAll() / findAll(searchCondition, searchContext, pageable) fusionnées
  findAll(): Series[]
  findAll(searchCondition: SearchCondition.Series | null, searchContext: SearchContext, pageable: Pageable): Page<Series>
  findAll(searchCondition?: SearchCondition.Series | null, searchContext?: SearchContext, pageable?: Pageable): Series[] | Page<Series> {
    if (searchContext === undefined)
      return this.dslRO
        .selectFrom(this.s)
        .fetchInto(this.s)
        .map((it) => this.toDomain(it))
    return this.findAllSearch(searchCondition ?? null, searchContext, pageable as Pageable)
  }

  findByIdOrNull(seriesId: string): Series | null {
    const it = this.dslRO.selectFrom(this.s).where(this.s.ID.eq(seriesId)).fetchOneInto(this.s)
    return it !== null ? this.toDomain(it) : null
  }

  findAllByLibraryId(libraryId: string): Series[] {
    return this.dslRO
      .selectFrom(this.s)
      .where(this.s.LIBRARY_ID.eq(libraryId))
      .fetchInto(this.s)
      .map((it) => this.toDomain(it))
  }

  // @Transactional
  findAllNotDeletedByLibraryIdAndUrlNotIn(libraryId: string, urls: Iterable<URL>): Series[] {
    return transactional(this.dslRW.db, () =>
      use(
        TempTable.withTempTable(
          this.dslRO,
          this.batchSize,
          [...urls].map((it) => it.toString()),
        ),
        (tempTable) => {
          return this.dslRO
            .selectFrom(this.s)
            .where(this.s.LIBRARY_ID.eq(libraryId))
            .and(this.s.DELETED_DATE.isNull())
            .and(this.s.URL.notIn(tempTable.selectTempStrings()))
            .fetchInto(this.s)
            .map((it) => this.toDomain(it))
        },
      ),
    )
  }

  findNotDeletedByLibraryIdAndUrlOrNull(libraryId: string, url: URL): Series | null {
    const it = firstOrNull(
      this.dslRO
        .selectFrom(this.s)
        .where(this.s.LIBRARY_ID.eq(libraryId).and(this.s.URL.eq(url.toString())))
        .and(this.s.DELETED_DATE.isNull())
        .orderBy(this.s.LAST_MODIFIED_DATE.desc())
        .fetchInto(this.s),
    )
    return it !== null ? this.toDomain(it) : null
  }

  findAllByTitleContaining(title: string): Series[] {
    return this.dslRO
      .selectDistinct(...this.s.fields())
      .from(this.s)
      .leftJoin(this.d)
      .on(this.s.ID.eq(this.d.SERIES_ID))
      .where(this.d.TITLE.containsIgnoreCase(title))
      .fetchInto(this.s)
      .map((it) => this.toDomain(it))
  }

  getLibraryId(seriesId: string): string | null {
    return this.dslRO.select(this.s.LIBRARY_ID).from(this.s).where(this.s.ID.eq(seriesId)).fetchOne(0, String)
  }

  findAllIdsByLibraryId(libraryId: string): string[] {
    return this.dslRO.select(this.s.ID).from(this.s).where(this.s.LIBRARY_ID.eq(libraryId)).fetch(this.s.ID)
  }

  // PORT: override fun findAll(searchCondition, searchContext, pageable), appelée par findAll() ci-dessus
  private findAllSearch(searchCondition: SearchCondition.Series | null, searchContext: SearchContext, pageable: Pageable): Page<Series> {
    const [conditions, joins] = new SeriesSearchHelper(searchContext).toCondition(searchCondition)

    const query = this.dslRO.selectDistinct(...this.s.fields()).from(this.s)
    for (const join of joins) {
      if (join instanceof RequiredJoin.Collection) {
        const csAlias_ = csAlias(join.collectionId)
        query.leftJoin(csAlias_).on(this.s.ID.eq(csAlias_.SERIES_ID).and(csAlias_.COLLECTION_ID.eq(join.collectionId)))
      } else if (join === RequiredJoin.BookMetadataAggregation) query.leftJoin(this.bma).on(this.s.ID.eq(this.bma.SERIES_ID))
      else if (join === RequiredJoin.SeriesMetadata) query.innerJoin(this.d).on(this.s.ID.eq(this.d.SERIES_ID))
      else if (join instanceof RequiredJoin.ReadProgress) query.leftJoin(this.rs).on(this.rs.SERIES_ID.eq(this.s.ID)).and(this.rs.USER_ID.eq(join.userId))
      // Book joins - not needed
      else if (join === RequiredJoin.BookMetadata) {
        // Unit
      } else if (join === RequiredJoin.Media) {
        // Unit
      } else if (join instanceof RequiredJoin.ReadList) {
        // Unit
      }
    }
    query.where(conditions)

    const count = this.dslRO.fetchCount(query)

    if (pageable.isPaged) query.limit(pageable.pageSize).offset(pageable.offset)
    const items = query.fetchInto(this.s).map((it) => this.toDomain(it))

    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, Sort.unsorted()) : PageRequest.of(0, Math.max(count, 20), Sort.unsorted()),
      count,
    )
  }

  insert(series: Series): void {
    this.dslRW
      .insertInto(this.s)
      .set(this.s.ID, series.id)
      .set(this.s.NAME, series.name)
      .set(this.s.URL, series.url.toString())
      .set(this.s.FILE_LAST_MODIFIED, series.fileLastModified)
      .set(this.s.LIBRARY_ID, series.libraryId)
      .set(this.s.DELETED_DATE, series.deletedDate)
      .set(this.s.ONESHOT, series.oneshot)
      .execute()
  }

  update(series: Series, { updateModifiedTime = true }: { updateModifiedTime?: boolean } = {}): void {
    const q = this.dslRW
      .update(this.s)
      .set(this.s.NAME, series.name)
      .set(this.s.URL, series.url.toString())
      .set(this.s.FILE_LAST_MODIFIED, series.fileLastModified)
      .set(this.s.LIBRARY_ID, series.libraryId)
      .set(this.s.BOOK_COUNT, series.bookCount)
      .set(this.s.DELETED_DATE, series.deletedDate)
      .set(this.s.ONESHOT, series.oneshot)
    if (updateModifiedTime) q.set(this.s.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
    q.where(this.s.ID.eq(series.id)).execute()
  }

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  delete(seriesIdOrIds: string | Iterable<string>): void {
    if (typeof seriesIdOrIds === 'string') {
      const seriesId = seriesIdOrIds
      this.dslRW.deleteFrom(this.s).where(this.s.ID.eq(seriesId)).execute()
    } else this.deleteMany(seriesIdOrIds)
  }

  deleteAll(): void {
    this.dslRW.deleteFrom(this.s).execute()
  }

  // PORT: override fun delete(seriesIds: Collection<String>), appelée par delete() ci-dessus
  // @Transactional
  private deleteMany(seriesIds: Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      use(TempTable.withTempTable(this.dslRW, this.batchSize, seriesIds), (it) => {
        this.dslRW.deleteFrom(this.s).where(this.s.ID.in(it.selectTempStrings())).execute()
      })
    })
  }

  count(): number {
    return this.dslRO.fetchCount(this.s)
  }

  countGroupedByLibraryId(): Map<string, number> {
    return this.dslRO
      .select(this.s.LIBRARY_ID, DSL.count(this.s.ID))
      .from(this.s)
      .groupBy(this.s.LIBRARY_ID)
      .fetchMap(this.s.LIBRARY_ID, DSL.count(this.s.ID))
  }

  private toDomain(self: SeriesRecord): Series {
    return new Series({
      name: self.name,
      url: new URL(self.url),
      fileLastModified: self.fileLastModified,
      id: self.id,
      libraryId: self.libraryId,
      bookCount: self.bookCount,
      deletedDate: self.deletedDate,
      oneshot: self.oneshot,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
    })
  }
}

component(SeriesDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [SeriesRepository],
})
