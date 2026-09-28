// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/UserControllerOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { ApiKey } from '../../../../../src/domain/model/ApiKey.js'
import { AuthenticationActivity } from '../../../../../src/domain/model/AuthenticationActivity.js'
import { DuplicateNameException, UserEmailAlreadyExistsException } from '../../../../../src/domain/model/Exceptions.js'
import type { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import type { KomgaUserLifecycle } from '../../../../../src/domain/service/KomgaUserLifecycle.js'
import { UserController } from '../../../../../src/interfaces/api/rest/UserController.js'
import { ApiKeyRequestDto } from '../../../../../src/interfaces/api/rest/dto/ApiKeyRequestDto.js'
import { PasswordUpdateDto } from '../../../../../src/interfaces/api/rest/dto/PasswordUpdateDto.js'
import { UserCreationDto } from '../../../../../src/interfaces/api/rest/dto/UserCreationDto.js'
import { UserUpdateDto } from '../../../../../src/interfaces/api/rest/dto/UserUpdateDto.js'
import { Order, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { Environment } from '../../../../../src/port/spring.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { Calls, FIXED, fixNow, principal, read, sql, user } from './rest-oracle.js'
import * as samples from './rest-samples.js'

const { func, kase } = oracle('interfaces/api/rest/UserController')

const db = new OracleDb()
const calls = new Calls()

/** Enregistre les appels, répond comme le faux côté Kotlin */
const lifecycle = {
  updatePassword: (u: KomgaUser, password: string, expire: boolean) => calls.add('updatePassword', u.id, password, expire),
  createUser: (u: KomgaUser) => {
    calls.add('createUser', u)
    if (u.email === 'dup@example.org') throw new UserEmailAlreadyExistsException('exists', 'ERR_EXISTS')
    return u
  },
  deleteUser: (u: KomgaUser) => calls.add('deleteUser', u.id),
  updateUser: (u: KomgaUser) => calls.add('updateUser', u),
  createApiKey: (u: KomgaUser, comment: string) => {
    calls.add('createApiKey', u.id, comment)
    if (comment === 'dup') throw new DuplicateNameException('duplicate', 'ERR_1034')
    if (comment === 'none') return null
    return new ApiKey({ id: `K-${comment}`, userId: u.id, key: 'KEYVALUE', comment, createdDate: FIXED })
  },
} as unknown as KomgaUserLifecycle

const controller = (demo = false) =>
  new UserController(lifecycle, db.komgaUserDao, db.libraryDao, db.authenticationActivityDao, new Environment({ env: {}, profiles: demo ? ['demo'] : [] }))

const c = controller()
const demo = controller(true)
const admin = principal(samples.admin)
const all = principal(samples.all)
const creation = (src: string) => read<UserCreationDto>(src, { class: UserCreationDto })
const update = (src: string) => read<UserUpdateDto>(src, { class: UserUpdateDto })
const pwd = (password: string) => new PasswordUpdateDto({ password })
const apiKey = (comment: string) => new ApiKeyRequestDto({ comment })

const activity = (u: KomgaUser | null, day: number, success: boolean, apiKeyId: string | null = null) =>
  new AuthenticationActivity({
    userId: u?.id ?? null,
    email: u?.email ?? null,
    apiKeyId,
    ip: `10.0.0.${day}`,
    userAgent: 'agent',
    success,
    error: success ? null : 'bad',
    dateTime: LocalDateTime.of(2021, 3, day, 12, 0),
    source: 'Password',
  })

func('getCurrentUser', () => {
  kase('admin', () => c.getCurrentUser(admin, null))
  kase('remember me', () => c.getCurrentUser(principal(samples.kids), true))
})
func('getUsers', () => {
  kase('empty', () => c.getUsers())
  kase('seeded', () => {
    samples.seed(db)
    return c.getUsers()
  })
})
func('updatePasswordForCurrentUser', () => {
  kase('ok', () => {
    c.updatePasswordForCurrentUser(all, pwd('newpass'))
    return calls.take()
  })
  kase('email case insensitive', () => {
    c.updatePasswordForCurrentUser(principal(samples.all.copy({ email: 'ALL@EXAMPLE.ORG' })), pwd('x'))
    return calls.take()
  })
  kase('unknown user', async () => [await exceptionType(() => c.updatePasswordForCurrentUser(principal(user('NOPE')), pwd('x'))), calls.take()])
  kase('demo', () => demo.updatePasswordForCurrentUser(admin, pwd('x')))
})
func('addUser', () => {
  kase('minimal', () => [stable(c.addUser(creation('{"email":"new@example.org","password":"p"}'))), calls.take()])
  kase('roles, unknown ignored', () => [stable(c.addUser(creation('{"email":"r@example.org","password":"p","roles":["PAGE_STREAMING","NOPE","ADMIN"]}'))), calls.take()])
  kase('restricted libraries, unknown filtered', () => [
    stable(c.addUser(creation('{"email":"s@example.org","password":"p","sharedLibraries":{"all":false,"libraryIds":["L2","LX"]}}'))),
    calls.take(),
  ])
  kase('shared all', () => stable(c.addUser(creation('{"email":"a@example.org","password":"p","sharedLibraries":{"all":true,"libraryIds":["L2"]}}'))))
  kase('restrictions', () => [
    stable(
      c.addUser(creation('{"email":"k@example.org","password":"p","ageRestriction":{"age":12,"restriction":"EXCLUDE"},"labelsAllow":["b","a"],"labelsExclude":["x"]}')),
    ),
    calls.take(),
  ])
  kase('age restriction NONE', () => stable(c.addUser(creation('{"email":"n@example.org","password":"p","ageRestriction":{"age":12,"restriction":"NONE"}}'))))
  kase('duplicate email', () => [c.addUser(creation('{"email":"dup@example.org","password":"p"}')), calls.take()])
})
func('deleteUserById', () => {
  kase('existing', () => {
    c.deleteUserById('KIDS', admin)
    return calls.take()
  })
  kase('unknown', () => [c.deleteUserById('NOPE', admin), calls.take()])
})
func('updateUserById', () => {
  kase('empty patch', () => {
    c.updateUserById('NOADULT', update('{}'), admin)
    return calls.take()
  })
  kase('roles and libraries', () => {
    c.updateUserById('NOADULT', update('{"roles":["FILE_DOWNLOAD","BAD"],"sharedLibraries":{"all":false,"libraryIds":["L1","LX"]}}'), admin)
    return calls.take()
  })
  kase('shared all clears ids', () => {
    c.updateUserById('L1ONLY', update('{"sharedLibraries":{"all":true,"libraryIds":["L1"]}}'), admin)
    return calls.take()
  })
  kase('restrictions set', () => {
    c.updateUserById('ALL', update('{"ageRestriction":{"age":16,"restriction":"ALLOW_ONLY"},"labelsAllow":["a"],"labelsExclude":["b"]}'), admin)
    return calls.take()
  })
  kase('restrictions cleared with null', () => {
    c.updateUserById('KIDS', update('{"ageRestriction":null,"labelsAllow":null,"labelsExclude":null}'), admin)
    return calls.take()
  })
  kase('age restriction NONE', () => {
    c.updateUserById('KIDS', update('{"ageRestriction":{"age":3,"restriction":"NONE"}}'), admin)
    return calls.take()
  })
  kase('roles null', async () => [await exceptionType(() => c.updateUserById('ALL', update('{"roles":null}'), admin)), calls.take()])
  kase('unknown', () => [c.updateUserById('NOPE', update('{}'), admin), calls.take()])
})
func('updatePasswordByUserId', () => {
  kase('admin for other', () => {
    c.updatePasswordByUserId('ALL', admin, pwd('p2'))
    return calls.take()
  })
  kase('self', () => {
    c.updatePasswordByUserId('ALL', all, pwd('p3'))
    return calls.take()
  })
  kase('unknown', () => c.updatePasswordByUserId('NOPE', admin, pwd('p')))
  kase('demo', () => demo.updatePasswordByUserId('ALL', admin, pwd('p')))
})
func('getAuthenticationActivityForCurrentUser', () => {
  kase('empty', () => c.getAuthenticationActivityForCurrentUser(all, false, PageRequest.of(0, 20)))
  kase('default sort dateTime desc', () => {
    db.authenticationActivityDao.insert(activity(samples.all, 1, true))
    db.authenticationActivityDao.insert(activity(samples.all, 3, false))
    db.authenticationActivityDao.insert(activity(samples.all, 2, true, 'K1'))
    db.authenticationActivityDao.insert(activity(samples.admin, 4, true))
    db.authenticationActivityDao.insert(activity(null, 5, false))
    sql(db, "update AUTHENTICATION_ACTIVITY set DATE_TIME = '2021-03-0' || substr(IP, 8, 1) || ' 12:00:00'")
    return c.getAuthenticationActivityForCurrentUser(all, false, PageRequest.of(0, 20))
  })
  kase('sorted by ip asc', () => c.getAuthenticationActivityForCurrentUser(all, false, PageRequest.of(0, 20, Sort.by('ip'))))
  kase('paged', () => c.getAuthenticationActivityForCurrentUser(all, false, PageRequest.of(1, 2)))
  kase('unpaged keeps sort', () => c.getAuthenticationActivityForCurrentUser(all, true, PageRequest.of(1, 1, Sort.by(Order.asc('success'), Order.desc('dateTime')))))
  kase('unpaged default sort', () => c.getAuthenticationActivityForCurrentUser(all, true, Pageable.unpaged()))
  kase('demo non admin', () => demo.getAuthenticationActivityForCurrentUser(all, false, PageRequest.of(0, 20)))
  kase('demo admin', () => demo.getAuthenticationActivityForCurrentUser(admin, false, PageRequest.of(0, 20)))
})
func('getAuthenticationActivity', () => {
  kase('all', () => c.getAuthenticationActivity(false, PageRequest.of(0, 20)))
  kase('sorted by email', () => c.getAuthenticationActivity(false, PageRequest.of(0, 3, Sort.by(Order.desc('email')))))
  kase('unpaged', () => c.getAuthenticationActivity(true, PageRequest.of(0, 1)))
})
func('getLatestAuthenticationActivityByUserId', () => {
  kase('latest', () => c.getLatestAuthenticationActivityByUserId('ALL', all, null))
  kase('by api key', () => c.getLatestAuthenticationActivityByUserId('ALL', all, 'K1'))
  kase('unknown api key', () => c.getLatestAuthenticationActivityByUserId('ALL', all, 'K9'))
  kase('no activity', () => c.getLatestAuthenticationActivityByUserId('KIDS', admin, null))
  kase('unknown user', () => c.getLatestAuthenticationActivityByUserId('NOPE', admin, null))
})
func('getApiKeysForCurrentUser', () => {
  kase('none', () => c.getApiKeysForCurrentUser(all))
  kase('redacted', () => {
    db.komgaUserDao.insert(new ApiKey({ id: 'K1', userId: 'ALL', key: 'secret1', comment: 'one', createdDate: LocalDateTime.of(2021, 1, 1, 0, 0) }))
    db.komgaUserDao.insert(new ApiKey({ id: 'K2', userId: 'ALL', key: 'secret2', comment: 'two', createdDate: LocalDateTime.of(2021, 7, 1, 0, 0) }))
    db.komgaUserDao.insert(new ApiKey({ id: 'K3', userId: 'ADMIN', key: 'secret3', comment: 'admin', createdDate: LocalDateTime.of(2021, 1, 1, 0, 0) }))
    fixNow(db)
    return c.getApiKeysForCurrentUser(all)
  })
  kase('demo non admin', () => demo.getApiKeysForCurrentUser(all))
  kase('demo admin', () => demo.getApiKeysForCurrentUser(admin))
})
func('createApiKeyForCurrentUser', () => {
  kase('created, not redacted', () => [c.createApiKeyForCurrentUser(all, apiKey('new')), calls.take()])
  kase('duplicate', () => [c.createApiKeyForCurrentUser(all, apiKey('dup')), calls.take()])
  kase('generation failed', () => [c.createApiKeyForCurrentUser(all, apiKey('none')), calls.take()])
  kase('demo non admin', () => [demo.createApiKeyForCurrentUser(all, apiKey('x')), calls.take()])
  kase('demo admin', () => [demo.createApiKeyForCurrentUser(admin, apiKey('x')), calls.take()])
})
func('deleteApiKeyByKeyId', () => {
  kase('own key', () => {
    c.deleteApiKeyByKeyId(all, 'K1')
    return db.komgaUserDao.findApiKeyByUserId('ALL').map((it) => it.id)
  })
  kase('other user\'s key', () => [c.deleteApiKeyByKeyId(all, 'K3'), db.komgaUserDao.findApiKeyByUserId('ADMIN').map((it) => it.id)])
  kase('unknown key', () => c.deleteApiKeyByKeyId(all, 'K1'))
})
