// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/transaction/TransactionConfigurationOracleTest.kt
import { Library } from '../../../../src/domain/model/Library.js'
import { TransactionConfiguration } from '../../../../src/infrastructure/transaction/TransactionConfiguration.js'
import { URL } from '../../../../src/port/java-net.js'
import { IllegalArgumentException, IllegalStateException } from '../../../../src/port/kotlin.js'
import { JdbcTransactionManager } from '../../../../src/port/spring-tx.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/transaction/TransactionConfiguration')

const db = new OracleDb()
const template = new TransactionConfiguration().transactionTemplate(new JdbcTransactionManager(db.dataSource))
const lib = (id: string) => new Library({ name: `lib ${id}`, root: new URL(`file:/lib/${id}`), id })

func('transactionTemplate', () => {
  kase('returns the result', () => template.execute(() => 42))
  kase('commits', () => {
    template.execute(() => db.libraryDao.insert(lib('L1')))
    return db.libraryDao.count()
  })
  kase('rolls back on exception', async () => {
    const e = await exceptionType(() =>
      template.execute(() => {
        db.libraryDao.insert(lib('L2'))
        throw new IllegalStateException('boom')
      }),
    )
    return [e, db.libraryDao.findAll().map((it) => it.id)]
  })
  kase('exception is rethrown as is', () =>
    template.execute(() => {
      throw new IllegalArgumentException('inner')
    }),
  )
  kase('without result', () => {
    template.executeWithoutResult(() => db.libraryDao.insert(lib('L3')))
    return db.libraryDao.findAll().map((it) => it.id)
  })
  kase('sql error rolls back the whole block', async () => {
    const e = await exceptionType(() =>
      template.executeWithoutResult(() => {
        db.libraryDao.insert(lib('L4'))
        db.libraryDao.insert(lib('L1'))
      }),
    )
    return [e, db.libraryDao.findAll().map((it) => it.id)]
  })
})
