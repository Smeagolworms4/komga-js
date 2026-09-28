// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/ReadProgressDtoDaoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { ReadProgress } from '../../../../../src/domain/model/ReadProgress.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle } from '../../../oracle.js'
import { seed } from './nzDaoSeed.js'

const { func, kase } = oracle('infrastructure/jooq/main/ReadProgressDtoDao')

const db = new OracleDb()
const dao = db.readProgressDtoDao

func('findProgressV2BySeries', () => {
  kase('series without books', () => {
    seed(db)
    db.dsl.execute("insert into SERIES (ID, NAME, URL, FILE_LAST_MODIFIED, LIBRARY_ID) values ('S9', 'empty', 'file:/lib1/empty', '2020-01-01 00:00:00', 'L1')")
    return exceptionType(() => dao.findProgressV2BySeries('S9', 'U1'))
  })
  kase('read then in progress', () => dao.findProgressV2BySeries('S1', 'U1'))
  kase('decimal number sorts', () => dao.findProgressV2BySeries('S3', 'U1'))
  kase('no progress for user', () => dao.findProgressV2BySeries('S3', 'U2'))
  kase('all read', () => dao.findProgressV2BySeries('S6', 'U1'))
  kase('unknown user', () => dao.findProgressV2BySeries('S1', 'NOPE'))
})

func('getSeriesBooksCount', () => {
  kase('counts', () => {
    const it = dao.findProgressV2BySeries('S2', 'U1')
    return [it.booksCount, it.booksReadCount, it.booksUnreadCount, it.booksInProgressCount]
  })
})

func('booksCountToDtoV2', () => {
  kase('max number sort', () => {
    const it = dao.findProgressV2BySeries('S3', 'U3')
    return [it.lastReadContinuousNumberSort, it.maxNumberSort]
  })
})

func('readProgressCondition', () => {
  kase('other users progress ignored', () => dao.findProgressV2BySeries('S1', 'U2'))
})

func('lastRead', () => {
  kase('first book unread', () => {
    db.readProgressDao.save(new ReadProgress({ bookId: 'B3', userId: 'U3', page: 1, completed: true, readDate: LocalDateTime.of(2021, 1, 1, 0, 0) }))
    return dao.findProgressV2BySeries('S1', 'U3').lastReadContinuousNumberSort
  })
  kase('read list with gap', () => dao.findProgressByReadList('RL2', 'U1').lastReadContinuousIndex)
})

func('findProgressByReadList', () => {
  kase('first book unread', () => dao.findProgressByReadList('RL1', 'U1'))
  kase('continuous reads', () => dao.findProgressByReadList('RL2', 'U1'))
  kase('read by other user', () => dao.findProgressByReadList('RL1', 'U3'))
  kase('empty read list', () => exceptionType(() => dao.findProgressByReadList('RL3', 'U1')))
  kase('unknown user', () => dao.findProgressByReadList('RL2', 'NOPE'))
})

func('booksCountToDto', () => {
  kase('counts', () => {
    const it = dao.findProgressByReadList('RL2', 'U2')
    return [it.booksCount, it.booksReadCount, it.booksUnreadCount, it.booksInProgressCount]
  })
})
