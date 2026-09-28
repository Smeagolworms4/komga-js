// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/session/SessionConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// @EnableCaffeineHttpSession : CaffeineHttpSessionConfiguration est enregistrée par port/spring-session.ts
import {
  CaffeineIndexedSessionRepository,
  CookieSerializer,
  DefaultCookieSerializer,
  FindByIndexNameSessionRepository,
  HttpSessionIdResolver,
  ServerProperties,
  SessionRegistry,
  SessionRepositoryCustomizer,
  SpringSessionBackedSessionRegistry,
} from '../../../port/spring-session.js'
import { configuration } from '../../../port/spring.js'
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

  customizeSessionRepository(serverProperties: ServerProperties): SessionRepositoryCustomizer<CaffeineIndexedSessionRepository> {
    return new SessionRepositoryCustomizer<CaffeineIndexedSessionRepository>((it) => {
      it.setDefaultMaxInactiveInterval(serverProperties.servlet.session.timeout.seconds())
    })
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
    { method: 'customizeSessionRepository', type: SessionRepositoryCustomizer, inject: [ServerProperties] },
    { method: 'sessionRegistry', type: SessionRegistry, inject: [FindByIndexNameSessionRepository] },
  ],
})
