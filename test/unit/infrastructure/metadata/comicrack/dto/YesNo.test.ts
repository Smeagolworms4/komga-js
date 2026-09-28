// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/comicrack/dto/YesNoOracleTest.kt
import { YesNo } from '../../../../../../src/infrastructure/metadata/comicrack/dto/YesNo.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('infrastructure/metadata/comicrack/dto/YesNo')

func('fromValue', () => {
  for (const v of ['Unknown', 'No', 'Yes', '', 'yes', 'YES', 'no', ' Yes', 'Yes ', 'Y', 'N', 'true', '1', 'UNKNOWN']) kase(`'${v}'`, () => YesNo.fromValue(v))
})
