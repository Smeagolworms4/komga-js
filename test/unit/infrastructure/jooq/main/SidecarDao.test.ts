// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/SidecarDaoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Library } from '../../../../../src/domain/model/Library.js'
import { Sidecar } from '../../../../../src/domain/model/Sidecar.js'
import { URL } from '../../../../../src/port/java-net.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle } from '../../../oracle.js'

const { func, kase } = oracle('infrastructure/jooq/main/SidecarDao')

const db = new OracleDb()
const dao = db.sidecarDao

const sc = (
  path: string,
  parent = 'file:/lib1/series',
  time: LocalDateTime = LocalDateTime.of(2020, 5, 1, 12, 30, 15),
  type: Sidecar.Type = Sidecar.Type.ARTWORK,
  source: Sidecar.Source = Sidecar.Source.SERIES,
) => new Sidecar({ url: new URL(path), parentUrl: new URL(parent), lastModifiedTime: time, type, source })

const urls = () =>
  dao
    .findAll()
    .map((it) => [it.url.toString(), it.libraryId] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

const sortedMap = <V>(m: Map<string, V>) => new Map([...m].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))

func('findAll', () => {
  kase('empty', () => dao.findAll())
})

func('save', () => {
  kase('insert', () => {
    db.libraryDao.insert(new Library({ name: 'lib1', root: new URL('file:/lib1'), id: 'L1' }))
    db.libraryDao.insert(new Library({ name: 'lib2', root: new URL('file:/lib2'), id: 'L2' }))
    dao.save('L1', sc('file:/lib1/series/cover.jpg'))
    return dao.findAll()
  })
  kase('metadata sidecar with unicode url', () => {
    dao.save('L1', sc('file:/lib1/s%C3%A9rie/series.json', 'file:/lib1/s%C3%A9rie', undefined, Sidecar.Type.METADATA, Sidecar.Source.BOOK))
    return dao.findAll().map((it) => it.url)
  })
  kase('same url updates time, parent and library', () => {
    dao.save('L2', sc('file:/lib1/series/cover.jpg', 'file:/lib2/other', LocalDateTime.of(2021, 12, 31, 23, 59, 59, 999000000)))
    return dao.findAll()
  })
  kase('unknown library', () => exceptionType(() => dao.save('NOPE', sc('file:/x'))))
  kase('more sidecars', () => {
    for (let i = 1; i <= 5; i++) dao.save(i % 2 === 0 ? 'L1' : 'L2', sc(`file:/lib/s${i}/cover.jpg`))
    return urls()
  })
})

func('toDomain', () => {
  kase('stored values', () => db.rawQuery('select URL, PARENT_URL, LAST_MODIFIED_TIME, LIBRARY_ID from SIDECAR order by URL'))
  kase('dates', () =>
    dao
      .findAll()
      .map((it) => it.lastModifiedTime)
      .sort((a, b) => a.compareTo(b)),
  )
})

func('countGroupedByLibraryId', () => {
  kase('two libraries', () => sortedMap(dao.countGroupedByLibraryId()))
})

func('deleteByLibraryIdAndUrls', () => {
  kase('empty list', () => {
    dao.deleteByLibraryIdAndUrls('L1', [])
    return urls()
  })
  kase('url of another library is kept', () => {
    dao.deleteByLibraryIdAndUrls('L1', [new URL('file:/lib/s1/cover.jpg')])
    return urls()
  })
  kase('some urls', () => {
    dao.deleteByLibraryIdAndUrls('L2', [new URL('file:/lib/s1/cover.jpg'), new URL('file:/lib/s3/cover.jpg'), new URL('file:/missing')])
    return urls()
  })
  kase('large list over batch size', () => {
    const many = [...Array.from({ length: 2500 }, (_, i) => new URL(`file:/many/${i + 1}`)), new URL('file:/lib/s2/cover.jpg')]
    dao.deleteByLibraryIdAndUrls('L1', many)
    return urls()
  })
})

func('deleteByLibraryId', () => {
  kase('existing', () => {
    dao.deleteByLibraryId('L2')
    return urls()
  })
  kase('missing', () => {
    dao.deleteByLibraryId('NOPE')
    return dao.countGroupedByLibraryId()
  })
})

func('countGroupedByLibraryId', () => {
  kase('after deletes', () => dao.countGroupedByLibraryId())
  kase('empty', () => {
    dao.deleteByLibraryId('L1')
    return dao.countGroupedByLibraryId()
  })
})
