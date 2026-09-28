// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/ResultDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { WrappedResultDto } from './ReadingStateUpdateResultDto.js'
import type { JsonType } from '../../../../port/jackson-mapper.js'
import { IllegalArgumentException, KEnum } from '../../../../port/kotlin.js'

// PORT: @JsonProperty("...") sur les constantes -> nom JSON passé au constructeur
export class ResultDto extends KEnum {
  // @JsonProperty("Success")
  static readonly SUCCESS = new ResultDto('SUCCESS', 'Success')

  // Not sure what Kobo accepts exactly, so I made up my own
  // @JsonProperty("Failure")
  static readonly FAILURE = new ResultDto('FAILURE', 'Failure')

  // @JsonProperty("Ignored")
  static readonly IGNORED = new ResultDto('IGNORED', 'Ignored')

  private constructor(
    name: string,
    readonly jsonName: string,
  ) {
    super(name)
  }

  wrapped(): WrappedResultDto {
    return new WrappedResultDto({ result: this })
  }

  override toJSON(): string {
    return this.jsonName
  }
}

// PORT: type JSON de l'enum (noms @JsonProperty ; lecture sensible à la casse : accept-case-insensitive-values ne s'applique pas aux enums) ;
// fonction (hissée) pour être utilisable dans un import circulaire
export function jsonTypeOfResultDto(): JsonType {
  return {
    scalar: 'ResultDto',
    read: (s: string) =>
      ResultDto.entries().find((it) => it.jsonName === s) ??
      (() => {
        throw new IllegalArgumentException(`not one of the values accepted for Enum class: [${ResultDto.entries().map((it) => it.jsonName).join(', ')}]`)
      })(),
    write: (v: ResultDto) => v.toJSON(),
  }
}
