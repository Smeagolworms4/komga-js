// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/CollectionCreationDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { NotBlank, NotEmpty, UniqueElements, constraints } from '../../../../port/validation.js'

type CollectionCreationDtoParams = {
  name: string
  ordered: boolean
  seriesIds: string[]
}

export class CollectionCreationDto extends DataClass<CollectionCreationDtoParams> {
  readonly name: string
  readonly ordered: boolean
  readonly seriesIds: string[]

  constructor({ name, ordered, seriesIds }: CollectionCreationDtoParams) {
    super()
    this.name = name
    this.ordered = ordered
    this.seriesIds = seriesIds
  }
}

constraints(CollectionCreationDto, {
  name: [NotBlank()],
  seriesIds: [NotEmpty(), UniqueElements()],
})
jsonProperties(CollectionCreationDto, { name: 'String', ordered: 'Boolean', seriesIds: { list: 'String' } }, [], { required: ['name', 'ordered', 'seriesIds'] })
