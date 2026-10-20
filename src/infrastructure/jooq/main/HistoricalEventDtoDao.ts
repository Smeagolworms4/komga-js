// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/HistoricalEventDtoDao.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { isEmpty } from '../../../application/query/PageableExtension.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { toOrderBy } from '../Utils.js'
import { HistoricalEventDtoRepository } from '../../../interfaces/api/persistence/HistoricalEventDtoRepository.js'
import { HistoricalEventDto } from '../../../interfaces/api/rest/dto/HistoricalEventDto.js'
import { Tables } from '../../../port/jooq/generated/main/Tables.js'
import type { Field } from '../../../port/jooq/core.js'
import { DSLContext } from '../../../port/jooq/dsl.js'
import { associate } from '../../../port/kotlin.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { component } from '../../../port/spring.js'

export class HistoricalEventDtoDao extends SplitDslDaoBase implements HistoricalEventDtoRepository {
  private readonly e = Tables.HISTORICAL_EVENT
  private readonly ep = Tables.HISTORICAL_EVENT_PROPERTIES

  private readonly sorts = new Map<string, Field<unknown>>([
    ['type', this.e.TYPE],
    ['bookId', this.e.BOOK_ID],
    ['seriesId', this.e.SERIES_ID],
    ['timestamp', this.e.TIMESTAMP],
  ])

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  findAll(pageable: Pageable): Page<HistoricalEventDto> {
    const orderBy = toOrderBy(pageable.sort, this.sorts)

    let items: HistoricalEventDto[]
    if (isEmpty(pageable)) items = []
    else {
      const q = this.dslRO.selectFrom(this.e).orderBy(orderBy)
      if (pageable.isPaged) q.limit(pageable.pageSize).offset(pageable.offset)
      // PORT: ResultQuery.map { } d'un selectFrom -> fetchInto(table) pour obtenir des records typés
      items = q.fetchInto(this.e).map((er) => {
        const epr = this.dslRO.selectFrom(this.ep).where(this.ep.ID.eq(er.id)).fetchInto(this.ep)
        return new HistoricalEventDto({
          id: er.id,
          type: er.type,
          timestamp: er.timestamp,
          bookId: er.bookId,
          seriesId: er.seriesId,
          properties: associate(
            epr.filter((it) => !(it.key === null)),
            (it) => [it.key, it.value],
          ),
        })
      })
    }

    const count = pageable.isUnpaged ? items.length : this.dslRO.fetchCount(this.e)

    const pageSort = orderBy.length > 0 ? pageable.sort : Sort.unsorted()
    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
      count,
    )
  }
}

component(HistoricalEventDtoDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
  types: [HistoricalEventDtoRepository],
})
