// Support de portage : comportement de sortie de Tomcat 10.1 (Http11Processor / OutputBuffer) sur une
// ServerResponse de node:http :
// - tampon de réponse de 8 Ko : une réponse terminée sans avoir été vidée reçoit un Content-Length,
//   sinon (flush explicite, dépassement du tampon) elle part en Transfer-Encoding: chunked ;
// - en-têtes ajoutés par Tomcat, dans son ordre : Content-Type, Content-Language, Content-Length ou
//   Transfer-Encoding, Date, Keep-Alive, Connection ;
// - ligne de statut sans phrase (« HTTP/1.1 200 ») ;
// - fermeture de la connexion pour les statuts 400, 408, 411, 413, 414, 500, 501, 503 (statusDropsConnection),
//   pour HTTP/1.0 sans keep-alive et quand la requête demande `Connection: close`.
// Ce fichier n'a pas de jumeau Kotlin.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Writable } from 'node:stream'

const TOMCAT = Symbol('tomcatOutput')
const BUFFER_SIZE = 8192
/** `server.tomcat.keep-alive-timeout` (défaut : connectionTimeout = 60 s) */
const KEEP_ALIVE_TIMEOUT_SECONDS = 60

type WriteFn = ServerResponse['write']
type EndFn = ServerResponse['end']

class TomcatOutput {
  private chunks: Buffer[] = []
  private size = 0
  committed = false
  /** Content-Language (Response.setLocale) */
  contentLanguage: string | null = null

  constructor(
    private readonly raw: ServerResponse,
    private readonly req: IncomingMessage,
    private readonly origWrite: WriteFn,
    private readonly origEnd: EndFn,
  ) {}

  private get isHead(): boolean {
    return (this.req.method ?? '').toUpperCase() === 'HEAD'
  }

  append(chunk: unknown, encoding?: BufferEncoding): void {
    if (chunk === undefined || chunk === null) return
    const b = typeof chunk === 'string' ? Buffer.from(chunk, encoding ?? 'utf8') : Buffer.from(chunk as Uint8Array)
    if (b.length === 0) return
    this.chunks.push(b)
    this.size += b.length
  }

  private takeBuffer(): Buffer {
    const b = Buffer.concat(this.chunks)
    this.chunks = []
    this.size = 0
    return b
  }

  /** Http11Processor.prepareResponse */
  prepare(complete: boolean): void {
    if (this.committed) return
    this.committed = true
    const raw = this.raw
    const status = raw.statusCode
    const entityBody = !(status < 200 || status === 204 || status === 205 || status === 304)
    const headers: [string, string | string[]][] = []
    let contentType: string | null = null
    let contentLength: number | null = null
    let date: string | null = null
    let connectionClose = false
    for (const name of (raw as unknown as { getRawHeaderNames(): string[] }).getRawHeaderNames()) {
      const v = raw.getHeader(name)
      if (v === undefined) continue
      const value = Array.isArray(v) ? v : String(v)
      switch (name.toLowerCase()) {
        case 'content-type':
          contentType = String(value)
          break
        case 'content-language':
          this.contentLanguage = String(value)
          break
        case 'content-length':
          contentLength = Number(value)
          break
        case 'transfer-encoding':
        case 'keep-alive':
          break
        case 'date':
          date = String(value)
          break
        case 'connection':
          if (/\bclose\b/i.test(String(value))) connectionClose = true
          break
        default:
          headers.push([name, value])
      }
      raw.removeHeader(name)
    }
    if (!entityBody) contentLength = status === 205 ? 0 : null
    else if (contentLength === null && complete) contentLength = this.size
    for (const [n, v] of headers) raw.setHeader(n, v)
    if (entityBody || status === 204) {
      if (contentType !== null) raw.setHeader('Content-Type', contentType)
      if (this.contentLanguage !== null) raw.setHeader('Content-Language', this.contentLanguage)
    }
    const http11 = this.req.httpVersion === '1.1'
    let delimited = true
    if (contentLength !== null && contentLength >= 0) raw.setHeader('Content-Length', String(contentLength))
    else if (http11 && entityBody && !connectionClose && !this.isHead) raw.setHeader('Transfer-Encoding', 'chunked')
    else if (entityBody && !this.isHead) delimited = false
    raw.setHeader('Date', date ?? new Date().toUTCString())
    const reqConnection = String(this.req.headers.connection ?? '').toLowerCase()
    let keepAlive = http11 ? !/\bclose\b/.test(reqConnection) : /\bkeep-alive\b/.test(reqConnection)
    if (!delimited || connectionClose) keepAlive = false
    if (keepAlive && [400, 408, 411, 413, 414, 500, 501, 503].includes(status)) keepAlive = false
    if (!keepAlive) raw.setHeader('Connection', 'close')
    else {
      if (/\bkeep-alive\b/.test(reqConnection)) {
        raw.setHeader('Keep-Alive', `timeout=${KEEP_ALIVE_TIMEOUT_SECONDS}`)
        raw.setHeader('Connection', 'keep-alive')
      } else raw.removeHeader('Connection')
    }
    raw.sendDate = false
    raw.writeHead(status, '')
  }

  write(chunk: unknown, encoding?: BufferEncoding): boolean {
    if (this.committed) return this.writeRaw(chunk, encoding)
    this.append(chunk, encoding)
    if (this.size > BUFFER_SIZE) {
      this.prepare(false)
      return this.writeRaw(this.takeBuffer())
    }
    return true
  }

  private writeRaw(chunk: unknown, encoding?: BufferEncoding): boolean {
    if (this.isHead) return true
    const b = typeof chunk === 'string' ? Buffer.from(chunk, encoding ?? 'utf8') : (chunk as Uint8Array)
    if (b.length === 0) return true
    return (this.origWrite as (c: unknown) => boolean).call(this.raw, b)
  }

  flush(): void {
    this.prepare(false)
    if (this.size > 0) this.writeRaw(this.takeBuffer())
  }

  end(chunk: unknown, encoding: BufferEncoding | undefined, cb: (() => void) | undefined): void {
    if (!this.committed) {
      this.append(chunk, encoding)
      this.prepare(true)
      const b = this.takeBuffer()
      ;(this.origEnd as (c?: unknown, cb?: () => void) => void).call(this.raw, this.isHead || b.length === 0 ? undefined : b, cb)
      return
    }
    if (chunk !== undefined && chunk !== null) this.writeRaw(chunk, encoding)
    ;(this.origEnd as (c?: unknown, cb?: () => void) => void).call(this.raw, undefined, cb)
  }
}

/** Installe la sortie de type Tomcat sur une réponse node:http */
export function installTomcatOutput(raw: ServerResponse, req: IncomingMessage): void {
  const out = new TomcatOutput(raw, req, raw.write, raw.end)
  ;(raw as unknown as Record<symbol, TomcatOutput>)[TOMCAT] = out
  raw.write = function (this: ServerResponse, chunk: unknown, a?: unknown, b?: unknown): boolean {
    const encoding = typeof a === 'string' ? (a as BufferEncoding) : undefined
    const cb = typeof a === 'function' ? a : typeof b === 'function' ? b : undefined
    const r = out.write(chunk, encoding)
    if (cb) process.nextTick(cb as () => void)
    return r
  } as WriteFn
  raw.end = function (this: ServerResponse, chunk?: unknown, a?: unknown, b?: unknown): ServerResponse {
    if (typeof chunk === 'function') {
      out.end(undefined, undefined, chunk as () => void)
      return this
    }
    const encoding = typeof a === 'string' ? (a as BufferEncoding) : undefined
    const cb = typeof a === 'function' ? a : typeof b === 'function' ? b : undefined
    out.end(chunk, encoding, cb as (() => void) | undefined)
    return this
  } as EndFn
}

function outputOf(w: unknown): TomcatOutput | undefined {
  return w !== null && typeof w === 'object' ? (w as Record<symbol, TomcatOutput | undefined>)[TOMCAT] : undefined
}

/** `OutputStream.flush()` / `response.flushBuffer()` : envoie les en-têtes (réponse découpée) */
export function flushOutput(w: Writable | ServerResponse): void {
  const o = outputOf(w)
  if (o) o.flush()
  else {
    const f = (w as unknown as { flushBuffer?: () => void }).flushBuffer
    if (typeof f === 'function') f.call(w)
  }
}

/** `Response.setLocale` : en-tête Content-Language ajouté par Tomcat */
export function setContentLanguage(w: ServerResponse, locale: string): void {
  const o = outputOf(w)
  if (o) o.contentLanguage = locale
  else if (!w.headersSent) w.setHeader('Content-Language', locale)
}

/** Réponse déjà envoyée (au moins les en-têtes) */
export function isOutputCommitted(w: ServerResponse): boolean {
  const o = outputOf(w)
  return o ? o.committed : w.headersSent
}
