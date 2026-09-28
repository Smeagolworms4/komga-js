// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ContentRestrictions.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { lowerNotBlank } from '../../language/LanguageUtils.js'
import { type Equatable, distinctSet, eq, hash, lazy, str, subtract } from '../../port/kotlin.js'
import type { AgeRestriction } from './AgeRestriction.js'

// `isRestricted` est initialisé dans le corps de la classe Kotlin : `labelsAllow` / `labelsExclude` y désignent les
// paramètres du constructeur (non normalisés), pas les propriétés. Ex. labelsAllow = {" "} : isRestricted = true.
const isRestrictedInit = new WeakMap<ContentRestrictions, () => boolean>()

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
    this.labelsAllow = subtract(distinctSet(lowerNotBlank(labelsAllow)), distinctSet(lowerNotBlank(labelsExclude)))

    this.labelsExclude = distinctSet(lowerNotBlank(labelsExclude))

    isRestrictedInit.set(this, () => ageRestriction !== null || labelsAllow.size > 0 || labelsExclude.size > 0)
  }

  get isRestricted(): boolean {
    return lazy(this, 'isRestricted', isRestrictedInit.get(this) as () => boolean)
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
