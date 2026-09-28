// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/BCP47TagValidatorOracleTest.kt
import { BCP47TagValidator } from '../../../../src/domain/model/BCP47TagValidator.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/BCP47TagValidator')

// prettier-ignore
const tags = [
  null, '', ' ', 'en', 'EN', 'en-US', 'en_US', 'fr-FR', 'fr-fr', 'zh-Hant-TW', 'zh-hant-tw', 'sr-Latn', 'und', 'root',
  'x', 'xx', 'xyz', 'eng', 'fre', 'fra', 'iw', 'he', 'in', 'id', 'ji', 'mo', 'sh', 'no', 'nb', 'tl', 'fil',
  'i-klingon', 'i-default', 'art-lojban', 'zh-min-nan', 'en-GB-oed', 'sgn-BE-FR', 'zh-yue', 'yue',
  'en-u-ca-gregory', 'de-DE-u-co-phonebk', 'ja-JP-u-ca-japanese-x-lvariant-JP', 'en-US-x-twain', 'x-private',
  'en-a-bbb-x-a-ccc', 'en-US-POSIX', 'de-CH-1996', 'sl-rozaj-biske', 'en--US', '-en', 'en-', '123', 'e', 'en-123',
  'es-419', 'qaa', 'tlh', 'ain', 'cmn', 'ar-EG', 'pt_BR', 'ES', 'é', 'en US', 'en-US-u', 'en-t-ja', 'a-b-c-d-e',
  'toolongtag', 'english', 'zh-CN-variant1', 'EN-us-POSIX',
]

func('isValid', () => {
  for (const t of tags) kase(`'${t}'`, () => BCP47TagValidator.isValid(t))
})
func('normalize', () => {
  for (const t of tags) kase(`'${t}'`, () => BCP47TagValidator.normalize(t))
})
