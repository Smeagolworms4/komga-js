// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/PageHashUnknownDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { PageHashUnknown } from '../../../../domain/model/PageHashUnknown.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type PageHashUnknownDtoParams = {
  hash: string
  size: number | null
  matchCount: number
}

export class PageHashUnknownDto extends DataClass<PageHashUnknownDtoParams> {
  readonly hash: string
  readonly size: number | null
  readonly matchCount: number

  constructor({ hash, size, matchCount }: PageHashUnknownDtoParams) {
    super()
    this.hash = hash
    this.size = size
    this.matchCount = matchCount
  }
}

export function toDto(self: PageHashUnknown): PageHashUnknownDto {
  return new PageHashUnknownDto({
    hash: self.hash,
    size: self.size,
    matchCount: self.matchCount,
  })
}

jsonProperties(PageHashUnknownDto, { hash: 'String', size: { nullable: 'Long' }, matchCount: 'Int' }, [], { required: ['hash', 'matchCount'] })
