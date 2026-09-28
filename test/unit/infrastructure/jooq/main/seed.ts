// Données de test fixes des oracles de DAO, miroir de DaoSeed.kt (fork Komga, branche unit-oracles)
import { LocalDateTime } from '@js-joda/core'
import { Book } from '../../../../../src/domain/model/Book.js'
import { KomgaUser } from '../../../../../src/domain/model/KomgaUser.js'
import { Library } from '../../../../../src/domain/model/Library.js'
import { Series } from '../../../../../src/domain/model/Series.js'
import { URL } from '../../../../../src/port/java-net.js'
import { exec, type OracleDb } from '../../../db.js'

export const T0 = LocalDateTime.of(2020, 1, 1, 10, 0)

export const library = (id: string) => new Library({ name: `lib ${id}`, root: new URL(`file:/libraries/${id}`), id, createdDate: T0 })

export const series = (id: string, libraryId: string, name: string = `series ${id}`) =>
  new Series({ name, url: new URL(`file:/libraries/${libraryId}/${id}`), fileLastModified: T0, id, libraryId, createdDate: T0 })

export const book = (
  id: string,
  seriesId: string,
  libraryId: string,
  { name = `book ${id}`, number = 0, fileSize = 0, ext = 'cbz' }: { name?: string; number?: number; fileSize?: number; ext?: string } = {},
) =>
  new Book({
    name,
    url: new URL(`file:/libraries/${libraryId}/${seriesId}/${id}.${ext}`),
    fileLastModified: T0,
    fileSize,
    number,
    id,
    seriesId,
    libraryId,
    createdDate: T0,
  })

export const user = (id: string, email: string = `${id}@example.org`) => new KomgaUser({ email, password: 'secret', id, createdDate: T0 })

/** Exécute des instructions SQL brutes sur la base principale */
export const sql = (db: OracleDb, ...statements: string[]) => exec(db.dataSource.getConnection(), ...statements)
