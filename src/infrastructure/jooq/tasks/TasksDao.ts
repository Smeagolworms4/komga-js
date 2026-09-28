// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/tasks/TasksDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { Task } from '../../../application/tasks/Task.js'
import { TasksRepository } from '../../../application/tasks/TasksRepository.js'
import { classForName, qualifiedNameOf } from '../../../port/jackson.js'
import { ObjectMapper } from '../../../port/jackson-mapper.js'
import { Thread } from '../../../port/java.js'
import type { Query, Record, Select } from '../../../port/jooq/core.js'
import { DSL, DSLContext } from '../../../port/jooq/dsl.js'
import { Tables } from '../../../port/jooq/generated/tasks/Tables.js'
import { associate, chunked, groupBy, mapNotNull, nn } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { component } from '../../../port/spring.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.jooq.tasks.TasksDao')

export class TasksDao extends SplitDslDaoBase implements TasksRepository {
  private readonly t = Tables.TASK

  private readonly tasksAvailableCondition = this.t.OWNER.isNull().and(
    this.t.GROUP_ID.notIn(DSL.select(this.t.GROUP_ID).from(this.t).where(this.t.OWNER.isNotNull()).and(this.t.GROUP_ID.isNotNull())).or(this.t.GROUP_ID.isNull()),
  )

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
    private readonly objectMapper: ObjectMapper,
  ) {
    super(dslRW, dslRO)
  }

  hasAvailable(): boolean {
    return this.dslRO.fetchExists(this.t, this.tasksAvailableCondition)
  }

  // @Transactional
  // PORT: le @Transactional de Komga est géré par le gestionnaire de transactions principal (DataSource de la base
  // principale) : il n'englobe pas la connexion des tâches, dont les requêtes sont en autocommit. Même comportement
  // ici : pas de transaction sur la base des tâches (une transaction vide sur la base principale n'a pas d'effet).
  takeFirst(owner: string = Thread.currentThread().name): Task | null {
    const it = this.selectBase(this.dslRW).where(this.tasksAvailableCondition).orderBy(this.t.PRIORITY.desc(), this.t.LAST_MODIFIED_DATE).limit(1).fetchOne()
    let task: Task | null = null
    if (it !== null) {
      try {
        // PORT: Class.forName -> classForName (registre de port/jackson.ts)
        task = this.objectMapper.readValue<Task>(it.value2<string>(), { class: classForName(it.value1<string>()) })
      } catch (e) {
        logger.error(e as Error, () => `Could not deserialize object of type: ${it.value1<string>()}`)
        task = null
      }
    }
    if (task === null) return null

    this.dslRW.update(this.t).set(this.t.OWNER, owner).where(this.t.ID.eq(task.uniqueId)).execute()

    return task
  }

  findAll(): Task[] {
    return mapNotNull(this.selectBase(this.dslRO).fetch(), (it) => this.toDomain(it))
  }

  findAllGroupedByOwner(): Map<string | null, Task[]> {
    const pairs = mapNotNull(this.dslRO.select(this.t.OWNER, this.t.CLASS, this.t.PAYLOAD).from(this.t).fetch(), (it) => {
      const task = this.toDomain(it.into(this.t.CLASS, this.t.PAYLOAD))
      return task !== null ? ([it.value1<string | null>(), task] as const) : null
    })
    // PORT: groupBy(keySelector, valueTransform) -> groupBy puis transformation des valeurs
    return new Map([...groupBy(pairs, (it) => it[0])].map(([k, v]) => [k, v.map((it) => it[1])]))
  }

  private selectBase(self: DSLContext): Select {
    return self.select(this.t.CLASS, this.t.PAYLOAD).from(this.t)
  }

  private toDomain(self: Record): Task | null {
    try {
      // PORT: Class.forName -> classForName (registre de port/jackson.ts)
      return this.objectMapper.readValue<Task>(self.value2<string>(), { class: classForName(self.value1<string>()) })
    } catch (e) {
      logger.error(e as Error, () => `Could not deserialize object of type: ${self.value1<string>()}`)
      return null
    }
  }

  count(): number {
    return this.dslRO.fetchCount(this.t)
  }

  countBySimpleType(): Map<string, number> {
    return associate(
      this.dslRO.select(this.t.SIMPLE_TYPE, DSL.count(this.t.SIMPLE_TYPE)).from(this.t).groupBy(this.t.SIMPLE_TYPE).fetch(),
      (it) => [it.value1<string>(), it.value2<number>()],
    )
  }

  // PORT: surcharges save(task: Task) / save(tasks: Collection<Task>) fusionnées
  save(taskOrTasks: Task | Iterable<Task>): void {
    if (taskOrTasks instanceof Task) {
      const task = taskOrTasks
      this.toQuery(task, this.dslRW).execute()
    } else {
      const tasks = taskOrTasks
      for (const chunk of chunked(
        [...tasks].map((it) => this.toQuery(it, this.dslRW)),
        this.batchSize,
      ))
        this.dslRW.batch(chunk).execute()
    }
  }

  disown(): number {
    return this.dslRW
      .update(this.t)
      .set(this.t.OWNER, null as string | null)
      .where(this.t.OWNER.isNotNull())
      .execute()
  }

  delete(taskId: string): void {
    this.dslRW.deleteFrom(this.t).where(this.t.ID.eq(taskId)).execute()
  }

  deleteAll(): void {
    this.dslRW.deleteFrom(this.t).execute()
  }

  deleteAllWithoutOwner(): number {
    return this.dslRW.deleteFrom(this.t).where(this.t.OWNER.isNull()).execute()
  }

  private toQuery(self: Task, dsl: DSLContext): Query {
    // PORT: javaClass.typeName -> nom qualifié enregistré (registerClass dans Task.ts) ; javaClass.simpleName -> nom de la classe TS
    const typeName = nn(qualifiedNameOf(self.constructor))
    const simpleName = self.constructor.name
    return dsl
      .insertInto(this.t, this.t.ID, this.t.PRIORITY, this.t.GROUP_ID, this.t.CLASS, this.t.SIMPLE_TYPE, this.t.PAYLOAD)
      .values(self.uniqueId, self.priority, self.groupId, typeName, simpleName, this.objectMapper.writeValueAsString(self))
      .onDuplicateKeyUpdate()
      .set(this.t.GROUP_ID, self.groupId)
      .set(this.t.PRIORITY, self.priority)
      .set(this.t.CLASS, typeName)
      .set(this.t.SIMPLE_TYPE, simpleName)
      .set(this.t.PAYLOAD, this.objectMapper.writeValueAsString(self))
      .set(this.t.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
  }
}

component(TasksDao, {
  // PORT: @DependsOn("flywaySecondaryMigrationInitializer")
  dependsOn: ['flywaySecondaryMigrationInitializer'],
  inject: [
    { type: DSLContext, qualifier: 'tasksDslContextRW' },
    { type: DSLContext, qualifier: 'tasksDslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).tasksDb.batchChunkSize },
    ObjectMapper,
  ],
  types: [TasksRepository],
})
