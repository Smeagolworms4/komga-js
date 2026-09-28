// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/apprunner/PasswordResetRunner.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaUserRepository } from '../../domain/persistence/KomgaUserRepository.js'
import { KomgaUserLifecycle } from '../../domain/service/KomgaUserLifecycle.js'
import { isBlank } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'
import { type ApplicationArguments, ApplicationRunner } from '../../port/spring-boot-application.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.apprunner.PasswordResetRunner')

export class PasswordResetRunner extends ApplicationRunner {
  private readonly resetFor = 'reset'
  private readonly resetTo = 'newpassword'

  constructor(
    private readonly userRepository: KomgaUserRepository,
    private readonly userLifecycle: KomgaUserLifecycle,
  ) {
    super()
  }

  run(args: ApplicationArguments): void {
    const newPassword = args.getOptionValues(this.resetTo)?.[0] ?? null
    const resetFor = new Set(args.getOptionValues(this.resetFor) ?? [])

    if (resetFor.size === 0 !== (newPassword === null)) return logger.warn(() => `You need to specify both '--${this.resetFor}=user@domain.com' and '--${this.resetTo}=YourNewPassword'`)

    if (resetFor.size === 0) return

    if (newPassword === null || isBlank(newPassword)) return logger.warn(() => 'The new password must not be blank')

    resetFor.forEach((arg) => {
      const user = this.userRepository.findByEmailIgnoreCaseOrNull(arg)
      if (user !== null) {
        logger.info(() => `Reset password for user: ${user.email}`)
        this.userLifecycle.updatePassword(user, newPassword, true)
      } else logger.warn(() => `User does not exist: ${arg}`)
    })
  }
}

// @Profile("!test") @Component
component(PasswordResetRunner, { profile: '!test', inject: [KomgaUserRepository, KomgaUserLifecycle] })
