// Support de portage : exécution des tâches de Komga dans un worker_thread (thread principal : TaskWorkerBridge ;
// worker : task-worker-thread.ts). Ce fichier n'a pas de jumeau Kotlin.
//
// PORT: Komga exécute ses tâches (scan, analyse, empreintes, miniatures, index de recherche…) dans le pool de threads de
// TaskProcessor, pendant que les threads du serveur web répondent aux requêtes. Dans Node, le code synchrone des tâches
// (SQLite, lecture des fichiers et des archives) bloquerait la boucle d'événements du serveur HTTP pendant toute la
// tâche. Le TaskProcessor tourne donc dans un worker_thread qui a son propre contexte (mêmes définitions de beans, mêmes
// réglages) et ses propres connexions SQLite (WAL : lectures concurrentes, un seul écrivain à la fois, voir
// port/sqlite.ts et port/jooq/dsl.ts). Les deux threads échangent :
// - les événements : ceux publiés dans le worker sans listener local (DomainEvent…) sont publiés dans le thread
//   principal (SSE, métriques, index de recherche) ; ceux du thread principal écoutés par un bean du worker
//   (TaskAddedEvent, ApplicationReadyEvent, SettingChangedEvent) lui sont transmis ;
// - les appels aux beans `taskWorker: 'callMain'` (index de recherche Lucene, métriques) : appel synchrone, le worker
//   attend la réponse (Atomics.wait) pendant que le thread principal exécute la méthode ;
// - l'état des beans `taskWorker: 'mirrorMain'` (réglages du serveur), recopié après chaque modification.
// Le worker n'est utilisé que sur demande (KOMGAJS_TASK_WORKER=true) : par défaut les tâches s'exécutent dans le thread
// principal, de façon asynchrone (voir PORTING.md « Architecture d'exécution »). Il reste désactivé sous le profil
// `test` et avec une base en mémoire (non partageable entre threads).
import { MessageChannel, type MessagePort, Worker } from 'node:worker_threads'
import { mallocTrim } from './jpeg-jdk.js'
import { KEnum } from './kotlin.js'
import { KotlinLogging } from './logging.js'
import type { ApplicationContext, BeanDefinition, ContextThreading, Environment, Token } from './spring.js'
import { Handles, decode, encode, exportedPath, exportedValue } from './thread-codec.js'

const logger = KotlinLogging.logger('org.gotson.komga.application.tasks.TaskWorker')

/** Messages échangés avec le worker */
export type ToWorker = { t: 'event'; seq: number; e: unknown } | { t: 'mirror'; bean: string; state: unknown } | { t: 'close' }
export type FromWorker =
  | { t: 'ready'; listen: string[] }
  | { t: 'listen'; listen: string[] }
  | { t: 'idle'; seq: number }
  | { t: 'event'; e: unknown }
  | { t: 'call'; target: CallTarget; method: string; args: unknown }
export type CallTarget = { bean: string } | { handle: number }
export type CallReply = { ok: true; value: unknown } | { ok: false; error: unknown }

/** Données de démarrage du worker */
export type TaskWorkerData = { argv: string[]; signal: SharedArrayBuffer; replyPort: MessagePort }

/**
 * Les tâches s'exécutent-elles dans un worker ? Seulement sur demande (KOMGAJS_TASK_WORKER=true) : par défaut elles
 * s'exécutent dans le thread principal, de façon asynchrone (voir PORTING.md « Architecture d'exécution »), ce qui
 * économise la mémoire d'un second tas V8
 */
export function taskWorkerEnabled(env: Environment): boolean {
  if (env.activeProfiles.includes('test')) return false
  const flag = (process.env.KOMGAJS_TASK_WORKER ?? '').toLowerCase()
  if (flag !== 'true' && flag !== '1') return false
  for (const key of ['komga.database.file', 'komga.tasks-db.file']) {
    const file = env.getProperty(key) ?? ''
    if (file === '' || file.includes(':memory:') || file.includes('mode=memory')) return false
  }
  return true
}

/**
 * État recopiable d'un bean `mirrorMain` : ses propriétés propres dont la valeur est une donnée (primitive, constante
 * d'enum, date ou durée), pas les beans injectés
 */
export function mirrorState(bean: object): Record<string, unknown> {
  const state: Record<string, unknown> = {}
  for (const k of Object.keys(bean)) {
    const v = (bean as Record<string, unknown>)[k]
    if (v === null || v === undefined || (typeof v !== 'object' && typeof v !== 'function')) state[k] = v
    else if (v instanceof KEnum || (exportedPath((v as object).constructor) ?? '').startsWith('@js-joda/core#')) state[k] = v
  }
  return state
}

/** Types d'événements désignés par leur chemin (voir thread-codec) */
export function eventTypes(paths: string[]): Token[] {
  const types: Token[] = []
  for (const p of paths) {
    try {
      types.push(exportedValue(p) as Token)
    } catch (e) {
      logger.warn(() => `Unknown event type in main thread: ${p} (${(e as Error).message})`)
    }
  }
  return types
}

/** Côté thread principal : lancement du worker, relais des événements, exécution des appels du worker */
export class TaskWorkerBridge {
  private ctx: ApplicationContext | null = null
  private worker: Worker | null = null
  private replyPort: MessagePort | null = null
  private signal: Int32Array | null = null
  private ready = false
  private stopping = false
  /** arrêt du worker inactif en cours ; `respawn` : un événement est arrivé entre-temps, le relancer à sa sortie */
  private idleStopping = false
  private respawn = false
  /** numéro du dernier événement transmis au worker */
  private seq = 0
  /** types d'événements écoutés dans le worker (connus après son premier démarrage) */
  private listen: Token[] | null = null
  /** événements publiés avant que le worker soit prêt (rejoués s'ils y sont écoutés) */
  private pending: unknown[] = []
  private readonly handles = new Handles()
  private mirrorDepth = 0
  /** beans `mirrorMain` du thread principal (état recopié dans le worker à son démarrage puis à chaque modification) */
  private readonly mirrored = new Map<string, object>()

  constructor(private readonly argv: string[]) {}

  readonly threading: ContextThreading = {
    role: 'main',
    beanCreated: (d, bean) => (d.taskWorker === 'mirrorMain' ? this.mirrorProxy(d, bean as object) : bean),
    eventPublished: (event) => this.onMainEvent(event),
  }

  start(ctx: ApplicationContext): void {
    this.ctx = ctx
    this.spawn()
  }

  private spawn(): void {
    const { port1, port2 } = new MessageChannel()
    const signal = new SharedArrayBuffer(4)
    this.replyPort = port1
    this.signal = new Int32Array(signal)
    this.ready = false
    this.idleStopping = false
    this.respawn = false
    const data: TaskWorkerData = { argv: this.argv, signal, replyPort: port2 }
    const ext = import.meta.url.endsWith('.ts') ? '.ts' : '.js'
    const worker = new Worker(new URL(`./task-worker-thread${ext}`, import.meta.url), { workerData: data, transferList: [port2], name: 'taskWorker' })
    this.worker = worker
    worker.on('message', (m: FromWorker) => this.onWorkerMessage(m))
    worker.on('error', (e) => logger.error(e as Error, () => 'Task worker failed'))
    worker.on('exit', (code) => {
      if (this.worker !== worker) return
      this.worker = null
      this.ready = false
      if (this.stopping) return
      if (this.idleStopping) {
        logger.info(() => 'Task worker stopped (idle)')
        // mémoire native libérée par le worker (SQLite, libvips…) rendue au système
        setTimeout(() => mallocTrim(), 1_000).unref()
        if (this.respawn) this.spawn()
        return
      }
      // un thread du pool de tâches mort : les tâches qu'il détenait sont reprises au redémarrage (TaskProcessor.disown)
      logger.error(() => `Task worker exited unexpectedly (code ${code}), restarting it`)
      setTimeout(() => {
        if (!this.stopping && this.worker === null) this.spawn()
      }, 5_000).unref()
    })
  }

  /** Arrêt : le worker ferme son contexte (et ses connexions), sinon il est interrompu au bout de 5 s */
  async stop(): Promise<void> {
    this.stopping = true
    const worker = this.worker
    if (worker === null) return
    const exited = new Promise<void>((resolve) => worker.once('exit', () => resolve()))
    worker.postMessage({ t: 'close' } satisfies ToWorker)
    let timer: NodeJS.Timeout | null = null
    await Promise.race([exited, new Promise<void>((resolve) => (timer = setTimeout(resolve, 5_000)))])
    if (timer !== null) clearTimeout(timer)
    await worker.terminate()
  }

  private post(m: ToWorker): void {
    this.worker?.postMessage(m)
  }

  private listened(event: unknown): boolean {
    return this.listen === null || this.listen.some((t) => event instanceof t)
  }

  private onMainEvent(event: unknown): void {
    if (this.stopping || !this.listened(event)) return
    if (!this.ready || this.idleStopping) {
      // worker en démarrage, ou arrêté car inactif : il est (re)lancé et l'événement lui sera transmis une fois prêt
      if (this.pending.length < 10_000) this.pending.push(event)
      if (this.ctx !== null && this.worker === null) this.spawn()
      else if (this.idleStopping) this.respawn = true
      return
    }
    try {
      this.post({ t: 'event', seq: ++this.seq, e: encode(event) })
    } catch (e) {
      logger.error(e as Error, () => `Cannot send event to task worker: ${String(event)}`)
    }
  }

  private onWorkerMessage(m: FromWorker): void {
    const ctx = this.ctx
    if (ctx === null) return
    switch (m.t) {
      case 'ready': {
        this.listen = eventTypes(m.listen)
        this.ready = true
        for (const [name, bean] of this.mirrored) this.pushMirror(name, bean)
        const pending = this.pending
        this.pending = []
        for (const e of pending) this.onMainEvent(e)
        logger.info(() => 'Task worker started')
        break
      }
      case 'listen':
        this.listen = eventTypes(m.listen)
        break
      case 'idle':
        // tous les threads du pool ont expiré (keep-alive) et aucun événement n'a été transmis depuis : le worker
        // s'arrête et rend sa mémoire ; il est relancé au prochain événement qu'il écoute (TaskAddedEvent…)
        if (m.seq === this.seq && this.ready && !this.stopping && this.worker !== null) {
          this.idleStopping = true
          this.post({ t: 'close' })
        }
        break
      case 'event':
        this.incoming.push(m.e)
        if (this.incoming.length - this.incomingHead === 1) setImmediate(() => this.drainEvents(ctx))
        break
      case 'call':
        void this.onCall(ctx, m.target, m.method, m.args)
        break
    }
  }

  /**
   * Événements du worker, traités par tranches de 5 ms entre lesquelles le serveur HTTP reprend la main : un scan en
   * publie des milliers (BookAdded…), dont chacun met à jour l'index de recherche. Les listeners sont appelés ici
   * directement (l'événement vient déjà d'un autre thread, comme avec l'exécuteur de SimpleApplicationEventMulticaster).
   */
  private incoming: unknown[] = []
  private incomingHead = 0

  private drainEvents(ctx: ApplicationContext): void {
    const start = performance.now()
    while (this.incomingHead < this.incoming.length && performance.now() - start < 5) {
      const encoded = this.incoming[this.incomingHead]
      this.incoming[this.incomingHead++] = undefined
      try {
        ctx.invokeListeners(decode(encoded))
      } catch (e) {
        // TaskUtils.LOG_AND_SUPPRESS_ERROR_HANDLER
        logger.error(e as Error, () => 'Unexpected error occurred in asynchronous listener')
      }
    }
    if (this.incomingHead < this.incoming.length) setImmediate(() => this.drainEvents(ctx))
    else {
      this.incoming = []
      this.incomingHead = 0
    }
  }

  /** Appel synchrone du worker : exécution dans ce thread, réponse sur le port dédié puis réveil du worker */
  private async onCall(ctx: ApplicationContext, target: CallTarget, method: string, args: unknown): Promise<void> {
    let reply: CallReply
    try {
      const obj = ('bean' in target ? ctx.getBean(target.bean) : this.handles.get(target.handle)) as Record<string, (...a: unknown[]) => unknown>
      const fn = obj[method]
      if (typeof fn !== 'function') throw new TypeError(`${method} is not a function`)
      let value = fn.apply(obj, decode(args) as unknown[])
      if (value instanceof Promise) value = await value
      reply = { ok: true, value: encode(value, this.handles) }
    } catch (e) {
      try {
        reply = { ok: false, error: encode(e) }
      } catch {
        reply = { ok: false, error: encode(new Error(String(e))) }
      }
    }
    this.replyPort?.postMessage(reply)
    const signal = this.signal as Int32Array
    Atomics.store(signal, 0, 1)
    Atomics.notify(signal, 0)
  }

  /** Bean `mirrorMain` du thread principal : son état est recopié dans le worker après chaque modification */
  private mirrorProxy(d: BeanDefinition, bean: object): object {
    this.mirrored.set(d.name, bean)
    return new Proxy(bean, {
      set: (target, p, value, receiver) => {
        this.mirrorDepth++
        try {
          return Reflect.set(target, p, value, receiver)
        } finally {
          if (--this.mirrorDepth === 0 && this.ready) this.pushMirror(d.name, target)
        }
      },
    })
  }

  private pushMirror(name: string, bean: object): void {
    try {
      this.post({ t: 'mirror', bean: name, state: encode(mirrorState(bean)) })
    } catch (e) {
      logger.error(e as Error, () => `Cannot mirror ${name} to task worker`)
    }
  }
}
