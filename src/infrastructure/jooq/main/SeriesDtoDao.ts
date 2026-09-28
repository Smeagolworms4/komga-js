// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/SeriesDtoDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { SearchContext } from '../../../domain/model/SearchContext.js'
import { SearchField } from '../../../domain/model/SearchField.js'
import { SeriesSearch } from '../../../domain/model/SeriesSearch.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { RequiredJoin } from '../RequiredJoin.js'
import { SeriesSearchHelper } from '../SeriesSearchHelper.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { csAlias, inOrNoCondition, sortByValues, toSortField, unicode3 } from '../Utils.js'
import { LuceneEntity } from '../../search/LuceneEntity.js'
import { LuceneHelper } from '../../search/LuceneHelper.js'
import { toFilePath } from '../../web/Utils.js'
import { SeriesDtoRepository } from '../../../interfaces/api/persistence/SeriesDtoRepository.js'
import { AlternateTitleDto } from '../../../interfaces/api/rest/dto/AlternateTitleDto.js'
import { AuthorDto } from '../../../interfaces/api/rest/dto/AuthorDto.js'
import { GroupCountDto } from '../../../interfaces/api/rest/dto/GroupCountDto.js'
import { BookMetadataAggregationDto, SeriesDto, SeriesMetadataDto } from '../../../interfaces/api/rest/dto/SeriesDto.js'
import { WebLinkDto } from '../../../interfaces/api/rest/dto/WebLinkDto.js'
import { type BookMetadataAggregationRecord, type SeriesMetadataRecord, type SeriesRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import type { Condition, Field, Select, SortField } from '../../../port/jooq/core.js'
import { DSL, DSLContext, count, countDistinct, lower, substring } from '../../../port/jooq/dsl.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { component } from '../../../port/spring.js'
import { URL } from '../../../port/java-net.js'
import { firstOrNull, mapNotNull, require } from '../../../port/kotlin.js'

export const BOOKS_UNREAD_COUNT = 'booksUnreadCount'
export const BOOKS_IN_PROGRESS_COUNT = 'booksInProgressCount'
export const BOOKS_READ_COUNT = 'booksReadCount'

export class SeriesDtoDao extends SplitDslDaoBase implements SeriesDtoRepository {
  private readonly s = Tables.SERIES
  private readonly d = Tables.SERIES_METADATA
  private readonly rs = Tables.READ_PROGRESS_SERIES
  private readonly cs = Tables.COLLECTION_SERIES
  private readonly g = Tables.SERIES_METADATA_GENRE
  private readonly st = Tables.SERIES_METADATA_TAG
  private readonly sl = Tables.SERIES_METADATA_SHARING
  private readonly slk = Tables.SERIES_METADATA_LINK
  private readonly sat = Tables.SERIES_METADATA_ALTERNATE_TITLE
  private readonly bma = Tables.BOOK_METADATA_AGGREGATION
  private readonly bmaa = Tables.BOOK_METADATA_AGGREGATION_AUTHOR
  private readonly bmat = Tables.BOOK_METADATA_AGGREGATION_TAG

  private readonly groupFields = [...this.s.fields(), ...this.d.fields(), ...this.bma.fields(), ...this.rs.fields()]

  private readonly sorts = new Map<string, Field<unknown>>([
    ['metadata.titleSort', unicode3(this.d.TITLE_SORT)],
    ['createdDate', this.s.CREATED_DATE],
    ['created', this.s.CREATED_DATE],
    ['lastModifiedDate', this.s.LAST_MODIFIED_DATE],
    ['lastModified', this.s.LAST_MODIFIED_DATE],
    ['booksMetadata.releaseDate', this.bma.RELEASE_DATE],
    ['readDate', this.rs.MOST_RECENT_READ_DATE],
    ['collection.number', this.cs.NUMBER],
    ['name', unicode3(this.s.NAME)],
    ['booksCount', this.s.BOOK_COUNT],
    ['random', DSL.rand()],
  ])

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly luceneHelper: LuceneHelper,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  // PORT: surcharges findAll(pageable) / findAll(context, pageable) / findAll(search, context, pageable) fusionnées
  findAll(pageable: Pageable): Page<SeriesDto>
  findAll(context: SearchContext, pageable: Pageable): Page<SeriesDto>
  findAll(search: SeriesSearch, context: SearchContext, pageable: Pageable): Page<SeriesDto>
  findAll(...args: [Pageable] | [SearchContext, Pageable] | [SeriesSearch, SearchContext, Pageable]): Page<SeriesDto> {
    if (args.length === 1) {
      const [pageable] = args
      return this.findAll(new SeriesSearch(), SearchContext.ofAnonymousUser(), pageable)
    }
    if (args.length === 2) {
      const [context, pageable] = args
      return this.findAll(new SeriesSearch(), context, pageable)
    }
    const [search, context, pageable] = args
    // PORT: requireNotNull -> require(x !== null)
    require(context.userId !== null, () => 'Missing userId in search context')

    const [conditions, joins] = new SeriesSearchHelper(context).toCondition(search.condition)
    const conditionsRefined = conditions.and(
      (search.regexSearch !== null ? this.toColumn(search.regexSearch[1]).likeRegex(search.regexSearch[0]) : null) ?? DSL.noCondition(),
    )

    return this.findAllInternal(conditionsRefined, context.userId, pageable, { joins, searchTerm: search.fullTextSearch })
  }

  findAllRecentlyUpdated(search: SeriesSearch, context: SearchContext, pageable: Pageable): Page<SeriesDto> {
    // PORT: requireNotNull -> require(x !== null)
    require(context.userId !== null, () => 'Missing userId in search context')

    const [conditions, joins] = new SeriesSearchHelper(context).toCondition(search.condition)
    const conditionsRefined = conditions.and(this.s.CREATED_DATE.notEqual(this.s.LAST_MODIFIED_DATE))

    return this.findAllInternal(conditionsRefined, context.userId, pageable, { joins, searchTerm: search.fullTextSearch })
  }

  countByFirstCharacter(search: SeriesSearch, context: SearchContext): GroupCountDto[] {
    // PORT: requireNotNull -> require(x !== null)
    require(context.userId !== null, () => 'Missing userId in search context')

    const [conditions, joins] = new SeriesSearchHelper(context).toCondition(search.condition)
    const conditionsRefined = conditions.and(
      (search.regexSearch !== null ? this.toColumn(search.regexSearch[1]).likeRegex(search.regexSearch[0]) : null) ?? DSL.noCondition(),
    )

    const seriesIds = this.luceneHelper.searchEntitiesIds(search.fullTextSearch, LuceneEntity.Series)
    const searchCondition = inOrNoCondition(this.s.ID, seriesIds)

    const firstChar = lower(substring(this.d.TITLE_SORT, 1, 1))
    const query = this.dslRO
      .select(firstChar, count())
      .from(this.s)
      .leftJoin(this.d)
      .on(this.s.ID.eq(this.d.SERIES_ID))
      .leftJoin(this.bma)
      .on(this.s.ID.eq(this.bma.SERIES_ID))
      .leftJoin(this.rs)
      .on(this.s.ID.eq(this.rs.SERIES_ID))
      .and(this.readProgressConditionSeries(context.userId))
    for (const join of joins) {
      if (join instanceof RequiredJoin.Collection) {
        const csAlias_ = csAlias(join.collectionId)
        query.leftJoin(csAlias_).on(this.s.ID.eq(csAlias_.SERIES_ID).and(csAlias_.COLLECTION_ID.eq(join.collectionId)))
      }
      // always joined
      else if (join instanceof RequiredJoin.ReadProgress) {
        // Unit
      } else if (join === RequiredJoin.SeriesMetadata) {
        // Unit
      }
      // Book joins - not needed
      else if (join === RequiredJoin.Media) {
        // Unit
      } else if (join === RequiredJoin.BookMetadata) {
        // Unit
      } else if (join === RequiredJoin.BookMetadataAggregation) {
        // Unit
      } else if (join instanceof RequiredJoin.ReadList) {
        // Unit
      }
    }
    return query
      .where(conditionsRefined)
      .and(searchCondition)
      .groupBy(firstChar)
      .map((it) => new GroupCountDto({ group: it.value1<string>(), count: it.value2<number>() }))
  }

  findByIdOrNull(seriesId: string, userId: string): SeriesDto | null {
    return firstOrNull(
      this.fetchAndMap(
        this.selectBase(this.dslRO, userId)
          .where(this.s.ID.eq(seriesId))
          .groupBy(...this.groupFields),
        this.dslRO,
      ),
    )
  }

  private selectBase(self: DSLContext, userId: string, { joins = new Set() }: { joins?: ReadonlySet<RequiredJoin> } = {}): Select {
    const query = self
      .select(...this.groupFields)
      .from(this.s)
      .leftJoin(this.d)
      .on(this.s.ID.eq(this.d.SERIES_ID))
      .leftJoin(this.bma)
      .on(this.s.ID.eq(this.bma.SERIES_ID))
      .leftJoin(this.rs)
      .on(this.s.ID.eq(this.rs.SERIES_ID))
      .and(this.readProgressConditionSeries(userId))
    for (const join of joins) {
      if (join instanceof RequiredJoin.Collection) {
        const csAlias_ = csAlias(join.collectionId)
        query.leftJoin(csAlias_).on(this.s.ID.eq(csAlias_.SERIES_ID).and(csAlias_.COLLECTION_ID.eq(join.collectionId)))
      }
      // always joined
      else if (join instanceof RequiredJoin.ReadProgress) {
        // Unit
      } else if (join === RequiredJoin.SeriesMetadata) {
        // Unit
      }
      // Book joins - not needed
      else if (join === RequiredJoin.BookMetadata) {
        // Unit
      } else if (join === RequiredJoin.BookMetadataAggregation) {
        // Unit
      } else if (join === RequiredJoin.Media) {
        // Unit
      } else if (join instanceof RequiredJoin.ReadList) {
        // Unit
      }
    }
    return query
  }

  // PORT: surcharge privée findAll(conditions, userId, pageable, joins, searchTerm)
  private findAllInternal(
    conditions: Condition,
    userId: string,
    pageable: Pageable,
    { joins = new Set(), searchTerm = null }: { joins?: ReadonlySet<RequiredJoin>; searchTerm?: string | null } = {},
  ): Page<SeriesDto> {
    const seriesIds = this.luceneHelper.searchEntitiesIds(searchTerm, LuceneEntity.Series)
    const searchCondition = inOrNoCondition(this.s.ID, seriesIds)

    const countQuery = this.dslRO
      .select(countDistinct(this.s.ID))
      .from(this.s)
      .leftJoin(this.d)
      .on(this.s.ID.eq(this.d.SERIES_ID))
      .leftJoin(this.bma)
      .on(this.s.ID.eq(this.bma.SERIES_ID))
      .leftJoin(this.rs)
      .on(this.s.ID.eq(this.rs.SERIES_ID))
      .and(this.readProgressConditionSeries(userId))
    for (const join of joins) {
      if (join instanceof RequiredJoin.Collection) {
        const csAlias_ = csAlias(join.collectionId)
        countQuery.leftJoin(csAlias_).on(this.s.ID.eq(csAlias_.SERIES_ID).and(csAlias_.COLLECTION_ID.eq(join.collectionId)))
      }
      // always joined
      else if (join instanceof RequiredJoin.ReadProgress) {
        // Unit
      } else if (join === RequiredJoin.SeriesMetadata) {
        // Unit
      }
      // Book joins - not needed
      else if (join === RequiredJoin.BookMetadata) {
        // Unit
      } else if (join === RequiredJoin.BookMetadataAggregation) {
        // Unit
      } else if (join === RequiredJoin.Media) {
        // Unit
      } else if (join instanceof RequiredJoin.ReadList) {
        // Unit
      }
    }
    const count = countQuery.where(conditions).and(searchCondition).fetchOne(countDistinct(this.s.ID)) ?? 0

    const orderBy = mapNotNull(pageable.sort, (it): Field<unknown> | SortField<unknown> | null => {
      if (it.property === 'relevance' && !(seriesIds === null || seriesIds.length === 0)) {
        return sortByValues(this.s.ID, seriesIds, { asc: it.isAscending })
      } else {
        if (it.property === 'collection.number') {
          const collectionId =
            firstOrNull([...joins].filter((j): j is RequiredJoin.Collection => j instanceof RequiredJoin.Collection))?.collectionId ?? null
          if (collectionId === null) return null
          const f = csAlias(collectionId).NUMBER
          return it.isAscending ? f.asc() : f.desc()
        } else {
          return toSortField(it, this.sorts)
        }
      }
    })

    const dtosQuery = this.selectBase(this.dslRO, userId, { joins }).where(conditions).and(searchCondition).orderBy(orderBy)
    if (pageable.isPaged) dtosQuery.limit(pageable.pageSize).offset(pageable.offset)
    const dtos = this.fetchAndMap(dtosQuery, this.dslRO)

    const pageSort = orderBy.length > 0 ? pageable.sort : Sort.unsorted()
    return new PageImpl(
      dtos,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
      count,
    )
  }

  private readProgressConditionSeries(userId: string): Condition {
    return this.rs.USER_ID.eq(userId).or(this.rs.USER_ID.isNull())
  }

  private fetchAndMap(self: Select, dsl: DSLContext): SeriesDto[] {
    const records = self.fetch()
    const seriesIds = records.getValues(this.s.ID)

    let genres!: Map<string, string[]>
    let tags!: Map<string, string[]>
    let sharingLabels!: Map<string, string[]>
    let links!: Map<string, WebLinkDto[]>
    let alternateTitles!: Map<string, AlternateTitleDto[]>
    let aggregatedAuthors!: Map<string, AuthorDto[]>
    let aggregatedTags!: Map<string, string[]>

    use(TempTable.withTempTable(dsl, this.batchSize, seriesIds), (tempTable) => {
      // PORT: ResultQuery itéré (records typés) -> fetchInto(table)
      genres = groupByValues(
        dsl
          .selectFrom(this.g)
          .where(this.g.SERIES_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.g),
        (it) => it.seriesId,
        (it) => it.genre,
      )

      tags = groupByValues(
        dsl
          .selectFrom(this.st)
          .where(this.st.SERIES_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.st),
        (it) => it.seriesId,
        (it) => it.tag,
      )

      sharingLabels = groupByValues(
        dsl
          .selectFrom(this.sl)
          .where(this.sl.SERIES_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.sl),
        (it) => it.seriesId,
        (it) => it.label,
      )

      links = groupByValues(
        dsl
          .selectFrom(this.slk)
          .where(this.slk.SERIES_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.slk),
        (it) => it.seriesId,
        (it) => new WebLinkDto({ label: it.label, url: it.url }),
      )

      alternateTitles = groupByValues(
        dsl
          .selectFrom(this.sat)
          .where(this.sat.SERIES_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.sat),
        (it) => it.seriesId,
        (it) => new AlternateTitleDto({ label: it.label, title: it.title }),
      )

      aggregatedAuthors = groupByValues(
        dsl
          .selectFrom(this.bmaa)
          .where(this.bmaa.SERIES_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.bmaa)
          .filter((it) => it.name !== null),
        (it) => it.seriesId,
        (it) => new AuthorDto({ name: it.name, role: it.role }),
      )

      aggregatedTags = groupByValues(
        dsl
          .selectFrom(this.bmat)
          .where(this.bmat.SERIES_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.bmat),
        (it) => it.seriesId,
        (it) => it.tag,
      )
    })

    return records.map((rec) => {
      const sr = rec.into(this.s)
      const dr = rec.into(this.d)
      const bmar = rec.into(this.bma)
      const rsr = rec.into(this.rs)
      const booksReadCount = rsr.readCount ?? 0
      const booksInProgressCount = rsr.inProgressCount ?? 0
      const booksUnreadCount = sr.bookCount - booksReadCount - booksInProgressCount

      return this.seriesToDto(
        sr,
        sr.bookCount,
        booksReadCount,
        booksUnreadCount,
        booksInProgressCount,
        this.metadataToDto(
          dr,
          new Set(genres.get(sr.id) ?? []),
          new Set(tags.get(sr.id) ?? []),
          new Set(sharingLabels.get(sr.id) ?? []),
          links.get(sr.id) ?? [],
          alternateTitles.get(sr.id) ?? [],
        ),
        this.aggregationToDto(bmar, aggregatedAuthors.get(sr.id) ?? [], new Set(aggregatedTags.get(sr.id) ?? [])),
      )
    })
  }

  // PORT: fonction d'extension SearchField.toColumn()
  private toColumn(self: SearchField): Field<string> {
    switch (self) {
      case SearchField.TITLE:
        return this.d.TITLE
      case SearchField.TITLE_SORT:
        return this.d.TITLE_SORT
    }
    throw new Error('unreachable')
  }

  // PORT: fonction d'extension SeriesRecord.toDto()
  private seriesToDto(
    self: SeriesRecord,
    booksCount: number,
    booksReadCount: number,
    booksUnreadCount: number,
    booksInProgressCount: number,
    metadata: SeriesMetadataDto,
    booksMetadata: BookMetadataAggregationDto,
  ): SeriesDto {
    return new SeriesDto({
      id: self.id,
      libraryId: self.libraryId,
      name: self.name,
      url: toFilePath(new URL(self.url)),
      created: self.createdDate,
      lastModified: self.lastModifiedDate,
      fileLastModified: self.fileLastModified,
      booksCount: booksCount,
      booksReadCount: booksReadCount,
      booksUnreadCount: booksUnreadCount,
      booksInProgressCount: booksInProgressCount,
      metadata: metadata,
      booksMetadata: booksMetadata,
      deleted: self.deletedDate !== null,
      oneshot: self.oneshot,
    })
  }

  // PORT: fonction d'extension SeriesMetadataRecord.toDto()
  private metadataToDto(
    self: SeriesMetadataRecord,
    genres: ReadonlySet<string>,
    tags: ReadonlySet<string>,
    sharingLabels: ReadonlySet<string>,
    links: WebLinkDto[],
    alternateTitles: AlternateTitleDto[],
  ): SeriesMetadataDto {
    return new SeriesMetadataDto({
      status: self.status,
      statusLock: self.statusLock,
      created: self.createdDate,
      lastModified: self.lastModifiedDate,
      title: self.title,
      titleLock: self.titleLock,
      titleSort: self.titleSort,
      titleSortLock: self.titleSortLock,
      summary: self.summary,
      summaryLock: self.summaryLock,
      readingDirection: self.readingDirection ?? '',
      readingDirectionLock: self.readingDirectionLock,
      publisher: self.publisher,
      publisherLock: self.publisherLock,
      ageRating: self.ageRating,
      ageRatingLock: self.ageRatingLock,
      language: self.language,
      languageLock: self.languageLock,
      genres: genres,
      genresLock: self.genresLock,
      tags: tags,
      tagsLock: self.tagsLock,
      totalBookCount: self.totalBookCount,
      totalBookCountLock: self.totalBookCountLock,
      sharingLabels: sharingLabels,
      sharingLabelsLock: self.sharingLabelsLock,
      links: links,
      linksLock: self.linksLock,
      alternateTitles: alternateTitles,
      alternateTitlesLock: self.alternateTitlesLock,
    })
  }

  // PORT: fonction d'extension BookMetadataAggregationRecord.toDto()
  private aggregationToDto(self: BookMetadataAggregationRecord, authors: AuthorDto[], tags: ReadonlySet<string>): BookMetadataAggregationDto {
    return new BookMetadataAggregationDto({
      authors: authors,
      tags: tags,
      releaseDate: self.releaseDate,
      summary: self.summary,
      summaryNumber: self.summaryNumber,
      created: self.createdDate,
      lastModified: self.lastModifiedDate,
    })
  }
}

// PORT: Iterable.groupBy(keySelector, valueTransform) de Kotlin
function groupByValues<T, K, V>(a: Iterable<T>, key: (t: T) => K, value: (t: T) => V): Map<K, V[]> {
  const m = new Map<K, V[]>()
  for (const x of a) {
    const k = key(x)
    const l = m.get(k)
    if (l) l.push(value(x))
    else m.set(k, [value(x)])
  }
  return m
}

component(SeriesDtoDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    LuceneHelper,
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [SeriesDtoRepository],
})
