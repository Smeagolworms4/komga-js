// Support de portage : liste des migrations « Java » de Komga (équivalent du scan de classpath
// db/migration/sqlite de Flyway). Ce fichier n'a pas de jumeau Kotlin.
import { V20200810154730__thumbnails_part_2 } from '../flyway/db/migration/sqlite/V20200810154730__thumbnails_part_2.js'
import { V20200820150923__metadata_fields_part_2 } from '../flyway/db/migration/sqlite/V20200820150923__metadata_fields_part_2.js'
import { V20210624165023__missing_series_metadata } from '../flyway/db/migration/sqlite/V20210624165023__missing_series_metadata.js'
import { V20230801104436__fix_incorrect_language_codes } from '../flyway/db/migration/sqlite/V20230801104436__fix_incorrect_language_codes.js'
import { V20240422132621__fix_read_progress_locators } from '../flyway/db/migration/sqlite/V20240422132621__fix_read_progress_locators.js'

export const MAIN_CODE_MIGRATIONS = [
  V20200810154730__thumbnails_part_2,
  V20200820150923__metadata_fields_part_2,
  V20210624165023__missing_series_metadata,
  V20230801104436__fix_incorrect_language_codes,
  V20240422132621__fix_read_progress_locators,
]
