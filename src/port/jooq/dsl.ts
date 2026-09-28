// Support de portage : org.jooq.impl.DSL (fonctions statiques) et DSLContext.
// Ce fichier n'a pas de jumeau Kotlin.
import type Database from 'better-sqlite3'
import { IllegalArgumentException } from '../kotlin.js'
import {
  AggregateFunction,
  Batch,
  CaseField,
  CommonTableExpression,
  type Condition,
  Delete,
  Exists,
  FalseCondition,
  type Field,
  FunctionField,
  Insert,
  Name,
  NamedField,
  NamedTable,
  NoCondition,
  Param,
  type Query,
  QueryPart,
  RawCondition,
  RenderContext,
  RawField,
  RawQuery,
  Record,
  Result,
  Row,
  ScalarSubquery,
  Select,
  type SelectFieldOrAsterisk,
  type Table,
  TableRecordImpl,
  newTableRecord,
  TrueCondition,
  Update,
  ValuesTable,
  WindowSpec,
  runQuery,
  runSelect,
} from './core.js'
import { type DataType, SQLDataType, type SqlValue, inferType } from './types.js'

// ---------------------------------------------------------------------------
// DSL
// ---------------------------------------------------------------------------

function asField<T>(v: Field<T> | T): Field<T> {
  return v instanceof QueryPart ? (v as Field<T>) : new Param(v, inferType(v) as DataType<T>)
}

export function noCondition(): Condition {
  return new NoCondition()
}
export function trueCondition(): Condition {
  return new TrueCondition()
}
export function falseCondition(): Condition {
  return new FalseCondition()
}
export function condition(sql: string, ...args: QueryPart[]): Condition {
  return new RawCondition(sql, args)
}

export function count(field?: Field<unknown>): AggregateFunction<number> {
  if (field === undefined) return new (class extends AggregateFunction<number> {
    constructor() {
      super('count', SQLDataType.INTEGER, [])
    }
    render(ctx: import('./core.js').RenderContext): void {
      ctx.append('count(*)')
    }
  })()
  return new AggregateFunction('count', SQLDataType.INTEGER, [field])
}
export function countDistinct(field: Field<unknown>): AggregateFunction<number> {
  return new AggregateFunction('count', SQLDataType.INTEGER, [field], 'distinct ')
}
/** `sum(Int)` renvoie un BigDecimal en jOOQ : ici un nombre (DOUBLE) */
export function sum(field: Field<number>): AggregateFunction<number> {
  return new AggregateFunction('sum', SQLDataType.DOUBLE, [field])
}
export function max<T>(field: Field<T>): AggregateFunction<T> {
  return new AggregateFunction('max', field.type, [field])
}
export function min<T>(field: Field<T>): AggregateFunction<T> {
  return new AggregateFunction('min', field.type, [field])
}
export function avg(field: Field<number>): AggregateFunction<number> {
  return new AggregateFunction('avg', SQLDataType.DOUBLE, [field])
}
export function coalesce<T>(field: Field<T>, ...others: (Field<T> | T)[]): Field<T> {
  return new FunctionField('coalesce', field.type, [field, ...others.map((o) => (o instanceof QueryPart ? o : new Param(o, field.type)))])
}
export function lower(field: Field<string>): Field<string> {
  return new FunctionField('lower', SQLDataType.VARCHAR, [field])
}
export function upper(field: Field<string>): Field<string> {
  return new FunctionField('upper', SQLDataType.VARCHAR, [field])
}
/** `ltrim(field)` ou `ltrim(field, characters)` : `ltrim(x, ?)` */
export function ltrim(field: Field<string>, characters?: Field<string> | string): Field<string> {
  return new FunctionField('ltrim', SQLDataType.VARCHAR, characters === undefined ? [field] : [field, asField(characters)])
}
export function trim(field: Field<string>): Field<string> {
  return new FunctionField('trim', SQLDataType.VARCHAR, [field])
}
export function length(field: Field<string>): Field<number> {
  return new FunctionField('length', SQLDataType.INTEGER, [field])
}
export function substring(field: Field<string>, start: Field<number> | number, len?: Field<number> | number): Field<string> {
  const args: QueryPart[] = [field, asField(start)]
  if (len !== undefined) args.push(asField(len))
  return new FunctionField('substr', SQLDataType.VARCHAR, args)
}
/** `year(date)` : `cast(strftime('%Y', x) as int)` */
export function year(field: Field<unknown>): Field<number> {
  return new RawField(`cast(strftime('%Y', {0}) as int)`, SQLDataType.INTEGER, [field])
}
export function rand(): Field<number> {
  return new RawField('random()', SQLDataType.DOUBLE)
}
export function currentTimestamp(): Field<import('@js-joda/core').LocalDateTime> {
  return new RawField('current_timestamp', SQLDataType.LOCALDATETIME)
}
export function rowNumber(): { over(): WindowSpec<number> } {
  return { over: () => new WindowSpec(new RawField<number>('row_number()', SQLDataType.INTEGER)) }
}
/** `DSL.function(name, type, args)` */
export function function_<T>(name: string, type: DataType<T> | StringConstructor | NumberConstructor, ...args: Field<unknown>[]): Field<T> {
  const t = (type === String ? SQLDataType.VARCHAR : type === Number ? SQLDataType.DOUBLE : type) as DataType<T>
  return new FunctionField(name, t, args)
}

/** `DSL.choose(field)` : `case field when ... end` */
export function choose<T = unknown>(field?: Field<unknown>): CaseField<T> {
  return new CaseField<T>(field ?? null, SQLDataType.OTHER as DataType<T>)
}
/** `DSL.when(condition, result)` : `case when ... end` */
export function when<T>(cond: Condition, result: Field<T> | T): CaseField<T> {
  const type = (result instanceof QueryPart ? (result as Field<T>).type : inferType(result)) as DataType<T>
  return new CaseField<T>(null, type).when(cond, result)
}

export function val<T>(v: T, type?: DataType<T>): Field<T> {
  return new Param(v, type ?? (inferType(v) as DataType<T>))
}
export const value = val
export function inline<T>(v: T, type?: DataType<T>): Field<T> {
  return new Param(v, type ?? (inferType(v) as DataType<T>), true)
}

export function name(...parts: string[]): Name {
  return new Name(parts)
}

/** `DSL.field(name, type)`, `DSL.field(select)` ou `DSL.field("sql", type, args)` */
export function field<T>(nameOrSql: Name | string | Select, type?: DataType<T> | StringConstructor | NumberConstructor, ...args: QueryPart[]): Field<T> {
  const t = (type === String ? SQLDataType.VARCHAR : type === Number ? SQLDataType.DOUBLE : (type ?? SQLDataType.OTHER)) as DataType<T>
  if (nameOrSql instanceof Select) return new ScalarSubquery<T>(nameOrSql, (nameOrSql.selectFields()[0]?.type ?? t) as DataType<T>)
  if (nameOrSql instanceof Name) return new NamedField(nameOrSql, t)
  return new RawField(nameOrSql, t, args)
}

export function table(n: Name | string | Select): Table<unknown> {
  if (n instanceof Select) return n.asTable('alias_' + Math.random().toString(36).slice(2, 10))
  return new NamedTable(n instanceof Name ? n.last() : n)
}

export function row(...fields: (Field<unknown> | unknown)[]): Row {
  return new Row(fields.map((f) => asField(f)))
}
export function values(...rows: Row[]): ValuesTable {
  // PORT: comme org.jooq.impl.Values, un VALUES() sans ligne est refusé
  if (rows.length === 0) throw new IllegalArgumentException('Cannot create a VALUES() constructor with an empty set of rows')
  return new ValuesTable(rows)
}

export function select(...fields: (SelectFieldOrAsterisk | SelectFieldOrAsterisk[])[]): Select {
  return new Select(null, fields.flat())
}
export function selectDistinct(...fields: (SelectFieldOrAsterisk | SelectFieldOrAsterisk[])[]): Select {
  return new Select(null, fields.flat(), true)
}
export function selectOne(): Select {
  return new Select(null).asSelectOne()
}
export function selectCount(): Select {
  return new Select(null).asSelectCount()
}
export function exists(s: Select): Condition {
  return new Exists(s, false)
}
export function notExists(s: Select): Condition {
  return new Exists(s, true)
}

export const DSL = {
  noCondition,
  trueCondition,
  falseCondition,
  condition,
  count,
  countDistinct,
  sum,
  max,
  min,
  avg,
  coalesce,
  lower,
  upper,
  ltrim,
  trim,
  length,
  substring,
  year,
  rand,
  currentTimestamp,
  rowNumber,
  function: function_,
  choose,
  when,
  val,
  value,
  inline,
  name,
  field,
  table,
  row,
  values,
  select,
  selectDistinct,
  selectOne,
  selectCount,
  exists,
  notExists,
}

// ---------------------------------------------------------------------------
// Transactions (@Transactional)
// ---------------------------------------------------------------------------

/**
 * Transactions imbriquées façon Spring (propagation REQUIRED) sur une connexion better-sqlite3.
 * better-sqlite3 est synchrone : une transaction ne peut pas s'étendre au-delà d'un `await`.
 */
const txDepth = new WeakMap<Database.Database, number>()
const txReadOnly = new WeakMap<Database.Database, boolean>()

export function isActualTransactionActive(db: Database.Database): boolean {
  return (txDepth.get(db) ?? 0) > 0
}
export function isCurrentTransactionReadOnly(db: Database.Database): boolean {
  return txReadOnly.get(db) ?? false
}

export function transactional<T>(db: Database.Database, fn: () => T, { readOnly = false }: { readOnly?: boolean } = {}): T {
  const depth = txDepth.get(db) ?? 0
  if (depth > 0) return fn()
  txDepth.set(db, 1)
  txReadOnly.set(db, readOnly)
  db.exec('BEGIN')
  try {
    const r = fn()
    if (r instanceof Promise) throw new Error('@Transactional function must be synchronous (better-sqlite3)')
    db.exec('COMMIT')
    return r
  } catch (e) {
    if (db.inTransaction) db.exec('ROLLBACK')
    throw e
  } finally {
    txDepth.set(db, 0)
    txReadOnly.set(db, false)
  }
}

// ---------------------------------------------------------------------------
// DSLContext
// ---------------------------------------------------------------------------

/** `DSLContext.with(cte)` : WithStep jOOQ, accumule les CTE jusqu'au `select` */
export class WithStep {
  constructor(
    private readonly dsl: DSLContext,
    private readonly ctes: CommonTableExpression[],
  ) {}
  with(cte: CommonTableExpression): WithStep {
    return new WithStep(this.dsl, [...this.ctes, cte])
  }
  select(...fields: (SelectFieldOrAsterisk | SelectFieldOrAsterisk[])[]): Select {
    return new Select(this.dsl, fields.flat()).withCtes(this.ctes)
  }
  selectDistinct(...fields: (SelectFieldOrAsterisk | SelectFieldOrAsterisk[])[]): Select {
    return new Select(this.dsl, fields.flat(), true).withCtes(this.ctes)
  }
  selectFrom(t: Table<unknown>): Select {
    return new Select(this.dsl, [t]).from(t).withCtes(this.ctes)
  }
}

export class DSLContext {
  constructor(readonly db: Database.Database) {}

  select(...fields: (SelectFieldOrAsterisk | SelectFieldOrAsterisk[])[]): Select {
    return new Select(this, fields.flat())
  }
  selectDistinct(...fields: (SelectFieldOrAsterisk | SelectFieldOrAsterisk[])[]): Select {
    return new Select(this, fields.flat(), true)
  }
  selectFrom(t: Table<unknown>): Select {
    return new Select(this, [t]).from(t)
  }
  selectOne(): Select {
    return new Select(this).asSelectOne()
  }
  selectCount(): Select {
    return new Select(this).asSelectCount()
  }

  insertInto<R>(t: Table<R>, ...fields: Field<unknown>[]): Insert<R> {
    return new Insert(this, t, fields)
  }
  update<R>(t: Table<R>): Update<R> {
    return new Update(this, t)
  }
  deleteFrom<R>(t: Table<R>): Delete<R> {
    return new Delete(this, t)
  }
  delete<R>(t: Table<R>): Delete<R> {
    return this.deleteFrom(t)
  }

  /** `with(name).as(select)` puis `.select(...)` */
  with(cte: CommonTableExpression): WithStep
  with(name: string): { as(s: Select): { select(...f: SelectFieldOrAsterisk[]): Select; selectFrom(t: Table<unknown>): Select; cte: CommonTableExpression } }
  with(
    name: string | CommonTableExpression,
  ): WithStep | { as(s: Select): { select(...f: SelectFieldOrAsterisk[]): Select; selectFrom(t: Table<unknown>): Select; cte: CommonTableExpression } } {
    // `with(cte).with(cte2).select(..)` (CTE construite par `name(..).as(..)` / `asMaterialized(..)`)
    if (name instanceof CommonTableExpression) return new WithStep(this, [name])
    return {
      as: (s: Select) => {
        const cte = new CommonTableExpression(name, s)
        return {
          cte,
          select: (...f: SelectFieldOrAsterisk[]) => new Select(this, f).withCtes([cte]),
          selectFrom: (t: Table<unknown>) => new Select(this, [t]).from(t).withCtes([cte]),
        }
      },
    }
  }

  batch(...queries: (Query | Query[])[]): Batch {
    return new Batch(this, queries.flat())
  }
  batchInsert(records: TableRecordImpl[]): Batch {
    return new Batch(
      this,
      records.map((r) => new Insert(this, r.table).setRecord(r)),
    )
  }

  /** `execute(sql, binds...)` ou exécution d'une requête */
  execute(sql: string | Query, ...binds: unknown[]): number {
    if (typeof sql !== 'string') return sql.execute()
    return new RawQuery(this, sql, binds).execute()
  }

  /** `fetch(sql, binds...)` / `fetch(select)` */
  fetch(sql: string | Select, ...binds: unknown[]): Result<Record> {
    if (sql instanceof Select) return sql.fetch()
    const ctx = new RenderContext().visit(new RawQuery(this, sql, binds))
    const { columns, rows } = runSelect(this, ctx.sql, ctx.params.map((p) => p.type.toSql(p.value as never)))
    const fields = columns.map((n) => new NamedField(new Name([n]), SQLDataType.OTHER))
    return Result.ofRecords(rows.map((row) => new Record(fields, row)))
  }

  fetchCount(s: Select | Table<unknown>, cond?: Condition): number {
    const q = s instanceof Select ? s : this.selectOne().from(s).where(cond ?? noCondition())
    return new Select(this).select(count()).from(q.asTable('q')).fetchOne(count()) ?? 0
  }

  fetchExists(s: Select | Table<unknown>, cond?: Condition): boolean {
    const q = s instanceof Select ? s : this.selectOne().from(s).where(cond ?? noCondition())
    return (new Select(this).select(new RawField<number>('exists ({0})', SQLDataType.INTEGER, [q])).fetchOne() as Record).value1() === 1
  }

  fetchOne(t: Table<unknown>, cond?: Condition): Record | null {
    return this.selectFrom(t).where(cond ?? noCondition()).fetchOne()
  }

  fetchValue<T>(s: Select): T | null {
    return s.fetchValue<T>()
  }

  /** `newRecord(table)` */
  newRecord<R>(t: Table<R>): R {
    return newTableRecord(t)
  }

  dropTableIfExists(name: string): { execute(): number } {
    return { execute: () => runQuery(this, `drop table if exists ${JSON.stringify(name)}`, []) }
  }

  /** `transactionResult { }` / `transaction { }` */
  transactionResult<T>(fn: (ctx: DSLContext) => T): T {
    return transactional(this.db, () => fn(this))
  }
  transaction(fn: (ctx: DSLContext) => void): void {
    transactional(this.db, () => fn(this))
  }
}


export type { SqlValue }
