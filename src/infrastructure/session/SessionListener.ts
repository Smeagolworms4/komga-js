// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/session/SessionListener.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { KotlinLogging } from '../../port/logging.js'
import { AbstractSessionEvent } from '../../port/spring-session.js'
import { component } from '../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.session.SessionListener')

export class SessionListener {
  sessionEventLogging(event: AbstractSessionEvent): void {
    logger.debug(() => `${event.constructor.name}: ${event.sessionId}`)
  }
}

// @Component
component(SessionListener, { eventListeners: [{ method: 'sessionEventLogging', events: [AbstractSessionEvent] }] })
