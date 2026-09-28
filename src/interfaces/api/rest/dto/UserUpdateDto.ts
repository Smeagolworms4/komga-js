// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/UserUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { AllowExclude } from '../../../../domain/model/AgeRestriction.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass, IllegalArgumentException, KEnum } from '../../../../port/kotlin.js'
import { PositiveOrZero, Valid, constraints } from '../../../../port/validation.js'

type UserUpdateDtoParams = {
  ageRestriction?: AgeRestrictionUpdateDto | null
  labelsAllow?: ReadonlySet<string> | null
  labelsExclude?: ReadonlySet<string> | null
  roles?: ReadonlySet<string> | null
  sharedLibraries?: SharedLibrariesUpdateDto | null
}

// PORT: classe Kotlin sans constructeur principal, dont Jackson affecte les propriétés présentes dans le JSON ;
// le constructeur reçoit ici les propriétés lues et les affecte (les setters observables marquent isSet)
export class UserUpdateDto {
  private readonly _isSet = new Map<string, boolean>()

  isSet(prop: string): boolean {
    return this._isSet.get(prop) ?? false
  }

  private _ageRestriction: AgeRestrictionUpdateDto | null = null
  get ageRestriction(): AgeRestrictionUpdateDto | null {
    return this._ageRestriction
  }
  set ageRestriction(value: AgeRestrictionUpdateDto | null) {
    this._ageRestriction = value
    this._isSet.set('ageRestriction', true)
  }

  private _labelsAllow: ReadonlySet<string> | null = null
  get labelsAllow(): ReadonlySet<string> | null {
    return this._labelsAllow
  }
  set labelsAllow(value: ReadonlySet<string> | null) {
    this._labelsAllow = value
    this._isSet.set('labelsAllow', true)
  }

  private _labelsExclude: ReadonlySet<string> | null = null
  get labelsExclude(): ReadonlySet<string> | null {
    return this._labelsExclude
  }
  set labelsExclude(value: ReadonlySet<string> | null) {
    this._labelsExclude = value
    this._isSet.set('labelsExclude', true)
  }

  private _roles: ReadonlySet<string> | null = null
  get roles(): ReadonlySet<string> | null {
    return this._roles
  }
  set roles(value: ReadonlySet<string> | null) {
    this._roles = value
    this._isSet.set('roles', true)
  }

  private _sharedLibraries: SharedLibrariesUpdateDto | null = null
  get sharedLibraries(): SharedLibrariesUpdateDto | null {
    return this._sharedLibraries
  }
  set sharedLibraries(value: SharedLibrariesUpdateDto | null) {
    this._sharedLibraries = value
    this._isSet.set('sharedLibraries', true)
  }

  constructor(props: UserUpdateDtoParams = {}) {
    Object.assign(this, props)
  }
}

type AgeRestrictionUpdateDtoParams = {
  age: number
  restriction: AllowExcludeDto
}

export class AgeRestrictionUpdateDto extends DataClass<AgeRestrictionUpdateDtoParams> {
  readonly age: number
  readonly restriction: AllowExcludeDto

  constructor({ age, restriction }: AgeRestrictionUpdateDtoParams) {
    super()
    this.age = age
    this.restriction = restriction
  }
}

type SharedLibrariesUpdateDtoParams = {
  all: boolean
  libraryIds: ReadonlySet<string>
}

export class SharedLibrariesUpdateDto extends DataClass<SharedLibrariesUpdateDtoParams> {
  readonly all: boolean
  readonly libraryIds: ReadonlySet<string>

  constructor({ all, libraryIds }: SharedLibrariesUpdateDtoParams) {
    super()
    this.all = all
    this.libraryIds = libraryIds
  }
}

export class AllowExcludeDto extends KEnum {
  static readonly ALLOW_ONLY = new AllowExcludeDto('ALLOW_ONLY')
  static readonly EXCLUDE = new AllowExcludeDto('EXCLUDE')
  static readonly NONE = new AllowExcludeDto('NONE')

  toDomain(): AllowExclude {
    switch (this) {
      case AllowExcludeDto.ALLOW_ONLY:
        return AllowExclude.ALLOW_ONLY
      case AllowExcludeDto.EXCLUDE:
        return AllowExclude.EXCLUDE
      case AllowExcludeDto.NONE:
        throw new IllegalArgumentException()
    }
    // PORT: when exhaustif
    throw new Error(`Unknown ${this}`)
  }
}

constraints(UserUpdateDto, { ageRestriction: [Valid()] })
jsonProperties(UserUpdateDto, {
  ageRestriction: { nullable: { class: AgeRestrictionUpdateDto } },
  labelsAllow: { nullable: { set: 'String' } },
  labelsExclude: { nullable: { set: 'String' } },
  roles: { nullable: { set: 'String' } },
  sharedLibraries: { nullable: { class: SharedLibrariesUpdateDto } },
})
constraints(AgeRestrictionUpdateDto, { age: [PositiveOrZero()] })
jsonProperties(AgeRestrictionUpdateDto, { age: 'Int', restriction: { enum: AllowExcludeDto } }, [], { required: ['age', 'restriction'] })
jsonProperties(SharedLibrariesUpdateDto, { all: 'Boolean', libraryIds: { set: 'String' } }, [], { required: ['all', 'libraryIds'] })
