// Tests du support de portage port/spring-scheduling.ts (sans jumeau Kotlin) : comportement d'un ThreadPoolExecutor
// Java à file non bornée, et du ThreadPoolTaskScheduler.
import { Duration, Instant } from '@js-joda/core'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { Thread } from '../../src/port/java.js'
import { ApplicationContext, ContextClosedEvent, Environment, component } from '../../src/port/spring.js'
import {
  FixedRateTask,
  ScheduledTaskRegistrar,
  TaskScheduler,
  type ThreadPoolTaskExecutor,
  ThreadPoolTaskExecutorBuilder,
  ThreadPoolTaskScheduler,
  scheduled,
} from '../../src/port/spring-scheduling.js'

describe('ThreadPoolTaskExecutor', () => {
  it('runs tasks after the caller returns, on named threads', async () => {
    const e = new ThreadPoolTaskExecutorBuilder().threadNamePrefix('taskProcessor-').corePoolSize(2).build()
    e.initialize()
    const names: string[] = []
    e.execute(() => {
      names.push(Thread.currentThread().name)
    })
    expect(names).toEqual([])
    expect(e.activeCount).toBe(1)
    expect(e.poolSize).toBe(1)
    await delay(100)
    expect(names).toEqual(['taskProcessor-1'])
    expect(e.activeCount).toBe(0)
    expect(Thread.currentThread().name).toBe('main')
  })

  it('creates a new thread per task under the core pool size, then queues', async () => {
    const e = new ThreadPoolTaskExecutorBuilder().threadNamePrefix('p-').corePoolSize(2).build()
    e.initialize()
    const events: string[] = []
    const task = (id: number) => async () => {
      events.push(`start ${id} ${Thread.currentThread().name}`)
      await delay(20)
      events.push(`end ${id} ${Thread.currentThread().name}`)
    }
    e.execute(task(1))
    e.execute(task(2))
    e.execute(task(3))
    expect(e.activeCount).toBe(2)
    expect(e.poolSize).toBe(2)
    expect(e.queueSize).toBe(1)
    await delay(300)
    expect(events.filter((it) => it.startsWith('start'))).toEqual(['start 1 p-1', 'start 2 p-2', 'start 3 p-1'])
    expect(e.poolSize).toBe(2)
  })

  it('an idle thread takes a submitted task immediately', async () => {
    const e = new ThreadPoolTaskExecutorBuilder().threadNamePrefix('p-').corePoolSize(1).build()
    e.initialize()
    e.execute(() => {})
    await delay(100)
    expect(e.poolSize).toBe(1)
    expect(e.activeCount).toBe(0)
    let name = ''
    e.execute(() => {
      name = Thread.currentThread().name
    })
    expect(e.activeCount).toBe(1)
    await delay(100)
    expect(name).toBe('p-1')
  })

  it('changing the core pool size at runtime', async () => {
    const e = new ThreadPoolTaskExecutorBuilder().threadNamePrefix('p-').corePoolSize(1).build()
    e.initialize()
    const running = new Set<string>()
    let max = 0
    const task = async () => {
      running.add(Thread.currentThread().name)
      max = Math.max(max, running.size)
      await delay(20)
      running.delete(Thread.currentThread().name)
    }
    for (let i = 0; i < 4; i++) e.execute(task)
    expect(e.queueSize).toBe(3)
    e.corePoolSize = 3
    expect(e.poolSize).toBe(3)
    expect(e.queueSize).toBe(1)
    await delay(300)
    expect(max).toBe(3)
    e.corePoolSize = 1
    expect(e.poolSize).toBe(1)
  })

  it('a failing task kills its thread, which is replaced', async () => {
    const e = new ThreadPoolTaskExecutorBuilder().threadNamePrefix('p-').corePoolSize(1).build()
    e.initialize()
    const names: string[] = []
    e.execute(() => {
      throw new Error('boom')
    })
    e.execute(() => {
      names.push(Thread.currentThread().name)
    })
    await delay(200)
    expect(names).toEqual(['p-2'])
  })
})

describe('ThreadPoolTaskScheduler', () => {
  it('schedules at fixed rate on the scheduling thread until cancelled', async () => {
    const s = new ThreadPoolTaskScheduler()
    const registrar = new ScheduledTaskRegistrar()
    registrar.setTaskScheduler(s)
    const names: string[] = []
    const st = registrar.scheduleFixedRateTask(new FixedRateTask(() => void names.push(Thread.currentThread().name), Duration.ofMillis(20), Duration.ofMillis(20)))
    await delay(300)
    st?.cancel(false)
    const n = names.length
    expect(n).toBeGreaterThanOrEqual(3)
    expect(new Set(names)).toEqual(new Set(['scheduling-1']))
    await delay(60)
    expect(names.length).toBe(n)
    s.destroy()
  })

  it('schedule once at an instant', async () => {
    const s = new ThreadPoolTaskScheduler()
    let ran = 0
    const f = s.schedule(() => void ran++, Instant.now().plusMillis(10))
    expect(f.isDone()).toBe(false)
    await delay(200)
    expect(ran).toBe(1)
    expect(f.isDone()).toBe(true)
  })
})

// Bean qui crée son propre exécuteur (comme TaskProcessor) et une méthode @Scheduled
class CloseTestHolder {
  readonly executor: ThreadPoolTaskExecutor
  readonly events: string[] = []
  ticks = 0
  destroyed = false

  constructor(builder: ThreadPoolTaskExecutorBuilder) {
    this.executor = builder.threadNamePrefix('holder-').corePoolSize(1).build()
    this.executor.initialize()
  }

  tick(): void {
    this.ticks++
  }

  onClosed(): void {
    this.events.push('closed event')
  }

  destroy(): void {
    this.destroyed = true
    this.events.push('destroy')
  }
}
component(CloseTestHolder, { inject: [ThreadPoolTaskExecutorBuilder], eventListeners: [{ method: 'onClosed', events: [ContextClosedEvent] }] })
scheduled(CloseTestHolder, [{ method: 'tick', fixedRate: 10 }])

describe('ApplicationContext close', () => {
  it('stops executors and schedulers, waits for running tasks before destroying beans, runs nothing afterwards', async () => {
    const ctx = new ApplicationContext(new Environment({})).refresh()
    const holder = ctx.getBean(CloseTestHolder)
    await delay(50)
    expect(holder.ticks).toBeGreaterThan(0)
    let queuedRan = false
    holder.executor.execute(async () => {
      holder.events.push('task start')
      await delay(50)
      holder.events.push(`task end, destroyed: ${holder.destroyed}`)
    })
    holder.executor.execute(() => {
      queuedRan = true
    })
    await delay(10)
    await ctx.closeAndAwaitTermination()
    expect(holder.events).toEqual(['task start', 'closed event', 'task end, destroyed: false', 'destroy'])
    // la tâche en file est abandonnée, les nouvelles sont refusées
    expect(queuedRan).toBe(false)
    expect(() => holder.executor.execute(() => {})).toThrow('did not accept task')
    const ticks = holder.ticks
    await delay(50)
    expect(holder.ticks).toBe(ticks)
    expect(() => ctx.getBean(TaskScheduler)).toThrow('has been closed already')
  })

  it('close() stops executors without waiting', async () => {
    const ctx = new ApplicationContext(new Environment({})).refresh()
    const holder = ctx.getBean(CloseTestHolder)
    const ran: number[] = []
    // la première tâche a démarré son thread (shutdownNow ne l'empêche pas de s'exécuter), la seconde est en file
    holder.executor.execute(() => void ran.push(1))
    holder.executor.execute(() => void ran.push(2))
    ctx.close()
    expect(holder.destroyed).toBe(true)
    await delay(20)
    expect(ran).toEqual([1])
  })
})
