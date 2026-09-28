// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ReadProgressDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { R2Locator } from '../../../domain/model/R2Locator.js'
import { ReadProgress } from '../../../domain/model/ReadProgress.js'
import { ReadProgressRepository } from '../../../domain/persistence/ReadProgressRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { deserializeJsonGz, serializeJsonGz } from '../Utils.js'
import { type ReadProgressRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone, toUTC } from '../../../language/LanguageUtils.js'
import type { Query } from '../../../port/jooq/core.js'
import { DSL, DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { ObjectMapper } from '../../../port/jackson-mapper.js'
import { component } from '../../../port/spring.js'
import { chunked, groupBy } from '../../../port/kotlin.js'

export class ReadProgressDao extends SplitDslDaoBase implements ReadProgressRepository {
  private readonly r = Tables.READ_PROGRESS
  private readonly rs = Tables.READ_PROGRESS_SERIES
  private readonly b = Tables.BOOK

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
    private readonly mapper: ObjectMapper,
  ) {
    super(dslRW, dslRO)
  }

  findAll(): ReadProgress[] {
    return this.dslRO
      .selectFrom(this.r)
      .fetchInto(this.r)
      .map((it) => this.toDomain(it))
  }

  findByBookIdAndUserIdOrNull(bookId: string, userId: string): ReadProgress | null {
    const it = this.dslRO
      .selectFrom(this.r)
      .where(this.r.BOOK_ID.eq(bookId).and(this.r.USER_ID.eq(userId)))
      .fetchOneInto(this.r)
    return it !== null ? this.toDomain(it) : null
  }

  findAllByUserId(userId: string): ReadProgress[] {
    return this.dslRO
      .selectFrom(this.r)
      .where(this.r.USER_ID.eq(userId))
      .fetchInto(this.r)
      .map((it) => this.toDomain(it))
  }

  findAllByBookId(bookId: string): ReadProgress[] {
    return this.dslRO
      .selectFrom(this.r)
      .where(this.r.BOOK_ID.eq(bookId))
      .fetchInto(this.r)
      .map((it) => this.toDomain(it))
  }

  findAllByBookIdsAndUserId(bookIds: Iterable<string>, userId: string): ReadProgress[] {
    return this.dslRO
      .selectFrom(this.r)
      .where(this.r.BOOK_ID.in(bookIds).and(this.r.USER_ID.eq(userId)))
      .fetchInto(this.r)
      .map((it) => this.toDomain(it))
  }

  // PORT: surcharges save(ReadProgress) / save(Collection<ReadProgress>) fusionnées (union de types)
  // @Transactional
  save(readProgressOrProgresses: ReadProgress | Iterable<ReadProgress>): void {
    transactional(this.dslRW.db, () => {
      if (readProgressOrProgresses instanceof ReadProgress) {
        const readProgress = readProgressOrProgresses
        this.toQuery(readProgress, this.dslRW).execute()
        this.aggregateSeriesProgress(this.dslRW, [readProgress.bookId], readProgress.userId)
      } else this.saveMany([...readProgressOrProgresses])
    })
  }

  // PORT: override fun save(readProgresses: Collection<ReadProgress>), appelée par save() ci-dessus
  // @Transactional
  private saveMany(readProgresses: ReadProgress[]): void {
    transactional(this.dslRW.db, () => {
      for (const chunk of chunked(
        readProgresses.map((it) => this.toQuery(it, this.dslRW)),
        this.batchSize,
      ))
        this.dslRW.batch(chunk).execute()

      for (const [userId, readProgresses_] of groupBy(readProgresses, (it) => it.userId)) {
        this.aggregateSeriesProgress(
          this.dslRW,
          readProgresses_.map((it) => it.bookId),
          userId,
        )
      }
    })
  }

  private toQuery(self: ReadProgress, dsl: DSLContext): Query {
    return dsl
      .insertInto(
        this.r,
        this.r.BOOK_ID,
        this.r.USER_ID,
        this.r.PAGE,
        this.r.COMPLETED,
        this.r.READ_DATE,
        this.r.DEVICE_ID,
        this.r.DEVICE_NAME,
        this.r.LOCATOR,
      )
      .values(
        self.bookId,
        self.userId,
        self.page,
        self.completed,
        toUTC(self.readDate),
        self.deviceId,
        self.deviceName,
        self.locator !== null ? serializeJsonGz(this.mapper, self.locator) : null,
      )
      .onDuplicateKeyUpdate()
      .set(this.r.PAGE, self.page)
      .set(this.r.COMPLETED, self.completed)
      .set(this.r.READ_DATE, toUTC(self.readDate))
      .set(this.r.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
      .set(this.r.DEVICE_ID, self.deviceId)
      .set(this.r.DEVICE_NAME, self.deviceName)
      .set(this.r.LOCATOR, self.locator !== null ? serializeJsonGz(this.mapper, self.locator) : null)
  }

  // @Transactional
  delete(bookId: string, userId: string): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.r).where(this.r.BOOK_ID.eq(bookId).and(this.r.USER_ID.eq(userId))).execute()
      this.aggregateSeriesProgress(this.dslRW, [bookId], userId)
    })
  }

  // @Transactional
  deleteByUserId(userId: string): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.r).where(this.r.USER_ID.eq(userId)).execute()
      this.dslRW.deleteFrom(this.rs).where(this.rs.USER_ID.eq(userId)).execute()
    })
  }

  // @Transactional
  deleteByBookId(bookId: string): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.r).where(this.r.BOOK_ID.eq(bookId)).execute()
      this.aggregateSeriesProgress(this.dslRW, [bookId])
    })
  }

  // @Transactional
  deleteByBookIds(bookIds: Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      use(TempTable.withTempTable(this.dslRW, this.batchSize, bookIds), (tempTable) => {
        this.dslRW.deleteFrom(this.r).where(this.r.BOOK_ID.in(tempTable.selectTempStrings())).execute()
        this.aggregateSeriesProgress(this.dslRW, tempTable)
      })
    })
  }

  // @Transactional
  deleteBySeriesIds(seriesIds: Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      use(TempTable.withTempTable(this.dslRW, this.batchSize, seriesIds), (it) => {
        this.dslRW.deleteFrom(this.rs).where(this.rs.SERIES_ID.in(it.selectTempStrings())).execute()
      })
    })
  }

  // @Transactional
  deleteByBookIdsAndUserId(bookIds: Iterable<string>, userId: string): void {
    transactional(this.dslRW.db, () => {
      use(TempTable.withTempTable(this.dslRW, this.batchSize, bookIds), (tempTable) => {
        this.dslRW
          .deleteFrom(this.r)
          .where(this.r.BOOK_ID.in(tempTable.selectTempStrings()))
          .and(this.r.USER_ID.eq(userId))
          .execute()
        this.aggregateSeriesProgress(this.dslRW, tempTable, userId)
      })
    })
  }

  // @Transactional
  deleteAll(): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.r).execute()
      this.dslRW.deleteFrom(this.rs).execute()
    })
  }

  // PORT: surcharges d'extension aggregateSeriesProgress(bookIds: Collection<String>) / aggregateSeriesProgress(bookIdsTempTable: TempTable)
  // fusionnées (union de types) ; la seconde est portée dans aggregateSeriesProgressTempTable() ci-dessous
  private aggregateSeriesProgress(self: DSLContext, bookIds: Iterable<string> | TempTable, userId: string | null = null): void {
    if (bookIds instanceof TempTable) return this.aggregateSeriesProgressTempTable(self, bookIds, userId)
    use(TempTable.withTempTable(self, this.batchSize, bookIds), (tempTable) => {
      this.aggregateSeriesProgressTempTable(self, tempTable, userId)
    })
  }

  /**
   * Get the book IDs from an existing TempTable to avoid recreating another temporary table if one already exists.
   */
  private aggregateSeriesProgressTempTable(self: DSLContext, bookIdsTempTable: TempTable, userId: string | null = null): void {
    const seriesIdsQuery = self
      .select(this.b.SERIES_ID)
      .from(this.b)
      .where(this.b.ID.in(bookIdsTempTable.selectTempStrings()))

    const deleteQuery = self.deleteFrom(this.rs).where(this.rs.SERIES_ID.in(seriesIdsQuery))
    if (userId !== null) deleteQuery.and(this.rs.USER_ID.eq(userId))
    deleteQuery.execute()

    const selectQuery = self
      .select(this.b.SERIES_ID, this.r.USER_ID)
      .select(DSL.sum(DSL.when(this.r.COMPLETED.isTrue(), 1).otherwise(0)))
      .select(DSL.sum(DSL.when(this.r.COMPLETED.isFalse(), 1).otherwise(0)))
      .select(DSL.max(this.r.READ_DATE))
      .select(DSL.currentTimestamp())
      .from(this.b)
      .innerJoin(this.r)
      .on(this.b.ID.eq(this.r.BOOK_ID))
      .where(this.b.SERIES_ID.in(seriesIdsQuery))
    if (userId !== null) selectQuery.and(this.r.USER_ID.eq(userId))
    self
      .insertInto(this.rs)
      .select(selectQuery.groupBy(this.b.SERIES_ID, this.r.USER_ID))
      .execute()
  }

  private toDomain(self: ReadProgressRecord): ReadProgress {
    return new ReadProgress({
      bookId: self.bookId,
      userId: self.userId,
      page: self.page,
      completed: self.completed,
      readDate: toCurrentTimeZone(self.readDate),
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
      deviceId: self.deviceId,
      deviceName: self.deviceName,
      locator: deserializeJsonGz<R2Locator>(this.mapper, self.locator, { class: R2Locator }),
    })
  }
}

component(ReadProgressDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
    ObjectMapper,
  ],
  types: [ReadProgressRepository],
})
