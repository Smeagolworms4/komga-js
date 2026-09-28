// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/BookImportSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type BookImportSseDtoParams = {
  bookId: string | null
  sourceFile: string
  success: boolean
  message?: string | null
}

export class BookImportSseDto extends DataClass<BookImportSseDtoParams> {
  readonly bookId: string | null
  readonly sourceFile: string
  readonly success: boolean
  readonly message: string | null

  constructor({ bookId, sourceFile, success, message = null }: BookImportSseDtoParams) {
    super()
    this.bookId = bookId
    this.sourceFile = sourceFile
    this.success = success
    this.message = message
  }
}

jsonProperties(BookImportSseDto, { bookId: { nullable: 'String' }, sourceFile: 'String', success: 'Boolean', message: { nullable: 'String' } }, [], { required: ['sourceFile', 'success'] })
