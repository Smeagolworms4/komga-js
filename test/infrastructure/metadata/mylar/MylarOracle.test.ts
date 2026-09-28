// Oracle (sans jumeau Kotlin) : lecture de series.json (dto.Series) et MylarSeriesProvider comparés aux vraies classes
// de Komga avec l'ObjectMapper de Spring Boot configuré comme Komga. fixtures/mylar-cases.json (fixtures/gen-mylar.mjs)
// passé dans Komga par fixtures/mylar-oracle.jsh (tools/jshell-komga.sh) -> fixtures/mylar-oracle.json.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SeriesMetadataPatch } from '../../../../src/domain/model/SeriesMetadataPatch.js'
import { MylarSeriesProvider } from '../../../../src/infrastructure/metadata/mylar/MylarSeriesProvider.js'
import { Series } from '../../../../src/infrastructure/metadata/mylar/dto/Series.js'
import { ObjectMapper } from '../../../../src/port/jackson-mapper.js'
import { pathToUrl } from '../../../../src/port/java-net.js'
import { str } from '../../../../src/port/kotlin.js'
import { makeSeries } from '../../../domain/model/Utils.js'

const cases = JSON.parse(readFileSync(new URL('../fixtures/mylar-cases.json', import.meta.url), 'utf8')) as string[]
const oracle = JSON.parse(readFileSync(new URL('../fixtures/mylar-oracle.json', import.meta.url), 'utf8')) as { dto: string | null; patch: unknown }[]

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

describe('MylarOracle', () => {
  it('matches Komga on every fixture', () => {
    const mapper = new ObjectMapper()
    const provider = new MylarSeriesProvider(mapper)
    const dir = mkdtempSync(join(tmpdir(), 'mylar'))
    try {
      const series = makeSeries('series', { url: pathToUrl(dir) })
      const mismatches: unknown[] = []
      cases.forEach((c, i) => {
        let dto: string | null
        try {
          const s = mapper.readValue<Series | null>(c, { class: Series })
          dto = s === null ? null : str(s)
        } catch {
          dto = 'EXC'
        }
        writeFileSync(join(dir, 'series.json'), c)
        const patch = dumpSeriesPatch(provider.getSeriesMetadata(series))
        const expected = oracle[i] as { dto: string | null; patch: unknown }
        const expectedDto = typeof expected.dto === 'string' && expected.dto.startsWith('EXC:') ? 'EXC' : expected.dto
        if (dto !== expectedDto || JSON.stringify(patch) !== JSON.stringify(expected.patch)) mismatches.push({ i, json: c, dto, expectedDto, patch, expectedPatch: expected.patch })
      })
      expect(mismatches).toEqual([])
      expect(cases.length).toBe(oracle.length)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)
})
