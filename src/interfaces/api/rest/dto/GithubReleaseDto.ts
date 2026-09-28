// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/GithubReleaseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { json } from '../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type GithubReleaseDtoParams = {
  htmlUrl: string
  tagName: string
  publishedAt: ZonedDateTime
  body: string
  prerelease: boolean
}

// @JsonIgnoreProperties(ignoreUnknown = true)
// @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy::class)
export class GithubReleaseDto extends DataClass<GithubReleaseDtoParams> {
  readonly htmlUrl: string
  readonly tagName: string
  readonly publishedAt: ZonedDateTime
  readonly body: string
  readonly prerelease: boolean

  constructor({ htmlUrl, tagName, publishedAt, body, prerelease }: GithubReleaseDtoParams) {
    super()
    this.htmlUrl = htmlUrl
    this.tagName = tagName
    this.publishedAt = publishedAt
    this.body = body
    this.prerelease = prerelease
  }
}

// PORT: @JsonNaming(SnakeCaseStrategy) -> noms JSON explicites
json(GithubReleaseDto, { rename: { htmlUrl: 'html_url', tagName: 'tag_name', publishedAt: 'published_at' } })
jsonProperties(
  GithubReleaseDto,
  { htmlUrl: 'String', tagName: 'String', publishedAt: JsonTypes.ZonedDateTime, body: 'String', prerelease: 'Boolean' },
  [],
  { required: ['htmlUrl', 'tagName', 'publishedAt', 'body', 'prerelease'] },
)
