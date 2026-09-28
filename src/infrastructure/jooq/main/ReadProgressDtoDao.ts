// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ReadProgressDtoDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { ReadProgressDtoRepository } from '../../../interfaces/api/persistence/ReadProgressDtoRepository.js'
import { TachiyomiReadProgressDto } from '../../../interfaces/api/rest/dto/TachiyomiReadProgressDto.js'
import { TachiyomiReadProgressV2Dto } from '../../../interfaces/api/rest/dto/TachiyomiReadProgressV2Dto.js'
import { Tables } from '../../../port/jooq/generated/main/Tables.js'
import type { AggregateFunction, Condition, Record } from '../../../port/jooq/core.js'
import { DSL, DSLContext, rowNumber } from '../../../port/jooq/dsl.js'
import { component } from '../../../port/spring.js'
import { DataClass, first, lastOrNull, nn } from '../../../port/kotlin.js'
import { BOOKS_IN_PROGRESS_COUNT, BOOKS_READ_COUNT, BOOKS_UNREAD_COUNT } from './SeriesDtoDao.js'

export class ReadProgressDtoDao extends SplitDslDaoBase implements ReadProgressDtoRepository {
  private readonly rlb = Tables.READLIST_BOOK
  private readonly b = Tables.BOOK
  private readonly d = Tables.BOOK_METADATA
  private readonly r = Tables.READ_PROGRESS

  // PORT: AggregateFunction<BigDecimal> -> AggregateFunction<number>
  private readonly countUnread: AggregateFunction<number> = DSL.sum(DSL.when(this.r.COMPLETED.isNull(), 1).otherwise(0))
  private readonly countRead: AggregateFunction<number> = DSL.sum(DSL.when(this.r.COMPLETED.isTrue(), 1).otherwise(0))
  private readonly countInProgress: AggregateFunction<number> = DSL.sum(DSL.when(this.r.COMPLETED.isFalse(), 1).otherwise(0))

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  findProgressV2BySeries(seriesId: string, userId: string): TachiyomiReadProgressV2Dto {
    const numberSortReadProgress = [
      ...this.dslRO
        .select(this.d.NUMBER_SORT, this.r.COMPLETED)
        .from(this.b)
        .leftJoin(this.r)
        .on(this.b.ID.eq(this.r.BOOK_ID))
        .and(this.readProgressCondition(userId))
        .leftJoin(this.d)
        .on(this.b.ID.eq(this.d.BOOK_ID))
        .where(this.b.SERIES_ID.eq(seriesId))
        .orderBy(this.d.NUMBER_SORT)
        .fetch(),
    ]

    const maxNumberSort =
      this.dslRO
        .select(DSL.max(this.d.NUMBER_SORT))
        .from(this.b)
        .leftJoin(this.d)
        .on(this.b.ID.eq(this.d.BOOK_ID))
        .where(this.b.SERIES_ID.eq(seriesId))
        .fetchOne(DSL.max(this.d.NUMBER_SORT)) ?? 0

    const booksCount = this.getSeriesBooksCount(seriesId, userId)

    return this.booksCountToDtoV2(booksCount, this.lastRead<number>(numberSortReadProgress) ?? 0, maxNumberSort)
  }

  private getSeriesBooksCount(seriesId: string, userId: string): BooksCount {
    return first(
      this.dslRO
        .select(this.countUnread.as(BOOKS_UNREAD_COUNT))
        .select(this.countRead.as(BOOKS_READ_COUNT))
        .select(this.countInProgress.as(BOOKS_IN_PROGRESS_COUNT))
        .from(this.b)
        .leftJoin(this.r)
        .on(this.b.ID.eq(this.r.BOOK_ID))
        .and(this.readProgressCondition(userId))
        .where(this.b.SERIES_ID.eq(seriesId))
        .fetch(),
    ).map(
      (it) =>
        // PORT: get(name, Int::class.java) passé à un paramètre Int non nul : NPE si null (nn)
        new BooksCount({
          unreadCount: nn(it.get<number>(BOOKS_UNREAD_COUNT, Number)),
          readCount: nn(it.get<number>(BOOKS_READ_COUNT, Number)),
          inProgressCount: nn(it.get<number>(BOOKS_IN_PROGRESS_COUNT, Number)),
        }),
    )
  }

  findProgressByReadList(readListId: string, userId: string): TachiyomiReadProgressDto {
    const indexedReadProgress = [
      ...this.dslRO
        .select(rowNumber().over().orderBy(this.rlb.NUMBER), this.r.COMPLETED)
        .from(this.b)
        .leftJoin(this.r)
        .on(this.b.ID.eq(this.r.BOOK_ID))
        .and(this.readProgressCondition(userId))
        .leftJoin(this.rlb)
        .on(this.b.ID.eq(this.rlb.BOOK_ID))
        .where(this.rlb.READLIST_ID.eq(readListId))
        .orderBy(this.rlb.NUMBER)
        .fetch(),
    ]

    const booksCountRecord = first(
      this.dslRO
        .select(this.countUnread.as(BOOKS_UNREAD_COUNT))
        .select(this.countRead.as(BOOKS_READ_COUNT))
        .select(this.countInProgress.as(BOOKS_IN_PROGRESS_COUNT))
        .from(this.b)
        .leftJoin(this.r)
        .on(this.b.ID.eq(this.r.BOOK_ID))
        .and(this.readProgressCondition(userId))
        .leftJoin(this.rlb)
        .on(this.b.ID.eq(this.rlb.BOOK_ID))
        .where(this.rlb.READLIST_ID.eq(readListId))
        .fetch(),
    )

    // PORT: get(name, Int::class.java) passé à un paramètre Int non nul : NPE si null (nn)
    const booksCount = new BooksCount({
      unreadCount: nn(booksCountRecord.get<number>(BOOKS_UNREAD_COUNT, Number)),
      readCount: nn(booksCountRecord.get<number>(BOOKS_READ_COUNT, Number)),
      inProgressCount: nn(booksCountRecord.get<number>(BOOKS_IN_PROGRESS_COUNT, Number)),
    })

    return this.booksCountToDto(booksCount, this.lastRead<number>(indexedReadProgress) ?? 0)
  }

  private booksCountToDto(booksCount: BooksCount, lastReadContinuousIndex: number): TachiyomiReadProgressDto {
    return new TachiyomiReadProgressDto({
      booksCount: booksCount.totalCount,
      booksUnreadCount: booksCount.unreadCount,
      booksInProgressCount: booksCount.inProgressCount,
      booksReadCount: booksCount.readCount,
      lastReadContinuousIndex: lastReadContinuousIndex,
    })
  }

  private booksCountToDtoV2(booksCount: BooksCount, lastReadContinuousNumberSort: number, maxNumberSort: number): TachiyomiReadProgressV2Dto {
    return new TachiyomiReadProgressV2Dto({
      booksCount: booksCount.totalCount,
      booksUnreadCount: booksCount.unreadCount,
      booksInProgressCount: booksCount.inProgressCount,
      booksReadCount: booksCount.readCount,
      lastReadContinuousNumberSort: lastReadContinuousNumberSort,
      maxNumberSort: maxNumberSort,
    })
  }

  private readProgressCondition(userId: string): Condition {
    return this.r.USER_ID.eq(userId).or(this.r.USER_ID.isNull())
  }

  // PORT: fonction d'extension List<Record2<T, Boolean>>.lastRead()
  private lastRead<T>(self: Record[]): T | null {
    const taken: Record[] = []
    for (const it of self) {
      if (!(it.value2() === true)) break
      taken.push(it)
    }
    return lastOrNull(taken)?.value1<T>() ?? null
  }
}

type BooksCountParams = {
  unreadCount: number
  readCount: number
  inProgressCount: number
}

// PORT: private data class imbriquée ReadProgressDtoDao.BooksCount -> classe du module non exportée
class BooksCount extends DataClass<BooksCountParams> {
  readonly unreadCount: number
  readonly readCount: number
  readonly inProgressCount: number

  constructor({ unreadCount, readCount, inProgressCount }: BooksCountParams) {
    super()
    this.unreadCount = unreadCount
    this.readCount = readCount
    this.inProgressCount = inProgressCount
  }

  get totalCount(): number {
    return this.unreadCount + this.readCount + this.inProgressCount
  }
}

component(ReadProgressDtoDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
  types: [ReadProgressDtoRepository],
})
