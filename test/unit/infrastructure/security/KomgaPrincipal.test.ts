// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/KomgaPrincipalOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { ApiKey } from '../../../../src/domain/model/ApiKey.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import { KomgaPrincipal } from '../../../../src/infrastructure/security/KomgaPrincipal.js'
import { SimpleGrantedAuthority } from '../../../../src/port/spring-security.js'
import { DefaultOAuth2User, DefaultOidcUser, OidcIdToken, OidcUserInfo } from '../../../../src/port/spring-security-oauth2.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/security/KomgaPrincipal')

const date = LocalDateTime.of(2020, 5, 6, 7, 8, 9)
const user = new KomgaUser({ email: 'user@example.org', password: '{bcrypt}hash', roles: new Set([UserRoles.PAGE_STREAMING, UserRoles.FILE_DOWNLOAD]), id: 'U1', createdDate: date })
const admin = new KomgaUser({ email: 'admin@example.org', password: 'pw', roles: new Set(UserRoles.entries()), id: 'U2', createdDate: date })
const noRoles = new KomgaUser({ email: 'none@example.org', password: '', roles: new Set(), id: 'U3', createdDate: date })
const oauth2 = new DefaultOAuth2User([new SimpleGrantedAuthority('OAUTH2_USER')], { login: 'gh-user', email: 'gh@example.org' }, 'login')
// PORT: OidcIdToken(tokenValue, issuedAt, expiresAt, claims) -> (tokenValue, claims)
const idToken = new OidcIdToken('token', { sub: 'sub-1', email: 'oidc@example.org' })
const oidc = new DefaultOidcUser([new SimpleGrantedAuthority('OIDC_USER')], idToken, new OidcUserInfo({ sub: 'sub-1', name: 'Oidc Name' }))
const apiKey = new ApiKey({ id: 'K1', userId: 'U1', key: 'hashed', comment: 'c', createdDate: date })

const sorted = (m: Record<string, unknown>) =>
  Object.entries(m)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => [k, String(v)])

const principals: [string, KomgaPrincipal][] = [
  ['user', new KomgaPrincipal(user)],
  ['admin', new KomgaPrincipal(admin)],
  ['no roles', new KomgaPrincipal(noRoles)],
  ['oauth2', new KomgaPrincipal(user, { oAuth2User: oauth2 })],
  ['oidc', new KomgaPrincipal(user, { oidcUser: oidc })],
  ['api key with name', new KomgaPrincipal(user, { apiKey, name: 'masked-name' })],
  ['empty name', new KomgaPrincipal(user, { name: '' })],
]

func('getAuthorities', () => {
  for (const [n, p] of principals) kase(n, () => p.getAuthorities().map((it) => it.getAuthority()).sort())
})
func('isEnabled', () => {
  for (const [n, p] of principals) kase(n, () => p.isEnabled())
})
func('getUsername', () => {
  for (const [n, p] of principals) kase(n, () => p.getUsername())
})
func('isCredentialsNonExpired', () => {
  for (const [n, p] of principals) kase(n, () => p.isCredentialsNonExpired())
})
func('getPassword', () => {
  for (const [n, p] of principals) kase(n, () => p.getPassword())
})
func('isAccountNonExpired', () => {
  for (const [n, p] of principals) kase(n, () => p.isAccountNonExpired())
})
func('isAccountNonLocked', () => {
  for (const [n, p] of principals) kase(n, () => p.isAccountNonLocked())
})
func('getName', () => {
  for (const [n, p] of principals) kase(n, () => p.getName())
})
func('getAttributes', () => {
  for (const [n, p] of principals) kase(n, () => sorted(p.getAttributes()))
})
func('getClaims', () => {
  for (const [n, p] of principals) kase(n, () => sorted(p.getClaims()))
})
func('getUserInfo', () => {
  for (const [n, p] of principals) kase(n, () => {
    const it = p.getUserInfo()
    return it === null ? null : sorted(it.claims)
  })
})
func('getIdToken', () => {
  for (const [n, p] of principals) kase(n, () => {
    const it = p.getIdToken()
    return it === null ? null : [it.tokenValue, it.subject]
  })
})
