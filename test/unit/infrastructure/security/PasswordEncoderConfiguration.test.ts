// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/PasswordEncoderConfigurationOracleTest.kt
import { PasswordEncoderConfiguration } from '../../../../src/infrastructure/security/PasswordEncoderConfiguration.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/security/PasswordEncoderConfiguration')

const config = new PasswordEncoderConfiguration()

func('getPasswordEncoder', () => {
  const encoder = config.getPasswordEncoder()
  kase('matches spring hash', () => encoder.matches('password', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG'))
  kase('rejects wrong password', () => encoder.matches('Password', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG'))
  kase('2b prefix', () => encoder.matches('password', '$2b$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG'))
  kase('2y prefix', () => encoder.matches('password', '$2y$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG'))
  kase('not a bcrypt hash', () => encoder.matches('password', 'password'))
  kase('empty hash', () => encoder.matches('password', ''))
  kase('encode format', () => {
    const h = encoder.encode('secret')
    return [h.length, h.substring(0, 7), encoder.matches('secret', h), encoder.matches('Secret', h)]
  })
  kase('encode is salted', () => encoder.encode('secret') !== encoder.encode('secret'))
  kase('unicode password', () => encoder.matches('mötörhead 漫画', encoder.encode('mötörhead 漫画')))
  kase('upgrade encoding', () => encoder.upgradeEncoding('$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG'))
})

func('getTokenEncoder', () => {
  const encoder = config.getTokenEncoder()
  for (const k of ['', 'a', 'key-one', '0123456789abcdef0123456789abcdef', 'ünï 漫画', '\u0000', 'x'.repeat(10_000)])
    kase(k.length > 40 ? 'long' : `[${k}]`, () => encoder.encode(k))
  kase('deterministic', () => encoder.encode('abc') === config.getTokenEncoder().encode('abc'))
})
