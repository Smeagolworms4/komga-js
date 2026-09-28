// @port-of komga/src/flyway/kotlin/db/migration/sqlite/V20210624165023__missing_series_metadata.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { stripAccents } from '../../../../language/LanguageUtils.js'
import { BaseJavaMigration, type Context } from '../../../../port/flyway.js'
import { JdbcTemplate } from '../../../../port/jdbc.js'
import { str } from '../../../../port/kotlin.js'
import { KotlinLogging } from '../../../../port/logging.js'

const logger = KotlinLogging.logger('db.migration.sqlite.V20210624165023__missing_series_metadata')

export class V20210624165023__missing_series_metadata extends BaseJavaMigration {
  override migrate(context: Context): void {
    const jdbcTemplate = new JdbcTemplate(context.connection)

    const seriesWithoutMetada = jdbcTemplate.queryForList(
      `select s.ID, s.NAME from SERIES s where s.ID not in (select sm.SERIES_ID from SERIES_METADATA sm)`,
    )

    if (seriesWithoutMetada.length > 0) {
      logger.info(() => `Found ${seriesWithoutMetada.length} series without metadata`)

      {
        const parameters = seriesWithoutMetada.map((it) =>
          // fields for SERIES_METADATA: SERIES_ID, STATUS=ONGOING, TITLE, TITLE_SORT, READING_DIRECTION=null, AGE_RATING=null
          // PORT: StringUtils.stripAccents = language/stripAccents (même implémentation commons-lang3)
          [it.get('ID'), 'ONGOING', it.get('NAME'), stripAccents(str(it.get('NAME'))), null, null],
        )
        jdbcTemplate.batchUpdate(
          'INSERT INTO SERIES_METADATA(SERIES_ID, STATUS, TITLE, TITLE_SORT, READING_DIRECTION, AGE_RATING) VALUES (?,?,?,?,?,?)',
          parameters,
        )
      }

      {
        const parameters = seriesWithoutMetada.map((it) =>
          // fields for BOOK_METADATA_AGGREGATION: SERIES_ID, RELEASE_DATE=null
          [it.get('ID'), null],
        )
        jdbcTemplate.batchUpdate('INSERT INTO BOOK_METADATA_AGGREGATION(SERIES_ID, RELEASE_DATE) VALUES (?,?)', parameters)
      }
    }
  }
}
