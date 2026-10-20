// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/BookMetadataDao.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { Author } from '../../../domain/model/Author.js'
import { BookMetadata } from '../../../domain/model/BookMetadata.js'
import { NotableEntity } from '../../../domain/model/NotableEntity.js'
import { WebLink } from '../../../domain/model/WebLink.js'
import { BookMetadataRepository } from '../../../domain/persistence/BookMetadataRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { type BookMetadataRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { DataAccessException } from '../../../port/jooq/exceptions.js'
import { component } from '../../../port/spring.js'
import { URI } from '../../../port/java-net.js'
import { chunked, first, firstOrNull } from '../../../port/kotlin.js'

export class BookMetadataDao extends SplitDslDaoBase implements BookMetadataRepository {
  private readonly d = Tables.BOOK_METADATA
  private readonly a = Tables.BOOK_METADATA_AUTHOR
  private readonly bt = Tables.BOOK_METADATA_TAG
  private readonly bl = Tables.BOOK_METADATA_LINK
  private readonly ne = Tables.BOOK_METADATA_NOTABLE_ENTITIES

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  findById(bookId: string): BookMetadata {
    return first(this.find(this.dslRO, [bookId]))
  }

  findByIdOrNull(bookId: string): BookMetadata | null {
    return firstOrNull(this.find(this.dslRO, [bookId]))
  }

  findAllByIds(bookIds: Iterable<string>): BookMetadata[] {
    return this.find(this.dslRO, bookIds)
  }

  // PORT: les multiset de jOOQ (sous-requêtes corrélées rendues en JSON par SQLite) ne sont pas portés : une requête
  // par table liée sur les mêmes livres, regroupée par livre dans l'ordre de lecture (index BOOK_ID puis rowid, comme
  // les sous-requêtes corrélées)
  private find(self: DSLContext, bookIds: Iterable<string>): BookMetadata[] {
    const ids = [...bookIds]
    const records = self.selectFrom(this.d).where(this.d.BOOK_ID.in(ids)).fetchInto(this.d)
    if (records.length === 0) return []

    // authors
    const authors = groupByBookId(
      self.select(this.a.BOOK_ID, this.a.NAME, this.a.ROLE).from(this.a).where(this.a.BOOK_ID.in(ids)).fetchInto(this.a),
      (it) => it.bookId,
      (it) => new Author({ name: it.name, role: it.role }),
    )
    // tags
    const tags = groupByBookId(
      self.select(this.bt.BOOK_ID, this.bt.TAG).from(this.bt).where(this.bt.BOOK_ID.in(ids)).fetchInto(this.bt),
      (it) => it.bookId,
      (it) => it.tag,
    )
    // links
    const links = groupByBookId(
      self.select(this.bl.BOOK_ID, this.bl.LABEL, this.bl.URL).from(this.bl).where(this.bl.BOOK_ID.in(ids)).fetchInto(this.bl),
      (it) => it.bookId,
      (it) => new WebLink({ label: it.label, url: new URI(it.url) }),
    )
    // notable entities
    const notableEntities = groupByBookId(
      self.select(this.ne.BOOK_ID, this.ne.KIND, this.ne.NAME).from(this.ne).where(this.ne.BOOK_ID.in(ids)).fetchInto(this.ne),
      (it) => it.bookId,
      (it) => new NotableEntity({ kind: it.kind, name: it.name }),
    )

    return records.map((record) =>
      this.toDomain(record, authors.get(record.bookId) ?? [], new Set(tags.get(record.bookId) ?? []), links.get(record.bookId) ?? [], notableEntities.get(record.bookId) ?? []),
    )
  }

  // PORT: surcharges insert(BookMetadata) / insert(Collection<BookMetadata>) fusionnées (union de types)
  // @Transactional
  insert(metadataOrMetadatas: BookMetadata | Iterable<BookMetadata>): void {
    transactional(this.dslRW.db, () => {
      if (metadataOrMetadatas instanceof BookMetadata) {
        const metadata = metadataOrMetadatas
        this.insert([metadata])
      } else this.insertMany([...metadataOrMetadatas])
    })
  }

  // PORT: override fun insert(metadatas: Collection<BookMetadata>), appelée par insert() ci-dessus
  // @Transactional
  private insertMany(metadatas: BookMetadata[]): void {
    transactional(this.dslRW.db, () => {
      if (metadatas.length > 0) {
        for (const chunk of chunked(metadatas, this.batchSize)) {
          const step = this.dslRW.batch(
            this.dslRW
              .insertInto(
                this.d,
                this.d.BOOK_ID,
                this.d.TITLE,
                this.d.TITLE_LOCK,
                this.d.SUMMARY,
                this.d.SUMMARY_LOCK,
                this.d.NUMBER,
                this.d.NUMBER_LOCK,
                this.d.NUMBER_SORT,
                this.d.NUMBER_SORT_LOCK,
                this.d.RELEASE_DATE,
                this.d.RELEASE_DATE_LOCK,
                this.d.AUTHORS_LOCK,
                this.d.NOTABLE_ENTITIES_LOCK,
                this.d.TAGS_LOCK,
                this.d.ISBN,
                this.d.ISBN_LOCK,
                this.d.LINKS_LOCK,
              )
              .values(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null),
          )
          for (const it of chunk) {
            step.bind(
              it.bookId,
              it.title,
              it.titleLock,
              it.summary,
              it.summaryLock,
              it.number,
              it.numberLock,
              it.numberSort,
              it.numberSortLock,
              it.releaseDate,
              it.releaseDateLock,
              it.authorsLock,
              it.notableEntitiesLock,
              it.tagsLock,
              it.isbn,
              it.isbnLock,
              it.linksLock,
            )
          }
          step.execute()
        }

        this.insertAuthors(this.dslRW, metadatas)
        this.insertNotableEntities(this.dslRW, metadatas)
        this.insertTags(this.dslRW, metadatas)
        this.insertLinks(this.dslRW, metadatas)
      }
    })
  }

  // PORT: surcharges update(BookMetadata) / update(Collection<BookMetadata>) fusionnées (union de types)
  // @Transactional
  update(metadataOrMetadatas: BookMetadata | Iterable<BookMetadata>): void {
    transactional(this.dslRW.db, () => {
      if (metadataOrMetadatas instanceof BookMetadata) {
        const metadata = metadataOrMetadatas
        this.updateMetadata(metadata)
      } else {
        // PORT: override fun update(metadatas: Collection<BookMetadata>)
        const metadatas = metadataOrMetadatas
        for (const it of metadatas) this.updateMetadata(it)
      }
    })
  }

  private updateMetadata(metadata: BookMetadata): void {
    this.dslRW
      .update(this.d)
      .set(this.d.TITLE, metadata.title)
      .set(this.d.TITLE_LOCK, metadata.titleLock)
      .set(this.d.SUMMARY, metadata.summary)
      .set(this.d.SUMMARY_LOCK, metadata.summaryLock)
      .set(this.d.NUMBER, metadata.number)
      .set(this.d.NUMBER_LOCK, metadata.numberLock)
      .set(this.d.NUMBER_SORT, metadata.numberSort)
      .set(this.d.NUMBER_SORT_LOCK, metadata.numberSortLock)
      .set(this.d.RELEASE_DATE, metadata.releaseDate)
      .set(this.d.RELEASE_DATE_LOCK, metadata.releaseDateLock)
      .set(this.d.AUTHORS_LOCK, metadata.authorsLock)
      .set(this.d.NOTABLE_ENTITIES_LOCK, metadata.notableEntitiesLock)
      .set(this.d.TAGS_LOCK, metadata.tagsLock)
      .set(this.d.ISBN, metadata.isbn)
      .set(this.d.ISBN_LOCK, metadata.isbnLock)
      .set(this.d.LINKS_LOCK, metadata.linksLock)
      .set(this.d.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
      .where(this.d.BOOK_ID.eq(metadata.bookId))
      .execute()

    this.dslRW.deleteFrom(this.a).where(this.a.BOOK_ID.eq(metadata.bookId)).execute()
    this.dslRW.deleteFrom(this.ne).where(this.ne.BOOK_ID.eq(metadata.bookId)).execute()
    this.dslRW.deleteFrom(this.bt).where(this.bt.BOOK_ID.eq(metadata.bookId)).execute()
    this.dslRW.deleteFrom(this.bl).where(this.bl.BOOK_ID.eq(metadata.bookId)).execute()

    this.insertAuthors(this.dslRW, [metadata])
    this.insertNotableEntities(this.dslRW, [metadata])
    this.insertTags(this.dslRW, [metadata])
    this.insertLinks(this.dslRW, [metadata])
  }

  private insertAuthors(self: DSLContext, metadatas: BookMetadata[]): void {
    if (metadatas.some((it) => it.authors.length > 0)) {
      for (const chunk of chunked(metadatas, this.batchSize)) {
        const step = self.batch(self.insertInto(this.a, this.a.BOOK_ID, this.a.NAME, this.a.ROLE).values(null, null, null))
        for (const metadata of chunk) {
          for (const it of metadata.authors) {
            step.bind(metadata.bookId, it.name, it.role)
          }
        }
        step.execute()
      }
    }
  }

  private insertNotableEntities(self: DSLContext, metadatas: BookMetadata[]): void {
    if (metadatas.some((it) => it.notableEntities.length > 0)) {
      for (const chunk of chunked(metadatas, this.batchSize)) {
        const step = self.batch(self.insertInto(this.ne, this.ne.BOOK_ID, this.ne.NAME, this.ne.KIND).values(null, null, null))
        for (const metadata of chunk) {
          for (const it of metadata.notableEntities) {
            step.bind(metadata.bookId, it.name, it.kind)
          }
        }
        step.execute()
      }
    }
  }

  private insertTags(self: DSLContext, metadatas: BookMetadata[]): void {
    if (metadatas.some((it) => it.tags.size > 0)) {
      for (const chunk of chunked(metadatas, this.batchSize)) {
        const step = self.batch(self.insertInto(this.bt, this.bt.BOOK_ID, this.bt.TAG).values(null, null))
        for (const metadata of chunk) {
          for (const it of metadata.tags) {
            step.bind(metadata.bookId, it)
          }
        }
        step.execute()
      }
    }
  }

  private insertLinks(self: DSLContext, metadatas: BookMetadata[]): void {
    if (metadatas.some((it) => it.links.length > 0)) {
      for (const chunk of chunked(metadatas, this.batchSize)) {
        const step = self.batch(self.insertInto(this.bl, this.bl.BOOK_ID, this.bl.LABEL, this.bl.URL).values(null, null, null))
        for (const metadata of chunk) {
          for (const it of metadata.links) {
            step.bind(metadata.bookId, it.label, it.url.toString())
          }
        }
        step.execute()
      }
    }
  }

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  // @Transactional
  delete(bookIdOrIds: string | Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      if (typeof bookIdOrIds === 'string') {
        const bookId = bookIdOrIds
        this.dslRW.deleteFrom(this.a).where(this.a.BOOK_ID.eq(bookId)).execute()
        this.dslRW.deleteFrom(this.ne).where(this.ne.BOOK_ID.eq(bookId)).execute()
        this.dslRW.deleteFrom(this.bt).where(this.bt.BOOK_ID.eq(bookId)).execute()
        this.dslRW.deleteFrom(this.bl).where(this.bl.BOOK_ID.eq(bookId)).execute()
        this.dslRW.deleteFrom(this.d).where(this.d.BOOK_ID.eq(bookId)).execute()
      } else {
        // PORT: override fun delete(bookIds: Collection<String>)
        const bookIds = bookIdOrIds
        use(TempTable.withTempTable(this.dslRW, this.batchSize, bookIds), (it) => {
          this.dslRW.deleteFrom(this.a).where(this.a.BOOK_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.ne).where(this.ne.BOOK_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.bt).where(this.bt.BOOK_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.bl).where(this.bl.BOOK_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.d).where(this.d.BOOK_ID.in(it.selectTempStrings())).execute()
        })
      }
    })
  }

  count(): number {
    return this.dslRO.fetchCount(this.d)
  }

  private toDomain(self: BookMetadataRecord, authors: Author[], tags: Set<string>, links: WebLink[], notableEntities: NotableEntity[]): BookMetadata {
    return new BookMetadata({
      title: self.title,
      summary: self.summary,
      number: self.number,
      numberSort: self.numberSort,
      releaseDate: self.releaseDate,
      authors: authors,
      notableEntities: notableEntities,
      tags: tags,
      isbn: self.isbn,
      links: links,
      bookId: self.bookId,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
      titleLock: self.titleLock,
      summaryLock: self.summaryLock,
      numberLock: self.numberLock,
      numberSortLock: self.numberSortLock,
      releaseDateLock: self.releaseDateLock,
      authorsLock: self.authorsLock,
      notableEntitiesLock: self.notableEntitiesLock,
      tagsLock: self.tagsLock,
      isbnLock: self.isbnLock,
      linksLock: self.linksLock,
    })
  }
}

// PORT: regroupement par livre des lignes des tables liées (voir find)
function groupByBookId<R, T>(records: R[], bookId: (r: R) => string, map: (r: R) => T): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const r of records) {
    const id = bookId(r)
    let g = groups.get(id)
    if (g === undefined) groups.set(id, (g = []))
    // jOOQ : une exception levée par la conversion d'un multiset (convertFrom) est enveloppée dans une DataAccessException
    try {
      g.push(map(r))
    } catch (e) {
      throw new DataAccessException(`Error while converting multiset: ${(e as Error).message}`, e)
    }
  }
  return groups
}

component(BookMetadataDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [BookMetadataRepository],
})
