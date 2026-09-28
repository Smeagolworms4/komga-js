// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/BookMetadataAggregationDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { Author } from '../../../domain/model/Author.js'
import { BookMetadataAggregation } from '../../../domain/model/BookMetadataAggregation.js'
import { BookMetadataAggregationRepository } from '../../../domain/persistence/BookMetadataAggregationRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { type BookMetadataAggregationAuthorRecord, type BookMetadataAggregationRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import type { Record } from '../../../port/jooq/core.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { component } from '../../../port/spring.js'
import { chunked, first, firstOrNull } from '../../../port/kotlin.js'

export class BookMetadataAggregationDao extends SplitDslDaoBase implements BookMetadataAggregationRepository {
  private readonly d = Tables.BOOK_METADATA_AGGREGATION
  private readonly a = Tables.BOOK_METADATA_AGGREGATION_AUTHOR
  private readonly t = Tables.BOOK_METADATA_AGGREGATION_TAG

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  findById(seriesId: string): BookMetadataAggregation {
    return first(this.findOne(this.dslRO, [seriesId]))
  }

  findByIdOrNull(seriesId: string): BookMetadataAggregation | null {
    return firstOrNull(this.findOne(this.dslRO, [seriesId]))
  }

  private findOne(self: DSLContext, seriesIds: Iterable<string>): BookMetadataAggregation[] {
    return [
      ...self
        .select(...this.d.fields(), ...this.a.fields())
        .from(this.d)
        .leftJoin(this.a)
        .on(this.d.SERIES_ID.eq(this.a.SERIES_ID))
        .where(this.d.SERIES_ID.in(seriesIds))
        .fetchGroups(
          (it: Record) => it.into(this.d),
          (it: Record) => it.into(this.a),
        ),
    ].map(([dr, ar]) =>
      this.toDomain(
        dr,
        ar.filter((it) => !(it.name === null)).map((it) => this.authorToDomain(it)),
        this.findTags(self, dr.seriesId),
      ),
    )
  }

  private findTags(self: DSLContext, seriesId: string): Set<string> {
    return self.select(this.t.TAG).from(this.t).where(this.t.SERIES_ID.eq(seriesId)).fetchSet(this.t.TAG)
  }

  // @Transactional
  insert(metadata: BookMetadataAggregation): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .insertInto(this.d)
        .set(this.d.SERIES_ID, metadata.seriesId)
        .set(this.d.RELEASE_DATE, metadata.releaseDate)
        .set(this.d.SUMMARY, metadata.summary)
        .set(this.d.SUMMARY_NUMBER, metadata.summaryNumber)
        .execute()

      this.insertAuthors(this.dslRW, metadata)
      this.insertTags(this.dslRW, metadata)
    })
  }

  // @Transactional
  update(metadata: BookMetadataAggregation): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .update(this.d)
        .set(this.d.SUMMARY, metadata.summary)
        .set(this.d.SUMMARY_NUMBER, metadata.summaryNumber)
        .set(this.d.RELEASE_DATE, metadata.releaseDate)
        .set(this.d.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
        .where(this.d.SERIES_ID.eq(metadata.seriesId))
        .execute()

      this.dslRW.deleteFrom(this.a).where(this.a.SERIES_ID.eq(metadata.seriesId)).execute()

      this.dslRW.deleteFrom(this.t).where(this.t.SERIES_ID.eq(metadata.seriesId)).execute()

      this.insertAuthors(this.dslRW, metadata)
      this.insertTags(this.dslRW, metadata)
    })
  }

  private insertAuthors(self: DSLContext, metadata: BookMetadataAggregation): void {
    if (metadata.authors.length > 0) {
      for (const chunk of chunked(metadata.authors, this.batchSize)) {
        const step = self.batch(self.insertInto(this.a, this.a.SERIES_ID, this.a.NAME, this.a.ROLE).values(null, null, null))
        for (const it of chunk) {
          step.bind(metadata.seriesId, it.name, it.role)
        }
        step.execute()
      }
    }
  }

  private insertTags(self: DSLContext, metadata: BookMetadataAggregation): void {
    if (metadata.tags.size > 0) {
      for (const chunk of chunked([...metadata.tags], this.batchSize)) {
        const step = self.batch(self.insertInto(this.t, this.t.SERIES_ID, this.t.TAG).values(null, null))
        for (const it of chunk) {
          step.bind(metadata.seriesId, it)
        }
        step.execute()
      }
    }
  }

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  // @Transactional
  delete(seriesIdOrIds: string | Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      if (typeof seriesIdOrIds === 'string') {
        const seriesId = seriesIdOrIds
        this.dslRW.deleteFrom(this.a).where(this.a.SERIES_ID.eq(seriesId)).execute()
        this.dslRW.deleteFrom(this.t).where(this.t.SERIES_ID.eq(seriesId)).execute()
        this.dslRW.deleteFrom(this.d).where(this.d.SERIES_ID.eq(seriesId)).execute()
      } else {
        // PORT: override fun delete(seriesIds: Collection<String>)
        const seriesIds = seriesIdOrIds
        use(TempTable.withTempTable(this.dslRW, this.batchSize, seriesIds), (it) => {
          this.dslRW.deleteFrom(this.a).where(this.a.SERIES_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.t).where(this.t.SERIES_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.d).where(this.d.SERIES_ID.in(it.selectTempStrings())).execute()
        })
      }
    })
  }

  count(): number {
    return this.dslRO.fetchCount(this.d)
  }

  private toDomain(self: BookMetadataAggregationRecord, authors: Author[], tags: Set<string>): BookMetadataAggregation {
    return new BookMetadataAggregation({
      authors: authors,
      tags: tags,
      releaseDate: self.releaseDate,
      summary: self.summary,
      summaryNumber: self.summaryNumber,
      seriesId: self.seriesId,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
    })
  }

  // PORT: surcharge d'extension BookMetadataAggregationAuthorRecord.toDomain() renommée
  private authorToDomain(self: BookMetadataAggregationAuthorRecord): Author {
    return new Author({
      name: self.name,
      role: self.role,
    })
  }
}

component(BookMetadataAggregationDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [BookMetadataAggregationRepository],
})
