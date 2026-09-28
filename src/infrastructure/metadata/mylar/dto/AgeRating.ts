// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/mylar/dto/AgeRating.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../../../port/kotlin.js'

export class AgeRating extends KEnum {
  static readonly ALL = new AgeRating('ALL', 'All', 0)
  static readonly NINE = new AgeRating('NINE', '9+', 9)
  static readonly TWELVE = new AgeRating('TWELVE', '12+', 12)
  static readonly FIFTEEN = new AgeRating('FIFTEEN', '15+', 15)
  static readonly SEVENTEEN = new AgeRating('SEVENTEEN', '17+', 17)
  static readonly ADULT = new AgeRating('ADULT', 'Adult', 18)

  private constructor(
    name: string,
    // @get:JsonValue
    readonly value: string,
    readonly ageRating: number | null = null,
  ) {
    super(name)
  }

  // PORT: @get:JsonValue -> toJSON (valeur écrite et lue par l'ObjectMapper)
  override toJSON(): string {
    return this.value
  }
}
