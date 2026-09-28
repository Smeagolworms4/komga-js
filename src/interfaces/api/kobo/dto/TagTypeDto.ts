// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/TagTypeDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { JsonType } from '../../../../port/jackson-mapper.js'
import { KEnum } from '../../../../port/kotlin.js'

// PORT: @JsonProperty("...") sur les constantes -> nom JSON passé au constructeur
export class TagTypeDto extends KEnum {
  // @JsonProperty("SystemTag")
  static readonly SYSTEM_TAG = new TagTypeDto('SYSTEM_TAG', 'SystemTag')

  // @JsonProperty("UserTag")
  static readonly USER_TAG = new TagTypeDto('USER_TAG', 'UserTag')

  private constructor(
    name: string,
    readonly jsonName: string,
  ) {
    super(name)
  }

  override toJSON(): string {
    return this.jsonName
  }
}

// PORT: type JSON de l'enum (noms @JsonProperty ; lecture sensible à la casse : accept-case-insensitive-values ne s'applique pas aux enums) ;
// fonction (hissée) pour être utilisable dans un import circulaire
export function jsonTypeOfTagTypeDto(): JsonType {
  return {
    scalar: 'TagTypeDto',
    read: (s: string) =>
      TagTypeDto.entries().find((it) => it.jsonName === s) ??
      (() => {
        throw new Error(`not one of the values accepted for Enum class: [${TagTypeDto.entries().map((it) => it.jsonName).join(', ')}]`)
      })(),
    write: (v: TagTypeDto) => v.toJSON(),
  }
}
