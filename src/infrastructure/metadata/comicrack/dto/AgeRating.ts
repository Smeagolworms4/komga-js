// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/dto/AgeRating.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { KEnum, associateBy, lazy } from '../../../../port/kotlin.js'

export class AgeRating extends KEnum {
  static readonly UNKNOWN = new AgeRating('UNKNOWN', 'Unknown')
  static readonly ADULTS_ONLY_18 = new AgeRating('ADULTS_ONLY_18', 'Adults Only 18+', 18)
  static readonly EARLY_CHILDHOOD = new AgeRating('EARLY_CHILDHOOD', 'Early Childhood', 3)
  static readonly EVERYONE = new AgeRating('EVERYONE', 'Everyone', 0)
  static readonly EVERYONE_10 = new AgeRating('EVERYONE_10', 'Everyone 10+', 10)
  static readonly G = new AgeRating('G', 'G', 0)
  static readonly KIDS_TO_ADULTS = new AgeRating('KIDS_TO_ADULTS', 'Kids to Adults', 6)
  static readonly M = new AgeRating('M', 'M', 17)
  static readonly MA_15 = new AgeRating('MA_15', 'MA 15+', 15)
  static readonly MATURE_17 = new AgeRating('MATURE_17', 'Mature 17+', 17)
  static readonly PG = new AgeRating('PG', 'PG', 8)
  static readonly R_18 = new AgeRating('R_18', 'R18+', 18)
  static readonly RATING_PENDING = new AgeRating('RATING_PENDING', 'Rating Pending')
  static readonly TEEN = new AgeRating('TEEN', 'Teen', 13)
  static readonly X_18 = new AgeRating('X_18', 'X18+', 18)

  private constructor(
    name: string,
    readonly value: string,
    readonly ageRating: number | null = null,
  ) {
    super(name)
  }

  // companion object
  private static get map(): Map<string, AgeRating> {
    return lazy(AgeRating, 'map', () => associateBy(AgeRating.entries(), (it) => AgeRating.toLowerNoSpace(it.value)))
  }

  // @JsonCreator
  static fromValue(value: string): AgeRating | null {
    return AgeRating.map.get(AgeRating.toLowerNoSpace(value)) ?? null
  }

  private static toLowerNoSpace(self: string): string {
    // PORT: String.lowercase() (Locale.ROOT) -> toLowerCase()
    return self.toLowerCase().replaceAll(' ', '')
  }
}

json(AgeRating, { creator: (value) => AgeRating.fromValue(value) })
