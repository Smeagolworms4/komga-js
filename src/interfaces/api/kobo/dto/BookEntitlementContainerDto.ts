// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/BookEntitlementContainerDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { BookEntitlementDto } from './BookEntitlementDto.js'
import { KoboBookMetadataDto } from './KoboBookMetadataDto.js'
import { ReadingStateDto } from './ReadingStateDto.js'

type BookEntitlementContainerDtoParams = {
  bookEntitlement: BookEntitlementDto
  bookMetadata: KoboBookMetadataDto
  readingState?: ReadingStateDto | null
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class BookEntitlementContainerDto extends DataClass<BookEntitlementContainerDtoParams> {
  readonly bookEntitlement: BookEntitlementDto
  readonly bookMetadata: KoboBookMetadataDto
  readonly readingState: ReadingStateDto | null

  constructor({ bookEntitlement, bookMetadata, readingState = null }: BookEntitlementContainerDtoParams) {
    super()
    this.bookEntitlement = bookEntitlement
    this.bookMetadata = bookMetadata
    this.readingState = readingState
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(BookEntitlementContainerDto, { rename: { bookEntitlement: 'BookEntitlement', bookMetadata: 'BookMetadata', readingState: 'ReadingState' } })
jsonProperties(
  BookEntitlementContainerDto,
  {
    bookEntitlement: { class: BookEntitlementDto },
    bookMetadata: { class: KoboBookMetadataDto },
    readingState: { nullable: { class: ReadingStateDto } },
  },
  [],
  { required: ['bookEntitlement', 'bookMetadata'] },
)
