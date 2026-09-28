// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/ThumbnailSeriesCollectionOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { ThumbnailSeriesCollection } from '../../../../src/domain/model/ThumbnailSeriesCollection.js'
import { eq } from '../../../../src/port/kotlin.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/ThumbnailSeriesCollection')

const date = LocalDateTime.of(2020, 1, 1, 0, 0)

const thumb = ({
  thumbnail = new Uint8Array([1, 2, 3]) as Uint8Array,
  selected = false,
  mediaType = 'image/jpeg',
  fileSize = 3,
  dimension = new Dimension({ width: 10, height: 20 }),
  id = 'T1',
  ownerId = 'O1',
  createdDate = date,
  lastModifiedDate = createdDate,
}: {
  thumbnail?: Uint8Array
  selected?: boolean
  mediaType?: string
  fileSize?: number
  dimension?: Dimension
  id?: string
  ownerId?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
} = {}) => new ThumbnailSeriesCollection({ thumbnail, selected, type: ThumbnailSeriesCollection.Type.USER_UPLOADED, mediaType, fileSize, dimension, id, collectionId: ownerId, createdDate, lastModifiedDate })

func('equals', () => {
  kase('same values, distinct arrays', () => eq(thumb(), thumb({ thumbnail: new Uint8Array([1, 2, 3]) })))
  kase('same instance', () => {
    const it = thumb()
    return eq(it, it)
  })
  kase('different bytes', () => eq(thumb(), thumb({ thumbnail: new Uint8Array([1, 2, 4]) })))
  kase('empty bytes', () => eq(thumb({ thumbnail: new Uint8Array([]) }), thumb({ thumbnail: new Uint8Array([]) })))
  kase('prefix bytes', () => eq(thumb(), thumb({ thumbnail: new Uint8Array([1, 2]) })))
  kase('selected', () => eq(thumb(), thumb({ selected: true })))
  kase('media type', () => eq(thumb(), thumb({ mediaType: 'image/png' })))
  kase('file size', () => eq(thumb(), thumb({ fileSize: 4 })))
  kase('dimension', () => eq(thumb(), thumb({ dimension: new Dimension({ width: 20, height: 10 }) })))
  kase('id', () => eq(thumb(), thumb({ id: 'T2' })))
  kase('owner', () => eq(thumb(), thumb({ ownerId: 'O2' })))
  kase('created date', () => eq(thumb(), thumb({ createdDate: date.plusNanos(1), lastModifiedDate: date })))
  kase('last modified date', () => eq(thumb(), thumb({ lastModifiedDate: date.plusDays(1) })))
  kase('null', () => thumb().equals(null))
  kase('other type', () => thumb().equals('T1'))
})
func('hashCode', () => {
  kase('equal values have equal hash', () => thumb().hashCode() === thumb({ thumbnail: new Uint8Array([1, 2, 3]) }).hashCode())
  kase('stable', () => {
    const it = thumb()
    return it.hashCode() === it.hashCode()
  })
  kase('different bytes change hash', () => thumb().hashCode() === thumb({ thumbnail: new Uint8Array([3, 2, 1]) }).hashCode())
  kase('different id change hash', () => thumb().hashCode() === thumb({ id: 'T2' }).hashCode())
})
