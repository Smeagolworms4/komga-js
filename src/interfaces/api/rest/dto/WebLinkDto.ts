// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/WebLinkDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { WebLink } from '../../../../domain/model/WebLink.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type WebLinkDtoParams = {
  label: string
  url: string
}

export class WebLinkDto extends DataClass<WebLinkDtoParams> {
  readonly label: string
  readonly url: string

  constructor({ label, url }: WebLinkDtoParams) {
    super()
    this.label = label
    this.url = url
  }
}

export function toDto(self: WebLink): WebLinkDto {
  return new WebLinkDto({ label: self.label, url: self.url.toString() })
}

jsonProperties(WebLinkDto, { label: 'String', url: 'String' }, [], { required: ['label', 'url'] })
