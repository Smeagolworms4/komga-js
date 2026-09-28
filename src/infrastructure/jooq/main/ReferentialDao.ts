// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ReferentialDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDate } from '@js-joda/core'
import { Author } from '../../../domain/model/Author.js'
import { type FilterBy, FilterByEntity, FilterTags } from '../../../domain/model/FilterBy.js'
import type { SearchContext } from '../../../domain/model/SearchContext.js'
import { ReferentialRepository } from '../../../domain/persistence/ReferentialRepository.js'
import { ContentRestrictionsSearchHelper } from '../ContentRestrictionsSearchHelper.js'
import { RequiredJoin } from '../RequiredJoin.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { buildPage, udfStripAccents, unicode3 } from '../Utils.js'
import { type BookMetadataAggregationAuthorRecord, type BookMetadataAuthorRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { stripAccents } from '../../../language/LanguageUtils.js'
import type { Condition, OrderField, SelectFieldOrAsterisk, Table, TableField } from '../../../port/jooq/core.js'
import { DSL, DSLContext, select } from '../../../port/jooq/dsl.js'
import { Order, type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { component } from '../../../port/spring.js'
import { NoWhenBranchMatchedException, mapNotNull, nn, require, sortedBy, str } from '../../../port/kotlin.js'

export class ReferentialDao extends SplitDslDaoBase implements ReferentialRepository {
  private readonly a = Tables.BOOK_METADATA_AUTHOR
  private readonly sd = Tables.SERIES_METADATA
  private readonly bma = Tables.BOOK_METADATA_AGGREGATION
  private readonly bmaa = Tables.BOOK_METADATA_AGGREGATION_AUTHOR
  private readonly bmat = Tables.BOOK_METADATA_AGGREGATION_TAG
  private readonly s = Tables.SERIES
  private readonly b = Tables.BOOK
  private readonly g = Tables.SERIES_METADATA_GENRE
  private readonly bt = Tables.BOOK_METADATA_TAG
  private readonly st = Tables.SERIES_METADATA_TAG
  private readonly cs = Tables.COLLECTION_SERIES
  private readonly rb = Tables.READLIST_BOOK
  private readonly sl = Tables.SERIES_METADATA_SHARING
  private readonly at = Tables.SERIES_AND_BOOK_TAG

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  /** @deprecated Use findAuthors instead */
  findAllAuthorsByName(search: string, filterOnLibraryIds: Iterable<string> | null): Author[] {
    const q = this.dslRO.selectDistinct(this.a.NAME, this.a.ROLE).from(this.a)
    if (filterOnLibraryIds !== null) q.leftJoin(this.b).on(this.a.BOOK_ID.eq(this.b.ID))
    q.where(udfStripAccents(this.a.NAME).contains(stripAccents(search)))
    if (filterOnLibraryIds !== null) q.and(this.b.LIBRARY_ID.in(filterOnLibraryIds))
    return q
      .orderBy(unicode3(this.a.NAME))
      .fetchInto(this.a)
      .map((it) => this.toDomain(it))
  }

  /** @deprecated Use findAuthors instead */
  findAllAuthorsByNameAndLibrary(search: string, libraryId: string, filterOnLibraryIds: Iterable<string> | null): Author[] {
    const q = this.dslRO
      .selectDistinct(this.bmaa.NAME, this.bmaa.ROLE)
      .from(this.bmaa)
      .leftJoin(this.s)
      .on(this.bmaa.SERIES_ID.eq(this.s.ID))
      .where(udfStripAccents(this.bmaa.NAME).contains(stripAccents(search)))
      .and(this.s.LIBRARY_ID.eq(libraryId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q
      .orderBy(unicode3(this.bmaa.NAME))
      .fetchInto(this.bmaa)
      .map((it) => this.toDomain(it))
  }

  /** @deprecated Use findAuthors instead */
  findAllAuthorsByNameAndCollection(search: string, collectionId: string, filterOnLibraryIds: Iterable<string> | null): Author[] {
    const q = this.dslRO.selectDistinct(this.bmaa.NAME, this.bmaa.ROLE).from(this.bmaa).leftJoin(this.cs).on(this.bmaa.SERIES_ID.eq(this.cs.SERIES_ID))
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.bmaa.SERIES_ID.eq(this.s.ID))
    q.where(udfStripAccents(this.bmaa.NAME).contains(stripAccents(search))).and(this.cs.COLLECTION_ID.eq(collectionId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q
      .orderBy(unicode3(this.bmaa.NAME))
      .fetchInto(this.bmaa)
      .map((it) => this.toDomain(it))
  }

  /** @deprecated Use findAuthors instead */
  findAllAuthorsByNameAndSeries(search: string, seriesId: string, filterOnLibraryIds: Iterable<string> | null): Author[] {
    const q = this.dslRO.selectDistinct(this.bmaa.NAME, this.bmaa.ROLE).from(this.bmaa)
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.bmaa.SERIES_ID.eq(this.s.ID))
    q.where(udfStripAccents(this.bmaa.NAME).contains(stripAccents(search))).and(this.bmaa.SERIES_ID.eq(seriesId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q
      .orderBy(unicode3(this.bmaa.NAME))
      .fetchInto(this.bmaa)
      .map((it) => this.toDomain(it))
  }

  findAuthors(context: SearchContext, search: string | null, role: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<Author> {
    return this.findGeneric(context, search, filterBy, pageable, this.a, this.a.NAME, null, this.a.BOOK_ID, (it) => (it !== null ? this.toDomain(it) : null), Sort.by('name'), {
      extraFields: [this.a.ROLE],
      extraCondition: role !== null ? this.a.ROLE.eq(role) : null,
    })
  }

  findAuthorsRoles(context: SearchContext, filterBy: FilterBy | null, pageable: Pageable): Page<string> {
    return this.findGeneric(context, null, filterBy, pageable, this.a, null, null, this.a.BOOK_ID, (it) => (it !== null ? it.role : null), Sort.by('role'), {
      extraFields: [this.a.ROLE],
      sortField: this.a.ROLE,
    })
  }

  findAuthorsNames(context: SearchContext, search: string | null, role: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<string> {
    return this.findGeneric(context, search, filterBy, pageable, this.a, this.a.NAME, null, this.a.BOOK_ID, (it) => (it !== null ? it.name : null), Sort.by('name'), {
      extraFields: [],
      extraCondition: role !== null ? this.a.ROLE.eq(role) : null,
    })
  }

  /** @deprecated Use findAuthorsNames instead */
  findAllAuthorsNamesByName(search: string, filterOnLibraryIds: Iterable<string> | null): string[] {
    const q = this.dslRO.selectDistinct(this.a.NAME).from(this.a)
    if (filterOnLibraryIds !== null) q.leftJoin(this.b).on(this.a.BOOK_ID.eq(this.b.ID))
    q.where(udfStripAccents(this.a.NAME).contains(stripAccents(search)))
    if (filterOnLibraryIds !== null) q.and(this.b.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.a.NAME)).fetch(this.a.NAME)
  }

  /** @deprecated Use findAuthorsRoles instead */
  findAllAuthorsRoles(filterOnLibraryIds: Iterable<string> | null): string[] {
    const q = this.dslRO.selectDistinct(this.a.ROLE).from(this.a)
    if (filterOnLibraryIds !== null) {
      q.leftJoin(this.b).on(this.a.BOOK_ID.eq(this.b.ID)).where(this.b.LIBRARY_ID.in(filterOnLibraryIds))
    }
    return q.orderBy(this.a.ROLE).fetch(this.a.ROLE)
  }

  /** @deprecated Use findGenres instead */
  findAllGenres(filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.selectDistinct(this.g.GENRE).from(this.g)
    if (filterOnLibraryIds !== null) {
      q.leftJoin(this.s).on(this.g.SERIES_ID.eq(this.s.ID)).where(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    }
    return q.orderBy(unicode3(this.g.GENRE)).fetchSet(this.g.GENRE)
  }

  /** @deprecated Use findGenres instead */
  findAllGenresByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO
      .selectDistinct(this.g.GENRE)
      .from(this.g)
      .leftJoin(this.s)
      .on(this.g.SERIES_ID.eq(this.s.ID))
      .where(this.s.LIBRARY_ID.in(libraryIds))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.g.GENRE)).fetchSet(this.g.GENRE)
  }

  /** @deprecated Use findGenres instead */
  findAllGenresByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.selectDistinct(this.g.GENRE).from(this.g).leftJoin(this.cs).on(this.g.SERIES_ID.eq(this.cs.SERIES_ID))
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.g.SERIES_ID.eq(this.s.ID))
    q.where(this.cs.COLLECTION_ID.eq(collectionId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.g.GENRE)).fetchSet(this.g.GENRE)
  }

  findGenres(context: SearchContext, search: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<string> {
    if (filterBy !== null) require(new Set([FilterByEntity.LIBRARY, FilterByEntity.COLLECTION]).has(filterBy.type))

    return this.findGeneric(context, search, filterBy, pageable, this.g, this.g.GENRE, this.g.SERIES_ID, null, (it) => (it !== null ? it.genre : null), Sort.by('genre'))
  }

  /** @deprecated Use findTags instead */
  findAllSeriesAndBookTags(filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.select(this.bt.TAG.as('tag')).from(this.bt)
    if (filterOnLibraryIds !== null) q.leftJoin(this.b).on(this.bt.BOOK_ID.eq(this.b.ID)).where(this.b.LIBRARY_ID.in(filterOnLibraryIds))
    const u = select(this.st.TAG.as('tag')).from(this.st)
    if (filterOnLibraryIds !== null) u.leftJoin(this.s).on(this.st.SERIES_ID.eq(this.s.ID)).where(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return new Set(sortedBy(q.union(u).fetchSet<string>(0, String), (it) => stripAccents(it).toLowerCase()))
  }

  /** @deprecated Use findTags instead */
  findAllSeriesAndBookTagsByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO
      .select(this.bt.TAG.as('tag'))
      .from(this.bt)
      .leftJoin(this.b)
      .on(this.bt.BOOK_ID.eq(this.b.ID))
      .where(this.b.LIBRARY_ID.in(libraryIds))
    if (filterOnLibraryIds !== null) q.and(this.b.LIBRARY_ID.in(filterOnLibraryIds))
    const u = select(this.st.TAG.as('tag'))
      .from(this.st)
      .leftJoin(this.s)
      .on(this.st.SERIES_ID.eq(this.s.ID))
      .where(this.s.LIBRARY_ID.in(libraryIds))
    if (filterOnLibraryIds !== null) u.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return new Set(sortedBy(q.union(u).fetchSet<string>(0, String), (it) => stripAccents(it).toLowerCase()))
  }

  /** @deprecated Use findTags instead */
  findAllSeriesAndBookTagsByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO
      .select(this.bmat.TAG.as('tag'))
      .from(this.bmat)
      .leftJoin(this.s)
      .on(this.bmat.SERIES_ID.eq(this.s.ID))
      .leftJoin(this.cs)
      .on(this.bmat.SERIES_ID.eq(this.cs.SERIES_ID))
      .where(this.cs.COLLECTION_ID.eq(collectionId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    const u = select(this.st.TAG.as('tag'))
      .from(this.st)
      .leftJoin(this.cs)
      .on(this.st.SERIES_ID.eq(this.cs.SERIES_ID))
      .leftJoin(this.s)
      .on(this.st.SERIES_ID.eq(this.s.ID))
      .where(this.cs.COLLECTION_ID.eq(collectionId))
    if (filterOnLibraryIds !== null) u.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return new Set(sortedBy(q.union(u).fetchSet<string>(0, String), (it) => stripAccents(it).toLowerCase()))
  }

  /** @deprecated Use findTags instead */
  findAllSeriesTags(filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.select(this.st.TAG).from(this.st)
    if (filterOnLibraryIds !== null) {
      q.leftJoin(this.s).on(this.st.SERIES_ID.eq(this.s.ID)).where(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    }
    return q.orderBy(unicode3(this.st.TAG)).fetchSet(this.st.TAG)
  }

  /** @deprecated Use findTags instead */
  findAllSeriesTagsByLibrary(libraryId: string, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO
      .select(this.st.TAG)
      .from(this.st)
      .leftJoin(this.s)
      .on(this.st.SERIES_ID.eq(this.s.ID))
      .where(this.s.LIBRARY_ID.eq(libraryId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.st.TAG)).fetchSet(this.st.TAG)
  }

  /** @deprecated Use findTags instead */
  findAllBookTagsBySeries(seriesId: string, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO
      .select(this.bt.TAG)
      .from(this.bt)
      .leftJoin(this.b)
      .on(this.bt.BOOK_ID.eq(this.b.ID))
      .where(this.b.SERIES_ID.eq(seriesId))
    if (filterOnLibraryIds !== null) q.and(this.b.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.bt.TAG)).fetchSet(this.bt.TAG)
  }

  /** @deprecated Use findTags instead */
  findAllBookTagsByReadList(readListId: string, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO
      .select(this.bt.TAG)
      .from(this.bt)
      .leftJoin(this.b)
      .on(this.bt.BOOK_ID.eq(this.b.ID))
      .leftJoin(this.rb)
      .on(this.bt.BOOK_ID.eq(this.rb.BOOK_ID))
      .where(this.rb.READLIST_ID.eq(readListId))
    if (filterOnLibraryIds !== null) q.and(this.b.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.bt.TAG)).fetchSet(this.bt.TAG)
  }

  findTags(context: SearchContext, search: string | null, filterBy: FilterBy | null, filterTags: FilterTags, pageable: Pageable): Page<string> {
    switch (filterTags) {
      case FilterTags.SERIES:
        return this.findGeneric(context, search, filterBy, pageable, this.st, this.st.TAG, this.st.SERIES_ID, null, (it) => (it !== null ? it.tag : null), Sort.by('tag'))
      case FilterTags.BOOK:
        return this.findGeneric(context, search, filterBy, pageable, this.bt, this.bt.TAG, null, this.bt.BOOK_ID, (it) => (it !== null ? it.tag : null), Sort.by('tag'))
      case FilterTags.BOTH:
        return this.findGeneric(context, search, filterBy, pageable, this.at, this.at.TAG, this.at.SERIES_ID, null, (it) => (it !== null ? it.tag : null), Sort.by('tag'))
    }
    // PORT: when exhaustif sur l'enum
    throw new NoWhenBranchMatchedException()
  }

  /** @deprecated Use findTags instead */
  findAllSeriesTagsByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.select(this.st.TAG).from(this.st).leftJoin(this.cs).on(this.st.SERIES_ID.eq(this.cs.SERIES_ID))
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.st.SERIES_ID.eq(this.s.ID))
    q.where(this.cs.COLLECTION_ID.eq(collectionId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.st.TAG)).fetchSet(this.st.TAG)
  }

  /** @deprecated Use findTags instead */
  findAllBookTags(filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.select(this.bt.TAG).from(this.bt)
    if (filterOnLibraryIds !== null) {
      q.leftJoin(this.b).on(this.bt.BOOK_ID.eq(this.b.ID)).where(this.b.LIBRARY_ID.in(filterOnLibraryIds))
    }
    return q.orderBy(unicode3(this.bt.TAG)).fetchSet(this.bt.TAG)
  }

  /** @deprecated Use findLanguages instead */
  findAllLanguages(filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.selectDistinct(this.sd.LANGUAGE).from(this.sd)
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.sd.SERIES_ID.eq(this.s.ID))
    q.where(this.sd.LANGUAGE.ne(''))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(this.sd.LANGUAGE).fetchSet(this.sd.LANGUAGE)
  }

  /** @deprecated Use findLanguages instead */
  findAllLanguagesByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO
      .selectDistinct(this.sd.LANGUAGE)
      .from(this.sd)
      .leftJoin(this.s)
      .on(this.sd.SERIES_ID.eq(this.s.ID))
      .where(this.sd.LANGUAGE.ne(''))
      .and(this.s.LIBRARY_ID.in(libraryIds))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(this.sd.LANGUAGE).fetchSet(this.sd.LANGUAGE)
  }

  /** @deprecated Use findLanguages instead */
  findAllLanguagesByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.selectDistinct(this.sd.LANGUAGE).from(this.sd).leftJoin(this.cs).on(this.sd.SERIES_ID.eq(this.cs.SERIES_ID))
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.sd.SERIES_ID.eq(this.s.ID))
    q.where(this.sd.LANGUAGE.ne('')).and(this.cs.COLLECTION_ID.eq(collectionId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(this.sd.LANGUAGE).fetchSet(this.sd.LANGUAGE)
  }

  findLanguages(context: SearchContext, search: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<string> {
    if (filterBy !== null) require(new Set([FilterByEntity.LIBRARY, FilterByEntity.COLLECTION]).has(filterBy.type))

    return this.findGeneric(context, search, filterBy, pageable, this.sd, this.sd.LANGUAGE, this.sd.SERIES_ID, null, (it) => (it !== null ? it.language : null), Sort.by('language'), {
      extraCondition: this.sd.LANGUAGE.ne(''),
    })
  }

  // PORT: surcharges findAllPublishers(filterOnLibraryIds) / findAllPublishers(filterOnLibraryIds, pageable) fusionnées
  /** @deprecated Use findPublishers instead */
  findAllPublishers(filterOnLibraryIds: Iterable<string> | null): Set<string>
  /** @deprecated Use findPublishers instead */
  findAllPublishers(filterOnLibraryIds: Iterable<string> | null, pageable: Pageable): Page<string>
  findAllPublishers(filterOnLibraryIds: Iterable<string> | null, pageable?: Pageable): Set<string> | Page<string> {
    if (pageable === undefined) {
      const q = this.dslRO.selectDistinct(this.sd.PUBLISHER).from(this.sd)
      if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.sd.SERIES_ID.eq(this.s.ID))
      q.where(this.sd.PUBLISHER.ne(''))
      if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
      return q.orderBy(unicode3(this.sd.PUBLISHER)).fetchSet(this.sd.PUBLISHER)
    }

    const query = this.dslRO.selectDistinct(this.sd.PUBLISHER).from(this.sd)
    if (filterOnLibraryIds !== null) query.leftJoin(this.s).on(this.sd.SERIES_ID.eq(this.s.ID))
    query.where(this.sd.PUBLISHER.ne(''))
    if (filterOnLibraryIds !== null) query.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))

    const count = this.dslRO.fetchCount(query)
    const sort = unicode3(this.sd.PUBLISHER)

    query.orderBy(sort)
    if (pageable.isPaged) query.limit(pageable.pageSize).offset(pageable.offset)
    const items = query.fetch(this.sd.PUBLISHER)

    const pageSort = Sort.by('name')
    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
      count,
    )
  }

  /** @deprecated Use findPublishers instead */
  findAllPublishersByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO
      .selectDistinct(this.sd.PUBLISHER)
      .from(this.sd)
      .leftJoin(this.s)
      .on(this.sd.SERIES_ID.eq(this.s.ID))
      .where(this.sd.PUBLISHER.ne(''))
      .and(this.s.LIBRARY_ID.in(libraryIds))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.sd.PUBLISHER)).fetchSet(this.sd.PUBLISHER)
  }

  /** @deprecated Use findPublishers instead */
  findAllPublishersByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.selectDistinct(this.sd.PUBLISHER).from(this.sd).leftJoin(this.cs).on(this.sd.SERIES_ID.eq(this.cs.SERIES_ID))
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.sd.SERIES_ID.eq(this.s.ID))
    q.where(this.sd.PUBLISHER.ne('')).and(this.cs.COLLECTION_ID.eq(collectionId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.sd.PUBLISHER)).fetchSet(this.sd.PUBLISHER)
  }

  findPublishers(context: SearchContext, search: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<string> {
    if (filterBy !== null) require(new Set([FilterByEntity.LIBRARY, FilterByEntity.COLLECTION]).has(filterBy.type))

    return this.findGeneric(context, search, filterBy, pageable, this.sd, this.sd.PUBLISHER, this.sd.SERIES_ID, null, (it) => (it !== null ? it.publisher : null), Sort.by('publisher'), {
      extraCondition: this.sd.PUBLISHER.ne(''),
    })
  }

  /** @deprecated Use findAgeRatings instead */
  findAllAgeRatings(filterOnLibraryIds: Iterable<string> | null): Set<number | null> {
    const q = this.dslRO.selectDistinct(this.sd.AGE_RATING).from(this.sd)
    if (filterOnLibraryIds !== null) {
      q.leftJoin(this.s).on(this.sd.SERIES_ID.eq(this.s.ID)).where(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    }
    return q.orderBy(this.sd.AGE_RATING).fetchSet(this.sd.AGE_RATING)
  }

  /** @deprecated Use findAgeRatings instead */
  findAllAgeRatingsByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<number | null> {
    const q = this.dslRO
      .selectDistinct(this.sd.AGE_RATING)
      .from(this.sd)
      .leftJoin(this.s)
      .on(this.sd.SERIES_ID.eq(this.s.ID))
      .where(this.s.LIBRARY_ID.in(libraryIds))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(this.sd.AGE_RATING).fetchSet(this.sd.AGE_RATING)
  }

  /** @deprecated Use findAgeRatings instead */
  findAllAgeRatingsByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<number | null> {
    const q = this.dslRO.selectDistinct(this.sd.AGE_RATING).from(this.sd).leftJoin(this.cs).on(this.sd.SERIES_ID.eq(this.cs.SERIES_ID))
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.sd.SERIES_ID.eq(this.s.ID))
    q.where(this.cs.COLLECTION_ID.eq(collectionId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(this.sd.AGE_RATING).fetchSet(this.sd.AGE_RATING)
  }

  findAgeRatings(context: SearchContext, filterBy: FilterBy | null, pageable: Pageable): Page<number> {
    if (filterBy !== null) require(new Set([FilterByEntity.LIBRARY, FilterByEntity.COLLECTION]).has(filterBy.type))

    return this.findGeneric(context, null, filterBy, pageable, this.sd, null, this.sd.SERIES_ID, null, (it) => (it !== null ? it.ageRating : null), Sort.by('ageRating'), {
      extraFields: [this.sd.AGE_RATING],
      sortField: this.sd.AGE_RATING,
    })
  }

  /** @deprecated Use findSeriesReleaseDates instead */
  findAllSeriesReleaseDates(filterOnLibraryIds: Iterable<string> | null): Set<LocalDate> {
    const q = this.dslRO.selectDistinct(this.bma.RELEASE_DATE).from(this.bma)
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.bma.SERIES_ID.eq(this.s.ID))
    q.where(this.bma.RELEASE_DATE.isNotNull())
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(this.bma.RELEASE_DATE.desc()).fetchSet(this.bma.RELEASE_DATE)
  }

  /** @deprecated Use findSeriesReleaseDates instead */
  findAllSeriesReleaseDatesByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<LocalDate> {
    const q = this.dslRO
      .selectDistinct(this.bma.RELEASE_DATE)
      .from(this.bma)
      .leftJoin(this.s)
      .on(this.bma.SERIES_ID.eq(this.s.ID))
      .where(this.s.LIBRARY_ID.in(libraryIds))
      .and(this.bma.RELEASE_DATE.isNotNull())
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(this.bma.RELEASE_DATE.desc()).fetchSet(this.bma.RELEASE_DATE)
  }

  /** @deprecated Use findSeriesReleaseDates instead */
  findAllSeriesReleaseDatesByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<LocalDate> {
    const q = this.dslRO.selectDistinct(this.bma.RELEASE_DATE).from(this.bma).leftJoin(this.cs).on(this.bma.SERIES_ID.eq(this.cs.SERIES_ID))
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.bma.SERIES_ID.eq(this.s.ID))
    q.where(this.cs.COLLECTION_ID.eq(collectionId)).and(this.bma.RELEASE_DATE.isNotNull())
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(this.bma.RELEASE_DATE.desc()).fetchSet(this.bma.RELEASE_DATE)
  }

  findSeriesReleaseYears(context: SearchContext, filterBy: FilterBy | null, pageable: Pageable): Page<string> {
    if (filterBy !== null) require(new Set([FilterByEntity.LIBRARY, FilterByEntity.COLLECTION]).has(filterBy.type))

    const sortField = this.bma.RELEASE_DATE.desc()
    const restrictionCondition = new ContentRestrictionsSearchHelper(context.restrictions).toCondition()
    const query = this.dslRO.selectDistinct(DSL.year(this.bma.RELEASE_DATE)).from(this.bma)
    for (const join of restrictionCondition[1]) {
      if (join === RequiredJoin.SeriesMetadata) query.innerJoin(this.sd).on(this.bma.SERIES_ID.eq(this.sd.SERIES_ID))
      // shouldn't be required
      else if (join === RequiredJoin.BookMetadata) {
        // Unit
      } else if (join === RequiredJoin.BookMetadataAggregation) {
        // Unit
      } else if (join instanceof RequiredJoin.Collection) {
        // Unit
      } else if (join === RequiredJoin.Media) {
        // Unit
      } else if (join instanceof RequiredJoin.ReadList) {
        // Unit
      } else if (join instanceof RequiredJoin.ReadProgress) {
        // Unit
      }
    }
    if (!isNullOrEmpty(context.libraryIds) || filterBy?.type === FilterByEntity.LIBRARY) query.leftJoin(this.s).on(this.bma.SERIES_ID.eq(this.s.ID))
    if (filterBy?.type === FilterByEntity.COLLECTION) query.leftJoin(this.cs).on(this.bma.SERIES_ID.eq(this.cs.SERIES_ID))
    if (filterBy?.type === FilterByEntity.READLIST) query.leftJoin(this.b).on(this.bma.SERIES_ID.eq(this.b.SERIES_ID)).leftJoin(this.rb).on(this.b.ID.eq(this.rb.BOOK_ID))
    query.where(restrictionCondition[0])
    if (context.libraryIds !== null) query.and(this.s.LIBRARY_ID.in(context.libraryIds))
    if (filterBy !== null) {
      if (filterBy.type === FilterByEntity.LIBRARY) query.and(this.s.LIBRARY_ID.in(filterBy.ids))
      else if (filterBy.type === FilterByEntity.COLLECTION) query.and(this.cs.COLLECTION_ID.in(filterBy.ids))
      else if (filterBy.type === FilterByEntity.SERIES) query.and(this.bma.SERIES_ID.in(filterBy.ids))
      else if (filterBy.type === FilterByEntity.READLIST) query.and(this.rb.READLIST_ID.in(filterBy.ids))
    }
    const count = this.dslRO.fetchCount(query)
    query.orderBy(sortField)
    if (pageable.isPaged) query.limit(pageable.pageSize).offset(pageable.offset)
    const items = mapNotNull(query.fetchArray(0), (it) => (it !== null ? str(it) : null))
    return buildPage(items, pageable, count, Sort.by(Order.desc('year')))
  }

  /** @deprecated Use findSharingLabels instead */
  findAllSharingLabels(filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.selectDistinct(this.sl.LABEL).from(this.sl)
    if (filterOnLibraryIds !== null) {
      q.leftJoin(this.s).on(this.sl.SERIES_ID.eq(this.s.ID)).where(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    }
    return q.orderBy(unicode3(this.sl.LABEL)).fetchSet(this.sl.LABEL)
  }

  /** @deprecated Use findSharingLabels instead */
  findAllSharingLabelsByLibraries(libraryIds: ReadonlySet<string>, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO
      .selectDistinct(this.sl.LABEL)
      .from(this.sl)
      .leftJoin(this.s)
      .on(this.sl.SERIES_ID.eq(this.s.ID))
      .where(this.s.LIBRARY_ID.in(libraryIds))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.sl.LABEL)).fetchSet(this.sl.LABEL)
  }

  /** @deprecated Use findSharingLabels instead */
  findAllSharingLabelsByCollection(collectionId: string, filterOnLibraryIds: Iterable<string> | null): Set<string> {
    const q = this.dslRO.selectDistinct(this.sl.LABEL).from(this.sl).leftJoin(this.cs).on(this.sl.SERIES_ID.eq(this.cs.SERIES_ID))
    if (filterOnLibraryIds !== null) q.leftJoin(this.s).on(this.sl.SERIES_ID.eq(this.s.ID))
    q.where(this.cs.COLLECTION_ID.eq(collectionId))
    if (filterOnLibraryIds !== null) q.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    return q.orderBy(unicode3(this.sl.LABEL)).fetchSet(this.sl.LABEL)
  }

  findSharingLabels(context: SearchContext, search: string | null, filterBy: FilterBy | null, pageable: Pageable): Page<string> {
    if (filterBy !== null) require(new Set([FilterByEntity.LIBRARY, FilterByEntity.COLLECTION]).has(filterBy.type))

    return this.findGeneric(context, search, filterBy, pageable, this.sl, this.sl.LABEL, this.sl.SERIES_ID, null, (it) => (it !== null ? it.label : null), Sort.by('label'))
  }

  // PORT: <R : TableRecordImpl<*>, T : TableImpl<R>, O : Any> -> <R, O> (R déduit de la table)
  private findGeneric<R, O>(
    context: SearchContext,
    search: string | null,
    filterBy: FilterBy | null,
    pageable: Pageable,
    table: Table<R>,
    searchableField: TableField<R, string> | null,
    seriesIdField: TableField<unknown, string> | null,
    bookIdField: TableField<unknown, string> | null,
    mapper: (r: R | null) => O | null,
    sort: Sort,
    {
      extraFields = [],
      extraCondition = DSL.noCondition(),
      sortField = null,
    }: { extraFields?: SelectFieldOrAsterisk[]; extraCondition?: Condition | null; sortField?: OrderField | null } = {},
  ): Page<O> {
    // depending on what is being searched, we may need to filter by series, or book, or both
    // we need to have at least 1 of those 2 fields, and the other can be found by joining as necessary through the Book table
    require(seriesIdField !== null || bookIdField !== null)

    const restrictionCondition = new ContentRestrictionsSearchHelper(context.restrictions).toCondition()

    const seriesIdRequired =
      (filterBy !== null && [FilterByEntity.SERIES, FilterByEntity.COLLECTION, FilterByEntity.LIBRARY].includes(filterBy.type)) ||
      restrictionCondition[1].has(RequiredJoin.SeriesMetadata) ||
      !isNullOrEmpty(context.libraryIds)
    const bookIdRequired = filterBy?.type === FilterByEntity.READLIST
    const effectiveSeriesIdField = seriesIdField ?? this.b.SERIES_ID
    const effectiveBookIdField = bookIdField ?? this.b.ID

    const query = this.dslRO.selectDistinct(...[...(searchableField !== null ? [searchableField] : []), ...extraFields]).from(table)
    if (seriesIdRequired && seriesIdField === null) query.innerJoin(this.b).on(nn(bookIdField).eq(this.b.ID))
    if (bookIdRequired && bookIdField === null) query.innerJoin(this.b).on(nn(seriesIdField).eq(this.b.SERIES_ID))
    for (const join of restrictionCondition[1]) {
      if (join === RequiredJoin.SeriesMetadata) {
        if ((table as Table<unknown>) !== this.sd) query.innerJoin(this.sd).on(effectiveSeriesIdField.eq(this.sd.SERIES_ID))
      }
      // shouldn't be required
      else if (join === RequiredJoin.BookMetadata) {
        // Unit
      } else if (join === RequiredJoin.BookMetadataAggregation) {
        // Unit
      } else if (join instanceof RequiredJoin.Collection) {
        // Unit
      } else if (join === RequiredJoin.Media) {
        // Unit
      } else if (join instanceof RequiredJoin.ReadList) {
        // Unit
      } else if (join instanceof RequiredJoin.ReadProgress) {
        // Unit
      }
    }
    if (!isNullOrEmpty(context.libraryIds) || filterBy?.type === FilterByEntity.LIBRARY) query.leftJoin(this.s).on(effectiveSeriesIdField.eq(this.s.ID))
    if (filterBy?.type === FilterByEntity.COLLECTION) query.leftJoin(this.cs).on(effectiveSeriesIdField.eq(this.cs.SERIES_ID))
    if (filterBy?.type === FilterByEntity.READLIST) query.leftJoin(this.rb).on(effectiveBookIdField.eq(this.rb.BOOK_ID))
    query.where(restrictionCondition[0])
    if (extraCondition !== null) query.and(extraCondition)
    if (search !== null && searchableField !== null) query.and(udfStripAccents(searchableField).contains(stripAccents(search)))
    if (context.libraryIds !== null) query.and(this.s.LIBRARY_ID.in(context.libraryIds))
    if (filterBy !== null) {
      if (filterBy.type === FilterByEntity.LIBRARY) query.and(this.s.LIBRARY_ID.in(filterBy.ids))
      else if (filterBy.type === FilterByEntity.COLLECTION) query.and(this.cs.COLLECTION_ID.in(filterBy.ids))
      else if (filterBy.type === FilterByEntity.SERIES) query.and(effectiveSeriesIdField.in(filterBy.ids))
      else if (filterBy.type === FilterByEntity.READLIST) query.and(this.rb.READLIST_ID.in(filterBy.ids))
    }

    const count = this.dslRO.fetchCount(query)

    if (sortField !== null) query.orderBy(sortField)
    else if (searchableField !== null) query.orderBy(unicode3(searchableField))
    if (pageable.isPaged) query.limit(pageable.pageSize).offset(pageable.offset)
    const items = mapNotNull(query.fetchInto(table), (it) => mapper(it))

    return buildPage(items, pageable, count, sort)
  }

  // PORT: deux fonctions d'extension toDomain (BookMetadataAuthorRecord, BookMetadataAggregationAuthorRecord) fusionnées
  private toDomain(self: BookMetadataAuthorRecord | BookMetadataAggregationAuthorRecord): Author {
    return new Author({
      name: self.name,
      role: self.role,
    })
  }
}

// PORT: Collection?.isNullOrEmpty() de la stdlib Kotlin
function isNullOrEmpty(c: Iterable<string> | null): boolean {
  return c === null || [...c].length === 0
}

component(ReferentialDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
  types: [ReferentialRepository],
})
