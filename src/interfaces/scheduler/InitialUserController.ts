// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/scheduler/InitialUserController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaUser } from '../../domain/model/KomgaUser.js'
import { UserRoles } from '../../domain/model/UserRoles.js'
import { KomgaUserLifecycle } from '../../domain/service/KomgaUserLifecycle.js'
import { RandomStringUtils } from '../../port/commons-lang.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationReadyEvent, component, configuration, type Token } from '../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.scheduler.InitialUserController')

export class InitialUserController {
  constructor(
    private readonly userLifecycle: KomgaUserLifecycle,
    private readonly initialUsers: KomgaUser[],
  ) {}

  createInitialUserOnStartupIfNoneExist(): void {
    if (this.userLifecycle.countUsers() === 0) {
      logger.info(() => 'No users exist in database, creating initial users')

      this.initialUsers.forEach((it) => {
        this.userLifecycle.createUser(it)
        logger.info(() => `Initial user created. Login: ${it.email}, Password: ${it.password}`)
      })
    }
  }
}

// @Profile("!test & noclaim") @Component
component(InitialUserController, {
  profile: (profiles) => !profiles.includes('test') && profiles.includes('noclaim'),
  // PORT: bean List<KomgaUser> injecté par son nom
  inject: [KomgaUserLifecycle, { expression: (ctx) => ctx.getBean('initialUsers') }],
  eventListeners: [{ method: 'createInitialUserOnStartupIfNoneExist', events: [ApplicationReadyEvent] }],
})

export class InitialUsersDevConfiguration {
  initialUsers(): KomgaUser[] {
    return [new KomgaUser({ email: 'admin@example.org', password: 'admin', roles: new Set(UserRoles.entries()) }), new KomgaUser({ email: 'user@example.org', password: 'user' })]
  }
}

// @Configuration @Profile("dev")
configuration(InitialUsersDevConfiguration, {
  profile: 'dev',
  beans: [{ method: 'initialUsers', type: Array as unknown as Token, profile: 'dev' }],
})

export class InitialUsersProdConfiguration {
  initialUsers(): KomgaUser[] {
    return [new KomgaUser({ email: 'admin@example.org', password: RandomStringUtils.secure().nextAlphanumeric(12), roles: new Set(UserRoles.entries()) })]
  }
}

// @Configuration @Profile("!dev")
configuration(InitialUsersProdConfiguration, {
  profile: '!dev',
  beans: [{ method: 'initialUsers', type: Array as unknown as Token, profile: '!dev' }],
})
