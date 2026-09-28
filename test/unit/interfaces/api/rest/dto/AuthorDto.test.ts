// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/AuthorDtoOracleTest.kt
import { Author } from '../../../../../../src/domain/model/Author.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/AuthorDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/AuthorDto')

func('toDto', () => {
  kase('normalized by Author', () => toDto(new Author({ name: '  John DOE ', role: ' Writer ' })))
  kase('empty', () => toDto(new Author({ name: '', role: '' })))
  kase('json', () => json(toDto(new Author({ name: 'Ünïcode', role: 'PENCILLER' }))))
})
