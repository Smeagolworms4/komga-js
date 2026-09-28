// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/CollectionUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { NullOrNotBlank } from '../../../../infrastructure/validation/NullOrNotBlank.js'
import { NullOrNotEmpty } from '../../../../infrastructure/validation/NullOrNotEmpty.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { UniqueElements, constraints } from '../../../../port/validation.js'

type CollectionUpdateDtoParams = {
  name: string | null
  ordered: boolean | null
  seriesIds: string[] | null
}

export class CollectionUpdateDto extends DataClass<CollectionUpdateDtoParams> {
  readonly name: string | null
  readonly ordered: boolean | null
  readonly seriesIds: string[] | null

  constructor({ name, ordered, seriesIds }: CollectionUpdateDtoParams) {
    super()
    this.name = name
    this.ordered = ordered
    this.seriesIds = seriesIds
  }
}

constraints(CollectionUpdateDto, {
  name: [NullOrNotBlank()],
  seriesIds: [NullOrNotEmpty(), UniqueElements()],
})
jsonProperties(CollectionUpdateDto, { name: { nullable: 'String' }, ordered: { nullable: 'Boolean' }, seriesIds: { nullable: { list: 'String' } } })
