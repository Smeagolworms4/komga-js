// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/UserCreationDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { Email, NotBlank, Valid, constraints } from '../../../../port/validation.js'
import { AgeRestrictionUpdateDto, SharedLibrariesUpdateDto } from './UserUpdateDto.js'

type UserCreationDtoParams = {
  email: string
  password: string
  roles?: string[]
  ageRestriction: AgeRestrictionUpdateDto | null
  labelsAllow: ReadonlySet<string> | null
  labelsExclude: ReadonlySet<string> | null
  sharedLibraries: SharedLibrariesUpdateDto | null
}

export class UserCreationDto extends DataClass<UserCreationDtoParams> {
  readonly email: string
  readonly password: string
  readonly roles: string[]
  // new fields supported
  readonly ageRestriction: AgeRestrictionUpdateDto | null
  readonly labelsAllow: ReadonlySet<string> | null
  readonly labelsExclude: ReadonlySet<string> | null
  readonly sharedLibraries: SharedLibrariesUpdateDto | null

  constructor({ email, password, roles = [], ageRestriction, labelsAllow, labelsExclude, sharedLibraries }: UserCreationDtoParams) {
    super()
    this.email = email
    this.password = password
    this.roles = roles
    this.ageRestriction = ageRestriction
    this.labelsAllow = labelsAllow
    this.labelsExclude = labelsExclude
    this.sharedLibraries = sharedLibraries
  }
}

constraints(UserCreationDto, {
  email: [Email({ regexp: '.+@.+\\..+' })],
  password: [NotBlank()],
  ageRestriction: [Valid()],
})
jsonProperties(
  UserCreationDto,
  {
    email: 'String',
    password: 'String',
    roles: { list: 'String' },
    ageRestriction: { nullable: { class: AgeRestrictionUpdateDto } },
    labelsAllow: { nullable: { set: 'String' } },
    labelsExclude: { nullable: { set: 'String' } },
    sharedLibraries: { nullable: { class: SharedLibrariesUpdateDto } },
  },
  [],
  { required: ['email', 'password'] },
)
