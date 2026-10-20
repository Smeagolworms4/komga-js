// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ContentRestrictions.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { lowerNotBlank } from '../../language/LanguageUtils.js'
import { type Equatable, distinctSet, eq, hash, str, subtract } from '../../port/kotlin.js'
import { serializable } from '../../port/java-serialization.js'
import type { AgeRestriction } from './AgeRestriction.js'

export class ContentRestrictions implements Equatable {
  readonly ageRestriction: AgeRestriction | null
  readonly labelsAllow: Set<string>
  readonly labelsExclude: Set<string>

  constructor({
    ageRestriction = null,
    labelsAllow = new Set(),
    labelsExclude = new Set(),
  }: {
    ageRestriction?: AgeRestriction | null
    labelsAllow?: ReadonlySet<string>
    labelsExclude?: ReadonlySet<string>
  } = {}) {
    this.ageRestriction = ageRestriction
    this.labelsExclude = distinctSet(lowerNotBlank(labelsExclude))

    this.labelsAllow = subtract(distinctSet(lowerNotBlank(labelsAllow)), this.labelsExclude)
  }

  get isRestricted(): boolean {
    return this.ageRestriction !== null || this.labelsAllow.size > 0 || this.labelsExclude.size > 0
  }

  toString(): string {
    return `ContentRestrictions(ageRestriction=${str(this.ageRestriction)}, labelsAllow=${str(this.labelsAllow)}, labelsExclude=${str(this.labelsExclude)})`
  }

  equals(other: unknown): boolean {
    if (this === other) return true
    if (!(other instanceof ContentRestrictions)) return false

    if (!eq(this.ageRestriction, other.ageRestriction)) return false
    if (!eq(this.labelsAllow, other.labelsAllow)) return false
    if (!eq(this.labelsExclude, other.labelsExclude)) return false

    return true
  }

  hashCode(): number {
    let result = this.ageRestriction?.hashCode() ?? 0
    result = (31 * result + hash(this.labelsAllow)) | 0
    result = (31 * result + hash(this.labelsExclude)) | 0
    return result
  }
}

// : Serializable (serialVersionUID = -6674967573322990355L)
serializable(ContentRestrictions, 'org.gotson.komga.domain.model.ContentRestrictions')
