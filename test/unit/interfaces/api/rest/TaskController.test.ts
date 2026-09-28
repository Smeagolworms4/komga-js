// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/TaskControllerOracleTest.kt
import { Task } from '../../../../../src/application/tasks/Task.js'
import { TaskController } from '../../../../../src/interfaces/api/rest/TaskController.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'

const { func, kase } = oracle('interfaces/api/rest/TaskController')

const db = new OracleDb()
const controller = new TaskController(db.tasksDao)

func('emptyTaskQueue', () => {
  kase('empty', () => controller.emptyTaskQueue())
  kase('tasks without owner', () => {
    db.tasksDao.save(new Task.ScanLibrary({ libraryId: 'L1', scanDeep: false }))
    db.tasksDao.save(new Task.EmptyTrash({ libraryId: 'L1' }))
    db.tasksDao.save(new Task.RefreshSeriesMetadata({ seriesId: 'S1' }))
    return [controller.emptyTaskQueue(), db.tasksDao.count()]
  })
  kase('owned tasks are kept', () => {
    db.tasksDao.save(new Task.ScanLibrary({ libraryId: 'L1', scanDeep: true }))
    db.tasksDao.save(new Task.EmptyTrash({ libraryId: 'L2' }))
    db.tasksDao.takeFirst('worker-1')
    return [controller.emptyTaskQueue(), db.tasksDao.findAll().map((it) => it.toString())]
  })
})
