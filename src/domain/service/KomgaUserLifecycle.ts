// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/KomgaUserLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ApiKey } from '../model/ApiKey.js'
import { DomainEvent } from '../model/DomainEvent.js'
import { DuplicateNameException, UserEmailAlreadyExistsException } from '../model/Exceptions.js'
import type { KomgaUser } from '../model/KomgaUser.js'
import { AuthenticationActivityRepository } from '../persistence/AuthenticationActivityRepository.js'
import { KomgaUserRepository } from '../persistence/KomgaUserRepository.js'
import { ReadProgressRepository } from '../persistence/ReadProgressRepository.js'
import { SyncPointRepository } from '../persistence/SyncPointRepository.js'
import { ClientSettingsDtoDao } from '../../infrastructure/jooq/main/ClientSettingsDtoDao.js'
import { KomgaPrincipal } from '../../infrastructure/security/KomgaPrincipal.js'
import { TokenEncoder } from '../../infrastructure/security/TokenEncoder.js'
import { ApiKeyGenerator } from '../../infrastructure/security/apikey/ApiKeyGenerator.js'
import { eq, nn, require } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { PasswordEncoder } from '../../port/spring-security.js'
import { SessionRegistry } from '../../port/spring-session.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { TransactionTemplate } from '../../port/spring-tx.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.KomgaUserLifecycle')

export class KomgaUserLifecycle {
  constructor(
    private readonly userRepository: KomgaUserRepository,
    private readonly readProgressRepository: ReadProgressRepository,
    private readonly authenticationActivityRepository: AuthenticationActivityRepository,
    private readonly syncPointRepository: SyncPointRepository,
    private readonly passwordEncoder: PasswordEncoder,
    private readonly tokenEncoder: TokenEncoder,
    private readonly sessionRegistry: SessionRegistry,
    private readonly transactionTemplate: TransactionTemplate,
    private readonly eventPublisher: ApplicationEventPublisher,
    private readonly apiKeyGenerator: ApiKeyGenerator,
    private readonly clientSettingsDtoDao: ClientSettingsDtoDao,
  ) {}

  updatePassword(user: KomgaUser, newPassword: string, expireSessions: boolean): void {
    logger.info(() => `Changing password for user ${user.email}`)
    const updatedUser = user.copy({ password: this.passwordEncoder.encode(newPassword) })
    this.userRepository.update(updatedUser)

    if (expireSessions) this.expireSessions(updatedUser)

    this.eventPublisher.publishEvent(new DomainEvent.UserUpdated({ user: updatedUser, expireSession: expireSessions }))
  }

  updateUser(user: KomgaUser): void {
    const existing = this.userRepository.findByIdOrNull(user.id)
    require(existing !== null, () => `User doesn't exist, cannot update: ${user}`)

    const toUpdate = user.copy({ password: existing.password })
    logger.info(() => `Update user: ${toUpdate}`)
    this.userRepository.update(toUpdate)

    const expireSessions =
      !eq(existing.roles, user.roles) ||
      !eq(existing.restrictions, user.restrictions) ||
      existing.sharedAllLibraries !== user.sharedAllLibraries ||
      !eq(existing.sharedLibrariesIds, user.sharedLibrariesIds)

    if (expireSessions) this.expireSessions(toUpdate)

    this.eventPublisher.publishEvent(new DomainEvent.UserUpdated({ user: toUpdate, expireSession: expireSessions }))
  }

  countUsers(): number {
    return this.userRepository.count()
  }

  // @Throws(UserEmailAlreadyExistsException)
  createUser(komgaUser: KomgaUser): KomgaUser {
    if (this.userRepository.existsByEmailIgnoreCase(komgaUser.email)) throw new UserEmailAlreadyExistsException(`A user with the same email already exists: ${komgaUser.email}`)

    this.userRepository.insert(komgaUser.copy({ password: this.passwordEncoder.encode(komgaUser.password) }))

    const createdUser = nn(this.userRepository.findByIdOrNull(komgaUser.id))
    logger.info(() => `User created: ${createdUser}`)
    return createdUser
  }

  deleteUser(user: KomgaUser): void {
    logger.info(() => `Deleting user: ${user}`)

    this.transactionTemplate.executeWithoutResult(() => {
      this.clientSettingsDtoDao.deleteByUserId(user.id)
      this.readProgressRepository.deleteByUserId(user.id)
      this.authenticationActivityRepository.deleteByUser(user)
      this.syncPointRepository.deleteByUserId(user.id)
      this.userRepository.delete(user.id)
    })

    this.expireSessions(user)

    this.eventPublisher.publishEvent(new DomainEvent.UserUpdated({ user: user, expireSession: true }))
  }

  expireSessions(user: KomgaUser): void {
    logger.info(() => `Expiring all sessions for user: ${user.email}`)
    this.sessionRegistry.getAllSessions(new KomgaPrincipal(user), false).forEach((it) => {
      logger.info(() => `Expiring session: ${it.sessionId}`)
      it.expireNow()
    })
  }

  /**
   * Create and persist an API key for the user.
   * @return the ApiKey, or null if a unique API key could not be generated
   */
  createApiKey(user: KomgaUser, comment: string): ApiKey | null {
    const commentTrimmed = comment.trim()
    if (this.userRepository.existsApiKeyByCommentAndUserId(commentTrimmed, user.id)) throw new DuplicateNameException('api key comment already exists for this user', 'ERR_1034')
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        const plainTextKey = new ApiKey({
          userId: user.id,
          key: this.apiKeyGenerator.generate(),
          comment: commentTrimmed,
        })
        this.userRepository.insert(plainTextKey.copy({ key: this.tokenEncoder.encode(plainTextKey.key) }))
        return plainTextKey
      } catch {
        logger.debug(() => `Failed to generate unique api key, attempt #${attempt}`)
      }
    }
    return null
  }
}

// @Service
component(KomgaUserLifecycle, {
  inject: [
    KomgaUserRepository,
    ReadProgressRepository,
    AuthenticationActivityRepository,
    SyncPointRepository,
    PasswordEncoder,
    TokenEncoder,
    SessionRegistry,
    TransactionTemplate,
    ApplicationEventPublisher,
    ApiKeyGenerator,
    ClientSettingsDtoDao,
  ],
})
