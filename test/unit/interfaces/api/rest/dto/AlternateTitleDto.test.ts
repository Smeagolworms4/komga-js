// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/AlternateTitleDtoOracleTest.kt
import { AlternateTitle } from '../../../../../../src/domain/model/AlternateTitle.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/AlternateTitleDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/AlternateTitleDto')

func('toDto', () => {
  kase('simple', () => toDto(new AlternateTitle({ label: 'en', title: 'Title' })))
  kase('empty', () => toDto(new AlternateTitle({ label: '', title: '' })))
  kase('unicode json', () => json(toDto(new AlternateTitle({ label: '日本語', title: 'タイトル "q"' }))))
})
