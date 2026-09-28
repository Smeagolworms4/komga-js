// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/SearchContextOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/SearchContext')

const date = LocalDateTime.of(2020, 1, 1, 0, 0)

func('empty', () => {
  kase('value', () => SearchContext.empty())
  kase('distinct instances', () => SearchContext.empty() === SearchContext.empty())
})
func('ofAnonymousUser', () => {
  kase('value', () => SearchContext.ofAnonymousUser())
  kase('not restricted', () => SearchContext.ofAnonymousUser().restrictions.isRestricted)
})
func('<init>', () => {
  kase('null user', () => new SearchContext(null))
  kase('limited user', () =>
    new SearchContext(new KomgaUser({ email: 'a@b.c', password: 'p', sharedLibrariesIds: new Set(['L2', 'L1']), sharedAllLibraries: false, id: 'U', createdDate: date })),
  )
  kase('admin user', () =>
    new SearchContext(new KomgaUser({ email: 'a@b.c', password: 'p', roles: new Set([UserRoles.ADMIN]), sharedAllLibraries: false, id: 'A', createdDate: date })),
  )
  kase('restricted user', () =>
    new SearchContext(
      new KomgaUser({
        email: 'a@b.c',
        password: 'p',
        restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.ALLOW_ONLY }), labelsAllow: new Set(['Kids']) }),
        id: 'R',
        createdDate: date,
      }),
    ),
  )
})
