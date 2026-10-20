// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/session/SessionConfiguration.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import {
  CookieSerializer,
  DefaultCookieSerializer,
  FindByIndexNameSessionRepository,
  HttpSessionIdResolver,
  SessionRegistry,
  SpringSessionBackedSessionRegistry,
} from '../../port/spring-session.js'
import { configuration } from '../../port/spring.js'
import { SmartHttpSessionIdResolver } from './SmartHttpSessionIdResolver.js'

export class SessionConfiguration {
  sessionCookieName(): string {
    return 'KOMGA-SESSION'
  }

  sessionHeaderName(): string {
    return 'X-Auth-Token'
  }

  cookieSerializer(sessionCookieName: string): CookieSerializer {
    const s = new DefaultCookieSerializer()
    s.setCookieName(sessionCookieName)
    return s
  }

  httpSessionIdResolver(sessionHeaderName: string, cookieSerializer: CookieSerializer): HttpSessionIdResolver {
    return new SmartHttpSessionIdResolver(sessionHeaderName, cookieSerializer)
  }

  sessionRegistry(sessionRepository: FindByIndexNameSessionRepository): SessionRegistry {
    return new SpringSessionBackedSessionRegistry(sessionRepository)
  }
}

// @Configuration
configuration(SessionConfiguration, {
  beans: [
    { method: 'sessionCookieName', type: String },
    { method: 'sessionHeaderName', type: String },
    { method: 'cookieSerializer', type: CookieSerializer, inject: [{ expression: (ctx) => ctx.getBean('sessionCookieName') }] },
    {
      method: 'httpSessionIdResolver',
      type: HttpSessionIdResolver,
      inject: [{ expression: (ctx) => ctx.getBean('sessionHeaderName') }, CookieSerializer],
    },
    { method: 'sessionRegistry', type: SessionRegistry, inject: [FindByIndexNameSessionRepository] },
  ],
})
