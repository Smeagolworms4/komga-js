// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/Utils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { gunzipSync, gzipSync } from 'node:zlib'
import { AllowExclude } from '../../domain/model/AgeRestriction.js'
import type { ContentRestrictions } from '../../domain/model/ContentRestrictions.js'
import type { MediaExtension } from '../../domain/model/MediaExtension.js'
import { SqliteUdfDataSource } from '../datasource/SqliteUdfDataSource.js'
import { Tables } from '../../port/jooq/generated/main/Tables.js'
import type { Condition, Field, SortField } from '../../port/jooq/core.js'
import { DSL } from '../../port/jooq/dsl.js'
import { classForName } from '../../port/jackson.js'
import type { JavaType, ObjectMapper } from '../../port/jackson-mapper.js'
import { mapNotNull } from '../../port/kotlin.js'
import { PageImpl, PageRequest, type Pageable, type Order, type Sort } from '../../port/spring-data.js'

export function noCase(self: Field<string>): Field<string> {
  return self.collate('NOCASE')
}

/**
 * Warning: SQLite doesn't use collations with LIKE
 */
export function unicode1(self: Field<string>): Field<string> {
  return self.collate(SqliteUdfDataSource.COLLATION_UNICODE_1)
}

export function unicode3(self: Field<string>): Field<string> {
  return self.collate(SqliteUdfDataSource.COLLATION_UNICODE_3)
}

export function udfStripAccents(self: Field<string>): Field<string> {
  return DSL.function(SqliteUdfDataSource.UDF_STRIP_ACCENTS, String, self)
}

export function toOrderBy(self: Sort, sorts: Map<string, Field<unknown>>): SortField<unknown>[] {
  return mapNotNull(self, (it) => toSortField(it, sorts))
}

export function toSortField(self: Order, sorts: Map<string, Field<unknown>>): SortField<unknown> | null {
  const f = sorts.get(self.property)
  if (f === undefined) return null
  return self.isAscending ? f.asc() : f.desc()
}

// PORT: Int.MAX_VALUE
const INT_MAX_VALUE = 2147483647

export function sortByValues(self: Field<string>, values: string[], { asc = true }: { asc?: boolean } = {}): Field<number> {
  let c = DSL.choose<number>(self).when('dummy dsl', INT_MAX_VALUE)
  const multiplier = asc ? 1 : -1
  values.forEach((value, index) => {
    // PORT: produit Int (pas de -0 en JS pour 0 * -1)
    c = c.when(value, (index * multiplier) | 0)
  })
  return c.otherwise(INT_MAX_VALUE)
}

export function inOrNoCondition(self: Field<string>, list: Iterable<string> | null): Condition {
  // PORT: Collection -> Iterable, matérialisé pour isEmpty()
  const l = list === null ? null : [...list]
  if (l === null) return DSL.noCondition()
  else if (l.length === 0) return DSL.falseCondition()
  else return self.in(l)
}

export function toCondition(self: ContentRestrictions): Condition {
  const ageAllowed =
    self.ageRestriction?.restriction === AllowExclude.ALLOW_ONLY
      ? Tables.SERIES_METADATA.AGE_RATING.isNotNull().and(Tables.SERIES_METADATA.AGE_RATING.lessOrEqual(self.ageRestriction.age))
      : DSL.noCondition()

  const labelAllowed =
    self.labelsAllow.size > 0
      ? Tables.SERIES_METADATA.SERIES_ID.in(
          DSL.select(Tables.SERIES_METADATA_SHARING.SERIES_ID)
            .from(Tables.SERIES_METADATA_SHARING)
            .where(Tables.SERIES_METADATA_SHARING.LABEL.in(self.labelsAllow)),
        )
      : DSL.noCondition()

  const ageDenied =
    self.ageRestriction?.restriction === AllowExclude.EXCLUDE
      ? Tables.SERIES_METADATA.AGE_RATING.isNull().or(Tables.SERIES_METADATA.AGE_RATING.lessThan(self.ageRestriction.age))
      : DSL.noCondition()

  const labelDenied =
    self.labelsExclude.size > 0
      ? Tables.SERIES_METADATA.SERIES_ID.notIn(
          DSL.select(Tables.SERIES_METADATA_SHARING.SERIES_ID)
            .from(Tables.SERIES_METADATA_SHARING)
            .where(Tables.SERIES_METADATA_SHARING.LABEL.in(self.labelsExclude)),
        )
      : DSL.noCondition()

  return ageAllowed.or(labelAllowed).and(ageDenied.and(labelDenied))
}

export function serializeJsonGz(self: ObjectMapper, obj: unknown): Uint8Array | null {
  try {
    // PORT: ByteArrayOutputStream + GZIPOutputStream -> zlib.gzipSync (writeValue ferme le flux gzip avant toByteArray)
    return new Uint8Array(gzipSync(self.writeValueAsBytes(obj)))
  } catch (e) {
    return null
  }
}

// PORT: fonction inline reified -> le type cible T est passé explicitement
export function deserializeJsonGz<T>(self: ObjectMapper, gzJson: Uint8Array | null, type: JavaType): T | null {
  if (gzJson === null) return null
  try {
    // PORT: GZIPInputStream -> zlib.gunzipSync
    const gz = gunzipSync(gzJson)
    return self.readValue<T>(new Uint8Array(gz), type) as T
  } catch (e) {
    return null
  }
}

export function deserializeMediaExtension(
  self: ObjectMapper,
  extensionClass: string | null,
  extensionBlob: Uint8Array | null,
): MediaExtension | null {
  if (extensionClass === null || extensionBlob === null) return null
  try {
    // PORT: GZIPInputStream -> zlib.gunzipSync ; Class.forName -> classForName (registre de port/jackson.ts)
    const gz = gunzipSync(extensionBlob)
    return self.readValue<MediaExtension>(new Uint8Array(gz), { class: classForName(extensionClass) }) as MediaExtension
  } catch (e) {
    return null
  }
}

export function rlbAlias(readListId: string) {
  return Tables.READLIST_BOOK.as(`RLB_${readListId}`)
}

export function csAlias(collectionId: string) {
  return Tables.COLLECTION_SERIES.as(`CS_${collectionId}`)
}

export function buildPage<T>(items: T[], pageable: Pageable, count: number, sort: Sort | null): PageImpl<T> {
  return new PageImpl(
    items,
    pageable.isPaged
      ? PageRequest.of(pageable.pageNumber, pageable.pageSize, sort ?? pageable.sort)
      : PageRequest.of(0, Math.max(count, 20), sort ?? pageable.sort),
    count,
  )
}
