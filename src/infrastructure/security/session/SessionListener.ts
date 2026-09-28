// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/session/SessionListener.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KotlinLogging } from '../../../port/logging.js'
import { AbstractSessionEvent } from '../../../port/spring-session.js'
import { component } from '../../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.security.session.SessionListener')

export class SessionListener {
  sessionEventLogging(event: AbstractSessionEvent): void {
    logger.debug(() => `${event.constructor.name}: ${event.sessionId}`)
  }
}

// @Component
component(SessionListener, { eventListeners: [{ method: 'sessionEventLogging', events: [AbstractSessionEvent] }] })
