// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/datasource/SqliteUdfDataSource.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type Database from 'better-sqlite3'
import { stripAccents } from '../../language/LanguageUtils.js'
import { error } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { SQLiteDataSource } from '../../port/sqlite.js'

const log = KotlinLogging.logger('org.gotson.komga.infrastructure.datasource.SqliteUdfDataSource')

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
    connection.function('REGEXP', { deterministic: true }, (pattern: unknown, value: unknown) => {
      // PORT: Kotlin toRegex(IGNORE_CASE) = java.util.regex ; approché par RegExp JS avec le drapeau 'i'
      const regexp = new RegExp(pattern === null ? '' : String(pattern), 'i')
      const text = value === null ? '' : String(value)

      return regexp.test(text) ? 1 : 0
    })
  }

  private createUdfStripAccents(connection: Database.Database): void {
    log.debug(() => `Adding custom ${SqliteUdfDataSource.UDF_STRIP_ACCENTS} function`)
    connection.function(SqliteUdfDataSource.UDF_STRIP_ACCENTS, { deterministic: true }, (text: unknown) => {
      if (text === null) return error('Argument must not be null')
      else return stripAccents(String(text))
    })
  }
}
