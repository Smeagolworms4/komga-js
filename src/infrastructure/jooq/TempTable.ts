// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/TempTable.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DSL, type DSLContext } from '../../port/jooq/dsl.js'
import { chunked } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import { SQLDataType } from '../../port/jooq/types.js'

/**
 * Temporary table with a single STRING column.
 * This is made to store collection of values that are too long to be specified in a query condition,
 * by using a sub-select instead.
 *
 * The table name is automatically generated, and the table is dropped when the object is closed.
 */
export class TempTable {
  private created = false

  // PORT: constructeur primaire privé (dslContext, name) et secondaire (dslContext) fusionnés
  constructor(
    private readonly dslContext: DSLContext,
    readonly name: string = TempTable.generateName(),
  ) {}

  create(): void {
    this.dslContext.execute(`CREATE TEMPORARY TABLE ${this.name} (STRING varchar NOT NULL);`)
    this.created = true
  }

  insertTempStrings(batchSize: number, collection: Iterable<string>): void {
    if (!this.created) this.create()
    const list = [...collection]
    if (list.length > 0) {
      for (const chunk of chunked(list, batchSize)) {
        const step = this.dslContext.batch(
          this.dslContext.insertInto(DSL.table(DSL.name(this.name)), DSL.field(DSL.name('STRING'), SQLDataType.VARCHAR)).values(null),
        )
        for (const it of chunk) step.bind(it)
        step.execute()
      }
    }
  }

  selectTempStrings() {
    return this.dslContext.select(DSL.field(DSL.name('STRING'), SQLDataType.VARCHAR)).from(DSL.table(DSL.name(this.name)))
  }

  close(): void {
    if (this.created) this.dslContext.dropTableIfExists(this.name).execute()
  }

  private static generateName(): string {
    return `temp_${TsidCreator.getTsid256()}`
  }

  static withTempTable(self: DSLContext, batchSize: number, collection: Iterable<string>): TempTable {
    const it = new TempTable(self, TempTable.generateName())
    it.insertTempStrings(batchSize, collection)
    return it
  }
}

/** Kotlin `use { }` sur un Closeable */
export function use<T extends { close(): void }, R>(resource: T, block: (it: T) => R): R {
  try {
    return block(resource)
  } finally {
    resource.close()
  }
}
