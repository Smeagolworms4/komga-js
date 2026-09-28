// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/validation/BlankOracleTest.kt
import { BlankValidator } from '../../../../src/infrastructure/validation/Blank.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/validation/Blank')

const v = new BlankValidator()
func('isValid', () => {
  kase('null', () => v.isValid(null, null))
  kase('empty', () => v.isValid('', null))
  kase('[ ]', () => v.isValid(' ', null))
  kase('[tn]', () => v.isValid('\t\n', null))
  kase('[u00a0]', () => v.isValid('\u00a0', null))
  kase('[u2003]', () => v.isValid('\u2003', null))
  kase('[u3000]', () => v.isValid('\u3000', null))
  kase('[u200b]', () => v.isValid('\u200b', null))
  kase('[ufeff]', () => v.isValid('\ufeff', null))
  kase('[u001c]', () => v.isValid('\u001c', null))
  kase('[a]', () => v.isValid('a', null))
  kase('[ a ]', () => v.isValid(' a ', null))
  kase('[_]', () => v.isValid('_', null))
})
