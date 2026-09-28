// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/StatusDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { JsonType } from '../../../../port/jackson-mapper.js'
import { KEnum } from '../../../../port/kotlin.js'

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
// PORT: @JsonProperty("...") sur les constantes -> nom JSON passé au constructeur
export class StatusDto extends KEnum {
  // @JsonProperty("ReadyToRead")
  static readonly READY_TO_READ = new StatusDto('READY_TO_READ', 'ReadyToRead')

  // @JsonProperty("Finished")
  static readonly FINISHED = new StatusDto('FINISHED', 'Finished')

  // @JsonProperty("Reading")
  static readonly READING = new StatusDto('READING', 'Reading')

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
export function jsonTypeOfStatusDto(): JsonType {
  return {
    scalar: 'StatusDto',
    read: (s: string) =>
      StatusDto.entries().find((it) => it.jsonName === s) ??
      (() => {
        throw new Error(`not one of the values accepted for Enum class: [${StatusDto.entries().map((it) => it.jsonName).join(', ')}]`)
      })(),
    write: (v: StatusDto) => v.toJSON(),
  }
}
