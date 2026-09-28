// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/LibrarySseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type LibrarySseDtoParams = {
  libraryId: string
}

export class LibrarySseDto extends DataClass<LibrarySseDtoParams> {
  readonly libraryId: string

  constructor({ libraryId }: LibrarySseDtoParams) {
    super()
    this.libraryId = libraryId
  }
}

jsonProperties(LibrarySseDto, { libraryId: 'String' }, [], { required: ['libraryId'] })
