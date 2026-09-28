// @port-of komga/src/flyway/kotlin/db/migration/sqlite/V20200820150923__metadata_fields_part_2.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BaseJavaMigration, type Context } from '../../../../port/flyway.js'
import { JdbcTemplate } from '../../../../port/jdbc.js'
import { groupBy, mapNotNull, maxByOrNull, sortedByDescending } from '../../../../port/kotlin.js'

// PORT: maxOrNull() sur Int
function maxOrNull(l: number[]): number | null {
  return l.length === 0 ? null : Math.max(...l)
}

export class V20200820150923__metadata_fields_part_2 extends BaseJavaMigration {
  override migrate(context: Context): void {
    const jdbcTemplate = new JdbcTemplate(context.connection)

    const bookMetadata = jdbcTemplate.queryForList(
      `select m.AGE_RATING, m.AGE_RATING_LOCK, m.PUBLISHER, m.PUBLISHER_LOCK, m.READING_DIRECTION, m.READING_DIRECTION_LOCK, b.SERIES_ID, m.NUMBER_SORT
from BOOK_METADATA m
left join BOOK B on B.ID = m.BOOK_ID`,
    )

    if (bookMetadata.length > 0) {
      const parameters = [...groupBy(bookMetadata, (it) => it.get('SERIES_ID'))].map(([seriesId, v]) => {
        const ageRating = maxOrNull(mapNotNull(v, (it) => it.get('AGE_RATING') as number | null))
        const ageRatingLock = maxOrNull(mapNotNull(v, (it) => it.get('AGE_RATING_LOCK') as number | null))

        const publisher =
          sortedByDescending(
            v.filter((it) => (it.get('PUBLISHER') as string).length > 0),
            (it) => it.get('NUMBER_SORT') as number | null,
          ).map((it) => it.get('PUBLISHER') as string)[0] ?? ''
        const publisherLock = maxOrNull(mapNotNull(v, (it) => it.get('PUBLISHER_LOCK') as number | null))

        // PORT: groupingBy { it }.eachCount().maxByOrNull { it.value }?.key
        const counts = new Map<string, number>()
        for (const it of mapNotNull(v, (it) => it.get('READING_DIRECTION') as string | null)) counts.set(it, (counts.get(it) ?? 0) + 1)
        const readingDir = maxByOrNull(counts, ([, c]) => c)?.[0] ?? null
        const readingDirLock = maxOrNull(mapNotNull(v, (it) => it.get('READING_DIRECTION_LOCK') as number | null))

        return [ageRating, ageRatingLock, publisher, publisherLock, readingDir, readingDirLock, seriesId]
      })

      jdbcTemplate.batchUpdate(
        'UPDATE SERIES_METADATA SET AGE_RATING = ?, AGE_RATING_LOCK = ?, PUBLISHER = ?, PUBLISHER_LOCK = ?, READING_DIRECTION = ?, READING_DIRECTION_LOCK = ? WHERE SERIES_ID = ?',
        parameters,
      )
    }
  }
}
