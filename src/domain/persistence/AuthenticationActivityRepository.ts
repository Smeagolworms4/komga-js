// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/AuthenticationActivityRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import type { AuthenticationActivity } from '../model/AuthenticationActivity.js'
import type { KomgaUser } from '../model/KomgaUser.js'
import type { Page, Pageable } from '../../port/spring-data.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class AuthenticationActivityRepository {
  abstract findAll(pageable: Pageable): Page<AuthenticationActivity>

  abstract findAllByUser(user: KomgaUser, pageable: Pageable): Page<AuthenticationActivity>

  abstract findMostRecentByUser(user: KomgaUser, apiKeyId: string | null): AuthenticationActivity | null

  abstract insert(activity: AuthenticationActivity): void

  abstract deleteByUser(user: KomgaUser): void

  abstract deleteOlderThan(dateTime: LocalDateTime): void
}
