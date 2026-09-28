// Support de portage : exceptions jOOQ / Spring DAO. Ce fichier n'a pas de jumeau Kotlin.
import { RuntimeException } from '../kotlin.js'

/** `org.jooq.exception.DataAccessException` */
export class DataAccessException extends RuntimeException {}

/** `org.jooq.exception.NoDataFoundException` (fetchSingle sans résultat) */
export class NoDataFoundException extends DataAccessException {}

/** `org.jooq.exception.TooManyRowsException` (fetchOne avec plusieurs lignes) */
export class TooManyRowsException extends DataAccessException {}

/**
 * `org.jooq.exception.IntegrityConstraintViolationException` (contrainte SQLite violée) : les DAO de Komga sont des
 * `@Component` (pas de traduction Spring `@Repository`), l'exception jOOQ remonte telle quelle
 */
export class IntegrityConstraintViolationException extends DataAccessException {}
