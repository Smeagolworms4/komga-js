// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/TachiyomiReadProgressDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type TachiyomiReadProgressDtoParams = {
  booksCount: number
  booksReadCount: number
  booksUnreadCount: number
  booksInProgressCount: number
  lastReadContinuousIndex: number
}

export class TachiyomiReadProgressDto extends DataClass<TachiyomiReadProgressDtoParams> {
  readonly booksCount: number
  readonly booksReadCount: number
  readonly booksUnreadCount: number
  readonly booksInProgressCount: number
  readonly lastReadContinuousIndex: number

  constructor({ booksCount, booksReadCount, booksUnreadCount, booksInProgressCount, lastReadContinuousIndex }: TachiyomiReadProgressDtoParams) {
    super()
    this.booksCount = booksCount
    this.booksReadCount = booksReadCount
    this.booksUnreadCount = booksUnreadCount
    this.booksInProgressCount = booksInProgressCount
    this.lastReadContinuousIndex = lastReadContinuousIndex
  }
}

jsonProperties(
  TachiyomiReadProgressDto,
  { booksCount: 'Int', booksReadCount: 'Int', booksUnreadCount: 'Int', booksInProgressCount: 'Int', lastReadContinuousIndex: 'Int' },
  [],
  { required: ['booksCount', 'booksReadCount', 'booksUnreadCount', 'booksInProgressCount', 'lastReadContinuousIndex'] },
)
