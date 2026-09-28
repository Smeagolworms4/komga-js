// Jsoup.clean(html, Safelist.none()) comparé à jsoup-1.23.1.jar (jshell, tools/jshell-komga.sh) sur ~800 fragments HTML
// (balises bloc/en ligne, tableaux et « foster parenting », script/style/xmp/iframe, noscript, template, svg/math,
// commentaires, CDATA, entités nommées et numériques, espaces insécables et invisibles, caractères de contrôle,
// fragments aléatoires). L'analyse XML (Jsoup.parse + Parser.xmlParser()), les sélecteurs et text() sont vérifiés de
// bout en bout par test/infrastructure/metadata/epub/EpubOracle.test.ts.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { Jsoup, Parser, Safelist } from '../../src/port/jsoup-parser.js'

const cases = JSON.parse(readFileSync(new URL('./fixtures/jsoup-clean-cases.json', import.meta.url), 'utf8')) as string[]
const oracle = JSON.parse(readFileSync(new URL('./fixtures/jsoup-clean-oracle.json', import.meta.url), 'utf8')) as string[]

describe('jsoup-parser', () => {
  it('Jsoup.clean with Safelist.none() matches jsoup', () => {
    const mismatches = cases
      .map((html, i) => ({ html, actual: Jsoup.clean(html, Safelist.none()), expected: oracle[i] }))
      .filter((it) => it.actual !== it.expected)
    expect(mismatches).toEqual([])
    expect(cases.length).toBe(oracle.length)
  })
})

// Fragments aléatoires (fixtures/jsoup-gen-fuzz.mjs) : 2 580 fragments HTML pour Jsoup.clean (dont des entrées de plus
// de 2 048 caractères, taille du tampon de CharacterReader) et 2 540 documents XML pour Jsoup.parse(xmlParser) +
// select + text() + attr, passés dans jsoup par fixtures/jsoup-fuzz.jsh.
describe('jsoup-parser fuzz', () => {
  const fuzz = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/jsoup-fuzz-cases.json.gz', import.meta.url))).toString('utf8')) as { html: string[]; xml: string[] }
  const fuzzOracle = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/jsoup-fuzz-oracle.json.gz', import.meta.url))).toString('utf8')) as {
    clean: string[]
    xml: unknown[]
  }

  it('Jsoup.clean matches jsoup on random fragments', () => {
    const mismatches = fuzz.html.map((html, i) => ({ i, html, actual: Jsoup.clean(html, Safelist.none()), expected: fuzzOracle.clean[i] })).filter((it) => it.actual !== it.expected)
    expect(mismatches.slice(0, 5)).toEqual([])
    expect(fuzz.html.length).toBe(fuzzOracle.clean.length)
  }, 120000)

  it('Jsoup.parse(xmlParser) + select + text() match jsoup on random documents', () => {
    const queries = [
      '*|metadata > *|title',
      '*|metadata > *|creator',
      '*|metadata > *|meta[property=role][scheme=marc:relators]',
      '*|metadata > *|meta[property=belongs-to-collection]',
      '*|metadata > *|meta[refines=#s][property=group-position]',
      '*|spine',
      'title',
      '*|a',
      '*',
    ]
    const mismatches = fuzz.xml
      .map((xml, i) => {
        let actual: unknown
        try {
          const doc = Jsoup.parse(xml, '', Parser.xmlParser())
          actual = queries.map((q) =>
            doc.select(q).map((e) => [e.tagName(), e.text(), e.attr('id'), e.attr('refines'), e.attr('opf:role'), e.attr('page-progression-direction'), e.attr('b')]),
          )
        } catch (e) {
          actual = [`EXC:${(e as Error).constructor.name}`]
        }
        return { i, xml, actual, expected: fuzzOracle.xml[i] }
      })
      .filter((it) => JSON.stringify(it.actual) !== JSON.stringify(it.expected))
    expect(mismatches.slice(0, 3)).toEqual([])
    expect(fuzz.xml.length).toBe(fuzzOracle.xml.length)
  }, 120000)
})
