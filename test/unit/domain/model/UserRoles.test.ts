// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/UserRolesOracleTest.kt
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/UserRoles')

func('entries', () => {
  kase('names and ordinals', () => UserRoles.entries().map((it) => [it.name, it.ordinal]))
})

func('valuesOf', () => {
  kase('empty', () => UserRoles.valuesOf([]))
  kase('all', () => UserRoles.valuesOf(UserRoles.entries().map((it) => it.name)))
  kase('reversed order', () => UserRoles.valuesOf(['KOREADER_SYNC', 'ADMIN', 'FILE_DOWNLOAD']))
  kase('invalid ignored', () => UserRoles.valuesOf(['admin', 'ADMIN ', ' ADMIN', 'USER', '', 'PAGE_STREAMING']))
  kase('duplicates', () => UserRoles.valuesOf(['ADMIN', 'KOBO_SYNC', 'ADMIN']))
  kase('set source', () => UserRoles.valuesOf(new Set(['KOBO_SYNC', 'ROLE_ADMIN'])))
})
