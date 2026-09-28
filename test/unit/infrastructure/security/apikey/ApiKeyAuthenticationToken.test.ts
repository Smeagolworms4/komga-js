// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/apikey/ApiKeyAuthenticationTokenOracleTest.kt
import { ApiKeyAuthenticationToken } from '../../../../../src/infrastructure/security/apikey/ApiKeyAuthenticationToken.js'
import { SimpleGrantedAuthority } from '../../../../../src/port/spring-security.js'
import { oracle } from '../../../oracle.js'
import { describeAuthentication } from '../../../web-oracle.js'

const { func, kase } = oracle('infrastructure/security/apikey/ApiKeyAuthenticationToken')

const authorities = [new SimpleGrantedAuthority('ROLE_B'), new SimpleGrantedAuthority('ROLE_A')]

func('authenticated', () => {
  kase('with authorities', () => describeAuthentication(ApiKeyAuthenticationToken.authenticated('masked', 'hashed', authorities)))
  kase('null authorities', () => describeAuthentication(ApiKeyAuthenticationToken.authenticated('masked', 'hashed', null)))
  kase('null principal and credentials', () => describeAuthentication(ApiKeyAuthenticationToken.authenticated(null, null, [])))
  kase('details', () => ApiKeyAuthenticationToken.authenticated('p', 'c', authorities).details)
  kase('principal kept', () => ApiKeyAuthenticationToken.authenticated([1, 2], 'c', authorities).principal)
  kase('erase credentials', () => {
    const t = ApiKeyAuthenticationToken.authenticated('p', 'c', authorities)
    t.eraseCredentials()
    return t.credentials
  })
  kase('set unauthenticated', () => {
    const t = ApiKeyAuthenticationToken.authenticated('p', 'c', authorities)
    t.isAuthenticated = false
    return t.isAuthenticated
  })
})

func('unauthenticated', () => {
  kase('token', () => describeAuthentication(ApiKeyAuthenticationToken.unauthenticated('masked', 'hashed')))
  kase('null values', () => describeAuthentication(ApiKeyAuthenticationToken.unauthenticated(null, null)))
  kase('cannot be trusted', () => {
    const t = ApiKeyAuthenticationToken.unauthenticated('p', 'c')
    t.isAuthenticated = true
    return t
  })
  kase('set false again', () => {
    const t = ApiKeyAuthenticationToken.unauthenticated('p', 'c')
    t.isAuthenticated = false
    return t.isAuthenticated
  })
})
