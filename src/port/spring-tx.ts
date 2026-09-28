// Support de portage : org.springframework.transaction (PlatformTransactionManager, TransactionTemplate) sur
// port/jooq/dsl.transactional (better-sqlite3, synchrone). Ce fichier n'a pas de jumeau Kotlin.
import { transactional } from './jooq/dsl.js'
import { configuration } from './spring.js'
import { HikariDataSource } from './sqlite.js'

/** `org.springframework.transaction.PlatformTransactionManager` */
export abstract class PlatformTransactionManager {
  abstract execute<T>(action: () => T, opts?: { readOnly?: boolean }): T
}

/** `org.springframework.jdbc.support.JdbcTransactionManager` sur un DataSource */
export class JdbcTransactionManager extends PlatformTransactionManager {
  constructor(readonly dataSource: HikariDataSource) {
    super()
  }

  execute<T>(action: () => T, opts: { readOnly?: boolean } = {}): T {
    return transactional(this.dataSource.getConnection(), action, opts)
  }
}

/** `org.springframework.transaction.support.TransactionTemplate` (propagation REQUIRED) */
export class TransactionTemplate {
  constructor(readonly transactionManager: PlatformTransactionManager) {}

  /** `execute { status -> ... }` (la fonction ne doit pas être asynchrone) */
  execute<T>(action: (status: unknown) => T): T {
    return this.transactionManager.execute(() => action(null))
  }

  /** `executeWithoutResult { status -> ... }` */
  executeWithoutResult(action: (status: unknown) => void): void {
    this.transactionManager.execute(() => action(null))
  }
}

/** DataSourceTransactionManagerAutoConfiguration de Spring Boot : bean `transactionManager` sur le DataSource principal */
export class DataSourceTransactionManagerAutoConfiguration {
  transactionManager(dataSource: HikariDataSource): PlatformTransactionManager {
    return new JdbcTransactionManager(dataSource)
  }
}

configuration(DataSourceTransactionManagerAutoConfiguration, {
  // @ConditionalOnSingleCandidate(DataSource) : bean créé à la demande (contextes sans DataSource)
  beans: [{ method: 'transactionManager', type: PlatformTransactionManager, inject: [HikariDataSource], lazy: true }],
})
