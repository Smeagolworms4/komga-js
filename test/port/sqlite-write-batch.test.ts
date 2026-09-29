// port/sqlite-write-batch.ts : les écritures des tâches sont validées par lots, sans rien changer à ce qui est lu ni à
// l'atomicité des transactions de Komga ; les écritures hors tâche sont validées aussitôt après.
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareCached } from '../../src/port/jooq/core.js'
import { isActualTransactionActive, isCurrentTransactionReadOnly, transactional } from '../../src/port/jooq/dsl.js'
import { commitWriteBatch, enableWriteBatching, isWriteBatchOpen, runWithWriteBatching, writeBatchCommits, writeBatchDelay } from '../../src/port/sqlite-write-batch.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const turn = () => new Promise((r) => setImmediate(r))

let dir = ''
let rw: Database.Database
let ro: Database.Database

function setup(delayMs: number): void {
  dir = mkdtempSync(join(tmpdir(), 'write-batch-'))
  rw = new Database(join(dir, 'db.sqlite'))
  rw.pragma('journal_mode = WAL')
  rw.pragma('synchronous = FULL')
  rw.exec('CREATE TABLE T (V TEXT NOT NULL UNIQUE)')
  ro = new Database(join(dir, 'db.sqlite'), { readonly: true })
  enableWriteBatching(rw, delayMs)
}
const insert = (v: string) => prepareCached(rw, 'INSERT INTO T (V) VALUES (?)').run(v)
const committed = () => (ro.prepare('SELECT V FROM T ORDER BY V').all() as { V: string }[]).map((it) => it.V)
const visible = () => (rw.prepare('SELECT V FROM T ORDER BY V').all() as { V: string }[]).map((it) => it.V)

afterEach(() => {
  commitWriteBatch(rw)
  rw.close()
  ro.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('sqlite-write-batch', () => {
  it('commits the writes of successive tasks together', async () => {
    setup(100)
    for (const v of ['a', 'b', 'c'])
      await runWithWriteBatching(async () => {
        insert(v)
        await turn()
        transactional(rw, () => insert(v + '2'))
      })
    // lu par la connexion d'écriture (celle des DAO pendant un lot), pas encore validé
    expect(isWriteBatchOpen(rw)).toBe(true)
    expect(isActualTransactionActive(rw)).toBe(true)
    expect(visible()).toEqual(['a', 'a2', 'b', 'b2', 'c', 'c2'])
    expect(committed()).toEqual([])
    await sleep(150)
    expect(committed()).toEqual(['a', 'a2', 'b', 'b2', 'c', 'c2'])
    expect(writeBatchCommits(rw)).toBe(1)
    expect(isWriteBatchOpen(rw)).toBe(false)
  })

  it('reopens the batch after its delay while a task runs', async () => {
    setup(30)
    await runWithWriteBatching(async () => {
      insert('a')
      await sleep(60)
      expect(committed()).toEqual(['a'])
      expect(isWriteBatchOpen(rw)).toBe(true)
      insert('b')
    })
    await sleep(60)
    expect(committed()).toEqual(['a', 'b'])
    expect(writeBatchCommits(rw)).toBe(2)
  })

  it('rolls back a failed transaction alone', async () => {
    setup(1000)
    await runWithWriteBatching(async () => {
      insert('a')
      expect(() =>
        transactional(rw, () => {
          insert('b')
          insert('a')
        }),
      ).toThrow(/UNIQUE/)
      // instruction en autocommit en échec : annulée seule
      expect(() => insert('a')).toThrow(/UNIQUE/)
      insert('c')
    })
    commitWriteBatch(rw)
    expect(committed()).toEqual(['a', 'c'])
  })

  it('reads through the write connection in read-only transactions', async () => {
    setup(1000)
    await runWithWriteBatching(async () => {
      insert('a')
      transactional(
        rw,
        () => {
          expect(isActualTransactionActive(rw)).toBe(true)
          expect(isCurrentTransactionReadOnly(rw)).toBe(false)
          expect(visible()).toEqual(['a'])
        },
        { readOnly: true },
      )
    })
  })

  it('commits the batch on the next turn after a write outside of tasks', async () => {
    setup(10_000)
    let release = () => {}
    const task = runWithWriteBatching(async () => {
      insert('a')
      await new Promise<void>((r) => (release = r))
      insert('c')
    })
    await turn()
    // requête HTTP : écriture puis transaction, hors tâche
    insert('b')
    transactional(rw, () => insert('b2'))
    expect(committed()).toEqual([])
    await turn()
    await turn()
    expect(committed()).toEqual(['a', 'b', 'b2'])
    // la tâche continue dans un nouveau lot
    expect(isWriteBatchOpen(rw)).toBe(true)
    release()
    await task
    commitWriteBatch(rw)
    expect(committed()).toEqual(['a', 'b', 'b2', 'c'])
  })

  it('does not batch writes outside of tasks', async () => {
    setup(1000)
    insert('a')
    transactional(rw, () => insert('b'))
    expect(isWriteBatchOpen(rw)).toBe(false)
    expect(committed()).toEqual(['a', 'b'])
  })

  it('is disabled with a delay of 0', async () => {
    setup(0)
    await runWithWriteBatching(async () => insert('a'))
    expect(isWriteBatchOpen(rw)).toBe(false)
    expect(committed()).toEqual(['a'])
  })

  it('reads KOMGAJS_WRITE_BATCH_MS', () => {
    expect(writeBatchDelay(undefined)).toBe(1000)
    expect(writeBatchDelay('')).toBe(1000)
    expect(writeBatchDelay('abc')).toBe(1000)
    expect(writeBatchDelay('-5')).toBe(1000)
    expect(writeBatchDelay('0')).toBe(0)
    expect(writeBatchDelay('250')).toBe(250)
  })
})
