// Compatibilité des tâches avec Komga (sans jumeau Kotlin).
// Fixtures produites par Komga (tools/jshell-komga.sh, classes et TasksDao réels, ObjectMapper de Spring Boot) :
// - fixtures/komga-tasks.json : pour chaque tâche, javaClass.typeName, simpleName, uniqueId, JSON (Jackson), toString(),
//   et toString() après relecture par Jackson ;
// - fixtures/komga-tasks.sqlite : base des tâches migrée par Flyway, remplie par TasksDao.save(tâches),
//   save(HashBookPages("book9", 7)) puis takeFirst("thread1").
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Task } from '../../../../src/application/tasks/Task.js'
import { BookMetadataPatchCapability } from '../../../../src/domain/model/BookMetadataPatch.js'
import { BookPageNumbered } from '../../../../src/domain/model/BookPageNumbered.js'
import { CopyMode } from '../../../../src/domain/model/CopyMode.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { LuceneEntity } from '../../../../src/infrastructure/search/LuceneEntity.js'
import { TasksDao } from '../../../../src/infrastructure/jooq/tasks/TasksDao.js'
import { qualifiedNameOf } from '../../../../src/port/jackson.js'
import { ObjectMapper } from '../../../../src/port/jackson-mapper.js'
import { DSLContext } from '../../../../src/port/jooq/dsl.js'

const FIXTURES = join(import.meta.dirname, 'fixtures')

type Fixture = { class: string; simpleType: string; uniqueId: string; payload: string; toString: string; readBack: string }
const fixtures = JSON.parse(readFileSync(join(FIXTURES, 'komga-tasks.json'), 'utf8')) as Fixture[]

// mêmes tâches, dans le même ordre, que le script jshell
function komgaTasks(): Task[] {
  return [
    new Task.ScanLibrary({ libraryId: 'lib1', scanDeep: true, priority: 3 }),
    new Task.FindBooksToConvert({ libraryId: 'lib1', priority: 4 }),
    new Task.FindBooksWithMissingPageHash({ libraryId: 'lib1', priority: 4 }),
    new Task.FindDuplicatePagesToDelete({ libraryId: 'lib1', priority: 4 }),
    new Task.EmptyTrash({ libraryId: 'lib1', priority: 4 }),
    new Task.AnalyzeBook({ bookId: 'book1', priority: 5, groupId: 'grp' }),
    new Task.GenerateBookThumbnail({ bookId: 'book1', priority: 4 }),
    new Task.RefreshBookMetadata({ bookId: 'book1', capabilities: new Set([BookMetadataPatchCapability.TITLE, BookMetadataPatchCapability.AUTHORS]), priority: 4, groupId: 'grp' }),
    new Task.HashBook({ bookId: 'book1', priority: 4 }),
    new Task.HashBookPages({ bookId: 'book1', priority: 4 }),
    new Task.HashBookKoreader({ bookId: 'book1', priority: 4 }),
    new Task.RefreshSeriesMetadata({ seriesId: 'series1', priority: 4 }),
    new Task.AggregateSeriesMetadata({ seriesId: 'series1', priority: 4 }),
    new Task.RefreshBookLocalArtwork({ bookId: 'book1', priority: 4 }),
    new Task.RefreshSeriesLocalArtwork({ seriesId: 'series1', priority: 4 }),
    new Task.ImportBook({ sourceFile: '/tmp/a b.cbz', seriesId: 'series1', copyMode: CopyMode.HARDLINK, destinationName: null, upgradeBookId: 'book2', priority: 4 }),
    new Task.ImportBook({ sourceFile: '/tmp/é "q".cbz', seriesId: 'series1', copyMode: CopyMode.COPY, destinationName: 'dest', upgradeBookId: null, priority: 4 }),
    new Task.ConvertBook({ bookId: 'book1', priority: 4, groupId: 'grp' }),
    new Task.RepairExtension({ bookId: 'book1', priority: 4, groupId: 'grp' }),
    new Task.RemoveHashedPages({
      bookId: 'book1',
      pages: [
        new BookPageNumbered({ fileName: 'p1.jpg', mediaType: 'image/jpeg', dimension: new Dimension({ width: 10, height: 20 }), fileHash: 'abc', fileSize: 123, pageNumber: 1 }),
        new BookPageNumbered({ fileName: 'p2.jpg', mediaType: 'image/png', dimension: null, fileHash: '', fileSize: null, pageNumber: 2 }),
      ],
      priority: 4,
    }),
    new Task.RebuildIndex({ entities: null, priority: 4 }),
    new Task.RebuildIndex({ entities: new Set([LuceneEntity.Book, LuceneEntity.ReadList]), priority: 4 }),
    new Task.UpgradeIndex({ priority: 4 }),
    new Task.DeleteBook({ bookId: 'book1', priority: 4 }),
    new Task.DeleteSeries({ seriesId: 'series1', priority: 4 }),
    new Task.FindBookThumbnailsToRegenerate({ forBiggerResultOnly: true, priority: 2 }),
  ]
}

type Row = { ID: string; PRIORITY: number; GROUP_ID: string | null; CLASS: string; SIMPLE_TYPE: string; PAYLOAD: string; OWNER: string | null }
function rows(db: Database.Database): Row[] {
  return db.prepare('select ID, PRIORITY, GROUP_ID, CLASS, SIMPLE_TYPE, PAYLOAD, OWNER from TASK order by ID').all() as Row[]
}

describe('TasksCompat', () => {
  const mapper = new ObjectMapper()

  it('serializes every task like Komga', () => {
    const tasks = komgaTasks()
    expect(tasks).toHaveLength(fixtures.length)
    tasks.forEach((task, i) => {
      const f = fixtures[i] as Fixture
      expect(qualifiedNameOf(task.constructor)).toBe(f.class)
      expect(task.constructor.name).toBe(f.simpleType)
      expect(task.uniqueId).toBe(f.uniqueId)
      expect(mapper.writeValueAsString(task)).toBe(f.payload)
      expect(task.toString()).toBe(f.toString)
    })
  })

  it('reads every task serialized by Komga', () => {
    const tasks = komgaTasks()
    fixtures.forEach((f, i) => {
      const read = mapper.readValue<Task>(f.payload, { class: tasks[i]?.constructor as object })
      expect(read).toBeInstanceOf(tasks[i]?.constructor as never)
      // Komga relit un Set<Enum> dans un HashSet (ordre d'itération non garanti) : comparaison du toString de départ
      expect(read.toString()).toBe(f.toString)
      expect(mapper.writeValueAsString(read)).toBe(f.payload)
    })
  })

  describe('database', () => {
    let dir: string
    let db: Database.Database
    let dao: TasksDao

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'komga-tasks-'))
      copyFileSync(join(FIXTURES, 'komga-tasks.sqlite'), join(dir, 'tasks.sqlite'))
      db = new Database(join(dir, 'tasks.sqlite'))
      dao = new TasksDao(new DSLContext(db), new DSLContext(db), 1000, mapper)
    })

    afterEach(() => {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    })

    it('reads a tasks database written by Komga', () => {
      // la seconde RebuildIndex a remplacé la première (même uniqueId)
      const expected = [...fixtures.filter((_, i) => i !== 20).map((it) => it.toString), "HashBookPages(bookId='book9', priority='7')"]
      expect(dao.count()).toBe(26)
      expect(
        dao
          .findAll()
          .map((it) => it.toString())
          .sort(),
      ).toEqual(expected.sort())

      const byOwner = dao.findAllGroupedByOwner()
      expect([...byOwner.keys()].sort()).toEqual(['thread1', null].sort())
      expect(byOwner.get(null)).toHaveLength(25)
      expect(byOwner.get('thread1')?.map((it) => it.toString())).toEqual(["HashBookPages(bookId='book9', priority='7')"])

      const countByType = dao.countBySimpleType()
      expect(countByType.get('HashBookPages')).toBe(2)
      expect(countByType.get('ImportBook')).toBe(2)
      expect(countByType.size).toBe(24)

      expect(dao.hasAvailable()).toBe(true)
      expect(dao.takeFirst('thread2')?.toString()).toBe("AnalyzeBook(bookId='book1', priority='5')")
    })

    it('writes a tasks database like Komga', () => {
      const komgaRows = rows(db)
      dao.deleteAll()
      expect(dao.count()).toBe(0)

      dao.save(komgaTasks())
      dao.save(new Task.HashBookPages({ bookId: 'book9', priority: 7 }))
      dao.takeFirst('thread1')

      expect(rows(db)).toEqual(komgaRows)
      // dates : format de Komga (texte 'yyyy-MM-dd HH:mm:ss[.f]'), LAST_MODIFIED_DATE écrit par l'upsert
      const dates = db.prepare("select CREATED_DATE, LAST_MODIFIED_DATE from TASK where ID = 'REBUILD_INDEX'").get() as { CREATED_DATE: string; LAST_MODIFIED_DATE: string }
      expect(dates.CREATED_DATE).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      expect(dates.LAST_MODIFIED_DATE).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/)
    })
  })
})
