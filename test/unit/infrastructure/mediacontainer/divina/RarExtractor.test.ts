// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/divina/RarExtractorOracleTest.kt
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageAnalyzer } from '../../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ContentDetector } from '../../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { RarExtractor } from '../../../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import { TikaConfig } from '../../../../../src/port/tika.js'
import { exceptionType, oracle, tempDir } from '../../../oracle.js'
import { digest, fixture, komgaRes, pathless } from '../samples.js'

const { func, kase } = oracle('infrastructure/mediacontainer/divina/RarExtractor')

const extractor = new RarExtractor(new ContentDetector(new TikaConfig()), new ImageAnalyzer())

const komgaArchives = ['rar4.rar', 'rar4-solid.rar', 'rar4-encrypted.rar', 'rar5.rar', 'rar5-solid.rar', 'rar5-encrypted.rar', 'zip.zip', '7zip.7z']

const fixtures = ['not-a-rar.rar', 'r4-badcrc.rar', 'r4-bad-file-crc.rar', 'r4-bad-main-crc.rar', 'r4-dirs.rar', 'r4-dups.rar', 'r4-empty-entry.rar', 'r4-encfile.rar', 'r4-future-version.rar', 'r4-latin1name.rar', 'r4-marker-only.rar', 'r4-multivolume.rar', 'r4-truncated-data.rar', 'r4-truncated-header.rar', 'r4-unix-slash.rar', 'r4-utf8name.rar', 'r5-solid-truncated.rar', 'r5-truncated.rar', 'r5-truncated-tail.rar', 'rar4-encrypted.rar', 'rar4.rar', 'rar4-solid.rar', 'rar5-encrypted.rar', 'rar5.rar', 'rar5-solid.rar']

const getEntryStreams = (path: string) =>
  pathless(path, async () => {
    const names = [...(await extractor.getEntries(path, false)).map((it) => it.name), 'missing.png', '']
    const out: unknown[] = []
    for (const name of names) out.push([name, await pathless(path, async () => digest(await extractor.getEntryStream(path, name)))])
    return out
  })

func('mediaTypes', () => {
  kase('rar', () => extractor.mediaTypes())
})

func('getEntries', () => {
  for (const a of komgaArchives) {
    for (const analyze of [true, false]) {
      kase(`${a} (analyze ${analyze})`, () => {
        const p = komgaRes(`archives/${a}`)
        return pathless(p, () => extractor.getEntries(p, analyze))
      })
    }
  }
  for (const f of fixtures) {
    for (const analyze of [true, false]) {
      kase(`fixture ${f} (analyze ${analyze})`, () => {
        const p = fixture(`rar/${f}`)
        return pathless(p, () => extractor.getEntries(p, analyze))
      })
    }
  }
  kase('empty file', () => {
    const p = join(tempDir(), 'empty.cbr')
    writeFileSync(p, new Uint8Array(0))
    return pathless(p, () => extractor.getEntries(p, false))
  })
  kase('text file', () => {
    const p = join(tempDir(), 'text.cbr')
    writeFileSync(p, 'hello')
    return pathless(p, () => extractor.getEntries(p, false))
  })
  kase('missing file', () => exceptionType(() => extractor.getEntries(join(tempDir(), 'missing.cbr'), false)))
})

func('getEntryStream', () => {
  for (const a of komgaArchives) kase(a, () => getEntryStreams(komgaRes(`archives/${a}`)))
  for (const f of fixtures) kase(`fixture ${f}`, () => getEntryStreams(fixture(`rar/${f}`)))
  kase('rar4 entry names', async () => {
    const p = komgaRes('archives/rar4.rar')
    const out: unknown[] = []
    for (const it of ['komga.png', 'KOMGA.PNG', '/komga.png', 'komga']) out.push([it, await pathless(p, async () => digest(await extractor.getEntryStream(p, it)))])
    return out
  })
  kase('missing file', () => exceptionType(() => extractor.getEntryStream(join(tempDir(), 'missing.cbr'), 'a')))
})
