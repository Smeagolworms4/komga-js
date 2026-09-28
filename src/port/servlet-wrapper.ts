// Support de portage : jakarta.servlet.http.HttpServletRequestWrapper / HttpServletResponseWrapper et
// les accès aux paramètres (getParameterNames / getParameterMap) absents de port/servlet.ts.
// Un wrapper est une instance de HttpServletRequest (resp. HttpServletResponse) dont tous les membres
// délèguent à l'objet enveloppé ; une sous-classe redéfinit les membres voulus, comme en Java.
// Ce fichier n'a pas de jumeau Kotlin.
import { type Cookie, type HttpServletRequest as Req, HttpServletRequest, HttpServletResponse, type HttpSession, type MultipartFile, type SessionProvider } from './servlet.js'
import type { Readable, Writable } from 'node:stream'

/** `request.getParameterNames()` (honore les wrappers) */
export function parameterNames(request: Req): string[] {
  if (request instanceof HttpServletRequestWrapper) return request.getParameterNames()
  return [...request.parameters.keys()]
}

/** `request.getParameterMap()` (honore les wrappers) */
export function parameterMap(request: Req): Map<string, string[]> {
  if (request instanceof HttpServletRequestWrapper) return request.getParameterMap()
  return new Map([...request.parameters].map(([k, v]) => [k, [...v]]))
}

/** Requête d'origine sous les wrappers */
export function unwrapRequest(request: Req): Req {
  let r = request
  while (r instanceof HttpServletRequestWrapper) r = r.getRequest()
  return r
}

/** `jakarta.servlet.http.HttpServletRequestWrapper` */
export class HttpServletRequestWrapper extends HttpServletRequest {
  declare private readonly wrapped: Req

  constructor(request: Req) {
    // PORT: les champs de HttpServletRequest sont initialisés par son constructeur (analyse de la requête) :
    // le wrapper ne l'appelle pas et délègue tous ses membres à la requête enveloppée.
    const self = Object.create(new.target.prototype) as HttpServletRequestWrapper
    Object.defineProperty(self, 'wrapped', { value: request, writable: true })
    // biome-ignore lint/correctness/noConstructorReturn: délégation
    return self
    // eslint-disable-next-line no-unreachable
    super(request.raw, request.body, request.contextPath)
  }

  getRequest(): Req {
    return this.wrapped
  }

  setRequest(request: Req): void {
    ;(this as unknown as { wrapped: Req }).wrapped = request
  }

  getParameterNames(): string[] {
    return parameterNames(this.wrapped)
  }

  getParameterMap(): Map<string, string[]> {
    return parameterMap(this.wrapped)
  }
}

type RequestMembers = Record<string, unknown>
const requestProps: [string, 'get' | 'getset'][] = [
  ['attributes', 'get'],
  ['method', 'get'],
  ['parameters', 'get'],
  ['parts', 'get'],
  ['cookies', 'get'],
  ['sessionProvider', 'getset'],
  ['userPrincipal', 'getset'],
  ['raw', 'get'],
  ['body', 'get'],
  ['contextPath', 'get'],
  ['contentType', 'get'],
  ['requestURI', 'get'],
  ['servletPath', 'get'],
  ['queryString', 'get'],
  ['requestURL', 'get'],
  ['scheme', 'get'],
  ['serverName', 'get'],
  ['serverPort', 'get'],
  ['isSecure', 'get'],
  ['remoteAddr', 'get'],
]
for (const [name, mode] of requestProps)
  Object.defineProperty(HttpServletRequestWrapper.prototype, name, {
    configurable: true,
    get(this: { wrapped: RequestMembers }) {
      return this.wrapped[name]
    },
    ...(mode === 'getset'
      ? {
          set(this: { wrapped: RequestMembers }, v: unknown) {
            this.wrapped[name] = v
          },
        }
      : {}),
  })
for (const name of [
  'getHeader',
  'getHeaders',
  'getHeaderNames',
  'getParameter',
  'getParameterValues',
  'getCookies',
  'getInputStream',
  'getSession',
  'peekSession',
  'resetSessionCache',
  'getAttribute',
  'setAttribute',
])
  Object.defineProperty(HttpServletRequestWrapper.prototype, name, {
    configurable: true,
    writable: true,
    value(this: { wrapped: RequestMembers }, ...args: unknown[]) {
      return (this.wrapped[name] as (...a: unknown[]) => unknown).apply(this.wrapped, args)
    },
  })

/** `jakarta.servlet.http.HttpServletResponseWrapper` */
export class HttpServletResponseWrapper extends HttpServletResponse {
  declare private readonly wrapped: HttpServletResponse

  constructor(response: HttpServletResponse) {
    // PORT: voir HttpServletRequestWrapper
    const self = Object.create(new.target.prototype) as HttpServletResponseWrapper
    Object.defineProperty(self, 'wrapped', { value: response, writable: true })
    // biome-ignore lint/correctness/noConstructorReturn: délégation
    return self
    // eslint-disable-next-line no-unreachable
    super(response.raw)
  }

  getResponse(): HttpServletResponse {
    return this.wrapped
  }
}

const responseProps: [string, 'get' | 'getset'][] = [
  ['status', 'getset'],
  ['raw', 'get'],
  ['beforeCommit', 'get'],
  ['attributesForError', 'getset'],
  ['contentType', 'get'],
  ['isCommitted', 'get'],
]
for (const [name, mode] of responseProps)
  Object.defineProperty(HttpServletResponseWrapper.prototype, name, {
    configurable: true,
    get(this: { wrapped: RequestMembers }) {
      return this.wrapped[name]
    },
    ...(mode === 'getset'
      ? {
          set(this: { wrapped: RequestMembers }, v: unknown) {
            this.wrapped[name] = v
          },
        }
      : {}),
  })
for (const name of [
  'setStatus',
  'setHeader',
  'addHeader',
  'getHeader',
  'getHeaders',
  'containsHeader',
  'removeHeader',
  'setContentType',
  'addCookie',
  'commit',
  'send',
  'getOutputStream',
  'sendError',
  'sendRedirect',
])
  Object.defineProperty(HttpServletResponseWrapper.prototype, name, {
    configurable: true,
    writable: true,
    value(this: { wrapped: RequestMembers }, ...args: unknown[]) {
      return (this.wrapped[name] as (...a: unknown[]) => unknown).apply(this.wrapped, args)
    },
  })

/** Réponse d'origine sous les wrappers */
export function unwrapResponse(response: HttpServletResponse): HttpServletResponse {
  let r = response
  while (r instanceof HttpServletResponseWrapper) r = r.getResponse()
  return r
}

export type { Cookie, HttpSession, MultipartFile, Readable, SessionProvider, Writable }
