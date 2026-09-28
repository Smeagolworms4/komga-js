// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/application/tasks/TasksRepositoryOracleTest.kt
import { Task } from '../../../../src/application/tasks/Task.js'
import type { TasksRepository } from '../../../../src/application/tasks/TasksRepository.js'
import { Thread } from '../../../../src/port/java.js'
import { OracleDb, query } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('application/tasks/TasksRepository')

const db = new OracleDb()
const repository: TasksRepository = db.tasksDao

const owners = () => query(db.tasksDataSource.getConnection(), 'select ID, OWNER from TASK order by ID')

func('takeFirst', () => {
  kase('default owner is the current thread name', () => {
    repository.save([new Task.HashBook({ bookId: 'B1', priority: 1 }), new Task.HashBook({ bookId: 'B2', priority: 2 })])
    const t = repository.takeFirst()
    return [String(t), owners().map((it) => [it[0], it[1] === Thread.currentThread().name])]
  })
  kase('explicit owner', () => [String(repository.takeFirst('me')), owners().map((it) => [it[0], it[1] === Thread.currentThread().name ? '<current thread>' : it[1]])])
  kase('empty queue', () => repository.takeFirst())
})
