// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/TachiyomiReadProgressV2Dto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass, kFloat } from '../../../../port/kotlin.js'

type TachiyomiReadProgressV2DtoParams = {
  booksCount: number
  booksReadCount: number
  booksUnreadCount: number
  booksInProgressCount: number
  lastReadContinuousNumberSort: number
  maxNumberSort: number
}

export class TachiyomiReadProgressV2Dto extends DataClass<TachiyomiReadProgressV2DtoParams> {
  readonly booksCount: number
  readonly booksReadCount: number
  readonly booksUnreadCount: number
  readonly booksInProgressCount: number
  readonly lastReadContinuousNumberSort: number // PORT: Float
  readonly maxNumberSort: number // PORT: Float

  constructor({ booksCount, booksReadCount, booksUnreadCount, booksInProgressCount, lastReadContinuousNumberSort, maxNumberSort }: TachiyomiReadProgressV2DtoParams) {
    super()
    this.booksCount = booksCount
    this.booksReadCount = booksReadCount
    this.booksUnreadCount = booksUnreadCount
    this.booksInProgressCount = booksInProgressCount
    this.lastReadContinuousNumberSort = kFloat(lastReadContinuousNumberSort)
    this.maxNumberSort = kFloat(maxNumberSort)
  }
}

jsonProperties(
  TachiyomiReadProgressV2Dto,
  {
    booksCount: 'Int',
    booksReadCount: 'Int',
    booksUnreadCount: 'Int',
    booksInProgressCount: 'Int',
    lastReadContinuousNumberSort: 'Float',
    maxNumberSort: 'Float',
  },
  [],
  { required: ['booksCount', 'booksReadCount', 'booksUnreadCount', 'booksInProgressCount', 'lastReadContinuousNumberSort', 'maxNumberSort'] },
)
