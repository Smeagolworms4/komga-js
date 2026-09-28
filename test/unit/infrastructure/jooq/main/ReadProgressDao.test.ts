// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ReadProgressDaoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { R2Locator } from '../../../../../src/domain/model/R2Locator.js'
import { ReadProgress } from '../../../../../src/domain/model/ReadProgress.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/ReadProgressDao')

const db = new OracleDb()
const dao = db.readProgressDao

const keys = (l: ReadProgress[]) => l.map((it) => `${it.bookId}/${it.userId}/${it.page}/${it.completed}`).sort()
const series = () =>
  db.rawQuery('select SERIES_ID, USER_ID, READ_COUNT, IN_PROGRESS_COUNT, MOST_RECENT_READ_DATE from READ_PROGRESS_SERIES order by SERIES_ID, USER_ID')

const locator = new R2Locator({
  href: 'chapter1.xhtml',
  type: 'application/xhtml+xml',
  title: 'Chapitre ünï',
  locations: new R2Locator.Location({ fragments: ['#p1'], progression: 0.25, position: 12, totalProgression: 0.1 }),
  text: new R2Locator.Text({ before: 'a', highlight: 'b' }),
  koboSpan: 'kobo.1.1',
})

const rp = (bookId: string, userId: string, page: number, completed: boolean, readDate: LocalDateTime, deviceId = '', deviceName = '', loc: R2Locator | null = null) =>
  new ReadProgress({ bookId, userId, page, completed, readDate, deviceId, deviceName, locator: loc })

func('findAll', () => {
  kase('empty', () => dao.findAll())
  kase('seeded', () => {
    seed(db)
    return keys(dao.findAll())
  })
})

func('findByBookIdAndUserIdOrNull', () => {
  kase('all fields', () => dao.findByBookIdAndUserIdOrNull('B2', 'U1'))
  kase('missing', () => dao.findByBookIdAndUserIdOrNull('B2', 'U2'))
})

func('toDomain', () => {
  kase('dates converted to current time zone', () => {
    const it = dao.findByBookIdAndUserIdOrNull('B1', 'U2')!
    return [it.readDate, it.createdDate, it.lastModifiedDate]
  })
  kase('stored values', () =>
    db.rawQuery('select BOOK_ID, USER_ID, PAGE, COMPLETED, READ_DATE, DEVICE_ID, DEVICE_NAME, LOCATOR from READ_PROGRESS order by BOOK_ID, USER_ID'),
  )
})

func('findAllByUserId', () => {
  kase('U2', () => keys(dao.findAllByUserId('U2')))
  kase('unknown', () => dao.findAllByUserId('NOPE'))
})

func('findAllByBookId', () => {
  kase('B1', () => keys(dao.findAllByBookId('B1')))
  kase('unread', () => dao.findAllByBookId('B9'))
})

func('findAllByBookIdsAndUserId', () => {
  kase('some', () => keys(dao.findAllByBookIdsAndUserId(['B1', 'B2', 'B6', 'NOPE'], 'U1')))
  kase('empty', () => dao.findAllByBookIdsAndUserId([], 'U1'))
})

func('aggregateSeriesProgress@185', () => {
  kase('seeded aggregation', () => series())
})

func('save@79', () => {
  kase('new progress with locator', () => {
    dao.save(rp('B3', 'U1', 2, false, LocalDateTime.of(2021, 6, 15, 23, 30, 0, 123000000), 'd2', 'Tablette', locator))
    return [stable(dao.findByBookIdAndUserIdOrNull('B3', 'U1')), series()]
  })
  kase('update existing', () => {
    dao.save(rp('B3', 'U1', 3, true, LocalDateTime.of(2021, 7, 1, 8, 0), 'd3', 'Phone'))
    return [stable(dao.findByBookIdAndUserIdOrNull('B3', 'U1')), series()]
  })
  kase('unknown book', () => exceptionType(() => dao.save(rp('NOPE', 'U1', 1, false, LocalDateTime.of(2021, 1, 1, 0, 0)))))
  kase('unknown user', () => exceptionType(() => dao.save(rp('B1', 'NOPE', 1, false, LocalDateTime.of(2021, 1, 1, 0, 0)))))
})

func('toQuery', () => {
  kase('locator is stored compressed', () => db.rawQuery("select LOCATOR is not null, DEVICE_NAME from READ_PROGRESS where BOOK_ID = 'B3' order by USER_ID"))
})

func('save@85', () => {
  kase('several users', () => {
    dao.save([
      rp('B5', 'U2', 1, true, LocalDateTime.of(2021, 8, 1, 0, 0)),
      rp('B6', 'U3', 1, false, LocalDateTime.of(2021, 8, 2, 0, 0), '', '', locator),
      rp('B6', 'U2', 4, true, LocalDateTime.of(2021, 8, 3, 0, 0)),
    ])
    return [keys(dao.findAll()), series()]
  })
  kase('empty', () => {
    dao.save([])
    return dao.findAll().length
  })
  kase('locator read back', () => dao.findByBookIdAndUserIdOrNull('B6', 'U3')!.locator)
})

func('aggregateSeriesProgress@197', () => {
  kase('after saves', () => series())
})

func('delete', () => {
  kase('existing', () => {
    dao.delete('B1', 'U1')
    return [keys(dao.findAllByUserId('U1')), series()]
  })
  kase('missing', () => {
    dao.delete('B9', 'U1')
    return series()
  })
})

func('deleteByBookId', () => {
  kase('existing', () => {
    dao.deleteByBookId('B6')
    return [keys(dao.findAll()), series()]
  })
})

func('deleteByBookIds', () => {
  kase('empty', () => {
    dao.deleteByBookIds([])
    return dao.findAll().length
  })
  kase('large list', () => {
    dao.deleteByBookIds([...Array.from({ length: 1300 }, (_, i) => `X${i + 1}`), 'B4', 'B7'])
    return [keys(dao.findAll()), series()]
  })
})

func('deleteByBookIdsAndUserId', () => {
  kase('only for user', () => {
    dao.save(rp('B2', 'U2', 1, false, LocalDateTime.of(2021, 9, 1, 0, 0)))
    dao.deleteByBookIdsAndUserId(['B2', 'B3'], 'U1')
    return [keys(dao.findAll()), series()]
  })
})

func('deleteBySeriesIds', () => {
  kase('only series aggregation', () => {
    dao.deleteBySeriesIds(['S1', 'NOPE'])
    return [keys(dao.findAll()), series()]
  })
})

func('deleteByUserId', () => {
  kase('existing', () => {
    dao.deleteByUserId('U2')
    return [keys(dao.findAll()), series()]
  })
})

func('deleteAll', () => {
  kase('all', () => {
    dao.deleteAll()
    return [dao.findAll(), series()]
  })
})
