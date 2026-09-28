// Oracle (sans jumeau Kotlin) : XmlMapper, ComicInfoProvider et ReadListProvider comparés aux vraies classes de Komga.
// fixtures/xml-cases.json (généré par fixtures/gen-xml.mjs : ComicInfo.xml et listes .cbl, documents réels et cas limites :
// nombres invalides, casse, espaces de noms, xsi:nil, contenu mixte, entités, encodages, XML mal formé...)
// a été passé dans Komga par fixtures/xml-oracle.jsh (tools/jshell-komga.sh) -> fixtures/xml-oracle.json.
import { readFileSync } from 'node:fs'
import { LocalDateTime } from '@js-joda/core'
import { describe, expect, it, vi } from 'vitest'
import type { BookMetadataPatch } from '../../../../src/domain/model/BookMetadataPatch.js'
import type { SeriesMetadataPatch } from '../../../../src/domain/model/SeriesMetadataPatch.js'

vi.mock('../../../../src/domain/service/BookAnalyzer.js', () => ({ BookAnalyzer: class BookAnalyzer {} }))

const { ComicInfoProvider } = await import('../../../../src/infrastructure/metadata/comicrack/ComicInfoProvider.js')
const { ReadListProvider } = await import('../../../../src/infrastructure/metadata/comicrack/ReadListProvider.js')
const { ComicInfo } = await import('../../../../src/infrastructure/metadata/comicrack/dto/ComicInfo.js')
const { ReadingList } = await import('../../../../src/infrastructure/metadata/comicrack/dto/ReadingList.js')
const { XmlMapper } = await import('../../../../src/port/jackson-xml.js')
const { ISBNValidator } = await import('../../../../src/port/commons-validator.js')
const { ComicRackListException } = await import('../../../../src/domain/model/Exceptions.js')
const { BookWithMedia } = await import('../../../../src/domain/model/BookWithMedia.js')
const { Media } = await import('../../../../src/domain/model/Media.js')
const { MediaFile } = await import('../../../../src/domain/model/MediaFile.js')
const { KEnum } = await import('../../../../src/port/kotlin.js')
const { javaFloatToString } = await import('../../../../src/port/jackson-mapper.js')
const { makeBook } = await import('../../../domain/model/Utils.js')

type Case = { id: number; cls: 'ComicInfo' | 'ReadingList'; b64: string }
const cases = JSON.parse(readFileSync(new URL('../fixtures/xml-cases.json', import.meta.url), 'utf8')) as Case[]
const oracle = JSON.parse(readFileSync(new URL('../fixtures/xml-oracle.json', import.meta.url), 'utf8')) as Record<string, unknown>[]

const EXC = 'EXC'

function dumpFields(o: unknown): unknown {
  if (o === null) return null
  const m: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o as object)) {
    if (v instanceof KEnum) m[k] = v.name
    else if (Array.isArray(v)) m[k] = v.map(dumpFields)
    else m[k] = v
  }
  return m
}

function dumpBookPatch(p: BookMetadataPatch | null): unknown {
  if (p === null) return null
  return {
    title: p.title,
    summary: p.summary,
    number: p.number,
    numberSort: p.numberSort === null ? null : javaFloatToString(p.numberSort),
    releaseDate: p.releaseDate === null ? null : p.releaseDate.toString(),
    authors: p.authors === null ? null : p.authors.map((a) => [a.name, a.role]),
    isbn: p.isbn,
    links: p.links === null ? null : p.links.map((l) => [l.label, l.url.toString()]),
    tags: p.tags === null ? null : [...p.tags],
    readLists: p.readLists.map((r) => [r.name, r.number]),
  }
}

function dumpSeriesPatch(p: SeriesMetadataPatch | null): unknown {
  if (p === null) return null
  return {
    title: p.title,
    titleSort: p.titleSort,
    status: p.status?.name ?? null,
    summary: p.summary,
    readingDirection: p.readingDirection?.name ?? null,
    publisher: p.publisher,
    ageRating: p.ageRating,
    language: p.language,
    genres: p.genres === null ? null : [...p.genres],
    totalBookCount: p.totalBookCount,
    collections: [...p.collections],
  }
}

function normalizeOracle(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === 'string' && v.startsWith('EXC:') ? EXC : v
  return out
}

describe('XmlOracle', () => {
  let current = new Uint8Array(0)
  const analyzer = { getFileContent: () => current }
  const book = makeBook('book', { fileLastModified: LocalDateTime.now(), id: 'id' })
  const media = new Media({ status: Media.Status.READY, mediaType: 'application/zip', files: [new MediaFile({ fileName: 'ComicInfo.xml' })] })
  const bwm = new BookWithMedia({ book, media })
  const ci = new ComicInfoProvider(new XmlMapper(), analyzer as never, new ISBNValidator(true))
  const rl = new ReadListProvider(new XmlMapper())

  it('matches Komga on every fixture', () => {
    const mismatches: unknown[] = []
    for (const c of cases) {
      const bytes = new Uint8Array(Buffer.from(c.b64, 'base64'))
      const r: Record<string, unknown> = { id: c.id }
      if (c.cls === 'ComicInfo') {
        try {
          r.dto = dumpFields(new XmlMapper().readValue(bytes, { class: ComicInfo }))
        } catch {
          r.dto = EXC
        }
        current = bytes
        try {
          r.book = dumpBookPatch(ci.getBookMetadataFromBook(bwm))
        } catch {
          r.book = EXC
        }
        try {
          r.series = dumpSeriesPatch(ci.getSeriesMetadataFromBook(bwm, true))
        } catch {
          r.series = EXC
        }
        try {
          r.seriesNoAppend = dumpSeriesPatch(ci.getSeriesMetadataFromBook(bwm, false))
        } catch {
          r.seriesNoAppend = EXC
        }
      } else {
        try {
          r.dto = dumpFields(new XmlMapper().readValue(bytes, { class: ReadingList }))
        } catch {
          r.dto = EXC
        }
        try {
          const req = rl.importFromCbl(bytes)
          r.request = { name: req.name, books: req.books.map((b) => [[...b.series], b.number]) }
        } catch (e) {
          r.request = e instanceof ComicRackListException ? `ERR:${e.code}` : EXC
        }
      }
      const expected = normalizeOracle(oracle[c.id] as Record<string, unknown>)
      if (JSON.stringify(r) !== JSON.stringify(expected))
        mismatches.push({ id: c.id, xml: bytes.length < 400 ? Buffer.from(bytes).toString('utf8') : '(long)', actual: r, expected })
    }
    expect(mismatches).toEqual([])
    expect(cases.length).toBe(oracle.length)
  })
})
