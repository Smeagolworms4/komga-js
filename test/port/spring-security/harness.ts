// Support de test : serveur node:http minimal exécutant la chaîne de filtres de Komga (SessionRepositoryFilter +
// FilterChainProxy de SecurityConfiguration) devant une servlet triviale, et client HTTP brut pour comparer les
// réponses avec un Komga de référence. Ce fichier n'a pas de jumeau Kotlin.
//
// Tant que les dépendances de SecurityConfiguration.ts (KomgaSettingsProvider, OpdsGenerator…) ne sont pas portées,
// `mirrorFilterChains` reproduit à l'identique le DSL de SecurityConfiguration (mêmes appels, même ordre) avec des
// substituts pour ces deux services ; `twinFilterChains` utilise le jumeau dès qu'il se charge.
import '../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import '../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import '../../../src/infrastructure/hash/Hasher.js'
import '../../../src/infrastructure/security/PasswordEncoderConfiguration.js'
import '../../../src/infrastructure/security/KomgaUserDetailsService.js'
import '../../../src/infrastructure/security/UserAgentWebAuthenticationDetailsSource.js'
import '../../../src/infrastructure/security/LoginListener.js'
import '../../../src/infrastructure/security/apikey/ApiKeyAuthenticationProvider.js'
import '../../../src/infrastructure/security/apikey/ApiKeyGenerator.js'
import '../../../src/infrastructure/security/session/SessionConfiguration.js'
import '../../../src/infrastructure/security/session/SessionListener.js'
import { type IncomingMessage, type Server, type ServerResponse, createServer, request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { UserRoles } from '../../../src/domain/model/UserRoles.js'
import { Hasher } from '../../../src/infrastructure/hash/Hasher.js'
import { ApiKeyAuthenticationFilter } from '../../../src/infrastructure/security/apikey/ApiKeyAuthenticationFilter.js'
import { ApiKeyAuthenticationProvider } from '../../../src/infrastructure/security/apikey/ApiKeyAuthenticationProvider.js'
import { HeaderApiKeyAuthenticationConverter } from '../../../src/infrastructure/security/apikey/HeaderApiKeyAuthenticationConverter.js'
import { UriRegexApiKeyAuthenticationConverter } from '../../../src/infrastructure/security/apikey/UriRegexApiKeyAuthenticationConverter.js'
import { TokenEncoder } from '../../../src/infrastructure/security/TokenEncoder.js'
import { type Filter, FilterRegistrationBean, HttpServletRequest, HttpServletResponse, buildFilterChain } from '../../../src/port/servlet.js'
import {
  AuthenticationEventPublisher,
  type AuthenticationManager,
  ProviderManager,
  UserDetailsService,
  WebAuthenticationDetailsSource,
  checkPreAuthorize,
} from '../../../src/port/spring-security.js'
import {
  AnonymousAuthenticationFilter,
  type AuthenticationEntryPoint,
  BasicAuthenticationFilter,
  EndpointRequest,
  FilterChainProxy,
  HealthEndpoint,
  HttpSecurity,
  PRINCIPAL_ATTRIBUTE,
  rawRequestUri,
  PathPatternRequestMatcher,
  type SecurityFilterChain,
  SessionCreationPolicy,
  SimpleUrlAuthenticationFailureHandler,
  TokenBasedRememberMeServices,
} from '../../../src/port/spring-security-web.js'
import { CookieSerializer, CookieValue, SessionRegistry } from '../../../src/port/spring-session.js'
import {
  InMemoryClientRegistrationRepository,
  OAuth2AuthenticationException,
  type OAuth2User,
  type OAuth2UserRequest,
  type OAuth2UserService,
  type OidcUser,
  type OidcUserRequest,
} from '../../../src/port/spring-security-oauth2.js'
import type { ApplicationContext } from '../../../src/port/spring.js'
import { HttpStatus } from '../../../src/port/spring-web.js'

// ---------------------------------------------------------------------------
// Client HTTP brut
// ---------------------------------------------------------------------------

export type RawResponse = { status: number; headers: IncomingMessage['headers']; body: string }

export function send(base: string, method: string, path: string, headers: Record<string, string> = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(base)
    const req = httpRequest(
      { host: url.hostname, port: url.port, method, path, headers: { Connection: 'close', ...headers } },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

export function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
}

// ---------------------------------------------------------------------------
// Serveur de test
// ---------------------------------------------------------------------------

/** Rendu d'erreur de Spring Boot (BasicErrorController, server.error.include-message=always) */
function renderError(req: HttpServletRequest, res: HttpServletResponse): void {
  const e = res.attributesForError as { status: number; message: string | null }
  const status = HttpStatus.valueOfCode(e.status)
  res.setStatus(e.status)
  res.setContentType('application/json')
  res.send(
    JSON.stringify({
      timestamp: new Date().toISOString().replace('Z', '+00:00'),
      status: e.status,
      error: status?.reasonPhrase ?? '',
      message: e.message ?? 'No message available',
      // Tomcat : getRequestURI() brut (non normalisé)
      path: rawRequestUri(req),
    }),
  )
}

/** Servlet triviale : quelques points d'accès aux comportements utiles à la sécurité */
function makeServlet(ctx: ApplicationContext) {
  return async (req: HttpServletRequest, res: HttpServletResponse): Promise<void> => {
    const p = req.servletPath
    const json = (o: unknown) => {
      res.setContentType('application/json')
      res.send(JSON.stringify(o))
    }
    if (p === '/api/v2/users' && req.method === 'GET') {
      checkPreAuthorize("hasRole('ADMIN')")
      return json([])
    }
    if (p === '/api/v1/login/set-cookie') {
      const session = req.getSession(true)
      ctx.getBean(CookieSerializer).writeCookieValue(new CookieValue(req, res, session?.id ?? ''))
      res.setStatus(204)
      return res.send()
    }
    const principal = req.getAttribute(PRINCIPAL_ATTRIBUTE) as { getUsername(): string } | null
    return json({ email: principal?.getUsername() ?? null })
  }
}

export type TsServer = { base: string; ctx: ApplicationContext; server: Server; close(): Promise<void> }

export async function startServer(ctx: ApplicationContext, chains: SecurityFilterChain[]): Promise<TsServer> {
  const registrations = ctx.getBeansOfType(FilterRegistrationBean).filter((r) => r.name !== 'springSecurityFilterChain')
  registrations.push(new FilterRegistrationBean(new FilterChainProxy(chains), -100, ['/*'], 'springSecurityFilterChain'))
  const chain = buildFilterChain(registrations, makeServlet(ctx))
  const server = createServer((raw: IncomingMessage, rawRes: ServerResponse) => {
    const chunks: Buffer[] = []
    raw.on('data', (c: Buffer) => chunks.push(c))
    raw.on('end', async () => {
      const req = new HttpServletRequest(raw, Buffer.concat(chunks))
      const res = new HttpServletResponse(rawRes)
      try {
        await chain.doFilter(req, res)
        if (!rawRes.writableEnded) {
          if (res.attributesForError !== null) renderError(req, res)
          else res.send()
        }
      } catch (e) {
        if (!rawRes.writableEnded) {
          res.sendError(500, (e as Error).message)
          renderError(req, res)
        }
      }
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as AddressInfo).port
  return {
    base: `http://localhost:${port}`,
    ctx,
    server,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

// ---------------------------------------------------------------------------
// Chaînes de sécurité
// ---------------------------------------------------------------------------

export type MirrorOptions = {
  rememberMeKey: string
  rememberMeDays: number
  /** substitut d'OpdsAuthenticationEntryPoint (même sortie que le jumeau) */
  opdsAuthenticationEntryPoint: AuthenticationEntryPoint
  /** oauth2UserService / oidcUserService (beans de KomgaOAuth2UserServiceConfiguration) si des clients OAuth2 sont configurés */
  oauth2?: { oauth2UserService: OAuth2UserService<OAuth2UserRequest, OAuth2User>; oidcUserService: OAuth2UserService<OidcUserRequest, OidcUser> }
}

/**
 * Copie conforme de SecurityConfiguration.filterChain / koboFilterChain / kosyncFilterChain (mêmes appels de DSL,
 * même ordre), avec KomgaSettingsProvider et OpdsAuthenticationEntryPoint remplacés par des substituts.
 */
export function mirrorFilterChains(ctx: ApplicationContext, o: MirrorOptions): SecurityFilterChain[] {
  const komgaUserDetailsService = ctx.getBean(UserDetailsService)
  const userAgentWebAuthenticationDetailsSource = ctx.getBean(WebAuthenticationDetailsSource)
  const theSessionRegistry = ctx.getBean(SessionRegistry)
  const sessionCookieName = ctx.getBean<string>('sessionCookieName')
  const hasher = ctx.getBean(Hasher)
  const tokenEncoder = ctx.getBean(TokenEncoder)
  const apiKeyAuthenticationProvider = (): AuthenticationManager => {
    const m = new ProviderManager(ctx.getBean(ApiKeyAuthenticationProvider))
    m.setAuthenticationEventPublisher(ctx.getBean(AuthenticationEventPublisher))
    return m
  }
  const restAuthenticationFilter = (): Filter =>
    new ApiKeyAuthenticationFilter(apiKeyAuthenticationProvider(), new HeaderApiKeyAuthenticationConverter('X-API-Key', hasher, tokenEncoder, userAgentWebAuthenticationDetailsSource))
  const koboAuthenticationFilter = (): Filter =>
    new ApiKeyAuthenticationFilter(
      apiKeyAuthenticationProvider(),
      new UriRegexApiKeyAuthenticationConverter(/\/kobo\/([\w-]+)/, hasher, tokenEncoder, userAgentWebAuthenticationDetailsSource),
    )
  const kosyncAuthenticationFilter = (): Filter =>
    new ApiKeyAuthenticationFilter(apiKeyAuthenticationProvider(), new HeaderApiKeyAuthenticationConverter('X-Auth-User', hasher, tokenEncoder, userAgentWebAuthenticationDetailsSource))

  // filterChain (@Order(1))
  const http = new HttpSecurity(ctx, 1)
  http
    .cors(() => {})
    .csrf((it) => it.disable())
    .securityMatchers((it) => {
      it.requestMatchers('/api/**', '/opds/**', '/sse/**', '/oauth2/authorization/**', '/login/oauth2/code/**')
      it.requestMatchers(EndpointRequest.toAnyEndpoint())
    })
    .authorizeHttpRequests((it) => {
      it.requestMatchers(EndpointRequest.to(HealthEndpoint)).permitAll()
      it.requestMatchers(EndpointRequest.toAnyEndpoint()).hasRole(UserRoles.ADMIN.name)
      it.requestMatchers(
        '/api/v1/claim',
        '/api/v1/oauth2/providers',
        '/api/v1/client-settings/global/list',
        '/api/v1/books/{bookId}/resource/**',
        '/api/v1/fonts/resource/**',
        '/opds/v2/auth',
        '/koreader/users/create',
      ).permitAll()
      it.requestMatchers('/api/**', '/opds/**', '/sse/**').authenticated()
    })
    .headers((headersConfigurer) => {
      headersConfigurer.cacheControl((it) => it.disable())
      headersConfigurer.frameOptions((it) => it.sameOrigin())
    })
    .userDetailsService(komgaUserDetailsService)
    .httpBasic((it) => {
      it.authenticationDetailsSource(userAgentWebAuthenticationDetailsSource)
    })
    .logout((it) => {
      it.logoutUrl('/api/logout')
      it.deleteCookies(sessionCookieName)
      it.invalidateHttpSession(true)
    })
    .sessionManagement((session) => {
      session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
      session.sessionConcurrency((it) => {
        it.sessionRegistry(theSessionRegistry)
        it.maximumSessions(-1)
      })
    })
    .exceptionHandling((it) => {
      it.defaultAuthenticationEntryPointFor(o.opdsAuthenticationEntryPoint, PathPatternRequestMatcher.withDefaults().matcher('/opds/v2/**'))
    })
  if (o.oauth2 !== undefined && ctx.getBeansOfType(InMemoryClientRegistrationRepository).length > 0) {
    const services = o.oauth2
    http.oauth2Login((oauth2) => {
      oauth2.userInfoEndpoint((it) => {
        it.userService(services.oauth2UserService)
        it.oidcUserService(services.oidcUserService)
      })
      oauth2.authenticationDetailsSource(userAgentWebAuthenticationDetailsSource)
      oauth2
        .loginPage('/login')
        .defaultSuccessUrl('/?server_redirect=Y', true)
        .failureHandler((request, response, exception) => {
          const errorMessage = exception instanceof OAuth2AuthenticationException ? exception.error.errorCode : exception.message
          const url = `/login?server_redirect=Y&error=${errorMessage}`
          new SimpleUrlAuthenticationFailureHandler(url).onAuthenticationFailure(request, response, exception)
        })
      oauth2.redirectionEndpoint(() => {})
    })
  }
  http.rememberMe((it) => {
    const services = new TokenBasedRememberMeServices(o.rememberMeKey, komgaUserDetailsService)
    services.setTokenValiditySeconds(o.rememberMeDays * 86400)
    services.setAuthenticationDetailsSource(userAgentWebAuthenticationDetailsSource)
    services.setCookieName('komga-remember-me')
    it.rememberMeServices(services)
  })
  http.addFilterAfter(restAuthenticationFilter(), BasicAuthenticationFilter)
  const main = http.build()

  // koboFilterChain
  const koboHttp = new HttpSecurity(ctx)
  koboHttp.invoke((it) => {
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
    it.addFilterBefore(AnonymousAuthenticationFilter, koboAuthenticationFilter())
  })
  const kobo = koboHttp.build()

  // kosyncFilterChain
  const kosyncHttp = new HttpSecurity(ctx)
  kosyncHttp.invoke((it) => {
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
        c.sessionRegistry = theSessionRegistry
        c.maximumSessions = -1
      })
    })
    it.addFilterBefore(AnonymousAuthenticationFilter, kosyncAuthenticationFilter())
  })
  const kosync = kosyncHttp.build()

  return [main, kobo, kosync]
}

/** Point d'entrée OPDS de substitution : même sortie qu'OpdsAuthenticationEntryPoint (document d'authentification fixe) */
export function opdsEntryPointStub(document: (base: string) => unknown): AuthenticationEntryPoint {
  return {
    commence(request, response) {
      const base = `${request.scheme}://${request.serverName}:${request.serverPort}${request.contextPath}`
      response.setContentType('application/opds-authentication+json;charset=UTF-8')
      response.status = 401
      response.setHeader('WWW-Authenticate', 'Basic realm="Realm"')
      response.setHeader('Link', `<${base}/opds/v2/auth>; rel="http://opds-spec.org/auth/document"; type="application/opds-authentication+json"`)
      response.send(JSON.stringify(document(base)))
    },
  }
}

/**
 * Chaînes construites par le jumeau SecurityConfiguration.ts, si ses dépendances sont portées (import dynamique) ;
 * null sinon. KomgaSettingsProvider et OpdsAuthenticationEntryPoint sont remplacés par les mêmes substituts que le miroir.
 */
export async function twinFilterChains(ctx: ApplicationContext, o: MirrorOptions): Promise<SecurityFilterChain[] | null> {
  let mod: typeof import('../../../src/infrastructure/security/SecurityConfiguration.js')
  try {
    mod = await import('../../../src/infrastructure/security/SecurityConfiguration.js')
  } catch {
    return null
  }
  const { Duration } = await import('@js-joda/core')
  const unused = new (await import('../../../src/port/spring-security-oauth2.js')).OAuth2UserService(async () => {
    throw new Error('oauth2 disabled')
  })
  const settings = { rememberMeKey: o.rememberMeKey, rememberMeDuration: Duration.ofDays(o.rememberMeDays) }
  const cfg = new mod.SecurityConfiguration(
    settings as never,
    ctx.getBean(UserDetailsService),
    ctx.getBean(ApiKeyAuthenticationProvider),
    unused as never,
    unused as never,
    ctx.getBean<string>('sessionCookieName'),
    ctx.getBean(WebAuthenticationDetailsSource),
    ctx.getBean(SessionRegistry),
    o.opdsAuthenticationEntryPoint as never,
    ctx.getBean(AuthenticationEventPublisher),
    ctx.getBean(TokenEncoder),
    ctx.getBean(Hasher),
    null,
  )
  return [cfg.filterChain(new HttpSecurity(ctx, 1)), cfg.koboFilterChain(new HttpSecurity(ctx)), cfg.kosyncFilterChain(new HttpSecurity(ctx))]
}
