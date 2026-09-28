// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/ThumbnailBookOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import { URL } from '../../../../src/port/java-net.js'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { eq } from '../../../../src/port/kotlin.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../oracle.js'

const { func, kase } = oracle('domain/model/ThumbnailBook')

const date = LocalDateTime.of(2020, 1, 1, 0, 0)

const thumb = ({
  thumbnail = new Uint8Array([1, 2, 3]) as Uint8Array | null,
  url = null as URL | null,
  selected = false,
  mediaType = 'image/jpeg',
  fileSize = 3,
  dimension = new Dimension({ width: 10, height: 20 }),
  id = 'T1',
  ownerId = 'O1',
  createdDate = date,
  lastModifiedDate = createdDate,
}: {
  thumbnail?: Uint8Array | null
  url?: URL | null
  selected?: boolean
  mediaType?: string
  fileSize?: number
  dimension?: Dimension
  id?: string
  ownerId?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
} = {}) => new ThumbnailBook({ thumbnail, url, selected, type: ThumbnailBook.Type.GENERATED, mediaType, fileSize, dimension, id, bookId: ownerId, createdDate, lastModifiedDate })

func('exists', () => {
  kase('bytes', () => thumb().exists())
  kase('empty bytes', () => thumb({ thumbnail: new Uint8Array([]) }).exists())
  kase('no bytes, no url', () => thumb({ thumbnail: null }).exists())
  kase('existing file url', () => {
    const f = join(tempDir(), 'thumb one.jpg')
    writeFileSync(f, oracleBytes(4))
    return thumb({ thumbnail: null, url: new URL(pathToFileURL(f).href) }).exists()
  })
  kase('missing file url', () => thumb({ url: new URL(pathToFileURL(join(tempDir(), 'missing.jpg')).href) }).exists())
  kase('existing directory url', () => thumb({ url: new URL(pathToFileURL(tempDir()).href + '/') }).exists())
  kase('url wins over bytes', () => thumb({ url: new URL(pathToFileURL(join(tempDir(), 'nope.png')).href) }).exists())
  kase('http url', () => exceptionType(() => thumb({ url: new URL('http://example.org/a.jpg') }).exists()))
})
func('equals', () => {
  kase('same values, distinct arrays', () => eq(thumb(), thumb({ thumbnail: new Uint8Array([1, 2, 3]) })))
  kase('same instance', () => {
    const it = thumb()
    return eq(it, it)
  })
  kase('different bytes', () => eq(thumb(), thumb({ thumbnail: new Uint8Array([1, 2, 4]) })))
  kase('empty bytes', () => eq(thumb({ thumbnail: new Uint8Array([]) }), thumb({ thumbnail: new Uint8Array([]) })))
  kase('prefix bytes', () => eq(thumb(), thumb({ thumbnail: new Uint8Array([1, 2]) })))
  kase('both null bytes', () => eq(thumb({ thumbnail: null }), thumb({ thumbnail: null })))
  kase('null vs bytes', () => eq(thumb({ thumbnail: null }), thumb()))
  kase('bytes vs null', () => eq(thumb(), thumb({ thumbnail: null })))
  kase('same url', () => eq(thumb({ url: new URL('file:/a.jpg') }), thumb({ url: new URL('file:/a.jpg') })))
  kase('different url', () => eq(thumb({ url: new URL('file:/a.jpg') }), thumb({ url: new URL('file:/b.jpg') })))
  kase('url vs null', () => eq(thumb({ url: new URL('file:/a.jpg') }), thumb()))
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
  kase('null bytes hash equal', () => thumb({ thumbnail: null }).hashCode() === thumb({ thumbnail: null }).hashCode())
  kase('equal urls hash equal', () => thumb({ url: new URL('file:/a.jpg') }).hashCode() === thumb({ url: new URL('file:/a.jpg') }).hashCode())
  kase('different id change hash', () => thumb().hashCode() === thumb({ id: 'T2' }).hashCode())
})
