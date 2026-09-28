// Tests des supports sans test Kotlin : TransactionTemplate (port/spring-tx.ts), InMemoryHttpExchangeRepository
// (port/spring-actuate.ts), SimpleApplicationEventMulticaster (port/spring-events.ts), TransientBookCache,
// checkTempDirectory, NamespaceXmlFactory.
import Database from 'better-sqlite3'
import { LocalDateTime } from '@js-joda/core'
import { describe, expect, it } from 'vitest'
import { Book } from '../../src/domain/model/Book.js'
import { Media } from '../../src/domain/model/Media.js'
import { TransientBook } from '../../src/domain/model/TransientBook.js'
import { TransientBookCache } from '../../src/infrastructure/cache/TransientBookCache.js'
import { checkTempDirectory } from '../../src/infrastructure/util/TempDirectoryChecker.js'
import { NamespaceXmlFactory } from '../../src/infrastructure/xml/NamespaceXmlFactory.js'
import { URL } from '../../src/port/java-net.js'
import { type HttpExchange, InMemoryHttpExchangeRepository } from '../../src/port/spring-actuate.js'
import { SimpleApplicationEventMulticaster } from '../../src/port/spring-events.js'
import { JdbcTransactionManager, TransactionTemplate } from '../../src/port/spring-tx.js'
import type { HikariDataSource } from '../../src/port/sqlite.js'

describe('TransactionTemplate', () => {
  const db = new Database(':memory:')
  db.exec('create table t (v integer)')
  const template = new TransactionTemplate(new JdbcTransactionManager({ getConnection: () => db } as unknown as HikariDataSource))

  it('commits on success', () => {
    template.executeWithoutResult(() => {
      db.prepare('insert into t values (1)').run()
    })
    expect(db.prepare('select count(*) c from t').get()).toEqual({ c: 1 })
  })

  it('rolls back on exception', () => {
    expect(() =>
      template.executeWithoutResult(() => {
        db.prepare('insert into t values (2)').run()
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(db.prepare('select count(*) c from t').get()).toEqual({ c: 1 })
  })

  it('returns the result of execute', () => {
    expect(template.execute(() => 42)).toBe(42)
  })
})

describe('InMemoryHttpExchangeRepository', () => {
  const exchange = (i: number): HttpExchange => ({ timestamp: `${i}`, request: { uri: `/${i}`, method: 'GET', headers: {} }, response: { status: 200, headers: {} } })

  it('keeps the 100 most recent exchanges, newest first', () => {
    const repo = new InMemoryHttpExchangeRepository()
    for (let i = 0; i < 105; i++) repo.add(exchange(i))
    const all = repo.findAll()
    expect(all).toHaveLength(100)
    expect(all[0]!.timestamp).toBe('104')
    expect(all[99]!.timestamp).toBe('5')
  })
})

describe('SimpleApplicationEventMulticaster', () => {
  it('invokes listeners synchronously without executor', () => {
    const received: unknown[] = []
    new SimpleApplicationEventMulticaster().multicastEvent('e', (e) => received.push(e))
    expect(received).toEqual(['e'])
  })

  it('invokes listeners through the executor', () => {
    const received: unknown[] = []
    const tasks: (() => void)[] = []
    const m = new SimpleApplicationEventMulticaster()
    m.setTaskExecutor({ execute: (t: () => void) => tasks.push(t) })
    m.multicastEvent('e', (e) => received.push(e))
    expect(received).toEqual([])
    tasks.forEach((t) => t())
    expect(received).toEqual(['e'])
  })
})

describe('TransientBookCache', () => {
  const transientBook = (id: string) =>
    new TransientBook({
      book: new Book({ name: id, url: new URL(`file:/tmp/${id}.cbz`), fileLastModified: LocalDateTime.now(), id }),
      media: new Media({ bookId: id }),
    })

  it('saves and finds transient books', () => {
    const cache = new TransientBookCache()
    expect(cache.findByIdOrNull('a')).toBeNull()
    cache.save(transientBook('a'))
    cache.save([transientBook('b'), transientBook('c')])
    expect(cache.findByIdOrNull('a')?.book.id).toBe('a')
    expect(cache.findByIdOrNull('c')?.book.id).toBe('c')
  })
})

describe('TempDirectoryChecker', () => {
  it('accepts the system temp directory', () => {
    expect(() => checkTempDirectory()).not.toThrow()
  })
})

describe('NamespaceXmlFactory', () => {
  it('configures the default namespace and prefixes of new writers', () => {
    const calls: string[] = []
    const writer = { setDefaultNamespace: (u: string) => calls.push(`default ${u}`), setPrefix: (p: string, u: string) => calls.push(`${p} ${u}`) }
    new NamespaceXmlFactory({ defaultNamespace: 'http://www.w3.org/2005/Atom', prefixToNamespace: new Map([['pse', 'http://vaemendis.net/opds-pse/ns']]) }).createXmlWriter(writer)
    expect(calls).toEqual(['default http://www.w3.org/2005/Atom', 'pse http://vaemendis.net/opds-pse/ns'])
  })
})
