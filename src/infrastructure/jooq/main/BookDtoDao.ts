// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/BookDtoDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BookSearch } from '../../../domain/model/BookSearch.js'
import { ContentRestrictions } from '../../../domain/model/ContentRestrictions.js'
import type { ReadList } from '../../../domain/model/ReadList.js'
import { SearchContext } from '../../../domain/model/SearchContext.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { BookSearchHelper } from '../BookSearchHelper.js'
import { RequiredJoin } from '../RequiredJoin.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { noCase, rlbAlias, sortByValues, toCondition, toOrderBy, toSortField, unicode3 } from '../Utils.js'
import { LuceneEntity } from '../../search/LuceneEntity.js'
import { LuceneHelper } from '../../search/LuceneHelper.js'
import { toFilePath } from '../../web/Utils.js'
import { BookDtoRepository } from '../../../interfaces/api/persistence/BookDtoRepository.js'
import { AuthorDto } from '../../../interfaces/api/rest/dto/AuthorDto.js'
import { BookDto, BookMetadataDto, MediaDto, ReadProgressDto } from '../../../interfaces/api/rest/dto/BookDto.js'
import { WebLinkDto } from '../../../interfaces/api/rest/dto/WebLinkDto.js'
import { type BookMetadataRecord, type BookRecord, type MediaRecord, type ReadProgressRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toUTC } from '../../../language/LanguageUtils.js'
import type { Condition, Field, Select, SortField } from '../../../port/jooq/core.js'
import { DSL, DSLContext, falseCondition, noCondition } from '../../../port/jooq/dsl.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { component } from '../../../port/spring.js'
import { URL } from '../../../port/java-net.js'
import { associate, LinkedHashMap, firstOrNull, mapNotNull, nn, require } from '../../../port/kotlin.js'
import { BookCommonDao } from './BookCommonDao.js'

export class BookDtoDao extends SplitDslDaoBase implements BookDtoRepository {
  private readonly b = Tables.BOOK
  private readonly m = Tables.MEDIA
  private readonly d = Tables.BOOK_METADATA
  private readonly r = Tables.READ_PROGRESS
  private readonly a = Tables.BOOK_METADATA_AUTHOR
  private readonly sd = Tables.SERIES_METADATA
  private readonly rlb = Tables.READLIST_BOOK
  private readonly bt = Tables.BOOK_METADATA_TAG
  private readonly bl = Tables.BOOK_METADATA_LINK

  private readonly onDeckFields = [...this.b.fields(), ...this.m.fields(), ...this.d.fields(), ...this.r.fields(), this.sd.TITLE]

  private readonly sorts = new Map<string, Field<unknown>>([
    ['name', unicode3(this.b.NAME)],
    ['series', unicode3(this.sd.TITLE_SORT)],
    ['created', this.b.CREATED_DATE],
    ['createdDate', this.b.CREATED_DATE],
    ['lastModified', this.b.LAST_MODIFIED_DATE],
    ['lastModifiedDate', this.b.LAST_MODIFIED_DATE],
    ['fileSize', this.b.FILE_SIZE],
    ['size', this.b.FILE_SIZE],
    ['fileHash', this.b.FILE_HASH],
    ['url', noCase(this.b.URL)],
    ['media.status', noCase(this.m.STATUS)],
    ['media.comment', noCase(this.m.COMMENT)],
    ['media.mediaType', noCase(this.m.MEDIA_TYPE)],
    ['media.pagesCount', this.m.PAGE_COUNT],
    ['metadata.title', unicode3(this.d.TITLE)],
    ['metadata.numberSort', this.d.NUMBER_SORT],
    ['metadata.releaseDate', this.d.RELEASE_DATE],
    ['readProgress.lastModified', this.r.LAST_MODIFIED_DATE],
    ['readProgress.readDate', this.r.READ_DATE],
    ['readList.number', this.rlb.NUMBER],
  ])

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly luceneHelper: LuceneHelper,
    private readonly batchSize: number,
    private readonly bookCommonDao: BookCommonDao,
  ) {
    super(dslRW, dslRO)
  }

  // PORT: surcharges findAll(pageable) / findAll(context, pageable) / findAll(search, context, pageable) fusionnées
  findAll(pageable: Pageable): Page<BookDto>
  findAll(context: SearchContext, pageable: Pageable): Page<BookDto>
  findAll(search: BookSearch, context: SearchContext, pageable: Pageable): Page<BookDto>
  findAll(...args: [Pageable] | [SearchContext, Pageable] | [BookSearch, SearchContext, Pageable]): Page<BookDto> {
    if (args.length === 1) {
      const [pageable] = args
      return this.findAll(new BookSearch(), SearchContext.ofAnonymousUser(), pageable)
    }
    if (args.length === 2) {
      const [context, pageable] = args
      return this.findAll(new BookSearch(), context, pageable)
    }
    const [search, context, pageable] = args
    // PORT: requireNotNull -> require(x !== null)
    require(context.userId !== null, () => 'Missing userId in search context')

    const [conditions, joins] = new BookSearchHelper(context).toCondition(search.condition)
    return this.findAllInternal(conditions, context.userId, pageable, search.fullTextSearch, joins)
  }

  // PORT: surcharge privée findAll(conditions, userId, pageable, searchTerm, joins)
  private findAllInternal(conditions: Condition, userId: string, pageable: Pageable, searchTerm: string | null, joins: ReadonlySet<RequiredJoin>): Page<BookDto> {
    const bookIds = this.luceneHelper.searchEntitiesIds(searchTerm, LuceneEntity.Book)

    const orderBy = mapNotNull(pageable.sort, (it): Field<unknown> | SortField<unknown> | null => {
      if (it.property === 'relevance' && !(bookIds === null || bookIds.length === 0)) {
        return sortByValues(this.b.ID, bookIds, { asc: it.isAscending })
      } else {
        if (it.property === 'readList.number') {
          const readListId = firstOrNull([...joins].filter((j): j is RequiredJoin.ReadList => j instanceof RequiredJoin.ReadList))?.readListId ?? null
          if (readListId === null) return null
          const f = rlbAlias(readListId).NUMBER
          return it.isAscending ? f.asc() : f.desc()
        } else {
          return toSortField(it, this.sorts)
        }
      }
    })

    // don't use the DSLContext.withTempTable form to control optional creation
    return use(new TempTable(this.dslRO), (tempTable) => {
      let searchCondition: Condition
      if (bookIds === null) searchCondition = noCondition()
      else if (bookIds.length === 0) searchCondition = falseCondition()
      // use temp table in case there are many search results
      else {
        tempTable.insertTempStrings(this.batchSize, bookIds)
        searchCondition = this.b.ID.in(tempTable.selectTempStrings())
      }

      const countQuery = this.dslRO
        .select(this.b.ID)
        .from(this.b)
        .leftJoin(this.m)
        .on(this.b.ID.eq(this.m.BOOK_ID))
        .leftJoin(this.d)
        .on(this.b.ID.eq(this.d.BOOK_ID))
        .leftJoin(this.r)
        .on(this.b.ID.eq(this.r.BOOK_ID))
        .and(this.readProgressCondition(userId))
        .leftJoin(this.sd)
        .on(this.b.SERIES_ID.eq(this.sd.SERIES_ID))
      for (const join of joins) {
        if (join instanceof RequiredJoin.ReadList) {
          const rlbAlias_ = rlbAlias(join.readListId)
          countQuery.leftJoin(rlbAlias_).on(rlbAlias_.BOOK_ID.eq(this.b.ID).and(rlbAlias_.READLIST_ID.eq(join.readListId)))
        }
        // always joined
        else if (join === RequiredJoin.BookMetadata) {
          // Unit
        } else if (join === RequiredJoin.Media) {
          // Unit
        } else if (join instanceof RequiredJoin.ReadProgress) {
          // Unit
        }
        // Series joins - not needed
        else if (join === RequiredJoin.BookMetadataAggregation) {
          // Unit
        } else if (join === RequiredJoin.SeriesMetadata) {
          // Unit
        } else if (join instanceof RequiredJoin.Collection) {
          // Unit
        }
      }
      const count = this.dslRO.fetchCount(countQuery.where(conditions).and(searchCondition).groupBy(this.b.ID))

      const dtosQuery = this.selectBase(this.dslRO, userId, { joins }).where(conditions).and(searchCondition).orderBy(orderBy)
      if (pageable.isPaged) dtosQuery.limit(pageable.pageSize).offset(pageable.offset)
      const dtos = this.fetchAndMap(dtosQuery, this.dslRO)

      const pageSort = orderBy.length > 0 ? pageable.sort : Sort.unsorted()
      return new PageImpl(
        dtos,
        pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
        count,
      )
    })
  }

  findByIdOrNull(bookId: string, userId: string): BookDto | null {
    return firstOrNull(this.fetchAndMap(this.selectBase(this.dslRO, userId).where(this.b.ID.eq(bookId)), this.dslRO))
  }

  findPreviousInSeriesOrNull(bookId: string, userId: string): BookDto | null {
    return this.findSiblingSeries(bookId, userId, false)
  }

  findNextInSeriesOrNull(bookId: string, userId: string): BookDto | null {
    return this.findSiblingSeries(bookId, userId, true)
  }

  findPreviousInReadListOrNull(readList: ReadList, bookId: string, context: SearchContext): BookDto | null {
    return this.findSiblingReadList(readList, bookId, context, false)
  }

  findNextInReadListOrNull(readList: ReadList, bookId: string, context: SearchContext): BookDto | null {
    return this.findSiblingReadList(readList, bookId, context, true)
  }

  findAllOnDeck(
    userId: string,
    filterOnLibraryIds: Iterable<string> | null,
    pageable: Pageable,
    { restrictions = new ContentRestrictions() }: { restrictions?: ContentRestrictions } = {},
  ): Page<BookDto> {
    const [query, sortField] = this.bookCommonDao.getBooksOnDeckQuery(userId, restrictions, filterOnLibraryIds, this.onDeckFields)

    const count = this.dslRO.fetchCount(query)
    query.orderBy(sortField.desc())
    if (pageable.isPaged) query.limit(pageable.pageSize).offset(pageable.offset)
    const dtos = this.fetchAndMap(query, this.dslRO)

    return new PageImpl(
      dtos,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, Sort.unsorted()) : PageRequest.of(0, Math.max(count, 20), Sort.unsorted()),
      count,
    )
  }

  findAllDuplicates(userId: string, pageable: Pageable): Page<BookDto> {
    const hashes = associate(
      this.dslRO
        .select(this.b.FILE_HASH, DSL.count(this.b.ID))
        .from(this.b)
        .where(this.b.FILE_HASH.ne(''))
        .groupBy(this.b.FILE_HASH, this.b.FILE_SIZE)
        .having(DSL.count(this.b.ID).gt(1))
        .fetch(),
      (it): [string, number] => [it.value1<string>(), it.value2<number>()],
    )

    const count = [...hashes.values()].reduce((acc, it) => acc + it, 0)

    const orderBy = toOrderBy(pageable.sort, this.sorts)
    const dtosQuery = this.selectBase(this.dslRO, userId).where(this.b.FILE_HASH.in(hashes.keys())).orderBy(orderBy)
    if (pageable.isPaged) dtosQuery.limit(pageable.pageSize).offset(pageable.offset)
    const dtos = this.fetchAndMap(dtosQuery, this.dslRO)

    const pageSort = orderBy.length > 0 ? pageable.sort : Sort.unsorted()
    return new PageImpl(
      dtos,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
      count,
    )
  }

  private readProgressCondition(userId: string): Condition {
    return this.r.USER_ID.eq(userId)
  }

  private findSiblingSeries(bookId: string, userId: string, next: boolean): BookDto | null {
    const record = nn(
      this.dslRO
        .select(this.b.SERIES_ID, this.d.NUMBER_SORT)
        .from(this.b)
        .leftJoin(this.d)
        .on(this.b.ID.eq(this.d.BOOK_ID))
        .where(this.b.ID.eq(bookId))
        .fetchOne(),
    )
    const seriesId = record.get<string>(0, String)
    const numberSort = record.get<number>(1, Number)

    return firstOrNull(
      this.fetchAndMap(
        this.selectBase(this.dslRO, userId)
          .where(this.b.SERIES_ID.eq(seriesId))
          .orderBy(next ? this.d.NUMBER_SORT.asc() : this.d.NUMBER_SORT.desc())
          .seek(numberSort)
          .limit(1),
        this.dslRO,
      ),
    )
  }

  private findSiblingReadList(readList: ReadList, bookId: string, context: SearchContext, next: boolean): BookDto | null {
    // PORT: requireNotNull -> require(x !== null)
    require(context.userId !== null, () => 'Missing userId in search context')

    if (readList.ordered) {
      const numberSortQuery = this.dslRO
        .select(this.rlb.NUMBER)
        .from(this.b)
        .leftJoin(this.rlb)
        .on(this.b.ID.eq(this.rlb.BOOK_ID))
        .where(this.b.ID.eq(bookId))
        .and(this.rlb.READLIST_ID.eq(readList.id))
      if (context.libraryIds !== null) numberSortQuery.and(this.b.LIBRARY_ID.in(context.libraryIds))
      const numberSort = numberSortQuery.fetchOne(this.rlb.NUMBER)

      const query = this.selectBase(this.dslRO, context.userId, { joins: new Set([new RequiredJoin.ReadList({ readListId: readList.id })]) })
      if (context.restrictions.isRestricted) query.and(toCondition(context.restrictions))
      if (context.libraryIds !== null) query.and(this.b.LIBRARY_ID.in(context.libraryIds))
      const f = rlbAlias(readList.id).NUMBER
      query
        .orderBy(next ? f.asc() : f.desc())
        .seek(numberSort)
        .limit(1)
      return firstOrNull(this.fetchAndMap(query, this.dslRO))
    } else {
      // it is too complex to perform a seek by release date as it could be null and could also have multiple occurrences of the same value
      // instead we pull the whole list of ids, and perform the seek on the list
      const bookIdsQuery = this.dslRO
        .select(this.b.ID)
        .from(this.b)
        .leftJoin(this.rlb)
        .on(this.b.ID.eq(this.rlb.BOOK_ID))
        .leftJoin(this.d)
        .on(this.b.ID.eq(this.d.BOOK_ID))
      if (context.restrictions.isRestricted) bookIdsQuery.leftJoin(this.sd).on(this.sd.SERIES_ID.eq(this.b.SERIES_ID))
      bookIdsQuery.where(this.rlb.READLIST_ID.eq(readList.id))
      if (context.restrictions.isRestricted) bookIdsQuery.and(toCondition(context.restrictions))
      if (context.libraryIds !== null) bookIdsQuery.and(this.b.LIBRARY_ID.in(context.libraryIds))
      const bookIds = bookIdsQuery.orderBy(this.d.RELEASE_DATE).fetch(this.b.ID)

      const bookIndex = bookIds.findIndex((it) => it === bookId)
      if (bookIndex === -1) return null
      const siblingId = bookIds[bookIndex + (next ? 1 : -1)] ?? null
      if (siblingId === null) return null

      const query = this.selectBase(this.dslRO, context.userId).where(this.b.ID.eq(siblingId))
      if (context.libraryIds !== null) query.and(this.b.LIBRARY_ID.in(context.libraryIds))
      return firstOrNull(this.fetchAndMap(query.limit(1), this.dslRO))
    }
  }

  private selectBase(self: DSLContext, userId: string, { joins = new Set() }: { joins?: ReadonlySet<RequiredJoin> } = {}): Select {
    const selectFields = [...this.b.fields(), ...this.m.fields(), ...this.d.fields(), ...this.r.fields(), this.sd.TITLE]

    const query = self
      .select(selectFields)
      .from(this.b)
      .leftJoin(this.m)
      .on(this.b.ID.eq(this.m.BOOK_ID))
      .leftJoin(this.d)
      .on(this.b.ID.eq(this.d.BOOK_ID))
      .leftJoin(this.r)
      .on(this.b.ID.eq(this.r.BOOK_ID))
      .and(this.readProgressCondition(userId))
      .leftJoin(this.sd)
      .on(this.b.SERIES_ID.eq(this.sd.SERIES_ID))
    for (const join of joins) {
      if (join instanceof RequiredJoin.ReadList) {
        const rlbAlias_ = rlbAlias(join.readListId)
        query.leftJoin(rlbAlias_).on(rlbAlias_.BOOK_ID.eq(this.b.ID).and(rlbAlias_.READLIST_ID.eq(join.readListId)))
      }
      // always joined
      else if (join === RequiredJoin.BookMetadata) {
        // Unit
      } else if (join === RequiredJoin.Media) {
        // Unit
      } else if (join instanceof RequiredJoin.ReadProgress) {
        // Unit
      }
      // Series joins - not needed
      else if (join === RequiredJoin.BookMetadataAggregation) {
        // Unit
      } else if (join === RequiredJoin.SeriesMetadata) {
        // Unit
      } else if (join instanceof RequiredJoin.Collection) {
        // Unit
      }
    }
    return query
  }

  private fetchAndMap(self: Select, dsl: DSLContext): BookDto[] {
    const records = self.fetch()
    const bookIds = records.getValues(this.b.ID)

    let authors!: Map<string, AuthorDto[]>
    let tags!: Map<string, string[]>
    let links!: Map<string, WebLinkDto[]>
    use(TempTable.withTempTable(dsl, this.batchSize, bookIds), (tempTable) => {
      // PORT: ResultQuery itéré (records typés) -> fetchInto(a)
      authors = groupByValues(
        dsl
          .selectFrom(this.a)
          .where(this.a.BOOK_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.a)
          .filter((it) => it.name !== null),
        (it) => it.bookId,
        (it) => new AuthorDto({ name: it.name, role: it.role }),
      )

      tags = groupByValues(
        dsl
          .selectFrom(this.bt)
          .where(this.bt.BOOK_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.bt),
        (it) => it.bookId,
        (it) => it.tag,
      )

      links = groupByValues(
        dsl
          .selectFrom(this.bl)
          .where(this.bl.BOOK_ID.in(tempTable.selectTempStrings()))
          .fetchInto(this.bl),
        (it) => it.bookId,
        (it) => new WebLinkDto({ label: it.label, url: it.url }),
      )
    })

    return records.map((rec) => {
      const br = rec.into(this.b)
      const mr = rec.into(this.m)
      const dr = rec.into(this.d)
      const rr = rec.into(this.r)
      const seriesTitle = rec.get(this.sd.TITLE)

      return this.bookToDto(
        br,
        this.mediaToDto(mr),
        this.metadataToDto(dr, authors.get(br.id) ?? [], new Set(tags.get(br.id) ?? []), links.get(br.id) ?? []),
        rr.userId !== null ? this.readProgressToDto(rr) : null,
        nn(seriesTitle),
      )
    })
  }

  // PORT: fonction d'extension BookRecord.toDto()
  private bookToDto(self: BookRecord, media: MediaDto, metadata: BookMetadataDto, readProgress: ReadProgressDto | null, seriesTitle: string): BookDto {
    return new BookDto({
      id: self.id,
      seriesId: self.seriesId,
      seriesTitle: seriesTitle,
      libraryId: self.libraryId,
      name: self.name,
      url: toFilePath(new URL(self.url)),
      number: self.number,
      created: self.createdDate,
      lastModified: self.lastModifiedDate,
      fileLastModified: toUTC(self.fileLastModified),
      sizeBytes: self.fileSize,
      media: media,
      metadata: metadata,
      readProgress: readProgress,
      deleted: self.deletedDate !== null,
      fileHash: self.fileHash,
      oneshot: self.oneshot,
    })
  }

  // PORT: fonction d'extension MediaRecord.toDto() ; nn() : valeur Java (plateforme) passée à un paramètre Kotlin non nul (NPE)
  private mediaToDto(self: MediaRecord): MediaDto {
    return new MediaDto({
      status: nn(self.status),
      mediaType: self.mediaType ?? '',
      pagesCount: nn(self.pageCount),
      comment: self.comment ?? '',
      epubDivinaCompatible: nn(self.epubDivinaCompatible),
      epubIsKepub: nn(self.epubIsKepub),
    })
  }

  // PORT: fonction d'extension BookMetadataRecord.toDto()
  private metadataToDto(self: BookMetadataRecord, authors: AuthorDto[], tags: ReadonlySet<string>, links: WebLinkDto[]): BookMetadataDto {
    return new BookMetadataDto({
      title: nn(self.title),
      titleLock: nn(self.titleLock),
      summary: nn(self.summary),
      summaryLock: nn(self.summaryLock),
      number: nn(self.number),
      numberLock: nn(self.numberLock),
      numberSort: nn(self.numberSort),
      numberSortLock: nn(self.numberSortLock),
      releaseDate: self.releaseDate,
      releaseDateLock: nn(self.releaseDateLock),
      authors: authors,
      authorsLock: nn(self.authorsLock),
      tags: tags,
      tagsLock: nn(self.tagsLock),
      isbn: nn(self.isbn),
      isbnLock: nn(self.isbnLock),
      links: links,
      linksLock: nn(self.linksLock),
      created: nn(self.createdDate),
      lastModified: nn(self.lastModifiedDate),
    })
  }

  // PORT: fonction d'extension ReadProgressRecord.toDto()
  private readProgressToDto(self: ReadProgressRecord): ReadProgressDto {
    return new ReadProgressDto({
      page: nn(self.page),
      completed: nn(self.completed),
      readDate: nn(self.readDate),
      created: nn(self.createdDate),
      lastModified: nn(self.lastModifiedDate),
      deviceId: nn(self.deviceId),
      deviceName: nn(self.deviceName),
    })
  }
}

// PORT: Iterable.groupBy(keySelector, valueTransform) de Kotlin
function groupByValues<T, K, V>(a: Iterable<T>, key: (t: T) => K, value: (t: T) => V): Map<K, V[]> {
  const m = new LinkedHashMap<K, V[]>()
  for (const x of a) {
    const k = key(x)
    const l = m.get(k)
    if (l) l.push(value(x))
    else m.set(k, [value(x)])
  }
  return m
}

component(BookDtoDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    LuceneHelper,
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
    BookCommonDao,
  ],
  types: [BookDtoRepository],
})
