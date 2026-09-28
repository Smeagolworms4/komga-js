// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/UserDtoOracleTest.kt
import { AgeRestriction, AllowExclude } from '../../../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../../../src/domain/model/ContentRestrictions.js'
import { UserRoles } from '../../../../../../src/domain/model/UserRoles.js'
import { ageRestrictionToDto, komgaPrincipalToDto, toDto } from '../../../../../../src/interfaces/api/rest/dto/UserDto.js'
import { oracle } from '../../../../oracle.js'
import { json, principal, user } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/UserDto')

const restricted = user('U2', {
  roles: new Set([UserRoles.PAGE_STREAMING, UserRoles.FILE_DOWNLOAD]),
  sharedLibrariesIds: new Set(['L2', 'L1']),
  sharedAllLibraries: false,
  restrictions: new ContentRestrictions({
    ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.EXCLUDE }),
    labelsAllow: new Set(['Kids', 'b']),
    labelsExclude: new Set(['Adult']),
  }),
})

func('toDto@26', () => {
  kase('allow only', () => ageRestrictionToDto(new AgeRestriction({ age: 16, restriction: AllowExclude.ALLOW_ONLY })))
  kase('exclude', () => ageRestrictionToDto(new AgeRestriction({ age: 0, restriction: AllowExclude.EXCLUDE })))
})
func('toDto@28', () => {
  kase('no roles', () => toDto(user('U1')))
  kase('admin', () => toDto(user('U1', { roles: new Set(UserRoles.entries()) })))
  kase('restricted', () => toDto(restricted))
  kase('json restricted', () => json(toDto(restricted)))
  kase('json no age restriction', () => json(toDto(user('U1'))))
})
func('toDto@40', () => {
  kase('principal', () => komgaPrincipalToDto(principal(restricted)))
})
