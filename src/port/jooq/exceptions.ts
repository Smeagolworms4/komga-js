// Support de portage : exceptions jOOQ / Spring DAO. Ce fichier n'a pas de jumeau Kotlin.
import { RuntimeException } from '../kotlin.js'

/** `org.jooq.exception.DataAccessException` */
export class DataAccessException extends RuntimeException {}

/** `org.jooq.exception.NoDataFoundException` (fetchSingle sans résultat) */
export class NoDataFoundException extends DataAccessException {}

/** `org.jooq.exception.TooManyRowsException` (fetchOne avec plusieurs lignes) */
export class TooManyRowsException extends DataAccessException {}

/** `org.springframework.dao.DataIntegrityViolationException` (contrainte SQLite violée) */
export class DataIntegrityViolationException extends DataAccessException {}
