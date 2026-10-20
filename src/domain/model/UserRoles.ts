// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/UserRoles.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { KEnum, distinctSet, mapNotNull } from '../../port/kotlin.js'
import { serializable } from '../../port/java-serialization.js'

export class UserRoles extends KEnum {
  static readonly ADMIN = new UserRoles('ADMIN')
  static readonly FILE_DOWNLOAD = new UserRoles('FILE_DOWNLOAD')
  static readonly PAGE_STREAMING = new UserRoles('PAGE_STREAMING')
  static readonly KOBO_SYNC = new UserRoles('KOBO_SYNC')
  static readonly KOREADER_SYNC = new UserRoles('KOREADER_SYNC')

  /**
   * Returns a Set composed of the enum constant of this type with the specified name.
   * The string must match exactly an identifier used to declare an enum constant in this type.
   * (Extraneous whitespace characters are not permitted.)
   */
  static valuesOf(roles: Iterable<string>): Set<UserRoles> {
    return distinctSet(
      mapNotNull(roles, (it) => {
        try {
          return UserRoles.valueOf(it)
        } catch {
          return null
        }
      }),
    )
  }
}

// : Serializable
serializable(UserRoles, 'org.gotson.komga.domain.model.UserRoles')
