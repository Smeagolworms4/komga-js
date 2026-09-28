// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/BookCommonDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import type { ContentRestrictions } from '../../../domain/model/ContentRestrictions.js'
import type { Field, Select } from '../../../port/jooq/core.js'
import { DSL, DSLContext, falseCondition, name, select } from '../../../port/jooq/dsl.js'
import { Tables } from '../../../port/jooq/generated/main/Tables.js'
import { nn } from '../../../port/kotlin.js'
import { component } from '../../../port/spring.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { toCondition } from '../Utils.js'

export class BookCommonDao extends SplitDslDaoBase {
  private readonly b = Tables.BOOK
  private readonly m = Tables.MEDIA
  private readonly d = Tables.BOOK_METADATA
  private readonly r = Tables.READ_PROGRESS
  private readonly rs = Tables.READ_PROGRESS_SERIES
  private readonly s = Tables.SERIES
  private readonly sd = Tables.SERIES_METADATA

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  // PORT: Triple<SelectConditionStep<Record>, Field<LocalDateTime>, SelectJoinStep<Record1<LocalDateTime>>> -> tuple
  getBooksOnDeckQuery(
    userId: string,
    restrictions: ContentRestrictions,
    filterOnLibraryIds: Iterable<string> | null,
    selectFields: Field<unknown>[],
  ): [Select, Field<LocalDateTime>, Select] {
    // On Deck books are the first unread book in a series that has at least one book read, but is not in progress
    // cteSeries will return On Deck series
    // PORT: `.apply { filterOnLibraryIds?.let { and(..) } }` -> requête construite dans une variable avant asMaterialized
    const cteSeriesSelect = select(this.s.ID, this.rs.MOST_RECENT_READ_DATE)
      .from(this.s)
      .innerJoin(this.rs)
      .on(this.s.ID.eq(this.rs.SERIES_ID).and(this.rs.USER_ID.eq(userId)))
      .innerJoin(this.sd)
      .on(this.s.ID.eq(this.sd.SERIES_ID))
      .where(this.rs.IN_PROGRESS_COUNT.eq(0))
      .and(this.rs.READ_COUNT.ne(this.s.BOOK_COUNT))
      .and(toCondition(restrictions))
    if (filterOnLibraryIds !== null) cteSeriesSelect.and(this.s.LIBRARY_ID.in(filterOnLibraryIds))
    const cteSeries = name('cte_series').asMaterialized(cteSeriesSelect)

    const cteBooksFieldBookId = this.b.ID.as('cte_books_book_id')
    const cteBooksFieldSeriesId = this.b.SERIES_ID.as('cte_books_series_id')
    const cteBooksFieldNumberSort = this.d.NUMBER_SORT.as('cte_books_number_sort')
    const cteBooks = name('cte_books').asMaterialized(
      select(cteBooksFieldBookId, cteBooksFieldSeriesId, cteBooksFieldNumberSort)
        .from(this.b)
        .innerJoin(this.d)
        .on(this.b.ID.eq(this.d.BOOK_ID))
        .leftJoin(this.r)
        .on(this.b.ID.eq(this.r.BOOK_ID))
        .and(this.r.USER_ID.eq(userId))
        .where(this.r.COMPLETED.isNull())
        .and(this.b.SERIES_ID.in(select(nn(cteSeries.field(this.s.ID))).from(cteSeries))),
    )

    // finding the first unread book by number_sort is similar to finding the greatest-n-per-group
    const b1 = cteBooks.as('b1')
    const b2 = cteBooks.as('b2')
    const query = this.dslRO
      .with(cteSeries)
      .with(cteBooks)
      .select(...selectFields)
      .from(cteSeries)
      .innerJoin(b1)
      .on(nn(cteSeries.field(this.s.ID)).eq(b1.field(cteBooksFieldSeriesId)))
      // we join the cteBooks table on itself, using the grouping ID (seriesId) using a left outer join
      // it returns the row b1 for which no other row b2 exists with the same seriesId and a smaller numberSort
      // when b2 is null, it means the left outer join fond no such match, and therefore b1 has the smaller value of numberSort
      .leftOuterJoin(b2)
      .on(
        nn(b1.field(cteBooksFieldSeriesId))
          .eq(b2.field(cteBooksFieldSeriesId))
          .and(
            nn(b1.field(cteBooksFieldNumberSort))
              .gt(b2.field(cteBooksFieldNumberSort))
              .or(nn(b1.field(cteBooksFieldNumberSort)).eq(b2.field(cteBooksFieldNumberSort)).and(nn(b1.field(cteBooksFieldBookId)).gt(b2.field(cteBooksFieldBookId)))),
          ),
      )
      .innerJoin(this.b)
      .on(nn(b1.field(cteBooksFieldBookId)).eq(this.b.ID))
      .innerJoin(this.m)
      .on(this.b.ID.eq(this.m.BOOK_ID))
      .innerJoin(this.d)
      .on(this.b.ID.eq(this.d.BOOK_ID))
      .innerJoin(this.sd)
      .on(this.b.SERIES_ID.eq(this.sd.SERIES_ID))
      // fetchAndMap expects some values for ReadProgress
      // On Deck books are by definition unread, thus don't have read progress
      // we join on the table to keep fetchAndMap, with a false condition to only get null values
      .leftOuterJoin(this.r)
      .on(falseCondition())
      .where(nn(b2.field(cteBooksFieldBookId)).isNull())

    const mostRecentReadDateQuery = this.dslRO
      .with(cteSeries)
      .select(DSL.max(nn(cteSeries.field(this.rs.MOST_RECENT_READ_DATE))))
      .from(cteSeries)

    return [query, nn(cteSeries.field(this.rs.MOST_RECENT_READ_DATE)), mostRecentReadDateQuery]
  }
}

component(BookCommonDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
})
