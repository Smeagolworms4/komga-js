// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/ReadListRequestMatchDtoOracleTest.kt
import { LocalDate } from '@js-joda/core'
import {
  ReadListMatch,
  ReadListRequestBook,
  ReadListRequestBookMatchBook,
  ReadListRequestBookMatchSeries,
  ReadListRequestBookMatches,
  ReadListRequestMatch,
} from '../../../../../../src/domain/model/ReadListRequest.js'
import { readListMatchToDto, readListRequestBookToDto, toDto } from '../../../../../../src/interfaces/api/rest/dto/ReadListRequestMatchDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/ReadListRequestMatchDto')

const s1 = new ReadListRequestBookMatchSeries({ id: 'S1', title: 'Series 1', releaseDate: LocalDate.of(2020, 2, 29) })
const s2 = new ReadListRequestBookMatchSeries({ id: 'S2', title: 'Series 2', releaseDate: null })
const match = new ReadListRequestMatch({
  readListMatch: new ReadListMatch({ name: 'List', errorCode: 'ERR_1' }),
  requests: [
    new ReadListRequestBookMatches({
      request: new ReadListRequestBook({ series: new Set(['Series 1', 'series one']), number: '1' }),
      matches: new Map([
        [
          s1,
          [
            new ReadListRequestBookMatchBook({ id: 'B1', number: '1', title: 'Book 1' }),
            new ReadListRequestBookMatchBook({ id: 'B2', number: '1', title: 'Book 1 bis' }),
          ],
        ],
        [s2, []],
      ]),
    }),
    new ReadListRequestBookMatches({ request: new ReadListRequestBook({ series: new Set(), number: '' }), matches: new Map() }),
  ],
  errorCode: 'ignored',
})

func('toDto@15', () => {
  kase('full, errorCode not copied', () => toDto(match))
  kase('no requests', () => toDto(new ReadListRequestMatch({ readListMatch: new ReadListMatch({ name: 'x' }), requests: [] })))
  kase('json', () => json(toDto(match)))
})
func('toDto@33', () => {
  kase('with error', () => readListMatchToDto(new ReadListMatch({ name: 'n', errorCode: 'ERR_1' })))
  kase('default error', () => readListMatchToDto(new ReadListMatch({ name: '' })))
})
func('toDto@45', () => {
  kase('series set', () => readListRequestBookToDto(new ReadListRequestBook({ series: new Set(['b', 'a']), number: '12.5' })))
  kase('empty', () => readListRequestBookToDto(new ReadListRequestBook({ series: new Set(), number: '' })))
})
