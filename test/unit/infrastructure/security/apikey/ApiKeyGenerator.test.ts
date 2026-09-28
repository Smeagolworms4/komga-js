// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/apikey/ApiKeyGeneratorOracleTest.kt
import { ApiKeyGenerator } from '../../../../../src/infrastructure/security/apikey/ApiKeyGenerator.js'
import { oracle } from '../../../oracle.js'

const { func, kase } = oracle('infrastructure/security/apikey/ApiKeyGenerator')

func('generate', () => {
  const keys = Array.from({ length: 20 }, () => new ApiKeyGenerator().generate())
  kase('length', () => new Set(keys.map((it) => it.length)))
  kase('lower-case hexadecimal', () => keys.every((k) => /^[0-9a-f]*$/.test(k)))
  kase('uuid v4 version digit', () => [...new Set(keys.map((it) => it[12]))])
  kase('uuid v4 variant digit', () => keys.every((it) => '89ab'.includes(it[16]!)))
  kase('distinct', () => new Set(keys).size)
})
