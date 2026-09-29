// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/FileSystemScannerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: Jimfs (système de fichiers en mémoire, chemins absolus isolés comme "/root" ou "/") -> vrai répertoire
// temporaire par test, dans lequel les chemins absolus sont redirigés (équivalent d'un chroot) : node:fs est
// remplacé pour ce fichier par une enveloppe qui préfixe chaque chemin absolu par le répertoire temporaire.
// Le scanner et les conversions Path -> URL (java-net) passent par node:fs : ils voient "/root", "/", "/link"...
// et produisent les mêmes noms et URL qu'avec Jimfs. Les liens symboliques absolus sont aussi redirigés.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const chroot = vi.hoisted(() => ({ root: null as string | null }))

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  const map = (p: unknown): unknown => (typeof p === 'string' && chroot.root !== null && p.startsWith('/') ? chroot.root + p : p)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrap1 = (fn: (...a: any[]) => unknown) => (p: unknown, ...rest: unknown[]) => fn(map(p), ...rest)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrap2 = (fn: (...a: any[]) => unknown) => (a: unknown, b: unknown, ...rest: unknown[]) => fn(map(a), map(b), ...rest)
  const wrapped = {
    ...fs,
    statSync: wrap1(fs.statSync),
    lstatSync: wrap1(fs.lstatSync),
    accessSync: wrap1(fs.accessSync),
    existsSync: wrap1(fs.existsSync),
    opendirSync: wrap1(fs.opendirSync),
    readdirSync: wrap1(fs.readdirSync),
    mkdirSync: wrap1(fs.mkdirSync),
    writeFileSync: wrap1(fs.writeFileSync),
    unlinkSync: wrap1(fs.unlinkSync),
    rmdirSync: wrap1(fs.rmdirSync),
    symlinkSync: wrap2(fs.symlinkSync),
    linkSync: wrap2(fs.linkSync),
    renameSync: wrap2(fs.renameSync),
    copyFileSync: wrap2(fs.copyFileSync),
  }
  return { ...wrapped, default: wrapped }
})

// PORT: le parcours (walkFileTree) utilise les API asynchrones de node:fs/promises : même redirection
vi.mock('node:fs/promises', async (importOriginal) => {
  const fsp = await importOriginal<typeof import('node:fs/promises')>()
  const map = (p: unknown): unknown => (typeof p === 'string' && chroot.root !== null && p.startsWith('/') ? chroot.root + p : p)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrap1 = (fn: (...a: any[]) => unknown) => (p: unknown, ...rest: unknown[]) => fn(map(p), ...rest)
  const wrapped = { ...fsp, stat: wrap1(fsp.stat), lstat: wrap1(fsp.lstat), opendir: wrap1(fsp.opendir), readdir: wrap1(fsp.readdir), access: wrap1(fsp.access) }
  return { ...wrapped, default: wrapped }
})

import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DirectoryNotFoundException } from '../../../src/domain/model/Exceptions.js'
import { FileSystemScanner } from '../../../src/domain/service/FileSystemScanner.js'
import { FilenameUtils } from '../../../src/port/commons-io.js'
import { pathResolve } from '../../../src/port/java-nio-file.js'
import { partition } from '../../../src/port/kotlin.js'

// PORT: FilenameUtils.removeExtension
function removeExtension(s: string): string {
  const name = FilenameUtils.getName(s)
  const i = name.lastIndexOf('.')
  return i < 0 ? s : s.slice(0, s.length - (name.length - i))
}

function sorted(a: readonly (string | undefined)[]): (string | undefined)[] {
  return [...a].sort()
}

// PORT: Jimfs.newFileSystem(Configuration.unix()).use { fs -> ... } : nouveau "système de fichiers" (répertoire temporaire)
function newFileSystem(): void {
  const real = mkdtempSync(join(tmpdir(), 'komga-jimfs-'))
  chroot.root = real
}

function closeFileSystem(): void {
  const real = chroot.root
  chroot.root = null
  if (real !== null) rmSync(real, { recursive: true, force: true })
}

// PORT: Files.createDirectory / Files.createFile / Files.createSymbolicLink sur le "système de fichiers" du test
function createDirectory(path: string): string {
  mkdirSync(path)
  return path
}

function createFile(path: string): string {
  writeFileSync(path, '', { flag: 'wx' })
  return path
}

function createSymbolicLink(link: string, target: string): string {
  symlinkSync(target, link)
  return link
}

describe('FileSystemScannerTest', () => {
  const scanner = new FileSystemScanner([], [])

  beforeEach(() => newFileSystem())
  afterEach(() => closeFileSystem())

  it('given unavailable root directory when scanning then throw exception', async () => {
    // given
    const root = '/root'

    // when
    let thrown: unknown = null
    try {
      await scanner.scanRootFolder(root)
    } catch (e) {
      thrown = e
    }

    // then
    expect(thrown).toBeInstanceOf(DirectoryNotFoundException)
  })

  it('given empty root directory when scanning then return empty list', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    // when
    const scan = (await scanner.scanRootFolder(root)).series

    // then
    expect(scan.size).toBe(0)
  })

  it('given root directory with only files when scanning then return 1 series containing those files as books', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    const files = ['file1.cbz', 'file2.cbz']
    files.forEach((it) => createFile(pathResolve(root, it)))

    // when
    const scan = (await scanner.scanRootFolder(root)).series
    const series = [...scan.keys()][0]!
    const books = scan.get(series)!

    // then
    expect(scan.size).toBe(1)
    expect(books).toHaveLength(2)
    expect(sorted(books.map((it) => it.name))).toEqual(sorted(files.map((it) => removeExtension(it))))
  })

  it('given root directory as filesystem root when scanning then return 1 series containing those files as books', async () => {
    // given
    const root = '/'

    const files = ['file1.cbz', 'file2.cbz']
    files.forEach((it) => createFile(pathResolve(root, it)))

    // when
    const scan = (await scanner.scanRootFolder(root)).series
    const series = [...scan.keys()][0]!
    const books = scan.get(series)!

    // then
    expect(scan.size).toBe(1)
    expect(series.name).toBe('/')
    expect(books).toHaveLength(2)
    expect(sorted(books.map((it) => it.name))).toEqual(sorted(files.map((it) => removeExtension(it))))
  })

  it('given directory with unsupported files when scanning then return a series excluding those files as books', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    const files = ['file1.cbz', 'file2.txt', 'file3']
    files.forEach((it) => createFile(pathResolve(root, it)))

    // when
    const scan = (await scanner.scanRootFolder(root)).series
    const series = [...scan.keys()][0]!
    const books = scan.get(series)!

    // then
    expect(scan.size).toBe(1)
    expect(books).toHaveLength(1)
    expect(books.map((it) => it.name)).toEqual(['file1'])
  })

  // @ParameterizedTest @MethodSource("libraryScanFileTypesArguments")
  it.each(libraryScanFileTypesArguments())(
    'given directory when scanning excluding some files then return a series excluding those files as books',
    async (sourceFiles, scanCbz, scanPdf, scanEpub, resultBookNames) => {
      // given
      const root = '/root'
      createDirectory(root)

      sourceFiles.forEach((it) => createFile(pathResolve(root, it)))

      // when
      const scan = (await scanner.scanRootFolder(root, { scanCbx: scanCbz, scanPdf: scanPdf, scanEpub: scanEpub })).series

      // then
      if (resultBookNames.length > 0) {
        expect(scan.size).toBe(1)
        const books = scan.get([...scan.keys()][0]!)!
        expect(books).toHaveLength(resultBookNames.length)
        expect(sorted(books.map((it) => it.name))).toEqual(sorted(resultBookNames))
      } else {
        expect(scan.size).toBe(0)
      }
    },
  )

  function libraryScanFileTypesArguments(): [string[], boolean, boolean, boolean, string[]][] {
    const sourceFiles = ['cbz.cbz', 'cbr.cbr', 'zip.zip', 'rar.rar', 'pdf.pdf', 'epub.epub']
    return [
      [sourceFiles, true, true, true, ['cbz', 'cbr', 'zip', 'rar', 'pdf', 'epub']],
      [sourceFiles, false, true, true, ['pdf', 'epub']],
      [sourceFiles, true, false, true, ['cbz', 'cbr', 'zip', 'rar', 'epub']],
      [sourceFiles, true, true, false, ['cbz', 'cbr', 'zip', 'rar', 'pdf']],
      [sourceFiles, false, false, true, ['epub']],
      [sourceFiles, true, false, false, ['cbz', 'cbr', 'zip', 'rar']],
      [sourceFiles, false, true, false, ['pdf']],
      [sourceFiles, false, false, false, []],
    ]
  }

  it('given directory with sub-directories containing files when scanning then return 1 series per folder containing direct files as books', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    const subDirs = new Map([
      ['series1', ['volume1.cbz', 'volume2.cbz']],
      ['series2', ['book1.cbz', 'book2.cbz']],
    ])

    subDirs.forEach((files, dir) => {
      makeSubDir(root, dir, files)
    })

    // when
    const scan = (await scanner.scanRootFolder(root)).series
    const series = [...scan.keys()]

    // then
    expect(scan.size).toBe(2)

    expect(sorted(series.map((it) => it.name))).toEqual(sorted([...subDirs.keys()]))
    series.forEach((s) => {
      expect(sorted(scan.get(s)!.map((it) => it.name))).toEqual(sorted(subDirs.get(s.name)!.map((it) => removeExtension(it))))
    })
  })

  it('given symlink root directory when scanning then return series and books', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    const link = '/link'
    createSymbolicLink(link, root)

    const subDirs = new Map([
      ['series1', ['volume1.cbz', 'volume2.cbz']],
      ['series2', ['book1.cbz', 'book2.cbz']],
    ])

    subDirs.forEach((files, dir) => {
      makeSubDir(root, dir, files)
    })

    // when
    const scan = (await scanner.scanRootFolder(link)).series
    const series = [...scan.keys()]

    // then
    expect(scan.size).toBe(2)

    expect(sorted(series.map((it) => it.name))).toEqual(sorted([...subDirs.keys()]))
    series.forEach((s) => {
      expect(sorted(scan.get(s)!.map((it) => it.name))).toEqual(sorted(subDirs.get(s.name)!.map((it) => removeExtension(it))))
    })
  })

  it('given root directory with symlinks when scanning then return series and books', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    const subDirs = new Map([
      ['series1', ['volume1.cbz', 'volume2.cbz']],
      ['series2', ['book1.cbz', 'book2.cbz']],
    ])

    subDirs.forEach((files, dir) => {
      makeSubDir(root, dir, files)
      createSymbolicLink(pathResolve(root, `${dir}_link`), pathResolve(root, dir))
    })

    // when
    const scan = (await scanner.scanRootFolder(root)).series
    const series = [...scan.keys()]

    // then
    expect(scan.size).toBe(4)

    expect(sorted(series.map((it) => it.name))).toEqual(sorted([...subDirs.keys(), ...[...subDirs.keys()].map((it) => `${it}_link`)]))
    series.forEach((s) => {
      expect(sorted(scan.get(s)!.map((it) => it.name))).toEqual(
        sorted(subDirs.get(s.name.endsWith('_link') ? s.name.slice(0, -'_link'.length) : s.name)!.map((it) => removeExtension(it))),
      )
    })
  })

  it('given directory structure with excluded directories when scanning then excluded directories are not returned', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    const dir1 = makeSubDir(root, 'dir1', ['comic.cbz'])
    makeSubDir(dir1, 'subdir1', ['comic2.cbz'])
    const recycle = makeSubDir(root, '#recycle', ['trash.cbz'])
    makeSubDir(recycle, 'subtrash', ['trash2.cbz'])

    // when
    const scan = (await scanner.scanRootFolder(root, { directoryExclusions: new Set(['#recycle']) })).series

    // then
    expect(scan.size).toBe(2)

    expect(sorted([...scan.keys()].map((it) => it.name))).toEqual(sorted(['dir1', 'subdir1']))
    expect(sorted([...scan.values()].flatMap((list) => list.map((it) => it.name)))).toEqual(sorted(['comic', 'comic2']))
  })

  it('given directory structure with hidden directories when scanning then hidden directories are not returned', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    const dir1 = makeSubDir(root, 'dir1', ['comic.cbz'])
    makeSubDir(dir1, 'subdir1', ['comic2.cbz'])
    const hidden = makeSubDir(root, '.hidden', ['hidden.cbz'])
    makeSubDir(hidden, 'subhidden', ['hidden2.cbz'])

    // when
    const scan = (await scanner.scanRootFolder(root)).series

    // then
    expect(scan.size).toBe(2)

    expect(sorted([...scan.keys()].map((it) => it.name))).toEqual(sorted(['dir1', 'subdir1']))
    expect(sorted([...scan.values()].flatMap((list) => list.map((it) => it.name)))).toEqual(sorted(['comic', 'comic2']))
  })

  it('given directory structure with hidden files when scanning then hidden files are not returned', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    const dir1 = makeSubDir(root, 'dir1', ['comic.cbz'])
    makeSubDir(dir1, 'subdir1', ['comic2.cbz', '.comic2.cbz'])

    // when
    const scan = (await scanner.scanRootFolder(root)).series

    // then
    expect(scan.size).toBe(2)

    expect(sorted([...scan.keys()].map((it) => it.name))).toEqual(sorted(['dir1', 'subdir1']))
    expect(sorted([...scan.values()].flatMap((list) => list.map((it) => it.name)))).toEqual(sorted(['comic', 'comic2']))
  })

  it('given file with mixed-case extension when scanning then files are returned', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    makeSubDir(root, 'dir1', ['comic.Cbz', 'comic2.CBR'])

    // when
    const scan = (await scanner.scanRootFolder(root)).series

    // then
    expect(scan.size).toBe(1)

    expect(sorted([...scan.keys()].map((it) => it.name))).toEqual(sorted(['dir1']))
    expect(sorted([...scan.values()].flatMap((list) => list.map((it) => it.name)))).toEqual(sorted(['comic', 'comic2']))
  })

  it('given oneshot directory when scanning then return a series per file', async () => {
    // given
    const root = '/root'
    createDirectory(root)

    const normal = makeSubDir(root, 'normal', ['comic.cbz'])
    makeSubDir(normal, '_oneshots', ['single4.cbz', 'single5.cbz'])
    makeSubDir(root, '_oneshots', ['single.cbz', 'single2.cbz', 'single3.cbz'])

    // when
    const scan = (await scanner.scanRootFolder(root, { oneshotsDir: '_oneshots' })).series

    // then
    expect(scan.size).toBe(6)
    const names = [...scan.keys()].map((it) => it.name)
    expect(sorted(names)).toEqual(sorted(['normal', 'single', 'single2', 'single3', 'single4', 'single5']))
    expect(names).not.toContain('_oneshots')
    const [oneshots, regular] = partition([...scan.keys()], (it) => it.name.startsWith('single'))
    expect(new Set(oneshots.map((it) => it.oneshot))).toEqual(new Set([true]))
    expect(new Set(oneshots.flatMap((it) => scan.get(it) ?? []).map((it) => it.oneshot))).toEqual(new Set([true]))
    expect(new Set(regular.map((it) => it.oneshot))).toEqual(new Set([false]))
    expect(new Set(regular.flatMap((it) => scan.get(it) ?? []).map((it) => it.oneshot))).toEqual(new Set([false]))

    scan.forEach((books) => {
      expect(books).toHaveLength(1)
    })
  })

  function makeSubDir(root: string, name: string, files: string[]): string {
    const dir = pathResolve(root, name)
    createDirectory(dir)
    files.forEach((it) => createFile(pathResolve(root, pathResolve(name, it))))
    return dir
  }
})
