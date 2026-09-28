// Support de test : sous-ensemble de Hamcrest (org.hamcrest.Matchers) utilisé par les tests Komga avec MockMvc
// (`value(containsString(..))`, `string(HttpHeaders.SET_COOKIE, containsString(..))`…). Ce fichier n'a pas de jumeau Kotlin.
//
// Un Matcher est un objet `{ matches(actual): boolean; describeTo(): string }` ; `isMatcher(x)` le distingue d'une valeur.
// Égalité (`equalTo`, valeurs attendues des matchers) : `deepEquals` (Object.equals / List.equals de Java).

export interface Matcher<T = unknown> {
  readonly __matcher: true
  matches(actual: T): boolean
  describeTo(): string
}

export function isMatcher(x: unknown): x is Matcher {
  return x !== null && typeof x === 'object' && (x as { __matcher?: unknown }).__matcher === true
}

function matcher<T = unknown>(describe: string | (() => string), matches: (actual: T) => boolean): Matcher<T> {
  return { __matcher: true, matches, describeTo: typeof describe === 'string' ? () => describe : describe }
}

/** Représentation Java-like d'une valeur dans les messages */
export function describeValue(v: unknown): string {
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return `"${v}"`
  if (v instanceof RegExp) return v.toString()
  try {
    return JSON.stringify(v, (_k, x) => (x instanceof Set ? [...x] : x instanceof Map ? Object.fromEntries(x) : x)) ?? String(v)
  } catch {
    return String(v)
  }
}

/** `ObjectUtils.nullSafeEquals` / `List.equals` / `Map.equals` */
export function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b))
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (a instanceof Set) a = [...a]
  if (b instanceof Set) b = [...b]
  if (a instanceof Uint8Array && b instanceof Uint8Array) return a.length === b.length && a.every((x, i) => x === b[i])
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => deepEquals(x, b[i]))
  }
  const ea = a instanceof Map ? [...a.entries()] : Object.entries(a as object)
  const mb = b instanceof Map ? b : new Map(Object.entries(b as object))
  if (ea.length !== mb.size) return false
  return ea.every(([k, v]) => mb.has(k) && deepEquals(v, mb.get(k)))
}

function wrap(x: unknown): Matcher {
  return isMatcher(x) ? x : equalTo(x)
}

function asList(actual: unknown): unknown[] | null {
  if (Array.isArray(actual)) return actual
  if (actual instanceof Set) return [...actual]
  return null
}

export function equalTo<T>(expected: T): Matcher<T> {
  return matcher(() => describeValue(expected), (actual) => deepEquals(actual, expected))
}

/** `is(x)` : `is(equalTo(x))` ou `is(matcher)` */
export function is<T>(expected: T | Matcher<T>): Matcher<T> {
  const m = wrap(expected)
  return matcher(() => `is ${m.describeTo()}`, (a) => m.matches(a))
}

export function not<T>(expected: T | Matcher<T>): Matcher<T> {
  const m = wrap(expected)
  return matcher(() => `not ${m.describeTo()}`, (a) => !m.matches(a))
}

export function nullValue(): Matcher {
  return matcher('null', (a) => a === null || a === undefined)
}

export function notNullValue(): Matcher {
  return matcher('not null', (a) => a !== null && a !== undefined)
}

export function anything(): Matcher {
  return matcher('ANYTHING', () => true)
}

export function instanceOf(cls: abstract new (...a: never[]) => unknown): Matcher {
  return matcher(`an instance of ${cls.name}`, (a) => a instanceof cls)
}

export function containsString(s: string): Matcher<string | null> {
  return matcher(`a string containing "${s}"`, (a) => typeof a === 'string' && a.includes(s))
}

export function containsStringIgnoringCase(s: string): Matcher<string | null> {
  return matcher(`a string containing "${s}" ignoring case`, (a) => typeof a === 'string' && a.toLowerCase().includes(s.toLowerCase()))
}

export function startsWith(s: string): Matcher<string | null> {
  return matcher(`a string starting with "${s}"`, (a) => typeof a === 'string' && a.startsWith(s))
}

export function endsWith(s: string): Matcher<string | null> {
  return matcher(`a string ending with "${s}"`, (a) => typeof a === 'string' && a.endsWith(s))
}

export function equalToIgnoringCase(s: string): Matcher<string | null> {
  return matcher(`"${s}" ignoring case`, (a) => typeof a === 'string' && a.toLowerCase() === s.toLowerCase())
}

export function emptyString(): Matcher<string | null> {
  return matcher('an empty string', (a) => a === '')
}

export function emptyOrNullString(): Matcher<string | null> {
  return matcher('(null or an empty string)', (a) => a === null || a === undefined || a === '')
}

/** `MatchesPattern(Pattern)` / `matchesPattern(regex)` : la chaîne entière doit correspondre (`Matcher.matches()`) */
export function matchesPattern(pattern: RegExp | string): Matcher<string | null> {
  const src = typeof pattern === 'string' ? pattern : pattern.source
  const re = new RegExp(`^(?:${src})$`, typeof pattern === 'string' ? '' : pattern.flags.replace('g', ''))
  return matcher(`a string matching the pattern '${src}'`, (a) => typeof a === 'string' && re.test(a))
}
/** `org.hamcrest.text.MatchesPattern` (nom de classe employé par Komga : `MatchesPattern(Regex(..).toPattern())`) */
export const MatchesPattern = matchesPattern

export function greaterThan(n: number): Matcher<number> {
  return matcher(`a value greater than <${n}>`, (a) => typeof a === 'number' && a > n)
}

export function greaterThanOrEqualTo(n: number): Matcher<number> {
  return matcher(`a value equal to or greater than <${n}>`, (a) => typeof a === 'number' && a >= n)
}

export function lessThan(n: number): Matcher<number> {
  return matcher(`a value less than <${n}>`, (a) => typeof a === 'number' && a < n)
}

export function lessThanOrEqualTo(n: number): Matcher<number> {
  return matcher(`a value less than or equal to <${n}>`, (a) => typeof a === 'number' && a <= n)
}

export function allOf(...matchers: Matcher[]): Matcher {
  return matcher(() => `(${matchers.map((m) => m.describeTo()).join(' and ')})`, (a) => matchers.every((m) => m.matches(a)))
}

export function anyOf(...matchers: Matcher[]): Matcher {
  return matcher(() => `(${matchers.map((m) => m.describeTo()).join(' or ')})`, (a) => matchers.some((m) => m.matches(a)))
}

/** `hasItem(x)` : un élément de la collection correspond */
export function hasItem(item: unknown): Matcher {
  const m = wrap(item)
  return matcher(() => `a collection containing ${m.describeTo()}`, (a) => (asList(a) ?? []).some((x) => m.matches(x)))
}

/** `hasItems(x, y…)` : chaque attendu correspond à un élément */
export function hasItems(...items: unknown[]): Matcher {
  const ms = items.map(wrap)
  return matcher(() => `(${ms.map((m) => `a collection containing ${m.describeTo()}`).join(' and ')})`, (a) => ms.every((m) => (asList(a) ?? []).some((x) => m.matches(x))))
}

/** `contains(x, y…)` : mêmes éléments, même ordre ; `contains(list)` (surcharge List<Matcher> ou éléments) */
export function contains(...items: unknown[]): Matcher {
  const ms = items.map(wrap)
  return matcher(
    () => `iterable containing [${ms.map((m) => m.describeTo()).join(', ')}]`,
    (a) => {
      const l = asList(a)
      return l !== null && l.length === ms.length && l.every((x, i) => (ms[i] as Matcher).matches(x))
    },
  )
}

/** `containsInAnyOrder(x, y…)` */
export function containsInAnyOrder(...items: unknown[]): Matcher {
  const ms = items.map(wrap)
  return matcher(
    () => `iterable with items [${ms.map((m) => m.describeTo()).join(', ')}] in any order`,
    (a) => {
      const l = asList(a)
      if (l === null || l.length !== ms.length) return false
      const remaining = [...ms]
      for (const x of l) {
        const i = remaining.findIndex((m) => m.matches(x))
        if (i < 0) return false
        remaining.splice(i, 1)
      }
      return true
    },
  )
}

export function hasSize(size: number | Matcher<number>): Matcher {
  const m = wrap(size)
  return matcher(() => `a collection with size ${m.describeTo()}`, (a) => {
    const l = asList(a)
    return l !== null && m.matches(l.length)
  })
}

export function empty(): Matcher {
  return matcher('an empty collection', (a) => (asList(a) ?? [null]).length === 0)
}

export function hasKey(key: string): Matcher {
  return matcher(`map containing ["${key}"->ANYTHING]`, (a) => a !== null && typeof a === 'object' && (a instanceof Map ? a.has(key) : Object.hasOwn(a, key)))
}

/** `hasEntry(k, v)` */
export function hasEntry(key: string, value: unknown): Matcher {
  const m = wrap(value)
  return matcher(`map containing ["${key}"->${m.describeTo()}]`, (a) => {
    if (a === null || typeof a !== 'object') return false
    if (a instanceof Map) return a.has(key) && m.matches(a.get(key))
    return Object.hasOwn(a, key) && m.matches((a as Record<string, unknown>)[key])
  })
}

/** `org.hamcrest.Matchers` (import statique en Kotlin : `Matchers.containsString(..)`) */
export const Matchers = {
  equalTo,
  is,
  not,
  nullValue,
  notNullValue,
  anything,
  instanceOf,
  containsString,
  containsStringIgnoringCase,
  startsWith,
  endsWith,
  equalToIgnoringCase,
  emptyString,
  emptyOrNullString,
  matchesPattern,
  greaterThan,
  greaterThanOrEqualTo,
  lessThan,
  lessThanOrEqualTo,
  allOf,
  anyOf,
  hasItem,
  hasItems,
  contains,
  containsInAnyOrder,
  hasSize,
  empty,
  hasKey,
  hasEntry,
}

/** `MatcherAssert.assertThat(reason, actual, matcher)` */
export function assertThatMatcher(reason: string, actual: unknown, m: Matcher): void {
  if (!m.matches(actual as never)) {
    const e = new Error(`${reason}\nExpected: ${m.describeTo()}\n     but: was ${describeValue(actual)}`)
    e.name = 'AssertionError'
    throw e
  }
}
