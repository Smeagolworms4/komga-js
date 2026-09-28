// Document OpenAPI servi par KomgaJS (/v3/api-docs, contexte complet de l'application par MockMvc) comparé au document
// de référence de Komga (komga-src/komga/docs/openapi.json, généré par la tâche Gradle avec les profils
// `claim,generate-openapi`). Égalité structurelle, ordre des clés compris (springdoc `writer-with-order-by-keys`).
// Ce fichier n'a pas de jumeau Kotlin.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { MockMvc, closeContext, mockMvcTest } from '../support/mockmvc.js'

const REFERENCE = 'test/port/fixtures/komga-openapi.json'
const hasReference = existsSync(REFERENCE)

/**
 * Écarts irréductibles documentés : chemin JSON (préfixe) -> raison. Vide = document identique.
 */
const EXCEPTIONS: Record<string, string> = {}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

/** Différences entre deux valeurs JSON (types, valeurs, clés, ordre des clés), sous forme de chemins */
export function jsonDiff(actual: Json | undefined, expected: Json | undefined, path = '$', out: string[] = []): string[] {
  if (actual === undefined && expected === undefined) return out
  if (actual === undefined) {
    out.push(`${path}: missing (expected ${short(expected)})`)
    return out
  }
  if (expected === undefined) {
    out.push(`${path}: unexpected ${short(actual)}`)
    return out
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      out.push(`${path}: ${short(actual)} != ${short(expected)}`)
      return out
    }
    if (actual.length !== expected.length) out.push(`${path}: array length ${actual.length} != ${expected.length}`)
    for (let i = 0; i < Math.max(actual.length, expected.length); i++) jsonDiff(actual[i], expected[i], `${path}[${i}]`, out)
    return out
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') {
      out.push(`${path}: ${short(actual)} != ${short(expected)}`)
      return out
    }
    const ak = Object.keys(actual)
    const ek = Object.keys(expected)
    for (const k of ek) jsonDiff(actual[k], expected[k], `${path}.${k}`, out)
    for (const k of ak) if (!(k in expected)) jsonDiff(actual[k], undefined, `${path}.${k}`, out)
    const common = ak.filter((k) => k in expected)
    const commonExpected = ek.filter((k) => k in actual)
    if (common.join('\u0000') !== commonExpected.join('\u0000')) out.push(`${path}: key order [${common.join(', ')}] != [${commonExpected.join(', ')}]`)
    return out
  }
  if (actual !== expected) out.push(`${path}: ${short(actual)} != ${short(expected)}`)
  return out
}

function short(v: unknown): string {
  const s = JSON.stringify(v)
  return s === undefined ? 'undefined' : s.length > 160 ? `${s.slice(0, 160)}…` : s
}

function isException(d: string): boolean {
  return Object.keys(EXCEPTIONS).some((p) => d === p || d.startsWith(`${p}.`) || d.startsWith(`${p}[`) || d.startsWith(`${p}:`))
}

describe.skipIf(!hasReference)('openapi reference', () => {
  // PORT: la version de l'application (build.gradle, 1.27.1 pour le document de référence) est passée en propriété
  const ctx = mockMvcTest({ 'application.version': '1.27.1' }, [], { profiles: ['test', 'claim', 'generate-openapi'] })
  const mockMvc = ctx.getBean(MockMvc)
  afterAll(() => closeContext(ctx))
  const reference = hasReference ? (JSON.parse(readFileSync(REFERENCE, 'utf8')) as Record<string, Json>) : {}

  it('serves the same OpenAPI document as Komga', async () => {
    const response = (await mockMvc.get('/v3/api-docs')).response
    expect(response.status).toBe(200)
    // JSON en UTF-8 (Content-Type sans charset : contentAsString lirait en ISO-8859-1)
    const doc = JSON.parse(Buffer.from(response.contentAsByteArray).toString('utf8')) as Record<string, Json>
    if (process.env.OPENAPI_DUMP) writeFileSync(process.env.OPENAPI_DUMP, JSON.stringify(doc, null, 2))

    const diffs = jsonDiff(doc, reference)
    const unexpected = diffs.filter((d) => !isException(d))

    // statistiques par opération et par schéma
    const refPaths = reference.paths as Record<string, Record<string, Json>>
    const docPaths = (doc.paths ?? {}) as Record<string, Record<string, Json>>
    let ops = 0
    let sameOps = 0
    for (const [p, item] of Object.entries(refPaths))
      for (const [m, o] of Object.entries(item)) {
        if (o === null || typeof o !== 'object') continue // `summary` d'un PathItem
        ops++
        if (JSON.stringify(docPaths[p]?.[m]) === JSON.stringify(o)) sameOps++
      }
    const refSchemas = (reference.components as Record<string, Record<string, Json>>).schemas as Record<string, Json>
    const docSchemas = ((doc.components as Record<string, Record<string, Json>> | undefined)?.schemas ?? {}) as Record<string, Json>
    const sameSchemas = Object.entries(refSchemas).filter(([n, s]) => JSON.stringify(docSchemas[n]) === JSON.stringify(s)).length
    console.info(`[openapi] operations ${sameOps}/${ops}, schemas ${sameSchemas}/${Object.keys(refSchemas).length}, differences ${unexpected.length}`)

    expect(unexpected, unexpected.slice(0, 200).join('\n')).toEqual([])
  })
})
