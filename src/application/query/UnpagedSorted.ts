// @port-of komga/src/main/kotlin/org/gotson/komga/application/query/UnpagedSorted.kt@a9b59dbee73424d7f2e186b24b0905913f816709
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
