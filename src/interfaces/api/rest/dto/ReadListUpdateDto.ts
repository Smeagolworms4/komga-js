// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ReadListUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { NullOrNotBlank } from '../../../../infrastructure/validation/NullOrNotBlank.js'
import { NullOrNotEmpty } from '../../../../infrastructure/validation/NullOrNotEmpty.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { UniqueElements, constraints } from '../../../../port/validation.js'

type ReadListUpdateDtoParams = {
  name: string | null
  summary: string | null
  bookIds: string[] | null
  ordered: boolean | null
}

export class ReadListUpdateDto extends DataClass<ReadListUpdateDtoParams> {
  readonly name: string | null
  readonly summary: string | null
  readonly bookIds: string[] | null
  readonly ordered: boolean | null

  constructor({ name, summary, bookIds, ordered }: ReadListUpdateDtoParams) {
    super()
    this.name = name
    this.summary = summary
    this.bookIds = bookIds
    this.ordered = ordered
  }
}

constraints(ReadListUpdateDto, {
  name: [NullOrNotBlank()],
  bookIds: [NullOrNotEmpty(), UniqueElements()],
})
jsonProperties(ReadListUpdateDto, { name: { nullable: 'String' }, summary: { nullable: 'String' }, bookIds: { nullable: { list: 'String' } }, ordered: { nullable: 'Boolean' } })
