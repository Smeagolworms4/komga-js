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
// PORT: les noms des tables supprimées sont réutilisés, par connexion : better-sqlite3 garde chaque instruction préparée
// jusqu'au ramasse-miettes, et un nom unique par table rendait uniques (non réutilisables) toutes les requêtes qui
// l'utilisent (voir prepareCached dans port/jooq/core.ts)
const freeNames = new WeakMap<object, string[]>()

export class TempTable {
  private created = false
  private released = false

  // PORT: constructeur primaire privé (dslContext, name) et secondaire (dslContext) fusionnés
  constructor(
    private readonly dslContext: DSLContext,
    readonly name: string = TempTable.generateName(dslContext),
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
    // PORT: nom rendu à la connexion (une seule fois)
    if (!this.released) {
      this.released = true
      let free = freeNames.get(this.dslContext.db)
      if (free === undefined) freeNames.set(this.dslContext.db, (free = []))
      free.push(this.name)
    }
  }

  // PORT: nom libre de la connexion s'il y en a un
  private static generateName(dslContext: DSLContext): string {
    return freeNames.get(dslContext.db)?.pop() ?? `temp_${TsidCreator.getTsid256()}`
  }

  static withTempTable(self: DSLContext, batchSize: number, collection: Iterable<string>): TempTable {
    const it = new TempTable(self, TempTable.generateName(self))
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
