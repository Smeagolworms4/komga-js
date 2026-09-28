// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/epub/EpubExtractorOracleTest.kt
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LocalDateTime } from '@js-joda/core'
import { Book } from '../../../../../src/domain/model/Book.js'
import type { TypedBytes } from '../../../../../src/domain/model/TypedBytes.js'
import { ImageAnalyzer } from '../../../../../src/infrastructure/image/ImageAnalyzer.js'
import type { KepubConverter } from '../../../../../src/infrastructure/kobo/KepubConverter.js'
import { ContentDetector } from '../../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { type EpubPackage, epub } from '../../../../../src/infrastructure/mediacontainer/epub/Epub.js'
import { EpubExtractor } from '../../../../../src/infrastructure/mediacontainer/epub/EpubExtractor.js'
import { URL } from '../../../../../src/port/java-net.js'
import { TikaConfig } from '../../../../../src/port/tika.js'
import { oracle, tempDir } from '../../../oracle.js'
import { digest, epubFiles, fixture, pathless, writeEpub } from '../samples.js'

const { func, kase } = oracle('infrastructure/mediacontainer/epub/EpubExtractor')

const contentDetector = new ContentDetector(new TikaConfig())
const imageAnalyzer = new ImageAnalyzer()
const unavailable = { isAvailable: false } as unknown as KepubConverter
const extractor = new EpubExtractor(contentDetector, imageAnalyzer, unavailable, 15)
const book = new Book({
  name: 'book',
  url: new URL('file:/komga/book.epub'),
  fileLastModified: LocalDateTime.of(2020, 1, 1, 0, 0),
  id: 'BOOK',
  createdDate: LocalDateTime.of(2020, 1, 1, 0, 0),
})

const cover = (tb: TypedBytes | null) => (tb !== null ? [tb.mediaType, digest(tb.bytes)] : null)

const withEpub = <R>(p: string, block: (epub: EpubPackage) => R) => pathless(p, () => epub(p, block))

const dir = join(tempDir(), 'synthetic')
mkdirSync(dir, { recursive: true })
const files = epubFiles(dir)
const kepubSource = join(tempDir(), 'kepub-source')
mkdirSync(kepubSource, { recursive: true })
const kepubFile = writeEpub(kepubSource, 'kepub')
let copies = 0
const failing = { isAvailable: true, convertEpubToKepubWithoutChecks: () => null } as unknown as KepubConverter
const converting = {
  isAvailable: true,
  convertEpubToKepubWithoutChecks: () => {
    const target = join(tempDir(), `converted-${copies++}.kepub.epub`)
    copyFileSync(kepubFile, target)
    return target
  },
} as unknown as KepubConverter

func('getEntryStream', () => {
  for (const [label, p] of files) {
    kase(label, async () => {
      const out: unknown[] = []
      for (const it of ['mimetype', 'META-INF/container.xml', 'missing', '']) out.push([it, await pathless(p, () => digest(extractor.getEntryStream(p, it)))])
      return out
    })
  }
})

func('isEpub', () => {
  for (const [label, p] of files) kase(label, () => extractor.isEpub(p))
  kase('text file', () => {
    const p = join(tempDir(), 'text.epub')
    writeFileSync(p, 'hello')
    return extractor.isEpub(p)
  })
  kase('missing file', () => extractor.isEpub(join(tempDir(), 'missing.epub')))
})

func('getCover', () => {
  for (const [label, p] of files) kase(label, () => pathless(p, () => cover(extractor.getCover(p))))
})

func('getResources', () => {
  for (const [label, p] of files) kase(label, () => withEpub(p, (it) => extractor.getResources(it)))
})

func('getDivinaPages', () => {
  for (const [label, p] of files) {
    for (const analyze of [true, false]) kase(`${label} (analyze ${analyze})`, () => withEpub(p, (it) => extractor.getDivinaPages(it, analyze)))
  }
  kase('letter count threshold 0', () => withEpub(writeEpub(dir, 'divina'), (it) => new EpubExtractor(contentDetector, imageAnalyzer, unavailable, 0).getDivinaPages(it, false)))
  kase('letter count threshold 1000', () =>
    withEpub(writeEpub(dir, 'divina with text'), (it) => new EpubExtractor(contentDetector, imageAnalyzer, unavailable, 1000).getDivinaPages(it, false)),
  )
})

func('isKepub', () => {
  for (const [label, p] of files) kase(label, () => withEpub(p, (it) => extractor.isKepub(it, extractor.getResources(it))))
})

func('computePageCount', () => {
  for (const [label, p] of files) kase(label, () => withEpub(p, (it) => extractor.computePageCount(it)))
})

func('isFixedLayout', () => {
  for (const [label, p] of files) kase(label, () => withEpub(p, (it) => extractor.isFixedLayout(it)))
})

func('computePositions', () => {
  for (const [label, p] of files) {
    kase(label, () =>
      withEpub(p, (it) => {
        const resources = extractor.getResources(it)
        return extractor.computePositions(it, book, resources, extractor.isFixedLayout(it), extractor.isKepub(it, resources))
      }),
    )
    kase(`${label}, fixed layout`, () => withEpub(p, (it) => extractor.computePositions(it, book, extractor.getResources(it), true, false)))
    kase(`${label}, failing kepub conversion`, () =>
      withEpub(p, (it) => new EpubExtractor(contentDetector, imageAnalyzer, failing, 15).computePositions(it, book, extractor.getResources(it), false, false)),
    )
  }
  for (const name of ['epub3', 'kepub', 'fixture reflow.epub']) {
    const p = name.startsWith('fixture') ? fixture('epub/reflow.epub') : writeEpub(dir, name)
    kase(`${name}, kepub conversion`, () =>
      withEpub(p, (it) => new EpubExtractor(contentDetector, imageAnalyzer, converting, 15).computePositions(it, book, extractor.getResources(it), false, false)),
    )
  }
})

// privée : appelée par computePositions pour un KEPUB
func('computePositionsFromKoboSpan', () => {
  for (const [label, p] of files) kase(label, () => withEpub(p, (it) => extractor.computePositions(it, book, extractor.getResources(it), false, true)))
})

func('getToc', () => {
  for (const [label, p] of files) kase(label, () => withEpub(p, (it) => extractor.getToc(it)))
})

func('getPageList', () => {
  for (const [label, p] of files) kase(label, () => withEpub(p, (it) => extractor.getPageList(it)))
})

func('getLandmarks', () => {
  for (const [label, p] of files) kase(label, () => withEpub(p, (it) => extractor.getLandmarks(it)))
})
