// @port-of komga/src/flyway/kotlin/db/migration/sqlite/V20230801104436__fix_incorrect_language_codes.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BaseJavaMigration, type Context } from '../../../../port/flyway.js'
import { ULocale } from '../../../../port/extra-metadata.js'
import { JdbcTemplate } from '../../../../port/jdbc.js'
import { isBlank, isNullOrBlank, mapNotNull, str } from '../../../../port/kotlin.js'
import { KotlinLogging } from '../../../../port/logging.js'

const logger = KotlinLogging.logger('db.migration.sqlite.V20230801104436__fix_incorrect_language_codes')

export class V20230801104436__fix_incorrect_language_codes extends BaseJavaMigration {
  override migrate(context: Context): void {
    const jdbcTemplate = new JdbcTemplate(context.connection)

    const seriesLanguage = jdbcTemplate.queryForList(
      `select m.SERIES_ID, m.LANGUAGE from SERIES_METADATA m where LANGUAGE <> '' and LANGUAGE <> 'en'`,
    )

    if (seriesLanguage.length > 0) {
      const params = mapNotNull(seriesLanguage, (it) => {
        const language = str(it.get('LANGUAGE'))
        if (isBlank(language)) return null
        else {
          const languageNormalized = this.normalize(language)
          if (language === languageNormalized) return null
          else return [languageNormalized, it.get('SERIES_ID')]
        }
      })
      logger.info(() => `Updating ${params.length} incorrect language codes for Series metadata`)
      jdbcTemplate.batchUpdate(`update SERIES_METADATA set LANGUAGE = ? where SERIES_ID = ?`, params)
    }
  }

  private normalize(value: string | null): string {
    if (isNullOrBlank(value)) return ''
    try {
      return ULocale.forLanguageTag(value).toLanguageTag()
    } catch {
      return ''
    }
  }
}
