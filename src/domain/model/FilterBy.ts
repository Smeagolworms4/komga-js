// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/FilterBy.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { DataClass, KEnum } from '../../port/kotlin.js'

export class FilterByEntity extends KEnum {
  static readonly LIBRARY = new FilterByEntity('LIBRARY')
  static readonly COLLECTION = new FilterByEntity('COLLECTION')
  static readonly SERIES = new FilterByEntity('SERIES')
  static readonly READLIST = new FilterByEntity('READLIST')
}

type FilterByParams = {
  type: FilterByEntity
  ids: ReadonlySet<string>
}

export class FilterBy extends DataClass<FilterByParams> {
  readonly type: FilterByEntity
  readonly ids: ReadonlySet<string>

  constructor({ type, ids }: FilterByParams) {
    super()
    this.type = type
    this.ids = ids
  }
}

export class FilterTags extends KEnum {
  static readonly SERIES = new FilterTags('SERIES')
  static readonly BOOK = new FilterTags('BOOK')
  static readonly BOTH = new FilterTags('BOTH')
}

/**
 * Convenience function to build [FilterBy] from multiple parameters.
 * The prevalence is as follows:
 * - [FilterByEntity.LIBRARY]
 * - [FilterByEntity.COLLECTION]
 * - [FilterByEntity.SERIES]
 * - [FilterByEntity.READLIST]
 */
export function unpackFilters({
  libraryIds = new Set(),
  collectionIds = new Set(),
  seriesIds = new Set(),
  readListIds = new Set(),
}: {
  libraryIds?: ReadonlySet<string>
  collectionIds?: ReadonlySet<string>
  seriesIds?: ReadonlySet<string>
  readListIds?: ReadonlySet<string>
} = {}): FilterBy | null {
  if (libraryIds.size > 0) return new FilterBy({ type: FilterByEntity.LIBRARY, ids: libraryIds })
  if (collectionIds.size > 0) return new FilterBy({ type: FilterByEntity.COLLECTION, ids: collectionIds })
  if (seriesIds.size > 0) return new FilterBy({ type: FilterByEntity.SERIES, ids: seriesIds })
  if (readListIds.size > 0) return new FilterBy({ type: FilterByEntity.READLIST, ids: readListIds })
  return null
}
