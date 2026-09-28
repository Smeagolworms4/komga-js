// @port-of komga/src/flyway/kotlin/db/migration/sqlite/V20240422132621__fix_read_progress_locators.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { gunzipSync } from 'node:zlib'
import { BaseJavaMigration, type Context } from '../../../../port/flyway.js'
import { type JsonNode, readTree, writeTree } from '../../../../port/jackson-tree.js'
import { javaGzip } from '../../../../port/java.js'
import { JdbcTemplate } from '../../../../port/jdbc.js'
import { mapNotNull } from '../../../../port/kotlin.js'
import { KotlinLogging } from '../../../../port/logging.js'

const logger = KotlinLogging.logger('db.migration.sqlite.V20240422132621__fix_read_progress_locators')

// PORT: String.replaceBefore(delimiter, "") : supprime tout ce qui précède la première occurrence (inchangé si absent)
function replaceBefore(s: string, delimiter: string, replacement: string): string {
  const i = s.indexOf(delimiter)
  return i === -1 ? s : replacement + s.slice(i)
}

// PORT: JsonNode.asText() : texte d'un nœud valeur ("null" pour NullNode, nombre au format Java), "" pour un objet/tableau
function asText(n: JsonNode): string {
  if (typeof n === 'string') return n
  if (n instanceof Map || Array.isArray(n)) return ''
  return writeTree(n)
}

export class V20240422132621__fix_read_progress_locators extends BaseJavaMigration {
  override migrate(context: Context): void {
    const jdbcTemplate = new JdbcTemplate(context.connection)

    const readProgressList = jdbcTemplate.queryForList(`select r.BOOK_ID, r.USER_ID, r.locator from READ_PROGRESS r where locator is not null`)

    if (readProgressList.length > 0) {
      const params = mapNotNull(readProgressList, (it) => {
        try {
          const locator = readTree(gunzipSync(it.get('LOCATOR') as Uint8Array).toString('utf8'))
          // PORT: locator["href"] renvoie null si locator n'est pas un objet ou n'a pas de clé href
          const hrefNode = locator instanceof Map ? locator.get('href') : undefined
          const href = hrefNode !== undefined ? asText(hrefNode) : null
          if (href === null) return null
          else {
            const correctHref = replaceBefore(href, '/resource/', '').replace(/^\/resource\//, '')
            ;(locator as Map<string, JsonNode>).set('href', correctHref)
            // PORT: GZIPOutputStream + ObjectMapper.writeValue (qui ferme le flux) = gzip complet du JSON compact
            const gzLocator = javaGzip(Buffer.from(writeTree(locator), 'utf8'))
            return [gzLocator, it.get('BOOK_ID'), it.get('USER_ID')]
          }
        } catch {
          return null
        }
      })
      logger.info(() => `Updating ${params.length} incorrect read progress locators`)
      jdbcTemplate.batchUpdate(`update READ_PROGRESS set locator = ? where BOOK_ID = ? and USER_ID = ?`, params)
    }
  }
}
