// Tests du support de portage port/async-io.ts (sans jumeau Kotlin) : lectures sur le pool de libuv, passages
// coopératifs, processus externes, et parcours asynchrone de walkFileTree (même ordre que readdir(3)).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { ASYNC_READ_CHUNK, cooperativeYield, readChunksAsync, resetYieldSlice, spawnAsync } from '../../src/port/async-io.js'
import { type BasicFileAttributes, FileVisitOption, FileVisitResult, type FileVisitor, newDirectoryStream, walkFileTree } from '../../src/port/java-nio-file.js'

const dir = mkdtempSync(join(tmpdir(), 'async-io-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('readChunksAsync', () => {
  it('reads the whole file, in order, by chunks', async () => {
    const data = Buffer.alloc(ASYNC_READ_CHUNK * 2 + 123)
    for (let i = 0; i < data.length; i++) data[i] = (i * 31) & 255
    const f = join(dir, 'big.bin')
    writeFileSync(f, data)
    const chunks: Buffer[] = []
    await readChunksAsync(f, (c) => chunks.push(Buffer.from(c)))
    expect(chunks.map((c) => c.length)).toEqual([ASYNC_READ_CHUNK, ASYNC_READ_CHUNK, 123])
    expect(Buffer.concat(chunks).equals(data)).toBe(true)
  })

  it('throws like Path.inputStream(): NoSuchFileException, IOException for a directory', async () => {
    await expect(readChunksAsync(join(dir, 'missing'), () => {})).rejects.toMatchObject({ name: 'NoSuchFileException' })
    await expect(readChunksAsync(dir, () => {})).rejects.toMatchObject({ name: 'IOException', message: 'Is a directory' })
  })
})

describe('cooperativeYield', () => {
  it('does nothing within the time slice, yields to the event loop after it', async () => {
    resetYieldSlice()
    expect(cooperativeYield()).toBeUndefined()
    let ticked = false
    setImmediate(() => (ticked = true))
    const t = performance.now()
    while (performance.now() - t < 15);
    const p = cooperativeYield()
    expect(p).toBeInstanceOf(Promise)
    await p
    expect(ticked).toBe(true)
    expect(cooperativeYield()).toBeUndefined()
  })
})

describe('spawnAsync', () => {
  it('gives the exit code and the outputs, like spawnSync', async () => {
    const r = await spawnAsync(process.execPath, ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)'])
    expect([r.status, r.stdout.toString(), r.stderr.toString(), r.error]).toEqual([3, 'out', 'err', undefined])
  })

  it('stops the process after the timeout (ETIMEDOUT) and reports a missing command (ENOENT)', async () => {
    const t = performance.now()
    const r = await spawnAsync(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeout: 200 })
    expect(performance.now() - t).toBeLessThan(5000)
    expect([r.status, r.error?.code]).toEqual([null, 'ETIMEDOUT'])
    const missing = await spawnAsync(join(dir, 'no-such-command'), [])
    expect([missing.status, missing.error?.code]).toEqual([null, 'ENOENT'])
  })

  it('does not block the event loop while the process runs', async () => {
    let ticks = 0
    const timer = setInterval(() => ticks++, 10)
    await spawnAsync(process.execPath, ['-e', 'setTimeout(() => {}, 300)'])
    clearInterval(timer)
    expect(ticks).toBeGreaterThan(5)
  })
})

describe('walkFileTree (asynchronous)', () => {
  it('visits the same entries in the same order as a synchronous walk over readdir(3)', async () => {
    const root = join(dir, 'tree')
    for (const d of ['a', 'b/c', 'b/d', '.hidden', 'e']) mkdirSync(join(root, d), { recursive: true })
    for (const f of ['a/1.cbz', 'a/2.cbz', 'b/c/3.cbz', 'b/x.txt', 'e/4.cbz', 'top.cbz']) writeFileSync(join(root, f), f)
    const events: string[] = []
    const visitor: FileVisitor = {
      preVisitDirectory: (d: string) => {
        events.push(`pre ${d}`)
        return d.endsWith('.hidden') ? FileVisitResult.SKIP_SUBTREE : d.endsWith('/d') ? FileVisitResult.SKIP_SIBLINGS : FileVisitResult.CONTINUE
      },
      visitFile: (f: string, attrs: BasicFileAttributes) => {
        events.push(`file ${f} ${attrs.size()}`)
        return FileVisitResult.CONTINUE
      },
      visitFileFailed: (f: string | null) => {
        events.push(`failed ${f}`)
        return FileVisitResult.CONTINUE
      },
      postVisitDirectory: (d: string) => {
        events.push(`post ${d}`)
        return FileVisitResult.CONTINUE
      },
    }
    await walkFileTree(root, new Set([FileVisitOption.FOLLOW_LINKS]), 2147483647, visitor)
    // parcours de référence en profondeur, ordre brut de readdir(3)
    const expected: string[] = []
    const walk = (d: string): boolean => {
      expected.push(`pre ${d}`)
      if (d.endsWith('.hidden')) return true
      if (d.endsWith('/d')) return false
      for (const e of newDirectoryStream(d)) {
        const isDir = !e.endsWith('.cbz') && !e.endsWith('.txt')
        if (isDir) {
          if (!walk(e)) break
        } else expected.push(`file ${e} ${Buffer.byteLength(e.slice(root.length + 1))}`)
      }
      expected.push(`post ${d}`)
      return true
    }
    walk(root)
    expect(events).toEqual(expected)
  })
})

describe('event loop', () => {
  it('stays responsive while files are hashed asynchronously', async () => {
    const { Hasher } = await import('../../src/infrastructure/hash/Hasher.js')
    const f = join(dir, 'hash.bin')
    writeFileSync(f, Buffer.alloc(8 * ASYNC_READ_CHUNK, 7))
    let ticks = 0
    const timer = setInterval(() => ticks++, 1)
    const hasher = new Hasher()
    for (let i = 0; i < 5; i++) await hasher.computeHash(f)
    clearInterval(timer)
    await delay(1)
    expect(ticks).toBeGreaterThan(0)
    expect(await hasher.computeHash(f)).toBe(hasher.computeHashBlocking(f))
  })
})
