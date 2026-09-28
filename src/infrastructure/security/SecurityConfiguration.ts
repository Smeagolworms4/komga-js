// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/SecurityConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { UserRoles } from '../../domain/model/UserRoles.js'
import { KomgaSettingsProvider } from '../configuration/KomgaSettingsProvider.js'
import { Hasher } from '../hash/Hasher.js'
import type { Filter, HttpServletRequest, HttpServletResponse } from '../../port/servlet.js'
import {
  type AuthenticationException,
  AuthenticationEventPublisher,
  type AuthenticationManager,
  ProviderManager,
  UserDetailsService,
  WebAuthenticationDetailsSource,
} from '../../port/spring-security.js'
import {
  InMemoryClientRegistrationRepository,
  OAuth2AuthenticationException,
  type OAuth2User,
  type OAuth2UserRequest,
  OAuth2UserService,
  type OidcUser,
  type OidcUserRequest,
} from '../../port/spring-security-oauth2.js'
import {
  AnonymousAuthenticationFilter,
  BasicAuthenticationFilter,
  EndpointRequest,
  HealthEndpoint,
  type HttpSecurity,
  PathPatternRequestMatcher,
  SecurityFilterChain,
  SessionCreationPolicy,
  SimpleUrlAuthenticationFailureHandler,
  TokenBasedRememberMeServices,
  httpSecurity,
} from '../../port/spring-security-web.js'
import { SessionRegistry } from '../../port/spring-session.js'
import { configuration } from '../../port/spring.js'
import { ApiKeyAuthenticationFilter } from './apikey/ApiKeyAuthenticationFilter.js'
import { ApiKeyAuthenticationProvider } from './apikey/ApiKeyAuthenticationProvider.js'
import { HeaderApiKeyAuthenticationConverter } from './apikey/HeaderApiKeyAuthenticationConverter.js'
import { UriRegexApiKeyAuthenticationConverter } from './apikey/UriRegexApiKeyAuthenticationConverter.js'
import { OpdsAuthenticationEntryPoint } from './OpdsAuthenticationEntryPoint.js'
import { TokenEncoder } from './TokenEncoder.js'

// @EnableWebSecurity : FilterChainProxy enregistré par port/spring-security-web.ts
// @EnableMethodSecurity(prePostEnabled = true) : @PreAuthorize évalué par checkPreAuthorize (port/spring-security.ts)
export class SecurityConfiguration {
  private readonly oauth2Enabled: boolean

  constructor(
    private readonly komgaSettingsProvider: KomgaSettingsProvider,
    private readonly komgaUserDetailsService: UserDetailsService,
    // PORT: renommé (conflit avec la méthode apiKeyAuthenticationProvider(), permis en Kotlin)
    private readonly apiKeyAuthenticationProviderBean: ApiKeyAuthenticationProvider,
    private readonly oauth2UserService: OAuth2UserService<OAuth2UserRequest, OAuth2User>,
    private readonly oidcUserService: OAuth2UserService<OidcUserRequest, OidcUser>,
    private readonly sessionCookieName: string,
    private readonly userAgentWebAuthenticationDetailsSource: WebAuthenticationDetailsSource,
    private readonly theSessionRegistry: SessionRegistry,
    private readonly opdsAuthenticationEntryPoint: OpdsAuthenticationEntryPoint,
    private readonly authenticationEventPublisher: AuthenticationEventPublisher,
    private readonly tokenEncoder: TokenEncoder,
    private readonly hasher: Hasher,
    clientRegistrationRepository: InMemoryClientRegistrationRepository | null,
  ) {
    this.oauth2Enabled = clientRegistrationRepository !== null
  }

  // @Order(1)
  // @Bean
  filterChain(http: HttpSecurity): SecurityFilterChain {
    http
      .cors(() => {})
      .csrf((it) => it.disable())
      .securityMatchers((it) => {
        // only apply security to those endpoints
        it.requestMatchers('/api/**', '/opds/**', '/sse/**', '/oauth2/authorization/**', '/login/oauth2/code/**')
        it.requestMatchers(EndpointRequest.toAnyEndpoint())
      })
      .authorizeHttpRequests((it) => {
        // allow unauthorized access to actuator health endpoint
        // this will only show limited details as `management.endpoint.health.show-details` is set to `when-authorized`
        it.requestMatchers(EndpointRequest.to(HealthEndpoint)).permitAll()
        // restrict all other actuator endpoints to ADMIN only
        it.requestMatchers(EndpointRequest.toAnyEndpoint()).hasRole(UserRoles.ADMIN.name)

        it
          .requestMatchers(
            // to claim server before any account is created
            '/api/v1/claim',
            // used by webui
            '/api/v1/oauth2/providers',
            // used by webui, we check for authorization within the controller method directly and filter results from there
            '/api/v1/client-settings/global/list',
            // epub resources - fonts are always requested anonymously, so we check for authorization within the controller method directly
            '/api/v1/books/{bookId}/resource/**',
            // dynamic fonts
            '/api/v1/fonts/resource/**',
            // OPDS authentication document
            '/opds/v2/auth',
            // KOReader user creation
            '/koreader/users/create',
          )
          .permitAll()

        // all other endpoints are restricted to authenticated users
        it.requestMatchers('/api/**', '/opds/**', '/sse/**').authenticated()
      })
      .headers((headersConfigurer) => {
        headersConfigurer.cacheControl((it) => it.disable()) // headers are set in WebMvcConfiguration
        headersConfigurer.frameOptions((it) => it.sameOrigin()) // for epubreader iframes
      })
      .userDetailsService(this.komgaUserDetailsService)
      .httpBasic((it) => {
        it.authenticationDetailsSource(this.userAgentWebAuthenticationDetailsSource)
      })
      .logout((it) => {
        it.logoutUrl('/api/logout')
        it.deleteCookies(this.sessionCookieName)
        it.invalidateHttpSession(true)
      })
      .sessionManagement((session) => {
        session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
        session.sessionConcurrency((it) => {
          it.sessionRegistry(this.theSessionRegistry)
          it.maximumSessions(-1)
        })
      })
      .exceptionHandling((it) => {
        it.defaultAuthenticationEntryPointFor(this.opdsAuthenticationEntryPoint, PathPatternRequestMatcher.withDefaults().matcher('/opds/v2/**'))
      })

    if (this.oauth2Enabled) {
      http.oauth2Login((oauth2) => {
        oauth2.userInfoEndpoint((it) => {
          it.userService(this.oauth2UserService)
          it.oidcUserService(this.oidcUserService)
        })
        oauth2.authenticationDetailsSource(this.userAgentWebAuthenticationDetailsSource)
        oauth2
          .loginPage('/login')
          .defaultSuccessUrl('/?server_redirect=Y', true)
          .failureHandler((request: HttpServletRequest, response: HttpServletResponse, exception: AuthenticationException) => {
            let errorMessage: string | null
            if (exception instanceof OAuth2AuthenticationException) errorMessage = exception.error.errorCode
            else errorMessage = exception.message
            const url = `/login?server_redirect=Y&error=${errorMessage}`
            new SimpleUrlAuthenticationFailureHandler(url).onAuthenticationFailure(request, response, exception)
          })
        oauth2.redirectionEndpoint(() => {})
      })
    }

    http.rememberMe((it) => {
      const services = new TokenBasedRememberMeServices(this.komgaSettingsProvider.rememberMeKey, this.komgaUserDetailsService)
      // PORT: kotlin.time.Duration.inWholeSeconds.toInt() -> Duration (js-joda).seconds()
      services.setTokenValiditySeconds(this.komgaSettingsProvider.rememberMeDuration.seconds())
      services.setAuthenticationDetailsSource(this.userAgentWebAuthenticationDetailsSource)
      services.setCookieName('komga-remember-me')
      it.rememberMeServices(services)
    })

    http.addFilterAfter(this.restAuthenticationFilter(), BasicAuthenticationFilter)

    return http.build()
  }

  // @Bean
  koboFilterChain(http: HttpSecurity): SecurityFilterChain {
    http.invoke((it) => {
      it.cors(() => {})

      it.csrf((c) => c.disable())
      it.formLogin((c) => c.disable())
      it.httpBasic((c) => c.disable())
      it.logout((c) => c.disable())

      it.securityMatcher('/kobo/**')
      it.authorizeHttpRequests((a) => {
        a.authorize(a.anyRequest, a.hasRole(UserRoles.KOBO_SYNC.name))
      })

      it.headers((h) => {
        h.cacheControl((c) => c.disable())
      })

      // somehow the Kobo gets a Json issue when receiving the session ID in a cookie header
      // this happens when requesting /v1/user/profile
      // Kobo error: packetdump.warning) Invalid JSON script: QVariant(Invalid) "illegal value"
//      sessionManagement {
//        sessionCreationPolicy = SessionCreationPolicy.IF_REQUIRED
//        sessionConcurrency {
//          sessionRegistry = theSessionRegistry
//          maximumSessions = -1
//        }
//      }

      it.addFilterBefore(AnonymousAuthenticationFilter, this.koboAuthenticationFilter())
    })

    return http.build()
  }

  // @Bean
  kosyncFilterChain(http: HttpSecurity): SecurityFilterChain {
    http.invoke((it) => {
      it.cors(() => {})

      it.csrf((c) => c.disable())
      it.formLogin((c) => c.disable())
      it.httpBasic((c) => c.disable())
      it.logout((c) => c.disable())

      it.securityMatcher('/koreader/**')
      it.authorizeHttpRequests((a) => {
        a.authorize(a.anyRequest, a.hasRole(UserRoles.KOREADER_SYNC.name))
      })

      it.headers((h) => {
        h.cacheControl((c) => c.disable())
      })

      it.sessionManagement((s) => {
        s.sessionCreationPolicy = SessionCreationPolicy.IF_REQUIRED
        s.sessionConcurrency((c) => {
          c.sessionRegistry = this.theSessionRegistry
          c.maximumSessions = -1
        })
      })

      it.addFilterBefore(AnonymousAuthenticationFilter, this.kosyncAuthenticationFilter())
    })

    return http.build()
  }

  koboAuthenticationFilter(): Filter {
    return new ApiKeyAuthenticationFilter(
      this.apiKeyAuthenticationProvider(),
      new UriRegexApiKeyAuthenticationConverter(/\/kobo\/([\w-]+)/, this.hasher, this.tokenEncoder, this.userAgentWebAuthenticationDetailsSource),
    )
  }

  kosyncAuthenticationFilter(): Filter {
    return new ApiKeyAuthenticationFilter(
      this.apiKeyAuthenticationProvider(),
      new HeaderApiKeyAuthenticationConverter('X-Auth-User', this.hasher, this.tokenEncoder, this.userAgentWebAuthenticationDetailsSource),
    )
  }

  restAuthenticationFilter(): Filter {
    return new ApiKeyAuthenticationFilter(
      this.apiKeyAuthenticationProvider(),
      new HeaderApiKeyAuthenticationConverter('X-API-Key', this.hasher, this.tokenEncoder, this.userAgentWebAuthenticationDetailsSource),
    )
  }

  apiKeyAuthenticationProvider(): AuthenticationManager {
    const m = new ProviderManager(this.apiKeyAuthenticationProviderBean)
    m.setAuthenticationEventPublisher(this.authenticationEventPublisher)
    return m
  }
}

// @Configuration
configuration(SecurityConfiguration, {
  inject: [
    KomgaSettingsProvider,
    UserDetailsService,
    ApiKeyAuthenticationProvider,
    { type: OAuth2UserService, qualifier: 'oauth2UserService' },
    { type: OAuth2UserService, qualifier: 'oidcUserService' },
    { expression: (ctx) => ctx.getBean('sessionCookieName') },
    WebAuthenticationDetailsSource,
    SessionRegistry,
    OpdsAuthenticationEntryPoint,
    AuthenticationEventPublisher,
    TokenEncoder,
    Hasher,
    { optional: InMemoryClientRegistrationRepository },
  ],
  beans: [
    { method: 'filterChain', type: SecurityFilterChain, inject: [httpSecurity(1)] },
    { method: 'koboFilterChain', type: SecurityFilterChain, inject: [httpSecurity()] },
    { method: 'kosyncFilterChain', type: SecurityFilterChain, inject: [httpSecurity()] },
  ],
})
