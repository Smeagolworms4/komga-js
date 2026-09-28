// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ReadListCreationDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { NotBlank, NotEmpty, UniqueElements, constraints } from '../../../../port/validation.js'

type ReadListCreationDtoParams = {
  name: string
  summary?: string
  ordered?: boolean
  bookIds: string[]
}

export class ReadListCreationDto extends DataClass<ReadListCreationDtoParams> {
  readonly name: string
  readonly summary: string
  readonly ordered: boolean
  readonly bookIds: string[]

  constructor({ name, summary = '', ordered = true, bookIds }: ReadListCreationDtoParams) {
    super()
    this.name = name
    this.summary = summary
    this.ordered = ordered
    this.bookIds = bookIds
  }
}

constraints(ReadListCreationDto, {
  name: [NotBlank()],
  bookIds: [NotEmpty(), UniqueElements()],
})
jsonProperties(ReadListCreationDto, { name: 'String', summary: 'String', ordered: 'Boolean', bookIds: { list: 'String' } }, [], { required: ['name', 'bookIds'] })
