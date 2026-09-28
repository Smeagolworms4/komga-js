// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/HistoricalEventDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { HistoricalEvent } from '../../../domain/model/HistoricalEvent.js'
import { HistoricalEventRepository } from '../../../domain/persistence/HistoricalEventRepository.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { Tables } from '../../../port/jooq/generated/main/Tables.js'
import { component } from '../../../port/spring.js'

export class HistoricalEventDao implements HistoricalEventRepository {
  private readonly e = Tables.HISTORICAL_EVENT
  private readonly ep = Tables.HISTORICAL_EVENT_PROPERTIES

  constructor(private readonly dslRW: DSLContext) {}

  // @Transactional
  insert(event: HistoricalEvent): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .insertInto(this.e)
        .set(this.e.ID, event.id)
        .set(this.e.TYPE, event.type)
        .set(this.e.BOOK_ID, event.bookId)
        .set(this.e.SERIES_ID, event.seriesId)
        .set(this.e.TIMESTAMP, event.timestamp)
        .execute()

      if (event.properties.size > 0) {
        const step = this.dslRW.batch(this.dslRW.insertInto(this.ep, this.ep.ID, this.ep.KEY, this.ep.VALUE).values(null, null, null))
        for (const [key, value] of event.properties) step.bind(event.id, key, value)
        step.execute()
      }
    })
  }
}

component(HistoricalEventDao, {
  inject: [DSLContext],
  types: [HistoricalEventRepository],
})
