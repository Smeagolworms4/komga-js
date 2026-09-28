// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/ThumbnailSizeDtoOracleTest.kt
import { ThumbnailSize } from '../../../../../../src/domain/model/ThumbnailSize.js'
import { ThumbnailSizeDto, toDomain, toDto } from '../../../../../../src/interfaces/api/rest/dto/ThumbnailSizeDto.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/ThumbnailSizeDto')

func('toDto', () => {
  for (const it of ThumbnailSize.entries()) kase(it.name, () => toDto(it))
})
func('toDomain', () => {
  for (const it of ThumbnailSizeDto.entries()) kase(it.name, () => toDomain(it))
})
