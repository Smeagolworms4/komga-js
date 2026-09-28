// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/kobo/dto/ResultDtoOracleTest.kt
import { ResultDto } from '../../../../../../src/interfaces/api/kobo/dto/ResultDto.js'
import { oracle } from '../../../../oracle.js'
import { mapper } from '../../../../web-oracle.js'

const { func, kase } = oracle('interfaces/api/kobo/dto/ResultDto')

func('wrapped', () => {
  for (const r of ResultDto.entries()) kase(r.name, () => mapper().writeValueAsString(r.wrapped()))
})
