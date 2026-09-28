// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/KomgaUserRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ApiKey } from '../model/ApiKey.js'
import type { KomgaUser } from '../model/KomgaUser.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class KomgaUserRepository {
  abstract count(): number

  abstract findByIdOrNull(id: string): KomgaUser | null

  abstract findByEmailIgnoreCaseOrNull(email: string): KomgaUser | null

  // PORT: Pair<KomgaUser, ApiKey> -> tuple
  abstract findByApiKeyOrNull(apiKey: string): [KomgaUser, ApiKey] | null

  abstract findAll(): KomgaUser[]

  abstract findApiKeyByUserId(userId: string): ApiKey[]

  abstract existsByEmailIgnoreCase(email: string): boolean

  abstract existsApiKeyByIdAndUserId(apiKeyId: string, userId: string): boolean

  abstract existsApiKeyByCommentAndUserId(comment: string, userId: string): boolean

  // PORT: surcharges insert(KomgaUser) / insert(ApiKey) fusionnées (union de types)
  abstract insert(userOrApiKey: KomgaUser | ApiKey): void

  // PORT: insert(apiKey: ApiKey) fusionné avec insert(user) ci-dessus

  abstract update(user: KomgaUser): void

  abstract delete(userId: string): void

  abstract deleteAll(): void

  abstract deleteApiKeyByIdAndUserId(apiKeyId: string, userId: string): void

  abstract deleteApiKeyByUserId(userId: string): void

  abstract findAnnouncementIdsReadByUserId(userId: string): Set<string>

  abstract saveAnnouncementIdsRead(user: KomgaUser, announcementIds: ReadonlySet<string>): void
}
