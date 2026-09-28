// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/session/SessionListenerOracleTest.kt
import { SessionListener } from '../../../../../src/infrastructure/security/session/SessionListener.js'
import { MapSession, SessionCreatedEvent, SessionDeletedEvent, SessionExpiredEvent } from '../../../../../src/port/spring-session.js'
import { oracle } from '../../../oracle.js'

const { func, kase } = oracle('infrastructure/security/session/SessionListener')

func('sessionEventLogging', () => {
  const listener = new SessionListener()
  kase('created', () => listener.sessionEventLogging(new SessionCreatedEvent(null, new MapSession('S1'))))
  kase('deleted', () => listener.sessionEventLogging(new SessionDeletedEvent(null, new MapSession('S2'))))
  kase('expired', () => listener.sessionEventLogging(new SessionExpiredEvent(null, new MapSession('S3'))))
})
