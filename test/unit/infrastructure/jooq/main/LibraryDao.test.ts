// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/LibraryDaoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Library } from '../../../../../src/domain/model/Library.js'
import { URL } from '../../../../../src/port/java-net.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'

const { func, kase } = oracle('infrastructure/jooq/main/LibraryDao')

const db = new OracleDb()
const dao = db.libraryDao

const lib = (id: string, name: string = `lib ${id}`) => new Library({ name, root: new URL(`file:/libraries/${id}`), id })

const full = new Library({
  name: 'Bibliothèque ünïcode 漫画',
  root: new URL('file:/data/My%20Comics/'),
  importComicInfoBook: false,
  importComicInfoSeries: false,
  importComicInfoCollection: false,
  importComicInfoReadList: false,
  importComicInfoSeriesAppendVolume: false,
  importEpubBook: false,
  importEpubSeries: false,
  importMylarSeries: false,
  importLocalArtwork: false,
  importBarcodeIsbn: false,
  scanForceModifiedTime: true,
  scanOnStartup: true,
  scanInterval: Library.ScanInterval.WEEKLY,
  scanCbx: false,
  scanPdf: false,
  scanEpub: false,
  scanDirectoryExclusions: new Set(['#recycle', '@eaDir', '', 'ünï']),
  repairExtensions: true,
  convertToCbz: true,
  emptyTrashAfterScan: true,
  seriesCover: Library.SeriesCover.LAST,
  hashFiles: false,
  hashPages: true,
  hashKoreader: true,
  analyzeDimensions: false,
  oneshotsDirectory: '_oneshots',
  unavailableDate: LocalDateTime.of(2021, 3, 28, 2, 30, 15, 123456789),
  id: 'FULL',
  createdDate: LocalDateTime.of(2020, 1, 1, 0, 0),
})

func('count', () => {
  kase('empty database', () => dao.count())
})

func('findAll', () => {
  kase('empty database', () => dao.findAll())
})

func('insert', () => {
  kase('defaults', () => {
    dao.insert(lib('L1'))
    return stable(dao.findById('L1'))
  })
  kase('all fields set', () => {
    dao.insert(full)
    return stable(dao.findById('FULL'))
  })
  kase('duplicate id', () => exceptionType(() => dao.insert(lib('L1'))))
  kase('duplicate root is allowed', () => {
    dao.insert(lib('L2').copy({ root: new URL('file:/libraries/L1') }))
    return dao.count()
  })
  kase('tsid id', () => {
    dao.insert(new Library({ name: 'generated', root: new URL('file:/gen'), id: '0ABCDEFGHJKMN' }))
    return stable(dao.findByIdOrNull('0ABCDEFGHJKMN'))
  })
})

func('insertDirectoryExclusions', () => {
  kase('no exclusion', () => dao.findById('L1').scanDirectoryExclusions)
  kase('several exclusions', () => dao.findById('FULL').scanDirectoryExclusions)
})

func('findByIdOrNull', () => {
  kase('existing', () => stable(dao.findByIdOrNull('L2')))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
  kase('empty id', () => dao.findByIdOrNull(''))
  kase('case sensitive', () => dao.findByIdOrNull('l1'))
})

func('findById', () => {
  kase('existing', () => stable(dao.findById('L1')))
  kase('missing', () => dao.findById('NOPE'))
})

func('findOne', () => {
  kase('with exclusions', () => dao.findById('FULL').scanDirectoryExclusions.size)
})

func('findAll', () => {
  kase('all libraries', () => stable(dao.findAll()))
})

func('findAllByIds', () => {
  kase('empty', () => dao.findAllByIds([]))
  kase('some', () => stable(dao.findAllByIds(['L2', 'L1', 'NOPE'])))
  kase('duplicates', () => dao.findAllByIds(['L1', 'L1']).map((it) => it.id))
  kase('missing only', () => dao.findAllByIds(new Set(['X', 'Y'])))
})

func('selectBase', () => {
  kase('library without exclusion is returned once', () => dao.findAll().map((it) => it.id))
})

func('fetchAndMap', () => {
  kase('groups exclusions per library', () => dao.findAll().map((it) => [it.id, it.scanDirectoryExclusions]))
})

func('toDomain', () => {
  kase('dates in current time zone', () => {
    const l = dao.findById('FULL')
    return stable([l.createdDate, l.unavailableDate])
  })
  kase('path', () => dao.findById('FULL').path)
  kase('stored values', () => db.rawQuery("select UNAVAILABLE_DATE, SCAN_INTERVAL, HASH_FILES, ROOT from LIBRARY where ID = 'FULL'"))
})

func('update', () => {
  kase('all fields', () => {
    dao.update(
      full.copy({
        name: 'renamed',
        root: new URL('file:/other'),
        scanDirectoryExclusions: new Set(['new']),
        scanInterval: Library.ScanInterval.DISABLED,
        seriesCover: Library.SeriesCover.FIRST_UNREAD_OR_LAST,
        oneshotsDirectory: null,
        unavailableDate: null,
      }),
    )
    return stable(dao.findById('FULL'))
  })
  kase('remove exclusions', () => {
    dao.update(dao.findById('FULL').copy({ scanDirectoryExclusions: new Set() }))
    return dao.findById('FULL').scanDirectoryExclusions
  })
  kase('missing library', () => {
    dao.update(lib('NOPE'))
    return dao.findByIdOrNull('NOPE')
  })
})

func('delete', () => {
  kase('existing', () => {
    dao.delete('L2')
    return dao.findAll().map((it) => it.id)
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return dao.count()
  })
})

func('deleteAll', () => {
  kase('all', () => {
    dao.deleteAll()
    return [dao.count(), dao.findAll()]
  })
  kase('already empty', () => {
    dao.deleteAll()
    return dao.count()
  })
})
