// Oracle (sans jumeau Kotlin) : EpubMetadataProvider (analyse OPF par jsoup, sélecteurs, text(), Jsoup.clean, dates,
// ISBN, rôles) comparé à la vraie classe de Komga. fixtures/epub-cases.json (fixtures/gen-epub.mjs : OPF de
// test/resources/epub et cas limites : entités HTML en XML, & et < bruts, CDATA, casse des balises et attributs,
// balises non fermées, descriptions HTML échappées, dates, identifiants, séries, langues, sens de lecture) a été
// empaqueté en EPUB et passé dans Komga par fixtures/epub-oracle.jsh (tools/jshell-komga.sh) -> fixtures/epub-oracle.json.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { BookMetadataPatch } from '../../../../src/domain/model/BookMetadataPatch.js'
import type { SeriesMetadataPatch } from '../../../../src/domain/model/SeriesMetadataPatch.js'

let current = ''
vi.mock('../../../../src/infrastructure/mediacontainer/epub/Epub.js', () => ({ getPackageFileContent: () => current }))

const { EpubMetadataProvider } = await import('../../../../src/infrastructure/metadata/epub/EpubMetadataProvider.js')
const { ISBNValidator } = await import('../../../../src/port/commons-validator.js')
const { BookWithMedia } = await import('../../../../src/domain/model/BookWithMedia.js')
const { Media } = await import('../../../../src/domain/model/Media.js')
const { javaFloatToString } = await import('../../../../src/port/jackson-mapper.js')
const { makeBook } = await import('../../../domain/model/Utils.js')

const cases = JSON.parse(readFileSync(new URL('../fixtures/epub-cases.json', import.meta.url), 'utf8')) as string[]
const oracle = JSON.parse(readFileSync(new URL('../fixtures/epub-oracle.json', import.meta.url), 'utf8')) as { book: unknown; series: unknown }[]

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

describe('EpubOracle', () => {
  it('matches Komga on every fixture', () => {
    const provider = new EpubMetadataProvider(new ISBNValidator(true))
    const book = new BookWithMedia({ book: makeBook('book'), media: new Media({ status: Media.Status.READY, mediaType: 'application/epub+zip' }) })
    const mismatches: unknown[] = []
    cases.forEach((opf, i) => {
      current = opf
      const r: Record<string, unknown> = {}
      try {
        r.book = dumpBookPatch(provider.getBookMetadataFromBook(book))
      } catch (e) {
        r.book = `EXC:${(e as Error).constructor.name}`
      }
      try {
        r.series = dumpSeriesPatch(provider.getSeriesMetadataFromBook(book, true))
      } catch (e) {
        r.series = `EXC:${(e as Error).constructor.name}`
      }
      const expected = oracle[i] as Record<string, unknown>
      if (JSON.stringify(r) !== JSON.stringify(expected)) mismatches.push({ i, opf: opf.length < 600 ? opf : '(long)', actual: r, expected })
    })
    expect(mismatches).toEqual([])
    expect(cases.length).toBe(oracle.length)
  }, 60000)
})
