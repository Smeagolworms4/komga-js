// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/BookProjectionDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import type { BookProjection } from '../../../domain/model/BookProjection.js'
import { BookProjectionRepository } from '../../../domain/persistence/BookProjectionRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { Tables } from '../../../port/jooq/generated/main/Tables.js'
import { component } from '../../../port/spring.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'

export class BookProjectionDao extends SplitDslDaoBase implements BookProjectionRepository {
  private readonly p = Tables.BOOK_PROJECTION

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  save(projection: BookProjection): void {
    this.dslRW
      .insertInto(this.p, this.p.BOOK_ID, this.p.PROFILE, this.p.FILE_SIZE)
      .values(projection.bookId, projection.profile, projection.fileSize)
      .onDuplicateKeyUpdate()
      .set(this.p.FILE_SIZE, this.p.FILE_SIZE)
      .set(this.p.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
      .execute()
  }

  // PORT: surcharges delete(bookId: String) / @Transactional delete(bookIds: Collection<String>) fusionnées
  delete(bookIdOrIds: string | Iterable<string>): void {
    if (typeof bookIdOrIds === 'string') {
      const bookId = bookIdOrIds
      this.dslRW.deleteFrom(this.p).where(this.p.BOOK_ID.eq(bookId)).execute()
    } else {
      const bookIds = bookIdOrIds
      // @Transactional
      transactional(this.dslRW.db, () => {
        use(TempTable.withTempTable(this.dslRW, this.batchSize, bookIds), (tempTable) => {
          this.dslRW.deleteFrom(this.p).where(this.p.BOOK_ID.in(tempTable.selectTempStrings())).execute()
        })
      })
    }
  }
}

component(BookProjectionDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [BookProjectionRepository],
})
