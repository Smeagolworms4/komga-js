// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/ReadProgressSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type ReadProgressSseDtoParams = {
  bookId: string
  userId: string
}

export class ReadProgressSseDto extends DataClass<ReadProgressSseDtoParams> {
  readonly bookId: string
  readonly userId: string

  constructor({ bookId, userId }: ReadProgressSseDtoParams) {
    super()
    this.bookId = bookId
    this.userId = userId
  }
}

jsonProperties(ReadProgressSseDto, { bookId: 'String', userId: 'String' }, [], { required: ['bookId', 'userId'] })
