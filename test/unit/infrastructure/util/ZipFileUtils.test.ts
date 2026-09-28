// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/util/ZipFileUtilsOracleTest.kt
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32 } from 'node:zlib'
import { getEntryBytes, getEntryInputStream, getZipEntryBytes, use } from '../../../../src/infrastructure/util/ZipFileUtils.js'
import { ZipFile } from '../../../../src/port/commons-compress.js'
import { use as useCloseable } from '../../../../src/port/java-io.js'
import { IllegalStateException } from '../../../../src/port/kotlin.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/util/ZipFileUtils')

const resources = 'test/resources/archives'

type Entry = { rawName: string; data: Uint8Array; localUnicode?: string; centralUnicode?: string; utf8?: boolean }

/** Zip « stored » écrit octet par octet (même écriture que le test Kotlin), avec champs extra Unicode Path facultatifs */
function zip(...entries: Entry[]): Uint8Array {
  const out: number[] = []
  const central: number[] = []
  const u16 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (a: number[], v: number) => {
    u16(a, v & 0xffff)
    u16(a, (v >>> 16) & 0xffff)
  }
  const crc = (b: Uint8Array) => crc32(b) >>> 0
  const unicodeExtra = (raw: Uint8Array, name: string | undefined): number[] => {
    if (name === undefined) return []
    const utf = Buffer.from(name, 'utf8')
    const a: number[] = []
    u16(a, 0x7075)
    u16(a, 5 + utf.length)
    a.push(1)
    u32(a, crc(raw))
    a.push(...utf)
    return a
  }
  for (const e of entries) {
    const raw = new Uint8Array(Buffer.from(e.rawName, 'utf8'))
    const flags = e.utf8 ? 0x800 : 0
    const offset = out.length
    const localExtra = unicodeExtra(raw, e.localUnicode)
    u32(out, 0x04034b50)
    for (const v of [10, flags, 0, 0, 0x21]) u16(out, v)
    u32(out, crc(e.data))
    u32(out, e.data.length)
    u32(out, e.data.length)
    u16(out, raw.length)
    u16(out, localExtra.length)
    out.push(...raw, ...localExtra, ...e.data)
    const centralExtra = unicodeExtra(raw, e.centralUnicode)
    u32(central, 0x02014b50)
    for (const v of [20, 10, flags, 0, 0, 0x21]) u16(central, v)
    u32(central, crc(e.data))
    u32(central, e.data.length)
    u32(central, e.data.length)
    u16(central, raw.length)
    u16(central, centralExtra.length)
    for (const v of [0, 0, 0]) u16(central, v)
    u32(central, 0)
    u32(central, offset)
    central.push(...raw, ...centralExtra)
  }
  const cdOffset = out.length
  out.push(...central)
  u32(out, 0x06054b50)
  for (const v of [0, 0, entries.length, entries.length]) u16(out, v)
  u32(out, central.length)
  u32(out, cdOffset)
  u16(out, 0)
  return new Uint8Array(out)
}

function file(name: string, bytes: Uint8Array): string {
  const p = join(tempDir(), name)
  writeFileSync(p, bytes)
  return p
}

const text = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'))
const readAll = (s: { readBytes(): Uint8Array; close(): void } | null) => (s === null ? null : useCloseable(s, (it) => it.readBytes()))

const simple = file(
  'simple.zip',
  zip(
    { rawName: 'a.txt', data: text('hello') },
    { rawName: 'dir/b.bin', data: oracleBytes(300) },
    { rawName: 'empty', data: new Uint8Array(0) },
    { rawName: 'été.txt', data: text('utf8'), utf8: true },
    { rawName: 'dir/', data: new Uint8Array(0) },
  ),
)
const unicodeLocal = file('unicode-local.zip', zip({ rawName: 'a_.txt', data: text('local'), localUnicode: 'aé.txt' }))
const unicodeCentral = file('unicode-central.zip', zip({ rawName: 'b_.txt', data: text('central'), centralUnicode: 'bü.txt' }))
const duplicate = file('duplicate.zip', zip({ rawName: 'x', data: text('first') }, { rawName: 'x', data: text('second') }))
const notZip = file('not-a-zip.zip', oracleBytes(100))
const emptyFile = file('empty.zip', new Uint8Array(0))

func('use', () => {
  kase('entry names', () => use(ZipFile.builder().setPath(simple), (zip) => zip.getEntries().map((it) => it.name)))
  kase('result of block', () => use(ZipFile.builder().setPath(simple), () => 42))
  kase('exception in block', () =>
    use(ZipFile.builder().setPath(simple), () => {
      throw new IllegalStateException('inside')
    }),
  )
  kase('missing file', () => exceptionType(() => use(ZipFile.builder().setPath(join(tempDir(), 'missing.zip')), (it) => it.getEntries().length)))
  kase('not a zip', () => exceptionType(() => use(ZipFile.builder().setPath(notZip), (it) => it.getEntries().length)))
  kase('empty file', () => exceptionType(() => use(ZipFile.builder().setPath(emptyFile), (it) => it.getEntries().length)))
  kase('unicode extra field in central directory', () =>
    use(ZipFile.builder().setPath(unicodeCentral).setUseUnicodeExtraFields(true), (zip) => zip.getEntries().map((it) => it.name)),
  )
  kase('unicode extra field ignored', () =>
    use(ZipFile.builder().setPath(unicodeCentral).setUseUnicodeExtraFields(false), (zip) => zip.getEntries().map((it) => it.name)),
  )
})

func('getEntryInputStream', () => {
  kase('existing', () => use(ZipFile.builder().setPath(simple), (zip) => readAll(getEntryInputStream(zip, 'a.txt'))))
  kase('in directory', () => use(ZipFile.builder().setPath(simple), (zip) => readAll(getEntryInputStream(zip, 'dir/b.bin'))?.length ?? null))
  kase('missing', () => use(ZipFile.builder().setPath(simple), (zip) => getEntryInputStream(zip, 'nope')))
  kase('case sensitive', () => use(ZipFile.builder().setPath(simple), (zip) => getEntryInputStream(zip, 'A.TXT')))
  kase('empty name', () => use(ZipFile.builder().setPath(simple), (zip) => getEntryInputStream(zip, '')))
  kase('directory entry', () => use(ZipFile.builder().setPath(simple), (zip) => readAll(getEntryInputStream(zip, 'dir/'))))
  kase('directory without slash', () => use(ZipFile.builder().setPath(simple), (zip) => getEntryInputStream(zip, 'dir')))
  kase('duplicate name', () => use(ZipFile.builder().setPath(duplicate), (zip) => readAll(getEntryInputStream(zip, 'x'))))
})

func('getEntryBytes', () => {
  kase('existing', () => use(ZipFile.builder().setPath(simple), (it) => getEntryBytes(it, 'a.txt')))
  kase('empty entry', () => use(ZipFile.builder().setPath(simple), (it) => getEntryBytes(it, 'empty')))
  kase('utf8 name', () => use(ZipFile.builder().setPath(simple), (it) => getEntryBytes(it, 'été.txt')))
  kase('missing', () => use(ZipFile.builder().setPath(simple), (it) => getEntryBytes(it, 'b.bin')))
  kase('resource png size', () => use(ZipFile.builder().setPath(join(resources, 'zip.zip')), (it) => getEntryBytes(it, 'komga.png')?.length ?? null))
  kase('encrypted', () => exceptionType(() => use(ZipFile.builder().setPath(join(resources, 'zip-encrypted.zip')), (it) => getEntryBytes(it, 'komga.png'))))
})

func('getZipEntryBytes', () => {
  kase('fast path', () => getZipEntryBytes(simple, 'a.txt'))
  kase('fast path, binary', () => getZipEntryBytes(simple, 'dir/b.bin'))
  kase('empty entry', () => getZipEntryBytes(simple, 'empty'))
  kase('utf8 flag name', () => getZipEntryBytes(simple, 'été.txt'))
  kase('slow path, unicode name in local header', () => getZipEntryBytes(unicodeLocal, 'aé.txt'))
  kase('raw name, unicode in local header', () => getZipEntryBytes(unicodeLocal, 'a_.txt'))
  kase('unicode name in central directory', () => getZipEntryBytes(unicodeCentral, 'bü.txt'))
  kase('raw name, unicode in central directory', () => getZipEntryBytes(unicodeCentral, 'b_.txt'))
  kase('missing entry', () => getZipEntryBytes(simple, 'nope.txt'))
  kase('missing entry, unicode', () => getZipEntryBytes(simple, '漫画.png'))
  kase('duplicate name', () => getZipEntryBytes(duplicate, 'x'))
  kase('missing file', () => exceptionType(() => getZipEntryBytes(join(tempDir(), 'missing.zip'), 'a.txt')))
  kase('not a zip', () => exceptionType(() => getZipEntryBytes(notZip, 'a.txt')))
  kase('resource zip', () => getZipEntryBytes(join(resources, 'zip.zip'), 'komga.png').length)
  kase('resource copy', () => Buffer.from(getZipEntryBytes(join(resources, 'zip-copy.zip'), 'komga.png')).equals(getZipEntryBytes(join(resources, 'zip.zip'), 'komga.png')))
  kase('resource bzip2', () => getZipEntryBytes(join(resources, 'zip-bzip2.zip'), 'komga.png').length)
  kase('resource deflate64', () => getZipEntryBytes(join(resources, 'zip-deflate64.zip'), 'komga.png').length)
  kase('resource encrypted', () => exceptionType(() => getZipEntryBytes(join(resources, 'zip-encrypted.zip'), 'komga.png')))
  kase('resource lzma', () => exceptionType(() => getZipEntryBytes(join(resources, 'zip-lzma.zip'), 'komga.png')))
  kase('resource ppmd', () => exceptionType(() => getZipEntryBytes(join(resources, 'zip-ppmd.zip'), 'komga.png')))
})

func('getEntryBytesClosing', () => {
  kase('found in central directory', () => getZipEntryBytes(unicodeCentral, 'bü.txt').length)
  kase('not found in either', () => exceptionType(() => getZipEntryBytes(unicodeLocal, 'zzz')))
})
