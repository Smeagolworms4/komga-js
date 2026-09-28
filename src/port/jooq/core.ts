// Support de portage : sous-ensemble de jOOQ 3.19 (dialecte SQLite) utilisé par Komga.
// Même API (noms de méthodes, chaînage) pour que les DAO Kotlin se portent ligne à ligne.
// Le SQL produit suit le rendu de jOOQ relevé sur la vraie bibliothèque (voir PORTING.md et
// test/port/jooq/*.test.ts). Ce fichier n'a pas de jumeau Kotlin.
import type Database from 'better-sqlite3'
import { IllegalArgumentException, UnsupportedOperationException } from '../kotlin.js'
import { DataAccessException, DataIntegrityViolationException, NoDataFoundException, TooManyRowsException } from './exceptions.js'
import { type DataType, SQLDataType, type SqlValue, inferType } from './types.js'

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

export class RenderContext {
  sql = ''
  readonly params: { value: unknown; type: DataType<unknown> }[] = []
  /** Dans une clause FROM/JOIN : les tables se rendent avec leur alias déclaré */
  declareTables = false

  append(s: string): this {
    this.sql += s
    return this
  }

  bind(value: unknown, type: DataType<unknown>): this {
    this.params.push({ value, type })
    this.sql += '?'
    return this
  }

  visit(p: QueryPart): this {
    p.render(this)
    return this
  }

  visitList(parts: readonly QueryPart[], sep = ', '): this {
    parts.forEach((p, i) => {
      if (i > 0) this.append(sep)
      this.visit(p)
    })
    return this
  }

  declaring(fn: () => void): this {
    const prev = this.declareTables
    this.declareTables = true
    fn()
    this.declareTables = prev
    return this
  }
}

export function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

export abstract class QueryPart {
  abstract render(ctx: RenderContext): void

  /** SQL avec paramètres liés (pour les logs et les tests) */
  getSQL(): string {
    return new RenderContext().visit(this).sql
  }

  toString(): string {
    return this.getSQL()
  }
}

// ---------------------------------------------------------------------------
// Noms
// ---------------------------------------------------------------------------

export class Name extends QueryPart {
  constructor(readonly parts: string[]) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.append(this.parts.map(quote).join('.'))
  }
  last(): string {
    return this.parts[this.parts.length - 1] as string
  }
}

// ---------------------------------------------------------------------------
// Champs
// ---------------------------------------------------------------------------

type FieldOrValue<T> = Field<T> | T | null

function toField<T>(v: FieldOrValue<T>, type: DataType<T>): Field<T> {
  return v instanceof Field ? v : new Param<T>(v, type)
}

export abstract class Field<T> extends QueryPart {
  constructor(
    readonly name: string,
    readonly type: DataType<T>,
  ) {
    super()
  }

  /** Nom qualifiant (table ou alias) pour la résolution dans un Record */
  qualifier(): string | null {
    return null
  }

  // --- comparaisons -------------------------------------------------------

  eq(v: FieldOrValue<T> | Select): Condition {
    return v instanceof Select ? new CompareSubquery(this, '=', v) : new Compare(this, '=', toField(v, this.type))
  }
  equal(v: FieldOrValue<T>): Condition {
    return this.eq(v)
  }
  ne(v: FieldOrValue<T>): Condition {
    return new Compare(this, '<>', toField(v, this.type))
  }
  notEqual(v: FieldOrValue<T>): Condition {
    return this.ne(v)
  }
  gt(v: FieldOrValue<T>): Condition {
    return new Compare(this, '>', toField(v, this.type))
  }
  greaterThan(v: FieldOrValue<T>): Condition {
    return this.gt(v)
  }
  ge(v: FieldOrValue<T>): Condition {
    return new Compare(this, '>=', toField(v, this.type))
  }
  greaterOrEqual(v: FieldOrValue<T>): Condition {
    return this.ge(v)
  }
  lt(v: FieldOrValue<T>): Condition {
    return new Compare(this, '<', toField(v, this.type))
  }
  lessThan(v: FieldOrValue<T>): Condition {
    return this.lt(v)
  }
  le(v: FieldOrValue<T>): Condition {
    return new Compare(this, '<=', toField(v, this.type))
  }
  lessOrEqual(v: FieldOrValue<T>): Condition {
    return this.le(v)
  }
  between(a: FieldOrValue<T>, b: FieldOrValue<T>): Condition {
    return new Between(this, toField(a, this.type), toField(b, this.type))
  }

  /** `in(Collection)`, `in(vararg)` ou `in(Select)` */
  in(...values: (Iterable<T> | T | Select | Field<T>)[]): Condition {
    return inCondition(this, values, false)
  }
  notIn(...values: (Iterable<T> | T | Select | Field<T>)[]): Condition {
    return inCondition(this, values, true)
  }

  isNull(): Condition {
    return new Postfix(this, ' is null')
  }
  isNotNull(): Condition {
    return new Postfix(this, ' is not null')
  }
  isTrue(): Condition {
    return this.eq(true as T)
  }
  isFalse(): Condition {
    return this.eq(false as T)
  }
  isDistinctFrom(v: FieldOrValue<T>): Condition {
    return new Compare(this, ' is not ', toField(v, this.type))
  }
  isNotDistinctFrom(v: FieldOrValue<T>): Condition {
    return new Compare(this, ' is ', toField(v, this.type))
  }

  like(pattern: FieldOrValue<string>, escape?: string): Condition {
    return new Like(this, toField(pattern, SQLDataType.VARCHAR), false, escape)
  }
  notLike(pattern: FieldOrValue<string>, escape?: string): Condition {
    return new Like(this, toField(pattern, SQLDataType.VARCHAR), true, escape)
  }
  likeIgnoreCase(pattern: FieldOrValue<string>): Condition {
    return new Like(lowerOf(this as Field<unknown> as Field<string>), lowerOf(toField(pattern, SQLDataType.VARCHAR)), false)
  }
  /** `contains(v)` : `like ('%' || escaped(v) || '%') escape '!'` */
  contains(v: FieldOrValue<string>): Condition {
    return new Like(this, concatLike(true, toField(v, SQLDataType.VARCHAR), true), false, '!')
  }
  containsIgnoreCase(v: FieldOrValue<string>): Condition {
    return new Like(lowerOf(this as Field<unknown> as Field<string>), lowerOf(concatLike(true, toField(v, SQLDataType.VARCHAR), true)), false, '!')
  }
  startsWith(v: FieldOrValue<string>): Condition {
    return new Like(this, concatLike(false, toField(v, SQLDataType.VARCHAR), true), false, '!')
  }
  startsWithIgnoreCase(v: FieldOrValue<string>): Condition {
    return new Like(lowerOf(this as Field<unknown> as Field<string>), lowerOf(concatLike(false, toField(v, SQLDataType.VARCHAR), true)), false, '!')
  }
  endsWith(v: FieldOrValue<string>): Condition {
    return new Like(this, concatLike(true, toField(v, SQLDataType.VARCHAR), false), false, '!')
  }
  endsWithIgnoreCase(v: FieldOrValue<string>): Condition {
    return new Like(lowerOf(this as Field<unknown> as Field<string>), lowerOf(concatLike(true, toField(v, SQLDataType.VARCHAR), false)), false, '!')
  }
  likeRegex(pattern: FieldOrValue<string>): Condition {
    return new Compare(this, ' regexp ', toField(pattern, SQLDataType.VARCHAR) as Field<unknown> as Field<T>)
  }
  notLikeRegex(pattern: FieldOrValue<string>): Condition {
    return new Not(this.likeRegex(pattern))
  }

  // --- tri ----------------------------------------------------------------

  asc(): SortField<T> {
    return new SortField(this, 'asc')
  }
  desc(): SortField<T> {
    return new SortField(this, 'desc')
  }
  sortDefault(): SortField<T> {
    return new SortField(this, null)
  }
  sort(asc: boolean): SortField<T> {
    return asc ? this.asc() : this.desc()
  }

  // --- expressions ----------------------------------------------------------

  as(alias: string | Name): Field<T> {
    return new AliasedField(this, typeof alias === 'string' ? alias : alias.last())
  }
  collate(collation: string): Field<T> {
    return new Collated(this, collation)
  }
  plus(v: FieldOrValue<T>): Field<T> {
    return new Arithmetic(this, '+', toField(v, this.type))
  }
  add(v: FieldOrValue<T>): Field<T> {
    return this.plus(v)
  }
  minus(v: FieldOrValue<T>): Field<T> {
    return new Arithmetic(this, '-', toField(v, this.type))
  }
  sub(v: FieldOrValue<T>): Field<T> {
    return this.minus(v)
  }
  times(v: FieldOrValue<T>): Field<T> {
    return new Arithmetic(this, '*', toField(v, this.type))
  }
  mul(v: FieldOrValue<T>): Field<T> {
    return this.times(v)
  }
  div(v: FieldOrValue<T>): Field<T> {
    return new Arithmetic(this, '/', toField(v, this.type))
  }
  cast<U>(type: DataType<U>): Field<U> {
    return new Cast(this, type)
  }
  coerce<U>(type: DataType<U>): Field<U> {
    return new Coerce(this, type)
  }
  /** Référence non qualifiée (`field.unqualifiedName`) */
  get unqualifiedName(): Name {
    return new Name([this.name])
  }
  getName(): string {
    return this.name
  }
}

export class TableField<R, T> extends Field<T> {
  constructor(
    readonly table: Table<R>,
    name: string,
    type: DataType<T>,
  ) {
    super(name, type)
  }
  qualifier(): string | null {
    return this.table.qualifier()
  }
  getTable(): Table<R> {
    return this.table
  }
  render(ctx: RenderContext): void {
    ctx.append(`${quote(this.table.qualifier())}.${quote(this.name)}`)
  }
}

/** Champ nommé (DSL.field(name(...))) */
export class NamedField<T> extends Field<T> {
  constructor(
    readonly qualifiedName: Name,
    type: DataType<T>,
  ) {
    super(qualifiedName.last(), type)
  }
  qualifier(): string | null {
    return this.qualifiedName.parts.length > 1 ? (this.qualifiedName.parts[this.qualifiedName.parts.length - 2] as string) : null
  }
  render(ctx: RenderContext): void {
    ctx.visit(this.qualifiedName)
  }
}

/** Champ SQL brut (DSL.field("sql")) */
export class RawField<T> extends Field<T> {
  constructor(
    readonly sql: string,
    type: DataType<T>,
    readonly args: QueryPart[] = [],
  ) {
    super(sql, type)
  }
  render(ctx: RenderContext): void {
    // remplace {0}, {1}... par les arguments
    const parts = this.sql.split(/\{(\d+)\}/)
    parts.forEach((p, i) => {
      if (i % 2 === 0) ctx.append(p)
      else ctx.visit(this.args[Number(p)] as QueryPart)
    })
  }
}

export class Param<T> extends Field<T> {
  constructor(
    readonly value: T | null,
    type: DataType<T>,
    readonly inlined = false,
  ) {
    super('?', type)
  }
  render(ctx: RenderContext): void {
    if (this.inlined) ctx.append(inlineValue(this.type.toSql(this.value)))
    else ctx.bind(this.value, this.type as DataType<unknown>)
  }
}

function inlineValue(v: SqlValue): string {
  if (v === null) return 'null'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'string') return `'${v.replaceAll("'", "''")}'`
  return `X'${Buffer.from(v).toString('hex')}'`
}

class AliasedField<T> extends Field<T> {
  constructor(
    readonly field: Field<T>,
    alias: string,
  ) {
    super(alias, field.type)
  }
  render(ctx: RenderContext): void {
    if (ctx.declareTables) ctx.visit(this.field).append(` as ${quote(this.name)}`)
    else ctx.append(quote(this.name))
  }
}

class Collated<T> extends Field<T> {
  constructor(
    readonly field: Field<T>,
    readonly collation: string,
  ) {
    super(field.name, field.type)
  }
  qualifier(): string | null {
    return this.field.qualifier()
  }
  render(ctx: RenderContext): void {
    ctx.append('((').visit(this.field).append(`) collate ${this.collation})`)
  }
}

class Arithmetic<T> extends Field<T> {
  constructor(
    readonly a: Field<T>,
    readonly op: string,
    readonly b: Field<T>,
  ) {
    super(`${a.name}`, a.type)
  }
  render(ctx: RenderContext): void {
    ctx.append('(').visit(this.a).append(` ${this.op} `).visit(this.b).append(')')
  }
}

class Cast<T> extends Field<T> {
  constructor(
    readonly field: Field<unknown>,
    type: DataType<T>,
  ) {
    super(field.name, type)
  }
  render(ctx: RenderContext): void {
    const sqlType: { [k: string]: string } = {
      VARCHAR: 'varchar',
      CLOB: 'clob',
      INTEGER: 'int',
      BIGINT: 'bigint',
      REAL: 'real',
      DOUBLE: 'double',
      BOOLEAN: 'boolean',
      LOCALDATETIME: 'timestamp',
      LOCALDATE: 'date',
      BLOB: 'blob',
    }
    ctx.append('cast(').visit(this.field).append(` as ${sqlType[this.type.name] ?? 'text'})`)
  }
}

class Coerce<T> extends Field<T> {
  constructor(
    readonly field: Field<unknown>,
    type: DataType<T>,
  ) {
    super(field.name, type)
  }
  qualifier(): string | null {
    return this.field.qualifier()
  }
  render(ctx: RenderContext): void {
    ctx.visit(this.field)
  }
}

export class FunctionField<T> extends Field<T> {
  constructor(
    readonly fn: string,
    type: DataType<T>,
    readonly args: QueryPart[],
    readonly prefix = '',
  ) {
    super(fn, type)
  }
  render(ctx: RenderContext): void {
    ctx.append(`${this.fn}(${this.prefix}`).visitList(this.args).append(')')
  }
}

export class AggregateFunction<T> extends FunctionField<T> {
  filterWhere(c: Condition): Field<T> {
    return new RawField<T>('{0} filter (where {1})', this.type, [this, c])
  }
  over(): WindowSpec<T> {
    return new WindowSpec(this)
  }
}

class CountStar extends AggregateFunction<number> {
  constructor() {
    super('count', SQLDataType.INTEGER, [])
  }
  render(ctx: RenderContext): void {
    ctx.append('count(*)')
  }
}

export class WindowSpec<T> extends Field<T> {
  private partition: Field<unknown>[] = []
  private order: SortField<unknown>[] = []
  constructor(readonly fn: Field<T>) {
    super(fn.name, fn.type)
  }
  partitionBy(...fields: Field<unknown>[]): this {
    this.partition = fields
    return this
  }
  orderBy(...fields: (Field<unknown> | SortField<unknown>)[]): this {
    this.order = fields.map((f) => (f instanceof SortField ? f : f.sortDefault()))
    return this
  }
  render(ctx: RenderContext): void {
    ctx.visit(this.fn).append(' over (')
    if (this.partition.length) ctx.append('partition by ').visitList(this.partition)
    if (this.order.length) {
      if (this.partition.length) ctx.append(' ')
      ctx.append('order by ').visitList(this.order)
    }
    ctx.append(')')
  }
}

export class ScalarSubquery<T> extends Field<T> {
  constructor(
    readonly select: Select,
    type: DataType<T>,
  ) {
    super('', type)
  }
  render(ctx: RenderContext): void {
    ctx.append('(').visit(this.select).append(')')
  }
}

/** `DSL.choose(field).when(v, r)...otherwise(r)` et `DSL.when(cond, r)...otherwise(r)` */
export class CaseField<T> extends Field<T> {
  private readonly whens: [QueryPart, Field<T>][] = []
  private else_: Field<T> | null = null

  constructor(
    readonly value: Field<unknown> | null,
    type: DataType<T>,
  ) {
    super('case', type)
  }

  when(v: unknown, result: FieldOrValue<T>): this {
    const w = this.value === null ? (v as Condition) : toField(v, this.value.type)
    const r = toField(result, this.type.name === 'OTHER' && !(result instanceof Field) ? (inferType(result) as DataType<T>) : this.type)
    this.whens.push([w, r])
    return this
  }

  otherwise(result: FieldOrValue<T>): Field<T> {
    this.else_ = toField(result, this.whens[0]?.[1].type ?? this.type)
    return this
  }
  else(result: FieldOrValue<T>): Field<T> {
    return this.otherwise(result)
  }

  render(ctx: RenderContext): void {
    ctx.append('case')
    if (this.value) ctx.append(' ').visit(this.value)
    for (const [w, r] of this.whens) ctx.append(' when ').visit(w).append(' then ').visit(r)
    if (this.else_) ctx.append(' else ').visit(this.else_)
    ctx.append(' end')
  }
}

function lowerOf(f: Field<string>): Field<string> {
  return new FunctionField('lower', SQLDataType.VARCHAR, [f])
}

// helpers `contains` / `startsWith` : ('%' || replace(replace(replace(v,'!','!!'),'%','!%'),'_','!_') || '%')
function concatLike(prefix: boolean, v: Field<string>, suffix: boolean): Field<string> {
  const esc = new RawField<string>(`"replace"("replace"("replace"({0}, '!', '!!'), '%', '!%'), '_', '!_')`, SQLDataType.VARCHAR, [v])
  if (prefix && suffix) return new RawField(`(('%' || {0}) || '%')`, SQLDataType.VARCHAR, [esc])
  if (prefix) return new RawField(`('%' || {0})`, SQLDataType.VARCHAR, [esc])
  return new RawField(`({0} || '%')`, SQLDataType.VARCHAR, [esc])
}

// ---------------------------------------------------------------------------
// Tri
// ---------------------------------------------------------------------------

export class SortField<T> extends QueryPart {
  private nulls: 'first' | 'last' | null = null
  constructor(
    readonly field: Field<T>,
    readonly order: 'asc' | 'desc' | null,
  ) {
    super()
  }
  nullsFirst(): this {
    this.nulls = 'first'
    return this
  }
  nullsLast(): this {
    this.nulls = 'last'
    return this
  }
  get isAscending(): boolean {
    return this.order !== 'desc'
  }
  render(ctx: RenderContext): void {
    ctx.visit(this.field)
    if (this.order) ctx.append(` ${this.order}`)
    if (this.nulls) ctx.append(` nulls ${this.nulls}`)
  }
}

export type OrderField = Field<unknown> | SortField<unknown>

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export abstract class Condition extends QueryPart {
  and(...others: (Condition | null | undefined)[]): Condition {
    return others.reduce<Condition>((acc, o) => (o ? combine('and', acc, o) : acc), this)
  }
  or(...others: (Condition | null | undefined)[]): Condition {
    return others.reduce<Condition>((acc, o) => (o ? combine('or', acc, o) : acc), this)
  }
  andNot(other: Condition): Condition {
    return this.and(other.not())
  }
  orNot(other: Condition): Condition {
    return this.or(other.not())
  }
  not(): Condition {
    return new Not(this)
  }
}

export class NoCondition extends Condition {
  render(ctx: RenderContext): void {
    ctx.append('1 = 1')
  }
}
export class TrueCondition extends Condition {
  render(ctx: RenderContext): void {
    ctx.append('1 = 1')
  }
}
export class FalseCondition extends Condition {
  render(ctx: RenderContext): void {
    ctx.append('1 = 0')
  }
}

function combine(op: 'and' | 'or', a: Condition, b: Condition): Condition {
  if (a instanceof NoCondition) return b
  if (b instanceof NoCondition) return a
  const parts: Condition[] = []
  for (const c of [a, b]) {
    if (c instanceof Combined && c.op === op) parts.push(...c.parts)
    else parts.push(c)
  }
  return new Combined(op, parts)
}

class Combined extends Condition {
  constructor(
    readonly op: 'and' | 'or',
    readonly parts: Condition[],
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.append('(').visitList(this.parts, ` ${this.op} `).append(')')
  }
}

class Not extends Condition {
  constructor(readonly c: Condition) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.append('not (').visit(this.c).append(')')
  }
}

class Compare<T> extends Condition {
  constructor(
    readonly a: Field<T>,
    readonly op: string,
    readonly b: Field<T>,
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    const op = this.op.startsWith(' ') ? this.op : ` ${this.op} `
    ctx.visit(this.a).append(op).visit(this.b)
  }
}

class CompareSubquery extends Condition {
  constructor(
    readonly a: Field<unknown>,
    readonly op: string,
    readonly s: Select,
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.visit(this.a).append(` ${this.op} (`).visit(this.s).append(')')
  }
}

class Between<T> extends Condition {
  constructor(
    readonly f: Field<T>,
    readonly a: Field<T>,
    readonly b: Field<T>,
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.visit(this.f).append(' between ').visit(this.a).append(' and ').visit(this.b)
  }
}

class Postfix extends Condition {
  constructor(
    readonly f: Field<unknown>,
    readonly op: string,
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.visit(this.f).append(this.op)
  }
}

class Like extends Condition {
  constructor(
    readonly f: Field<unknown>,
    readonly pattern: Field<unknown>,
    readonly negated: boolean,
    readonly escape?: string,
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.visit(this.f).append(this.negated ? ' not like ' : ' like ').visit(this.pattern)
    if (this.escape) ctx.append(` escape '${this.escape}'`)
  }
}

class InList extends Condition {
  constructor(
    readonly f: Field<unknown>,
    readonly values: Field<unknown>[],
    readonly negated: boolean,
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.visit(this.f).append(this.negated ? ' not in (' : ' in (').visitList(this.values).append(')')
  }
}

class InSelect extends Condition {
  constructor(
    readonly f: QueryPart,
    readonly s: Select,
    readonly negated: boolean,
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.visit(this.f).append(this.negated ? ' not in (' : ' in (').visit(this.s).append(')')
  }
}

function inCondition<T>(f: Field<T>, values: unknown[], negated: boolean): Condition {
  if (values.length === 1 && values[0] instanceof Select) return new InSelect(f, values[0], negated)
  const flat: unknown[] = []
  for (const v of values) {
    if (v !== null && typeof v === 'object' && Symbol.iterator in v && typeof v !== 'string' && !(v instanceof Uint8Array)) flat.push(...(v as Iterable<unknown>))
    else flat.push(v)
  }
  return new InList(
    f as Field<unknown>,
    flat.map((v) => toField(v, f.type as DataType<unknown>)),
    negated,
  )
}

export class Exists extends Condition {
  constructor(
    readonly s: Select,
    readonly negated: boolean,
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.append(this.negated ? 'not exists (' : 'exists (').visit(this.s).append(')')
  }
}

export class RawCondition extends Condition {
  constructor(
    readonly sql: string,
    readonly args: QueryPart[] = [],
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    new RawField(this.sql, SQLDataType.OTHER, this.args).render(ctx)
  }
}

// ---------------------------------------------------------------------------
// Lignes (row value expressions)
// ---------------------------------------------------------------------------

export class Row extends QueryPart {
  constructor(readonly fields: Field<unknown>[]) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.append('(').visitList(this.fields).append(')')
  }
  in(v: Select | Row[] | ValuesTable): Condition {
    if (v instanceof Select) return new InSelect(this, v, false)
    if (v instanceof ValuesTable) return new RawCondition('{0} in ({1})', [this, new ValuesSelect(v)])
    return new RawCondition(`{0} in (${v.map((_, i) => `{${i + 1}}`).join(', ')})`, [this, ...v])
  }
  eq(other: Row): Condition {
    return new RawCondition('{0} = {1}', [this, other])
  }
  gt(other: Row): Condition {
    return new RawCondition('{0} > {1}', [this, other])
  }
  lt(other: Row): Condition {
    return new RawCondition('{0} < {1}', [this, other])
  }
}

class ValuesSelect extends QueryPart {
  constructor(readonly v: ValuesTable) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.append('values ').visitList(this.v.rows)
  }
}

// ---------------------------------------------------------------------------
// Clés
// ---------------------------------------------------------------------------

export class UniqueKey<R> {
  constructor(
    readonly table: Table<R>,
    readonly name: string,
    readonly fields: string[],
  ) {}
}

export class ForeignKey<R, O> {
  constructor(
    readonly table: Table<R>,
    readonly name: string,
    readonly fields: string[],
    readonly key: UniqueKey<O>,
    readonly referencedFields: string[],
  ) {}
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export abstract class TableLike extends QueryPart {
  abstract fields(): Field<unknown>[]
}

export class Table<R = unknown> extends TableLike {
  readonly tableFields: TableField<R, unknown>[] = []

  constructor(
    readonly tableName: string,
    readonly alias: string | null = null,
  ) {
    super()
  }

  protected createField<T>(name: string, type: DataType<T>): TableField<R, T> {
    const f = new TableField<R, T>(this, name, type)
    this.tableFields.push(f as TableField<R, unknown>)
    return f
  }

  qualifier(): string {
    return this.alias ?? this.tableName
  }

  /** Clé primaire (tables générées) */
  getPrimaryKey(): UniqueKey<R> | null {
    return null
  }

  /** Clés étrangères (tables générées) */
  getReferences(): ForeignKey<R, unknown>[] {
    return []
  }

  getName(): string {
    return this.tableName
  }

  fields(): Field<unknown>[] {
    return this.tableFields
  }

  field(name: string): TableField<R, unknown> | null {
    return this.tableFields.find((f) => f.name === name) ?? null
  }

  /** Table aliasée : même classe générée, champs qualifiés par l'alias */
  as(alias: string | Name): this {
    const C = this.constructor as new (alias: string) => this
    return new C(typeof alias === 'string' ? alias : alias.last())
  }

  /** Même table (sans alias) ? */
  sameTable(other: Table<unknown>): boolean {
    return other.tableName === this.tableName
  }

  render(ctx: RenderContext): void {
    if (ctx.declareTables && this.alias) ctx.append(`${quote(this.tableName)} as ${quote(this.alias)}`)
    else ctx.append(quote(this.qualifier()))
  }
}

/** `DSL.table(name)` : table sans métadonnées de colonnes */
export class NamedTable extends Table<unknown> {
  constructor(name: string, alias: string | null = null) {
    super(name, alias)
  }
  as(alias: string | Name): this {
    return new NamedTable(this.tableName, typeof alias === 'string' ? alias : alias.last()) as this
  }
}

/** Sous-requête aliasée (`select.asTable(alias)`) */
export class DerivedTable extends Table<unknown> {
  constructor(
    readonly select: Select,
    alias: string,
  ) {
    super(alias, alias)
    for (const f of select.selectFields()) this.createField(f.name, f.type)
  }
  as(alias: string | Name): this {
    return new DerivedTable(this.select, typeof alias === 'string' ? alias : alias.last()) as this
  }
  render(ctx: RenderContext): void {
    if (ctx.declareTables) ctx.append('(').visit(this.select).append(`) as ${quote(this.alias as string)}`)
    else ctx.append(quote(this.alias as string))
  }
}

/** `DSL.values(row(...), ...)` */
export class ValuesTable extends TableLike {
  constructor(readonly rows: Row[]) {
    super()
  }
  fields(): Field<unknown>[] {
    return []
  }
  render(ctx: RenderContext): void {
    ctx.append('(values ').visitList(this.rows).append(')')
  }
}

/** CTE : `with(name).as(select)` */
export class CommonTableExpression extends Table<unknown> {
  constructor(
    name: string,
    readonly select: Select,
  ) {
    super(name, null)
    for (const f of select.selectFields()) this.createField(f.name, f.type)
  }
  renderDeclaration(ctx: RenderContext): void {
    ctx.append(`${quote(this.tableName)} as (`).visit(this.select).append(')')
  }
}

type JoinType = 'join' | 'left outer join' | 'right outer join' | 'cross join' | 'join' | 'left semi join'

class Join extends QueryPart {
  on: Condition | null = null
  constructor(
    readonly type: JoinType,
    readonly table: TableLike,
    readonly left: TableLike[],
  ) {
    super()
  }
  render(ctx: RenderContext): void {
    ctx.append(` ${this.type} `)
    ctx.declaring(() => ctx.visit(this.table))
    if (this.on) ctx.append(' on ').visit(this.on)
  }
}

// ---------------------------------------------------------------------------
// Records et résultats
// ---------------------------------------------------------------------------

function sameField(a: Field<unknown>, b: Field<unknown>): boolean {
  if (a === b) return true
  if (a instanceof TableField && b instanceof TableField) return a.name === b.name && a.qualifier() === b.qualifier()
  return false
}

export class Record implements Iterable<unknown> {
  constructor(
    readonly fieldsRow: Field<unknown>[],
    readonly values: unknown[],
  ) {}

  private indexOf(f: Field<unknown> | string | number): number {
    if (typeof f === 'number') return f
    if (typeof f === 'string') {
      const i = this.fieldsRow.findIndex((x) => x.name === f)
      if (i < 0) throw new IllegalArgumentException(`Field (${f}) is not contained in Row`)
      return i
    }
    let i = this.fieldsRow.findIndex((x) => sameField(x, f))
    if (i >= 0) return i
    // champ aliasé ou fonction : identité de rendu
    const sql = f.getSQL()
    i = this.fieldsRow.findIndex((x) => x.getSQL() === sql)
    if (i >= 0) return i
    // nom non qualifié, s'il est unique
    const byName = this.fieldsRow.map((x, j) => [x, j] as const).filter(([x]) => x.name === f.name)
    if (byName.length === 1) return (byName[0] as readonly [Field<unknown>, number])[1]
    throw new IllegalArgumentException(`Field (${sql}) is not contained in Row`)
  }

  get<T>(f: Field<T> | string | number): T {
    return this.values[this.indexOf(f as Field<unknown>)] as T
  }

  set<T>(f: Field<T>, v: T): void {
    this.values[this.indexOf(f as Field<unknown>)] = v
  }

  value1<T = unknown>(): T {
    return this.values[0] as T
  }
  value2<T = unknown>(): T {
    return this.values[1] as T
  }
  value3<T = unknown>(): T {
    return this.values[2] as T
  }

  size(): number {
    return this.values.length
  }

  fields(): Field<unknown>[] {
    return this.fieldsRow
  }

  [Symbol.iterator](): Iterator<unknown> {
    return this.values[Symbol.iterator]()
  }

  /** `record.into(table)` : TableRecord typé ; `record.into(String::class.java)` : première valeur */
  into<R>(target: Table<R>): R
  into<T>(target: IntoType<T>): T
  into(target: Table<unknown> | IntoType<unknown>): unknown {
    if (target instanceof Table) return intoTable(this, target)
    return intoType(this.values[0], target)
  }

  intoArray(): unknown[] {
    return [...this.values]
  }
}

/** Types acceptés par `into(X::class.java)` pour une valeur simple */
export type IntoType<T> = { readonly __into: T } | StringConstructor | NumberConstructor | BooleanConstructor

function intoType(v: unknown, t: IntoType<unknown>): unknown {
  if (v === null || v === undefined) return null
  if (t === String) return String(v)
  if (t === Number) return Number(v)
  if (t === Boolean) return Boolean(v)
  return v
}

/** Record typé d'une table (généré) : accès par propriétés camelCase */
export class TableRecordImpl<R = unknown> {
  constructor(
    readonly table: Table<R>,
    readonly values: unknown[],
  ) {}

  get<T>(f: Field<T>): T {
    const i = this.table.tableFields.findIndex((x) => x.name === f.name)
    return this.values[i] as T
  }

  set<T>(f: Field<T>, v: T): void {
    const i = this.table.tableFields.findIndex((x) => x.name === f.name)
    this.values[i] = v
  }
}

type RecordCtor<R> = new (table: Table<R>, values: unknown[]) => R
const recordClasses = new WeakMap<object, RecordCtor<unknown>>()

export function registerRecordClass<R>(tableClass: abstract new (...a: never[]) => Table<R>, recordClass: RecordCtor<R>): void {
  recordClasses.set(tableClass, recordClass as RecordCtor<unknown>)
}

/** `DSLContext.newRecord(table)` : record vide de la table */
export function newTableRecord<R>(table: Table<R>): R {
  const C = (recordClasses.get(table.constructor) ?? TableRecordImpl) as RecordCtor<R>
  return new C(table, table.tableFields.map(() => null))
}

function intoTable<R>(rec: Record, table: Table<R>): R {
  const values = table.tableFields.map((tf) => {
    // colonne de cette table (même qualifiant), sinon même nom de colonne sur la même table physique
    let i = rec.fieldsRow.findIndex((f) => f instanceof TableField && f.name === tf.name && f.qualifier() === table.qualifier())
    if (i < 0) i = rec.fieldsRow.findIndex((f) => f instanceof TableField && f.name === tf.name && (f.table as Table<unknown>).sameTable(table as Table<unknown>))
    if (i < 0) i = rec.fieldsRow.findIndex((f) => !(f instanceof TableField) && f.name === tf.name)
    return i < 0 ? null : rec.values[i]
  })
  const C = (recordClasses.get(table.constructor) ?? TableRecordImpl) as RecordCtor<R>
  return new C(table, values)
}

export class Result<R extends Record = Record> extends Array<R> {
  static get [Symbol.species]() {
    return Array
  }

  static ofRecords<R extends Record>(records: R[]): Result<R> {
    const r = new Result<R>()
    r.push(...records)
    return r
  }

  getValues<T>(f: Field<T> | string | number): T[] {
    return this.map((r) => r.get(f as Field<T>))
  }

  into<T>(target: Table<T>): T[]
  into<T>(target: IntoType<T>): T[]
  into(target: Table<unknown> | IntoType<unknown>): unknown[] {
    return this.map((r) => r.into(target as Table<unknown>))
  }

  intoMap<K, V>(key: Field<K>, value: Field<V>): Map<K, V> {
    const m = new Map<K, V>()
    for (const r of this) m.set(r.get(key), r.get(value))
    return m
  }

  intoGroups<K, V>(key: Field<K>, value: Field<V>): Map<K, V[]> {
    const m = new Map<K, V[]>()
    for (const r of this) {
      const k = r.get(key)
      const l = m.get(k)
      if (l) l.push(r.get(value))
      else m.set(k, [r.get(value)])
    }
    return m
  }

  intoSet<T>(f: Field<T>): Set<T> {
    return new Set(this.map((r) => r.get(f)))
  }

  isNotEmpty(): boolean {
    return this.length > 0
  }
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------

export interface Executor {
  readonly db: Database.Database
}

function toBinds(params: RenderContext['params']): SqlValue[] {
  return params.map((p) => p.type.toSql(p.value as never))
}

function wrapSqliteError(e: unknown, sql: string): never {
  const err = e as { code?: string; message?: string }
  if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT'))
    throw new DataIntegrityViolationException(`SQL [${sql}]; ${err.message}`, e)
  throw new DataAccessException(`SQL [${sql}]; ${err.message ?? String(e)}`, e)
}

export function runQuery(ex: Executor, sql: string, binds: SqlValue[]): number {
  try {
    return ex.db.prepare(sql).run(...binds).changes
  } catch (e) {
    wrapSqliteError(e, sql)
  }
}

export function runSelect(ex: Executor, sql: string, binds: SqlValue[]): { columns: string[]; rows: unknown[][] } {
  try {
    const stmt = ex.db.prepare(sql)
    if (!stmt.reader) {
      stmt.run(...binds)
      return { columns: [], rows: [] }
    }
    const columns = stmt.columns().map((c) => c.name)
    return { columns, rows: stmt.raw(true).all(...binds) as unknown[][] }
  } catch (e) {
    wrapSqliteError(e, sql)
  }
}

export abstract class Query extends QueryPart {
  constructor(protected readonly ex: Executor | null) {
    super()
  }

  protected executor(): Executor {
    if (!this.ex) throw new UnsupportedOperationException('Query is not attached to a DSLContext')
    return this.ex
  }

  /** Paramètres liés, dans l'ordre */
  getBindValues(): unknown[] {
    const ctx = new RenderContext().visit(this)
    return ctx.params.map((p) => p.value)
  }

  execute(): number {
    const ctx = new RenderContext().visit(this)
    return runQuery(this.executor(), ctx.sql, toBinds(ctx.params))
  }
}

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------

export type SelectFieldOrAsterisk = Field<unknown> | Table<unknown>
export type RecordMapper<R, T> = (r: R) => T

export class Select extends Query {
  private selectList: SelectFieldOrAsterisk[] = []
  private distinct = false
  private readonly fromList: TableLike[] = []
  private readonly joins: Join[] = []
  private whereCond: Condition = new NoCondition()
  private groupByList: Field<unknown>[] = []
  private havingCond: Condition = new NoCondition()
  private orderByList: SortField<unknown>[] = []
  private seekValues: unknown[] | null = null
  private limitN: number | Field<number> | null = null
  private offsetN: number | Field<number> | null = null
  private readonly unions: [string, Select][] = []
  private ctes: CommonTableExpression[] = []
  /** `select 1 as one` */
  private selectOneFlag = false
  private countFlag = false

  constructor(ex: Executor | null, fields: SelectFieldOrAsterisk[] = [], distinct = false) {
    super(ex)
    this.selectList = fields
    this.distinct = distinct
  }

  // --- construction ---------------------------------------------------------

  /** @internal */
  asSelectOne(): this {
    this.selectOneFlag = true
    return this
  }
  /** @internal */
  asSelectCount(): this {
    this.countFlag = true
    return this
  }
  /** @internal */
  withCtes(ctes: CommonTableExpression[]): this {
    this.ctes = ctes
    return this
  }

  select(...fields: (SelectFieldOrAsterisk | SelectFieldOrAsterisk[])[]): this {
    this.selectList.push(...fields.flat())
    return this
  }

  from(...tables: (TableLike | string)[]): this {
    this.fromList.push(...tables.map((t) => (typeof t === 'string' ? new NamedTable(t) : t)))
    return this
  }

  private addJoin(type: JoinType, t: TableLike): this {
    this.joins.push(new Join(type, t, [...this.fromList, ...this.joins.map((j) => j.table)]))
    return this
  }
  join(t: TableLike): this {
    return this.addJoin('join', t)
  }
  innerJoin(t: TableLike): this {
    return this.addJoin('join', t)
  }
  leftJoin(t: TableLike): this {
    return this.addJoin('left outer join', t)
  }
  leftOuterJoin(t: TableLike): this {
    return this.addJoin('left outer join', t)
  }
  rightJoin(t: TableLike): this {
    return this.addJoin('right outer join', t)
  }
  crossJoin(t: TableLike): this {
    return this.addJoin('cross join', t)
  }

  on(...conditions: Condition[]): this {
    const j = this.joins[this.joins.length - 1]
    if (!j) throw new IllegalArgumentException('on() without join')
    j.on = conditions.reduce<Condition>((acc, c) => acc.and(c), new NoCondition())
    return this
  }

  /** `onKey()` : condition de jointure déduite de la clé étrangère unique entre la table jointe et les précédentes */
  onKey(): this {
    const j = this.joins[this.joins.length - 1]
    if (!j || !(j.table instanceof Table)) throw new DataAccessException('onKey() requires a table join')
    const right = j.table
    const candidates: Condition[] = []
    for (const left of j.left) {
      if (!(left instanceof Table)) continue
      for (const fk of right.getReferences())
        if (fk.key.table.sameTable(left)) candidates.push(fkCondition(right, fk.fields, left, fk.referencedFields))
      for (const fk of left.getReferences())
        if (fk.key.table.sameTable(right)) candidates.push(fkCondition(left, fk.fields, right, fk.referencedFields))
    }
    if (candidates.length !== 1) throw new DataAccessException(`Key ambiguous or not found between tables for onKey() (${candidates.length} candidates)`)
    j.on = candidates[0] as Condition
    return this
  }

  where(...conditions: (Condition | null | undefined)[]): this {
    this.whereCond = conditions.reduce<Condition>((acc, c) => (c ? acc.and(c) : acc), this.whereCond)
    return this
  }
  and(c: Condition): this {
    this.whereCond = this.whereCond.and(c)
    return this
  }
  or(c: Condition): this {
    this.whereCond = this.whereCond.or(c)
    return this
  }
  andNot(c: Condition): this {
    this.whereCond = this.whereCond.andNot(c)
    return this
  }

  groupBy(...fields: (Field<unknown> | Field<unknown>[])[]): this {
    this.groupByList.push(...fields.flat())
    return this
  }
  having(...conditions: Condition[]): this {
    this.havingCond = conditions.reduce<Condition>((acc, c) => acc.and(c), this.havingCond)
    return this
  }

  orderBy(...fields: (OrderField | OrderField[] | Iterable<OrderField>)[]): this {
    for (const f of fields) {
      if (f instanceof QueryPart) this.orderByList.push(f instanceof SortField ? f : (f as Field<unknown>).sortDefault())
      else for (const x of f as Iterable<OrderField>) this.orderByList.push(x instanceof SortField ? x : x.sortDefault())
    }
    return this
  }

  /** `seek(values)` : pagination par clé, rendue en comparaison de lignes */
  seek(...values: unknown[]): this {
    this.seekValues = values
    return this
  }

  limit(n: number | Field<number>): this {
    this.limitN = n
    return this
  }
  offset(n: number | Field<number>): this {
    this.offsetN = n
    return this
  }
  limitOffset(limit: number, offset: number): this {
    return this.limit(limit).offset(offset)
  }

  union(s: Select): this {
    this.unions.push(['union', s])
    return this
  }
  unionAll(s: Select): this {
    this.unions.push(['union all', s])
    return this
  }

  asTable(alias: string): DerivedTable {
    return new DerivedTable(this, alias)
  }

  /** Sous-requête scalaire (`DSL.field(select)` / `asField()`) */
  asField<T>(alias?: string): Field<T> {
    const f = new ScalarSubquery<T>(this, (this.selectFields()[0]?.type ?? SQLDataType.OTHER) as DataType<T>)
    return alias ? f.as(alias) : f
  }

  // --- rendu ------------------------------------------------------------------

  /** Champs projetés (select() vide = champs de toutes les tables, comme jOOQ) */
  selectFields(): Field<unknown>[] {
    if (this.countFlag) return [new CountStar()]
    if (this.selectOneFlag) return [new RawField<number>('1', SQLDataType.INTEGER).as('one') as Field<unknown>]
    const list = this.selectList.length ? this.selectList : [...this.fromList, ...this.joins.map((j) => j.table)].filter((t): t is Table<unknown> => t instanceof Table)
    return list.flatMap((f) => (f instanceof Table ? f.fields() : [f]))
  }

  /** La projection contient-elle une table sans métadonnées (rendue en `*`) ? */
  private usesAsterisk(): boolean {
    if (this.countFlag || this.selectOneFlag) return false
    const list = this.selectList.length ? this.selectList : [...this.fromList, ...this.joins.map((j) => j.table)]
    return list.some((t) => t instanceof Table && t.fields().length === 0) || list.length === 0
  }

  render(ctx: RenderContext): void {
    if (this.ctes.length) {
      ctx.append('with ')
      this.ctes.forEach((c, i) => {
        if (i > 0) ctx.append(', ')
        c.renderDeclaration(ctx)
      })
      ctx.append(' ')
    }
    ctx.append(this.distinct ? 'select distinct ' : 'select ')
    if (this.usesAsterisk()) ctx.append('*')
    else ctx.declaring(() => ctx.visitList(this.selectFields()))
    if (this.fromList.length) {
      ctx.append(' from ')
      ctx.declaring(() => ctx.visitList(this.fromList))
    }
    for (const j of this.joins) ctx.visit(j)
    let where = this.whereCond
    if (this.seekValues) {
      const fields = this.orderByList.map((s) => s.field)
      const values = this.seekValues.map((v, i) => toField(v, (fields[i] as Field<unknown>).type))
      const desc = this.orderByList[0]?.order === 'desc'
      where = where.and(desc ? new Row(fields).lt(new Row(values)) : new Row(fields).gt(new Row(values)))
    }
    if (!(where instanceof NoCondition)) ctx.append(' where ').visit(where)
    if (this.groupByList.length) ctx.append(' group by ').visitList(this.groupByList)
    if (!(this.havingCond instanceof NoCondition)) ctx.append(' having ').visit(this.havingCond)
    for (const [op, s] of this.unions) ctx.append(` ${op} `).visit(s)
    if (this.orderByList.length) ctx.append(' order by ').visitList(this.orderByList)
    if (this.limitN !== null) {
      ctx.append(' limit ')
      if (this.limitN instanceof Field) ctx.visit(this.limitN)
      else ctx.bind(this.limitN, SQLDataType.INTEGER as DataType<unknown>)
    }
    if (this.offsetN !== null) {
      if (this.limitN === null) ctx.append(' limit -1')
      ctx.append(' offset ')
      if (this.offsetN instanceof Field) ctx.visit(this.offsetN)
      else ctx.bind(this.offsetN, SQLDataType.INTEGER as DataType<unknown>)
    }
  }

  // --- fetch ----------------------------------------------------------------

  fetch(): Result<Record>
  fetch<T>(field: Field<T>): T[]
  fetch<T>(mapper: RecordMapper<Record, T>): T[]
  fetch<T>(arg?: Field<T> | RecordMapper<Record, T>): Result<Record> | T[] {
    const res = this.fetchResult()
    if (arg === undefined) return res
    if (arg instanceof Field) return res.map((r) => r.get(arg))
    return res.map(arg)
  }

  private fetchResult(): Result<Record> {
    const ctx = new RenderContext().visit(this)
    const { columns, rows } = runSelect(this.executor(), ctx.sql, toBinds(ctx.params))
    const fields = this.usesAsterisk() ? columns.map((c) => new NamedField(new Name([c]), SQLDataType.OTHER)) : this.selectFields()
    return Result.ofRecords(rows.map((row) => new Record(fields, row.map((v, i) => (fields[i] as Field<unknown>).type.fromSql(v as SqlValue)))))
  }

  fetchOne(): Record | null
  fetchOne<T>(field: Field<T>): T | null
  fetchOne<T>(mapper: RecordMapper<Record, T>): T | null
  fetchOne<T>(arg?: Field<T> | RecordMapper<Record, T>): Record | T | null {
    const res = this.fetchResult()
    if (res.length > 1) throw new TooManyRowsException('Cursor returned more than one result')
    const r = res[0]
    if (r === undefined) return null
    if (arg === undefined) return r
    if (arg instanceof Field) return r.get(arg)
    return arg(r)
  }

  fetchSingle(): Record
  fetchSingle<T>(field: Field<T>): T
  fetchSingle<T>(arg?: Field<T>): Record | T {
    const res = this.fetchResult()
    if (res.length === 0) throw new NoDataFoundException('Cursor returned no rows')
    if (res.length > 1) throw new TooManyRowsException('Cursor returned more than one result')
    const r = res[0] as Record
    return arg === undefined ? r : r.get(arg)
  }

  fetchAny(): Record | null {
    return this.fetchResult()[0] ?? null
  }

  fetchInto<R>(target: Table<R>): R[]
  fetchInto<T>(target: IntoType<T>): T[]
  fetchInto(target: Table<unknown> | IntoType<unknown>): unknown[] {
    return this.fetchResult().into(target as Table<unknown>)
  }

  fetchOneInto<R>(target: Table<R>): R | null
  fetchOneInto<T>(target: IntoType<T>): T | null
  fetchOneInto(target: Table<unknown> | IntoType<unknown>): unknown {
    const r = this.fetchOne()
    return r === null ? null : r.into(target as Table<unknown>)
  }

  fetchSingleInto<T>(target: IntoType<T>): T {
    return this.fetchSingle().into(target)
  }

  fetchSet<T>(field: Field<T>): Set<T> {
    return new Set(this.fetchResult().map((r) => r.get(field)))
  }

  fetchArray(): Record[] {
    return [...this.fetchResult()]
  }

  fetchValue<T>(field?: Field<T>): T | null {
    const r = this.fetchOne()
    return r === null ? null : field ? r.get(field) : (r.value1() as T)
  }

  /** `fetchGroups(keyField|keyMapper, valueField|valueMapper)` : ordre d'insertion conservé */
  fetchGroups<K, V>(key: Field<K> | RecordMapper<Record, K>, value?: Field<V> | RecordMapper<Record, V>): Map<K, V[]> {
    const m = new Map<K, V[]>()
    const keys: K[] = []
    for (const r of this.fetchResult()) {
      const k = key instanceof Field ? r.get(key) : key(r)
      const v = (value === undefined ? r : value instanceof Field ? r.get(value) : value(r)) as V
      // clés objets (records) : égalité par valeurs, comme les records jOOQ
      const existing = keys.find((x) => recordKeyEquals(x, k))
      if (existing !== undefined) (m.get(existing) as V[]).push(v)
      else {
        keys.push(k)
        m.set(k, [v])
      }
    }
    return m
  }

  fetchMap<K, V>(key: Field<K> | RecordMapper<Record, K>, value?: Field<V> | RecordMapper<Record, V>): Map<K, V> {
    const m = new Map<K, V>()
    for (const r of this.fetchResult()) {
      const k = key instanceof Field ? r.get(key) : key(r)
      if (m.has(k)) throw new IllegalArgumentException(`Key ${String(k)} is not unique in Result`)
      m.set(k, (value === undefined ? r : value instanceof Field ? r.get(value) : value(r)) as V)
    }
    return m
  }

  /** `fetchCount()` : `select count(*) from (q) as q` */
  fetchCount(): number {
    const ctx = new RenderContext()
    ctx.append('select count(*) from (').visit(this).append(') as "q"')
    const { rows } = runSelect(this.executor(), ctx.sql, toBinds(ctx.params))
    return Number((rows[0] as unknown[])[0])
  }

  fetchExists(): boolean {
    const ctx = new RenderContext()
    ctx.append('select exists (').visit(this).append(')')
    const { rows } = runSelect(this.executor(), ctx.sql, toBinds(ctx.params))
    return Number((rows[0] as unknown[])[0]) === 1
  }

  /** `.map { }` Kotlin sur un ResultQuery (Iterable) */
  map<T>(fn: (r: Record) => T): T[] {
    return this.fetchResult().map(fn)
  }

  forEach(fn: (r: Record) => void): void {
    this.fetchResult().forEach(fn)
  }

  [Symbol.iterator](): Iterator<Record> {
    return this.fetchResult()[Symbol.iterator]()
  }
}

function recordKeyEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a instanceof TableRecordImpl && b instanceof TableRecordImpl)
    return a.table.sameTable(b.table) && a.values.length === b.values.length && a.values.every((v, i) => valueEquals(v, b.values[i]))
  return false
}

function valueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a && b && typeof (a as { equals?: unknown }).equals === 'function') return (a as { equals(o: unknown): boolean }).equals(b)
  if (a instanceof Uint8Array && b instanceof Uint8Array) return Buffer.from(a).equals(Buffer.from(b))
  return false
}

function fkCondition(a: Table<unknown>, af: string[], b: Table<unknown>, bf: string[]): Condition {
  return af
    .map((f, i) => (a.field(f) as TableField<unknown, unknown>).eq(b.field(bf[i] as string) as TableField<unknown, unknown>))
    .reduce<Condition>((acc, c) => acc.and(c), new NoCondition())
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

export class Insert<R = unknown> extends Query {
  private columns: Field<unknown>[] = []
  private rows: Field<unknown>[][] = []
  private current: Map<Field<unknown>, Field<unknown>> = new Map()
  private selectSource: Select | null = null
  private conflict: 'none' | 'update' | 'ignore' = 'none'
  private conflictTarget: Field<unknown>[] = []
  private readonly updates: [Field<unknown>, Field<unknown>][] = []
  private conflictWhere: Condition = new NoCondition()
  private inUpdateClause = false

  constructor(
    ex: Executor | null,
    readonly table: Table<R>,
    fields: Field<unknown>[] = [],
  ) {
    super(ex)
    this.columns = fields
  }

  set<T>(f: Field<T>, v: FieldOrValue<T>): this {
    const value = toField(v, f.type) as Field<unknown>
    if (this.inUpdateClause) this.updates.push([f as Field<unknown>, value])
    else this.current.set(f as Field<unknown>, value)
    return this
  }

  /** `set(record)` : toutes les valeurs non nulles modifiées d'un record — ici toutes les valeurs */
  setRecord(record: TableRecordImpl<R>): this {
    this.table.tableFields.forEach((f, i) => this.set(f, record.values[i]))
    return this
  }

  /** `newRecord()` : ligne suivante pour un insert multi-lignes avec set() */
  newRecord(): this {
    this.flushCurrent()
    return this
  }

  values(...values: unknown[]): this {
    const vals = values.length === 1 && Array.isArray(values[0]) ? (values[0] as unknown[]) : values
    this.rows.push(this.columns.map((c, i) => toField(vals[i], c.type)))
    return this
  }

  select(s: Select): this {
    this.selectSource = s
    return this
  }

  onDuplicateKeyUpdate(): this {
    this.flushCurrent()
    this.conflict = 'update'
    this.inUpdateClause = true
    return this
  }
  onDuplicateKeyIgnore(): this {
    this.flushCurrent()
    this.conflict = 'ignore'
    return this
  }
  onConflict(...fields: Field<unknown>[]): this {
    this.flushCurrent()
    this.conflictTarget = fields
    return this
  }
  onConflictDoNothing(): this {
    return this.onDuplicateKeyIgnore()
  }
  doUpdate(): this {
    this.conflict = 'update'
    this.inUpdateClause = true
    return this
  }
  doNothing(): this {
    this.conflict = 'ignore'
    return this
  }
  where(c: Condition): this {
    this.conflictWhere = this.conflictWhere.and(c)
    return this
  }

  private flushCurrent(): void {
    if (this.current.size === 0) return
    if (this.columns.length === 0) this.columns = [...this.current.keys()]
    this.rows.push(this.columns.map((c) => this.current.get(c) ?? new RawField('default', SQLDataType.OTHER)))
    this.current = new Map()
  }

  render(ctx: RenderContext): void {
    this.flushCurrent()
    ctx.append('insert into ').visit(this.table)
    if (this.columns.length) ctx.append(` (${this.columns.map((c) => quote(c.name)).join(', ')})`)
    if (this.selectSource) ctx.append(' ').visit(this.selectSource)
    else {
      ctx.append(' values ')
      this.rows.forEach((r, i) => {
        if (i > 0) ctx.append(', ')
        ctx.append('(').visitList(r).append(')')
      })
    }
    if (this.conflict !== 'none') {
      ctx.append(' on conflict')
      if (this.conflictTarget.length) ctx.append(` (${this.conflictTarget.map((c) => quote(c.name)).join(', ')})`)
      if (this.conflict === 'ignore') ctx.append(' do nothing')
      else {
        ctx.append(' do update set ')
        this.updates.forEach(([f, v], i) => {
          if (i > 0) ctx.append(', ')
          ctx.append(`${quote(f.name)} = `).visit(v)
        })
        if (!(this.conflictWhere instanceof NoCondition)) ctx.append(' where ').visit(this.conflictWhere)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// UPDATE / DELETE
// ---------------------------------------------------------------------------

export class Update<R = unknown> extends Query {
  private readonly sets: [Field<unknown>, Field<unknown>][] = []
  private whereCond: Condition = new NoCondition()

  constructor(
    ex: Executor | null,
    readonly table: Table<R>,
  ) {
    super(ex)
  }

  set<T>(f: Field<T>, v: FieldOrValue<T> | Select): this {
    this.sets.push([f as Field<unknown>, v instanceof Select ? (v.asField() as Field<unknown>) : (toField(v, f.type) as Field<unknown>)])
    return this
  }

  where(...conditions: (Condition | null | undefined)[]): this {
    this.whereCond = conditions.reduce<Condition>((acc, c) => (c ? acc.and(c) : acc), this.whereCond)
    return this
  }
  and(c: Condition): this {
    this.whereCond = this.whereCond.and(c)
    return this
  }

  render(ctx: RenderContext): void {
    ctx.append('update ').visit(this.table).append(' set ')
    this.sets.forEach(([f, v], i) => {
      if (i > 0) ctx.append(', ')
      ctx.append(`${quote(f.name)} = `).visit(v)
    })
    if (!(this.whereCond instanceof NoCondition)) ctx.append(' where ').visit(this.whereCond)
  }
}

export class Delete<R = unknown> extends Query {
  private whereCond: Condition = new NoCondition()

  constructor(
    ex: Executor | null,
    readonly table: Table<R>,
  ) {
    super(ex)
  }

  where(...conditions: (Condition | null | undefined)[]): this {
    this.whereCond = conditions.reduce<Condition>((acc, c) => (c ? acc.and(c) : acc), this.whereCond)
    return this
  }
  and(c: Condition): this {
    this.whereCond = this.whereCond.and(c)
    return this
  }

  render(ctx: RenderContext): void {
    ctx.append('delete from ').visit(this.table)
    if (!(this.whereCond instanceof NoCondition)) ctx.append(' where ').visit(this.whereCond)
  }
}

export class RawQuery extends Query {
  constructor(
    ex: Executor | null,
    readonly sql: string,
    readonly binds: unknown[],
  ) {
    super(ex)
  }
  render(ctx: RenderContext): void {
    const parts = this.sql.split('?')
    parts.forEach((p, i) => {
      ctx.append(p)
      if (i < parts.length - 1) {
        const v = this.binds[i]
        ctx.bind(v, inferType(v))
      }
    })
  }
}

// ---------------------------------------------------------------------------
// BATCH
// ---------------------------------------------------------------------------

export class Batch {
  private readonly bindRows: unknown[][] = []

  constructor(
    private readonly ex: Executor,
    private readonly queries: Query[],
  ) {}

  /** `batch(query).bind(v1, v2...)` : réexécute la requête avec ces valeurs de paramètres */
  bind(...values: unknown[]): this {
    this.bindRows.push(values)
    return this
  }

  size(): number {
    return this.bindRows.length || this.queries.length
  }

  execute(): number[] {
    if (this.queries.length === 1 && this.bindRows.length > 0) {
      const ctx = new RenderContext().visit(this.queries[0] as Query)
      let stmt: Database.Statement
      try {
        stmt = this.ex.db.prepare(ctx.sql)
      } catch (e) {
        wrapSqliteError(e, ctx.sql)
      }
      return this.bindRows.map((row) => {
        const binds = ctx.params.map((p, i) => p.type.toSql((i < row.length ? row[i] : p.value) as never))
        try {
          return stmt.run(...binds).changes
        } catch (e) {
          wrapSqliteError(e, ctx.sql)
        }
      })
    }
    return this.queries.map((q) => q.execute())
  }
}
