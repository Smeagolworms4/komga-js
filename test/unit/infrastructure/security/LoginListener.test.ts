// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/LoginListenerOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { ApiKey } from '../../../../src/domain/model/ApiKey.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { KomgaPrincipal } from '../../../../src/infrastructure/security/KomgaPrincipal.js'
import { LoginListener } from '../../../../src/infrastructure/security/LoginListener.js'
import { UserAgentWebAuthenticationDetailsSource } from '../../../../src/infrastructure/security/UserAgentWebAuthenticationDetailsSource.js'
import { ApiKeyAuthenticationToken } from '../../../../src/infrastructure/security/apikey/ApiKeyAuthenticationToken.js'
import {
  type AbstractAuthenticationToken,
  AnonymousAuthenticationToken,
  AuthenticationFailureBadCredentialsEvent,
  AuthenticationFailureDisabledEvent,
  AuthenticationFailureProviderNotFoundEvent,
  AuthenticationSuccessEvent,
  BadCredentialsException,
  DisabledException,
  RememberMeAuthenticationToken,
  SimpleGrantedAuthority,
  UsernamePasswordAuthenticationToken,
  WebAuthenticationDetails,
} from '../../../../src/port/spring-security.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { request } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/security/LoginListener')

const db = new OracleDb()
const listener = new LoginListener(db.authenticationActivityDao, db.komgaUserDao)
const date = LocalDateTime.of(2020, 5, 6, 7, 8, 9)
const user = new KomgaUser({ email: 'user@example.org', password: 'pw', id: 'U1', createdDate: date })
const apiKey = new ApiKey({ id: 'K1', userId: 'U1', key: 'hashed', comment: 'My Kobo', createdDate: date })
const roles = [new SimpleGrantedAuthority('ROLE_USER')]
const details = new UserAgentWebAuthenticationDetailsSource().buildDetails(request({ headers: [['User-Agent', 'Kobo/1.0']], remoteAddr: '192.168.1.10' }))
const plainDetails = new WebAuthenticationDetails(request({ remoteAddr: '10.1.1.1' }))

const last = (): unknown[] =>
  db.rawQuery('SELECT USER_ID, EMAIL, API_KEY_ID, API_KEY_COMMENT, IP, USER_AGENT, SUCCESS, ERROR, SOURCE FROM AUTHENTICATION_ACTIVITY ORDER BY rowid DESC LIMIT 1')[0] ?? []

const count = () => db.rawQuery('SELECT count(*) FROM AUTHENTICATION_ACTIVITY')[0]![0]

function withDetails<T extends AbstractAuthenticationToken>(t: T, d: unknown): T {
  t.details = d
  return t
}

func('onSuccess', () => {
  kase('populate', () => db.komgaUserDao.insert(user))
  kase('password', () => {
    listener.onSuccess(new AuthenticationSuccessEvent(withDetails(UsernamePasswordAuthenticationToken.authenticated(new KomgaPrincipal(user), null, roles), details)))
    return last()
  })
  kase('api key', () => {
    listener.onSuccess(new AuthenticationSuccessEvent(withDetails(ApiKeyAuthenticationToken.authenticated(new KomgaPrincipal(user, { apiKey, name: 'masked' }), null, roles), details)))
    return last()
  })
  kase('remember me, plain details', () => {
    listener.onSuccess(new AuthenticationSuccessEvent(withDetails(new RememberMeAuthenticationToken('key', new KomgaPrincipal(user), roles), plainDetails)))
    return last()
  })
  kase('anonymous source, no details', () => {
    listener.onSuccess(new AuthenticationSuccessEvent(new AnonymousAuthenticationToken('key', new KomgaPrincipal(user), roles)))
    return last()
  })
})

func('onFailure', () => {
  kase('bad credentials, known email', () => {
    listener.onFailure(
      new AuthenticationFailureBadCredentialsEvent(withDetails(UsernamePasswordAuthenticationToken.unauthenticated('USER@example.org', 'wrong'), details), new BadCredentialsException('Bad credentials')),
    )
    return last()
  })
  kase('bad credentials, unknown email', () => {
    listener.onFailure(new AuthenticationFailureBadCredentialsEvent(UsernamePasswordAuthenticationToken.unauthenticated('nobody@example.org', 'wrong'), new BadCredentialsException('Bad credentials')))
    return last()
  })
  kase('api key', () => {
    listener.onFailure(new AuthenticationFailureBadCredentialsEvent(withDetails(ApiKeyAuthenticationToken.unauthenticated('masked-key', 'hashed'), details), new BadCredentialsException('Bad credentials')))
    return last()
  })
  kase('disabled, empty message', () => {
    listener.onFailure(new AuthenticationFailureDisabledEvent(new RememberMeAuthenticationToken('k', 'user@example.org', roles), new DisabledException('')))
    return last()
  })
  kase('null principal', () => {
    listener.onFailure(new AuthenticationFailureBadCredentialsEvent(UsernamePasswordAuthenticationToken.unauthenticated(null, null), new BadCredentialsException('x')))
    return last()
  })
  kase('provider not found is ignored', () => {
    const before = count()
    listener.onFailure(new AuthenticationFailureProviderNotFoundEvent(UsernamePasswordAuthenticationToken.unauthenticated('a', 'b'), new BadCredentialsException('x')))
    return [before, count()]
  })
})

func('getIp', () => {
  kase('from user agent details', () => {
    listener.onFailure(new AuthenticationFailureBadCredentialsEvent(withDetails(UsernamePasswordAuthenticationToken.unauthenticated('ip@example.org', 'x'), details), new BadCredentialsException('x')))
    return last()[4]
  })
  kase('details of another type', () => {
    listener.onFailure(new AuthenticationFailureBadCredentialsEvent(withDetails(UsernamePasswordAuthenticationToken.unauthenticated('ip@example.org', 'x'), 'string details'), new BadCredentialsException('x')))
    return last()[4]
  })
})

func('getUserAgent', () => {
  kase('from user agent details', () => {
    listener.onFailure(new AuthenticationFailureBadCredentialsEvent(withDetails(UsernamePasswordAuthenticationToken.unauthenticated('ua@example.org', 'x'), details), new BadCredentialsException('x')))
    return last()[5]
  })
  kase('plain web details', () => {
    listener.onFailure(new AuthenticationFailureBadCredentialsEvent(withDetails(UsernamePasswordAuthenticationToken.unauthenticated('ua@example.org', 'x'), plainDetails), new BadCredentialsException('x')))
    return [last()[4], last()[5]]
  })
})
