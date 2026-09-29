// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/kobo/KepubConverterOracleTest.kt
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { BookWithMedia } from '../../../../src/domain/model/BookWithMedia.js'
import { KepubConverter } from '../../../../src/infrastructure/kobo/KepubConverter.js'
import { OracleDb } from '../../db.js'
import { oracle, tempDir } from '../../oracle.js'
import { realBooks, setup } from '../../interfaces/data.js'
import { InterfacesServices } from '../../interfaces/services.js'

const { func, kase } = oracle('infrastructure/kobo/KepubConverter')

const db = new OracleDb()
const services = new InterfacesServices(db)

function script(name: string, content: string, executable = true): string {
  const dir = join(tempDir(), 'bin')
  mkdirSync(dir, { recursive: true })
  const p = join(dir, name)
  writeFileSync(p, `#!/bin/sh\n${content}\n`)
  chmodSync(p, executable ? 0o755 : 0o644)
  return p
}

let scripts: Record<string, string> | null = null
const s = () =>
  (scripts ??= {
    copy: script('kepubify-copy', 'cp "$1" "$3"\necho converted'),
    failing: script('kepubify-fail', 'echo boom >&2\nexit 3'),
    noOutput: script('kepubify-none', 'exit 0'),
    notExecutable: script('kepubify-noexec', 'exit 0', false),
  })

const clean = (v: string | null | undefined): string | null => (v === null || v === undefined ? null : v.replaceAll(tempDir(), '<tmp>').replaceAll(resolve(tmpdir()), '<systmp>'))

const state = (c: KepubConverter) => [c.isAvailable, clean(c.kepubifyPath)]

async function attempt(block: () => unknown): Promise<unknown> {
  try {
    return await block()
  } catch (e) {
    return [(e as Error).name, clean((e as Error).message)]
  }
}

const converter = (configPath: string | null = null) => new KepubConverter(services.settings, db.bookProjectionDao, configPath)

// PORT: méthodes privées appelées par réflexion côté Kotlin
const call = (c: KepubConverter, name: string, ...args: unknown[]): unknown => (c as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!.apply(c, args)

const describe = (p: string | null) =>
  p === null ? null : [basename(p), existsSync(p), existsSync(p) && readFileSync(p).equals(readFileSync(join(tempDir(), 'real.epub'))), clean(dirname(p))]

const projections = () => db.rawQuery('SELECT BOOK_ID, PROFILE, FILE_SIZE FROM BOOK_PROJECTION ORDER BY BOOK_ID, PROFILE')

const bookWithMedia = (id: string) => new BookWithMedia({ book: db.bookDao.findByIdOrNull(id)!, media: db.mediaDao.findById(id) })

const configured = (value: string | null, fallback = false, configPath: string | null = null) => {
  const c = converter(configPath)
  c.configureKepubify(value, fallback)
  return c
}

func('configureKepubify', () => {
  kase('setup', () => {
    setup(db)
    realBooks(db, tempDir())
  })
  kase('null', () => state(configured(null)))
  kase('blank', () => state(configured('  ')))
  kase('executable script', () => state(configured(s().copy!)))
  kase('missing file', () => state(configured('/oracle-missing/kepubify')))
  kase('not executable file', () => state(configured(s().notExecutable!)))
  kase('command in PATH, exit 0', () => state(configured('true')))
  kase('command in PATH, exit 1', () => state(configured('false')))
  kase('null with fallback', () => state(configured(null, true, s().copy!)))
  kase('invalid with fallback', () => state(configured('/oracle-missing/k', true, s().copy!)))
  kase('invalid with invalid fallback', () => state(configured('/oracle-missing/k', true, '/oracle-missing/k2')))
  kase('null without fallback', () => state(configured(null, false, s().copy!)))
  kase('valid then null', () => {
    const c = converter()
    c.configureKepubify(s().copy!)
    c.configureKepubify(null)
    return state(c)
  })
})

func('configureKepubifyOnStartup', () => {
  const started = (configPath: string | null = null) => {
    const c = converter(configPath)
    call(c, 'configureKepubifyOnStartup')
    return state(c)
  }
  kase('nothing set', () => started())
  kase('configuration path', () => started(s().copy!))
  kase('setting wins', () => {
    services.settings.kepubifyPath = s().failing!
    return started(s().copy!)
  })
  kase('blank setting', () => {
    services.settings.kepubifyPath = ' '
    return started(s().copy!)
  })
})

func('configureKepubifyOnSettingsChange', () => {
  const changed = (configPath: string | null = null) => {
    const c = converter(configPath)
    call(c, 'configureKepubifyOnSettingsChange')
    return state(c)
  }
  kase('setting', () => {
    services.settings.kepubifyPath = s().copy!
    return changed()
  })
  kase('setting removed, fallback', () => {
    services.settings.kepubifyPath = null
    return changed(s().noOutput!)
  })
  kase('events', () => services.drainEvents())
})

func('isExecutable', () => {
  kase('script', () => call(converter(), 'isExecutable', s().copy!))
  kase('not executable', () => call(converter(), 'isExecutable', s().notExecutable!))
  kase('missing', () => call(converter(), 'isExecutable', '/oracle-missing/x'))
  kase('directory', () => call(converter(), 'isExecutable', tempDir()))
  kase('true', () => call(converter(), 'isExecutable', 'true'))
  kase('false', () => call(converter(), 'isExecutable', 'false'))
})

func('convertEpubToKepub', () => {
  const c = () => configured(s().copy!, false, s().copy!)
  kase('epub', () => attempt(async () => describe(await c().convertEpubToKepub(bookWithMedia('B8')))))
  kase('projection saved', () => projections())
  kase('to directory', () =>
    attempt(async () => {
      const out = join(tempDir(), 'out')
      mkdirSync(out, { recursive: true })
      return describe(await c().convertEpubToKepub(bookWithMedia('B8'), out))
    }),
  )
  kase('not an epub', () => attempt(() => c().convertEpubToKepub(bookWithMedia('B7'))))
  kase('already kepub', () =>
    attempt(() => {
      const it = bookWithMedia('B8')
      return c().convertEpubToKepub(it.copy({ media: it.media.copy({ epubIsKepub: true }) }))
    }),
  )
  kase('missing file', () => attempt(() => c().convertEpubToKepub(bookWithMedia('B4'))))
  kase('not available', () => attempt(() => converter().convertEpubToKepub(bookWithMedia('B8'))))
})

func('convertEpubToKepubWithoutChecks', () => {
  kase('missing destination', () => attempt(() => configured(s().copy!).convertEpubToKepubWithoutChecks(bookWithMedia('B8').book, join(tempDir(), 'nope'))))
  kase('failing converter', () => attempt(() => configured(s().failing!).convertEpubToKepubWithoutChecks(bookWithMedia('B8').book)))
  kase('no output', () => attempt(() => configured(s().noOutput!).convertEpubToKepubWithoutChecks(bookWithMedia('B8').book, tempDir())))
  kase('cbz source copied', () => attempt(async () => describe(await configured(s().copy!).convertEpubToKepubWithoutChecks(bookWithMedia('B7').book, join(tempDir(), 'out')))))
  kase('missing source', () => attempt(() => configured(s().copy!).convertEpubToKepubWithoutChecks(bookWithMedia('B4').book, join(tempDir(), 'out'))))
  kase('not available', () => attempt(() => converter().convertEpubToKepubWithoutChecks(bookWithMedia('B8').book)))
  kase('projections', () => projections())
})
