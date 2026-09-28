// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/LibraryUpdateDtoOracleTest.kt
import { LibraryUpdateDto } from '../../../../../../src/interfaces/api/rest/dto/LibraryUpdateDto.js'
import { oracle } from '../../../../oracle.js'
import { read } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/LibraryUpdateDto')

const state = (src: string) => {
  const d = read<LibraryUpdateDto>(src, { class: LibraryUpdateDto })
  return [
    ...['name', 'scanDirectoryExclusions', 'oneshotsDirectory', 'unknown'].map((it) => d.isSet(it)),
    ...[d.name, d.scanDirectoryExclusions, d.oneshotsDirectory, d.scanInterval, d.seriesCover],
  ]
}

func('isSet', () => {
  kase('empty body', () => state('{}'))
  kase('set to null', () => state('{"scanDirectoryExclusions":null,"oneshotsDirectory":null}'))
  kase('set to values', () => state('{"name":"n","scanDirectoryExclusions":["b","a"],"oneshotsDirectory":"","scanInterval":"WEEKLY","seriesCover":"LAST"}'))
  kase('only one', () => state('{"oneshotsDirectory":"os"}'))
  kase('default instance', () => new LibraryUpdateDto().isSet('scanDirectoryExclusions'))
})
