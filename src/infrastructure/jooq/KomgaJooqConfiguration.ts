// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/KomgaJooqConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DSLContext } from '../../port/jooq/dsl.js'
import { configuration } from '../../port/spring.js'
import { type DataSource, HikariDataSource } from '../../port/sqlite.js'

// taken from https://github.com/spring-projects/spring-boot/blob/v3.1.4/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/jooq/JooqAutoConfiguration.java
// as advised in https://docs.spring.io/spring-boot/docs/3.1.4/reference/htmlsingle/#howto.data-access.configure-jooq-with-multiple-datasources
export class KomgaJooqConfiguration {
  mainDslContextRW(dataSource: DataSource): DSLContext {
    return this.createDslContext(dataSource)
  }

  mainDslContextRO(dataSource: DataSource): DSLContext {
    return this.createDslContext(dataSource)
  }

  tasksDslContextRW(dataSource: DataSource): DSLContext {
    return this.createDslContext(dataSource)
  }

  tasksDslContextRO(dataSource: DataSource): DSLContext {
    return this.createDslContext(dataSource)
  }

  // PORT: SQLDialect.SQLITE, DataSourceConnectionProvider(TransactionAwareDataSourceProxy), TransactionProvider et
  // ExecuteListenerProviders : DSLContext sur la connexion du DataSource, transactions gérées par port/jooq/dsl.transactional
  private createDslContext(dataSource: DataSource): DSLContext {
    return new DSLContext(dataSource.getConnection())
  }
}

configuration(KomgaJooqConfiguration, {
  beans: [
    { method: 'mainDslContextRW', name: 'dslContextRW', type: DSLContext, primary: true, inject: [HikariDataSource] },
    { method: 'mainDslContextRO', name: 'dslContextRO', type: DSLContext, inject: [{ type: HikariDataSource, qualifier: 'sqliteDataSourceRO' }] },
    { method: 'tasksDslContextRW', name: 'tasksDslContextRW', type: DSLContext, inject: [{ type: HikariDataSource, qualifier: 'tasksDataSourceRW' }] },
    { method: 'tasksDslContextRO', name: 'tasksDslContextRO', type: DSLContext, inject: [{ type: HikariDataSource, qualifier: 'tasksDataSourceRO' }] },
  ],
})
