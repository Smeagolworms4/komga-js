// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/comicrack/dto/MangaOracleTest.kt
import { Manga } from '../../../../../../src/infrastructure/metadata/comicrack/dto/Manga.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('infrastructure/metadata/comicrack/dto/Manga')

func('fromValue', () => {
  // prettier-ignore
  for (const v of [
    'Unknown', 'No', 'Yes', 'YesAndRightToLeft', '', 'yes', 'YESANDRIGHTTOLEFT', 'yesandrighttoleft', 'Yes And Right To Left', ' Yes', 'YesAndRightToLeft ',
    'YES_AND_RIGHT_TO_LEFT', 'UNKNOWN', 'NO',
  ]) {
    kase(`'${v}'`, () => Manga.fromValue(v))
  }
})
