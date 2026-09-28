// Tests du support de portage port/thread-codec.ts, port/task-worker.ts et des rôles de contexte de port/spring.ts
// (sans jumeau Kotlin) : exécution des tâches dans un worker_thread.
import { Duration, LocalDateTime } from '@js-joda/core'
import { describe, expect, it } from 'vitest'
import * as BookModule from '../../src/domain/model/Book.js'
import * as DomainEventModule from '../../src/domain/model/DomainEvent.js'
import * as MediaModule from '../../src/domain/model/Media.js'
import * as ThumbnailSizeModule from '../../src/domain/model/ThumbnailSize.js'
import { Book } from '../../src/domain/model/Book.js'
import { DomainEvent } from '../../src/domain/model/DomainEvent.js'
import { Media } from '../../src/domain/model/Media.js'
import { ThumbnailSize } from '../../src/domain/model/ThumbnailSize.js'
import * as JavaNetModule from '../../src/port/java-net.js'
import { URL } from '../../src/port/java-net.js'
import { eq } from '../../src/port/kotlin.js'
import * as MicrometerModule from '../../src/port/micrometer.js'
import { SimpleMeterRegistry, Timer } from '../../src/port/micrometer.js'
import { ApplicationContext, ApplicationReadyEvent, Environment, NoSuchBeanDefinitionException, component } from '../../src/port/spring.js'
import * as SpringModule from '../../src/port/spring.js'
import { mirrorState, taskWorkerEnabled } from '../../src/port/task-worker.js'
import { Handles, decode, encode, exportedPath, registerModule } from '../../src/port/thread-codec.js'

registerModule('domain/model/Book', BookModule as unknown as Record<string, unknown>)
registerModule('domain/model/DomainEvent', DomainEventModule as unknown as Record<string, unknown>)
registerModule('domain/model/Media', MediaModule as unknown as Record<string, unknown>)
registerModule('domain/model/ThumbnailSize', ThumbnailSizeModule as unknown as Record<string, unknown>)
registerModule('port/java-net', JavaNetModule as unknown as Record<string, unknown>)
registerModule('port/micrometer', MicrometerModule as unknown as Record<string, unknown>)
registerModule('port/spring', SpringModule as unknown as Record<string, unknown>)

/** passage par le clonage structuré de postMessage */
const roundTrip = (v: unknown, handles: Handles | null = null): unknown => decode(structuredClone(encode(v, handles)))

describe('thread-codec', () => {
  it('rebuilds data classes, enums, dates and URLs', () => {
    const book = new Book({
      name: 'Tome 1',
      url: new URL('file:/bd/Série/Tome%201.cbz'),
      fileLastModified: LocalDateTime.of(2024, 3, 5, 7, 8, 9, 123_000_000),
      fileSize: 12_345,
      libraryId: 'lib',
      seriesId: 'series',
    })
    const event = new DomainEvent.BookAdded({ book })
    const decoded = roundTrip(event) as DomainEvent.BookAdded
    expect(decoded).toBeInstanceOf(DomainEvent.BookAdded)
    expect(decoded.book).toBeInstanceOf(Book)
    expect(decoded.book.url).toBeInstanceOf(URL)
    expect(decoded.book.fileLastModified).toBeInstanceOf(LocalDateTime)
    expect(eq(decoded, event)).toBe(true)
    expect(decoded.book.path).toBe(book.path)
    expect(decoded.toString()).toBe(event.toString())
  })

  it('keeps the identity of exported values (enum constants, singletons, classes)', () => {
    expect(roundTrip(Media.Status.READY)).toBe(Media.Status.READY)
    expect(roundTrip(ThumbnailSize.LARGE)).toBe(ThumbnailSize.LARGE)
    expect(roundTrip(DomainEvent.BookAdded)).toBe(DomainEvent.BookAdded)
    expect(exportedPath(ThumbnailSize.LARGE)).toBe('domain/model/ThumbnailSize#ThumbnailSize.LARGE')
    const event = roundTrip(new ApplicationReadyEvent())
    expect(event).toBeInstanceOf(ApplicationReadyEvent)
  })

  it('encodes collections, plain objects and errors', () => {
    const value = { set: new Set([Media.Status.ERROR, 'a']), map: new Map([['k', Duration.ofSeconds(90)]]), bytes: new Uint8Array([1, 2, 3]), nested: [null, 1, { x: 'y' }] }
    const decoded = roundTrip(value) as typeof value
    expect([...decoded.set]).toEqual([Media.Status.ERROR, 'a'])
    expect(decoded.set.has(Media.Status.ERROR)).toBe(true)
    expect((decoded.map.get('k') as Duration).equals(Duration.ofSeconds(90))).toBe(true)
    expect(decoded.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(decoded.nested).toEqual([null, 1, { x: 'y' }])
    const error = roundTrip(new TypeError('boom')) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('boom')
  })

  it('passes non-copyable objects by handle in call replies, refuses them elsewhere', () => {
    const timer = new SimpleMeterRegistry().timer('komga.tasks.execution', 'type', 'ScanLibrary')
    expect(timer).toBeInstanceOf(Timer)
    // hors réponse d'appel : les instances d'une classe exportée sont copiées, les autres refusées
    expect(roundTrip(timer)).toBeInstanceOf(Timer)
    expect(() => encode(new (class Local {})())).toThrow('non transmissible')
    const handles = new Handles()
    const encoded = encode(timer, handles) as { $h: number }
    expect(handles.get(encoded.$h)).toBe(timer)
    expect(encode(timer, handles)).toEqual(encoded)
    expect(decode(structuredClone(encoded), (id) => ({ remote: id }))).toEqual({ remote: encoded.$h })
  })
})

// ---------------------------------------------------------------------------
// Rôles des beans dans le contexte du worker des tâches
// ---------------------------------------------------------------------------

class PingEvent {}
class PongEvent {}

class SharedIndex {
  add(x: string): string {
    return `main:${x}`
  }
}
component(SharedIndex, { taskWorker: 'callMain' })

class TaskRunner {
  readonly pings: unknown[] = []
  constructor(readonly index: SharedIndex) {}
  onPing(e: unknown): void {
    this.pings.push(e)
  }
}
component(TaskRunner, { inject: [SharedIndex], taskWorker: 'run', eventListeners: [{ method: 'onPing', events: [PingEvent] }] })

class PongListener {
  readonly pongs: unknown[] = []
  onPong(e: unknown): void {
    this.pongs.push(e)
  }
}
component(PongListener, { eventListeners: [{ method: 'onPong', events: [PongEvent] }] })

describe('ApplicationContext threading', () => {
  it('main thread context has no task worker bean', () => {
    const ctx = new ApplicationContext(new Environment({ profiles: ['test'] }), [], { role: 'main' })
    expect(() => ctx.getBean(TaskRunner)).toThrow(NoSuchBeanDefinitionException)
    expect(ctx.getBean(SharedIndex).add('x')).toBe('main:x')
  })

  it('task worker context calls main thread beans and forwards events without local listener', () => {
    const forwarded: unknown[] = []
    const calls: string[] = []
    const ctx = new ApplicationContext(new Environment({ profiles: ['test'] }), [], {
      role: 'taskWorker',
      remoteBean: (d) => ({ add: (x: string) => (calls.push(`${d.name}.add(${x})`), `remote:${x}`) }),
      forwardEvent: (e) => forwarded.push(e),
    })
    ctx.startTaskWorkerBeans()
    const runner = ctx.getBean(TaskRunner)
    expect(runner.index.add('y')).toBe('remote:y')
    expect(calls).toEqual(['sharedIndex.add(y)'])

    const ping = new PingEvent()
    ctx.publishEvent(ping)
    expect(runner.pings).toEqual([ping])
    expect(forwarded).toEqual([])

    // PongListener n'a pas été créé dans le worker : l'événement est traité par le thread principal
    const pong = new PongEvent()
    ctx.publishEvent(pong)
    expect(forwarded).toEqual([pong])
    expect(ctx.listenedEventTypes()).toContain(PingEvent)
    expect(ctx.listenedEventTypes()).not.toContain(PongEvent)

    // événement reçu du thread principal : jamais renvoyé
    ctx.publishLocalEvent(new PongEvent())
    expect(forwarded).toEqual([pong])
    ctx.close()
  })

  it('main thread context reports published events', () => {
    const published: unknown[] = []
    const ctx = new ApplicationContext(new Environment({ profiles: ['test'] }), [], { role: 'main', eventPublished: (e) => published.push(e) })
    const pong = new PongEvent()
    ctx.publishEvent(pong)
    expect(published).toEqual([pong])
    expect(ctx.getBean(PongListener).pongs).toEqual([pong])
    ctx.publishLocalEvent(new PongEvent())
    expect(published).toEqual([pong])
  })
})

describe('task worker', () => {
  it('is disabled for tests, in-memory databases and on demand', () => {
    const env = (profiles: string[], file = '/tmp/k/database.sqlite') =>
      new Environment({ profiles, properties: { komga: { database: { file }, 'tasks-db': { file: '/tmp/k/tasks.sqlite' } } } })
    expect(taskWorkerEnabled(env([]))).toBe(true)
    expect(taskWorkerEnabled(env(['test']))).toBe(false)
    expect(taskWorkerEnabled(env([], 'file:database?mode=memory'))).toBe(false)
    const previous = process.env.KOMGAJS_TASK_WORKER
    process.env.KOMGAJS_TASK_WORKER = 'false'
    try {
      expect(taskWorkerEnabled(env([]))).toBe(false)
    } finally {
      if (previous === undefined) delete process.env.KOMGAJS_TASK_WORKER
      else process.env.KOMGAJS_TASK_WORKER = previous
    }
  })

  it('mirrors data fields of a bean, not injected beans', () => {
    const bean = { dao: new SimpleMeterRegistry(), _size: ThumbnailSize.MEDIUM, _duration: Duration.ofDays(365), _flag: true, _port: null }
    expect(mirrorState(bean)).toEqual({ _size: ThumbnailSize.MEDIUM, _duration: Duration.ofDays(365), _flag: true, _port: null })
  })
})
