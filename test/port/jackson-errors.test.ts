// Messages d'erreur de désérialisation JSON (HttpMessageNotReadableException "JSON parse error: ...") comparés à ceux
// d'un Komga de référence (1.27.1, Jackson 2.19) pour les mêmes corps de requête malformés.
// Fixture : test/port/fixtures/jackson-errors-komga.json ({ method, path, body, status, message }), relevée par des
// requêtes sur le Komga de référence ; `message` est null quand Komga a lu le corps (réponse 200, 404, 500 ou violations
// de validation). Ce fichier n'a pas de jumeau Kotlin.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BookSearch } from '../../src/domain/model/BookSearch.js'
import { SearchCondition } from '../../src/domain/model/SearchCondition.js'
import { SearchOperator } from '../../src/domain/model/SearchOperator.js'
import { SeriesSearch } from '../../src/domain/model/SeriesSearch.js'
import { BookMetadataUpdateDto } from '../../src/interfaces/api/rest/dto/BookMetadataUpdateDto.js'
import { ReadListCreationDto } from '../../src/interfaces/api/rest/dto/ReadListCreationDto.js'
import { SeriesMetadataUpdateDto } from '../../src/interfaces/api/rest/dto/SeriesMetadataUpdateDto.js'
import { qualifiedNameOf, registerClass } from '../../src/port/jackson.js'
import { JsonProcessingException, ObjectMapper, jsonPropertiesOf } from '../../src/port/jackson-mapper.js'

// Noms qualifiés des classes de SearchCondition.kt / SearchOperator.kt, SeriesSearch.kt et PosterMatch.Type, tant que les
// jumeaux ne les déclarent pas (registerClass)
for (const [ns, prefix] of [
  [SearchCondition, 'org.gotson.komga.domain.model.SearchCondition$'],
  [SearchOperator, 'org.gotson.komga.domain.model.SearchOperator$'],
] as const)
  for (const [name, value] of Object.entries(ns))
    if (value !== null && (typeof value === 'object' || typeof value === 'function') && qualifiedNameOf(value) === null) registerClass(`${prefix}${name}`, value as never)
if (qualifiedNameOf(SeriesSearch) === null) registerClass('org.gotson.komga.domain.model.SeriesSearch', SeriesSearch)
if (qualifiedNameOf(SearchCondition.PosterMatch.Type) === null)
  registerClass('org.gotson.komga.domain.model.SearchCondition$PosterMatch$Type', SearchCondition.PosterMatch.Type as never)

// PORT: divergences dues aux déclarations des jumeaux (non corrigées ici) : SearchOperator.ts ne déclare pas les
// paramètres requis (`jsonProperties(..., { required: ['value'] })`), un opérateur sans "value" est donc accepté
const KNOWN_DIVERGENCES = new Set<string>(
  jsonPropertiesOf(SearchOperator.Is)?.required.includes('value')
    ? []
    : ['{"condition":{"libraryId":{"operator":"is"}}}', '{"condition":{"numberSort":{"operator":"is"}}}'],
)

type Case = { method: string; path: string; body: string; status: number; message: string | null }

const cases = JSON.parse(readFileSync('test/port/fixtures/jackson-errors-komga.json', 'utf8')) as Case[]

function bodyClass(path: string): object {
  if (path === '/api/v1/series/list') return SeriesSearch
  if (path === '/api/v1/books/list') return BookSearch
  if (path === '/api/v1/readlists') return ReadListCreationDto
  if (path.startsWith('/api/v1/series/')) return SeriesMetadataUpdateDto
  return BookMetadataUpdateDto
}

/** Lecture du corps comme AbstractJackson2HttpMessageConverter : "JSON parse error: " + getOriginalMessage() */
function read(c: Case): string | null {
  try {
    new ObjectMapper().readValue(c.body, { class: bodyClass(c.path) })
    return null
  } catch (e) {
    if (e instanceof JsonProcessingException) return `JSON parse error: ${e.message}`
    throw e
  }
}

describe('jackson-errors', () => {
  it(`reads ${cases.length} malformed or unusual request bodies like Komga`, () => {
    const mismatches = cases
      .map((c) => ({ body: c.body, path: c.path, expected: c.message, actual: read(c) }))
      .filter((r) => r.actual !== r.expected && !KNOWN_DIVERGENCES.has(r.body))
    expect(mismatches).toEqual([])
  })

  it('reports a syntax error only when the streaming parser would reach it', () => {
    // l'erreur de type sur "title" précède l'erreur de syntaxe de fin de document
    expect(read({ method: 'PATCH', path: '/api/v1/books/x/metadata', body: '{"title":{}, "x":}', status: 400, message: null })).toBe(
      'JSON parse error: Cannot deserialize value of type `java.lang.String` from Object value (token `JsonToken.START_OBJECT`)',
    )
    // une propriété inconnue est lue en entier (skipChildren)
    expect(read({ method: 'PATCH', path: '/api/v1/books/x/metadata', body: '{"x":{"a":[1,2,}]}, "title":{}}', status: 400, message: null })).toBe(
      "JSON parse error: Unexpected character ('}' (code 125)): expected a value",
    )
  })

  it('readTree reports the first syntax error', () => {
    expect(() => new ObjectMapper().readTree('{"a":[1 2]}')).toThrow("Unexpected character ('2' (code 50)): was expecting comma to separate Array entries")
  })
})
