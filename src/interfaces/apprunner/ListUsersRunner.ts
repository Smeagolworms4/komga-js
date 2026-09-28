// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/apprunner/ListUsersRunner.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaUserRepository } from '../../domain/persistence/KomgaUserRepository.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'
import { type ApplicationArguments, ApplicationRunner } from '../../port/spring-boot-application.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.apprunner.ListUsersRunner')

export class ListUsersRunner extends ApplicationRunner {
  constructor(private readonly userRepository: KomgaUserRepository) {
    super()
  }

  run(args: ApplicationArguments): void {
    if (args.getOptionValues('list-users') !== null) {
      const emails = this.userRepository.findAll().map((it) => it.email)
      if (emails.length > 0) logger.info(() => `Here is a list of all users: [${emails.join(', ')}]`)
      else logger.info(() => 'No users exist yet')
    }
  }
}

// @Profile("!test") @Component
component(ListUsersRunner, { profile: '!test', inject: [KomgaUserRepository] })
