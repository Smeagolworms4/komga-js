// Support de portage : sous-ensemble de Spring MVC (Spring Framework 6.2 / Spring Boot 3.5) utilisé par Komga.
// Ce fichier fixe le CONTRAT de déclaration des contrôleurs (équivalent des annotations) ; l'exécution des
// requêtes (DispatcherServlet) est dans port/spring-web-dispatcher.ts. Ce fichier n'a pas de jumeau Kotlin.
//
// Un contrôleur Kotlin se porte ainsi (même ordre des méthodes et des paramètres) :
//
//   export class ClaimController {
//     constructor(private readonly userDetailsLifecycle: KomgaUserLifecycle) {}
//     getClaimStatus(): ClaimStatus { ... }
//     claimAdmin(email: string, password: string): UserDto { ... }
//   }
//   restController(ClaimController, {
//     inject: [KomgaUserLifecycle],
//     requestMapping: { path: ['api/v1/claim'] },          // @RequestMapping de classe
//     handlers: {
//       getClaimStatus: { mapping: { method: 'GET' } },   // @GetMapping
//       claimAdmin: {
//         mapping: { method: 'POST' },
//         args: [requestHeader('X-Komga-Email'), requestHeader('X-Komga-Password')],
//       },
//     },
//   })
import type { Readable, Writable } from 'node:stream'
import type { JavaType } from './jackson-mapper.js'
import { Exception, KEnum, RuntimeException } from './kotlin.js'
import type { HttpServletRequest, HttpServletResponse } from './servlet.js'
import { type ComponentOptions, component } from './spring.js'

// ---------------------------------------------------------------------------
// HttpStatus / MediaType
// ---------------------------------------------------------------------------

export class HttpStatus extends KEnum {
  static readonly CONTINUE = new HttpStatus('CONTINUE', 100, 'Continue')
  static readonly OK = new HttpStatus('OK', 200, 'OK')
  static readonly CREATED = new HttpStatus('CREATED', 201, 'Created')
  static readonly ACCEPTED = new HttpStatus('ACCEPTED', 202, 'Accepted')
  static readonly NO_CONTENT = new HttpStatus('NO_CONTENT', 204, 'No Content')
  static readonly PARTIAL_CONTENT = new HttpStatus('PARTIAL_CONTENT', 206, 'Partial Content')
  static readonly MOVED_PERMANENTLY = new HttpStatus('MOVED_PERMANENTLY', 301, 'Moved Permanently')
  static readonly FOUND = new HttpStatus('FOUND', 302, 'Found')
  static readonly SEE_OTHER = new HttpStatus('SEE_OTHER', 303, 'See Other')
  static readonly NOT_MODIFIED = new HttpStatus('NOT_MODIFIED', 304, 'Not Modified')
  static readonly TEMPORARY_REDIRECT = new HttpStatus('TEMPORARY_REDIRECT', 307, 'Temporary Redirect')
  static readonly BAD_REQUEST = new HttpStatus('BAD_REQUEST', 400, 'Bad Request')
  static readonly UNAUTHORIZED = new HttpStatus('UNAUTHORIZED', 401, 'Unauthorized')
  static readonly FORBIDDEN = new HttpStatus('FORBIDDEN', 403, 'Forbidden')
  static readonly NOT_FOUND = new HttpStatus('NOT_FOUND', 404, 'Not Found')
  static readonly METHOD_NOT_ALLOWED = new HttpStatus('METHOD_NOT_ALLOWED', 405, 'Method Not Allowed')
  static readonly NOT_ACCEPTABLE = new HttpStatus('NOT_ACCEPTABLE', 406, 'Not Acceptable')
  static readonly CONFLICT = new HttpStatus('CONFLICT', 409, 'Conflict')
  static readonly GONE = new HttpStatus('GONE', 410, 'Gone')
  static readonly PAYLOAD_TOO_LARGE = new HttpStatus('PAYLOAD_TOO_LARGE', 413, 'Payload Too Large')
  static readonly UNSUPPORTED_MEDIA_TYPE = new HttpStatus('UNSUPPORTED_MEDIA_TYPE', 415, 'Unsupported Media Type')
  static readonly REQUESTED_RANGE_NOT_SATISFIABLE = new HttpStatus('REQUESTED_RANGE_NOT_SATISFIABLE', 416, 'Requested Range Not Satisfiable')
  static readonly UNPROCESSABLE_ENTITY = new HttpStatus('UNPROCESSABLE_ENTITY', 422, 'Unprocessable Entity')
  static readonly INTERNAL_SERVER_ERROR = new HttpStatus('INTERNAL_SERVER_ERROR', 500, 'Internal Server Error')
  static readonly NOT_IMPLEMENTED = new HttpStatus('NOT_IMPLEMENTED', 501, 'Not Implemented')
  static readonly SERVICE_UNAVAILABLE = new HttpStatus('SERVICE_UNAVAILABLE', 503, 'Service Unavailable')

  private constructor(
    name: string,
    readonly value: number,
    readonly reasonPhrase: string,
  ) {
    super(name)
  }

  static valueOfCode(code: number): HttpStatus | null {
    return HttpStatus.entries().find((s) => s.value === code) ?? null
  }

  is2xxSuccessful(): boolean {
    return this.value >= 200 && this.value < 300
  }
}

/** `org.springframework.http.MediaType` (valeurs `_VALUE` = chaînes) */
export const MediaType = {
  ALL_VALUE: '*/*',
  APPLICATION_JSON_VALUE: 'application/json',
  APPLICATION_XML_VALUE: 'application/xml',
  APPLICATION_ATOM_XML_VALUE: 'application/atom+xml',
  APPLICATION_OCTET_STREAM_VALUE: 'application/octet-stream',
  APPLICATION_PDF_VALUE: 'application/pdf',
  MULTIPART_FORM_DATA_VALUE: 'multipart/form-data',
  TEXT_PLAIN_VALUE: 'text/plain',
  TEXT_XML_VALUE: 'text/xml',
  TEXT_HTML_VALUE: 'text/html',
  TEXT_EVENT_STREAM_VALUE: 'text/event-stream',
  IMAGE_JPEG_VALUE: 'image/jpeg',
  IMAGE_PNG_VALUE: 'image/png',
  IMAGE_GIF_VALUE: 'image/gif',
  parseMediaType: (s: string): string => s,
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

/** `org.springframework.web.server.ResponseStatusException` */
export class ResponseStatusException extends RuntimeException {
  constructor(
    readonly status: HttpStatus,
    readonly reason: string | null = null,
    cause?: unknown,
  ) {
    super(`${status.value} ${status.name}${reason ? ` "${reason}"` : ''}`, cause)
  }
}

/** Exception annotée `@ResponseStatus(code, reason)` : `responseStatusOf(ExceptionClass, HttpStatus.X, 'raison')` */
const exceptionStatuses = new WeakMap<object, { status: HttpStatus; reason: string | null }>()
export function responseStatusOf(cls: object, status: HttpStatus, reason: string | null = null): void {
  exceptionStatuses.set(cls, { status, reason })
}
export function exceptionStatusOf(e: unknown): { status: HttpStatus; reason: string | null } | null {
  let c = e !== null && typeof e === 'object' ? (e.constructor as object | null) : null
  while (c) {
    const s = exceptionStatuses.get(c)
    if (s) return s
    c = Object.getPrototypeOf(c) as object | null
  }
  return null
}

/** Paramètre obligatoire absent, conversion impossible, corps illisible… (400) */
export class ServletRequestBindingException extends Exception {}
export class MissingServletRequestParameterException extends ServletRequestBindingException {}
export class MethodArgumentTypeMismatchException extends Exception {}
export class HttpMessageNotReadableException extends Exception {}
/** `@Valid` en échec (400) : erreurs par champ */
export class MethodArgumentNotValidException extends Exception {
  constructor(readonly errors: { field: string; message: string; rejectedValue: unknown }[]) {
    super(`Validation failed: ${errors.map((e) => `${e.field} ${e.message}`).join(', ')}`)
  }
}
/** `@Validated` sur des paramètres simples (400) */
export class HandlerMethodValidationException extends Exception {}
export class HttpMediaTypeNotAcceptableException extends Exception {}
export class HttpMediaTypeNotSupportedException extends Exception {}
export class HttpRequestMethodNotSupportedException extends Exception {}
export class NoResourceFoundException extends Exception {}
/** Levée par @PreAuthorize (403, ou 401 si anonyme) */
export class AccessDeniedException extends RuntimeException {}

// ---------------------------------------------------------------------------
// Valeurs de retour
// ---------------------------------------------------------------------------

export class HttpHeaders {
  readonly entries = new Map<string, string[]>()
  set(name: string, value: string): this {
    this.entries.set(name.toLowerCase(), [value])
    return this
  }
  add(name: string, value: string): this {
    const l = this.entries.get(name.toLowerCase())
    if (l) l.push(value)
    else this.entries.set(name.toLowerCase(), [value])
    return this
  }
  getFirst(name: string): string | null {
    return this.entries.get(name.toLowerCase())?.[0] ?? null
  }
  /** `contentDisposition = ContentDisposition.builder("attachment").filename(name, UTF_8).build()` */
  setContentDisposition(disposition: string): this {
    return this.set('Content-Disposition', disposition)
  }
}

/** `ContentDisposition.builder(type).filename(name[, UTF_8]).build().toString()` (format de Spring) */
export function contentDisposition(type: string, filename?: string, utf8 = false): string {
  if (filename === undefined) return type
  if (!utf8) return `${type}; filename="${filename.replace(/(["\\])/g, '\\$1')}"`
  // RFC 5987 : Spring encode aussi un filename= ASCII (non-ASCII remplacés)
  const encoded = Array.from(Buffer.from(filename, 'utf8'))
    .map((b) => (/[A-Za-z0-9!#$&+.^_`|~-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, '0')}`))
    .join('')
  return `${type}; filename*=UTF-8''${encoded}`
}

/** `org.springframework.http.ResponseEntity` */
export class ResponseEntity<T = unknown> {
  constructor(
    readonly body: T | null,
    readonly headers: HttpHeaders,
    readonly status: HttpStatus | number,
  ) {}

  static ok(): BodyBuilder
  static ok<T>(body: T): ResponseEntity<T>
  static ok<T>(body?: T): ResponseEntity<T> | BodyBuilder {
    const b = ResponseEntity.status(HttpStatus.OK)
    return body === undefined ? b : b.body(body)
  }
  static status(status: HttpStatus | number): BodyBuilder {
    return new BodyBuilder(status)
  }
  static noContent(): BodyBuilder {
    return new BodyBuilder(HttpStatus.NO_CONTENT)
  }
  static notFound(): BodyBuilder {
    return new BodyBuilder(HttpStatus.NOT_FOUND)
  }
  static badRequest(): BodyBuilder {
    return new BodyBuilder(HttpStatus.BAD_REQUEST)
  }
  static accepted(): BodyBuilder {
    return new BodyBuilder(HttpStatus.ACCEPTED)
  }
  get statusCode(): number {
    return typeof this.status === 'number' ? this.status : this.status.value
  }
}

export class BodyBuilder {
  readonly headers = new HttpHeaders()
  constructor(readonly status: HttpStatus | number) {}
  header(name: string, ...values: string[]): this {
    for (const v of values) this.headers.add(name, v)
    return this
  }
  headersFrom(fn: (h: HttpHeaders) => void): this {
    fn(this.headers)
    return this
  }
  contentType(type: string): this {
    this.headers.set('Content-Type', type)
    return this
  }
  contentLength(len: number): this {
    this.headers.set('Content-Length', String(len))
    return this
  }
  lastModified(epochMillis: number): this {
    this.headers.set('Last-Modified', new Date(Math.floor(epochMillis / 1000) * 1000).toUTCString())
    return this
  }
  eTag(etag: string): this {
    this.headers.set('ETag', etag.startsWith('"') || etag.startsWith('W/') ? etag : `"${etag}"`)
    return this
  }
  /** `cacheControl(CacheControl.x())` : valeur de l'en-tête */
  cacheControl(value: string): this {
    this.headers.set('Cache-Control', value)
    return this
  }
  location(uri: string): this {
    this.headers.set('Location', uri)
    return this
  }
  body<T>(body: T): ResponseEntity<T> {
    return new ResponseEntity<T>(body, this.headers, this.status)
  }
  build<T>(): ResponseEntity<T> {
    return new ResponseEntity<T>(null, this.headers, this.status)
  }
}

/** `CacheControl` : rendu identique à Spring */
export const CacheControl = {
  noStore: (): string => 'no-store',
  noCache: (): string => 'no-cache',
  maxAge: (seconds: number, opts: { cachePublic?: boolean; cachePrivate?: boolean; noTransform?: boolean; mustRevalidate?: boolean } = {}): string =>
    [`max-age=${seconds}`, opts.mustRevalidate ? 'must-revalidate' : null, opts.noTransform ? 'no-transform' : null, opts.cachePublic ? 'public' : null, opts.cachePrivate ? 'private' : null]
      .filter((x) => x !== null)
      .join(', '),
}

/** `org.springframework.core.io.Resource` : fichier ou octets, avec prise en charge des requêtes Range */
export abstract class Resource {
  abstract contentLength(): number
  abstract getInputStream(range?: { start: number; end: number }): Readable
  abstract get filename(): string | null
  lastModified(): number | null {
    return null
  }
  exists(): boolean {
    return true
  }
}

/** Corps écrit en flux (`StreamingResponseBody`) */
export type StreamingResponseBody = (out: Writable) => void | Promise<void>
export const STREAMING = Symbol('StreamingResponseBody')
/** Marque une fonction comme StreamingResponseBody (les fonctions JS ne portent pas de type) */
export function streamingResponseBody(fn: StreamingResponseBody): StreamingResponseBody & { [STREAMING]: true } {
  return Object.assign(fn, { [STREAMING]: true as const })
}

// ---------------------------------------------------------------------------
// Déclaration des contrôleurs
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/** `@RequestMapping` / `@GetMapping` ... : attributs identiques à Spring */
export type RequestMappingSpec = {
  method?: HttpMethod | HttpMethod[]
  /** `value` / `path` (sans ou avec / initial, comme en Kotlin) */
  path?: string[]
  produces?: string[]
  consumes?: string[]
  /** conditions `params = ["x", "!y", "z=1"]` */
  params?: string[]
  /** conditions `headers = [...]` */
  headers?: string[]
}

/** Type de conversion d'un paramètre de requête (ConversionService) */
export type ParamType = JavaType

/** Résolution d'un argument de méthode (équivalent d'une annotation de paramètre ou d'un type résolu par Spring) */
export type ArgSpec =
  | { kind: 'pathVariable'; name: string; type: ParamType; required: boolean }
  | { kind: 'requestParam'; name: string; type: ParamType; required: boolean; defaultValue: string | null }
  | { kind: 'requestParamMap' }
  | { kind: 'requestHeader'; name: string; type: ParamType; required: boolean; defaultValue: string | null }
  | { kind: 'requestBody'; type: JavaType; required: boolean; valid: boolean }
  | { kind: 'requestPart'; name: string; required: boolean }
  | { kind: 'cookieValue'; name: string; required: boolean }
  | { kind: 'authenticationPrincipal' }
  | { kind: 'pageable'; defaultSize: number; defaultPage: number; defaultSort?: string[] }
  | { kind: 'sort' }
  | { kind: 'request' }
  | { kind: 'response' }
  | { kind: 'webRequest' }
  | { kind: 'principal' }
  | { kind: 'session' }
  /** Résolveur d'argument personnalisé (HandlerMethodArgumentResolver) désigné par son nom */
  | { kind: 'custom'; resolver: string; name: string; required: boolean }

export const pathVariable = (name: string, type: ParamType = 'String', { required = true }: { required?: boolean } = {}): ArgSpec => ({
  kind: 'pathVariable',
  name,
  type,
  required,
})
export const requestParam = (
  name: string,
  type: ParamType = 'String',
  { required = true, defaultValue = null }: { required?: boolean; defaultValue?: string | null } = {},
): ArgSpec => ({ kind: 'requestParam', name, type, required: defaultValue === null ? required : false, defaultValue })
export const requestParamMap = (): ArgSpec => ({ kind: 'requestParamMap' })
export const requestHeader = (
  name: string,
  type: ParamType = 'String',
  { required = true, defaultValue = null }: { required?: boolean; defaultValue?: string | null } = {},
): ArgSpec => ({ kind: 'requestHeader', name, type, required: defaultValue === null ? required : false, defaultValue })
export const requestBody = (type: JavaType, { required = true, valid = false }: { required?: boolean; valid?: boolean } = {}): ArgSpec => ({
  kind: 'requestBody',
  type,
  required,
  valid,
})
export const requestPart = (name: string, { required = true }: { required?: boolean } = {}): ArgSpec => ({ kind: 'requestPart', name, required })
export const cookieValue = (name: string, { required = true }: { required?: boolean } = {}): ArgSpec => ({ kind: 'cookieValue', name, required })
export const authenticationPrincipal = (): ArgSpec => ({ kind: 'authenticationPrincipal' })
/** `Pageable` (`@PageableDefault` optionnel) : paramètres page, size, sort (spring.data.web) */
export const pageable = ({ size = 20, page = 0, sort }: { size?: number; page?: number; sort?: string[] } = {}): ArgSpec => ({
  kind: 'pageable',
  defaultSize: size,
  defaultPage: page,
  defaultSort: sort,
})
export const sortArg = (): ArgSpec => ({ kind: 'sort' })
export const request = (): ArgSpec => ({ kind: 'request' })
export const response = (): ArgSpec => ({ kind: 'response' })
export const webRequest = (): ArgSpec => ({ kind: 'webRequest' })
export const principal = (): ArgSpec => ({ kind: 'principal' })
export const session = (): ArgSpec => ({ kind: 'session' })
export const customArg = (resolver: string, name: string, { required = true }: { required?: boolean } = {}): ArgSpec => ({
  kind: 'custom',
  resolver,
  name,
  required,
})

export type HandlerSpec = {
  mapping: RequestMappingSpec
  args?: ArgSpec[]
  /** `@ResponseStatus(HttpStatus.X)` sur la méthode */
  responseStatus?: HttpStatus
  /** `@PreAuthorize("hasRole('X')")` : rôle exigé */
  preAuthorize?: string
  /** Type Kotlin de retour, pour la sérialisation JSON (Float…) ; facultatif si les DTO déclarent jsonProperties */
  returns?: JavaType
}

export type ControllerSpec = ComponentOptions & {
  /** `@RequestMapping` au niveau de la classe */
  requestMapping?: RequestMappingSpec
  /** `@RestController` (true) ou `@Controller` (false : valeur de retour = vue / redirection) */
  rest?: boolean
  handlers: Record<string, HandlerSpec>
  /** `@ExceptionHandler` de ce contrôleur : méthode -> classes d'exceptions */
  exceptionHandlers?: Record<string, { exceptions: (abstract new (...a: never[]) => unknown)[]; responseStatus?: HttpStatus }>
}

type ControllerRegistration = { type: abstract new (...a: never[]) => unknown; spec: ControllerSpec }
const controllers: ControllerRegistration[] = []

/** `@RestController` (ou `@Controller` avec `rest: false`) */
export function restController<T>(cls: abstract new (...a: never[]) => T, spec: ControllerSpec): void {
  component(cls as never, spec)
  controllers.push({ type: cls as never, spec: { rest: true, ...spec } })
}

export function registeredControllers(): readonly ControllerRegistration[] {
  return controllers
}

type AdviceRegistration = { type: abstract new (...a: never[]) => unknown; handlers: NonNullable<ControllerSpec['exceptionHandlers']> }
const advices: AdviceRegistration[] = []

/** `@ControllerAdvice` / `@RestControllerAdvice` avec ses `@ExceptionHandler` */
export function controllerAdvice<T>(
  cls: abstract new (...a: never[]) => T,
  spec: ComponentOptions & { exceptionHandlers: NonNullable<ControllerSpec['exceptionHandlers']> },
): void {
  component(cls as never, spec)
  advices.push({ type: cls as never, handlers: spec.exceptionHandlers })
}

export function registeredAdvices(): readonly AdviceRegistration[] {
  return advices
}

/** `HandlerMethodArgumentResolver` personnalisé (WebMvcConfigurer.addArgumentResolvers) */
export interface HandlerMethodArgumentResolver {
  resolveArgument(name: string, request: HttpServletRequest): unknown
}

/** `WebRequest` / `ServletWebRequest` */
export interface WebRequest {
  readonly request: HttpServletRequest
  readonly response: HttpServletResponse
  /** `checkNotModified(lastModifiedEpochMillis)` / `checkNotModified(etag)` / les deux : true -> 304 déjà préparé */
  checkNotModified(etagOrLastModified: string | number, lastModified?: number): boolean
  getHeader(name: string): string | null
  getParameter(name: string): string | null
}
