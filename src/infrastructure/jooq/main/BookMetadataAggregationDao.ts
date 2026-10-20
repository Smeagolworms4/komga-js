// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/BookMetadataAggregationDao.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { Author } from '../../../domain/model/Author.js'
import { BookMetadataAggregation } from '../../../domain/model/BookMetadataAggregation.js'
import { NotableEntity } from '../../../domain/model/NotableEntity.js'
import { BookMetadataAggregationRepository } from '../../../domain/persistence/BookMetadataAggregationRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { type BookMetadataAggregationRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { DataAccessException } from '../../../port/jooq/exceptions.js'
import { component } from '../../../port/spring.js'
import { chunked, first, firstOrNull } from '../../../port/kotlin.js'

export class BookMetadataAggregationDao extends SplitDslDaoBase implements BookMetadataAggregationRepository {
  private readonly d = Tables.BOOK_METADATA_AGGREGATION
  private readonly a = Tables.BOOK_METADATA_AGGREGATION_AUTHOR
  private readonly t = Tables.BOOK_METADATA_AGGREGATION_TAG
  private readonly ne = Tables.BOOK_METADATA_AGGREGATION_NOTABLE_ENTITIES

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

  // PORT: les multiset de jOOQ ne sont pas portés : une requête par table liée sur les mêmes séries, regroupée par
  // série dans l'ordre de lecture (voir BookMetadataDao.find)
  private findOne(self: DSLContext, seriesIds: Iterable<string>): BookMetadataAggregation[] {
    const ids = [...seriesIds]
    const records = self.selectFrom(this.d).where(this.d.SERIES_ID.in(ids)).fetchInto(this.d)
    if (records.length === 0) return []

    // authors
    const authors = groupBySeriesId(
      self.select(this.a.SERIES_ID, this.a.NAME, this.a.ROLE).from(this.a).where(this.a.SERIES_ID.in(ids)).fetchInto(this.a),
      (it) => it.seriesId,
      (it) => new Author({ name: it.name, role: it.role }),
    )
    // tags
    const tags = groupBySeriesId(
      self.select(this.t.SERIES_ID, this.t.TAG).from(this.t).where(this.t.SERIES_ID.in(ids)).fetchInto(this.t),
      (it) => it.seriesId,
      (it) => it.tag,
    )
    // notable entities
    const notableEntities = groupBySeriesId(
      self.select(this.ne.SERIES_ID, this.ne.KIND, this.ne.NAME).from(this.ne).where(this.ne.SERIES_ID.in(ids)).fetchInto(this.ne),
      (it) => it.seriesId,
      (it) => new NotableEntity({ kind: it.kind, name: it.name }),
    )

    return records.map((record) =>
      this.toDomain(record, authors.get(record.seriesId) ?? [], new Set(tags.get(record.seriesId) ?? []), notableEntities.get(record.seriesId) ?? []),
    )
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
      this.insertNotableEntities(this.dslRW, metadata)
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

      this.dslRW.deleteFrom(this.ne).where(this.ne.SERIES_ID.eq(metadata.seriesId)).execute()

      this.dslRW.deleteFrom(this.t).where(this.t.SERIES_ID.eq(metadata.seriesId)).execute()

      this.insertAuthors(this.dslRW, metadata)
      this.insertNotableEntities(this.dslRW, metadata)
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

  private insertNotableEntities(self: DSLContext, metadata: BookMetadataAggregation): void {
    if (metadata.notableEntities.length > 0) {
      for (const chunk of chunked(metadata.notableEntities, this.batchSize)) {
        const step = self.batch(self.insertInto(this.ne, this.ne.SERIES_ID, this.ne.KIND, this.ne.NAME).values(null, null, null))
        for (const it of chunk) {
          step.bind(metadata.seriesId, it.kind, it.name)
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
        this.dslRW.deleteFrom(this.ne).where(this.ne.SERIES_ID.eq(seriesId)).execute()
        this.dslRW.deleteFrom(this.t).where(this.t.SERIES_ID.eq(seriesId)).execute()
        this.dslRW.deleteFrom(this.d).where(this.d.SERIES_ID.eq(seriesId)).execute()
      } else {
        // PORT: override fun delete(seriesIds: Collection<String>)
        const seriesIds = seriesIdOrIds
        use(TempTable.withTempTable(this.dslRW, this.batchSize, seriesIds), (it) => {
          this.dslRW.deleteFrom(this.a).where(this.a.SERIES_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.ne).where(this.ne.SERIES_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.t).where(this.t.SERIES_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.d).where(this.d.SERIES_ID.in(it.selectTempStrings())).execute()
        })
      }
    })
  }

  count(): number {
    return this.dslRO.fetchCount(this.d)
  }

  private toDomain(self: BookMetadataAggregationRecord, authors: Author[], tags: Set<string>, notableEntities: NotableEntity[]): BookMetadataAggregation {
    return new BookMetadataAggregation({
      authors: authors,
      notableEntities: notableEntities,
      tags: tags,
      releaseDate: self.releaseDate,
      summary: self.summary,
      summaryNumber: self.summaryNumber,
      seriesId: self.seriesId,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
    })
  }
}

// PORT: regroupement par série des lignes des tables liées (voir findOne)
function groupBySeriesId<R, T>(records: R[], seriesId: (r: R) => string, map: (r: R) => T): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const r of records) {
    const id = seriesId(r)
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

component(BookMetadataAggregationDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [BookMetadataAggregationRepository],
})
