// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/UserUpdateDtoOracleTest.kt
import { AllowExcludeDto, UserUpdateDto } from '../../../../../../src/interfaces/api/rest/dto/UserUpdateDto.js'
import { oracle } from '../../../../oracle.js'
import { read } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/UserUpdateDto')

const state = (src: string) => {
  const d = read<UserUpdateDto>(src, { class: UserUpdateDto })
  return [
    ...['ageRestriction', 'labelsAllow', 'labelsExclude', 'roles', 'sharedLibraries', 'other'].map((it) => d.isSet(it)),
    ...[d.ageRestriction, d.labelsAllow, d.labelsExclude, d.roles, d.sharedLibraries],
  ]
}

func('isSet', () => {
  kase('empty body', () => state('{}'))
  kase('nulls', () => state('{"ageRestriction":null,"labelsAllow":null,"labelsExclude":null,"roles":null,"sharedLibraries":null}'))
  kase('values', () =>
    state(
      '{"ageRestriction":{"age":12,"restriction":"ALLOW_ONLY"},"labelsAllow":["a"],"labelsExclude":[],"roles":["ADMIN","FILE_DOWNLOAD"],"sharedLibraries":{"all":false,"libraryIds":["L2","L1"]}}',
    ),
  )
})
func('toDomain', () => {
  kase('ALLOW_ONLY', () => AllowExcludeDto.ALLOW_ONLY.toDomain())
  kase('EXCLUDE', () => AllowExcludeDto.EXCLUDE.toDomain())
  kase('NONE', () => AllowExcludeDto.NONE.toDomain())
})
