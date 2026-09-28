// @port-of komga/src/main/kotlin/org/gotson/komga/application/tasks/TaskProcessor.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaSettingsProvider } from '../../infrastructure/configuration/KomgaSettingsProvider.js'
import { SettingChangedEvent } from '../../infrastructure/configuration/SettingChangedEvent.js'
import { KotlinLogging } from '../../port/logging.js'
import { ApplicationReadyEvent, component, type Token } from '../../port/spring.js'
import { type ThreadPoolTaskExecutor, ThreadPoolTaskExecutorBuilder } from '../../port/spring-scheduling.js'
import { TaskAddedEvent } from './TaskAddedEvent.js'
import { TaskHandler } from './TaskHandler.js'
import { TasksRepository } from './TasksRepository.js'

const logger = KotlinLogging.logger('org.gotson.komga.application.tasks.TaskProcessor')

// PORT: le ThreadPoolTaskExecutor est celui de port/spring-scheduling.ts : threads logiques `taskProcessor-<n>` dans le
// processus Node (tâches lancées sur la boucle d'événements, corps asynchrones attendus), voir l'en-tête de ce fichier
export class TaskProcessor {
  readonly executor: ThreadPoolTaskExecutor

  processTasks = false

  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskHandler: TaskHandler,
    private readonly settingsProvider: KomgaSettingsProvider,
    taskExecutorBuilder: ThreadPoolTaskExecutorBuilder,
  ) {
    this.executor = taskExecutorBuilder.threadNamePrefix('taskProcessor-').corePoolSize(this.settingsProvider.taskPoolSize).build()
    this.executor.initialize()
  }

  afterPropertiesSet(): void {
    const disowned = this.tasksRepository.disown()
    if (disowned > 0) logger.info(() => `Reset ${disowned} tasks that were not finished`)
    this.processTasks = true
  }

  taskPoolSizeChanged(): void {
    this.executor.corePoolSize = this.settingsProvider.taskPoolSize
  }

  processAvailableTask(): void {
    if (this.processTasks) {
      logger.debug(() => `Active count: ${this.executor.activeCount}, Core Pool Size: ${this.executor.corePoolSize}, Pool Size: ${this.executor.poolSize}`)
      if (this.executor.corePoolSize === 1) {
        this.executor.execute(() => this.takeAndProcess())
      } else {
        // fan out while threads are available
        while (this.tasksRepository.hasAvailable() && this.executor.activeCount < this.executor.corePoolSize) {
          this.executor.execute(() => this.takeAndProcess())
        }
      }
    } else {
      logger.debug(() => 'Not processing tasks')
    }
  }

  // PORT: async (TaskHandler.handleTask est asynchrone)
  private async takeAndProcess(): Promise<void> {
    logger.debug(() => 'Try to process first available task')
    const task = this.tasksRepository.takeFirst()
    if (task !== null) {
      logger.debug(() => `Found task to process: ${task}`)
      await this.taskHandler.handleTask(task)
      logger.debug(() => `Task processed, remove it from the queue: ${task}`)
      this.tasksRepository.delete(task.uniqueId)
      this.processAvailableTask()
    } else {
      logger.debug(() => 'No available task found')
    }
  }
}

// @Service
component(TaskProcessor, {
  inject: [TasksRepository, TaskHandler, KomgaSettingsProvider, ThreadPoolTaskExecutorBuilder],
  eventListeners: [
    // @EventListener(SettingChangedEvent.TaskPoolSize::class)
    { method: 'taskPoolSizeChanged', events: [SettingChangedEvent.TaskPoolSize.constructor as Token] },
    // @EventListener(TaskAddedEvent::class, ApplicationReadyEvent::class)
    { method: 'processAvailableTask', events: [TaskAddedEvent.constructor as Token, ApplicationReadyEvent] },
  ],
})
