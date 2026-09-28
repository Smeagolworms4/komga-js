// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/httpexchange/HttpExchangeConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { HttpExchangeRepository, InMemoryHttpExchangeRepository } from '../../port/spring-actuate.js'
import { configuration } from '../../port/spring.js'

export class HttpExchangeConfiguration {
  private readonly _httpExchangeRepository = new InMemoryHttpExchangeRepository()

  // PORT: propriété privée renommée (_httpExchangeRepository) : même nom que la méthode @Bean en Kotlin
  httpExchangeRepository() {
    return this._httpExchangeRepository
  }
}

// @Configuration
configuration(HttpExchangeConfiguration, {
  beans: [{ method: 'httpExchangeRepository', type: InMemoryHttpExchangeRepository, types: [HttpExchangeRepository] }],
})
