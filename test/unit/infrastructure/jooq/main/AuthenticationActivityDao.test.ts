// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/AuthenticationActivityDaoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { AuthenticationActivity } from '../../../../../src/domain/model/AuthenticationActivity.js'
import { Direction, Order, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { sql, user } from './seed.js'

const { func, kase } = oracle('infrastructure/jooq/main/AuthenticationActivityDao')

const db = new OracleDb()
const dao = db.authenticationActivityDao

const u1 = user('U1', 'alice@example.org')
const u2 = user('U2', 'Bob@Example.org')
const ghost = user('GHOST', 'ghost@example.org')

const emails = (p: Pageable) => dao.findAll(p).content.map((it) => [it.email, it.ip, it.dateTime])

func('findAll@42', () => {
  kase('empty database, unpaged', () => dao.findAll(Pageable.unpaged()))
  kase('empty database, paged', () => dao.findAll(PageRequest.of(0, 5)))
})

func('insert', () => {
  kase('all fields', () => {
    db.komgaUserDao.insert(u1)
    db.komgaUserDao.insert(u2)
    dao.insert(
      new AuthenticationActivity({
        userId: 'U1',
        email: 'alice@example.org',
        apiKeyId: 'K1',
        apiKeyComment: 'Kobo ünïcode',
        ip: '192.168.0.1',
        userAgent: 'Mozilla/5.0',
        success: true,
        error: null,
        source: 'ApiKey',
      }),
    )
    return stable(dao.findAll(Pageable.unpaged()))
  })
  kase('failed login without user', () => {
    dao.insert(new AuthenticationActivity({ email: 'unknown@example.org', ip: '10.0.0.1', userAgent: 'curl', success: false, error: 'Bad credentials', source: 'Password' }))
    return dao.findAll(Pageable.unpaged()).totalElements
  })
  kase('only mandatory fields', () => {
    dao.insert(new AuthenticationActivity({ success: false }))
    return db.rawQuery('select USER_ID, EMAIL, API_KEY_ID, API_KEY_COMMENT, IP, USER_AGENT, SUCCESS, ERROR, SOURCE from AUTHENTICATION_ACTIVITY order by rowid')
  })
  kase('date time is not inserted', () => {
    dao.insert(new AuthenticationActivity({ userId: 'U2', email: 'bob@example.org', success: true, dateTime: LocalDateTime.of(2000, 1, 1, 0, 0), source: 'Password' }))
    return stable(db.rawQuery("select DATE_TIME >= '2001' from AUTHENTICATION_ACTIVITY order by rowid"))
  })
  kase('unknown user id', () => exceptionType(() => dao.insert(new AuthenticationActivity({ userId: 'NOPE', success: true }))))
  kase('more activities', () => {
    dao.insert(new AuthenticationActivity({ userId: 'U1', email: 'alice@example.org', ip: '192.168.0.2', success: true, source: 'Password' }))
    dao.insert(new AuthenticationActivity({ userId: null, email: 'ALICE@example.org', ip: '192.168.0.3', success: false, error: 'Bad credentials', source: 'Password' }))
    dao.insert(new AuthenticationActivity({ userId: 'U2', email: 'bob@example.org', apiKeyId: 'K2', ip: '::1', userAgent: 'KOReader', success: true, source: 'ApiKey' }))
    dao.insert(
      new AuthenticationActivity({ userId: null, email: 'Bob@Example.org', ip: '192.168.0.4', userAgent: 'Émoji 😀', success: false, error: 'Utilisateur désactivé', source: 'Password' }),
    )
    dao.insert(new AuthenticationActivity({ userId: 'U1', email: 'alice@example.org', apiKeyId: 'K1', ip: '192.168.0.5', success: true, source: 'ApiKey' }))
    // fixed, distinct dates (rowid order), far from today
    sql(db, "update AUTHENTICATION_ACTIVITY set DATE_TIME = datetime('2021-06-01 08:00:00', '+' || (rowid * 7 % 11) || ' hours')")
    return db.rawQuery('select rowid, DATE_TIME from AUTHENTICATION_ACTIVITY order by rowid')
  })
})

func('findAll@42', () => {
  kase('unpaged', () => dao.findAll(Pageable.unpaged()))
  kase('unpaged sorted', () => dao.findAll(Pageable.unpaged(Sort.by('ip'))).content.map((it) => it.ip))
  kase('first page', () => dao.findAll(PageRequest.of(0, 3)))
  kase('second page sorted by date desc', () => dao.findAll(PageRequest.of(1, 3, Sort.by(Direction.DESC, 'dateTime'))))
  kase('last partial page', () => dao.findAll(PageRequest.of(2, 3, Sort.by('dateTime'))))
  kase('page beyond the end', () => dao.findAll(PageRequest.of(10, 3, Sort.by('dateTime'))))
  kase('sorted by email', () => emails(PageRequest.of(0, 20, Sort.by('email'))))
  kase('sorted by email desc', () => emails(PageRequest.of(0, 20, Sort.by(Direction.DESC, 'email'))))
  kase('sorted by success then ip', () => emails(PageRequest.of(0, 20, Sort.by(Order.desc('success'), Order.asc('ip')))))
  kase('sorted by error', () => emails(PageRequest.of(0, 20, Sort.by('error', 'dateTime'))))
  kase('sorted by user id', () => emails(PageRequest.of(0, 20, Sort.by('userId', 'dateTime'))))
  kase('sorted by user agent desc', () => emails(PageRequest.of(0, 20, Sort.by(Direction.DESC, 'userAgent', 'dateTime'))))
  kase('unknown sort property is ignored', () => dao.findAll(PageRequest.of(0, 2, Sort.by('source'))))
  kase('unknown and known sort properties', () => emails(PageRequest.of(0, 20, Sort.by('nope', 'dateTime'))))
})

func('findAllByUser', () => {
  kase('by id or email', () => dao.findAllByUser(u1, Pageable.unpaged()))
  kase('email is case sensitive', () => dao.findAllByUser(u2, PageRequest.of(0, 10, Sort.by('dateTime'))))
  kase('paged', () => dao.findAllByUser(u1, PageRequest.of(1, 1, Sort.by(Direction.DESC, 'dateTime'))))
  kase('user without activity', () => dao.findAllByUser(ghost, Pageable.unpaged()))
  kase('unknown id but known email', () => dao.findAllByUser(user('NOPE', 'bob@example.org'), Pageable.unpaged()).content.map((it) => it.ip))
})

func('findAll@69', () => {
  kase('count with a condition', () => {
    const it = dao.findAllByUser(u2, PageRequest.of(0, 1))
    return [it.totalElements, it.totalPages, it.content.length]
  })
  kase('unpaged size is at least 20', () => dao.findAllByUser(u1, Pageable.unpaged()).size)
})

func('findMostRecentByUser', () => {
  kase('without api key', () => dao.findMostRecentByUser(u1, null))
  kase('with api key', () => dao.findMostRecentByUser(u1, 'K1'))
  kase('with unknown api key', () => dao.findMostRecentByUser(u1, 'NOPE'))
  kase('api key of another user', () => dao.findMostRecentByUser(u1, 'K2'))
  kase('second user', () => dao.findMostRecentByUser(u2, null))
  kase('user without activity', () => dao.findMostRecentByUser(ghost, null))
  kase('user without activity with api key', () => dao.findMostRecentByUser(ghost, 'K1'))
})

func('toDomain', () => {
  kase('date time in current time zone', () => dao.findAll(PageRequest.of(0, 20, Sort.by('dateTime'))).content.map((it) => it.dateTime))
  kase('stored values', () => db.rawQuery('select USER_ID, SUCCESS, DATE_TIME, SOURCE from AUTHENTICATION_ACTIVITY order by DATE_TIME'))
})

func('deleteOlderThan', () => {
  kase('nothing older', () => {
    dao.deleteOlderThan(LocalDateTime.of(2000, 1, 1, 0, 0))
    return dao.findAll(Pageable.unpaged()).totalElements
  })
  kase('some older', () => {
    dao.deleteOlderThan(LocalDateTime.of(2021, 6, 1, 12, 0))
    return db.rawQuery('select DATE_TIME from AUTHENTICATION_ACTIVITY order by DATE_TIME')
  })
  kase('boundary is exclusive', () => {
    dao.deleteOlderThan(LocalDateTime.of(2021, 6, 1, 13, 0))
    return db.rawQuery('select DATE_TIME from AUTHENTICATION_ACTIVITY order by DATE_TIME')
  })
})

func('deleteByUser', () => {
  kase('user without activity', () => {
    dao.deleteByUser(ghost)
    return dao.findAll(Pageable.unpaged()).totalElements
  })
  kase('by id or email', () => {
    dao.deleteByUser(u2)
    return db.rawQuery('select USER_ID, EMAIL from AUTHENTICATION_ACTIVITY order by DATE_TIME')
  })
  kase('all', () => {
    dao.deleteByUser(u1)
    dao.deleteByUser(user('X', 'ALICE@example.org'))
    return dao.findAll(Pageable.unpaged())
  })
})
