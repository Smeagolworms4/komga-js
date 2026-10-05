// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/SeriesSearchHelper.kt@2ab7a5a61a8b8bb12a6edd576fed380b4b613c99
import { ReadStatus } from '../../domain/model/ReadStatus.js'
import { SearchCondition } from '../../domain/model/SearchCondition.js'
import type { SearchContext } from '../../domain/model/SearchContext.js'
import { SearchOperator } from '../../domain/model/SearchOperator.js'
import type { SeriesMetadata } from '../../domain/model/SeriesMetadata.js'
import type { Condition } from '../../port/jooq/core.js'
import { DSL } from '../../port/jooq/dsl.js'
import { Tables } from '../../port/jooq/generated/main/Tables.js'
import { eq, union } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { RequiredJoin } from './RequiredJoin.js'
import { ContentRestrictionsSearchHelper } from './ContentRestrictionsSearchHelper.js'
import {
  toConditionBoolean,
  toConditionDate,
  toConditionEqualityConverter,
  toConditionEqualityString,
  toConditionNumericNullable,
  toConditionStringOp,
} from './SearchOperatorUtils.js'
import { csAlias, unicode1 } from './Utils.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.jooq.SeriesSearchHelper')

/**
 * Helper class to generate a Jooq Condition from a [SearchCondition.Series] and [SearchContext]
 */
export class SeriesSearchHelper {
  constructor(readonly context: SearchContext) {}

  // PORT: surcharges toCondition(searchCondition) / toCondition() fusionnées (paramètre absent = toCondition())
  toCondition(...args: [] | [searchCondition: SearchCondition.Series | null]): [Condition, Set<RequiredJoin>] {
    if (args.length === 1) {
      const [searchCondition] = args
      const base = this.toCondition()
      const search = this.toConditionInternalSeries(searchCondition)
      return [search[0].and(base[0]), union(search[1], base[1])]
    }
    const restrictions = new ContentRestrictionsSearchHelper(this.context.restrictions).toCondition()
    const authorizedLibraries = this.toConditionInternalLibraryIds(this.context.libraryIds)
    return [restrictions[0].and(authorizedLibraries[0]), union(restrictions[1], authorizedLibraries[1])]
  }

  // PORT: surcharge privée toConditionInternal(libraryIds: Collection<String>?)
  private toConditionInternalLibraryIds(libraryIds: Iterable<string> | null): [Condition, Set<RequiredJoin>] {
    if (libraryIds === null) return [DSL.noCondition(), new Set()]
    const ids = [...libraryIds]
    if (ids.length === 0) return [DSL.falseCondition(), new Set()]
    return this.toConditionInternalSeries(new SearchCondition.AnyOfSeries({ conditions: ids.map((it) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: it }) })) }))
  }

  // PORT: surcharge privée toConditionInternal(searchCondition: SearchCondition.Series?)
  private toConditionInternalSeries(searchCondition: SearchCondition.Series | null): [Condition, Set<RequiredJoin>] {
    if (searchCondition instanceof SearchCondition.AllOfSeries)
      return searchCondition.conditions.reduce<[Condition, Set<RequiredJoin>]>(
        (acc, cond) => {
          const seriesCondition = this.toConditionInternalSeries(cond)
          return [acc[0].and(seriesCondition[0]), union(acc[1], seriesCondition[1])]
        },
        [DSL.noCondition(), new Set()],
      )
    else if (searchCondition instanceof SearchCondition.AnyOfSeries)
      return searchCondition.conditions.reduce<[Condition, Set<RequiredJoin>]>(
        (acc, cond) => {
          const seriesCondition = this.toConditionInternalSeries(cond)
          return [acc[0].or(seriesCondition[0]), union(acc[1], seriesCondition[1])]
        },
        [DSL.noCondition(), new Set()],
      )
    else if (searchCondition instanceof SearchCondition.LibraryId) return [toConditionEqualityString(searchCondition.operator, Tables.SERIES.LIBRARY_ID), new Set()]
    else if (searchCondition instanceof SearchCondition.Deleted) {
      const it = Tables.SERIES.DELETED_DATE
      return [eq(searchCondition.operator, SearchOperator.IsFalse) ? it.isNull() : it.isNotNull(), new Set()]
    } else if (searchCondition instanceof SearchCondition.ReleaseDate)
      return [toConditionDate(searchCondition.operator, Tables.BOOK_METADATA_AGGREGATION.RELEASE_DATE), new Set([RequiredJoin.BookMetadataAggregation])]
    else if (searchCondition instanceof SearchCondition.ReadStatus) {
      if (this.context.userId === null) {
        logger.warn(() => 'SearchCondition.ReadStatus without userId in search context')
        return [DSL.falseCondition(), new Set()]
      } else {
        const field = Tables.READ_PROGRESS_SERIES.READ_COUNT
        const operator = searchCondition.operator
        let c: Condition
        if (operator instanceof SearchOperator.Is) {
          switch (operator.value) {
            case ReadStatus.UNREAD:
              c = field.isNull()
              break
            case ReadStatus.READ:
              c = field.eq(Tables.SERIES.BOOK_COUNT)
              break
            default: // ReadStatus.IN_PROGRESS
              c = field.ne(Tables.SERIES.BOOK_COUNT)
          }
        } else {
          switch (operator.value) {
            case ReadStatus.UNREAD:
              c = field.isNotNull()
              break
            case ReadStatus.READ:
              c = field.ne(Tables.SERIES.BOOK_COUNT).or(field.isNull())
              break
            default: // ReadStatus.IN_PROGRESS
              c = field.eq(Tables.SERIES.BOOK_COUNT).or(field.isNull())
          }
        }
        return [c, new Set([new RequiredJoin.ReadProgress({ userId: this.context.userId })])]
      }
    } else if (searchCondition instanceof SearchCondition.SeriesStatus)
      return [
        toConditionEqualityConverter(searchCondition.operator, Tables.SERIES_METADATA.STATUS, (it: SeriesMetadata.Status) => it.name),
        new Set([RequiredJoin.SeriesMetadata]),
      ]
    else if (searchCondition instanceof SearchCondition.Tag) {
      const field = Tables.SERIES.ID
      const innerEquals = (tag: string) =>
        DSL.select(Tables.SERIES_METADATA_TAG.SERIES_ID)
          .from(Tables.SERIES_METADATA_TAG)
          .where(unicode1(Tables.SERIES_METADATA_TAG.TAG).equal(tag))
          .union(
            DSL.select(Tables.BOOK_METADATA_AGGREGATION_TAG.SERIES_ID)
              .from(Tables.BOOK_METADATA_AGGREGATION_TAG)
              .where(unicode1(Tables.BOOK_METADATA_AGGREGATION_TAG.TAG).equal(tag)),
          )
      const innerAny = () =>
        DSL.select(Tables.SERIES_METADATA_TAG.SERIES_ID)
          .from(Tables.SERIES_METADATA_TAG)
          .where(Tables.SERIES_METADATA_TAG.TAG.isNotNull())
          .union(
            DSL.select(Tables.BOOK_METADATA_AGGREGATION_TAG.SERIES_ID)
              .from(Tables.BOOK_METADATA_AGGREGATION_TAG)
              .where(Tables.BOOK_METADATA_AGGREGATION_TAG.TAG.isNotNull()),
          )

      const operator = searchCondition.operator
      let c: Condition
      if (operator instanceof SearchOperator.Is) c = field.in(innerEquals(operator.value))
      else if (operator instanceof SearchOperator.IsNot) c = field.notIn(innerEquals(operator.value))
      else if (operator instanceof SearchOperator.IsNullT) c = field.notIn(innerAny())
      else c = field.in(innerAny())
      return [c, new Set()]
    } else if (searchCondition instanceof SearchCondition.Author) {
      const field = Tables.SERIES.ID
      const inner = (name: string | null, role: string | null) => {
        const q = DSL.select(Tables.BOOK_METADATA_AGGREGATION_AUTHOR.SERIES_ID).from(Tables.BOOK_METADATA_AGGREGATION_AUTHOR).where(DSL.noCondition())
        if (name !== null) q.and(unicode1(Tables.BOOK_METADATA_AGGREGATION_AUTHOR.NAME).equal(name))
        if (role !== null) q.and(unicode1(Tables.BOOK_METADATA_AGGREGATION_AUTHOR.ROLE).equal(role))
        return q
      }
      const operator = searchCondition.operator
      let c: Condition
      if (operator instanceof SearchOperator.Is) {
        c = field.in(inner(operator.value.name, operator.value.role))
      } else {
        c = field.notIn(inner(operator.value.name, operator.value.role))
      }
      return [c, new Set()]
    } else if (searchCondition instanceof SearchCondition.OneShot) return [toConditionBoolean(searchCondition.operator, Tables.SERIES.ONESHOT), new Set()]
    else if (searchCondition instanceof SearchCondition.AgeRating)
      return [toConditionNumericNullable(searchCondition.operator, Tables.SERIES_METADATA.AGE_RATING), new Set([RequiredJoin.SeriesMetadata])]
    else if (searchCondition instanceof SearchCondition.CollectionId) {
      const operator = searchCondition.operator
      // for IS condition we have to do a join, so as to order the series by collection number
      if (operator instanceof SearchOperator.Is)
        return [csAlias(operator.value).COLLECTION_ID.eq(operator.value), new Set([new RequiredJoin.Collection({ collectionId: operator.value })])]
      else {
        const inner = (collectionId: string) =>
          DSL.select(Tables.COLLECTION_SERIES.SERIES_ID).from(Tables.COLLECTION_SERIES).where(Tables.COLLECTION_SERIES.COLLECTION_ID.eq(collectionId))
        return [Tables.SERIES.ID.notIn(inner(operator.value)), new Set()]
      }
    } else if (searchCondition instanceof SearchCondition.Complete) {
      const field = Tables.SERIES_METADATA.TOTAL_BOOK_COUNT
      return [
        eq(searchCondition.operator, SearchOperator.IsTrue)
          ? field.isNotNull().and(field.eq(Tables.SERIES.BOOK_COUNT))
          : field.isNotNull().and(field.ne(Tables.SERIES.BOOK_COUNT)),
        new Set([RequiredJoin.SeriesMetadata]),
      ]
    } else if (searchCondition instanceof SearchCondition.Genre) {
      const field = Tables.SERIES.ID
      const innerEquals = (genre: string) =>
        DSL.select(Tables.SERIES_METADATA_GENRE.SERIES_ID)
          .from(Tables.SERIES_METADATA_GENRE)
          .where(unicode1(Tables.SERIES_METADATA_GENRE.GENRE).equal(genre))
      const innerAny = () =>
        DSL.select(Tables.SERIES_METADATA_GENRE.SERIES_ID).from(Tables.SERIES_METADATA_GENRE).where(Tables.SERIES_METADATA_GENRE.GENRE.isNotNull())

      const operator = searchCondition.operator
      let c: Condition
      if (operator instanceof SearchOperator.Is) c = field.in(innerEquals(operator.value))
      else if (operator instanceof SearchOperator.IsNot) c = field.notIn(innerEquals(operator.value))
      else if (operator instanceof SearchOperator.IsNullT) c = field.notIn(innerAny())
      else c = field.in(innerAny())
      return [c, new Set()]
    } else if (searchCondition instanceof SearchCondition.Language)
      return [toConditionEqualityString(searchCondition.operator, Tables.SERIES_METADATA.LANGUAGE, { ignoreCase: true }), new Set([RequiredJoin.SeriesMetadata])]
    else if (searchCondition instanceof SearchCondition.Publisher)
      return [toConditionEqualityString(searchCondition.operator, Tables.SERIES_METADATA.PUBLISHER, { ignoreCase: true }), new Set([RequiredJoin.SeriesMetadata])]
    else if (searchCondition instanceof SearchCondition.SharingLabel) {
      const field = Tables.SERIES.ID
      const innerEquals = (label: string) =>
        DSL.select(Tables.SERIES_METADATA_SHARING.SERIES_ID)
          .from(Tables.SERIES_METADATA_SHARING)
          .where(unicode1(Tables.SERIES_METADATA_SHARING.LABEL).equal(label))
      const innerAny = () =>
        DSL.select(Tables.SERIES_METADATA_SHARING.SERIES_ID).from(Tables.SERIES_METADATA_SHARING).where(Tables.SERIES_METADATA_SHARING.LABEL.isNotNull())

      const operator = searchCondition.operator
      let c: Condition
      if (operator instanceof SearchOperator.Is) c = field.in(innerEquals(operator.value))
      else if (operator instanceof SearchOperator.IsNot) c = field.notIn(innerEquals(operator.value))
      else if (operator instanceof SearchOperator.IsNullT) c = field.notIn(innerAny())
      else c = field.in(innerAny())
      return [c, new Set()]
    } else if (searchCondition instanceof SearchCondition.Title)
      return [toConditionStringOp(searchCondition.operator, Tables.SERIES_METADATA.TITLE), new Set([RequiredJoin.SeriesMetadata])]
    else if (searchCondition instanceof SearchCondition.TitleSort)
      return [toConditionStringOp(searchCondition.operator, Tables.SERIES_METADATA.TITLE_SORT), new Set([RequiredJoin.SeriesMetadata])]
    else return [DSL.noCondition(), new Set()] // null
  }
}
