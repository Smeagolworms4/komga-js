// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/datasource/SqliteUdfDataSource.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type Database from 'better-sqlite3'
import { stripAccents } from '../../language/LanguageUtils.js'
import { error } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { SQLiteDataSource } from '../../port/sqlite.js'

const log = KotlinLogging.logger('org.gotson.komga.infrastructure.datasource.SqliteUdfDataSource')

function javaRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'iu')
  } catch {
    return new RegExp(pattern, 'i')
  }
}

export class SqliteUdfDataSource extends SQLiteDataSource {
  static readonly UDF_STRIP_ACCENTS = 'UDF_STRIP_ACCENTS'
  static readonly COLLATION_UNICODE_1 = 'COLLATION_UNICODE_1'
  static readonly COLLATION_UNICODE_3 = 'COLLATION_UNICODE_3'

  // PORT: getConnection() -> configure() appelé à l'ouverture de la connexion
  protected override configure(connection: Database.Database): void {
    super.configure(connection)
    this.addAllUdf(connection)
  }

  private addAllUdf(connection: Database.Database): void {
    this.createUdfRegexp(connection)
    this.createUdfStripAccents(connection)
    // PORT: collations COLLATION_UNICODE_3 / COLLATION_UNICODE_1 (Collators.collator3 / collator1) enregistrées
    // par l'extension native chargée dans SQLiteDataSource.configure (better-sqlite3 n'expose pas create_collation)
  }

  private createUdfRegexp(connection: Database.Database): void {
    log.debug(() => 'Adding custom REGEXP function')
    // PORT: Function.create de sqlite-jdbc enregistre la fonction avec un nombre d'arguments variable (narg -1)
    connection.function('REGEXP', { deterministic: true, varargs: true }, (pattern: unknown, value: unknown) => {
      // PORT: Kotlin toRegex(IGNORE_CASE) = java.util.regex, CASE_INSENSITIVE | UNICODE_CASE, par points de code ;
      // approché par RegExp JS avec les drapeaux 'iu' (repli sur 'i' pour une syntaxe refusée en mode unicode)
      const regexp = javaRegex(pattern === null || pattern === undefined ? '' : String(pattern))
      const text = value === null || value === undefined ? '' : String(value)

      // PORT: result(Int) -> entier SQLite (un nombre JS serait rendu en REAL)
      return regexp.test(text) ? 1n : 0n
    })
  }

  private createUdfStripAccents(connection: Database.Database): void {
    log.debug(() => `Adding custom ${SqliteUdfDataSource.UDF_STRIP_ACCENTS} function`)
    connection.function(SqliteUdfDataSource.UDF_STRIP_ACCENTS, { deterministic: true, varargs: true }, (text: unknown) => {
      if (text === null || text === undefined) return error('Argument must not be null')
      else return stripAccents(String(text))
    })
  }
}
