// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/ExceptionsOracleTest.kt
import { type CodedException, MediaUnsupportedException, withCode } from '../../../../src/domain/model/Exceptions.js'
import { IOException } from '../../../../src/port/java-io.js'
import { Exception, IllegalArgumentException, IllegalStateException, RuntimeException } from '../../../../src/port/kotlin.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/Exceptions')

const describe = (e: CodedException) => {
  const cause = e.cause as Error | undefined
  return [e.constructor.name, e.message === '' ? null : e.message, e.code, cause?.constructor.name ?? null, cause ? (cause.message === '' ? null : cause.message) : null]
}

func('withCode', () => {
  kase('illegal state', () => describe(withCode(new IllegalStateException('boom'), 'ERR_1')))
  kase('no message', () => describe(withCode(new IllegalArgumentException(), 'ERR_2')))
  kase('empty code', () => describe(withCode(new IOException('io'), '')))
  kase('coded exception', () => describe(withCode(new MediaUnsupportedException('unsupported', 'ERR_3'), 'ERR_4')))
  kase('coded exception, default code', () => describe(withCode(new MediaUnsupportedException('unsupported'), 'X')))
  kase('unicode message', () => describe(withCode(new Exception('échec 漫画'), 'ERR_5')))
  kase('thrown', () => {
    throw withCode(new RuntimeException('inner'), 'ERR_6')
  })
  kase('cause kept', () => {
    const it = new RuntimeException('inner')
    return withCode(it, 'C').cause === it
  })
})
