// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/CorsConfigurationOracleTest.kt
import { KomgaProperties } from '../../../../src/infrastructure/configuration/KomgaProperties.js'
import { CorsConfiguration } from '../../../../src/infrastructure/security/CorsConfiguration.js'
import { Environment } from '../../../../src/port/spring.js'
import { oracle } from '../../oracle.js'
import { request } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/security/CorsConfiguration')

function source(...origins: string[]) {
  const props = new KomgaProperties()
  props.cors.allowedOrigins = origins
  return new CorsConfiguration().corsConfigurationSource('X-Auth-Token', props)
}

function outcome(...properties: [string, string][]): unknown[] {
  // PORT: MockEnvironment -> Environment avec les seules propriétés du cas
  const env = new Environment({ env: {}, profiles: [], properties: Object.fromEntries(properties) })
  const o = new CorsConfiguration.CorsAllowedOriginsPresent().getMatchOutcome(env)
  return [o.match, o.message]
}

func('corsConfigurationSource', () => {
  kase('configuration', () => {
    const it = source('http://localhost:8081', 'https://komga.example.org/').getCorsConfiguration(request({ uri: '/api/v1/books' }))
    return it === null ? null : [it.allowedOrigins, it.allowedOriginPatterns, it.allowedMethods, it.allowedHeaders, it.exposedHeaders, it.allowCredentials, it.maxAge]
  })
  kase('all paths', () => ['/', '/api/v1/books', '/opds/v2/catalog', '/kobo/x/v1/library/sync'].map((it) => source('http://a').getCorsConfiguration(request({ uri: it })) !== null))
  kase('check origin', () => {
    const c = source('http://localhost:8081', 'https://komga.example.org/').getCorsConfiguration(request({ uri: '/api' }))!
    return ['http://localhost:8081', 'https://komga.example.org', 'https://KOMGA.example.org', 'http://localhost:8082', 'null', ''].map((it) => c.checkOrigin(it))
  })
  kase('check method', () => {
    const c = source('http://a').getCorsConfiguration(request({ uri: '/api' }))!
    return ['GET', 'POST', 'PATCH', 'DELETE', 'TRACE', 'CONNECT'].map((it) => c.checkHttpMethod(it))
  })
  kase('check headers', () => {
    const c = source('http://a').getCorsConfiguration(request({ uri: '/api' }))!
    return [['X-Auth-Token'], ['Content-Type', 'Authorization'], []].map((it) => c.checkHeaders(it))
  })
  kase('no origin', () => source().getCorsConfiguration(request({ uri: '/api' }))?.allowedOrigins ?? null)
})

func('getMatchOutcome', () => {
  kase('no property', () => outcome())
  kase('one origin', () => outcome(['komga.cors.allowed-origins', 'http://localhost:8081']))
  kase('comma separated', () => outcome(['komga.cors.allowed-origins', 'http://a,http://b']))
  kase('empty', () => outcome(['komga.cors.allowed-origins', '']))
  kase('indexed', () => outcome(['komga.cors.allowed-origins[0]', 'http://a']))
  kase('camel case', () => outcome(['komga.cors.allowedOrigins', 'http://a']))
  kase('other property', () => outcome(['komga.cors.other', 'x']))
})
