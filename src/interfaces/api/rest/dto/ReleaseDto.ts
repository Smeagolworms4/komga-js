// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ReleaseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type ReleaseDtoParams = {
  version: string
  releaseDate: ZonedDateTime
  url: string
  latest: boolean
  preRelease: boolean
  description: string
}

export class ReleaseDto extends DataClass<ReleaseDtoParams> {
  readonly version: string
  readonly releaseDate: ZonedDateTime
  readonly url: string
  readonly latest: boolean
  readonly preRelease: boolean
  readonly description: string

  constructor({ version, releaseDate, url, latest, preRelease, description }: ReleaseDtoParams) {
    super()
    this.version = version
    this.releaseDate = releaseDate
    this.url = url
    this.latest = latest
    this.preRelease = preRelease
    this.description = description
  }
}

jsonProperties(
  ReleaseDto,
  { version: 'String', releaseDate: JsonTypes.ZonedDateTime, url: 'String', latest: 'Boolean', preRelease: 'Boolean', description: 'String' },
  [],
  { required: ['version', 'releaseDate', 'url', 'latest', 'preRelease', 'description'] },
)
