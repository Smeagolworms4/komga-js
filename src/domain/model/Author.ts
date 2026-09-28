// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/Author.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type Equatable, hash } from '../../port/kotlin.js'
import { trim } from '../../port/extra-metadata.js'

export class Author implements Equatable {
  readonly name: string
  readonly role: string

  constructor({ name, role }: { name: string; role: string }) {
    this.name = trim(name)
    this.role = trim(role).toLowerCase()
  }

  toString(): string {
    return `Author(${this.name}, ${this.role})`
  }

  equals(other: unknown): boolean {
    if (this === other) return true
    if (!(other instanceof Author)) return false

    if (this.name !== other.name) return false
    if (this.role !== other.role) return false

    return true
  }

  hashCode(): number {
    let result = hash(this.name)
    result = (31 * result + hash(this.role)) | 0
    return result
  }
}
