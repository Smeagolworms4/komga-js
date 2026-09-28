// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/TagDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import type { SyncPoint } from '../../../../domain/model/SyncPoint.js'
import { json } from '../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { TagItemDto } from './TagItemDto.js'
import { TagTypeDto, jsonTypeOfTagTypeDto } from './TagTypeDto.js'

type TagDtoParams = {
  id: string
  created: ZonedDateTime
  lastModified: ZonedDateTime
  name: string
  type: TagTypeDto
  items?: TagItemDto[] | null
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class TagDto extends DataClass<TagDtoParams> {
  readonly id: string
  readonly created: ZonedDateTime
  readonly lastModified: ZonedDateTime
  readonly name: string
  readonly type: TagTypeDto
  readonly items: TagItemDto[] | null

  constructor({ id, created, lastModified, name, type, items = null }: TagDtoParams) {
    super()
    this.id = id
    this.created = created
    this.lastModified = lastModified
    this.name = name
    this.type = type
    this.items = items
  }
}

type WrappedTagDtoParams = {
  tag: TagDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class WrappedTagDto extends DataClass<WrappedTagDtoParams> {
  readonly tag: TagDto

  constructor({ tag }: WrappedTagDtoParams) {
    super()
    this.tag = tag
  }
}

// PORT: fonction d'extension SyncPoint.ReadList.toWrappedTagDto(items)
export function toWrappedTagDto(self: SyncPoint.ReadList, { items = null }: { items?: TagItemDto[] | null } = {}): WrappedTagDto {
  return new WrappedTagDto({
    tag: new TagDto({
      id: self.readListId,
      created: self.createdDate,
      lastModified: self.lastModifiedDate,
      name: self.readListName,
      type: TagTypeDto.USER_TAG,
      items: items,
    }),
  })
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(TagDto, { rename: { id: 'Id', created: 'Created', lastModified: 'LastModified', name: 'Name', type: 'Type', items: 'Items' } })
jsonProperties(
  TagDto,
  {
    id: 'String',
    created: JsonTypes.ZonedDateTime,
    lastModified: JsonTypes.ZonedDateTime,
    name: 'String',
    type: jsonTypeOfTagTypeDto(),
    items: { nullable: { list: { class: TagItemDto } } },
  },
  [],
  { required: ['id', 'created', 'lastModified', 'name', 'type'] },
)
json(WrappedTagDto, { rename: { tag: 'Tag' } })
jsonProperties(WrappedTagDto, { tag: { class: TagDto } }, [], { required: ['tag'] })
