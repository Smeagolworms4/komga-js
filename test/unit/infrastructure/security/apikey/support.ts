// Miroir de ApiKeySupport (oracle/infrastructure/security/apikey/ApiKeySupport.kt) : données partagées des oracles apikey.
import { LocalDateTime } from '@js-joda/core'
import { ApiKey } from '../../../../../src/domain/model/ApiKey.js'
import { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import { UserRoles } from '../../../../../src/domain/model/UserRoles.js'
import { Hasher } from '../../../../../src/infrastructure/hash/Hasher.js'
import { PasswordEncoderConfiguration } from '../../../../../src/infrastructure/security/PasswordEncoderConfiguration.js'
import type { UserAgentWebAuthenticationDetails } from '../../../../../src/infrastructure/security/UserAgentWebAuthenticationDetails.js'
import { UserAgentWebAuthenticationDetailsSource } from '../../../../../src/infrastructure/security/UserAgentWebAuthenticationDetailsSource.js'
import type { OracleDb } from '../../../db.js'

export const hasher = new Hasher()
export const tokenEncoder = new PasswordEncoderConfiguration().getTokenEncoder()
export const detailsSource = new UserAgentWebAuthenticationDetailsSource()
export const date = LocalDateTime.of(2020, 5, 6, 7, 8, 9)

/** Un utilisateur U1 (Kobo sync + streaming) avec les clés "key-one" (K1) et "key-two" (K2), et un admin U2 avec "admin-key" (K3) */
export function populate(db: OracleDb): void {
  db.komgaUserDao.insert(new KomgaUser({ email: 'user@example.org', password: 'pass', roles: new Set([UserRoles.KOBO_SYNC, UserRoles.PAGE_STREAMING]), id: 'U1', createdDate: date }))
  db.komgaUserDao.insert(new KomgaUser({ email: 'admin@example.org', password: 'pass', roles: new Set(UserRoles.entries()), id: 'U2', createdDate: date }))
  db.komgaUserDao.insert(new ApiKey({ id: 'K1', userId: 'U1', key: tokenEncoder.encode('key-one'), comment: 'Kobo', createdDate: date }))
  db.komgaUserDao.insert(new ApiKey({ id: 'K2', userId: 'U1', key: tokenEncoder.encode('key-two'), comment: 'KOReader', createdDate: date }))
  db.komgaUserDao.insert(new ApiKey({ id: 'K3', userId: 'U2', key: tokenEncoder.encode('admin-key'), comment: 'Admin', createdDate: date }))
}

export function describeDetails(details: unknown): unknown[] | null {
  const it = details as UserAgentWebAuthenticationDetails | null
  return it === null ? null : [it.constructor.name, it.remoteAddress, it.sessionId, it.userAgent]
}
