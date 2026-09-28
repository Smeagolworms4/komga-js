// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/scheduler/AuthenticationActivityCleanupController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { AuthenticationActivityRepository } from '../../domain/persistence/AuthenticationActivityRepository.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'
import { scheduled } from '../../port/spring-scheduling.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.scheduler.AuthenticationActivityCleanupController')

export class AuthenticationActivityCleanupController {
  constructor(private readonly authenticationActivityRepository: AuthenticationActivityRepository) {}

  // Run every day
  cleanup(): void {
    const olderThan = LocalDateTime.now(ZoneId.of('Z')).minusMonths(1)
    logger.info(() => `Remove authentication activity older than ${olderThan} (UTC)`)
    this.authenticationActivityRepository.deleteOlderThan(olderThan)
  }
}

// @Profile("!test") @Component
component(AuthenticationActivityCleanupController, { profile: '!test', inject: [AuthenticationActivityRepository] })
// @Scheduled(fixedRate = 86_400_000)
scheduled(AuthenticationActivityCleanupController, [{ method: 'cleanup', fixedRate: 86_400_000 }])
