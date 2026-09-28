// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/SeriesCoverDtoOracleTest.kt
import { Library } from '../../../../../../src/domain/model/Library.js'
import { SeriesCoverDto, toDomain, toDto } from '../../../../../../src/interfaces/api/rest/dto/SeriesCoverDto.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/SeriesCoverDto')

func('toDto', () => {
  for (const it of Library.SeriesCover.entries()) kase(it.name, () => toDto(it))
})
func('toDomain', () => {
  for (const it of SeriesCoverDto.entries()) kase(it.name, () => toDomain(it))
})
