// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/UnpagedSorted.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { UnsupportedOperationException } from '../../port/kotlin.js'
import { Pageable, type Sort } from '../../port/spring-data.js'

export class UnpagedSorted extends Pageable {
  constructor(private readonly sortValue: Sort) {
    super()
  }

  get pageNumber(): number {
    throw new UnsupportedOperationException()
  }

  hasPrevious(): boolean {
    return false
  }

  get sort(): Sort {
    return this.sortValue
  }

  get isPaged(): boolean {
    return false
  }

  next(): Pageable {
    return this
  }

  get pageSize(): number {
    throw new UnsupportedOperationException()
  }

  get offset(): number {
    throw new UnsupportedOperationException()
  }

  first(): Pageable {
    return this
  }

  withPage(_pageNumber: number): Pageable {
    return this
  }

  previousOrFirst(): Pageable {
    return this
  }
}
