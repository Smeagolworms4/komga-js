// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/barcode/IsbnConfigurationOracleTest.kt
import { IsbnConfiguration } from '../../../../../src/infrastructure/metadata/barcode/IsbnConfiguration.js'
import { oracle } from '../../../oracle.js'

const { func, kase } = oracle('infrastructure/metadata/barcode/IsbnConfiguration')

func('isbnValidator', () => {
  const validator = new IsbnConfiguration().isbnValidator()
  // prettier-ignore
  for (const v of [
    '9782811632397', '978-2-8116-3239-7', '978 2 8116 3239 7', '2811632395', '2-8116-3239-5', '281163239X', '0306406152', '0-306-40615-2', '9780306406157',
    '9790000000001', '9782811632398', '', 'abc', 'ISBN 9782811632397', '97828116323970', '123456789X', '080442957X', '080442957x', ' 9782811632397',
  ]) {
    kase(`'${v}'`, () => [validator.isValid(v), validator.validate(v), validator.isValidISBN10(v), validator.isValidISBN13(v)])
  }
})
