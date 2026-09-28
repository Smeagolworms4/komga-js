// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/SearchContext.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ContentRestrictions } from './ContentRestrictions.js'
import type { KomgaUser } from './KomgaUser.js'

export class SearchContext {
  readonly userId: string | null
  readonly restrictions: ContentRestrictions
  readonly libraryIds: Iterable<string> | null

  // PORT: constructeur principal (privé en Kotlin) et constructeur secondaire (user) fusionnés en surcharges
  constructor(user: KomgaUser | null)
  constructor(userId: string | null, restrictions: ContentRestrictions, libraryIds: Iterable<string> | null)
  constructor(
    ...args: [user: KomgaUser | null] | [userId: string | null, restrictions: ContentRestrictions, libraryIds: Iterable<string> | null]
  ) {
    if (args.length === 1) {
      const [user] = args
      this.userId = user?.id ?? null
      this.restrictions = user?.restrictions ?? new ContentRestrictions()
      this.libraryIds = user?.getAuthorizedLibraryIds(null) ?? null
    } else {
      const [userId, restrictions, libraryIds] = args
      this.userId = userId
      this.restrictions = restrictions
      this.libraryIds = libraryIds
    }
  }

  static empty(): SearchContext {
    return new SearchContext(null)
  }

  static ofAnonymousUser(): SearchContext {
    return new SearchContext('UNUSED', new ContentRestrictions(), null)
  }
}
