// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/ScanIntervalDtoOracleTest.kt
import { Library } from '../../../../../../src/domain/model/Library.js'
import { ScanIntervalDto, toDomain, toDto } from '../../../../../../src/interfaces/api/rest/dto/ScanIntervalDto.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/ScanIntervalDto')

func('toDto', () => {
  for (const it of Library.ScanInterval.entries()) kase(it.name, () => toDto(it))
})
func('toDomain', () => {
  for (const it of ScanIntervalDto.entries()) kase(it.name, () => toDomain(it))
})
