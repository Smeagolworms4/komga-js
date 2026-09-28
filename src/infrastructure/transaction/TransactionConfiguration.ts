// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/transaction/TransactionConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { configuration } from '../../port/spring.js'
import { PlatformTransactionManager, TransactionTemplate } from '../../port/spring-tx.js'

export class TransactionConfiguration {
  transactionTemplate(transactionManager: PlatformTransactionManager) {
    return new TransactionTemplate(transactionManager)
  }
}

// @Configuration
configuration(TransactionConfiguration, {
  beans: [{ method: 'transactionTemplate', type: TransactionTemplate, inject: [PlatformTransactionManager] }],
})
