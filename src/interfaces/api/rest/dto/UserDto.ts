// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/UserDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type AgeRestriction, AllowExclude } from '../../../../domain/model/AgeRestriction.js'
import type { KomgaUser } from '../../../../domain/model/KomgaUser.js'
import type { KomgaPrincipal } from '../../../../infrastructure/security/KomgaPrincipal.js'
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type UserDtoParams = {
  id: string
  email: string
  roles: ReadonlySet<string>
  sharedAllLibraries: boolean
  sharedLibrariesIds: ReadonlySet<string>
  labelsAllow: ReadonlySet<string>
  labelsExclude: ReadonlySet<string>
  ageRestriction: AgeRestrictionDto | null
}

export class UserDto extends DataClass<UserDtoParams> {
  readonly id: string
  readonly email: string
  readonly roles: ReadonlySet<string>
  readonly sharedAllLibraries: boolean
  readonly sharedLibrariesIds: ReadonlySet<string>
  readonly labelsAllow: ReadonlySet<string>
  readonly labelsExclude: ReadonlySet<string>
  readonly ageRestriction: AgeRestrictionDto | null

  constructor({ id, email, roles, sharedAllLibraries, sharedLibrariesIds, labelsAllow, labelsExclude, ageRestriction }: UserDtoParams) {
    super()
    this.id = id
    this.email = email
    this.roles = roles
    this.sharedAllLibraries = sharedAllLibraries
    this.sharedLibrariesIds = sharedLibrariesIds
    this.labelsAllow = labelsAllow
    this.labelsExclude = labelsExclude
    this.ageRestriction = ageRestriction
  }
}

type AgeRestrictionDtoParams = {
  age: number
  restriction: AllowExclude
}

export class AgeRestrictionDto extends DataClass<AgeRestrictionDtoParams> {
  readonly age: number
  readonly restriction: AllowExclude

  constructor({ age, restriction }: AgeRestrictionDtoParams) {
    super()
    this.age = age
    this.restriction = restriction
  }
}

// PORT: surcharge d'extension AgeRestriction.toDto() renommée (même fichier que KomgaUser.toDto())
export function ageRestrictionToDto(self: AgeRestriction): AgeRestrictionDto {
  return new AgeRestrictionDto({ age: self.age, restriction: self.restriction })
}

export function toDto(self: KomgaUser): UserDto {
  return new UserDto({
    id: self.id,
    email: self.email,
    roles: new Set([...new Set([...self.roles].map((it) => it.name)), 'USER']),
    sharedAllLibraries: self.sharedAllLibraries,
    sharedLibrariesIds: self.sharedLibrariesIds,
    labelsAllow: self.restrictions.labelsAllow,
    labelsExclude: self.restrictions.labelsExclude,
    ageRestriction: self.restrictions.ageRestriction !== null ? ageRestrictionToDto(self.restrictions.ageRestriction) : null,
  })
}

// PORT: surcharge d'extension KomgaPrincipal.toDto() renommée (même fichier que KomgaUser.toDto())
export function komgaPrincipalToDto(self: KomgaPrincipal): UserDto {
  return toDto(self.user)
}

json(UserDto, { include: 'NON_NULL' })
jsonProperties(
  UserDto,
  {
    id: 'String',
    email: 'String',
    roles: { set: 'String' },
    sharedAllLibraries: 'Boolean',
    sharedLibrariesIds: { set: 'String' },
    labelsAllow: { set: 'String' },
    labelsExclude: { set: 'String' },
    ageRestriction: { nullable: { class: AgeRestrictionDto } },
  },
  [],
  { required: ['id', 'email', 'roles', 'sharedAllLibraries', 'sharedLibrariesIds', 'labelsAllow', 'labelsExclude'] },
)
jsonProperties(AgeRestrictionDto, { age: 'Int', restriction: { enum: AllowExclude } }, [], { required: ['age', 'restriction'] })
