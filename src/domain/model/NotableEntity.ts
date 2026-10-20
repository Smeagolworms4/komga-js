// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/NotableEntity.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { type Equatable, hash } from '../../port/kotlin.js'
import { trim } from '../../port/extra-metadata.js'

export class NotableEntity implements Equatable {
  readonly kind: string
  readonly name: string

  constructor({ kind, name }: { kind: string; name: string }) {
    this.kind = trim(kind).toLowerCase()
    this.name = trim(name)
  }

  toString(): string {
    return `NotableEntity(${this.kind}, ${this.name})`
  }

  equals(other: unknown): boolean {
    if (this === other) return true
    if (!(other instanceof NotableEntity)) return false

    if (this.name !== other.name) return false
    if (this.kind !== other.kind) return false

    return true
  }

  hashCode(): number {
    let result = hash(this.name)
    result = (31 * result + hash(this.kind)) | 0
    return result
  }
}
