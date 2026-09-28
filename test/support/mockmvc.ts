// READY 2026-09-28 : API stable, utilisable par les tests des contrôleurs (voir le mode d'emploi ci-dessous).
//
// Support de test : équivalent de MockMvc (spring-test 6.2) et de son DSL Kotlin, de `@AutoConfigureMockMvc`, de
// spring-security-test (`@WithMockUser`, `@WithAnonymousUser`, `@WithSecurityContext`, `SecurityMockMvcRequestPostProcessors`)
// et des assertions employées par les tests Komga (status, jsonPath, content, header, cookie, xpath).
// Ce fichier n'a pas de jumeau Kotlin.
//
// Les requêtes passent en mémoire (sans socket, via light-my-request) par le VRAI pipeline : filtres du conteneur
// (Spring Boot, springSessionRepositoryFilter, springSecurityFilterChain…), DispatcherServlet et page d'erreur
// (dispatch ERROR vers /error) comme le serveur de port/spring-boot-web.ts. Comme MockMvc, un forward n'est pas exécuté
// (URL enregistrée : `response.forwardedUrl`, matcher `forwardedUrl(..)`).
//
// ---------------------------------------------------------------------------------------------------------------
// MODE D'EMPLOI (Kotlin -> TypeScript)
// ---------------------------------------------------------------------------------------------------------------
//   @SpringBootTest @AutoConfigureMockMvc              const ctx = mockMvcTest()          // (properties?, mocks?, { profiles }?) comme springBootTest()
//   class XTest(@Autowired val mockMvc: MockMvc)       const mockMvc = ctx.getBean(MockMvc)
//                                                      afterAll(() => closeContext(ctx))  // (test/SpringBootTest.ts)
//   Comme @SpringBootTest (scan des composants), ce module importe TOUS les modules de src/ (hors port/ et flyway/) :
//   inutile d'importer les contrôleurs ; un module qui ne se charge pas (portage en cours) est signalé (scanFailures).
//
//   @Test @WithMockCustomUser(roles = ["ADMIN"])       it('name', withMockCustomUser({ roles: ['ADMIN'] }, async () => { ... }))
//   fun `name`() { ... }                               (test/interfaces/api/rest/MockSpringSecurity.ts ; ici : withMockUser, withAnonymousUser)
//
//   mockMvc.get("/api/v1/x/{id}", id) {                await mockMvc.get('/api/v1/x/{id}', id, (r) => {   // TOUJOURS await
//     header("X", "y")                                   r.header('X', 'y')
//     contentType = MediaType.APPLICATION_JSON           r.contentType = MediaType.APPLICATION_JSON_VALUE
//     accept = MediaType.APPLICATION_JSON                r.accept = MediaType.APPLICATION_JSON_VALUE     // ou r.accept = [..] / r.accept(..)
//     content = jsonString                               r.content = jsonString                          // string (UTF-8) ou Uint8Array
//     param("sort", "a,asc")                             r.param('sort', 'a,asc')
//     headers { ifNoneMatch = listOf(etag) }             r.headers((h) => { h.ifNoneMatch = [etag] })     // h.set(n, v), h.ifModifiedSince = ..
//     with(httpBasic(u, p)) / with(user(principal))      r.with(httpBasic(u, p)) / r.with(user(principal))
//   }.andExpect {                                      }).andExpect((m) => {
//     status { isOk() }                                  m.status((s) => s.isOk())
//     jsonPath("$.x") { value(1) }                       m.jsonPath('$.x', (j) => j.value(1))            // jsonPath(expr, ...args, dsl) : %s
//     jsonPath("$.a") { value(hasItem("b")) }            m.jsonPath('$.a', (j) => j.value(hasItem('b')))   // hamcrest : test/support/hamcrest.ts
//     header { string("A", containsString("b")) }        m.header((h) => h.string('A', containsString('b')))
//     content { string("..") }                           m.content((c) => c.string('..'))                // json(..), contentType(..), bytes(..)
//     cookie { exists("c"); httpOnly("c", true) }        m.cookie((c) => { c.exists('c'); c.httpOnly('c', true) })
//     xpath("/feed/entry") { nodeCount(2) }              m.xpath('/feed/entry', (x) => x.nodeCount(2))
//   }                                                  })
//   val r = mockMvc.get(url).andReturn().response      const r = (await mockMvc.get(url).andReturn()).response   // ou (await mockMvc.get(url)).response
//   r.getHeader(..) / r.contentAsString                r.getHeader(..) / r.contentAsString / r.contentAsByteArray / r.status / r.getCookie(..)
//   mockMvc.multipart(url) { file("file", bytes) }     await mockMvc.multipart(url, (r) => { r.file('file', bytes) })    // file(new MockMultipartFile(..))
//   val validation: MockMvcResultMatchersDsl.() -> Unit  const validation = (m: MockMvcResultMatchersDsl) => { ... } ; .andExpect(validation)
//   mockMvc.perform(MockMvcRequestBuilders.get(url)    await mockMvc.perform(MockMvcRequestBuilders.get(url).with(user(p)).contentType(..))
//     .with(user(p))).andExpect(jsonPath("$.x")          .andExpect(MockMvcResultMatchers.jsonPath('$.x').value(2))
//     .value(2))
//
// Récepteurs des DSL : passés en argument (et comme `this` pour une `function`). Les actions (`get`, `andExpect`…) sont
// asynchrones : une action non attendue (sans `await`) fait échouer le test (vérifié après chaque test par mockMvcTest).
//
// Sémantique reproduite de spring-test :
// - requête : sans en-têtes Host ni User-Agent (MockHttpServletRequest : serverName localhost, port 80, remoteAddr
//   127.0.0.1) ; URI construite par `UriComponentsBuilder.fromUriString(url).buildAndExpand(vars).encode()` ; les
//   `param(..)` deviennent des paramètres de requête (placés dans la chaîne de requête, '+' préservé comme dans MockMvc) ;
// - contexte de sécurité de test (TestSecurityContextHolder, `with(user(..))`…) remis au SecurityContextHolderFilter
//   (TestSecurityContextRepository, attribut TEST_SECURITY_CONTEXT_ATTRIBUTE de port/spring-security-web.ts) ;
// - exception non traitée par le DispatcherServlet : relancée par `perform` (après rendu de la page d'erreur) ;
// - `status { reason(..) }` : message de `sendError` (MockHttpServletResponse.getErrorMessage) ;
// - jsonPath : Jayway JsonPath (test/support/jsonpath.ts) et JsonPathExpectationsHelper (liste d'un seul élément
//   dépliée pour `value(x)`, chemins indéfinis vides = inexistants…), contenu lu en UTF-8 ;
// - `content { string(..) }` et `response.contentAsString` : jeu de caractères du Content-Type, sinon ISO-8859-1 ;
// - `content { json(..) }` : JSONAssert LENIENT (objets extensibles, ordre des tableaux libre) ou STRICT ;
// - en-têtes : `string(name, ..)` compare la première valeur (getHeader). Différence assumée : les en-têtes ajoutés par
//   le conteneur (Date, Content-Length, Transfer-Encoding, Connection…) sont présents, la réponse étant celle de Tomcat.
import { AsyncLocalStorage } from 'node:async_hooks'
import { readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inject as lightInject } from 'light-my-request'
import { afterEach, vi } from 'vitest'
import '../../src/port/spring-boot-jackson.js'
import '../../src/port/spring-boot-web.js'
import '../../src/port/spring-boot-actuator.js'
import type { Document } from 'domhandler'
import { closeContext as closeSpringContext, springBootTest } from '../SpringBootTest.js'
import { ParsedMediaType } from '../../src/port/media-type.js'
import type { HttpServletRequest, HttpServletResponse } from '../../src/port/servlet.js'
import { ApplicationContext, type Token, component } from '../../src/port/spring.js'
import { ConfigurableServletWebServerFactory, MultipartProperties, buildChains, collectFilters, serviceRequest } from '../../src/port/spring-boot-web.js'
import {
  AnonymousAuthenticationToken,
  type Authentication,
  type GrantedAuthority,
  SecurityContext,
  SecurityContextHolder,
  SimpleGrantedAuthority,
  type UserDetails,
  UsernamePasswordAuthenticationToken,
} from '../../src/port/spring-security.js'
import { TEST_SECURITY_CONTEXT_ATTRIBUTE } from '../../src/port/spring-security-web.js'
import { DispatcherServlet, ERROR_ATTRIBUTE, dispatchRequest } from '../../src/port/spring-web-dispatcher.js'
import { type Matcher, assertThatMatcher, deepEquals, describeValue, isMatcher } from './hamcrest.js'
import { JsonPath } from './jsonpath.js'
import { evaluateXPath, parseXml, stringValue } from './xpath.js'

export * from './hamcrest.js'
export { JsonPath } from './jsonpath.js'

// ---------------------------------------------------------------------------
// Scan des composants (@SpringBootApplication) : tous les modules de src/ (hors port/ et flyway/, chargés à la demande)
// ---------------------------------------------------------------------------

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src')

function listModules(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir).sort()) {
    const f = join(dir, name)
    if (statSync(f).isDirectory()) {
      if (dir === SRC && (name === 'port' || name === 'flyway')) continue
      out.push(...listModules(f))
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts') && !(dir === SRC && name === 'main.ts')) out.push(f)
    // src/main.ts : point d'entrée exécutable (lance l'application), pas un composant
  }
  return out
}

// PORT: tant que OpdsAuthenticationEntryPoint ne se charge pas (dépendances OPDS en cours de portage), il est remplacé
// par un substitut produisant la même réponse (document d'authentification OPDS 2) ; SecurityConfiguration reste le
// jumeau réel. Sans effet dès que le jumeau se charge.
async function loadOpdsAuthenticationEntryPoint(): Promise<void> {
  try {
    await import('../../src/infrastructure/security/OpdsAuthenticationEntryPoint.js')
  } catch (e) {
    const stub = await import('./OpdsAuthenticationEntryPointStub.js')
    vi.doMock('../../src/infrastructure/security/OpdsAuthenticationEntryPoint.js', () => stub)
    console.warn(`[mockmvc] OpdsAuthenticationEntryPoint indisponible (${(e as Error).message.split('\n')[0]}) : substitut utilisé`)
  }
}

/** Modules qui n'ont pas pu être chargés (portage en cours ailleurs) : signalés, pas bloquants */
export const scanFailures: { module: string; error: string }[] = []

async function componentScan(): Promise<void> {
  await loadOpdsAuthenticationEntryPoint()
  for (const f of listModules(SRC)) {
    try {
      await import(/* @vite-ignore */ f)
    } catch (e) {
      scanFailures.push({ module: relative(SRC, f), error: (e as Error).message.split('\n')[0] as string })
    }
  }
  if (scanFailures.length > 0) console.warn(`[mockmvc] ${scanFailures.length} module(s) non chargé(s) : ${scanFailures.map((it) => `${it.module} (${it.error})`).join(' ; ')}`)
}
await componentScan()

// ---------------------------------------------------------------------------
// TestSecurityContextHolder, @WithMockUser, @WithAnonymousUser, @WithSecurityContext
// ---------------------------------------------------------------------------

const testSecurityContextStore = new AsyncLocalStorage<SecurityContext>()

/** `TestSecurityContextHolder` */
export const TestSecurityContextHolder = {
  getContext(): SecurityContext | null {
    return testSecurityContextStore.getStore() ?? null
  },
}

type TestFn<A extends unknown[]> = (...args: A) => unknown

/**
 * `@WithSecurityContext(factory)` (setupBefore = TEST_EXECUTION) : exécute le test avec ce contexte de sécurité
 * (TestSecurityContextHolder + SecurityContextHolder), repris par chaque requête MockMvc du test.
 */
export function withSecurityContext<A extends unknown[]>(factory: () => SecurityContext, fn: TestFn<A>): (...args: A) => Promise<void> {
  return async (...args: A) => {
    const context = factory()
    await testSecurityContextStore.run(context, () => SecurityContextHolder.runWithContext(context, () => fn(...args)))
  }
}

/** `org.springframework.security.core.userdetails.User` */
export class User implements UserDetails {
  constructor(
    readonly username: string,
    readonly password: string | null,
    readonly authorities: GrantedAuthority[],
    readonly enabled = true,
  ) {}
  getAuthorities(): GrantedAuthority[] {
    return this.authorities
  }
  getPassword(): string | null {
    return this.password
  }
  getUsername(): string {
    return this.username
  }
  isAccountNonExpired(): boolean {
    return true
  }
  isAccountNonLocked(): boolean {
    return true
  }
  isCredentialsNonExpired(): boolean {
    return true
  }
  isEnabled(): boolean {
    return this.enabled
  }
  toString(): string {
    return `org.springframework.security.core.userdetails.User [Username=${this.username}, Password=[PROTECTED], Enabled=${this.enabled}, AccountNonExpired=true, CredentialsNonExpired=true, AccountNonLocked=true, Granted Authorities=[${this.authorities.map((a) => a.getAuthority()).join(', ')}]]`
  }
}

function roleAuthorities(roles: string[]): GrantedAuthority[] {
  return roles.map((r) => {
    if (r.startsWith('ROLE_')) throw new Error(`roles cannot start with ROLE_ Got ${r}`)
    return new SimpleGrantedAuthority(`ROLE_${r}`)
  })
}

export type WithMockUserOptions = { value?: string; username?: string; roles?: string[]; authorities?: string[]; password?: string }

/** `@WithMockUser` : User(username = "user", password = "password", roles = ["USER"]) */
export function withMockUser<A extends unknown[]>(options: WithMockUserOptions, fn: TestFn<A>): (...args: A) => Promise<void>
export function withMockUser<A extends unknown[]>(fn: TestFn<A>): (...args: A) => Promise<void>
export function withMockUser<A extends unknown[]>(a: WithMockUserOptions | TestFn<A>, b?: TestFn<A>): (...args: A) => Promise<void> {
  const options = typeof a === 'function' ? {} : a
  const fn = (typeof a === 'function' ? a : b) as TestFn<A>
  return withSecurityContext(() => {
    const username = options.username || options.value || 'user'
    const authorities =
      options.authorities && options.authorities.length > 0
        ? options.authorities.map((it) => new SimpleGrantedAuthority(it))
        : roleAuthorities(options.roles ?? ['USER'])
    const principal = new User(username, options.password ?? 'password', authorities)
    return new SecurityContext(new UsernamePasswordAuthenticationToken(principal, principal.getPassword(), principal.getAuthorities()))
  }, fn)
}

/** `@WithAnonymousUser` */
export function withAnonymousUser<A extends unknown[]>(fn: TestFn<A>): (...args: A) => Promise<void> {
  return withSecurityContext(() => new SecurityContext(new AnonymousAuthenticationToken('key', 'anonymous', [new SimpleGrantedAuthority('ROLE_ANONYMOUS')])), fn)
}

// ---------------------------------------------------------------------------
// RequestPostProcessor (SecurityMockMvcRequestPostProcessors)
// ---------------------------------------------------------------------------

/** Requête en construction (MockHttpServletRequest) */
export class MockRequestSpec {
  method = 'GET'
  /** chemin encodé + chaîne de requête */
  uri = '/'
  readonly headers: [string, string][] = []
  readonly params: [string, string][] = []
  content: Uint8Array | null = null
  readonly attributes = new Map<string, unknown>()
  readonly cookies: { name: string; value: string }[] = []
  readonly files: MockMultipartFile[] = []
  multipart = false
  /** contexte de sécurité posé par un RequestPostProcessor (prioritaire sur TestSecurityContextHolder) */
  securityContext: SecurityContext | null = null

  setHeader(name: string, ...values: string[]): void {
    for (let i = this.headers.length - 1; i >= 0; i--) if ((this.headers[i] as [string, string])[0].toLowerCase() === name.toLowerCase()) this.headers.splice(i, 1)
    this.addHeader(name, ...values)
  }

  addHeader(name: string, ...values: string[]): void {
    for (const v of values) this.headers.push([name, v])
  }

  getHeader(name: string): string | null {
    return this.headers.find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1] ?? null
  }
}

export interface RequestPostProcessor {
  postProcessRequest(request: MockRequestSpec): MockRequestSpec
}

/** `httpBasic(username, password)` : en-tête Authorization */
export function httpBasic(username: string, password: string): RequestPostProcessor {
  return {
    postProcessRequest(request) {
      request.setHeader('Authorization', `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`)
      return request
    },
  }
}

/** `authentication(auth)` */
export function authentication(auth: Authentication): RequestPostProcessor {
  return securityContext(new SecurityContext(auth))
}

/** `securityContext(context)` */
export function securityContext(context: SecurityContext): RequestPostProcessor {
  return {
    postProcessRequest(request) {
      request.securityContext = context
      return request
    },
  }
}

/** `anonymous()` */
export function anonymous(): RequestPostProcessor {
  return authentication(new AnonymousAuthenticationToken('key', 'anonymous', [new SimpleGrantedAuthority('ROLE_ANONYMOUS')]))
}

/** `testSecurityContext()` : appliqué par défaut à chaque requête */
export function testSecurityContext(): RequestPostProcessor {
  return {
    postProcessRequest(request) {
      if (request.securityContext !== null) return request
      const context = TestSecurityContextHolder.getContext()
      if (context !== null && context.authentication !== null) request.securityContext = context
      return request
    },
  }
}

/** `csrf()` : sans effet (CSRF désactivé par Komga) */
export function csrf(): RequestPostProcessor & { asHeader(): RequestPostProcessor } {
  const pp: RequestPostProcessor = { postProcessRequest: (r) => r }
  return { ...pp, asHeader: () => pp }
}

/** `user(username)` (UserRequestPostProcessor : roles, password, authorities) ou `user(userDetails)` */
export class UserRequestPostProcessor implements RequestPostProcessor {
  private rolesList: GrantedAuthority[] = [new SimpleGrantedAuthority('ROLE_USER')]
  private pwd = 'password'
  constructor(private readonly username: string) {}
  roles(...roles: string[]): this {
    this.rolesList = roleAuthorities(roles)
    return this
  }
  authorities(...authorities: GrantedAuthority[]): this {
    this.rolesList = authorities
    return this
  }
  password(password: string): this {
    this.pwd = password
    return this
  }
  postProcessRequest(request: MockRequestSpec): MockRequestSpec {
    const principal = new User(this.username, this.pwd, this.rolesList)
    return user(principal).postProcessRequest(request)
  }
}

export function user(username: string): UserRequestPostProcessor
export function user(principal: UserDetails): RequestPostProcessor
export function user(u: string | UserDetails): RequestPostProcessor {
  if (typeof u === 'string') return new UserRequestPostProcessor(u)
  return authentication(new UsernamePasswordAuthenticationToken(u, u.getPassword(), u.getAuthorities()))
}

/** `SecurityMockMvcRequestPostProcessors` */
export const SecurityMockMvcRequestPostProcessors = { httpBasic, authentication, securityContext, anonymous, testSecurityContext, csrf, user }

// ---------------------------------------------------------------------------
// Construction des requêtes
// ---------------------------------------------------------------------------

/** `MockMultipartFile(name, originalFilename = "", contentType = null, content)` */
export class MockMultipartFile {
  readonly originalFilename: string
  readonly contentType: string | null
  readonly bytes: Uint8Array
  constructor(name: string, content: Uint8Array | string)
  constructor(name: string, originalFilename: string | null, contentType: string | null, content: Uint8Array | string | null)
  constructor(
    readonly name: string,
    a: Uint8Array | string | null,
    contentType?: string | null,
    content?: Uint8Array | string | null,
  ) {
    const bytes = (x: Uint8Array | string | null | undefined) => (x === null || x === undefined ? new Uint8Array() : typeof x === 'string' ? new Uint8Array(Buffer.from(x, 'utf8')) : x)
    if (contentType === undefined && content === undefined) {
      this.originalFilename = ''
      this.contentType = null
      this.bytes = bytes(a)
    } else {
      this.originalFilename = (a as string | null) ?? ''
      this.contentType = contentType ?? null
      this.bytes = bytes(content)
    }
  }
}

// Caractères autorisés par composant (HierarchicalUriComponents.Type), le reste est encodé en UTF-8
const PCHAR = /[A-Za-z0-9\-._~!$&'()*+,;=:@]/
function encodeComponent(s: string, allowed: (c: string) => boolean): string {
  let out = ''
  for (const c of s) {
    if (allowed(c)) out += c
    else for (const b of Buffer.from(c, 'utf8')) out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

/** `UriComponentsBuilder.fromUriString(url).buildAndExpand(vars).encode()` : chemin + chaîne de requête encodés */
export function expandAndEncode(urlTemplate: string, uriVars: unknown[]): string {
  let i = 0
  const expanded = urlTemplate.replace(/\{([^/{}]+)\}/g, () => {
    const v = uriVars[i++]
    return v === undefined || v === null ? '' : String(v)
  })
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/[^/?#]*)?([^?#]*)(?:\?([^#]*))?/i.exec(expanded) as RegExpExecArray
  const path = encodeComponent(m[1] ?? '', (c) => c === '/' || PCHAR.test(c))
  const query = m[2]
  if (query === undefined) return path || '/'
  const q = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=')
      const enc = (x: string) => encodeComponent(x, (c) => c !== '=' && c !== '&' && (PCHAR.test(c) || c === '/' || c === '?'))
      return eq < 0 ? enc(pair) : `${enc(pair.slice(0, eq))}=${enc(pair.slice(eq + 1))}`
    })
    .join('&')
  return `${path || '/'}?${q}`
}

/** Paramètre ajouté par `param(..)` : encodé pour être relu à l'identique (MockMvc ne décode pas '+') */
function encodeParam(s: string): string {
  return encodeComponent(s, (c) => /[A-Za-z0-9\-._~]/.test(c))
}

/** DSL `headers { }` (HttpHeaders) */
export class HttpHeadersDsl {
  constructor(private readonly spec: MockRequestSpec) {}
  set(name: string, value: string): void {
    this.spec.setHeader(name, value)
  }
  add(name: string, value: string): void {
    this.spec.addHeader(name, value)
  }
  setBasicAuth(username: string, password: string): void {
    httpBasic(username, password).postProcessRequest(this.spec)
  }
  set ifNoneMatch(values: string | string[]) {
    this.spec.setHeader('If-None-Match', (Array.isArray(values) ? values : [values]).join(', '))
  }
  /** chaîne (valeur brute) ou epoch en millisecondes */
  set ifModifiedSince(value: string | number) {
    this.spec.setHeader('If-Modified-Since', typeof value === 'number' ? new Date(value).toUTCString() : value)
  }
  set contentType(value: string) {
    this.spec.setHeader('Content-Type', value)
  }
  set accept(values: string | string[]) {
    this.spec.setHeader('Accept', (Array.isArray(values) ? values : [values]).join(', '))
  }
  set authorization(value: string) {
    this.spec.setHeader('Authorization', value)
  }
  set range(value: string) {
    this.spec.setHeader('Range', value)
  }
}

type RequestDsl<R> = (this: R, r: R) => void

/** `MockHttpServletRequestDsl` */
export class MockHttpServletRequestDsl {
  /** `contentType = ..` */
  contentType: string | null = null
  /** `accept = ..` (une ou plusieurs valeurs) */
  private acceptValue: string[] | null = null
  /** `content = ..` (String : UTF-8) */
  content: string | Uint8Array | null = null
  characterEncoding: string | null = null
  /** `secure = true` : schéma https */
  secure = false
  private readonly processors: RequestPostProcessor[] = []

  constructor(readonly spec: MockRequestSpec) {}

  get accept(): ((...types: string[]) => void) & { value: string[] | null } {
    const f = (...types: string[]) => {
      this.acceptValue = types
    }
    return Object.assign(f, { value: this.acceptValue })
  }
  set accept(value: string | string[] | ((...types: string[]) => void)) {
    if (typeof value === 'function') return
    this.acceptValue = Array.isArray(value) ? value : [value]
  }

  header(name: string, ...values: unknown[]): void {
    this.spec.addHeader(name, ...values.map(String))
  }

  headers(dsl: (h: HttpHeadersDsl) => void): void {
    dsl.call(new HttpHeadersDsl(this.spec), new HttpHeadersDsl(this.spec))
  }

  param(name: string, ...values: string[]): void {
    for (const v of values) this.spec.params.push([name, v])
  }

  params(map: Map<string, string[]> | Record<string, string | string[]>): void {
    for (const [k, v] of map instanceof Map ? map : Object.entries(map)) this.param(k, ...(Array.isArray(v) ? v : [v]))
  }

  queryParam(name: string, ...values: string[]): void {
    this.param(name, ...values)
  }

  cookie(...cookies: { name: string; value: string }[]): void {
    this.spec.cookies.push(...cookies)
  }

  requestAttr(name: string, value: unknown): void {
    this.spec.attributes.set(name, value)
  }

  with(processor: RequestPostProcessor): void {
    this.processors.push(processor)
  }

  /** Applique les propriétés et les post-processeurs (dans l'ordre de MockHttpServletRequestBuilder.buildRequest) */
  build(): MockRequestSpec {
    const s = this.spec
    if (this.contentType !== null) s.setHeader('Content-Type', this.contentType + (this.characterEncoding && !/charset=/i.test(this.contentType) ? `;charset=${this.characterEncoding}` : ''))
    if (this.acceptValue !== null) s.setHeader('Accept', this.acceptValue.join(', '))
    if (this.content !== null) s.content = typeof this.content === 'string' ? new Uint8Array(Buffer.from(this.content, 'utf8')) : this.content
    if (this.secure) s.attributes.set('mockmvc.secure', true)
    for (const p of this.processors) p.postProcessRequest(s)
    return s
  }
}

/** `MockMultipartHttpServletRequestDsl` */
export class MockMultipartHttpServletRequestDsl extends MockHttpServletRequestDsl {
  file(name: string, content: Uint8Array | string): void
  file(file: MockMultipartFile): void
  file(a: string | MockMultipartFile, content?: Uint8Array | string): void {
    this.spec.files.push(typeof a === 'string' ? new MockMultipartFile(a, content as Uint8Array | string) : a)
  }
}

/** `MockHttpServletRequestBuilder` (style Java : `MockMvcRequestBuilders.get(url).with(..).contentType(..)`) */
export class MockHttpServletRequestBuilder {
  protected readonly dsl: MockHttpServletRequestDsl
  constructor(method: string, urlTemplate: string, uriVars: unknown[], multipart = false) {
    const spec = new MockRequestSpec()
    spec.method = method
    spec.uri = expandAndEncode(urlTemplate, uriVars)
    spec.multipart = multipart
    this.dsl = multipart ? new MockMultipartHttpServletRequestDsl(spec) : new MockHttpServletRequestDsl(spec)
  }
  with(p: RequestPostProcessor): this {
    this.dsl.with(p)
    return this
  }
  contentType(type: string): this {
    this.dsl.contentType = type
    return this
  }
  accept(...types: string[]): this {
    this.dsl.accept = types
    return this
  }
  content(content: string | Uint8Array): this {
    this.dsl.content = content
    return this
  }
  characterEncoding(encoding: string): this {
    this.dsl.characterEncoding = encoding
    return this
  }
  header(name: string, ...values: unknown[]): this {
    this.dsl.header(name, ...values)
    return this
  }
  headers(h: Record<string, string>): this {
    for (const [k, v] of Object.entries(h)) this.dsl.header(k, v)
    return this
  }
  param(name: string, ...values: string[]): this {
    this.dsl.param(name, ...values)
    return this
  }
  queryParam(name: string, ...values: string[]): this {
    this.dsl.param(name, ...values)
    return this
  }
  cookie(...cookies: { name: string; value: string }[]): this {
    this.dsl.cookie(...cookies)
    return this
  }
  requestAttr(name: string, value: unknown): this {
    this.dsl.requestAttr(name, value)
    return this
  }
  secure(secure: boolean): this {
    this.dsl.secure = secure
    return this
  }
  file(file: MockMultipartFile | string, content?: Uint8Array | string): this {
    this.dsl.spec.files.push(typeof file === 'string' ? new MockMultipartFile(file, content as Uint8Array | string) : file)
    return this
  }
  buildSpec(): MockRequestSpec {
    return this.dsl.build()
  }
}

/** `MockMvcRequestBuilders` */
export const MockMvcRequestBuilders = {
  get: (url: string, ...vars: unknown[]) => new MockHttpServletRequestBuilder('GET', url, vars),
  post: (url: string, ...vars: unknown[]) => new MockHttpServletRequestBuilder('POST', url, vars),
  put: (url: string, ...vars: unknown[]) => new MockHttpServletRequestBuilder('PUT', url, vars),
  patch: (url: string, ...vars: unknown[]) => new MockHttpServletRequestBuilder('PATCH', url, vars),
  delete: (url: string, ...vars: unknown[]) => new MockHttpServletRequestBuilder('DELETE', url, vars),
  head: (url: string, ...vars: unknown[]) => new MockHttpServletRequestBuilder('HEAD', url, vars),
  options: (url: string, ...vars: unknown[]) => new MockHttpServletRequestBuilder('OPTIONS', url, vars),
  request: (method: string, url: string, ...vars: unknown[]) => new MockHttpServletRequestBuilder(method.toUpperCase(), url, vars),
  multipart: (url: string, ...vars: unknown[]) => new MockHttpServletRequestBuilder('POST', url, vars, true),
}

// ---------------------------------------------------------------------------
// Résultat
// ---------------------------------------------------------------------------

/** Cookie lu dans un en-tête Set-Cookie (MockHttpServletResponse.getCookie) */
export class ResponseCookie {
  maxAge = -1
  path: string | null = null
  domain: string | null = null
  secure = false
  httpOnly = false
  sameSite: string | null = null
  expires: string | null = null
  constructor(
    readonly name: string,
    readonly value: string,
  ) {}

  static parse(header: string): ResponseCookie {
    const [first, ...attrs] = header.split(';')
    const eq = (first as string).indexOf('=')
    const c = new ResponseCookie((first as string).slice(0, eq).trim(), (first as string).slice(eq + 1).trim())
    for (const a of attrs) {
      const i = a.indexOf('=')
      const k = (i < 0 ? a : a.slice(0, i)).trim().toLowerCase()
      const v = i < 0 ? '' : a.slice(i + 1).trim()
      if (k === 'max-age') c.maxAge = Number(v)
      else if (k === 'path') c.path = v
      else if (k === 'domain') c.domain = v
      else if (k === 'secure') c.secure = true
      else if (k === 'httponly') c.httpOnly = true
      else if (k === 'samesite') c.sameSite = v
      else if (k === 'expires') c.expires = v
    }
    return c
  }
}

function charsetOf(contentType: string | null): string | null {
  if (contentType === null) return null
  try {
    return ParsedMediaType.parse(contentType).charset
  } catch {
    return null
  }
}

function decode(bytes: Buffer, charset: string): string {
  const cs = charset.toLowerCase()
  if (cs === 'iso-8859-1' || cs === 'latin1' || cs === 'us-ascii') return bytes.toString('latin1')
  return new TextDecoder(cs).decode(bytes)
}

/** `MockHttpServletResponse` (réponse reçue) */
export class MockHttpServletResponse {
  readonly cookies: ResponseCookie[]

  constructor(
    readonly status: number,
    private readonly headerMap: Map<string, string[]>,
    readonly contentAsByteArray: Buffer,
    /** `getErrorMessage()` : message de sendError */
    readonly errorMessage: string | null,
    /** `getForwardedUrl()` : URL d'un forward (non exécuté, comme MockRequestDispatcher) */
    readonly forwardedUrl: string | null = null,
  ) {
    this.cookies = this.getHeaders('Set-Cookie').map((h) => ResponseCookie.parse(h))
  }

  getHeader(name: string): string | null {
    return this.headerMap.get(name.toLowerCase())?.[0] ?? null
  }

  getHeaderValue(name: string): string | null {
    return this.getHeader(name)
  }

  getHeaders(name: string): string[] {
    return this.headerMap.get(name.toLowerCase()) ?? []
  }

  containsHeader(name: string): boolean {
    return this.headerMap.has(name.toLowerCase())
  }

  get headerNames(): string[] {
    return [...this.headerMap.keys()]
  }

  get contentType(): string | null {
    return this.getHeader('Content-Type')
  }

  get characterEncoding(): string {
    return charsetOf(this.contentType) ?? 'ISO-8859-1'
  }

  /** `getContentAsString()` : jeu de caractères de la réponse (ISO-8859-1 par défaut) */
  get contentAsString(): string {
    return decode(this.contentAsByteArray, this.characterEncoding)
  }

  getContentAsString(charset?: string): string {
    return decode(this.contentAsByteArray, charset ?? this.characterEncoding)
  }

  getCookie(name: string): ResponseCookie | null {
    return this.cookies.find((c) => c.name === name) ?? null
  }

  get redirectedUrl(): string | null {
    return this.getHeader('Location')
  }
}

/** `MvcResult` */
export class MvcResult {
  constructor(
    readonly request: HttpServletRequest,
    readonly response: MockHttpServletResponse,
    /** exception résolue par un HandlerExceptionResolver (@ExceptionHandler, ResponseStatusException…) */
    readonly resolvedException: unknown,
  ) {}
}

export type ResultMatcher = (result: MvcResult) => void
export type ResultHandler = (result: MvcResult) => void

// ---------------------------------------------------------------------------
// Assertions (AssertionErrors de spring-test)
// ---------------------------------------------------------------------------

function fail(message: string): never {
  const e = new Error(message)
  e.name = 'AssertionError'
  throw e
}

function assertEquals(message: string, expected: unknown, actual: unknown): void {
  if (!deepEquals(expected, actual)) fail(`${message} expected:<${describeValue(expected)}> but was:<${describeValue(actual)}>`)
}

function assertTrue(message: string, condition: boolean): void {
  if (!condition) fail(message)
}

function valueOrMatcher(reason: string, expected: unknown, actual: unknown): void {
  if (isMatcher(expected)) assertThatMatcher(reason, actual, expected)
  else assertEquals(reason, expected, actual)
}

/** `ObjectUtils.isEmpty` */
function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string' || Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

// ---------------------------------------------------------------------------
// Matchers (même classes pour le style Java — renvoient un ResultMatcher — et pour le DSL Kotlin — assertion immédiate)
// ---------------------------------------------------------------------------

type Emit<R> = (m: ResultMatcher) => R

/** `StatusResultMatchers` */
export class StatusResultMatchers<R = ResultMatcher> {
  constructor(private readonly emit: Emit<R>) {}
  isEqualTo(status: number): R {
    return this.emit((r) => assertEquals('Status', status, r.response.status))
  }
  is(status: number | Matcher<number>): R {
    return this.emit((r) => valueOrMatcher('Response status', status, r.response.status))
  }
  private series(n: number, name: string): R {
    return this.emit((r) => assertEquals(`Range for response status value ${r.response.status}`, name, Math.floor(r.response.status / 100) === n ? name : `${Math.floor(r.response.status / 100)}xx`))
  }
  is1xxInformational(): R {
    return this.series(1, 'INFORMATIONAL')
  }
  is2xxSuccessful(): R {
    return this.series(2, 'SUCCESSFUL')
  }
  is3xxRedirection(): R {
    return this.series(3, 'REDIRECTION')
  }
  is4xxClientError(): R {
    return this.series(4, 'CLIENT_ERROR')
  }
  is5xxServerError(): R {
    return this.series(5, 'SERVER_ERROR')
  }
  /** `reason(..)` : message de sendError */
  reason(reason: string | Matcher<string>): R {
    return this.emit((r) => valueOrMatcher('Response status reason', reason, r.response.errorMessage))
  }
  isOk(): R {
    return this.isEqualTo(200)
  }
  isCreated(): R {
    return this.isEqualTo(201)
  }
  isAccepted(): R {
    return this.isEqualTo(202)
  }
  isNoContent(): R {
    return this.isEqualTo(204)
  }
  isPartialContent(): R {
    return this.isEqualTo(206)
  }
  isMovedPermanently(): R {
    return this.isEqualTo(301)
  }
  isFound(): R {
    return this.isEqualTo(302)
  }
  isSeeOther(): R {
    return this.isEqualTo(303)
  }
  isNotModified(): R {
    return this.isEqualTo(304)
  }
  isTemporaryRedirect(): R {
    return this.isEqualTo(307)
  }
  isPermanentRedirect(): R {
    return this.isEqualTo(308)
  }
  isBadRequest(): R {
    return this.isEqualTo(400)
  }
  isUnauthorized(): R {
    return this.isEqualTo(401)
  }
  isForbidden(): R {
    return this.isEqualTo(403)
  }
  isNotFound(): R {
    return this.isEqualTo(404)
  }
  isMethodNotAllowed(): R {
    return this.isEqualTo(405)
  }
  isNotAcceptable(): R {
    return this.isEqualTo(406)
  }
  isConflict(): R {
    return this.isEqualTo(409)
  }
  isGone(): R {
    return this.isEqualTo(410)
  }
  isPayloadTooLarge(): R {
    return this.isEqualTo(413)
  }
  isUnsupportedMediaType(): R {
    return this.isEqualTo(415)
  }
  isRequestedRangeNotSatisfiable(): R {
    return this.isEqualTo(416)
  }
  isUnprocessableEntity(): R {
    return this.isEqualTo(422)
  }
  isInternalServerError(): R {
    return this.isEqualTo(500)
  }
  isNotImplemented(): R {
    return this.isEqualTo(501)
  }
  isServiceUnavailable(): R {
    return this.isEqualTo(503)
  }
}

/** `HeaderResultMatchers` */
export class HeaderResultMatchers<R = ResultMatcher> {
  constructor(private readonly emit: Emit<R>) {}
  string(name: string, value: string | Matcher<string | null>): R {
    return this.emit((r) => valueOrMatcher(`Response header '${name}'`, value, r.response.getHeader(name)))
  }
  stringValues(name: string, ...values: (string | Matcher)[]): R {
    return this.emit((r) => {
      if (values.length === 1 && isMatcher(values[0])) assertThatMatcher(`Response header '${name}'`, r.response.getHeaders(name), values[0] as Matcher)
      else assertEquals(`Response header '${name}'`, values, r.response.getHeaders(name))
    })
  }
  exists(name: string): R {
    return this.emit((r) => assertTrue(`Response should contain header '${name}'`, r.response.containsHeader(name)))
  }
  doesNotExist(name: string): R {
    return this.emit((r) => assertTrue(`Response should not contain header '${name}'`, !r.response.containsHeader(name)))
  }
  longValue(name: string, value: number): R {
    return this.emit((r) => {
      assertTrue(`Response does not contain header '${name}'`, r.response.containsHeader(name))
      assertEquals(`Response header '${name}'`, value, Number(r.response.getHeader(name)))
    })
  }
  /** `dateValue(name, epochMillis)` : format RFC 1123 */
  dateValue(name: string, value: number): R {
    return this.emit((r) => {
      assertTrue(`Response does not contain header '${name}'`, r.response.containsHeader(name))
      assertEquals(`Response header '${name}'`, new Date(Math.floor(value / 1000) * 1000).toUTCString(), r.response.getHeader(name))
    })
  }
}

/** `CookieResultMatchers` */
export class CookieResultMatchers<R = ResultMatcher> {
  constructor(private readonly emit: Emit<R>) {}
  private get(r: MvcResult, name: string): ResponseCookie {
    const c = r.response.getCookie(name)
    if (c === null) fail(`No cookie with name '${name}'`)
    return c
  }
  exists(name: string): R {
    return this.emit((r) => assertTrue(`No cookie with name '${name}'`, r.response.getCookie(name) !== null))
  }
  doesNotExist(name: string): R {
    return this.emit((r) => {
      const c = r.response.getCookie(name)
      assertTrue(`Unexpected cookie with name '${name}'`, c === null)
    })
  }
  value(name: string, value: string | Matcher<string>): R {
    return this.emit((r) => valueOrMatcher(`Response cookie '${name}'`, value, this.get(r, name).value))
  }
  maxAge(name: string, maxAge: number | Matcher<number>): R {
    return this.emit((r) => valueOrMatcher(`Response cookie '${name}' maxAge`, maxAge, this.get(r, name).maxAge))
  }
  path(name: string, path: string | Matcher<string>): R {
    return this.emit((r) => valueOrMatcher(`Response cookie '${name}' path`, path, this.get(r, name).path))
  }
  domain(name: string, domain: string | Matcher<string>): R {
    return this.emit((r) => valueOrMatcher(`Response cookie '${name}' domain`, domain, this.get(r, name).domain))
  }
  sameSite(name: string, sameSite: string | Matcher<string>): R {
    return this.emit((r) => valueOrMatcher(`Response cookie '${name}' sameSite`, sameSite, this.get(r, name).sameSite))
  }
  secure(name: string, secure: boolean): R {
    return this.emit((r) => assertEquals(`Response cookie '${name}' secure`, secure, this.get(r, name).secure))
  }
  httpOnly(name: string, httpOnly: boolean): R {
    return this.emit((r) => assertEquals(`Response cookie '${name}' httpOnly`, httpOnly, this.get(r, name).httpOnly))
  }
}

/** Mode de comparaison de `content { json(..) }` */
export type JsonCompareMode = 'LENIENT' | 'STRICT'

function jsonCompare(expected: unknown, actual: unknown, strict: boolean, path: string): string | null {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${path}: Expected an array but got ${describeValue(actual)}`
    if (expected.length !== actual.length) return `${path}[]: Expected ${expected.length} values but got ${actual.length}`
    if (strict) {
      for (let i = 0; i < expected.length; i++) {
        const e = jsonCompare(expected[i], actual[i], strict, `${path}[${i}]`)
        if (e) return e
      }
      return null
    }
    const remaining = [...actual]
    for (const e of expected) {
      const i = remaining.findIndex((a) => jsonCompare(e, a, strict, path) === null)
      if (i < 0) return `${path}[]: Expected ${describeValue(e)} but none found`
      remaining.splice(i, 1)
    }
    return null
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return `${path}: Expected an object but got ${describeValue(actual)}`
    const a = actual as Record<string, unknown>
    for (const [k, v] of Object.entries(expected)) {
      if (!Object.hasOwn(a, k)) return `${path ? `${path}.` : ''}${k}: Expected but none found`
      const e = jsonCompare(v, a[k], strict, `${path ? `${path}.` : ''}${k}`)
      if (e) return e
    }
    if (strict) for (const k of Object.keys(a)) if (!Object.hasOwn(expected, k)) return `${path ? `${path}.` : ''}${k}: Unexpected: ${describeValue(a[k])}`
    return null
  }
  return expected === actual || (typeof expected === 'number' && typeof actual === 'number' && expected === actual) ? null : `${path}: Expected: ${describeValue(expected)} got: ${describeValue(actual)}`
}

/** `ContentResultMatchers` */
export class ContentResultMatchers<R = ResultMatcher> {
  constructor(private readonly emit: Emit<R>) {}
  contentType(contentType: string): R {
    return this.emit((r) => {
      const actual = r.response.contentType
      if (actual === null) fail('Content type not set')
      const e = ParsedMediaType.parse(contentType)
      const a = ParsedMediaType.parse(actual)
      const params = (m: ParsedMediaType) => new Map([...m.parameters].map(([k, v]) => [k.toLowerCase(), k.toLowerCase() === 'charset' ? v.toLowerCase() : v]))
      if (!(e.equalsTypeAndSubtype(a) && deepEquals(params(e), params(a)))) fail(`Content type expected:<${contentType}> but was:<${actual}>`)
    })
  }
  contentTypeCompatibleWith(contentType: string): R {
    return this.emit((r) => {
      const actual = r.response.contentType
      if (actual === null) fail('Content type not set')
      assertTrue(`Content type [${actual}] is not compatible with [${contentType}]`, ParsedMediaType.parse(actual).isCompatibleWith(ParsedMediaType.parse(contentType)))
    })
  }
  encoding(encoding: string): R {
    return this.emit((r) => assertEquals('Character encoding', encoding.toUpperCase(), r.response.characterEncoding.toUpperCase()))
  }
  string(expected: string | Matcher<string>): R {
    return this.emit((r) => valueOrMatcher('Response content', expected, r.response.contentAsString))
  }
  bytes(expected: Uint8Array): R {
    return this.emit((r) => assertEquals('Response content', new Uint8Array(expected), new Uint8Array(r.response.contentAsByteArray)))
  }
  /** JSONAssert (LENIENT par défaut, ou `true` / 'STRICT') */
  json(expected: string, mode: boolean | JsonCompareMode = false): R {
    return this.emit((r) => {
      const strict = mode === true || mode === 'STRICT'
      const err = jsonCompare(JSON.parse(expected), JSON.parse(r.response.getContentAsString(charsetOf(r.response.contentType) ?? 'UTF-8')), strict, '')
      if (err) fail(err)
    })
  }
}

/** `JsonPathResultMatchers` (JsonPathExpectationsHelper) */
export class JsonPathResultMatchers<R = ResultMatcher> {
  private readonly jsonPath: JsonPath
  constructor(
    private readonly expression: string,
    private readonly emit: Emit<R>,
  ) {
    this.jsonPath = JsonPath.compile(expression)
  }

  private content(r: MvcResult): unknown {
    const s = r.response.getContentAsString('UTF-8')
    try {
      return JSON.parse(s)
    } catch (e) {
      return fail(`No value at JSON path "${this.expression}" (${(e as Error).message})`)
    }
  }

  private evaluate(r: MvcResult): unknown {
    const json = this.content(r)
    try {
      return this.jsonPath.read(json)
    } catch (e) {
      return fail(`No value at JSON path "${this.expression}"${e instanceof Error ? ` (${e.message})` : ''}`)
    }
  }

  private indefinite(): boolean {
    return !this.jsonPath.isDefinite()
  }

  private assertExistsAndReturn(r: MvcResult): unknown {
    const value = this.evaluate(r)
    const reason = `No value at JSON path "${this.expression}"`
    assertTrue(reason, value !== null && value !== undefined)
    if (this.indefinite() && Array.isArray(value)) assertTrue(reason, value.length > 0)
    return value
  }

  private failureReason(expectedDescription: string, value: unknown): string {
    return `Expected ${expectedDescription} at JSON path "${this.expression}" but found: ${describeValue(value)}`
  }

  value(expected: unknown): R {
    return this.emit((r) => {
      if (isMatcher(expected)) {
        assertThatMatcher(`JSON path "${this.expression}"`, this.evaluate(r), expected)
        return
      }
      let actual = this.evaluate(r)
      if (Array.isArray(actual) && !Array.isArray(expected) && !(expected instanceof Set)) {
        if (actual.length === 0) fail(`No matching value at JSON path "${this.expression}"`)
        if (actual.length !== 1) fail(`Got a list of values ${describeValue(actual)} instead of the expected single value ${describeValue(expected)}`)
        actual = actual[0]
      } else if (actual !== null && actual !== undefined && expected !== null && expected !== undefined && typeof actual !== typeof expected) {
        // types différents : relecture convertie au type attendu (JsonPath.read(content, expectedValue.getClass()), json-smart)
        actual = this.convert(actual, expected)
      }
      assertEquals(`JSON path "${this.expression}"`, expected, actual)
    })
  }

  /** Conversion de json-smart (JsonSmartMappingProvider) vers le type de la valeur attendue */
  private convert(actual: unknown, expected: unknown): unknown {
    const cannot = (): never =>
      fail(`At JSON path "${this.expression}", value <${String(actual)}> of type <${typeof actual}> cannot be converted to type <${typeof expected}>`)
    if (typeof expected === 'number') {
      if (typeof actual === 'string' && /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(actual)) return Number(actual)
      if (typeof actual === 'boolean') return cannot()
      return cannot()
    }
    if (typeof expected === 'string') {
      if (typeof actual === 'number' || typeof actual === 'boolean') return String(actual)
      return actual
    }
    if (typeof expected === 'boolean') {
      if (typeof actual === 'string') return actual.toLowerCase() === 'true'
      if (typeof actual === 'number') return actual !== 0
      return cannot()
    }
    return actual
  }

  exists(): R {
    return this.emit((r) => {
      this.assertExistsAndReturn(r)
    })
  }

  doesNotExist(): R {
    return this.emit((r) => {
      let value: unknown
      try {
        value = this.evaluate(r)
      } catch {
        return
      }
      const reason = this.failureReason('no value', value)
      if (this.indefinite() && Array.isArray(value)) assertTrue(reason, value.length === 0)
      else assertTrue(reason, value === null || value === undefined)
    })
  }

  hasJsonPath(): R {
    return this.emit((r) => {
      const value = this.evaluate(r)
      if (this.indefinite() && Array.isArray(value)) assertTrue(`No values for JSON path "${this.expression}"`, value.length > 0)
    })
  }

  doesNotHaveJsonPath(): R {
    return this.emit((r) => {
      let value: unknown
      try {
        value = this.evaluate(r)
      } catch {
        return
      }
      if (this.indefinite() && Array.isArray(value)) assertTrue(this.failureReason('no values', value), value.length === 0)
      else fail(this.failureReason('no value', value))
    })
  }

  isEmpty(): R {
    return this.emit((r) => {
      const value = this.evaluate(r)
      assertTrue(this.failureReason('an empty value', value), isEmptyValue(value))
    })
  }

  isNotEmpty(): R {
    return this.emit((r) => {
      const value = this.evaluate(r)
      assertTrue(this.failureReason('a non-empty value', value), !isEmptyValue(value))
    })
  }

  isString(): R {
    return this.emit((r) => {
      const v = this.assertExistsAndReturn(r)
      assertTrue(this.failureReason('a string', v), typeof v === 'string')
    })
  }

  isBoolean(): R {
    return this.emit((r) => {
      const v = this.assertExistsAndReturn(r)
      assertTrue(this.failureReason('a boolean', v), typeof v === 'boolean')
    })
  }

  isNumber(): R {
    return this.emit((r) => {
      const v = this.assertExistsAndReturn(r)
      assertTrue(this.failureReason('a number', v), typeof v === 'number')
    })
  }

  isArray(): R {
    return this.emit((r) => {
      const v = this.assertExistsAndReturn(r)
      assertTrue(this.failureReason('an array', v), Array.isArray(v))
    })
  }

  isMap(): R {
    return this.emit((r) => {
      const v = this.assertExistsAndReturn(r)
      assertTrue(this.failureReason('a map', v), v !== null && typeof v === 'object' && !Array.isArray(v))
    })
  }
}

/** `XpathResultMatchers` (sans espaces de noms) */
export class XpathResultMatchers<R = ResultMatcher> {
  constructor(
    private readonly expression: string,
    private readonly emit: Emit<R>,
  ) {}

  private doc(r: MvcResult): Document {
    return parseXml(r.response.getContentAsString(charsetOf(r.response.contentType) ?? 'UTF-8'))
  }

  private nodes(r: MvcResult) {
    const res = evaluateXPath(this.doc(r), this.expression)
    return 'nodes' in res ? res.nodes : null
  }

  private stringOf(r: MvcResult): string {
    const res = evaluateXPath(this.doc(r), this.expression)
    if ('value' in res) return String(res.value)
    return res.nodes[0] ? stringValue(res.nodes[0]) : ''
  }

  string(expected: string | Matcher<string>): R {
    return this.emit((r) => valueOrMatcher(`XPath ${this.expression}`, expected, this.stringOf(r)))
  }

  nodeCount(expected: number | Matcher<number>): R {
    return this.emit((r) => valueOrMatcher(`nodeCount for XPath ${this.expression}`, expected, this.nodes(r)?.length ?? 0))
  }

  exists(): R {
    return this.emit((r) => assertTrue(`XPath ${this.expression} does not exist`, (this.nodes(r)?.length ?? 0) > 0))
  }

  doesNotExist(): R {
    return this.emit((r) => assertTrue(`XPath ${this.expression} exists`, (this.nodes(r)?.length ?? 0) === 0))
  }

  number(expected: number | Matcher<number>): R {
    return this.emit((r) => valueOrMatcher(`XPath ${this.expression}`, expected, Number(this.stringOf(r))))
  }

  booleanValue(expected: boolean): R {
    return this.emit((r) => {
      const res = evaluateXPath(this.doc(r), this.expression)
      const actual = 'nodes' in res ? res.nodes.length > 0 : Boolean(res.value)
      assertEquals(`XPath ${this.expression}`, expected, actual)
    })
  }
}

/** `RequestResultMatchers` (sous-ensemble) */
export class RequestResultMatchers<R = ResultMatcher> {
  constructor(private readonly emit: Emit<R>) {}
  attribute(name: string, expected: unknown): R {
    return this.emit((r) => valueOrMatcher(`Request attribute '${name}'`, expected, r.request.getAttribute(name)))
  }
}

function format(expression: string, args: unknown[]): string {
  let i = 0
  return args.length === 0 ? expression : expression.replace(/%s/g, () => String(args[i++]))
}

/** Sépare `(expr, ...args, dsl)` */
function splitDsl<D>(args: unknown[]): { args: unknown[]; dsl: D | null } {
  const last = args[args.length - 1]
  if (typeof last === 'function') return { args: args.slice(0, -1), dsl: last as D }
  return { args, dsl: null }
}

const RESULT_MATCHER = Symbol('ResultMatcher')

/** ResultMatcher / ResultHandler (style Java) : marqués pour les distinguer d'un DSL (récepteur en argument) */
function mark<T extends (r: MvcResult) => void>(f: T): T {
  ;(f as unknown as Record<symbol, unknown>)[RESULT_MATCHER] = true
  return f
}

function isResultMatcher(f: unknown): boolean {
  return typeof f === 'function' && (f as unknown as Record<symbol, unknown>)[RESULT_MATCHER] === true
}

/** `MockMvcResultMatchers` (style Java) */
export const MockMvcResultMatchers = {
  status: () => new StatusResultMatchers<ResultMatcher>(mark),
  header: () => new HeaderResultMatchers<ResultMatcher>(mark),
  cookie: () => new CookieResultMatchers<ResultMatcher>(mark),
  content: () => new ContentResultMatchers<ResultMatcher>(mark),
  request: () => new RequestResultMatchers<ResultMatcher>(mark),
  jsonPath: (expression: string, ...args: unknown[]) => new JsonPathResultMatchers<ResultMatcher>(format(expression, args), mark),
  xpath: (expression: string, ...args: unknown[]) => new XpathResultMatchers<ResultMatcher>(format(expression, args), mark),
  redirectedUrl: (url: string | null): ResultMatcher => mark((r) => assertEquals('Redirected URL', url, r.response.redirectedUrl)),
  forwardedUrl: (url: string | null): ResultMatcher => mark((r) => assertEquals('Forwarded URL', url, r.response.forwardedUrl)),
  redirectedUrlPattern: (pattern: string): ResultMatcher =>
    mark((r) =>
      assertTrue(`Redirected URL '${r.response.redirectedUrl}' does not match the expected URL pattern`, new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*').replace(/\?/g, '.')}$`).test(r.response.redirectedUrl ?? '')),
    ),
}

type Dsl<R> = (this: R, r: R) => void

function run<R>(receiver: R, dsl: Dsl<R>): void {
  dsl.call(receiver, receiver)
}

/** `MockMvcResultMatchersDsl` */
export class MockMvcResultMatchersDsl {
  constructor(readonly result: MvcResult) {}
  private readonly apply = (m: ResultMatcher): void => m(this.result)

  status(dsl: Dsl<StatusResultMatchers<void>>): void {
    run(new StatusResultMatchers<void>(this.apply), dsl)
  }
  header(dsl: Dsl<HeaderResultMatchers<void>>): void {
    run(new HeaderResultMatchers<void>(this.apply), dsl)
  }
  cookie(dsl: Dsl<CookieResultMatchers<void>>): void {
    run(new CookieResultMatchers<void>(this.apply), dsl)
  }
  content(dsl: Dsl<ContentResultMatchers<void>>): void {
    run(new ContentResultMatchers<void>(this.apply), dsl)
  }
  request(dsl: Dsl<RequestResultMatchers<void>>): void {
    run(new RequestResultMatchers<void>(this.apply), dsl)
  }
  /** `jsonPath(expression, vararg args) { .. }` */
  jsonPath(expression: string, ...rest: [...args: unknown[], dsl: Dsl<JsonPathResultMatchers<void>>]): void {
    const { args, dsl } = splitDsl<Dsl<JsonPathResultMatchers<void>>>(rest)
    run(new JsonPathResultMatchers<void>(format(expression, args), this.apply), dsl as Dsl<JsonPathResultMatchers<void>>)
  }
  /** `xpath(expression, vararg args) { .. }` */
  xpath(expression: string, ...rest: [...args: unknown[], dsl: Dsl<XpathResultMatchers<void>>]): void {
    const { args, dsl } = splitDsl<Dsl<XpathResultMatchers<void>>>(rest)
    run(new XpathResultMatchers<void>(format(expression, args), this.apply), dsl as Dsl<XpathResultMatchers<void>>)
  }
  redirectedUrl(url: string | null): void {
    MockMvcResultMatchers.redirectedUrl(url)(this.result)
  }
  forwardedUrl(url: string | null): void {
    MockMvcResultMatchers.forwardedUrl(url)(this.result)
  }
  redirectedUrlPattern(pattern: string): void {
    MockMvcResultMatchers.redirectedUrlPattern(pattern)(this.result)
  }
  match(matcher: ResultMatcher): void {
    matcher(this.result)
  }
}

/** `MockMvcResultHandlersDsl` */
export class MockMvcResultHandlersDsl {
  constructor(readonly result: MvcResult) {}
  print(): void {
    const r = this.result
    console.log(
      `MockHttpServletRequest: ${r.request.method} ${r.request.requestURI}${r.request.queryString ? `?${r.request.queryString}` : ''}\n` +
        `MockHttpServletResponse: Status = ${r.response.status}, Error message = ${r.response.errorMessage}\n` +
        `  Headers = ${JSON.stringify(Object.fromEntries(r.response.headerNames.map((n) => [n, r.response.getHeaders(n)])))}\n` +
        `  Body = ${r.response.getContentAsString('UTF-8')}`,
    )
  }
  log(): void {
    this.print()
  }
  handle(handler: ResultHandler): void {
    handler(this.result)
  }
}

/** `MockMvcResultHandlers` */
export const MockMvcResultHandlers = {
  print: (): ResultHandler => mark((r) => new MockMvcResultHandlersDsl(r).print()),
  log: (): ResultHandler => mark((r) => new MockMvcResultHandlersDsl(r).print()),
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const pendingActions = new Set<ResultActionsDsl>()

/** URL d'un forward enregistré par MockRequestDispatcher */
const FORWARDED_URL_ATTRIBUTE = 'mockmvc.forwardedUrl'

/**
 * `ResultActionsDsl` / `ResultActions` : thenable (résout le MvcResult après les assertions).
 * Chaque action DOIT être attendue (`await`), sans quoi le test échoue.
 */
export class ResultActionsDsl implements PromiseLike<MvcResult> {
  private promise: Promise<MvcResult>

  constructor(promise: Promise<MvcResult>) {
    this.promise = promise
    pendingActions.add(this)
    // évite un rejet non géré si l'action n'est jamais attendue (signalé par afterEach)
    promise.catch(() => {})
  }

  /** `andExpect { }` (DSL) ou `andExpect(matcher, ...)` (style Java) */
  andExpect(dsl: Dsl<MockMvcResultMatchersDsl>): this
  andExpect(...matchers: ResultMatcher[]): this
  andExpect(...matchers: (ResultMatcher | Dsl<MockMvcResultMatchersDsl>)[]): this {
    this.promise = this.promise.then((r) => {
      for (const m of matchers) {
        if (isResultMatcher(m)) (m as ResultMatcher)(r)
        else run(new MockMvcResultMatchersDsl(r), m as Dsl<MockMvcResultMatchersDsl>)
      }
      return r
    })
    return this
  }

  /** `andExpectAll { }` : toutes les assertions sont évaluées, les échecs regroupés */
  andExpectAll(dsl: Dsl<MockMvcResultMatchersDsl>): this
  andExpectAll(...matchers: ResultMatcher[]): this
  andExpectAll(dsl: Dsl<MockMvcResultMatchersDsl> | ResultMatcher, ...more: ResultMatcher[]): this {
    this.promise = this.promise.then((r) => {
      const errors: Error[] = []
      const soft = new MockMvcResultMatchersDsl(r)
      const guard = (f: () => void) => {
        try {
          f()
        } catch (e) {
          errors.push(e as Error)
        }
      }
      if (more.length > 0 || isResultMatcher(dsl)) for (const m of [dsl as ResultMatcher, ...more]) guard(() => m(r))
      else {
        const proxy = new Proxy(soft, {
          get: (t, p) => {
            const v = (t as unknown as Record<string | symbol, unknown>)[p]
            return typeof v === 'function' ? (...a: unknown[]) => guard(() => (v as (...x: unknown[]) => void).apply(t, a)) : v
          },
        })
        run(proxy, dsl as Dsl<MockMvcResultMatchersDsl>)
      }
      if (errors.length === 1) throw errors[0]
      if (errors.length > 1) fail(`Multiple Exceptions (${errors.length}):\n${errors.map((e) => e.message).join('\n')}`)
      return r
    })
    return this
  }

  /** `andDo { print() }` ou `andDo(handler)` */
  andDo(dsl: Dsl<MockMvcResultHandlersDsl>): this
  andDo(handler: ResultHandler): this
  andDo(handler: Dsl<MockMvcResultHandlersDsl> | ResultHandler): this {
    this.promise = this.promise.then((r) => {
      if (isResultMatcher(handler)) (handler as ResultHandler)(r)
      else run(new MockMvcResultHandlersDsl(r), handler as Dsl<MockMvcResultHandlersDsl>)
      return r
    })
    return this
  }

  /** `andReturn()` */
  andReturn(): Promise<MvcResult> {
    pendingActions.delete(this)
    return this.promise
  }

  // biome-ignore lint/suspicious/noThenProperty: action attendue avec await
  then<T1 = MvcResult, T2 = never>(onfulfilled?: ((value: MvcResult) => T1 | PromiseLike<T1>) | null, onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null): Promise<T1 | T2> {
    pendingActions.delete(this)
    return this.promise.then(onfulfilled, onrejected)
  }
}

/** Vérifie qu'aucune action MockMvc n'a été oubliée sans `await` (appelé après chaque test par mockMvcTest) */
export function assertNoPendingActions(): void {
  if (pendingActions.size === 0) return
  const n = pendingActions.size
  pendingActions.clear()
  fail(`${n} requête(s) MockMvc non attendue(s) : ajouter await devant mockMvc.get/post/…(..).andExpect(..)`)
}

// ---------------------------------------------------------------------------
// MockMvc
// ---------------------------------------------------------------------------

type Chains = ReturnType<typeof buildChains>

type RequestArgs<D> = [...uriVars: unknown[], dsl: RequestDsl<D>] | unknown[]

function multipartBody(spec: MockRequestSpec): { boundary: string; body: Buffer } {
  const boundary = `MockMvcBoundary${Math.random().toString(16).slice(2)}`
  const parts: Buffer[] = []
  for (const [name, value] of spec.params) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf8'))
  }
  for (const f of spec.files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"; filename="${f.originalFilename}"\r\n${f.contentType !== null ? `Content-Type: ${f.contentType}\r\n` : ''}\r\n`,
        'utf8',
      ),
    )
    parts.push(Buffer.from(f.bytes))
    parts.push(Buffer.from('\r\n'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { boundary, body: Buffer.concat(parts) }
}

/** `org.springframework.test.web.servlet.MockMvc` (bean de mockMvcTest : `ctx.getBean(MockMvc)`) */
export class MockMvc {
  private state: { chains: Chains; opts: { contextPath: string; errorPath: string; multipartLimit: number } } | null = null

  constructor(private readonly ctx: ApplicationContext) {}

  private init() {
    if (this.state) return this.state
    const ctx = this.ctx
    const env = ctx.environment
    const factory = ctx.getBean(ConfigurableServletWebServerFactory)
    const dispatcher = ctx.getBean(DispatcherServlet)
    const multipart = ctx.getBean(MultipartProperties)
    const chains = buildChains(collectFilters(ctx), dispatcher)
    // MockRequestDispatcher : un forward n'est pas exécuté, son URL est enregistrée (MockHttpServletResponse.forwardedUrl)
    dispatcher.forward = async (request, _response, path) => {
      request.setAttribute(FORWARDED_URL_ATTRIBUTE, path)
    }
    this.state = {
      chains,
      opts: {
        contextPath: factory.contextPath,
        errorPath: env.getProperty('server.error.path', '/error') as string,
        multipartLimit: multipart.maxRequestSize?.toBytes() ?? Number.MAX_SAFE_INTEGER,
      },
    }
    return this.state
  }

  private request<D extends MockHttpServletRequestDsl>(method: string, urlTemplate: string, args: unknown[], multipart = false): ResultActionsDsl {
    const { args: uriVars, dsl } = splitDsl<RequestDsl<D>>(args)
    const builder = new MockHttpServletRequestBuilder(method, urlTemplate, uriVars, multipart)
    const d = (builder as unknown as { dsl: D }).dsl
    if (dsl) dsl.call(d, d)
    return this.perform(builder)
  }

  get(urlTemplate: string, ...args: RequestArgs<MockHttpServletRequestDsl>): ResultActionsDsl {
    return this.request('GET', urlTemplate, args)
  }
  post(urlTemplate: string, ...args: RequestArgs<MockHttpServletRequestDsl>): ResultActionsDsl {
    return this.request('POST', urlTemplate, args)
  }
  put(urlTemplate: string, ...args: RequestArgs<MockHttpServletRequestDsl>): ResultActionsDsl {
    return this.request('PUT', urlTemplate, args)
  }
  patch(urlTemplate: string, ...args: RequestArgs<MockHttpServletRequestDsl>): ResultActionsDsl {
    return this.request('PATCH', urlTemplate, args)
  }
  delete(urlTemplate: string, ...args: RequestArgs<MockHttpServletRequestDsl>): ResultActionsDsl {
    return this.request('DELETE', urlTemplate, args)
  }
  head(urlTemplate: string, ...args: RequestArgs<MockHttpServletRequestDsl>): ResultActionsDsl {
    return this.request('HEAD', urlTemplate, args)
  }
  options(urlTemplate: string, ...args: RequestArgs<MockHttpServletRequestDsl>): ResultActionsDsl {
    return this.request('OPTIONS', urlTemplate, args)
  }
  /** `mockMvc.request(HttpMethod.X, url) { }` */
  requestWith(method: string, urlTemplate: string, ...args: RequestArgs<MockHttpServletRequestDsl>): ResultActionsDsl {
    return this.request(method.toUpperCase(), urlTemplate, args)
  }
  /** `mockMvc.multipart(url) { file(..) }` (POST) */
  multipart(urlTemplate: string, ...args: RequestArgs<MockMultipartHttpServletRequestDsl>): ResultActionsDsl {
    return this.request<MockMultipartHttpServletRequestDsl>('POST', urlTemplate, args, true)
  }
  /** `mockMvc.multipart(HttpMethod.PUT, url) { }` */
  multipartWith(method: string, urlTemplate: string, ...args: RequestArgs<MockMultipartHttpServletRequestDsl>): ResultActionsDsl {
    return this.request<MockMultipartHttpServletRequestDsl>(method.toUpperCase(), urlTemplate, args, true)
  }

  /** `perform(requestBuilder)` */
  perform(builder: MockHttpServletRequestBuilder): ResultActionsDsl {
    const spec = builder.buildSpec()
    testSecurityContext().postProcessRequest(spec)
    return new ResultActionsDsl(this.execute(spec))
  }

  private async execute(spec: MockRequestSpec): Promise<MvcResult> {
    const s = this.init()
    let request: HttpServletRequest | null = null
    let failure: unknown = null
    let errorMessage: string | null = null
    let sendErrorCalled = false
    const chains: Chains = {
      ...s.chains,
      REQUEST: {
        doFilter: async (req: HttpServletRequest, res: HttpServletResponse) => {
          request = req
          for (const [k, v] of spec.attributes) req.setAttribute(k, v)
          if (spec.securityContext !== null) req.setAttribute(TEST_SECURITY_CONTEXT_ATTRIBUTE, spec.securityContext)
          const sendError = res.sendError.bind(res)
          res.sendError = (status: number, message?: string) => {
            sendErrorCalled = true
            errorMessage = message ?? null
            sendError(status, message)
          }
          try {
            await s.chains.REQUEST.doFilter(req, res)
          } catch (e) {
            failure = e
            throw e
          }
          if (!sendErrorCalled && res.attributesForError !== null) errorMessage = res.attributesForError.message
        },
      },
    }
    // chaîne de requête : URI + param(..)
    let uri = spec.uri
    const headers: Record<string, string> = {}
    for (const [n, v] of spec.headers) {
      const k = n.toLowerCase()
      headers[k] = headers[k] !== undefined ? `${headers[k]}, ${v}` : v
    }
    let payload: Buffer | undefined = spec.content !== null ? Buffer.from(spec.content) : undefined
    if (spec.multipart) {
      const { boundary, body } = multipartBody(spec)
      headers['content-type'] = `multipart/form-data; boundary=${boundary}`
      payload = body
    } else if (spec.params.length > 0) {
      const q = spec.params.map(([k, v]) => `${encodeParam(k)}=${encodeParam(v)}`).join('&')
      uri += (uri.includes('?') ? '&' : '?') + q
    }
    if (spec.cookies.length > 0) headers.cookie = [headers.cookie, ...spec.cookies.map((c) => `${c.name}=${c.value}`)].filter((x) => x).join('; ')
    const hasHost = headers.host !== undefined
    const hasUserAgent = headers['user-agent'] !== undefined
    if (spec.attributes.get('mockmvc.secure') === true) headers['x-forwarded-proto'] ??= 'https'
    const lmr = await lightInject(
      (req, res) => {
        // MockHttpServletRequest : ni Host ni User-Agent par défaut ; URI transmise telle quelle (sans normalisation)
        const raw = req as unknown as { url: string; headers: Record<string, unknown>; rawHeaders: string[] }
        raw.url = uri
        const drop = new Set<string>()
        if (!hasHost) drop.add('host')
        if (!hasUserAgent) drop.add('user-agent')
        for (const h of drop) delete raw.headers[h]
        const rh: string[] = []
        for (let i = 0; i < raw.rawHeaders.length; i += 2) if (!drop.has(String(raw.rawHeaders[i]).toLowerCase())) rh.push(raw.rawHeaders[i] as string, raw.rawHeaders[i + 1] as string)
        raw.rawHeaders = rh
        serviceRequest(chains, req, res, s.opts).catch((e) => {
          failure ??= e
          if (!res.writableEnded) res.end()
        })
      },
      { method: spec.method as never, url: uri, headers, payload },
    )
    if (failure !== null) throw failure
    const headerMap = new Map<string, string[]>()
    for (const [k, v] of Object.entries(lmr.headers)) {
      if (v === undefined) continue
      headerMap.set(k.toLowerCase(), Array.isArray(v) ? v.map(String) : [String(v)])
    }
    const req = request as unknown as HttpServletRequest
    const response = new MockHttpServletResponse(lmr.statusCode, headerMap, lmr.rawPayload, errorMessage, (req?.getAttribute(FORWARDED_URL_ATTRIBUTE) as string | null) ?? null)
    return new MvcResult(req, response, req?.getAttribute(ERROR_ATTRIBUTE) ?? null)
  }
}

component(MockMvc, { inject: [ApplicationContext], lazy: true })

// ---------------------------------------------------------------------------
// @SpringBootTest + @AutoConfigureMockMvc
// ---------------------------------------------------------------------------

/**
 * `@SpringBootTest @AutoConfigureMockMvc` : contexte complet (test/SpringBootTest.ts) avec la couche web ;
 * `ctx.getBean(MockMvc)` donne le MockMvc. Vérifie après chaque test qu'aucune requête n'a été oubliée sans await.
 */
export function mockMvcTest(
  properties: Record<string, unknown> = {},
  mocks: Parameters<typeof springBootTest>[1] = [],
  options: Parameters<typeof springBootTest>[2] = {},
): ApplicationContext {
  afterEach(() => assertNoPendingActions())
  // pas de délai par test pour les tests Spring : le premier appel initialise le pipeline (et la machine peut être chargée)
  vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })
  return springBootTest(properties, mocks, options)
}

export function closeContext(ctx: ApplicationContext): Promise<void> {
  return closeSpringContext(ctx)
}

export type { Token }
