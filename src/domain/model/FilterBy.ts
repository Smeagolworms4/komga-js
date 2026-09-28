// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/FilterBy.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
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
