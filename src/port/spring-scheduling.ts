// Support de portage : org.springframework.scheduling (TaskScheduler, ThreadPoolTaskScheduler, ThreadPoolTaskExecutor,
// ScheduledTaskRegistrar, @Scheduled) et les beans auto-configurés par Spring Boot 3.5 (TaskSchedulingAutoConfiguration :
// bean `taskScheduler` ; TaskExecutionAutoConfiguration : bean `threadPoolTaskExecutorBuilder`).
// Ce fichier n'a pas de jumeau Kotlin.
//
// PORT: exécution des tâches. Komga exécute ses tâches dans des pools de threads Java (ThreadPoolExecutor). Node est
// mono-thread : ThreadPoolTaskExecutor reproduit ici la comptabilité d'un ThreadPoolExecutor (threads « cœur » créés à la
// demande et nommés `<préfixe><n>` comme le CustomizableThreadCreator de Spring, file d'attente non bornée, activeCount,
// setCorePoolSize à chaud, fin des threads inactifs après keepAlive), mais chaque « thread » est un worker logique dont les
// tâches sont lancées sur la boucle d'événements (setImmediate, après le retour de l'appelant, comme execute() rend la main
// avant l'exécution de la tâche). Le corps d'une tâche peut être asynchrone : le worker attend la promesse avant de prendre
// la tâche suivante, ce qui limite la concurrence à corePoolSize. Pendant une tâche, `Thread.currentThread().name`
// (port/java.ts) renvoie le nom du worker (colonne OWNER de la table TASK).
// Écarts : une tâche synchrone bloque tout le processus pendant son exécution ; un thread inactif qui attend dans la file
// (`queue.take()`) reçoit la tâche soumise immédiatement (activeCount augmente dès execute(), là où Java l'augmente au
// démarrage effectif du thread, quelques microsecondes plus tard).
// Le lancement d'une tâche passe par l'interface `ThreadBackend` : une implémentation sur `worker_threads` (tâches
// sérialisées, contexte et connexions propres au worker) pourra remplacer `InProcessThreadBackend` sans toucher au pool.
import { Duration, Instant } from '@js-joda/core'
import { runInThread } from './java.js'
import { IllegalArgumentException, IllegalStateException, RuntimeException } from './kotlin.js'
import { KotlinLogging } from './logging.js'
import { ApplicationContext, ContextRefreshedEvent, type LifecycleResource, component, registerLifecycleResource, type Token } from './spring.js'

/** `java.lang.Runnable` (le corps peut être asynchrone) */
export type Runnable = () => void | Promise<void>

// ---------------------------------------------------------------------------
// Lancement d'une tâche sur un « thread »
// ---------------------------------------------------------------------------

/** Exécute un Runnable dans le thread logique nommé ; la promesse se résout (ou échoue) à la fin du Runnable */
export interface ThreadBackend {
  run(threadName: string, runnable: Runnable): Promise<void>
}

/** Exécution dans le processus courant, sur la boucle d'événements */
export class InProcessThreadBackend implements ThreadBackend {
  run(threadName: string, runnable: Runnable): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      setImmediate(() => {
        try {
          Promise.resolve(runInThread(threadName, runnable)).then(resolve, reject)
        } catch (e) {
          reject(e)
        }
      })
    })
  }
}

// ---------------------------------------------------------------------------
// ThreadPoolTaskExecutor
// ---------------------------------------------------------------------------

/** `org.springframework.core.task.TaskRejectedException` */
export class TaskRejectedException extends RuntimeException {}

type Worker = { readonly name: string; busy: boolean; idleTimer: NodeJS.Timeout | null; dead: boolean }

/**
 * `org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor` (sur un ThreadPoolExecutor à file non bornée :
 * au plus corePoolSize threads).
 */
export class ThreadPoolTaskExecutor implements LifecycleResource {
  private readonly logger = KotlinLogging.logger('org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor')
  threadNamePrefix = 'ThreadPoolTaskExecutor-'
  private _corePoolSize = 1
  maxPoolSize = 2147483647
  queueCapacity = 2147483647
  keepAliveSeconds = 60
  allowCoreThreadTimeOut = false
  backend: ThreadBackend = new InProcessThreadBackend()

  private threadCount = 0
  private readonly workers: Worker[] = []
  private readonly queue: Runnable[] = []
  private initialized = false
  private shutdown = false

  initialize(): void {
    this.initialized = true
    this.shutdown = false
    // ExecutorConfigurationSupport : SmartLifecycle / ApplicationListener<ContextClosedEvent>
    registerLifecycleResource(this)
  }

  get corePoolSize(): number {
    return this._corePoolSize
  }

  /** `setCorePoolSize` : réduit (threads inactifs en trop arrêtés) ou augmente (threads démarrés pour la file) à chaud */
  set corePoolSize(corePoolSize: number) {
    if (corePoolSize < 0) throw new IllegalArgumentException()
    const delta = corePoolSize - this._corePoolSize
    this._corePoolSize = corePoolSize
    if (!this.initialized) return
    if (this.workers.length > corePoolSize) {
      // interruptIdleWorkers
      for (const w of [...this.workers]) if (!w.busy && this.workers.length > corePoolSize) this.removeWorker(w)
    } else if (delta > 0) {
      // prestart des threads nécessaires pour vider la file
      let k = Math.min(delta, this.queue.length)
      while (k-- > 0 && this.queue.length > 0 && this.workers.length < corePoolSize) this.startWorker(this.queue.shift() as Runnable)
    }
  }

  /** Nombre de threads qui exécutent une tâche */
  get activeCount(): number {
    return this.workers.filter((w) => w.busy).length
  }

  /** Nombre de threads du pool */
  get poolSize(): number {
    return this.workers.length
  }

  get queueSize(): number {
    return this.queue.length
  }

  execute(task: Runnable): void {
    if (!this.initialized || this.shutdown) throw new TaskRejectedException(`Executor [${this.threadNamePrefix}] did not accept task: ${String(task)}`)
    // ThreadPoolExecutor.execute : nouveau thread tant que le pool est sous corePoolSize
    if (this.workers.length < this._corePoolSize) {
      this.startWorker(task)
      return
    }
    // sinon mise en file ; un thread inactif bloqué sur queue.take() la prend aussitôt
    const idle = this.workers.find((w) => !w.busy)
    if (idle !== undefined) {
      this.assign(idle, task)
      return
    }
    if (this.queue.length >= this.queueCapacity) throw new TaskRejectedException(`Executor [${this.threadNamePrefix}] did not accept task: ${String(task)}`)
    this.queue.push(task)
    if (this.workers.length === 0) this.startWorker(this.queue.shift() as Runnable)
  }

  /** `shutdown()` sans attente des tâches (waitForTasksToCompleteOnShutdown = false) : la file est vidée */
  destroy(): void {
    this.shutdown = true
    this.queue.length = 0
    for (const w of [...this.workers]) if (!w.busy) this.removeWorker(w)
    if (this.workers.length === 0) this.notifyTerminated()
  }

  /** `SmartLifecycle.stop` / `initiateEarlyShutdown` (ContextClosedEvent) : arrêt du pool */
  stop(): void {
    this.destroy()
  }

  private terminationWaiters: (() => void)[] = []

  /** `awaitTermination` : fin des tâches en cours après l'arrêt (PORT: promesse au lieu d'une attente bloquante) */
  awaitTermination(): Promise<void> {
    if (this.shutdown && this.workers.length === 0) return Promise.resolve()
    return new Promise<void>((resolve) => this.terminationWaiters.push(resolve))
  }

  private notifyTerminated(): void {
    if (!this.shutdown || this.workers.length > 0) return
    const waiters = this.terminationWaiters
    this.terminationWaiters = []
    for (const r of waiters) r()
  }

  private startWorker(first: Runnable): void {
    const w: Worker = { name: `${this.threadNamePrefix}${++this.threadCount}`, busy: false, idleTimer: null, dead: false }
    this.workers.push(w)
    this.assign(w, first)
  }

  private removeWorker(w: Worker): void {
    w.dead = true
    if (w.idleTimer !== null) clearTimeout(w.idleTimer)
    w.idleTimer = null
    const i = this.workers.indexOf(w)
    if (i >= 0) this.workers.splice(i, 1)
    this.notifyTerminated()
  }

  private assign(w: Worker, task: Runnable): void {
    if (w.idleTimer !== null) clearTimeout(w.idleTimer)
    w.idleTimer = null
    w.busy = true
    void this.runWorker(w, task)
  }

  private async runWorker(w: Worker, first: Runnable): Promise<void> {
    let task: Runnable | null = first
    while (task !== null) {
      w.busy = true
      try {
        await this.backend.run(w.name, task)
      } catch (e) {
        // exception non rattrapée : le thread meurt (UncaughtExceptionHandler par défaut), il est remplacé si besoin
        this.logger.error(e as Error, () => `Exception in thread "${w.name}"`)
        w.busy = false
        this.removeWorker(w)
        if (!this.shutdown && this.queue.length > 0 && this.workers.length < this._corePoolSize) this.startWorker(this.queue.shift() as Runnable)
        return
      }
      w.busy = false
      if (w.dead) return
      // getTask : thread en trop après réduction de corePoolSize
      if (this.shutdown || this.workers.length > this._corePoolSize) {
        this.removeWorker(w)
        return
      }
      task = this.queue.shift() ?? null
    }
    // attente sur la file ; allowCoreThreadTimeOut : fin du thread après keepAlive
    if (this.allowCoreThreadTimeOut) {
      w.idleTimer = setTimeout(() => {
        if (!w.busy) this.removeWorker(w)
      }, this.keepAliveSeconds * 1000)
      w.idleTimer.unref()
    }
  }
}

/**
 * `org.springframework.boot.task.ThreadPoolTaskExecutorBuilder`, avec les valeurs par défaut de
 * `spring.task.execution.pool.*` (TaskExecutionProperties) : file non bornée, keep-alive 60 s, allowCoreThreadTimeout.
 */
export class ThreadPoolTaskExecutorBuilder {
  constructor(
    private readonly props: {
      threadNamePrefix: string
      corePoolSize: number
      maxPoolSize: number
      queueCapacity: number
      keepAliveSeconds: number
      allowCoreThreadTimeOut: boolean
    } = {
      threadNamePrefix: 'task-',
      corePoolSize: 8,
      maxPoolSize: 2147483647,
      queueCapacity: 2147483647,
      keepAliveSeconds: 60,
      allowCoreThreadTimeOut: true,
    },
  ) {}

  threadNamePrefix(threadNamePrefix: string): ThreadPoolTaskExecutorBuilder {
    return new ThreadPoolTaskExecutorBuilder({ ...this.props, threadNamePrefix })
  }

  corePoolSize(corePoolSize: number): ThreadPoolTaskExecutorBuilder {
    return new ThreadPoolTaskExecutorBuilder({ ...this.props, corePoolSize })
  }

  maxPoolSize(maxPoolSize: number): ThreadPoolTaskExecutorBuilder {
    return new ThreadPoolTaskExecutorBuilder({ ...this.props, maxPoolSize })
  }

  queueCapacity(queueCapacity: number): ThreadPoolTaskExecutorBuilder {
    return new ThreadPoolTaskExecutorBuilder({ ...this.props, queueCapacity })
  }

  build(): ThreadPoolTaskExecutor {
    const e = new ThreadPoolTaskExecutor()
    e.threadNamePrefix = this.props.threadNamePrefix
    e.corePoolSize = this.props.corePoolSize
    e.maxPoolSize = this.props.maxPoolSize
    e.queueCapacity = this.props.queueCapacity
    e.keepAliveSeconds = this.props.keepAliveSeconds
    e.allowCoreThreadTimeOut = this.props.allowCoreThreadTimeOut
    return e
  }
}

component(ThreadPoolTaskExecutorBuilder, { name: 'threadPoolTaskExecutorBuilder', inject: [] })

// ---------------------------------------------------------------------------
// TaskScheduler
// ---------------------------------------------------------------------------

/** `java.util.concurrent.ScheduledFuture` (sous-ensemble) */
export interface ScheduledFuture {
  isDone(): boolean
  isCancelled(): boolean
  cancel(mayInterruptIfRunning: boolean): boolean
}

/** `org.springframework.scheduling.TaskScheduler` (sous-ensemble utilisé) */
export abstract class TaskScheduler {
  /** Exécute la tâche une fois, à l'instant donné */
  abstract schedule(task: Runnable, startTime: Instant): ScheduledFuture

  /** Exécutions à intervalle fixe à partir de `startTime` (ou tout de suite) */
  abstract scheduleAtFixedRate(task: Runnable, startTimeOrPeriod: Instant | Duration, period?: Duration): ScheduledFuture

  /** Exécutions espacées d'un délai fixe entre la fin d'une exécution et le début de la suivante */
  abstract scheduleWithFixedDelay(task: Runnable, startTimeOrDelay: Instant | Duration, delay?: Duration): ScheduledFuture
}

/**
 * `ThreadPoolTaskScheduler` auto-configuré par Spring Boot (bean `taskScheduler`, un seul thread `scheduling-1`) :
 * les exécutions sont sérialisées ; une exécution en retard (à intervalle fixe) démarre dès la fin de la précédente.
 */
export class ThreadPoolTaskScheduler extends TaskScheduler implements LifecycleResource {
  private readonly logger = KotlinLogging.logger('org.springframework.scheduling.support.TaskUtils')
  private shutdown = false
  /** exécutions en cours ou en attente sur le thread */
  private running = 0
  private terminationWaiters: (() => void)[] = []

  constructor() {
    super()
    // ExecutorConfigurationSupport : SmartLifecycle / ApplicationListener<ContextClosedEvent>
    registerLifecycleResource(this)
  }
  threadNamePrefix = 'scheduling-'
  backend: ThreadBackend = new InProcessThreadBackend()
  private readonly timers = new Set<NodeJS.Timeout>()
  /** file du thread unique */
  private chain: Promise<void> = Promise.resolve()

  private get threadName(): string {
    return `${this.threadNamePrefix}1`
  }

  /** Exécution sur le thread du planificateur, après les exécutions en cours */
  private runOnThread(task: Runnable): Promise<void> {
    this.running++
    // une exécution en file au moment de l'arrêt est abandonnée (shutdownNow)
    const p = this.chain.then(() => (this.shutdown ? undefined : this.backend.run(this.threadName, task)))
    this.chain = p.catch(() => undefined).finally(() => {
      this.running--
      this.notifyTerminated()
    })
    return p
  }

  private timer(fn: () => void, at: number): NodeJS.Timeout {
    const t = setTimeout(
      () => {
        this.timers.delete(t)
        if (!this.shutdown) fn()
      },
      Math.max(0, at - Date.now()),
    )
    t.unref()
    // après l'arrêt : aucune nouvelle exécution planifiée
    if (this.shutdown) clearTimeout(t)
    else this.timers.add(t)
    return t
  }

  schedule(task: Runnable, startTime: Instant): ScheduledFuture {
    let done = false
    let cancelled = false
    const t = this.timer(() => {
      // une exécution annulée avant son démarrage n'a pas lieu (FutureTask.cancel)
      this.runOnThread(() => (cancelled ? undefined : task()))
        .catch((e) => {
          // TaskUtils.LOG_AND_PROPAGATE_ERROR_HANDLER
          this.logger.error(e as Error, () => 'Unexpected error occurred in scheduled task')
        })
        .finally(() => {
          done = true
        })
    }, startTime.toEpochMilli())
    return {
      isDone: () => done,
      isCancelled: () => cancelled,
      cancel: () => {
        if (done || cancelled) return false
        clearTimeout(t)
        this.timers.delete(t)
        cancelled = true
        done = true
        return true
      },
    }
  }

  private repeating(task: Runnable, firstAt: number, next: (scheduledAt: number, endedAt: number) => number): ScheduledFuture {
    let cancelled = false
    let current: NodeJS.Timeout | null = null
    const fire = (scheduledAt: number) => {
      current = null
      this.runOnThread(() => (cancelled ? undefined : task()))
        .catch((e) => {
          // TaskUtils.LOG_AND_SUPPRESS_ERROR_HANDLER : les exécutions suivantes ont lieu
          this.logger.error(e as Error, () => 'Unexpected error occurred in scheduled task')
        })
        .finally(() => {
          if (!cancelled) {
            const at = next(scheduledAt, Date.now())
            current = this.timer(() => fire(at), at)
          }
        })
    }
    current = this.timer(() => fire(firstAt), firstAt)
    return {
      isDone: () => cancelled,
      isCancelled: () => cancelled,
      cancel: () => {
        if (cancelled) return false
        cancelled = true
        if (current !== null) {
          clearTimeout(current)
          this.timers.delete(current)
        }
        return true
      },
    }
  }

  scheduleAtFixedRate(task: Runnable, startTimeOrPeriod: Instant | Duration, period?: Duration): ScheduledFuture {
    const [start, p] = startTimeOrPeriod instanceof Instant ? [startTimeOrPeriod.toEpochMilli(), period as Duration] : [Date.now(), startTimeOrPeriod]
    const periodMs = p.toMillis()
    if (periodMs <= 0) throw new IllegalArgumentException('period must be positive')
    return this.repeating(task, start, (scheduledAt) => scheduledAt + periodMs)
  }

  scheduleWithFixedDelay(task: Runnable, startTimeOrDelay: Instant | Duration, delay?: Duration): ScheduledFuture {
    const [start, d] = startTimeOrDelay instanceof Instant ? [startTimeOrDelay.toEpochMilli(), delay as Duration] : [Date.now(), startTimeOrDelay]
    const delayMs = d.toMillis()
    if (delayMs <= 0) throw new IllegalArgumentException('delay must be positive')
    return this.repeating(task, start, (_scheduledAt, endedAt) => endedAt + delayMs)
  }

  destroy(): void {
    this.shutdown = true
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    this.notifyTerminated()
  }

  /** `SmartLifecycle.stop` (ContextClosedEvent) : plus aucune exécution planifiée */
  stop(): void {
    this.destroy()
  }

  /** fin de l'exécution en cours après l'arrêt */
  awaitTermination(): Promise<void> {
    if (this.shutdown && this.running === 0) return Promise.resolve()
    return new Promise<void>((resolve) => this.terminationWaiters.push(resolve))
  }

  private notifyTerminated(): void {
    if (!this.shutdown || this.running > 0) return
    const waiters = this.terminationWaiters
    this.terminationWaiters = []
    for (const r of waiters) r()
  }
}

component(ThreadPoolTaskScheduler, { name: 'taskScheduler', types: [TaskScheduler] })

// ---------------------------------------------------------------------------
// ScheduledTaskRegistrar
// ---------------------------------------------------------------------------

/** `org.springframework.scheduling.config.Task` */
export class Task {
  constructor(readonly runnable: Runnable) {}

  toString(): string {
    return String(this.runnable)
  }
}

/** `org.springframework.scheduling.config.IntervalTask` */
export class IntervalTask extends Task {
  constructor(
    runnable: Runnable,
    readonly intervalDuration: Duration,
    readonly initialDelayDuration: Duration = Duration.ZERO,
  ) {
    super(runnable)
  }
}

/** `org.springframework.scheduling.config.FixedRateTask` */
export class FixedRateTask extends IntervalTask {}

/** `org.springframework.scheduling.config.FixedDelayTask` */
export class FixedDelayTask extends IntervalTask {}

/** `org.springframework.scheduling.config.ScheduledTask` */
export class ScheduledTask {
  future: ScheduledFuture | null = null

  constructor(readonly task: Task) {}

  cancel(mayInterruptIfRunning = true): void {
    const future = this.future
    if (future !== null) future.cancel(mayInterruptIfRunning)
  }

  toString(): string {
    return this.task.toString()
  }
}

/** `org.springframework.scheduling.config.ScheduledTaskHolder` */
export interface ScheduledTaskHolder {
  getScheduledTasks(): Set<ScheduledTask>
}

/** `org.springframework.scheduling.config.ScheduledTaskRegistrar` (sous-ensemble utilisé) */
export class ScheduledTaskRegistrar implements ScheduledTaskHolder {
  private taskScheduler: TaskScheduler | null = null
  private readonly scheduledTasks = new Set<ScheduledTask>()

  setTaskScheduler(taskScheduler: TaskScheduler): void {
    this.taskScheduler = taskScheduler
  }

  /** Planifie la tâche ; renvoie la ScheduledTask créée (null si aucun planificateur : Spring la garde en attente) */
  scheduleFixedRateTask(task: FixedRateTask): ScheduledTask | null {
    const scheduledTask = new ScheduledTask(task)
    if (this.taskScheduler !== null) {
      const startTime = Instant.now().plus(task.initialDelayDuration)
      scheduledTask.future = this.taskScheduler.scheduleAtFixedRate(task.runnable, startTime, task.intervalDuration)
    } else {
      // PORT: Spring garde la tâche jusqu'à afterPropertiesSet ; jamais le cas dans Komga (planificateur fourni)
      throw new IllegalStateException('No TaskScheduler set')
    }
    this.scheduledTasks.add(scheduledTask)
    return scheduledTask
  }

  scheduleFixedDelayTask(task: FixedDelayTask): ScheduledTask | null {
    const scheduledTask = new ScheduledTask(task)
    if (this.taskScheduler === null) throw new IllegalStateException('No TaskScheduler set')
    const startTime = Instant.now().plus(task.initialDelayDuration)
    scheduledTask.future = this.taskScheduler.scheduleWithFixedDelay(task.runnable, startTime, task.intervalDuration)
    this.scheduledTasks.add(scheduledTask)
    return scheduledTask
  }

  getScheduledTasks(): Set<ScheduledTask> {
    return new Set(this.scheduledTasks)
  }

  destroy(): void {
    for (const t of this.scheduledTasks) t.cancel(true)
  }
}

// ---------------------------------------------------------------------------
// @Scheduled (@EnableScheduling de Application.kt)
// ---------------------------------------------------------------------------

type ScheduledOptions = { method: string; fixedRate?: number; fixedDelay?: number; initialDelay?: number }

const scheduledDefinitions: { type: Token; methods: ScheduledOptions[] }[] = []

/** `@Scheduled(fixedRate = …)` / `@Scheduled(fixedDelay = …)` (millisecondes) sur des méthodes d'un bean, en fin de fichier jumeau */
export function scheduled(cls: Token, methods: ScheduledOptions[]): void {
  scheduledDefinitions.push({ type: cls, methods })
}

/** `org.springframework.context.event.ContextRefreshedEvent` : publié à la fin de `ApplicationContext.refresh()` */
export { ContextRefreshedEvent }

/**
 * `ScheduledAnnotationBeanPostProcessor` : planifie les méthodes `@Scheduled` des beans actifs à la fin du
 * rafraîchissement du contexte (ContextRefreshedEvent), sur le bean `taskScheduler`.
 */
export class ScheduledAnnotationBeanPostProcessor {
  private readonly registrar = new ScheduledTaskRegistrar()
  private registered = false

  constructor(
    private readonly context: ApplicationContext,
    taskScheduler: TaskScheduler,
  ) {
    this.registrar.setTaskScheduler(taskScheduler)
  }

  onApplicationEvent(): void {
    if (this.registered) return
    this.registered = true
    for (const def of scheduledDefinitions)
      for (const bean of this.context.getBeansOfType(def.type) as Record<string, () => unknown>[])
        for (const m of def.methods) {
          const runnable: Runnable = () => (bean[m.method] as () => void | Promise<void>).call(bean)
          const initialDelay = Duration.ofMillis(m.initialDelay ?? 0)
          if (m.fixedRate !== undefined) this.registrar.scheduleFixedRateTask(new FixedRateTask(runnable, Duration.ofMillis(m.fixedRate), initialDelay))
          else if (m.fixedDelay !== undefined) this.registrar.scheduleFixedDelayTask(new FixedDelayTask(runnable, Duration.ofMillis(m.fixedDelay), initialDelay))
        }
  }

  getScheduledTasks(): Set<ScheduledTask> {
    return this.registrar.getScheduledTasks()
  }

  destroy(): void {
    this.registrar.destroy()
  }
}

component(ScheduledAnnotationBeanPostProcessor, {
  name: 'org.springframework.context.annotation.internalScheduledAnnotationProcessor',
  inject: [ApplicationContext, TaskScheduler],
  eventListeners: [{ method: 'onApplicationEvent', events: [ContextRefreshedEvent] }],
})
