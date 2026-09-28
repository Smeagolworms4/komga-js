// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/LibraryDtoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Library } from '../../../../../../src/domain/model/Library.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/LibraryDto.js'
import { URL } from '../../../../../../src/port/java-net.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/LibraryDto')

const lib = new Library({ name: 'Lib', root: new URL('file:/data/My%20Comics/'), id: 'L1', createdDate: LocalDateTime.of(2020, 1, 1, 0, 0) })
const full = lib.copy({
  scanInterval: Library.ScanInterval.EVERY_6H,
  seriesCover: Library.SeriesCover.FIRST_UNREAD_OR_LAST,
  scanDirectoryExclusions: new Set(['b', 'a', '#recycle']),
  oneshotsDirectory: '_oneshots',
  unavailableDate: LocalDateTime.of(2021, 1, 1, 0, 0),
  importBarcodeIsbn: false,
  hashKoreader: true,
})

func('toDto', () => {
  kase('defaults, include root', () => toDto(lib, true))
  kase('defaults, exclude root', () => toDto(lib, false))
  kase('all fields', () => toDto(full, true))
  kase('unicode root', () => toDto(lib.copy({ root: new URL('file:/data/%C3%A9t%C3%A9/') }), true))
  kase('json', () => json(toDto(full, true)))
  kase('json no root', () => json(toDto(lib, false)))
})
