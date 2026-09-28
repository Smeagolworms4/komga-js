// @port-of komga/src/flyway/kotlin/db/migration/sqlite/V20200810154730__thumbnails_part_2.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BaseJavaMigration, type Context } from '../../../../port/flyway.js'
import { JdbcTemplate } from '../../../../port/jdbc.js'
import { TsidCreator } from '../../../../port/tsid.js'

// This migration will copy the existing thumbnails in MEDIA to the new table THUMBNAIL_BOOK,
// adding a generated TSID as the ID
export class V20200810154730__thumbnails_part_2 extends BaseJavaMigration {
  override migrate(context: Context): void {
    const jdbcTemplate = new JdbcTemplate(context.connection)

    const thumbnails = jdbcTemplate.queryForList('SELECT THUMBNAIL, BOOK_ID FROM MEDIA')

    if (thumbnails.length > 0) {
      const parameters = thumbnails.map((it) => [TsidCreator.getTsid256().toString(), it.get('THUMBNAIL'), it.get('BOOK_ID')])

      jdbcTemplate.batchUpdate(
        "INSERT INTO THUMBNAIL_BOOK(ID, THUMBNAIL, SELECTED, TYPE, BOOK_ID) values (?, ?, 1, 'GENERATED', ?)",
        parameters,
      )
    }
  }
}
