// @port-of komga/src/main/kotlin/org/gotson/komga/application/events/AsynchronousSpringEventsConfig.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ApplicationEventMulticaster, AsyncTaskExecutor, SimpleApplicationEventMulticaster } from '../../port/spring-events.js'
import { configuration } from '../../port/spring.js'

export class AsynchronousSpringEventsConfig {
  constructor(private readonly applicationTaskExecutor: AsyncTaskExecutor) {}

  simpleApplicationEventMulticaster(): ApplicationEventMulticaster {
    const it = new SimpleApplicationEventMulticaster()
    it.setTaskExecutor(this.applicationTaskExecutor)
    return it
  }
}

// @Profile("!test") @Configuration
configuration(AsynchronousSpringEventsConfig, {
  profile: '!test',
  inject: [AsyncTaskExecutor],
  beans: [{ method: 'simpleApplicationEventMulticaster', name: 'applicationEventMulticaster', type: ApplicationEventMulticaster, profile: '!test' }],
})
