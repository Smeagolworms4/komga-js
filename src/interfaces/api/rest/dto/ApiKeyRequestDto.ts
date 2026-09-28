// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ApiKeyRequestDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { NotBlank, constraints } from '../../../../port/validation.js'

type ApiKeyRequestDtoParams = {
  comment: string
}

export class ApiKeyRequestDto extends DataClass<ApiKeyRequestDtoParams> {
  readonly comment: string

  constructor({ comment }: ApiKeyRequestDtoParams) {
    super()
    this.comment = comment
  }
}

constraints(ApiKeyRequestDto, { comment: [NotBlank()] })
jsonProperties(ApiKeyRequestDto, { comment: 'String' }, [], { required: ['comment'] })
