// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/ReadListSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type ReadListSseDtoParams = {
  readListId: string
  bookIds: string[]
}

export class ReadListSseDto extends DataClass<ReadListSseDtoParams> {
  readonly readListId: string
  readonly bookIds: string[]

  constructor({ readListId, bookIds }: ReadListSseDtoParams) {
    super()
    this.readListId = readListId
    this.bookIds = bookIds
  }
}

jsonProperties(ReadListSseDto, { readListId: 'String', bookIds: { list: 'String' } }, [], { required: ['readListId', 'bookIds'] })
