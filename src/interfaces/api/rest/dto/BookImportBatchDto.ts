// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/BookImportBatchDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { registerClass } from '../../../../port/jackson.js'
import { CopyMode } from '../../../../domain/model/CopyMode.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type BookImportBatchDtoParams = {
  books?: BookImportDto[]
  copyMode: CopyMode
}

export class BookImportBatchDto extends DataClass<BookImportBatchDtoParams> {
  readonly books: BookImportDto[]
  readonly copyMode: CopyMode

  constructor({ books = [], copyMode }: BookImportBatchDtoParams) {
    super()
    this.books = books
    this.copyMode = copyMode
  }
}

type BookImportDtoParams = {
  sourceFile: string
  seriesId: string
  upgradeBookId?: string | null
  destinationName?: string | null
}

export class BookImportDto extends DataClass<BookImportDtoParams> {
  readonly sourceFile: string
  readonly seriesId: string
  readonly upgradeBookId: string | null
  readonly destinationName: string | null

  constructor({ sourceFile, seriesId, upgradeBookId = null, destinationName = null }: BookImportDtoParams) {
    super()
    this.sourceFile = sourceFile
    this.seriesId = seriesId
    this.upgradeBookId = upgradeBookId
    this.destinationName = destinationName
  }
}

jsonProperties(BookImportBatchDto, { books: { list: { class: BookImportDto } }, copyMode: { enum: CopyMode } }, [], { required: ['copyMode'] })
jsonProperties(
  BookImportDto,
  { sourceFile: 'String', seriesId: 'String', upgradeBookId: { nullable: 'String' }, destinationName: { nullable: 'String' } },
  [],
  { required: ['sourceFile', 'seriesId'] },
)

// PORT: nom qualifié de la classe Kotlin (messages de Jackson)
registerClass('org.gotson.komga.interfaces.api.rest.dto.BookImportBatchDto', BookImportBatchDto)
registerClass('org.gotson.komga.interfaces.api.rest.dto.BookImportDto', BookImportDto)
