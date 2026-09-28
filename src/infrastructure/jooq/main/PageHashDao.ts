// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/PageHashDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { BookPageNumbered } from '../../../domain/model/BookPageNumbered.js'
import { PageHashKnown } from '../../../domain/model/PageHashKnown.js'
import { PageHashMatch } from '../../../domain/model/PageHashMatch.js'
import { PageHashUnknown } from '../../../domain/model/PageHashUnknown.js'
import { PageHashRepository } from '../../../domain/persistence/PageHashRepository.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { toOrderBy } from '../Utils.js'
import { type PageHashRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import type { Field } from '../../../port/jooq/core.js'
import { DSL, DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { component } from '../../../port/spring.js'
import { URL } from '../../../port/java-net.js'

export class PageHashDao extends SplitDslDaoBase implements PageHashRepository {
  private readonly p = Tables.MEDIA_PAGE
  private readonly b = Tables.BOOK
  private readonly ph = Tables.PAGE_HASH
  private readonly pht = Tables.PAGE_HASH_THUMBNAIL

  private readonly sortsKnown = new Map<string, Field<unknown>>([
    ['hash', this.ph.HASH],
    ['matchCount', DSL.field('count')],
    ['deleteCount', this.ph.DELETE_COUNT],
    ['deleteSize', this.ph.SIZE.times(this.ph.DELETE_COUNT)],
    ['fileSize', this.ph.SIZE],
    ['size', this.ph.SIZE],
    ['createdDate', this.ph.CREATED_DATE],
    ['created', this.ph.CREATED_DATE],
    ['lastModifiedDate', this.ph.LAST_MODIFIED_DATE],
    ['lastModified', this.ph.LAST_MODIFIED_DATE],
  ] as [string, Field<unknown>][])

  private readonly sortsUnknown = new Map<string, Field<unknown>>([
    ['hash', this.p.FILE_HASH],
    ['fileSize', this.p.FILE_SIZE],
    ['size', this.p.FILE_SIZE],
    ['matchCount', DSL.field('count')],
    ['totalSize', DSL.field('totalSize')],
    ['url', this.b.URL],
    ['bookId', this.b.ID],
    ['pageNumber', this.p.NUMBER],
  ] as [string, Field<unknown>][])

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  findKnown(pageHash: string): PageHashKnown | null {
    const r = this.dslRO.selectFrom(this.ph).where(this.ph.HASH.eq(pageHash)).fetchOneInto(this.ph)
    return r !== null ? toDomain(r) : null
  }

  findAllKnown(actions: PageHashKnown.Action[] | null, pageable: Pageable): Page<PageHashKnown> {
    const query = this.dslRO
      .select(...this.ph.fields(), DSL.count(this.p.FILE_HASH).as('count'))
      .from(this.ph)
      .leftJoin(this.p)
      .on(this.ph.HASH.eq(this.p.FILE_HASH))
    // PORT: jOOQ convertit les enums en String (name) pour un champ VARCHAR
    if (actions !== null) query.where(this.ph.ACTION.in(actions.map((it) => it.name)))
    query.groupBy(...this.ph.fields())

    const count = this.dslRO.fetchCount(query)

    const orderBy = toOrderBy(pageable.sort, this.sortsKnown)
    query.orderBy(orderBy)
    if (pageable.isPaged) query.limit(pageable.pageSize).offset(pageable.offset)
    const items = query.fetch().map((it) => toDomain(it.into(this.ph), it.get<number>('count')))

    const pageSort = orderBy.length > 0 ? pageable.sort : Sort.unsorted()
    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
      count,
    )
  }

  findAllUnknown(pageable: Pageable): Page<PageHashUnknown> {
    const bookCount = DSL.count(this.p.BOOK_ID)
    const query = this.dslRO
      .select(this.p.FILE_HASH, this.p.FILE_SIZE, bookCount.as('count'), bookCount.times(this.p.FILE_SIZE).as('totalSize'))
      .from(this.p)
      .where(this.p.FILE_HASH.ne(''))
      .and(DSL.notExists(this.dslRO.selectOne().from(this.ph).where(this.ph.HASH.eq(this.p.FILE_HASH))))
      .groupBy(this.p.FILE_HASH)
      .having(DSL.count(this.p.BOOK_ID).gt(1))

    const count = this.dslRO.fetchCount(query)

    const orderBy = toOrderBy(pageable.sort, this.sortsUnknown)
    query.orderBy(orderBy)
    if (pageable.isPaged) query.limit(pageable.pageSize).offset(pageable.offset)
    const items = query.fetch((it) => new PageHashUnknown({ hash: it.value1(), size: it.value2(), matchCount: it.value3() }))

    const pageSort = orderBy.length > 0 ? pageable.sort : Sort.unsorted()
    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
      count,
    )
  }

  findMatchesByHash(pageHash: string, pageable: Pageable): Page<PageHashMatch> {
    const query = this.dslRO
      .select(this.p.BOOK_ID, this.b.URL, this.p.NUMBER, this.p.FILE_NAME, this.p.FILE_SIZE, this.p.MEDIA_TYPE)
      .from(this.p)
      .leftJoin(this.b)
      .on(this.p.BOOK_ID.eq(this.b.ID))
      .where(this.p.FILE_HASH.eq(pageHash))

    const count = this.dslRO.fetchCount(query)

    const orderBy = toOrderBy(pageable.sort, this.sortsUnknown)
    query.orderBy(orderBy)
    if (pageable.isPaged) query.limit(pageable.pageSize).offset(pageable.offset)
    const items = query.fetch(
      (it) =>
        new PageHashMatch({
          bookId: it.value1(),
          url: new URL(it.value2<string>()),
          pageNumber: it.value3<number>() + 1,
          fileName: it.value4(),
          fileSize: it.value5(),
          mediaType: it.value6(),
        }),
    )

    const pageSort = orderBy.length > 0 ? pageable.sort : Sort.unsorted()
    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
      count,
    )
  }

  findMatchesByKnownHashAction(actions: PageHashKnown.Action[] | null, libraryId: string | null): Map<string, BookPageNumbered[]> {
    const query = this.dslRO
      .select(this.p.BOOK_ID, this.p.FILE_NAME, this.p.NUMBER, this.p.FILE_HASH, this.p.MEDIA_TYPE, this.p.FILE_SIZE)
      .from(this.p)
      .innerJoin(this.ph)
      .on(this.p.FILE_HASH.eq(this.ph.HASH))
    if (libraryId !== null) query.innerJoin(this.b).on(this.b.ID.eq(this.p.BOOK_ID))
    // PORT: jOOQ convertit les enums en String (name) pour un champ VARCHAR ; in(null) est rendu `in ()` par jOOQ
    query.where(this.ph.ACTION.in(actions !== null ? actions.map((it) => it.name) : []))
    if (libraryId !== null) query.and(this.b.LIBRARY_ID.eq(libraryId))
    const pairs = query.fetch(
      (it) =>
        [
          it.value1<string>(),
          new BookPageNumbered({
            fileName: it.value2(),
            pageNumber: it.value3<number>() + 1,
            fileHash: it.value4(),
            mediaType: it.value5(),
            fileSize: it.value6(),
          }),
        ] as const,
    )
    // PORT: groupingBy { it.first }.fold(emptyList()) { acc, (_, new) -> acc + new }
    const result = new Map<string, BookPageNumbered[]>()
    for (const [key, value] of pairs) result.set(key, [...(result.get(key) ?? []), value])
    return result
  }

  getKnownThumbnail(pageHash: string): Uint8Array | null {
    const r = this.dslRO.select(this.pht.THUMBNAIL).from(this.pht).where(this.pht.HASH.eq(pageHash)).fetchOne()
    return r !== null ? r.value1<Uint8Array>() : null
  }

  // @Transactional
  insert(pageHash: PageHashKnown, thumbnail: Uint8Array | null): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .insertInto(this.ph)
        .set(this.ph.HASH, pageHash.hash)
        .set(this.ph.SIZE, pageHash.size)
        .set(this.ph.ACTION, pageHash.action.name)
        .execute()

      if (thumbnail !== null) {
        this.dslRW.insertInto(this.pht).set(this.pht.HASH, pageHash.hash).set(this.pht.THUMBNAIL, thumbnail).execute()
      }
    })
  }

  update(pageHash: PageHashKnown): void {
    this.dslRW
      .update(this.ph)
      .set(this.ph.ACTION, pageHash.action.name)
      .set(this.ph.SIZE, pageHash.size)
      .set(this.ph.DELETE_COUNT, pageHash.deleteCount)
      .set(this.ph.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
      .where(this.ph.HASH.eq(pageHash.hash))
      .execute()
  }
}

function toDomain(self: PageHashRecord, matchCount: number = 0): PageHashKnown {
  return new PageHashKnown({
    hash: self.hash,
    size: self.size,
    deleteCount: self.deleteCount,
    matchCount: matchCount,
    action: PageHashKnown.Action.valueOf(self.action),
    createdDate: toCurrentTimeZone(self.createdDate),
    lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
  })
}

component(PageHashDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
  types: [PageHashRepository],
})
