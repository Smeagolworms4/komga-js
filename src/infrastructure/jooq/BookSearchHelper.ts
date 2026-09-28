// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/BookSearchHelper.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Media } from '../../domain/model/Media.js'
import { MediaType } from '../../domain/model/MediaType.js'
import { ReadStatus } from '../../domain/model/ReadStatus.js'
import { SearchCondition } from '../../domain/model/SearchCondition.js'
import type { SearchContext } from '../../domain/model/SearchContext.js'
import { SearchOperator } from '../../domain/model/SearchOperator.js'
import type { Condition } from '../../port/jooq/core.js'
import { DSL } from '../../port/jooq/dsl.js'
import { Tables } from '../../port/jooq/generated/main/Tables.js'
import { distinctSet, eq, union } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { RequiredJoin } from './RequiredJoin.js'
import { ContentRestrictionsSearchHelper } from './ContentRestrictionsSearchHelper.js'
import {
  toConditionBoolean,
  toConditionDate,
  toConditionEqualityConverter,
  toConditionEqualityString,
  toConditionNumeric,
  toConditionStringOp,
} from './SearchOperatorUtils.js'
import { rlbAlias, unicode1 } from './Utils.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.jooq.BookSearchHelper')

/**
 * Helper class to generate a Jooq Condition from a [SearchCondition.Book] and [SearchContext]
 */
export class BookSearchHelper {
  constructor(readonly context: SearchContext) {}

  // PORT: surcharges toCondition(searchCondition) / toCondition() fusionnées (paramètre absent = toCondition())
  toCondition(...args: [] | [searchCondition: SearchCondition.Book | null]): [Condition, Set<RequiredJoin>] {
    if (args.length === 1) {
      const [searchCondition] = args
      const base = this.toCondition()
      const search = this.toConditionInternalBook(searchCondition)
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
    return this.toConditionInternalBook(new SearchCondition.AnyOfBook({ conditions: ids.map((it) => new SearchCondition.LibraryId({ operator: new SearchOperator.Is({ value: it }) })) }))
  }

  // PORT: surcharge privée toConditionInternal(searchCondition: SearchCondition.Book?)
  private toConditionInternalBook(searchCondition: SearchCondition.Book | null): [Condition, Set<RequiredJoin>] {
    if (searchCondition instanceof SearchCondition.AllOfBook)
      return searchCondition.conditions.reduce<[Condition, Set<RequiredJoin>]>(
        (acc, cond) => {
          const bookCondition = this.toConditionInternalBook(cond)
          return [acc[0].and(bookCondition[0]), union(acc[1], bookCondition[1])]
        },
        [DSL.noCondition(), new Set()],
      )
    else if (searchCondition instanceof SearchCondition.AnyOfBook)
      return searchCondition.conditions.reduce<[Condition, Set<RequiredJoin>]>(
        (acc, cond) => {
          const bookCondition = this.toConditionInternalBook(cond)
          return [acc[0].or(bookCondition[0]), union(acc[1], bookCondition[1])]
        },
        [DSL.noCondition(), new Set()],
      )
    else if (searchCondition instanceof SearchCondition.LibraryId) return [toConditionEqualityString(searchCondition.operator, Tables.BOOK.LIBRARY_ID), new Set()]
    else if (searchCondition instanceof SearchCondition.SeriesId) return [toConditionEqualityString(searchCondition.operator, Tables.BOOK.SERIES_ID), new Set()]
    else if (searchCondition instanceof SearchCondition.ReadListId) {
      const operator = searchCondition.operator
      // for IS condition we have to do a join, so as to order the books by readList number
      if (operator instanceof SearchOperator.Is)
        return [rlbAlias(operator.value).READLIST_ID.eq(operator.value), new Set([new RequiredJoin.ReadList({ readListId: operator.value })])]
      else {
        const inner = (readListId: string) =>
          DSL.select(Tables.READLIST_BOOK.BOOK_ID).from(Tables.READLIST_BOOK).where(Tables.READLIST_BOOK.READLIST_ID.eq(readListId))
        return [Tables.BOOK.ID.notIn(inner(operator.value)), new Set()]
      }
    } else if (searchCondition instanceof SearchCondition.Title)
      return [toConditionStringOp(searchCondition.operator, Tables.BOOK_METADATA.TITLE), new Set([RequiredJoin.BookMetadata])]
    else if (searchCondition instanceof SearchCondition.Deleted) {
      const it = Tables.BOOK.DELETED_DATE
      return [eq(searchCondition.operator, SearchOperator.IsFalse) ? it.isNull() : it.isNotNull(), new Set()]
    } else if (searchCondition instanceof SearchCondition.ReleaseDate)
      return [toConditionDate(searchCondition.operator, Tables.BOOK_METADATA.RELEASE_DATE), new Set([RequiredJoin.BookMetadata])]
    else if (searchCondition instanceof SearchCondition.NumberSort)
      return [toConditionNumeric(searchCondition.operator, Tables.BOOK_METADATA.NUMBER_SORT), new Set([RequiredJoin.BookMetadata])]
    else if (searchCondition instanceof SearchCondition.ReadStatus) {
      if (this.context.userId === null) {
        logger.warn(() => 'SearchCondition.ReadStatus without userId in search context')
        return [DSL.falseCondition(), new Set()]
      } else {
        const it = Tables.READ_PROGRESS.COMPLETED
        const operator = searchCondition.operator
        let c: Condition
        if (operator instanceof SearchOperator.Is) {
          switch (operator.value) {
            case ReadStatus.UNREAD:
              c = it.isNull()
              break
            case ReadStatus.READ:
              c = it.isTrue()
              break
            default: // ReadStatus.IN_PROGRESS
              c = it.isFalse()
          }
        } else {
          switch (operator.value) {
            case ReadStatus.UNREAD:
              c = it.isNotNull()
              break
            case ReadStatus.READ:
              c = it.isNull().or(it.isFalse())
              break
            default: // ReadStatus.IN_PROGRESS
              c = it.isTrue().or(it.isNull())
          }
        }
        return [c, new Set([new RequiredJoin.ReadProgress({ userId: this.context.userId })])]
      }
    } else if (searchCondition instanceof SearchCondition.MediaStatus)
      return [toConditionEqualityConverter(searchCondition.operator, Tables.MEDIA.STATUS, (it: Media.Status) => it.name), new Set([RequiredJoin.Media])]
    else if (searchCondition instanceof SearchCondition.MediaProfile) {
      const field = Tables.MEDIA.MEDIA_TYPE
      const operator = searchCondition.operator
      const c =
        operator instanceof SearchOperator.Is
          ? field.in(distinctSet(MediaType.matchingMediaProfile(operator.value).map((it) => it.type)))
          : field.notIn(distinctSet(MediaType.matchingMediaProfile(operator.value).map((it) => it.type)))
      return [c, new Set([RequiredJoin.Media])]
    } else if (searchCondition instanceof SearchCondition.Tag) {
      const field = Tables.BOOK.ID
      const innerEquals = (tag: string) =>
        DSL.select(Tables.BOOK_METADATA_TAG.BOOK_ID)
          .from(Tables.BOOK_METADATA_TAG)
          .where(unicode1(Tables.BOOK_METADATA_TAG.TAG).equal(tag))
      const innerAny = () =>
        DSL.select(Tables.BOOK_METADATA_TAG.BOOK_ID).from(Tables.BOOK_METADATA_TAG).where(Tables.BOOK_METADATA_TAG.TAG.isNotNull())

      const operator = searchCondition.operator
      let c: Condition
      if (operator instanceof SearchOperator.Is) c = field.in(innerEquals(operator.value))
      else if (operator instanceof SearchOperator.IsNot) c = field.notIn(innerEquals(operator.value))
      else if (operator instanceof SearchOperator.IsNullT) c = field.notIn(innerAny())
      else c = field.in(innerAny())
      return [c, new Set()]
    } else if (searchCondition instanceof SearchCondition.Author) {
      const field = Tables.BOOK.ID
      const inner = (name: string | null, role: string | null) => {
        const q = DSL.select(Tables.BOOK_METADATA_AUTHOR.BOOK_ID).from(Tables.BOOK_METADATA_AUTHOR).where(DSL.noCondition())
        if (name !== null) q.and(unicode1(Tables.BOOK_METADATA_AUTHOR.NAME).equal(name))
        if (role !== null) q.and(unicode1(Tables.BOOK_METADATA_AUTHOR.ROLE).equal(role))
        return q
      }
      const operator = searchCondition.operator
      let c: Condition
      if (operator instanceof SearchOperator.Is) {
        if (operator.value.name === null && operator.value.role === null) c = DSL.noCondition()
        else c = field.in(inner(operator.value.name, operator.value.role))
      } else {
        if (operator.value.name === null && operator.value.role === null) c = DSL.noCondition()
        else c = field.notIn(inner(operator.value.name, operator.value.role))
      }
      return [c, new Set()]
    } else if (searchCondition instanceof SearchCondition.Poster) {
      const field = Tables.BOOK.ID
      const inner = (type: SearchCondition.PosterMatch.Type | null, selected: boolean | null) => {
        const q = DSL.select(Tables.THUMBNAIL_BOOK.BOOK_ID).from(Tables.THUMBNAIL_BOOK).where(DSL.noCondition())
        if (type !== null) q.and(Tables.THUMBNAIL_BOOK.TYPE.equalIgnoreCase(type.name))
        if (selected !== null && selected) q.and(Tables.THUMBNAIL_BOOK.SELECTED.isTrue())
        if (selected !== null && !selected) q.and(Tables.THUMBNAIL_BOOK.SELECTED.isFalse())
        return q
      }
      const operator = searchCondition.operator
      let c: Condition
      if (operator instanceof SearchOperator.Is) {
        if (operator.value.type === null && operator.value.selected === null) c = DSL.noCondition()
        else c = field.in(inner(operator.value.type, operator.value.selected))
      } else {
        if (operator.value.type === null && operator.value.selected === null) c = DSL.noCondition()
        else c = field.notIn(inner(operator.value.type, operator.value.selected))
      }
      return [c, new Set()]
    } else if (searchCondition instanceof SearchCondition.OneShot) return [toConditionBoolean(searchCondition.operator, Tables.BOOK.ONESHOT), new Set()]
    else return [DSL.noCondition(), new Set()] // null
  }
}
