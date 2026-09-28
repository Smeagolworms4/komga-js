// Vérifie que le runner Flyway TS produit exactement le schéma et l'historique du vrai Flyway (Komga 1.27.1).
// Les bases de référence ont été produites par `./gradlew :komga:flywayMigrateMain :komga:flywayMigrateTasks`.
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { Flyway, flywayChecksum } from '../../src/port/flyway.js'

const PLACEHOLDERS = {
  'library-file-hashing': 'true',
  'library-scan-startup': 'false',
  'delete-empty-collections': 'true',
  'delete-empty-read-lists': 'true',
}

function schema(db: Database.Database) {
  return db
    .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
    .all()
}
function history(db: Database.Database) {
  return db
    .prepare('SELECT installed_rank, version, description, type, script, checksum, installed_by, success FROM flyway_schema_history ORDER BY installed_rank')
    .all()
}

describe('Flyway', () => {
  it('main database: same schema and history as Flyway', async () => {
    const ref = new Database('test/port/reference-main.sqlite', { readonly: true })
    const db = new Database(':memory:')
    db.loadExtension('build/komgasqlite.so')
    db.pragma('foreign_keys = ON')
    await new Flyway(db, {
      sqlLocations: ['resources/db/migration/sqlite'],
      codeLocations: ['src/flyway/db/migration/sqlite'],
      codePackage: 'db.migration.sqlite',
      placeholders: PLACEHOLDERS,
    }).migrate()

    expect(schema(db)).toEqual(schema(ref))
    expect(history(db)).toEqual(history(ref))
  })

  it('tasks database: same schema and history as Flyway', async () => {
    const ref = new Database('test/port/reference-tasks.sqlite', { readonly: true })
    const db = new Database(':memory:')
    await new Flyway(db, { sqlLocations: ['resources/tasks/migration/sqlite'] }).migrate()

    expect(schema(db)).toEqual(schema(ref))
    expect(history(db)).toEqual(history(ref))
  })

  it('is idempotent and validates checksums', async () => {
    const db = new Database(':memory:')
    const fw = new Flyway(db, { sqlLocations: ['resources/tasks/migration/sqlite'] })
    expect(await fw.migrate()).toBe(1)
    expect(await fw.migrate()).toBe(0)
    db.prepare('UPDATE flyway_schema_history SET checksum = checksum + 1').run()
    await expect(fw.migrate()).rejects.toThrow(/checksum mismatch/)
  })

  it('checksum ignores BOM and line terminators like Flyway', () => {
    expect(flywayChecksum('﻿a\r\nb\n')).toBe(flywayChecksum('a\nb'))
  })
})
