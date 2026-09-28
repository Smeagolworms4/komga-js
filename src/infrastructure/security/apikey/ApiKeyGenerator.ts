// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/apikey/ApiKeyGenerator.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { randomUUID } from 'node:crypto'
import { component } from '../../../port/spring.js'

/**
 * API key generator.
 * Uses a random UUID v4 without dashes
 */
export class ApiKeyGenerator {
  generate(): string {
    return randomUUID().replaceAll('-', '')
  }
}

// @Component
component(ApiKeyGenerator)
