// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/KomgaUserDetailsServiceOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import type { KomgaPrincipal } from '../../../../src/infrastructure/security/KomgaPrincipal.js'
import { KomgaUserDetailsService } from '../../../../src/infrastructure/security/KomgaUserDetailsService.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/security/KomgaUserDetailsService')

const db = new OracleDb()
const service = new KomgaUserDetailsService(db.komgaUserDao)

function load(name: string): unknown[] {
  const it = service.loadUserByUsername(name) as KomgaPrincipal
  return [it.user.id, it.getUsername(), it.getPassword(), it.getAuthorities().map((a) => a.getAuthority()).sort()]
}

func('loadUserByUsername', () => {
  kase('populate', () => {
    db.komgaUserDao.insert(new KomgaUser({ email: 'User@Example.org', password: 'pw', id: 'U1', createdDate: LocalDateTime.of(2020, 1, 1, 0, 0) }))
    db.komgaUserDao.insert(new KomgaUser({ email: 'émile@exemple.fr', password: 'pw2', id: 'U2', createdDate: LocalDateTime.of(2020, 1, 1, 0, 0) }))
  })
  kase('exact email', () => load('User@Example.org'))
  kase('lower case', () => load('user@example.org'))
  kase('upper case', () => load('USER@EXAMPLE.ORG'))
  kase('unicode lower', () => load('émile@exemple.fr'))
  kase('unicode upper', () => load('ÉMILE@EXEMPLE.FR'))
  kase('unknown', () => load('nobody@example.org'))
  kase('empty', () => load(''))
  kase('with spaces', () => load(' user@example.org '))
})
