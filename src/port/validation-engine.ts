// Support de portage : exécution de la validation jakarta (Hibernate Validator 8.0.3 tel que configuré par
// Spring Boot : LocalValidatorFactoryBean + LocaleContextMessageInterpolator) au-dessus du registre de
// port/validation.ts : validation d'un objet (propriétés, contraintes de classe, @Valid en cascade),
// validation des paramètres de méthode (@Validated -> ConstraintViolationException), messages par défaut
// localisés (bundles ValidationMessages*.properties de Hibernate, résolution ResourceBundle de Java).
// Ce fichier n'a pas de jumeau Kotlin.
import { AsyncLocalStorage } from 'node:async_hooks'
import { domainToASCII } from 'node:url'
import { MalformedURLException, URL as JavaURL } from './java-net.js'
import { RuntimeException, eq } from './kotlin.js'
import { VALIDATION_MESSAGES } from './validation-messages.js'
import {
  type Constraint,
  type ConstraintValidator,
  classConstraintsOf,
  constraintDefinition,
  constraintDefinitionOf,
  constraintViolations,
  constraintsOf,
} from './validation.js'

// ---------------------------------------------------------------------------
// Locale (java.util.Locale par défaut, LocaleContextHolder)
// ---------------------------------------------------------------------------

/** Locale Java sous forme de balise BCP 47 (`fr-FR`) */
export type LocaleTag = string

/** `Locale.getDefault()` : dérivée de LC_ALL / LC_MESSAGES / LANG comme la JVM sous Linux */
export function defaultLocale(): LocaleTag {
  const raw = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ''
  const m = /^([a-zA-Z]{2,3})(?:_([a-zA-Z]{2}))?/.exec(raw)
  if (!m || raw === 'C' || raw.startsWith('C.') || raw === 'POSIX') return 'en'
  return m[2] ? `${(m[1] as string).toLowerCase()}-${(m[2] as string).toUpperCase()}` : (m[1] as string).toLowerCase()
}

const localeStorage = new AsyncLocalStorage<LocaleTag>()

/** `LocaleContextHolder.getLocale()` */
export function currentLocale(): LocaleTag {
  return localeStorage.getStore() ?? defaultLocale()
}

/** Exécute `fn` avec la locale de la requête (FrameworkServlet.initContextHolders) */
export function withLocale<T>(locale: LocaleTag, fn: () => T): T {
  return localeStorage.run(locale, fn)
}

/**
 * `request.getLocale()` de Tomcat : première locale de Accept-Language par qualité décroissante
 * (`*` ignoré), sinon la locale par défaut du serveur.
 */
export function localeFromAcceptLanguage(header: string | null): LocaleTag {
  if (!header) return defaultLocale()
  const entries: { tag: string; q: number; i: number }[] = []
  header.split(',').forEach((part, i) => {
    const [tagRaw, ...params] = part.trim().split(';')
    const tag = (tagRaw ?? '').trim()
    if (!tag || tag === '*') return
    let q = 1
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(p)
      if (m) q = Number(m[1])
    }
    if (q <= 0 || Number.isNaN(q)) return
    if (!/^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/.test(tag)) return
    entries.push({ tag, q, i })
  })
  entries.sort((a, b) => b.q - a.q || a.i - b.i)
  const first = entries[0]
  if (!first) return defaultLocale()
  const [lang, country] = first.tag.split('-')
  return country && /^[A-Za-z]{2}$/.test(country) ? `${(lang as string).toLowerCase()}-${country.toUpperCase()}` : (lang as string).toLowerCase()
}

function bundleCandidates(locale: LocaleTag): string[] {
  const [lang, country] = locale.split('-')
  const out: string[] = []
  if (lang && country) out.push(`${lang}_${country}`)
  if (lang) out.push(lang)
  return out
}

/** ResourceBundle.getBundle : chaîne de bundles pour la locale, repli sur la locale par défaut, puis la base */
function bundleChain(locale: LocaleTag): Record<string, string>[] {
  let found = bundleCandidates(locale).filter((c) => VALIDATION_MESSAGES[c] !== undefined)
  if (found.length === 0 && locale !== defaultLocale()) found = bundleCandidates(defaultLocale()).filter((c) => VALIDATION_MESSAGES[c] !== undefined)
  return [...found.map((c) => VALIDATION_MESSAGES[c] as Record<string, string>), VALIDATION_MESSAGES[''] as Record<string, string>]
}

/** Constantes Java affichées par `{min}` / `{max}` */
function formatAttribute(v: unknown): string {
  if (v === undefined || v === null) return 'null'
  if (Array.isArray(v)) return `[${v.map(formatAttribute).join(', ')}]`
  return String(v)
}

const DEFAULT_ATTRIBUTES: Record<string, Record<string, unknown>> = {
  Size: { min: 0, max: 2147483647 },
  Email: { regexp: '.*', flags: [] },
  URL: { protocol: '', host: '', port: -1, regexp: '.*' },
  DecimalMin: { inclusive: true },
  DecimalMax: { inclusive: true },
}

/**
 * `ResourceBundleMessageInterpolator.interpolate` : paramètres `{clé}` résolus dans les bundles (récursivement),
 * puis attributs de l'annotation `{attr}`, puis expressions `${attr == true ? 'a' : 'b'}` (sous-ensemble EL).
 */
export function interpolateMessage(template: string, constraint: Constraint, locale: LocaleTag = currentLocale()): string {
  const chain = bundleChain(locale)
  const lookup = (key: string): string | undefined => {
    for (const b of chain) if (b[key] !== undefined) return b[key]
    return undefined
  }
  const attrs: Record<string, unknown> = { ...(DEFAULT_ATTRIBUTES[constraint.type] ?? {}), ...constraint }
  let msg = template
  // 1-2. paramètres de message (bundles), récursivement
  for (let guard = 0; guard < 10; guard++) {
    const next = msg.replace(/(?<![$\\])\{([^{}]+)\}/g, (m, key: string) => lookup(key) ?? m)
    if (next === msg) break
    msg = next
  }
  // 3. attributs de l'annotation
  msg = msg.replace(/(?<![$\\])\{([^{}]+)\}/g, (m, key: string) => (key in attrs ? formatAttribute(attrs[key]) : m))
  // 4. expressions EL simples
  msg = msg.replace(/\$\{\s*(\w+)\s*==\s*(true|false)\s*\?\s*'([^']*)'\s*:\s*'([^']*)'\s*\}/g, (_, attr: string, lit: string, a: string, b: string) =>
    String(attrs[attr]) === lit ? a : b,
  )
  return msg.replace(/\\([{}$\\])/g, '$1')
}

// ---------------------------------------------------------------------------
// Validateurs des contraintes standard absentes du registre de port/validation.ts
// ---------------------------------------------------------------------------

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined
}

class NotNullValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    return !isEmptyValue(value)
  }
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  return null
}

class PositiveValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    const n = numberOf(value)
    return n === null || n > 0
  }
}
class PositiveOrZeroValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    const n = numberOf(value)
    return n === null || n >= 0
  }
}
class NegativeValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    const n = numberOf(value)
    return n === null || n < 0
  }
}
class NegativeOrZeroValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    const n = numberOf(value)
    return n === null || n <= 0
  }
}
class MinValidator implements ConstraintValidator {
  constructor(private readonly c: Constraint) {}
  isValid(value: unknown): boolean {
    const n = numberOf(value)
    return n === null || n >= Number(this.c.value)
  }
}
class MaxValidator implements ConstraintValidator {
  constructor(private readonly c: Constraint) {}
  isValid(value: unknown): boolean {
    const n = numberOf(value)
    return n === null || n <= Number(this.c.value)
  }
}
class AssertTrueValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    return isEmptyValue(value) || value === true
  }
}
class AssertFalseValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    return isEmptyValue(value) || value === false
  }
}

function sizeOf(value: unknown): number | null {
  if (typeof value === 'string' || Array.isArray(value) || value instanceof Uint8Array) return value.length
  if (value instanceof Set || value instanceof Map) return value.size
  return null
}

class SizeValidator implements ConstraintValidator {
  constructor(private readonly c: Constraint) {}
  isValid(value: unknown): boolean {
    if (isEmptyValue(value)) return true
    const s = sizeOf(value) ?? 0
    return s >= Number(this.c.min ?? 0) && s <= Number(this.c.max ?? 2147483647)
  }
}

/** Expression régulière Java appliquée à toute la valeur (`Matcher.matches`) */
function javaFullMatch(regexp: string, value: string, flags = ''): boolean {
  return new RegExp(`^(?:${regexp})$`, flags).test(value)
}

class PatternValidator implements ConstraintValidator {
  constructor(private readonly c: Constraint) {}
  isValid(value: unknown): boolean {
    if (isEmptyValue(value)) return true
    return javaFullMatch(String(this.c.regexp), String(value))
  }
}

// AbstractEmailValidator / DomainNameUtil (Hibernate Validator 8.0)
const LOCAL_PART_ATOM = "[a-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\uFFFF-]"
const LOCAL_PART_INSIDE_QUOTES_ATOM = '(?:[a-z0-9!#$%&\'*.(),<>\\[\\]:;  @+/=?^_`{|}~\\u0080-\\uFFFF-]|\\\\\\\\|\\\\")'
const LOCAL_PART_PATTERN = new RegExp(
  `^(?:${LOCAL_PART_ATOM}+|"${LOCAL_PART_INSIDE_QUOTES_ATOM}+")(?:\\.(?:${LOCAL_PART_ATOM}+|"${LOCAL_PART_INSIDE_QUOTES_ATOM}+"))*$`,
  'i',
)
const DOMAIN_CHARS_WITHOUT_DASH = "[a-z\\u0080-\\uFFFF0-9!#$%&'*+/=?^_`{|}~]"
const DOMAIN_LABEL = `(?:${DOMAIN_CHARS_WITHOUT_DASH}-*)*${DOMAIN_CHARS_WITHOUT_DASH}+`
const DOMAIN = `${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*` // PORT: `++` possessif de Java -> `+`
const IP_DOMAIN = '[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}'
const IP_V6_DOMAIN = '[0-9a-fA-F:.]+'
const EMAIL_DOMAIN_PATTERN = new RegExp(`^(?:${DOMAIN}|\\[${IP_DOMAIN}\\]|\\[IPv6:${IP_V6_DOMAIN}\\])$`, 'i')

function isValidEmailDomainAddress(domain: string): boolean {
  // if we have a trailing dot the domain part we have an invalid email address.
  if (domain.endsWith('.')) return false
  if (!EMAIL_DOMAIN_PATTERN.test(domain)) return false
  if (domain.startsWith('[')) return domain.length <= 255
  const ascii = domainToASCII(domain)
  if (ascii === '' && domain !== '') return false
  return ascii.length <= 255
}

class EmailValidator implements ConstraintValidator {
  constructor(private readonly c: Constraint) {}
  isValid(value: unknown): boolean {
    if (isEmptyValue(value) || String(value).length === 0) return true
    const stringValue = String(value)
    const splitPosition = stringValue.lastIndexOf('@')
    if (splitPosition < 0) return false
    const localPart = stringValue.slice(0, splitPosition)
    const domainPart = stringValue.slice(splitPosition + 1)
    if (localPart.length > 64 || !LOCAL_PART_PATTERN.test(localPart)) return false
    if (!isValidEmailDomainAddress(domainPart)) return false
    const regexp = this.c.regexp as string | undefined
    if (regexp === undefined || regexp === '.*') return true
    return javaFullMatch(regexp, stringValue)
  }
}

const JAVA_URL_PROTOCOLS = new Set(['http', 'https', 'ftp', 'file', 'jar', 'mailto', 'jrt'])

class URLValidator implements ConstraintValidator {
  constructor(private readonly c: Constraint) {}
  isValid(value: unknown): boolean {
    if (isEmptyValue(value) || String(value).length === 0) return true
    let url: JavaURL
    try {
      const s = String(value)
      const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(s)?.[1]?.toLowerCase()
      if (scheme !== undefined && !JAVA_URL_PROTOCOLS.has(scheme)) throw new MalformedURLException(`unknown protocol: ${scheme}`)
      url = new JavaURL(s)
    } catch {
      return false
    }
    const u = url as unknown as { protocol?: string; host?: string; port?: number }
    const protocol = (this.c.protocol as string | undefined) ?? ''
    if (protocol && protocol !== u.protocol) return false
    const host = (this.c.host as string | undefined) ?? ''
    if (host && host !== u.host) return false
    const port = (this.c.port as number | undefined) ?? -1
    if (port !== -1 && port !== u.port) return false
    return true
  }
}

class UniqueElementsValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    if (isEmptyValue(value)) return true
    const list = Array.isArray(value) ? value : value instanceof Set ? [...value] : null
    if (list === null) return true
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (eq(list[i], list[j])) return false
    return true
  }
}

type ValidatorClass = new (constraint: Constraint) => ConstraintValidator
const BUILTINS: Record<string, ValidatorClass> = {
  NotNull: NotNullValidator,
  Positive: PositiveValidator,
  PositiveOrZero: PositiveOrZeroValidator,
  Negative: NegativeValidator,
  NegativeOrZero: NegativeOrZeroValidator,
  Min: MinValidator,
  Max: MaxValidator,
  Size: SizeValidator,
  Pattern: PatternValidator,
  Email: EmailValidator,
  URL: URLValidator,
  UniqueElements: UniqueElementsValidator,
  AssertTrue: AssertTrueValidator,
  AssertFalse: AssertFalseValidator,
}

function ensureBuiltins(): void {
  for (const [type, v] of Object.entries(BUILTINS)) if (!constraintDefinitionOf(type)) constraintDefinition(type, { validatedBy: [v] })
}
ensureBuiltins()

const HIBERNATE_CONSTRAINTS = new Set(['URL', 'UniqueElements', 'ISBN', 'Length', 'Range', 'CreditCardNumber', 'EAN', 'LuhnCheck', 'UUID', 'CodePointLength'])

/** Gabarit de message d'une contrainte : attribut `message`, sinon le message par défaut de l'annotation */
export function messageTemplateOf(c: Constraint): string {
  if (typeof c.message === 'string') return c.message
  return HIBERNATE_CONSTRAINTS.has(c.type) ? `{org.hibernate.validator.constraints.${c.type}.message}` : `{jakarta.validation.constraints.${c.type}.message}`
}

/** Contraintes en échec (composition comprise) pour une valeur */
function failing(value: unknown, c: Constraint): Constraint[] {
  if (c.type === 'Valid') return []
  if (!constraintDefinitionOf(c.type)) {
    ensureBuiltins()
    const inline = c.validatedBy as (new (c?: Constraint) => ConstraintValidator)[] | undefined
    if (!constraintDefinitionOf(c.type) && Array.isArray(inline)) return inline.every((V) => new V(c).isValid(value, null)) ? [] : [c]
  }
  return constraintViolations(value, c)
}

// ---------------------------------------------------------------------------
// Validation d'un objet
// ---------------------------------------------------------------------------

/** `jakarta.validation.ConstraintViolation` */
export type ConstraintViolation = {
  /** `propertyPath.toString()` : `name`, `authors[0].name`, `claimServer.email`, "" pour une contrainte de classe */
  readonly propertyPath: string
  readonly message: string
  readonly messageTemplate: string
  readonly invalidValue: unknown
  readonly constraint: Constraint
  readonly rootBean: unknown
  readonly leafBean: unknown
}

/** `jakarta.validation.ConstraintViolationException` */
export class ConstraintViolationException extends RuntimeException {
  constructor(readonly constraintViolations: ReadonlySet<ConstraintViolation> | ConstraintViolation[]) {
    const list = [...constraintViolations]
    super(list.map((cv) => `${cv.propertyPath}: ${cv.message}`).join(', '))
  }
}

function violation(root: unknown, leaf: unknown, path: string, value: unknown, c: Constraint, locale: LocaleTag): ConstraintViolation {
  const template = messageTemplateOf(c)
  return { propertyPath: path, message: interpolateMessage(template, c, locale), messageTemplate: template, invalidValue: value, constraint: c, rootBean: root, leafBean: leaf }
}

function join(prefix: string, name: string): string {
  return prefix ? `${prefix}.${name}` : name
}

function validateInto(root: unknown, bean: object, prefix: string, out: ConstraintViolation[], locale: LocaleTag, seen: Set<object>): void {
  if (seen.has(bean)) return
  seen.add(bean)
  const cls = bean.constructor as object
  for (const c of classConstraintsOf(cls)) for (const f of failing(bean, c)) out.push(violation(root, bean, prefix, bean, f, locale))
  const props = constraintsOf(cls)
  for (const [prop, list] of Object.entries(props)) {
    const value = (bean as Record<string, unknown>)[prop] ?? null
    const path = join(prefix, prop)
    for (const c of list) for (const f of failing(value, c)) out.push(violation(root, bean, path, value, f, locale))
    if (list.some((c) => c.type === 'Valid') && value !== null) cascade(root, value, path, out, locale, seen)
  }
}

function cascade(root: unknown, value: unknown, path: string, out: ConstraintViolation[], locale: LocaleTag, seen: Set<object>): void {
  if (Array.isArray(value)) value.forEach((v, i) => v !== null && typeof v === 'object' && validateInto(root, v, `${path}[${i}]`, out, locale, seen))
  else if (value instanceof Set) for (const v of value) v !== null && typeof v === 'object' && validateInto(root, v as object, `${path}[]`, out, locale, seen)
  else if (value instanceof Map) for (const [k, v] of value) v !== null && typeof v === 'object' && validateInto(root, v as object, `${path}[${String(k)}]`, out, locale, seen)
  else if (typeof value === 'object' && value !== null) validateInto(root, value, path, out, locale, seen)
}

/** `Validator.validate(bean)` : violations dans l'ordre de déclaration (contraintes de classe, puis propriétés) */
export function validate(bean: object, locale: LocaleTag = currentLocale()): ConstraintViolation[] {
  const out: ConstraintViolation[] = []
  validateInto(bean, bean, '', out, locale, new Set())
  return out
}

/** `ExecutableValidator.validateParameters` : paramètres (nom Kotlin, valeur, contraintes) d'une méthode */
export function validateParameters(
  target: unknown,
  methodName: string,
  params: { name: string; value: unknown; constraints: Constraint[] }[],
  locale: LocaleTag = currentLocale(),
): ConstraintViolation[] {
  const out: ConstraintViolation[] = []
  for (const p of params) {
    const path = `${methodName}.${p.name}`
    for (const c of p.constraints) for (const f of failing(p.value, c)) out.push(violation(target, target, path, p.value, f, locale))
    if (p.constraints.some((c) => c.type === 'Valid') && p.value !== null && p.value !== undefined) cascade(target, p.value, path, out, locale, new Set())
  }
  return out
}
