// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/KomgaUser.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { lowerNotBlank } from '../../language/LanguageUtils.js'
import { DataClass, distinctSet, intersect, lazy, str } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import { Email, NotBlank, constraints } from '../../port/validation.js'
import { AllowExclude } from './AgeRestriction.js'
import type { Auditable } from './Auditable.js'
import { ContentRestrictions } from './ContentRestrictions.js'
import type { Library } from './Library.js'
import { UserRoles } from './UserRoles.js'

type KomgaUserParams = {
  email: string
  password: string
  roles?: ReadonlySet<UserRoles>
  sharedLibrariesIds?: ReadonlySet<string>
  sharedAllLibraries?: boolean
  restrictions?: ContentRestrictions
  id?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class KomgaUser extends DataClass<KomgaUserParams> implements Auditable {
  readonly email: string
  readonly password: string
  readonly roles: ReadonlySet<UserRoles>
  readonly sharedLibrariesIds: ReadonlySet<string>
  readonly sharedAllLibraries: boolean
  readonly restrictions: ContentRestrictions
  readonly id: string
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    email,
    password,
    roles = new Set([UserRoles.FILE_DOWNLOAD, UserRoles.PAGE_STREAMING]),
    sharedLibrariesIds = new Set(),
    sharedAllLibraries = true,
    restrictions = new ContentRestrictions(),
    id = TsidCreator.getTsid256().toString(),
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: KomgaUserParams) {
    super()
    this.email = email
    this.password = password
    this.roles = roles
    this.sharedLibrariesIds = sharedLibrariesIds
    this.sharedAllLibraries = sharedAllLibraries
    this.restrictions = restrictions
    this.id = id
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }

  get isAdmin(): boolean {
    return lazy(this, 'isAdmin', () => this.roles.has(UserRoles.ADMIN))
  }

  /**
   * Return the list of LibraryIds this user is authorized to view, intersecting the provided list of LibraryIds.
   * @param libraryIds an optional list of LibraryIds to filter on
   * @return a list of authorised LibraryIds, or null if the user is authorized to see all libraries
   */
  getAuthorizedLibraryIds(libraryIds: Iterable<string> | null): Iterable<string> | null {
    // limited user & libraryIds are specified: filter on provided libraries intersecting user's authorized libraries
    if (!this.canAccessAllLibraries() && libraryIds !== null) return intersect(libraryIds, this.sharedLibrariesIds)
    // limited user: filter on user's authorized libraries
    else if (!this.canAccessAllLibraries() && libraryIds === null) return this.sharedLibrariesIds
    // non-limited user & libraryIds are specified: filter on provided libraries
    else if (libraryIds !== null) return libraryIds
    // non-limited user & no libraryIds specified: return null, meaning no filtering
    else return null
  }

  canAccessAllLibraries(): boolean {
    return this.sharedAllLibraries || this.isAdmin
  }

  // PORT: surcharges canAccessLibrary(String) / canAccessLibrary(Library) fusionnées
  canAccessLibrary(libraryOrId: string | Library): boolean {
    const libraryId = typeof libraryOrId === 'string' ? libraryOrId : libraryOrId.id
    return this.canAccessAllLibraries() || [...this.sharedLibrariesIds].some((it) => it === libraryId)
  }

  isContentAllowed({
    ageRating = null,
    sharingLabels = new Set(),
  }: {
    ageRating?: number | null
    sharingLabels?: ReadonlySet<string>
  } = {}): boolean {
    const labels = distinctSet(lowerNotBlank(sharingLabels))

    const ageAllowed =
      this.restrictions.ageRestriction?.restriction === AllowExclude.ALLOW_ONLY
        ? ageRating !== null && ageRating <= this.restrictions.ageRestriction.age
        : null

    const labelAllowed =
      this.restrictions.labelsAllow.size > 0 ? intersect(this.restrictions.labelsAllow, labels).size > 0 : null

    let allowed: boolean
    if (ageAllowed === null) allowed = labelAllowed !== false
    else if (labelAllowed === null) allowed = ageAllowed !== false
    else allowed = ageAllowed !== false || labelAllowed !== false
    if (!allowed) return false

    const ageDenied =
      this.restrictions.ageRestriction?.restriction === AllowExclude.EXCLUDE
        ? ageRating !== null && ageRating >= this.restrictions.ageRestriction.age
        : false

    const labelDenied =
      this.restrictions.labelsExclude.size > 0 ? intersect(this.restrictions.labelsExclude, labels).size > 0 : false

    return !ageDenied && !labelDenied
  }

  toString(): string {
    return `KomgaUser(createdDate=${this.createdDate}, email='${this.email}', roles=${str(this.roles)}, sharedLibrariesIds=${str(this.sharedLibrariesIds)}, sharedAllLibraries=${this.sharedAllLibraries}, restrictions=${this.restrictions}, id='${this.id}', lastModifiedDate=${this.lastModifiedDate})`
  }
}

constraints(KomgaUser, {
  email: [Email({ regexp: '.+@.+\\..+' }), NotBlank()],
  password: [NotBlank()],
})
