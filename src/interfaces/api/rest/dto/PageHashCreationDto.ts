// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/PageHashCreationDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { PageHashKnown } from '../../../../domain/model/PageHashKnown.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { NotBlank, constraints } from '../../../../port/validation.js'

type PageHashCreationDtoParams = {
  hash: string
  size?: number | null
  action: PageHashKnown.Action
}

export class PageHashCreationDto extends DataClass<PageHashCreationDtoParams> {
  readonly hash: string
  readonly size: number | null
  readonly action: PageHashKnown.Action

  constructor({ hash, size = null, action }: PageHashCreationDtoParams) {
    super()
    this.hash = hash
    this.size = size
    this.action = action
  }
}

constraints(PageHashCreationDto, { hash: [NotBlank()] })
jsonProperties(PageHashCreationDto, { hash: 'String', size: { nullable: 'Long' }, action: { enum: PageHashKnown.Action } }, [], { required: ['hash', 'action'] })
