// Support de portage : diffusion des événements Spring (org.springframework.context.event) et exécuteur de tâches
// applicatif de Spring Boot (bean `applicationTaskExecutor`). Ce fichier n'a pas de jumeau Kotlin.
// Node est mono-thread : l'exécution « asynchrone » d'une tâche est planifiée sur la boucle d'événements (setImmediate),
// après le retour de l'appelant, comme un ThreadPoolTaskExecutor rend la main avant l'exécution de la tâche.
// PORT: les tâches en attente sont exécutées dans l'ordre par tranches de 5 ms, entre lesquelles la boucle d'événements
// reprend la main (requêtes HTTP) : un scan publie des milliers d'événements (BookAdded…), dont chacun met à jour
// l'index de recherche.
import { KotlinLogging } from './logging.js'
import { RuntimeException } from './kotlin.js'
import { type LifecycleResource, component, registerLifecycleResource } from './spring.js'

const logger = KotlinLogging.logger('org.springframework.context.event.SimpleApplicationEventMulticaster')

/** `org.springframework.core.task.AsyncTaskExecutor` */
export abstract class AsyncTaskExecutor {
  abstract execute(task: () => void): void
}

/** `ThreadPoolTaskExecutor` auto-configuré par Spring Boot sous le nom `applicationTaskExecutor` */
export class ApplicationTaskExecutor extends AsyncTaskExecutor implements LifecycleResource {
  private shutdown = false
  /** tâches en attente, dans l'ordre de soumission */
  private queue: (() => void)[] = []
  private head = 0
  private scheduled: NodeJS.Immediate | null = null

  constructor() {
    super()
    // ExecutorConfigurationSupport : SmartLifecycle / ApplicationListener<ContextClosedEvent>
    registerLifecycleResource(this)
  }

  execute(task: () => void): void {
    // TaskRejectedException (org.springframework.core.task)
    if (this.shutdown) throw new RuntimeException(`Executor [applicationTaskExecutor] did not accept task: ${String(task)}`)
    this.queue.push(task)
    this.scheduled ??= setImmediate(() => this.drain())
  }

  /** exécute les tâches en attente pendant au plus 5 ms, puis rend la main à la boucle d'événements */
  private drain(): void {
    this.scheduled = null
    const start = performance.now()
    try {
      while (this.head < this.queue.length && !this.shutdown) {
        const task = this.queue[this.head] as () => void
        this.queue[this.head++] = undefined as unknown as () => void
        task()
        if (performance.now() - start >= 5) break
      }
    } finally {
      if (this.head >= this.queue.length) {
        this.queue = []
        this.head = 0
      } else if (!this.shutdown) this.scheduled ??= setImmediate(() => this.drain())
    }
  }

  /** arrêt (ContextClosedEvent) : les tâches en attente sont abandonnées (waitForTasksToCompleteOnShutdown = false) */
  stop(): void {
    this.shutdown = true
    if (this.scheduled !== null) clearImmediate(this.scheduled)
    this.scheduled = null
    this.queue = []
    this.head = 0
  }

  awaitTermination(): Promise<void> {
    return Promise.resolve()
  }
}

component(ApplicationTaskExecutor, { name: 'applicationTaskExecutor', types: [AsyncTaskExecutor] })

/** `org.springframework.context.event.ApplicationEventMulticaster` */
export abstract class ApplicationEventMulticaster {
  /** `invokeListeners` : appel des listeners enregistrés dans le contexte (fourni par ApplicationContext) */
  abstract multicastEvent(event: unknown, invokeListeners: (event: unknown) => void): void
}

/** `org.springframework.context.event.SimpleApplicationEventMulticaster` */
export class SimpleApplicationEventMulticaster extends ApplicationEventMulticaster {
  private taskExecutor: AsyncTaskExecutor | null = null

  setTaskExecutor(taskExecutor: AsyncTaskExecutor | null): void {
    this.taskExecutor = taskExecutor
  }

  multicastEvent(event: unknown, invokeListeners: (event: unknown) => void): void {
    const executor = this.taskExecutor
    if (executor !== null)
      executor.execute(() => {
        try {
          invokeListeners(event)
        } catch (e) {
          // exception d'un listener exécuté par l'exécuteur : journalisée (TaskUtils.LOG_AND_SUPPRESS_ERROR_HANDLER)
          logger.error(e as Error, () => 'Unexpected error occurred in asynchronous listener')
        }
      })
    else invokeListeners(event)
  }
}
