// Support de portage : org.springframework.data.domain (Spring Data Commons 3.5) utilisé par Komga :
// Sort, Sort.Order, Sort.Direction, Pageable, PageRequest, Page, PageImpl.
// Mêmes règles de calcul (PageImpl.total, totalPages, hasNext...) et mêmes toString.
// Ce fichier n'a pas de jumeau Kotlin.
import { type Equatable, IllegalArgumentException, KEnum, UnsupportedOperationException, eq, hash } from './kotlin.js'

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

export class Direction extends KEnum {
  static readonly ASC = new Direction('ASC')
  static readonly DESC = new Direction('DESC')

  isAscending(): boolean {
    return this === Direction.ASC
  }
  isDescending(): boolean {
    return this === Direction.DESC
  }

  static fromString(value: string): Direction {
    const v = Direction.entries().find((d) => d.name === value.toUpperCase())
    if (!v) throw new IllegalArgumentException(`Invalid value '${value}' for orders given; Has to be either 'desc' or 'asc' (case insensitive)`)
    return v
  }
}

export class NullHandling extends KEnum {
  static readonly NATIVE = new NullHandling('NATIVE')
  static readonly NULLS_FIRST = new NullHandling('NULLS_FIRST')
  static readonly NULLS_LAST = new NullHandling('NULLS_LAST')
}

export class Order implements Equatable {
  constructor(
    readonly direction: Direction | null,
    readonly property: string,
    readonly ignoreCase: boolean = false,
    readonly nullHandling: NullHandling = NullHandling.NATIVE,
  ) {
    if (property.trim().length === 0) throw new IllegalArgumentException('Property must not be null or empty')
    this.direction = direction ?? Sort.DEFAULT_DIRECTION
  }

  static by(property: string): Order {
    return new Order(Sort.DEFAULT_DIRECTION, property)
  }
  static asc(property: string): Order {
    return new Order(Direction.ASC, property)
  }
  static desc(property: string): Order {
    return new Order(Direction.DESC, property)
  }

  getDirection(): Direction {
    return this.direction as Direction
  }
  get isAscending(): boolean {
    return (this.direction as Direction).isAscending()
  }
  get isDescending(): boolean {
    return (this.direction as Direction).isDescending()
  }
  isIgnoreCase(): boolean {
    return this.ignoreCase
  }

  with(direction: Direction): Order {
    return new Order(direction, this.property, this.ignoreCase, this.nullHandling)
  }
  reverse(): Order {
    return this.with(this.isAscending ? Direction.DESC : Direction.ASC)
  }
  withProperty(property: string): Order {
    return new Order(this.direction, property, this.ignoreCase, this.nullHandling)
  }
  ignoreCaseOrder(): Order {
    return new Order(this.direction, this.property, true, this.nullHandling)
  }
  nullsFirst(): Order {
    return new Order(this.direction, this.property, this.ignoreCase, NullHandling.NULLS_FIRST)
  }
  nullsLast(): Order {
    return new Order(this.direction, this.property, this.ignoreCase, NullHandling.NULLS_LAST)
  }

  equals(other: unknown): boolean {
    return (
      other instanceof Order &&
      this.direction === other.direction &&
      this.property === other.property &&
      this.ignoreCase === other.ignoreCase &&
      this.nullHandling === other.nullHandling
    )
  }
  hashCode(): number {
    let result = 17
    result = (31 * result + hash(this.direction?.name)) | 0
    result = (31 * result + hash(this.property)) | 0
    result = (31 * result + (this.ignoreCase ? 1 : 0)) | 0
    result = (31 * result + hash(this.nullHandling.name)) | 0
    return result
  }
  toString(): string {
    let result = `${this.property}: ${this.direction}`
    if (this.nullHandling !== NullHandling.NATIVE) result += `, ${this.nullHandling}`
    if (this.ignoreCase) result += ', ignoring case'
    return result
  }
}

export class Sort implements Iterable<Order>, Equatable {
  static readonly DEFAULT_DIRECTION = Direction.ASC
  static readonly Direction = Direction
  static readonly Order = Order
  private static readonly UNSORTED = new Sort([])

  protected constructor(private readonly orders: readonly Order[]) {}

  /** `Sort.by(vararg properties)`, `Sort.by(direction, vararg properties)`, `Sort.by(vararg orders)`, `Sort.by(List<Order>)` */
  static by(...args: (string | Order | Direction | Order[])[]): Sort {
    if (args.length === 0) return Sort.unsorted()
    const first = args[0]
    if (first instanceof Direction) {
      const props = args.slice(1) as string[]
      if (props.length === 0) throw new IllegalArgumentException('You have to provide at least one property to sort by')
      return new Sort(props.map((p) => new Order(first, p)))
    }
    if (Array.isArray(first)) return first.length === 0 ? Sort.unsorted() : new Sort(first)
    if (first instanceof Order) return new Sort(args as Order[])
    return new Sort((args as string[]).map((p) => new Order(Sort.DEFAULT_DIRECTION, p)))
  }

  static unsorted(): Sort {
    return Sort.UNSORTED
  }

  descending(): Sort {
    return this.withDirection(Direction.DESC)
  }
  ascending(): Sort {
    return this.withDirection(Direction.ASC)
  }
  private withDirection(d: Direction): Sort {
    return new Sort(this.orders.map((o) => o.with(d)))
  }

  get isSorted(): boolean {
    return !this.isEmpty()
  }
  get isUnsorted(): boolean {
    return !this.isSorted
  }
  isEmpty(): boolean {
    return this.orders.length === 0
  }

  and(sort: Sort): Sort {
    return new Sort([...this.orders, ...sort.orders])
  }

  reverse(): Sort {
    return new Sort(this.orders.map((o) => o.reverse()))
  }

  getOrderFor(property: string): Order | null {
    return this.orders.find((o) => o.property === property) ?? null
  }

  toList(): Order[] {
    return [...this.orders]
  }

  /** Kotlin : `sort.map { }` / `mapNotNull { }` sur l'Iterable<Order> */
  map<T>(fn: (o: Order) => T): T[] {
    return this.orders.map(fn)
  }

  [Symbol.iterator](): Iterator<Order> {
    return this.orders[Symbol.iterator]()
  }

  equals(other: unknown): boolean {
    return other instanceof Sort && eq([...this.orders], [...other.orders])
  }
  hashCode(): number {
    return (31 * 17 + hash([...this.orders])) | 0
  }
  toString(): string {
    return this.isEmpty() ? 'UNSORTED' : this.orders.map(String).join(',')
  }
}

// ---------------------------------------------------------------------------
// Pageable
// ---------------------------------------------------------------------------

export abstract class Pageable {
  static unpaged(sort: Sort = Sort.unsorted()): Pageable {
    return Unpaged.sorted(sort)
  }
  static ofSize(pageSize: number): Pageable {
    return PageRequest.of(0, pageSize)
  }

  get isPaged(): boolean {
    return true
  }
  get isUnpaged(): boolean {
    return !this.isPaged
  }
  abstract get pageNumber(): number
  abstract get pageSize(): number
  abstract get offset(): number
  abstract get sort(): Sort
  getSortOr(sort: Sort): Sort {
    return this.sort.isSorted ? this.sort : sort
  }
  abstract next(): Pageable
  abstract previousOrFirst(): Pageable
  abstract first(): Pageable
  abstract withPage(pageNumber: number): Pageable
  abstract hasPrevious(): boolean
}

class Unpaged extends Pageable {
  private static readonly UNSORTED = new Unpaged(Sort.unsorted())

  private constructor(private readonly sortValue: Sort) {
    super()
  }
  static sorted(sort: Sort): Pageable {
    return sort.isUnsorted ? Unpaged.UNSORTED : new Unpaged(sort)
  }
  get isPaged(): boolean {
    return false
  }
  get pageNumber(): number {
    throw new UnsupportedOperationException()
  }
  get pageSize(): number {
    throw new UnsupportedOperationException()
  }
  get offset(): number {
    throw new UnsupportedOperationException()
  }
  get sort(): Sort {
    return this.sortValue
  }
  next(): Pageable {
    return this
  }
  previousOrFirst(): Pageable {
    return this
  }
  first(): Pageable {
    return this
  }
  withPage(pageNumber: number): Pageable {
    if (pageNumber === 0) return this
    throw new UnsupportedOperationException()
  }
  hasPrevious(): boolean {
    return false
  }
  equals(other: unknown): boolean {
    return other instanceof Unpaged && this.sortValue.equals(other.sortValue)
  }
  hashCode(): number {
    return this.sortValue.hashCode()
  }
  toString(): string {
    return 'INSTANCE'
  }
}

export class PageRequest extends Pageable implements Equatable {
  protected constructor(
    private readonly page: number,
    private readonly size: number,
    private readonly sortValue: Sort,
  ) {
    super()
    if (page < 0) throw new IllegalArgumentException('Page index must not be less than zero')
    if (size < 1) throw new IllegalArgumentException('Page size must not be less than one')
  }

  /** `PageRequest.of(page, size)`, `of(page, size, sort)`, `of(page, size, direction, vararg properties)` */
  static of(page: number, size: number, sortOrDirection: Sort | Direction = Sort.unsorted(), ...properties: string[]): PageRequest {
    const sort = sortOrDirection instanceof Direction ? Sort.by(sortOrDirection, ...properties) : sortOrDirection
    return new PageRequest(page, size, sort)
  }
  static ofSize(pageSize: number): PageRequest {
    return PageRequest.of(0, pageSize)
  }

  get pageNumber(): number {
    return this.page
  }
  get pageSize(): number {
    return this.size
  }
  get offset(): number {
    return this.page * this.size
  }
  get sort(): Sort {
    return this.sortValue
  }
  hasPrevious(): boolean {
    return this.page > 0
  }
  next(): PageRequest {
    return new PageRequest(this.page + 1, this.size, this.sortValue)
  }
  previous(): PageRequest {
    return this.page === 0 ? this : new PageRequest(this.page - 1, this.size, this.sortValue)
  }
  previousOrFirst(): Pageable {
    return this.hasPrevious() ? this.previous() : this.first()
  }
  first(): PageRequest {
    return new PageRequest(0, this.size, this.sortValue)
  }
  withPage(pageNumber: number): PageRequest {
    return new PageRequest(pageNumber, this.size, this.sortValue)
  }
  withSort(sort: Sort): PageRequest {
    return new PageRequest(this.page, this.size, sort)
  }

  equals(other: unknown): boolean {
    return other instanceof PageRequest && this.page === other.page && this.size === other.size && this.sortValue.equals(other.sortValue)
  }
  hashCode(): number {
    let result = 1
    result = (31 * result + this.page) | 0
    result = (31 * result + this.size) | 0
    return (31 * result + this.sortValue.hashCode()) | 0
  }
  toString(): string {
    return `Page request [number: ${this.page}, size ${this.size}, sort: ${this.sortValue}]`
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export class PageImpl<T> implements Equatable {
  private readonly total: number

  constructor(
    readonly content: T[],
    readonly pageable: Pageable = Pageable.unpaged(),
    total: number = content.length,
  ) {
    // Spring : total corrigé quand la page courante dépasse le total annoncé
    this.total =
      content.length > 0 && pageable.isPaged && pageable.offset + pageable.pageSize > total ? pageable.offset + content.length : total
  }

  static empty<T>(pageable: Pageable = Pageable.unpaged()): PageImpl<T> {
    return new PageImpl<T>([], pageable, 0)
  }

  get number(): number {
    return this.pageable.isPaged ? this.pageable.pageNumber : 0
  }
  get size(): number {
    return this.pageable.isPaged ? this.pageable.pageSize : this.content.length
  }
  get numberOfElements(): number {
    return this.content.length
  }
  get totalElements(): number {
    return this.total
  }
  get totalPages(): number {
    return this.size === 0 ? 1 : Math.ceil(this.total / this.size)
  }
  get sort(): Sort {
    return this.pageable.sort
  }
  hasPrevious(): boolean {
    return this.number > 0
  }
  hasNext(): boolean {
    return this.number + 1 < this.totalPages
  }
  get isFirst(): boolean {
    return !this.hasPrevious()
  }
  get isLast(): boolean {
    return !this.hasNext()
  }
  hasContent(): boolean {
    return this.content.length > 0
  }
  isEmpty(): boolean {
    return !this.hasContent()
  }
  nextPageable(): Pageable {
    return this.hasNext() ? this.pageable.next() : Pageable.unpaged()
  }
  previousPageable(): Pageable {
    return this.hasPrevious() ? this.pageable.previousOrFirst() : Pageable.unpaged()
  }

  /** `page.map { }` : Page du même pageable et du même total */
  map<U>(fn: (t: T) => U): PageImpl<U> {
    return new PageImpl(this.content.map(fn), this.pageable, this.total)
  }

  toList(): T[] {
    return [...this.content]
  }

  [Symbol.iterator](): Iterator<T> {
    return this.content[Symbol.iterator]()
  }

  equals(other: unknown): boolean {
    return other instanceof PageImpl && this.total === other.total && eq(this.content, other.content) && eq(this.pageable, other.pageable)
  }
  hashCode(): number {
    let result = 17
    result = (result + 31 * this.total) | 0
    result = (result + 31 * hash(this.content)) | 0
    return (result + 31 * hash(this.pageable)) | 0
  }
  toString(): string {
    let contentType = 'UNKNOWN'
    const first = this.content[0] as unknown
    if (first !== undefined && first !== null) contentType = (first as object).constructor.name
    return `Page ${this.number + 1} of ${this.totalPages} containing ${contentType} instances`
  }
}

/** `Page<T>` : interface Kotlin, implémentée par PageImpl */
export type Page<T> = PageImpl<T>
export const Page = {
  empty: PageImpl.empty,
}
