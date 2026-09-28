// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/tasks/TasksDaoOracleTest.kt
import { Task } from '../../../../../src/application/tasks/Task.js'
import { BookMetadataPatchCapability } from '../../../../../src/domain/model/BookMetadataPatch.js'
import { CopyMode } from '../../../../../src/domain/model/CopyMode.js'
import { LuceneEntity } from '../../../../../src/infrastructure/search/LuceneEntity.js'
import { OracleDb, exec as execSql, query } from '../../../db.js'
import { oracle } from '../../../oracle.js'

const { func, kase } = oracle('infrastructure/jooq/tasks/TasksDao')

const db = new OracleDb()
const dao = db.tasksDao

const q = (sql: string) => query(db.tasksDataSource.getConnection(), sql)

const exec = (...sql: string[]) => execSql(db.tasksDataSource.getConnection(), ...sql)

const rows = () => q('select ID, PRIORITY, GROUP_ID, CLASS, SIMPLE_TYPE, PAYLOAD, OWNER from TASK order by ID')

const owners = () => q('select ID, OWNER from TASK order by ID')

/** dates de modification fixes, dans l'ordre des ids, pour que l'ordre de takeFirst ne dépende pas du temps */
const dated = (...ids: string[]) => ids.forEach((id, i) => exec(`update TASK set LAST_MODIFIED_DATE = '2020-01-01 00:00:0${i}' where ID = '${id}'`))

const str = (t: Task | null) => (t === null ? null : t.toString())

func('count', () => {
  kase('empty', () => dao.count())
})
func('hasAvailable', () => {
  kase('empty', () => dao.hasAvailable())
})
func('findAll', () => {
  kase('empty', () => dao.findAll())
})
func('findAllGroupedByOwner', () => {
  kase('empty', () => dao.findAllGroupedByOwner())
})
func('countBySimpleType', () => {
  kase('empty', () => dao.countBySimpleType())
})
func('takeFirst', () => {
  kase('empty', () => dao.takeFirst('w1'))
})

func('save@118', () => {
  kase('one task', () => {
    dao.save(new Task.ScanLibrary({ libraryId: 'L1', scanDeep: true, priority: 6 }))
    return rows()
  })
  kase('dates set', () => q("select CREATED_DATE = LAST_MODIFIED_DATE, abs(julianday(CREATED_DATE) - julianday('now')) < 0.01 from TASK"))
  kase('same task again updates it', () => {
    dao.save(new Task.ScanLibrary({ libraryId: 'L1', scanDeep: true, priority: 2 }))
    return rows()
  })
  kase('update sets the modification date', () =>
    q(
      "select LAST_MODIFIED_DATE >= CREATED_DATE, abs(julianday(LAST_MODIFIED_DATE) - julianday('now')) < 0.01, LAST_MODIFIED_DATE like '____-__-__ __:__:__%' from TASK",
    ),
  )
  kase('task with group', () => {
    dao.save(new Task.AnalyzeBook({ bookId: 'B1', priority: 4, groupId: 'S1' }))
    return rows()
  })
  kase('unique id shared by different parameters', () => {
    dao.save(new Task.RebuildIndex({ entities: new Set([LuceneEntity.Book]) }))
    dao.save(new Task.RebuildIndex({ entities: null, priority: 8 }))
    return q("select ID, PRIORITY, PAYLOAD from TASK where ID = 'REBUILD_INDEX'")
  })
})

func('save@122', () => {
  kase('several tasks', () => {
    dao.save([
      new Task.AnalyzeBook({ bookId: 'B2', priority: 4, groupId: 'S1' }),
      new Task.AnalyzeBook({ bookId: 'B3', priority: 4, groupId: 'S2' }),
      new Task.HashBook({ bookId: 'B1', priority: 0 }),
      new Task.RefreshBookMetadata({ bookId: 'B1', capabilities: new Set([BookMetadataPatchCapability.TITLE]), priority: 5, groupId: 'S1' }),
      new Task.ImportBook({ sourceFile: '/a.cbz', seriesId: 'S3', copyMode: CopyMode.MOVE, destinationName: null, upgradeBookId: null, priority: 6 }),
    ])
    return rows()
  })
  kase('duplicates in the same batch', () => {
    dao.save([new Task.DeleteBook({ bookId: 'B9', priority: 1 }), new Task.DeleteBook({ bookId: 'B9', priority: 3 })])
    return q("select ID, PRIORITY from TASK where ID = 'DELETE_BOOK_B9'")
  })
  kase('empty collection', () => {
    dao.save([])
    return dao.count()
  })
  kase('more than a batch', () => {
    dao.save(Array.from({ length: 2500 }, (_, i) => new Task.GenerateBookThumbnail({ bookId: `T${i + 1}`, priority: 1 })))
    const c = dao.count()
    exec("delete from TASK where ID like 'GENERATE_BOOK_THUMBNAIL_T%'")
    return c
  })
})

func('toQuery', () => {
  kase('class and simple type', () => q('select distinct CLASS, SIMPLE_TYPE from TASK order by CLASS'))
  kase('payloads', () => q('select PAYLOAD from TASK order by ID'))
})

func('count', () => {
  kase('some tasks', () => dao.count())
})

func('countBySimpleType', () => {
  kase('some tasks', () => dao.countBySimpleType())
})

func('findAll', () => {
  kase('all tasks', () => dao.findAll().map((it) => it.toString()))
  kase('types', () => dao.findAll().map((it) => it.constructor.name))
})

func('selectBase', () => {
  kase('class and payload are read', () => dao.findAll().map((it) => it.uniqueId))
})

func('toDomain', () => {
  kase('unknown class is skipped', () => {
    exec("insert into TASK(ID, PRIORITY, CLASS, SIMPLE_TYPE, PAYLOAD) values ('BAD_CLASS', 1, 'org.gotson.komga.application.tasks.Task$Nope', 'Nope', '{}')")
    return dao.findAll().length
  })
  kase('invalid payload is skipped', () => {
    exec(`insert into TASK(ID, PRIORITY, CLASS, SIMPLE_TYPE, PAYLOAD) values ('BAD_PAYLOAD', 1, 'org.gotson.komga.application.tasks.Task$HashBook', 'HashBook', '{"nope":1}')`)
    return dao.findAll().length
  })
  kase('payload read as is', () => {
    exec(
      `insert into TASK(ID, PRIORITY, CLASS, SIMPLE_TYPE, PAYLOAD) values ('ODD', 1, 'org.gotson.komga.application.tasks.Task$DeleteSeries', 'x', '{"seriesId":"S7","priority":9,"groupId":"G","uniqueId":"U"}')`,
    )
    return dao
      .findAll()
      .filter((it) => it instanceof Task.DeleteSeries)
      .map((it) => [it.toString(), it.uniqueId, it.groupId])
  })
  kase('cleanup', () => {
    dao.delete('BAD_CLASS')
    dao.delete('BAD_PAYLOAD')
    dao.delete('ODD')
    return dao.count()
  })
})

func('hasAvailable', () => {
  kase('some tasks', () => dao.hasAvailable())
})

func('takeFirst', () => {
  kase('highest priority first', () => {
    dated('SCAN_LIBRARY_L1_DEEP_true', 'ANALYZE_BOOK_B1', 'ANALYZE_BOOK_B2', 'ANALYZE_BOOK_B3', 'HASH_BOOK_B1', 'REFRESH_BOOK_METADATA_B1', 'IMPORT_BOOK_S3_/a.cbz', 'REBUILD_INDEX', 'DELETE_BOOK_B9')
    return str(dao.takeFirst('w1'))
  })
  kase('owner set', () => owners())
  kase('next one', () => str(dao.takeFirst('w2')))
  kase('group of an owned task is skipped', () => str(dao.takeFirst('w3')))
  kase('owners', () => owners())
  kase('available', () => dao.hasAvailable())
  kase('until empty', () => Array.from({ length: 10 }, () => str(dao.takeFirst('w4'))))
  kase('none available', () => dao.hasAvailable())
  kase('grouped by owner', () => new Map([...dao.findAllGroupedByOwner()].map(([k, v]) => [k, v.map((it) => it.toString())])))
})

func('findAllGroupedByOwner', () => {
  kase('keys', () => new Set(dao.findAllGroupedByOwner().keys()))
})

func('disown', () => {
  kase('resets owners', () => dao.disown())
  kase('owners', () => owners())
  kase('nothing to disown', () => dao.disown())
  kase('available again', () => dao.hasAvailable())
})

func('takeFirst', () => {
  kase('same priority, oldest first', () => {
    exec('update TASK set PRIORITY = 1')
    dated('DELETE_BOOK_B9', 'HASH_BOOK_B1', 'ANALYZE_BOOK_B3')
    return str(dao.takeFirst('x'))
  })
  kase('undeserializable first task', () => {
    exec("insert into TASK(ID, PRIORITY, CLASS, SIMPLE_TYPE, PAYLOAD) values ('BAD', 99, 'nope', 'nope', '{}')")
    return [str(dao.takeFirst('y')), q("select OWNER from TASK where ID = 'BAD'")]
  })
  kase('group of a task owned by a bad row', () => {
    exec("update TASK set OWNER = 'z', GROUP_ID = 'S1' where ID = 'BAD'")
    return str(dao.takeFirst('y'))
  })
})

func('delete', () => {
  kase('existing', () => {
    dao.delete('BAD')
    return dao.count()
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return dao.count()
  })
})

func('deleteAllWithoutOwner', () => {
  kase('deletes tasks without owner', () => dao.deleteAllWithoutOwner())
  kase('remaining', () => owners())
  kase('again', () => dao.deleteAllWithoutOwner())
})

func('deleteAll', () => {
  kase('deletes everything', () => {
    dao.save(new Task.UpgradeIndex())
    dao.deleteAll()
    return dao.count()
  })
  kase('empty', () => {
    dao.deleteAll()
    return [dao.count(), dao.hasAvailable(), dao.takeFirst('w')]
  })
})
