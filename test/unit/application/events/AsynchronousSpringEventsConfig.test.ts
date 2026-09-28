// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/application/events/AsynchronousSpringEventsConfigOracleTest.kt
import { AsynchronousSpringEventsConfig } from '../../../../src/application/events/AsynchronousSpringEventsConfig.js'
import { AsyncTaskExecutor } from '../../../../src/port/spring-events.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('application/events/AsynchronousSpringEventsConfig')

const submitted: (() => void)[] = []
const received: unknown[] = []
const multicaster = new AsynchronousSpringEventsConfig(
  new (class extends AsyncTaskExecutor {
    execute(task: () => void): void {
      submitted.push(task)
    }
  })(),
).simpleApplicationEventMulticaster()
// PORT: listeners du contexte -> fonction invokeListeners de multicastEvent
const listeners = (event: unknown) => received.push(event)

func('simpleApplicationEventMulticaster', () => {
  kase('type', () => multicaster.constructor.name)
  kase('listener runs on the executor', () => {
    multicaster.multicastEvent('hello', listeners)
    return [submitted.length, [...received]]
  })
  kase('after the executor runs', () => {
    for (const it of submitted) it()
    return [...received]
  })
  kase('events keep their order', () => {
    submitted.length = 0
    multicaster.multicastEvent('a', listeners)
    multicaster.multicastEvent('b', listeners)
    for (const it of submitted) it()
    return [...received]
  })
})
