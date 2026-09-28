// Jsoup.clean(html, Safelist.none()) comparé à jsoup-1.23.1.jar (jshell, tools/jshell-komga.sh) sur ~800 fragments HTML
// (balises bloc/en ligne, tableaux et « foster parenting », script/style/xmp/iframe, noscript, template, svg/math,
// commentaires, CDATA, entités nommées et numériques, espaces insécables et invisibles, caractères de contrôle,
// fragments aléatoires). L'analyse XML (Jsoup.parse + Parser.xmlParser()), les sélecteurs et text() sont vérifiés de
// bout en bout par test/infrastructure/metadata/epub/EpubOracle.test.ts.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ByteArrayInputStream } from '../../src/port/java-io.js'
import { type Document, Element, Jsoup, type Node, Parser, Safelist } from '../../src/port/jsoup-parser.js'

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

// Usages de mediacontainer/epub (fixtures/jsoup-gen-track.mjs, passés dans jsoup par fixtures/jsoup-track.jsh) :
// positions de source de l'analyseur HTML (setTrackPosition), sélecteurs (.classe, #id, :root, combinateur racine),
// getElementsByTag / getElementsByClass, Jsoup.parse(InputStream, null, "", parser) avec détection du jeu de caractères.
describe('jsoup-parser tracking, selectors and charset detection', () => {
  const gz = (name: string) => JSON.parse(gunzipSync(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))).toString('utf8'))
  const cases = gz('jsoup-track-cases.json.gz') as {
    html: string[]
    selectDocs: string[]
    htmlQueries: string[]
    xmlQueries: string[]
    streams: { parser: 'xml' | 'html'; bytes: number[] }[]
  }
  const oracle = gz('jsoup-track-oracle.json.gz') as { track: unknown[]; select: unknown[]; streams: unknown[] }
  const exc = (e: unknown) => `EXC:${(e as Error).constructor.name}`

  it('source ranges match jsoup', () => {
    const nodesOf = (n: Node, out: unknown[]): unknown[] => {
      const sr = n.sourceRange()
      const l: unknown[] = [n.nodeName(), sr.startPos(), sr.endPos()]
      if (n instanceof Element) l.push(n.endSourceRange().startPos(), n.endSourceRange().endPos())
      out.push(l)
      if (n instanceof Element) for (const c of n.childNodes()) nodesOf(c, out)
      return out
    }
    const mismatches = cases.html
      .map((html, i) => {
        let actual: unknown
        try {
          actual = nodesOf(Jsoup.parse(html, Parser.htmlParser().setTrackPosition(true)), [])
        } catch (e) {
          actual = exc(e)
        }
        return { i, html, actual, expected: oracle.track[i] }
      })
      .filter((it) => JSON.stringify(it.actual) !== JSON.stringify(it.expected))
    expect(mismatches.slice(0, 3)).toEqual([])
    expect(cases.html.length).toBe(oracle.track.length)
  }, 120000)

  it('selectors match jsoup', () => {
    const sel = (doc: Document, queries: string[]) => {
      const m: unknown[] = []
      for (const q of queries) {
        try {
          m.push(doc.select(q).map((e) => [e.tagName(), e.id(), e.text()]))
        } catch (e) {
          m.push(exc(e))
        }
        try {
          m.push(doc.select('*').map((c) => {
            const f = c.selectFirst(q)
            return f === null ? '' : `${f.tagName()}#${f.id()}`
          }))
        } catch (e) {
          m.push(exc(e))
        }
      }
      m.push(doc.getElementsByClass('koboSpan').map((e) => e.id()))
      m.push(doc.getElementsByTag('SPAN').map((e) => e.id()))
      m.push(doc.body().text())
      return m
    }
    const actual: unknown[] = []
    for (const d of cases.selectDocs) {
      actual.push(sel(Jsoup.parse(d, '', Parser.htmlParser()), cases.htmlQueries))
      actual.push(sel(Jsoup.parse(d, '', Parser.xmlParser()), cases.xmlQueries))
    }
    expect(actual).toEqual(oracle.select)
  })

  it('Jsoup.parse(InputStream) detects the charset like jsoup', () => {
    const actual = cases.streams.map((s) => {
      try {
        const is = new ByteArrayInputStream(Uint8Array.from(s.bytes))
        const doc = s.parser === 'xml' ? Jsoup.parse(is, null, '', Parser.xmlParser()) : Jsoup.parse(is, null, '')
        return [doc.select('*').map((e) => e.tagName()), doc.text(), doc.body().text(), doc.getElementsByClass('koboSpan').length]
      } catch (e) {
        return exc(e)
      }
    })
    expect(actual).toEqual(oracle.streams)
  })
})
