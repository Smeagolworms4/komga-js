// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/KomgaUserDaoOracleTest.kt
import { AgeRestriction, AllowExclude } from '../../../../../src/domain/model/AgeRestriction.js'
import { ApiKey } from '../../../../../src/domain/model/ApiKey.js'
import { ContentRestrictions } from '../../../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import { UserRoles } from '../../../../../src/domain/model/UserRoles.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { T0, library, sql, user } from './seed.js'

const { func, kase } = oracle('infrastructure/jooq/main/KomgaUserDao')

const db = new OracleDb()
const dao = db.komgaUserDao

const admin = new KomgaUser({
  email: 'Admin@Example.org',
  password: '$2a$10$hash',
  roles: new Set(UserRoles.entries()),
  sharedLibrariesIds: new Set(['L2', 'L1']),
  sharedAllLibraries: false,
  restrictions: new ContentRestrictions({
    ageRestriction: new AgeRestriction({ age: 16, restriction: AllowExclude.ALLOW_ONLY }),
    labelsAllow: new Set(['Kids', 'ÜNÏ', 'adult']),
    labelsExclude: new Set(['Adult', ' ']),
  }),
  id: 'U2',
  createdDate: T0,
})

const restricted = new KomgaUser({
  email: 'Élodie@Exemple.fr',
  password: 'p',
  roles: new Set(),
  sharedLibrariesIds: new Set(['L3']),
  sharedAllLibraries: false,
  restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 0, restriction: AllowExclude.EXCLUDE }), labelsExclude: new Set(['gore']) }),
  id: 'U3',
  createdDate: T0,
})

const key = (id: string, userId: string, k: string, comment: string) => new ApiKey({ id, userId, key: k, comment, createdDate: T0 })

const users = () => stable([...dao.findAll()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
const counts = () =>
  db.rawQuery(
    'select (select count(*) from USER_API_KEY), (select count(*) from ANNOUNCEMENTS_READ), (select count(*) from USER_SHARING), (select count(*) from USER_LIBRARY_SHARING), (select count(*) from USER_ROLE)',
  )

func('count', () => {
  kase('empty', () => dao.count())
})

func('findAll', () => {
  kase('empty', () => dao.findAll())
})

func('insert@104', () => {
  kase('defaults', () => {
    for (const it of [1, 2, 3]) db.libraryDao.insert(library(`L${it}`))
    dao.insert(user('U1'))
    return stable(dao.findByIdOrNull('U1'))
  })
  kase('all fields', () => {
    dao.insert(admin)
    return stable(dao.findByIdOrNull('U2'))
  })
  kase('exclude restriction without roles', () => {
    dao.insert(restricted)
    return stable(dao.findByIdOrNull('U3'))
  })
  kase('duplicate id', () => exceptionType(() => dao.insert(user('U1', 'other@example.org'))))
  kase('duplicate email', () => exceptionType(() => dao.insert(user('U9', 'U1@example.org'))))
  kase('email unique constraint is case sensitive', () => {
    dao.insert(user('U4', 'u1@EXAMPLE.org'))
    return dao.count()
  })
  kase('unknown shared library', () => exceptionType(() => dao.insert(user('U5').copy({ sharedLibrariesIds: new Set(['NOPE']) }))))
  kase('after a failed insert', () => db.rawQuery('select ID, EMAIL from USER order by ID'))
})

func('insertRoles', () => {
  kase('rows', () => db.rawQuery('select USER_ID, ROLE from USER_ROLE order by USER_ID, ROLE'))
})

func('insertSharedLibraries', () => {
  kase('rows', () => db.rawQuery('select USER_ID, LIBRARY_ID from USER_LIBRARY_SHARING order by USER_ID, LIBRARY_ID'))
})

func('insertSharingRestrictions', () => {
  kase('rows', () => db.rawQuery('select USER_ID, ALLOW, LABEL from USER_SHARING order by USER_ID, ALLOW, LABEL'))
  kase('stored user values', () => db.rawQuery('select ID, SHARED_ALL_LIBRARIES, AGE_RESTRICTION, AGE_RESTRICTION_ALLOW_ONLY from USER order by ID'))
})

func('findAll', () => {
  kase('all users', () => users())
})

func('findByIdOrNull', () => {
  kase('existing', () => stable(dao.findByIdOrNull('U3')))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
  kase('case sensitive', () => dao.findByIdOrNull('u1'))
})

func('selectBase', () => {
  kase('one user per shared library set', () =>
    [...dao.findAll()].map((it) => [it.id, it.sharedLibrariesIds] as const).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
  )
})

func('fetchAndMap', () => {
  kase('unknown stored role is ignored', () => {
    sql(db, "insert into USER_ROLE (USER_ID, ROLE) values ('U1', 'SUPERUSER'), ('U1', 'admin')")
    return dao.findByIdOrNull('U1')!.roles
  })
  kase('age restriction without allow only flag', () => {
    sql(db, "update USER set AGE_RESTRICTION = 12, AGE_RESTRICTION_ALLOW_ONLY = null where ID = 'U4'")
    return dao.findByIdOrNull('U4')!.restrictions
  })
  kase('allow only flag without age', () => {
    sql(db, "update USER set AGE_RESTRICTION = null, AGE_RESTRICTION_ALLOW_ONLY = 1 where ID = 'U4'")
    return dao.findByIdOrNull('U4')!.restrictions
  })
  kase('stored labels are not normalized', () => {
    sql(db, "insert into USER_SHARING (USER_ID, ALLOW, LABEL) values ('U4', 1, 'Mixed Case'), ('U4', 0, 'Mixed Case')")
    const it = dao.findByIdOrNull('U4')!.restrictions
    return [it.labelsAllow, it.labelsExclude]
  })
  kase('dates in current time zone', () => {
    sql(db, "update USER set CREATED_DATE = '2020-03-29 01:30:00', LAST_MODIFIED_DATE = '2020-10-25 00:30:00' where ID = 'U4'")
    const it = dao.findByIdOrNull('U4')!
    return [it.createdDate, it.lastModifiedDate]
  })
})

func('insert@126', () => {
  kase('api key', () => {
    dao.insert(key('K1', 'U1', 'secret-key-1', 'Kobo'))
    return stable(dao.findApiKeyByUserId('U1'))
  })
  kase('several keys', () => {
    dao.insert(key('K2', 'U2', 'secret-key-2', 'Ünïcode Commentaire'))
    dao.insert(key('K3', 'U2', 'secret-key-3', ''))
    return dao.findApiKeyByUserId('U2').map((it) => it.id)
  })
  kase('duplicate key value', () => exceptionType(() => dao.insert(key('K4', 'U2', 'secret-key-2', 'dup'))))
  kase('duplicate id', () => exceptionType(() => dao.insert(key('K1', 'U2', 'other', 'dup'))))
  kase('unknown user', () => exceptionType(() => dao.insert(key('K5', 'NOPE', 'k5', 'c'))))
  kase('generated dates', () => {
    dao.insert(new ApiKey({ id: 'K6', userId: 'U3', key: 'secret-key-6', comment: 'now' }))
    return stable(dao.findApiKeyByUserId('U3'))
  })
})

func('findApiKeyByUserId', () => {
  kase('user with keys', () => stable(dao.findApiKeyByUserId('U2')))
  kase('user without key', () => dao.findApiKeyByUserId('U4'))
  kase('missing user', () => dao.findApiKeyByUserId('NOPE'))
})

func('toDomain', () => {
  kase('stored api key dates', () => {
    sql(db, "update USER_API_KEY set CREATED_DATE = '2021-07-01 12:00:00', LAST_MODIFIED_DATE = '2021-12-01 12:00:00' where ID = 'K6'")
    return dao.findApiKeyByUserId('U3')
  })
})

func('existsApiKeyByIdAndUserId', () => {
  kase('existing', () => dao.existsApiKeyByIdAndUserId('K1', 'U1'))
  kase('other user', () => dao.existsApiKeyByIdAndUserId('K1', 'U2'))
  kase('missing', () => dao.existsApiKeyByIdAndUserId('NOPE', 'U1'))
  kase('case sensitive id', () => dao.existsApiKeyByIdAndUserId('k1', 'U1'))
})

func('existsApiKeyByCommentAndUserId', () => {
  kase('exact', () => dao.existsApiKeyByCommentAndUserId('Kobo', 'U1'))
  kase('ignore ascii case', () => dao.existsApiKeyByCommentAndUserId('kOBO', 'U1'))
  kase('unicode case', () => dao.existsApiKeyByCommentAndUserId('üNÏCODE COMMENTAIRE', 'U2'))
  kase('unicode same case', () => dao.existsApiKeyByCommentAndUserId('Ünïcode commentaire', 'U2'))
  kase('empty comment', () => dao.existsApiKeyByCommentAndUserId('', 'U2'))
  kase('other user', () => dao.existsApiKeyByCommentAndUserId('Kobo', 'U2'))
})

func('existsByEmailIgnoreCase', () => {
  kase('exact', () => dao.existsByEmailIgnoreCase('Admin@Example.org'))
  kase('ignore ascii case', () => dao.existsByEmailIgnoreCase('ADMIN@EXAMPLE.ORG'))
  kase('unicode case', () => dao.existsByEmailIgnoreCase('élodie@exemple.fr'))
  kase('unicode same case', () => dao.existsByEmailIgnoreCase('Élodie@exemple.FR'))
  kase('missing', () => dao.existsByEmailIgnoreCase('nobody@example.org'))
  kase('empty', () => dao.existsByEmailIgnoreCase(''))
  kase('like wildcard is literal', () => dao.existsByEmailIgnoreCase('%@example.org'))
})

func('findByEmailIgnoreCaseOrNull', () => {
  kase('ignore ascii case', () => stable(dao.findByEmailIgnoreCaseOrNull('admin@example.ORG')))
  kase('several matches', () => dao.findByEmailIgnoreCaseOrNull('U1@example.org')?.id ?? null)
  kase('unicode case', () => dao.findByEmailIgnoreCaseOrNull('élodie@exemple.fr'))
  kase('missing', () => dao.findByEmailIgnoreCaseOrNull('nobody@example.org'))
})

func('findByApiKeyOrNull', () => {
  kase('existing', () => stable(dao.findByApiKeyOrNull('secret-key-2')))
  kase('user with several keys and libraries', () => {
    const it = dao.findByApiKeyOrNull('secret-key-3')
    return it === null ? null : [it[0].id, it[0].sharedLibrariesIds, it[1].id]
  })
  kase('missing', () => dao.findByApiKeyOrNull('NOPE'))
  kase('case sensitive', () => dao.findByApiKeyOrNull('SECRET-KEY-1'))
  kase('empty', () => dao.findByApiKeyOrNull(''))
})

func('saveAnnouncementIdsRead', () => {
  kase('several', () => {
    dao.saveAnnouncementIdsRead(admin, new Set(['https://komga.org/blog/b', 'https://komga.org/blog/a']))
    return dao.findAnnouncementIdsReadByUserId('U2')
  })
  kase('already read are ignored', () => {
    dao.saveAnnouncementIdsRead(admin, new Set(['https://komga.org/blog/a', 'ünïcode']))
    return dao.findAnnouncementIdsReadByUserId('U2')
  })
  kase('empty', () => {
    dao.saveAnnouncementIdsRead(admin, new Set())
    return dao.findAnnouncementIdsReadByUserId('U2').size
  })
  kase('other user', () => {
    dao.saveAnnouncementIdsRead(user('U1'), new Set(['https://komga.org/blog/a']))
    return dao.findAnnouncementIdsReadByUserId('U1')
  })
  kase('unknown user', () => exceptionType(() => dao.saveAnnouncementIdsRead(user('NOPE'), new Set(['x']))))
})

func('findAnnouncementIdsReadByUserId', () => {
  kase('user without announcement', () => dao.findAnnouncementIdsReadByUserId('U3'))
  kase('missing user', () => dao.findAnnouncementIdsReadByUserId('NOPE'))
})

func('update', () => {
  kase('all fields', () => {
    dao.update(
      admin.copy({
        email: 'new@example.org',
        password: 'new',
        roles: new Set([UserRoles.KOBO_SYNC]),
        sharedLibrariesIds: new Set(['L3']),
        sharedAllLibraries: true,
        restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 18, restriction: AllowExclude.EXCLUDE }), labelsAllow: new Set(['x']) }),
      }),
    )
    return stable(dao.findByIdOrNull('U2'))
  })
  kase('remove restrictions', () => {
    dao.update(dao.findByIdOrNull('U2')!.copy({ restrictions: new ContentRestrictions(), roles: new Set(), sharedLibrariesIds: new Set() }))
    return stable(dao.findByIdOrNull('U2'))
  })
  kase('created date is kept', () => stable(dao.findByIdOrNull('U2')!.createdDate))
  kase('api keys and announcements are kept', () => [dao.findApiKeyByUserId('U2').length, dao.findAnnouncementIdsReadByUserId('U2').size])
  kase('duplicate email', () => exceptionType(() => dao.update(dao.findByIdOrNull('U2')!.copy({ email: 'U1@example.org' }))))
  kase('missing user', () => exceptionType(() => dao.update(user('NOPE'))))
  kase('missing user without roles', () => {
    dao.update(user('NOPE').copy({ roles: new Set() }))
    return dao.findByIdOrNull('NOPE')
  })
})

func('deleteApiKeyByIdAndUserId', () => {
  kase('other user', () => {
    dao.deleteApiKeyByIdAndUserId('K1', 'U2')
    return dao.findApiKeyByUserId('U1').length
  })
  kase('existing', () => {
    dao.deleteApiKeyByIdAndUserId('K1', 'U1')
    return dao.findApiKeyByUserId('U1').length
  })
})

func('deleteApiKeyByUserId', () => {
  kase('missing user', () => {
    dao.deleteApiKeyByUserId('NOPE')
    return db.rawQuery('select count(*) from USER_API_KEY')
  })
  kase('existing', () => {
    dao.deleteApiKeyByUserId('U2')
    return db.rawQuery('select ID from USER_API_KEY order by ID')
  })
})

func('delete', () => {
  kase('user with everything', () => {
    dao.insert(key('K7', 'U3', 'k7', 'c'))
    dao.saveAnnouncementIdsRead(restricted, new Set(['a']))
    dao.delete('U3')
    return [dao.findByIdOrNull('U3'), dao.count(), counts()]
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return dao.count()
  })
  kase('user with authentication activity', () =>
    exceptionType(() => {
      sql(db, "insert into AUTHENTICATION_ACTIVITY (USER_ID, SUCCESS) values ('U4', 1)")
      dao.delete('U4')
    }),
  )
})

func('deleteAll', () => {
  kase('with authentication activity', async () => [await exceptionType(() => dao.deleteAll()), dao.count()])
  kase('all', () => {
    sql(db, 'delete from AUTHENTICATION_ACTIVITY')
    dao.deleteAll()
    return [dao.count(), dao.findAll(), counts()]
  })
})

func('count', () => {
  kase('after deletions', () => dao.count())
})
