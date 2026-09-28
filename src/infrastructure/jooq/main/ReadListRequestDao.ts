// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ReadListRequestDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDate } from '@js-joda/core'
import {
  type ReadListRequestBook,
  ReadListRequestBookMatchBook,
  ReadListRequestBookMatchSeries,
  ReadListRequestBookMatches,
} from '../../../domain/model/ReadListRequest.js'
import { ReadListRequestRepository } from '../../../domain/persistence/ReadListRequestRepository.js'
import type { Field, Record } from '../../../port/jooq/core.js'
import { DSLContext, ltrim, row, value, values } from '../../../port/jooq/dsl.js'
import { Tables } from '../../../port/jooq/generated/main/Tables.js'
import { eq } from '../../../port/kotlin.js'
import { component } from '../../../port/spring.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { noCase } from '../Utils.js'

export class ReadListRequestDao extends SplitDslDaoBase implements ReadListRequestRepository {
  private readonly sd = Tables.SERIES_METADATA
  private readonly b = Tables.BOOK
  private readonly bd = Tables.BOOK_METADATA
  private readonly bma = Tables.BOOK_METADATA_AGGREGATION

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  matchBookRequests(requests: Iterable<ReadListRequestBook>): ReadListRequestBookMatches[] {
    const requestsList = [...requests]
    // use a table expression to join the requests to their potential matches
    const requestsAsRows = requestsList.flatMap((r, i) => [...r.series].map((it) => row(i, it, r.number)))
    const seriesField = 'series'
    const indexField = 'index'
    const numberField = 'number'
    const requestsTable = values(...requestsAsRows).as('request', indexField, seriesField, numberField)
    const matchedRequests = mapValues(
      this.dslRO
        .select(
          requestsTable.field(indexField, Number) as Field<unknown>,
          this.sd.SERIES_ID,
          this.sd.TITLE,
          this.bd.BOOK_ID,
          this.bd.NUMBER,
          this.bd.TITLE,
          this.bma.RELEASE_DATE,
        )
        .from(requestsTable)
        .innerJoin(this.sd)
        .on((requestsTable.field(seriesField, String) as Field<string>).eq(noCase(this.sd.TITLE)))
        .leftJoin(this.bma)
        .on(this.sd.SERIES_ID.eq(this.bma.SERIES_ID))
        .innerJoin(this.b)
        .on(this.sd.SERIES_ID.eq(this.b.SERIES_ID))
        .innerJoin(this.bd)
        .on(
          this.b.ID.eq(this.bd.BOOK_ID).and(
            ltrim(this.bd.NUMBER, value('0')).eq(noCase(ltrim(requestsTable.field(numberField, String) as Field<string>, value('0')))),
          ),
        )
        .fetchGroups<number, Record>(requestsTable.field(indexField, Number) as Field<number>),
      (records: Record[]) =>
        // use the requests index to match results
        groupByStructural(
          records,
          (it) =>
            new ReadListRequestBookMatchSeries({
              id: it.get(1, String),
              title: it.get(2, String),
              // PORT: it.get(6, LocalDate::class.java) : la valeur est déjà un LocalDate (type de bma.RELEASE_DATE)
              releaseDate: it.get<LocalDate | null>(6),
            }),
          (it) => new ReadListRequestBookMatchBook({ id: it.get(3, String), number: it.get(4, String), title: it.get(5, String) }),
        ),
    )

    return requestsList.map(
      (request, i) =>
        new ReadListRequestBookMatches({
          request: request,
          matches: matchedRequests.get(i) ?? new Map(),
        }),
    )
  }
}

// PORT: Map.mapValues { } de Kotlin
function mapValues<K, V, R>(m: Map<K, V>, f: (v: V) => R): Map<K, R> {
  return new Map([...m].map(([k, v]) => [k, f(v)]))
}

// PORT: Iterable.groupBy(keySelector, valueTransform) de Kotlin, clés (data class) comparées par equals()
function groupByStructural<T, K, V>(a: Iterable<T>, key: (t: T) => K, value: (t: T) => V): Map<K, V[]> {
  const m = new Map<K, V[]>()
  for (const x of a) {
    const k = key(x)
    const existing = [...m.keys()].find((it) => eq(it, k))
    if (existing !== undefined) (m.get(existing) as V[]).push(value(x))
    else m.set(k, [value(x)])
  }
  return m
}

component(ReadListRequestDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
  types: [ReadListRequestRepository],
})
