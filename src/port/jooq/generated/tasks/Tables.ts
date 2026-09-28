// Généré par tools/gen-jooq.mjs depuis le code jOOQ de Komga (65981e600edb24944ffaae4818ff2716a5fa08dd), catalogue "tasks". Ne pas modifier.
// Équivalent de org.gotson.komga.jooq.tasks.{Tables, Keys, tables.*, tables.records.*}
/* eslint-disable */
import type { LocalDate, LocalDateTime } from '@js-joda/core'
import { ForeignKey, Table, TableRecordImpl, UniqueKey, registerRecordClass } from '../../core.js'
import { SQLDataType } from '../../types.js'

export class FlywaySchemaHistory extends Table<FlywaySchemaHistoryRecord> {
  readonly INSTALLED_RANK = this.createField<number>('installed_rank', SQLDataType.INTEGER)
  readonly VERSION = this.createField<string>('version', SQLDataType.VARCHAR)
  readonly DESCRIPTION = this.createField<string>('description', SQLDataType.VARCHAR)
  readonly TYPE = this.createField<string>('type', SQLDataType.VARCHAR)
  readonly SCRIPT = this.createField<string>('script', SQLDataType.VARCHAR)
  readonly CHECKSUM = this.createField<number>('checksum', SQLDataType.INTEGER)
  readonly INSTALLED_BY = this.createField<string>('installed_by', SQLDataType.VARCHAR)
  readonly INSTALLED_ON = this.createField<string>('installed_on', SQLDataType.CLOB)
  readonly EXECUTION_TIME = this.createField<number>('execution_time', SQLDataType.INTEGER)
  readonly SUCCESS = this.createField<boolean>('success', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('flyway_schema_history', alias)
  }

  getPrimaryKey(): UniqueKey<FlywaySchemaHistoryRecord> | null {
    return Keys.FLYWAY_SCHEMA_HISTORY__PK_FLYWAY_SCHEMA_HISTORY as UniqueKey<FlywaySchemaHistoryRecord>
  }
}

export class FlywaySchemaHistoryRecord extends TableRecordImpl<FlywaySchemaHistoryRecord> {
  get installedRank(): number {
    return this.values[0] as number
  }
  set installedRank(v: number) {
    this.values[0] = v
  }
  get version(): string {
    return this.values[1] as string
  }
  set version(v: string) {
    this.values[1] = v
  }
  get description(): string {
    return this.values[2] as string
  }
  set description(v: string) {
    this.values[2] = v
  }
  get type(): string {
    return this.values[3] as string
  }
  set type(v: string) {
    this.values[3] = v
  }
  get script(): string {
    return this.values[4] as string
  }
  set script(v: string) {
    this.values[4] = v
  }
  get checksum(): number {
    return this.values[5] as number
  }
  set checksum(v: number) {
    this.values[5] = v
  }
  get installedBy(): string {
    return this.values[6] as string
  }
  set installedBy(v: string) {
    this.values[6] = v
  }
  get installedOn(): string {
    return this.values[7] as string
  }
  set installedOn(v: string) {
    this.values[7] = v
  }
  get executionTime(): number {
    return this.values[8] as number
  }
  set executionTime(v: number) {
    this.values[8] = v
  }
  get success(): boolean {
    return this.values[9] as boolean
  }
  set success(v: boolean) {
    this.values[9] = v
  }
}
registerRecordClass(FlywaySchemaHistory, FlywaySchemaHistoryRecord as never)

export class Task extends Table<TaskRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly PRIORITY = this.createField<number>('PRIORITY', SQLDataType.INTEGER)
  readonly GROUP_ID = this.createField<string>('GROUP_ID', SQLDataType.VARCHAR)
  readonly CLASS = this.createField<string>('CLASS', SQLDataType.VARCHAR)
  readonly SIMPLE_TYPE = this.createField<string>('SIMPLE_TYPE', SQLDataType.VARCHAR)
  readonly PAYLOAD = this.createField<string>('PAYLOAD', SQLDataType.VARCHAR)
  readonly OWNER = this.createField<string>('OWNER', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)

  constructor(alias: string | null = null) {
    super('TASK', alias)
  }

  getPrimaryKey(): UniqueKey<TaskRecord> | null {
    return Keys.TASK__PK_TASK as UniqueKey<TaskRecord>
  }
}

export class TaskRecord extends TableRecordImpl<TaskRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get priority(): number {
    return this.values[1] as number
  }
  set priority(v: number) {
    this.values[1] = v
  }
  get groupId(): string {
    return this.values[2] as string
  }
  set groupId(v: string) {
    this.values[2] = v
  }
  get class_(): string {
    return this.values[3] as string
  }
  set class_(v: string) {
    this.values[3] = v
  }
  get simpleType(): string {
    return this.values[4] as string
  }
  set simpleType(v: string) {
    this.values[4] = v
  }
  get payload(): string {
    return this.values[5] as string
  }
  set payload(v: string) {
    this.values[5] = v
  }
  get owner(): string {
    return this.values[6] as string
  }
  set owner(v: string) {
    this.values[6] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[7] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[7] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[8] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[8] = v
  }
}
registerRecordClass(Task, TaskRecord as never)

export const Tables = {
  FLYWAY_SCHEMA_HISTORY: new FlywaySchemaHistory(),
  TASK: new Task(),
}

export const FLYWAY_SCHEMA_HISTORY = Tables.FLYWAY_SCHEMA_HISTORY
export const TASK = Tables.TASK

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Keys: { [k: string]: any } = {
  FLYWAY_SCHEMA_HISTORY__PK_FLYWAY_SCHEMA_HISTORY: new UniqueKey(Tables.FLYWAY_SCHEMA_HISTORY, 'pk_flyway_schema_history', ["INSTALLED_RANK"]),
  TASK__PK_TASK: new UniqueKey(Tables.TASK, 'pk_TASK', ["ID"]),
}
const FKS = {
}
Object.assign(Keys, FKS)
