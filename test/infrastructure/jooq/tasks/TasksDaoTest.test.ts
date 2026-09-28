// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/tasks/TasksDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/tasks/TasksDao.js'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { Task } from '../../../../src/application/tasks/Task.js'
import { TasksDao } from '../../../../src/infrastructure/jooq/tasks/TasksDao.js'
import { nn, sortedBy } from '../../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'

describe('TasksDaoTest', () => {
  const ctx = springBootTest()
  const tasksDao = ctx.getBean(TasksDao)
  afterAll(() => closeContext(ctx))

  afterEach(() => {
    tasksDao.deleteAll()
    expect(tasksDao.count()).toBe(0)
  })

  it('given tasks saved when finding tasks then tasks are found', () => {
    // given
    const task1 = new Task.AnalyzeBook({ bookId: 'book1', priority: 0, groupId: 'group1' })
    const task2 = new Task.ConvertBook({ bookId: 'book2', priority: 1, groupId: 'group2' })
    const task3 = new Task.ScanLibrary({ libraryId: 'library1', scanDeep: true, priority: 2 })

    tasksDao.save([task1, task2, task3])

    // when
    const tasks = tasksDao.findAll()

    // then
    expect(tasks).toHaveLength(3)
    {
      const it = sortedBy(tasks, (it) => it.priority)
      expect(it[0]).toBeInstanceOf(Task.AnalyzeBook)
      expect(it[0]).toHaveProperty('bookId', task1.bookId)
      expect(it[0]).toHaveProperty('priority', task1.priority)
      expect(it[0]).toHaveProperty('groupId', task1.groupId)

      expect(it[1]).toBeInstanceOf(Task.ConvertBook)
      expect(it[1]).toHaveProperty('bookId', task2.bookId)
      expect(it[1]).toHaveProperty('priority', task2.priority)
      expect(it[1]).toHaveProperty('groupId', task2.groupId)

      expect(it[2]).toBeInstanceOf(Task.ScanLibrary)
      expect(it[2]).toHaveProperty('libraryId', task3.libraryId)
      expect(it[2]).toHaveProperty('scanDeep', task3.scanDeep)
      expect(it[2]).toHaveProperty('priority', task3.priority)
      expect(it[2]).toHaveProperty('groupId', task3.groupId)
    }
  })

  it('given existing task saved when saving again then it is overwritten', () => {
    // given
    const task1 = new Task.AnalyzeBook({ bookId: 'book1', priority: 0, groupId: 'group1' })
    tasksDao.save(task1)

    {
      const tasks = tasksDao.findAll()
      expect(tasks).toHaveLength(1)
      expect(tasks[0]).toBeInstanceOf(Task.AnalyzeBook)
      expect(tasks[0]).toHaveProperty('bookId', task1.bookId)
      expect(tasks[0]).toHaveProperty('priority', task1.priority)
      expect(tasks[0]).toHaveProperty('groupId', task1.groupId)
    }

    // when
    const task2 = new Task.AnalyzeBook({ bookId: 'book1', priority: 5, groupId: 'group2' })
    tasksDao.save(task2)

    // then
    {
      const tasks = tasksDao.findAll()
      expect(tasks).toHaveLength(1)
      expect(tasks[0]).toBeInstanceOf(Task.AnalyzeBook)
      expect(tasks[0]).toHaveProperty('bookId', task2.bookId)
      expect(tasks[0]).toHaveProperty('priority', task2.priority)
      expect(tasks[0]).toHaveProperty('groupId', task2.groupId)
    }
  })

  it('given no existing tasks when taking fist then returns null', () => {
    // when
    const task = tasksDao.takeFirst()

    // then
    expect(task).toBeNull()
  })

  it('given existing tasks when taking first then it is owned', () => {
    // given
    const task1 = new Task.AnalyzeBook({ bookId: 'book1', priority: 5, groupId: 'group1' })
    const task2 = new Task.ConvertBook({ bookId: 'book2', priority: 3, groupId: 'group2' })
    tasksDao.save([task1, task2])

    // when
    const task1Owned = tasksDao.takeFirst('thread1')
    const task2Owned = tasksDao.takeFirst('thread2')
    const taskEmpty = tasksDao.takeFirst('thread3')

    const allTasks = tasksDao.findAllGroupedByOwner()

    // then
    expect(task1Owned).toBeInstanceOf(Task.AnalyzeBook)
    expect(task1Owned).toHaveProperty('bookId', task1.bookId)
    expect(task1Owned).toHaveProperty('priority', task1.priority)
    expect(task1Owned).toHaveProperty('groupId', task1.groupId)

    expect(task2Owned).toBeInstanceOf(Task.ConvertBook)
    expect(task2Owned).toHaveProperty('bookId', task2.bookId)
    expect(task2Owned).toHaveProperty('priority', task2.priority)
    expect(task2Owned).toHaveProperty('groupId', task2.groupId)

    expect(taskEmpty).toBeNull()

    expect([...allTasks.keys()].sort()).toEqual(['thread1', 'thread2'].sort())
  })

  it('given existing tasks not owned when finding by owner then owner is null', () => {
    // given
    const task1 = new Task.AnalyzeBook({ bookId: 'book1', priority: 5, groupId: 'group1' })
    const task2 = new Task.ConvertBook({ bookId: 'book2', priority: 3, groupId: 'group2' })
    tasksDao.save([task1, task2])

    // when
    const allTasks = tasksDao.findAllGroupedByOwner()

    // then
    expect([...allTasks.keys()]).toEqual([null])
    expect(allTasks.get(null)).toHaveLength(2)
  })

  it('given existing tasks with group when taking then not more than 1 task per group can be owned', () => {
    // given
    tasksDao.save(
      (() => {
        const list: Task[] = []
        for (let it = 1; it <= 10; it++) list.push(new Task.AnalyzeBook({ bookId: `book${it}`, priority: 5, groupId: 'group1' }))
        for (let it = 1; it <= 10; it++) list.push(new Task.ConvertBook({ bookId: `book${it}`, priority: 3, groupId: 'group2' }))
        return list
      })(),
    )

    // when
    expect(tasksDao.hasAvailable()).toBe(true)
    const first = tasksDao.takeFirst('thread1')
    expect(tasksDao.hasAvailable()).toBe(true)
    const second = tasksDao.takeFirst('thread2')
    expect(tasksDao.hasAvailable()).toBe(false)
    const third = tasksDao.takeFirst('thread3')

    tasksDao.delete(nn(first).uniqueId)
    expect(tasksDao.hasAvailable()).toBe(true)
    const fourth = tasksDao.takeFirst('thread1')
    expect(tasksDao.hasAvailable()).toBe(false)
    const fifth = tasksDao.takeFirst('thread4')

    // then
    expect(first).toBeInstanceOf(Task.AnalyzeBook)
    expect(first).toHaveProperty('bookId', 'book1')

    expect(second).toBeInstanceOf(Task.ConvertBook)
    expect(second).toHaveProperty('bookId', 'book1')

    expect(third).toBeNull()

    expect(fourth).toBeInstanceOf(Task.AnalyzeBook)
    expect(fourth).toHaveProperty('bookId', 'book2')

    expect(fifth).toBeNull()
  })

  it('given existing tasks without group when taking then all tasks can be owned', () => {
    // given
    tasksDao.save(
      (() => {
        const list: Task[] = []
        for (let it = 1; it <= 100; it++) list.push(new Task.HashBookPages({ bookId: `book${it}`, priority: 5 }))
        return list
      })(),
    )

    // when
    let count = 0
    const tasks: Task[] = []
    while (tasksDao.hasAvailable()) {
      const it = tasksDao.takeFirst(`thread${count++}`)
      if (it !== null) tasks.push(it)
    }

    // then
    expect(tasks).toHaveLength(100)
  })

  it('given existing tasks when deleting all tasks without owner then only tasks without owner are deleted', () => {
    // given
    tasksDao.save(
      (() => {
        const list: Task[] = []
        for (let it = 1; it <= 20; it++) list.push(new Task.HashBookPages({ bookId: `book${it}`, priority: 5 }))
        return list
      })(),
    )

    for (let it = 0; it < 5; it++) {
      tasksDao.takeFirst(`thread${it}`)
    }

    // when
    const deletedCount = tasksDao.deleteAllWithoutOwner()

    // then
    expect(deletedCount).toBe(15)

    expect(tasksDao.findAll()).toHaveLength(5)

    const byOwner = tasksDao.findAllGroupedByOwner()
    const expectedOwners: string[] = []
    for (let it = 0; it < 5; it++) expectedOwners.push(`thread${it}`)
    expect([...byOwner.keys()].sort()).toEqual([...expectedOwners].sort())
    expect(byOwner.size).toBe(5)
  })

  it('given existing tasks with owner when disowning tasks then tasks do not have owner anymore', () => {
    // given
    tasksDao.save(
      (() => {
        const list: Task[] = []
        for (let it = 1; it <= 20; it++) list.push(new Task.HashBookPages({ bookId: `book${it}`, priority: 5 }))
        return list
      })(),
    )

    const ownedTasks: Task[] = []
    for (let it = 0; it < 5; it++) {
      const task = tasksDao.takeFirst(`thread${it}`)
      if (task !== null) ownedTasks.push(task)
    }

    expect(ownedTasks).toHaveLength(5)

    // when
    const disownCount = tasksDao.disown()
    const disownedTasks = tasksDao.findAll().filter((task) => ownedTasks.map((it) => it.uniqueId).includes(task.uniqueId))

    const groupedByOwner = tasksDao.findAllGroupedByOwner()

    // then
    expect(disownCount).toBe(5)
    expect(disownedTasks).toHaveLength(5)
    expect([...groupedByOwner.keys()]).toEqual([null])
    expect(groupedByOwner.get(null)).toHaveLength(20)
  })

  it('given a single task with owner when counting tasks then the count is 1', () => {
    // given
    tasksDao.save(new Task.HashBookPages({ bookId: 'book1', priority: 5 }))
    tasksDao.takeFirst()

    // when
    const count = tasksDao.count()
    const countByType = tasksDao.countBySimpleType()

    // then
    expect(count).toBe(1)
    expect([...countByType.values()].reduce((a, b) => a + b, 0)).toBe(1)
  })
})
