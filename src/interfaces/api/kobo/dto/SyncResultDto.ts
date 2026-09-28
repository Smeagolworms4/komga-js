// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/SyncResultDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { BookEntitlementContainerDto } from './BookEntitlementContainerDto.js'
import { KoboBookMetadataDto } from './KoboBookMetadataDto.js'
import { WrappedReadingStateDto } from './ReadingStateDto.js'
import { WrappedTagDto } from './TagDto.js'

// PORT: interface Kotlin (marqueur) -> interface TS
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SyncResultDto {}

type NewEntitlementDtoParams = {
  newEntitlement: BookEntitlementContainerDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class NewEntitlementDto extends DataClass<NewEntitlementDtoParams> implements SyncResultDto {
  readonly newEntitlement: BookEntitlementContainerDto

  constructor({ newEntitlement }: NewEntitlementDtoParams) {
    super()
    this.newEntitlement = newEntitlement
  }
}

type ChangedEntitlementDtoParams = {
  changedEntitlement: BookEntitlementContainerDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class ChangedEntitlementDto extends DataClass<ChangedEntitlementDtoParams> implements SyncResultDto {
  readonly changedEntitlement: BookEntitlementContainerDto

  constructor({ changedEntitlement }: ChangedEntitlementDtoParams) {
    super()
    this.changedEntitlement = changedEntitlement
  }
}

type ChangedProductMetadataDtoParams = {
  changedProductMetadata: KoboBookMetadataDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class ChangedProductMetadataDto extends DataClass<ChangedProductMetadataDtoParams> implements SyncResultDto {
  readonly changedProductMetadata: KoboBookMetadataDto

  constructor({ changedProductMetadata }: ChangedProductMetadataDtoParams) {
    super()
    this.changedProductMetadata = changedProductMetadata
  }
}

type NewTagDtoParams = {
  newTag: WrappedTagDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class NewTagDto extends DataClass<NewTagDtoParams> implements SyncResultDto {
  readonly newTag: WrappedTagDto

  constructor({ newTag }: NewTagDtoParams) {
    super()
    this.newTag = newTag
  }
}

type ChangedTagDtoParams = {
  changedTag: WrappedTagDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class ChangedTagDto extends DataClass<ChangedTagDtoParams> implements SyncResultDto {
  readonly changedTag: WrappedTagDto

  constructor({ changedTag }: ChangedTagDtoParams) {
    super()
    this.changedTag = changedTag
  }
}

type DeletedTagDtoParams = {
  deletedTag: WrappedTagDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class DeletedTagDto extends DataClass<DeletedTagDtoParams> implements SyncResultDto {
  readonly deletedTag: WrappedTagDto

  constructor({ deletedTag }: DeletedTagDtoParams) {
    super()
    this.deletedTag = deletedTag
  }
}

type ChangedReadingStateDtoParams = {
  changedReadingState: WrappedReadingStateDto
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class ChangedReadingStateDto extends DataClass<ChangedReadingStateDtoParams> implements SyncResultDto {
  readonly changedReadingState: WrappedReadingStateDto

  constructor({ changedReadingState }: ChangedReadingStateDtoParams) {
    super()
    this.changedReadingState = changedReadingState
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(NewEntitlementDto, { rename: { newEntitlement: 'NewEntitlement' } })
jsonProperties(NewEntitlementDto, { newEntitlement: { class: BookEntitlementContainerDto } }, [], { required: ['newEntitlement'] })
json(ChangedEntitlementDto, { rename: { changedEntitlement: 'ChangedEntitlement' } })
jsonProperties(ChangedEntitlementDto, { changedEntitlement: { class: BookEntitlementContainerDto } }, [], { required: ['changedEntitlement'] })
json(ChangedProductMetadataDto, { rename: { changedProductMetadata: 'ChangedProductMetadata' } })
jsonProperties(ChangedProductMetadataDto, { changedProductMetadata: { class: KoboBookMetadataDto } }, [], { required: ['changedProductMetadata'] })
json(NewTagDto, { rename: { newTag: 'NewTag' } })
jsonProperties(NewTagDto, { newTag: { class: WrappedTagDto } }, [], { required: ['newTag'] })
json(ChangedTagDto, { rename: { changedTag: 'ChangedTag' } })
jsonProperties(ChangedTagDto, { changedTag: { class: WrappedTagDto } }, [], { required: ['changedTag'] })
json(DeletedTagDto, { rename: { deletedTag: 'DeletedTag' } })
jsonProperties(DeletedTagDto, { deletedTag: { class: WrappedTagDto } }, [], { required: ['deletedTag'] })
json(ChangedReadingStateDto, { rename: { changedReadingState: 'ChangedReadingState' } })
jsonProperties(ChangedReadingStateDto, { changedReadingState: { class: WrappedReadingStateDto } }, [], { required: ['changedReadingState'] })
