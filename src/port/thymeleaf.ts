// Support de portage : sous-ensemble de Thymeleaf 3.1 (spring-boot-starter-thymeleaf, préfixe classpath:/public/,
// suffixe .html) suffisant pour les gabarits index.html / index-next.html de Komga, dans lesquels le build Gradle
// injecte `th:href="@{/...}"`, `th:src`, `th:content` et un script `th:inline="javascript"` contenant
// `/*[(${"'" + baseUrl + "'"})]*/ '/'`. Ce fichier n'a pas de jumeau Kotlin.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IllegalStateException } from './kotlin.js'
import { resolveLocation } from './spring-webmvc-config.js'

/** `org.thymeleaf.exceptions.TemplateInputException` */
export class TemplateInputException extends IllegalStateException {}

/** Évalue une expression SpEL minimale : littéraux chaîne, variables du modèle, concaténation `+` */
function evaluate(expr: string, model: ReadonlyMap<string, unknown>): unknown {
  const tokens: string[] = []
  let cur = ''
  let quote: string | null = null
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i] as string
    if (quote) {
      cur += c
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
      cur += c
    } else if (c === '+') {
      tokens.push(cur.trim())
      cur = ''
    } else cur += c
  }
  tokens.push(cur.trim())
  const values = tokens.map((t) => {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
    if (/^\d+$/.test(t)) return Number(t)
    return model.get(t) ?? null
  })
  if (values.length === 1) return values[0]
  return values.map((v) => (v === null ? 'null' : String(v))).join('')
}

function evalStandard(text: string, model: ReadonlyMap<string, unknown>, contextPath: string): unknown {
  const t = text.trim()
  let m = /^\$\{(.*)\}$/s.exec(t)
  if (m) return evaluate(m[1] as string, model)
  m = /^@\{(.*)\}$/s.exec(t)
  if (m) {
    const url = m[1] as string
    return url.startsWith('/') ? contextPath + url : url
  }
  return t
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function jsLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `"${String(v)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\//g, '\\/')}"`
}

/** Traite un gabarit HTML */
export function processTemplate(template: string, model: ReadonlyMap<string, unknown>, contextPath: string): string {
  // attributs th:xxx="..." : remplacent l'attribut xxx à sa place, ou l'ajoutent à la place du th:xxx
  let out = template.replace(/<([a-zA-Z][\w-]*)(\s[^<>]*?)?(\/?)>/g, (whole, tag: string, attrs: string | undefined, selfClose: string) => {
    if (!attrs || !attrs.includes('th:')) return whole
    const parsed: { name: string; value: string | null; raw: string }[] = []
    const re = /\s+([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g
    let am: RegExpExecArray | null
    while ((am = re.exec(attrs)) !== null) {
      const v = am[2]
      parsed.push({ name: am[1] as string, value: v === undefined ? null : v.replace(/^["']|["']$/g, ''), raw: am[0] })
    }
    const result: { name: string; value: string | null; raw: string | null }[] = parsed.map((p) => ({ ...p }))
    for (const p of parsed) {
      if (!p.name.startsWith('th:')) continue
      const target = p.name.slice(3)
      const idx = result.findIndex((r) => r.name === p.name)
      if (target === 'inline' || target === 'block' || target === 'remove') {
        result.splice(idx, 1)
        continue
      }
      const value = evalStandard(p.value ?? '', model, contextPath)
      const existing = result.findIndex((r) => r.name === target)
      if (existing >= 0) {
        result[existing] = { name: target, value: value === null ? null : String(value), raw: null }
        result.splice(
          result.findIndex((r) => r.name === p.name),
          1,
        )
      } else result[idx] = { name: target, value: value === null ? null : String(value), raw: null }
    }
    const rendered = result.map((r) => (r.raw !== null ? r.raw : r.value === null ? '' : ` ${r.name}="${escapeAttr(r.value)}"`)).join('')
    return `<${tag}${rendered}${selfClose}>`
  })
  // inlining JavaScript : /*[(expr)]*/ défaut (non échappé) et /*[[expr]]*/ défaut (littéral JS)
  out = out.replace(/\/\*\[\((.*?)\)\]\*\/\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|[^\s;,)]*)/g, (_m, expr: string) => {
    const v = evalStandard(expr, model, contextPath)
    return v === null ? '' : String(v)
  })
  out = out.replace(/\/\*\[\[(.*?)\]\]\*\/\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|[^\s;,)]*)/g, (_m, expr: string) =>
    jsLiteral(evalStandard(expr, model, contextPath)),
  )
  return out
}

/** `ThymeleafViewResolver` : gabarit `<prefix><vue>.html` */
export function renderView(viewName: string, model: ReadonlyMap<string, unknown>, contextPath: string, prefix = 'classpath:/public/'): string {
  const file = join(resolveLocation(prefix), `${viewName}.html`)
  if (!existsSync(file)) throw new TemplateInputException(`Error resolving template [${viewName}], template might not exist or might not be accessible by any of the configured Template Resolvers`)
  return processTemplate(readFileSync(file, 'utf8'), model, contextPath)
}
