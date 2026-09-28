// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/ReadProgressUpdateDtoOracleTest.kt
import { ReadProgressUpdateDto, ReadProgressUpdateDtoValidator } from '../../../../../../src/interfaces/api/rest/dto/ReadProgressUpdateDto.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/ReadProgressUpdateDto')

const v = new ReadProgressUpdateDtoValidator()
const dto = (page: number | null, completed: boolean | null) => new ReadProgressUpdateDto({ page, completed })

func('isValid', () => {
  kase('null', () => v.isValid(null, null))
  kase('page only', () => v.isValid(dto(5, null), null))
  kase('page 0', () => v.isValid(dto(0, null), null))
  kase('completed true', () => v.isValid(dto(null, true), null))
  kase('completed false', () => v.isValid(dto(null, false), null))
  kase('nothing', () => v.isValid(dto(null, null), null))
  kase('page and completed false', () => v.isValid(dto(3, false), null))
})
