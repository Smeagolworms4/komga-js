// Support de portage : org.springframework.web.servlet.mvc.method.annotation.SseEmitter / ResponseBodyEmitter
// (Spring 6.2) : envois mis en attente tant que le gestionnaire n'a pas initialisé la réponse, trame
// text/event-stream (`id:`, `event:`, `retry:`, `:commentaire`, `data:`), délai d'expiration
// (spring.mvc.async.request-timeout), rappels onCompletion / onTimeout / onError.
// La réponse est écrite par le DispatcherServlet (port/spring-web-dispatcher.ts). Ce fichier n'a pas de jumeau Kotlin.
import { IOException } from './java-io.js'
import { IllegalStateException } from './kotlin.js'

/** Donnée d'un événement et son type de média (null : choisi par les convertisseurs) */
export type DataWithMediaType = { data: unknown; mediaType: string | null }

/** Écriture effective, fournie par le DispatcherServlet */
export interface EmitterHandler {
  send(items: DataWithMediaType[]): void
  complete(): void
  completeWithError(failure: unknown): void
  onTimeout(cb: () => void): void
  onError(cb: (e: unknown) => void): void
  onCompletion(cb: () => void): void
}

/** `SseEmitter.SseEventBuilder` */
export class SseEventBuilder {
  private readonly dataToSend: DataWithMediaType[] = []
  private sb = ''

  id(id: string): this {
    this.sb += `id:${id}\n`
    return this
  }

  name(name: string | null): this {
    this.sb += `event:${name ?? ''}\n`
    return this
  }

  reconnectTime(reconnectTimeMillis: number): this {
    this.sb += `retry:${reconnectTimeMillis}\n`
    return this
  }

  comment(comment: string | null): this {
    this.sb += `:${comment ?? ''}\n`
    return this
  }

  data(object: unknown, mediaType: string | null = null): this {
    this.sb += 'data:'
    this.saveAppendedText()
    if (typeof object === 'string') object = object.replaceAll('\n', '\ndata:')
    this.dataToSend.push({ data: object, mediaType })
    this.sb += '\n'
    return this
  }

  build(): DataWithMediaType[] {
    if (this.sb.length === 0 && this.dataToSend.length === 0) return []
    this.sb += '\n'
    this.saveAppendedText()
    return this.dataToSend
  }

  private saveAppendedText(): void {
    if (this.sb.length > 0) {
      this.dataToSend.push({ data: this.sb, mediaType: 'text/plain;charset=UTF-8' })
      this.sb = ''
    }
  }
}

/** `org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter` */
export class ResponseBodyEmitter {
  private handler: EmitterHandler | null = null
  private readonly earlySendAttempts: DataWithMediaType[] = []
  private isComplete = false
  private failure: unknown = null
  private sendFailed = false
  private readonly timeoutCallbacks: (() => void)[] = []
  private readonly errorCallbacks: ((e: unknown) => void)[] = []
  private readonly completionCallbacks: (() => void)[] = []

  /** `timeout` en millisecondes ; null : délai par défaut de spring.mvc.async.request-timeout */
  constructor(readonly timeout: number | null = null) {}

  /** Appelé par le DispatcherServlet une fois la réponse prête */
  initialize(handler: EmitterHandler): void {
    this.handler = handler
    try {
      if (this.earlySendAttempts.length > 0) this.sendInternal(this.earlySendAttempts.splice(0))
    } finally {
      this.earlySendAttempts.length = 0
    }
    if (this.isComplete) {
      if (this.failure !== null) handler.completeWithError(this.failure)
      else handler.complete()
    } else {
      handler.onTimeout(() => this.timeoutCallbacks.forEach((cb) => cb()))
      handler.onError((e) => this.errorCallbacks.forEach((cb) => cb(e)))
      handler.onCompletion(() => this.completionCallbacks.forEach((cb) => cb()))
    }
  }

  /** `extendResponse` : type de contenu par défaut */
  get defaultContentType(): string | null {
    return null
  }

  send(object: unknown, mediaType: string | null = null): void {
    this.sendInternal([{ data: object, mediaType }])
  }

  protected sendInternal(items: DataWithMediaType[]): void {
    if (this.isComplete) throw new IllegalStateException(`ResponseBodyEmitter has already completed${this.failure !== null ? ' with error' : ''}`)
    if (this.sendFailed) throw new IllegalStateException('Send has failed')
    if (this.handler !== null) {
      try {
        this.handler.send(items)
      } catch (e) {
        this.sendFailed = true
        throw e instanceof IOException ? e : new IOException(String((e as Error)?.message ?? e), e)
      }
    } else this.earlySendAttempts.push(...items)
  }

  /** `complete()` */
  complete(): void {
    if (this.isComplete || this.sendFailed) return
    this.isComplete = true
    if (this.handler !== null) this.handler.complete()
  }

  /** `completeWithError(ex)` */
  completeWithError(ex: unknown): void {
    if (this.isComplete || this.sendFailed) return
    this.isComplete = true
    this.failure = ex
    if (this.handler !== null) this.handler.completeWithError(ex)
  }

  onTimeout(callback: () => void): void {
    this.timeoutCallbacks.push(callback)
  }

  onError(callback: (e: unknown) => void): void {
    this.errorCallbacks.push(callback)
  }

  onCompletion(callback: () => void): void {
    this.completionCallbacks.push(callback)
  }
}

/** `org.springframework.web.servlet.mvc.method.annotation.SseEmitter` */
export class SseEmitter extends ResponseBodyEmitter {
  static event(): SseEventBuilder {
    return new SseEventBuilder()
  }

  override get defaultContentType(): string {
    return 'text/event-stream'
  }

  /** `send(Object)`, `send(Object, MediaType)`, `send(SseEventBuilder)` */
  override send(object: unknown, mediaType: string | null = null): void {
    // PORT: surcharges Java réunies
    if (object instanceof SseEventBuilder) {
      const dataToSend = object.build()
      this.sendInternal(dataToSend)
      return
    }
    this.send(SseEmitter.event().data(object, mediaType))
  }
}

