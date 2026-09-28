// Support de portage : org.springframework.scheduling.TaskScheduler (sous-ensemble utilisé par LuceneAsyncCommitter)
// et le ThreadPoolTaskScheduler auto-configuré par Spring Boot (bean "taskScheduler"), sur setTimeout.
// PORT: placé ici faute de support Spring pour l'ordonnancement ; à déplacer dans src/port quand il existera.
// Ce fichier n'a pas de jumeau Kotlin.
import type { Instant } from '@js-joda/core'
import { component } from '../spring.js'

export interface ScheduledFuture {
  isDone(): boolean
  cancel(mayInterruptIfRunning: boolean): boolean
}

export abstract class TaskScheduler {
  /** Exécute la tâche une fois, à l'instant donné */
  abstract schedule(task: () => void, startTime: Instant): ScheduledFuture
}

export class ThreadPoolTaskScheduler extends TaskScheduler {
  private readonly timers = new Set<NodeJS.Timeout>()

  schedule(task: () => void, startTime: Instant): ScheduledFuture {
    let done = false
    const timer = setTimeout(
      () => {
        this.timers.delete(timer)
        try {
          task()
        } finally {
          done = true
        }
      },
      Math.max(0, startTime.toEpochMilli() - Date.now()),
    )
    timer.unref()
    this.timers.add(timer)
    return {
      isDone: () => done,
      cancel: () => {
        if (done) return false
        clearTimeout(timer)
        this.timers.delete(timer)
        done = true
        return true
      },
    }
  }

  destroy(): void {
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
  }
}

component(ThreadPoolTaskScheduler, { name: 'taskScheduler', types: [TaskScheduler] })
