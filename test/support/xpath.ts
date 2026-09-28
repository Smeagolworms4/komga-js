// Support de test : sous-ensemble de XPath 1.0 pour `xpath(..)` de MockMvc (XpathExpectationsHelper, sans espaces de
// noms : DocumentBuilderFactory non namespace-aware, les noms qualifiés sont comparés tels quels).
// Ce fichier n'a pas de jumeau Kotlin.
//
// Pris en charge : chemins absolus ou relatifs à la racine (`/a/b`, `//b`, `/a//b`), étapes `nom`, `*`, `@attr`, `@*`,
// `text()`, `node()`, `.`, `..`, prédicats `[n]`, `[last()]`, `[@a]`, `[@a='v']`, `[nom='v']`, `[nom]`, et
// les fonctions englobantes `count(..)`, `string(..)`, `normalize-space(..)`.
import { type AnyNode, type Document, type Element, isTag, isText, isCDATA } from 'domhandler'
import { parseDocument } from 'htmlparser2'

type XNode = AnyNode | { attr: string; value: string; parent: Element }

function isAttr(n: XNode): n is { attr: string; value: string; parent: Element } {
  return (n as { attr?: string }).attr !== undefined
}

export function parseXml(content: string): Document {
  return parseDocument(content, { xmlMode: true, decodeEntities: true })
}

/** Valeur textuelle d'un nœud (string-value XPath) */
export function stringValue(n: XNode): string {
  if (isAttr(n)) return n.value
  if (isText(n) || isCDATA(n)) return isText(n) ? n.data : (n.children as AnyNode[]).map(stringValue).join('')
  if ('children' in n) return (n.children as AnyNode[]).map((c) => (isTag(c) || isText(c) || isCDATA(c) ? stringValue(c) : '')).join('')
  return ''
}

type Step = { axis: 'child' | 'descendant-or-self' | 'attribute' | 'self' | 'parent'; test: string; predicates: string[] }

function splitSteps(path: string): { absolute: boolean; steps: Step[] } {
  const steps: Step[] = []
  let i = 0
  const absolute = path.startsWith('/')
  let descendant = false
  while (i < path.length) {
    if (path.startsWith('//', i)) {
      descendant = true
      i += 2
      continue
    }
    if (path[i] === '/') {
      i++
      continue
    }
    let j = i
    let depth = 0
    let quote: string | null = null
    while (j < path.length) {
      const c = path[j] as string
      if (quote) {
        if (c === quote) quote = null
      } else if (c === "'" || c === '"') quote = c
      else if (c === '[') depth++
      else if (c === ']') depth--
      else if (c === '/' && depth === 0) break
      j++
    }
    const raw = path.slice(i, j)
    const b = raw.indexOf('[')
    const head = b < 0 ? raw : raw.slice(0, b)
    const predicates: string[] = []
    if (b >= 0) {
      let k = b
      while (k < raw.length) {
        let d = 0
        let q: string | null = null
        let e = k
        for (; e < raw.length; e++) {
          const c = raw[e] as string
          if (q) {
            if (c === q) q = null
          } else if (c === "'" || c === '"') q = c
          else if (c === '[') d++
          else if (c === ']') {
            d--
            if (d === 0) break
          }
        }
        predicates.push(raw.slice(k + 1, e).trim())
        k = e + 1
      }
    }
    if (descendant) steps.push({ axis: 'descendant-or-self', test: 'node()', predicates: [] })
    descendant = false
    if (head === '.') steps.push({ axis: 'self', test: 'node()', predicates })
    else if (head === '..') steps.push({ axis: 'parent', test: 'node()', predicates })
    else if (head.startsWith('@')) steps.push({ axis: 'attribute', test: head.slice(1), predicates })
    else steps.push({ axis: 'child', test: head, predicates })
    i = j
  }
  return { absolute, steps }
}

function children(n: XNode): AnyNode[] {
  return !isAttr(n) && 'children' in n ? (n.children as AnyNode[]) : []
}

function matchesTest(n: AnyNode, test: string): boolean {
  if (test === 'node()') return true
  if (test === 'text()') return isText(n) || isCDATA(n)
  if (!isTag(n)) return false
  return test === '*' || n.name === test
}

function applyStep(nodes: XNode[], step: Step): XNode[] {
  const out: XNode[] = []
  for (const n of nodes) {
    let selected: XNode[] = []
    switch (step.axis) {
      case 'child':
        selected = children(n).filter((c) => matchesTest(c, step.test))
        break
      case 'descendant-or-self': {
        const walk = (x: XNode) => {
          selected.push(x)
          for (const c of children(x)) walk(c)
        }
        walk(n)
        break
      }
      case 'attribute':
        if (!isAttr(n) && isTag(n as AnyNode)) {
          const el = n as Element
          selected = Object.entries(el.attribs)
            .filter(([k]) => step.test === '*' || k === step.test)
            .map(([k, v]) => ({ attr: k, value: v, parent: el }))
        }
        break
      case 'self':
        selected = [n]
        break
      case 'parent':
        selected = isAttr(n) ? [n.parent] : n.parent ? [n.parent as AnyNode] : []
        break
    }
    for (const p of step.predicates) selected = filterPredicate(selected, p)
    for (const s of selected) if (!out.includes(s)) out.push(s)
  }
  return out
}

function unquote(s: string): string {
  const t = s.trim()
  return (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')) ? t.slice(1, -1) : t
}

function filterPredicate(nodes: XNode[], p: string): XNode[] {
  if (/^\d+$/.test(p)) {
    const i = Number(p)
    return nodes[i - 1] !== undefined ? [nodes[i - 1] as XNode] : []
  }
  if (p === 'last()') return nodes.length ? [nodes[nodes.length - 1] as XNode] : []
  const eq = /^(.+?)\s*(!=|=)\s*(.+)$/.exec(p)
  if (eq) {
    const [, left, op, right] = eq as unknown as [string, string, string, string]
    const expected = unquote(right)
    return nodes.filter((n) => {
      const values = selectFrom([n], left.trim()).map(stringValue)
      return op === '=' ? values.includes(expected) : values.some((v) => v !== expected)
    })
  }
  return nodes.filter((n) => selectFrom([n], p).length > 0)
}

function selectFrom(context: XNode[], path: string): XNode[] {
  const { steps } = splitSteps(path)
  let nodes = context
  for (const s of steps) nodes = applyStep(nodes, s)
  return nodes
}

export type XPathResult = { nodes: XNode[] } | { value: string | number }

/** Évalue l'expression sur le document : ensemble de nœuds, ou valeur pour count() / string() / normalize-space() */
export function evaluateXPath(doc: Document, expression: string): XPathResult {
  const expr = expression.trim()
  const fn = /^(count|string|normalize-space)\((.*)\)$/.exec(expr)
  if (fn) {
    const inner = evaluateXPath(doc, fn[2] as string)
    const nodes = 'nodes' in inner ? inner.nodes : []
    if (fn[1] === 'count') return { value: nodes.length }
    const s = 'nodes' in inner ? (nodes[0] ? stringValue(nodes[0]) : '') : String(inner.value)
    return { value: fn[1] === 'string' ? s : s.trim().replace(/\s+/g, ' ') }
  }
  const { absolute, steps } = splitSteps(expr)
  let nodes: XNode[] = [absolute ? doc : doc]
  for (const s of steps) nodes = applyStep(nodes, s)
  return { nodes }
}
