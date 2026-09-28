// Support de test : équivalent de MockK / springmockk (io.mockk, com.ninjasquad.springmockk) pour les tests portés.
// Ce fichier n'a pas de jumeau Kotlin. Construit sur des Proxy JS ; les assertions échouent avec `AssertionError`
// (reconnue par Vitest).
//
// API (même vocabulaire que MockK) :
//
//   Création
//     mockk<T>(cls?, { relaxed?, name? })   `mockk<T>()` / `mockk<T>(relaxed = true)` ; `cls` (classe) rend `instanceof` vrai.
//                                           Un appel non programmé lève MockKException (sauf `relaxed` : renvoie undefined).
//     spyk(obj)                             `spyk(obj)` : les appels non programmés exécutent la vraie méthode
//                                           (`this` = l'espion, donc les appels internes passent aussi par l'espion).
//     spykLazy<T>(() => obj)                espion dont l'objet réel est résolu au premier accès (utilisé par @SpykBean
//                                           dans test/SpringBootTest.ts : `{ type: X, spyk: true }`).
//
//   Programmation (le bloc est exécuté en mode « enregistrement » : la méthode n'est pas appelée)
//     every(() => m.f(any(), 1)).returns(x)          `every { m.f(any(), 1) } returns x`
//                               .returnsMany(a, b)   `returnsMany listOf(a, b)` (le dernier est répété)
//                               .answers((c) => ..)  `answers { ... }` ; c = { args, self, callOriginal() }
//                               .throws(e)           `throws e`
//                               .justRuns()          `just Runs`
//     justRun(() => m.f(any()))                      `justRun { m.f(any()) }`
//     coEvery / coJustRun / coVerify                 alias (méthodes asynchrones : `returns(Promise.resolve(x))`)
//
//   Vérification
//     verify(() => m.f(any()))                        `verify { m.f(any()) }` (au moins une fois)
//     verify({ exactly: 0 }, () => m.f(any()))        `verify(exactly = 0) { ... }` ; aussi atLeast / atMost
//     confirmVerified(m1, m2)                         `confirmVerified(m1, m2)`
//     clearMocks(m1, m2)                              `clearMocks(m1, m2)` (programmations et appels enregistrés)
//
//   Filtres d'arguments (valeur non filtre = `eq`, égalité Kotlin `eq()` de port/kotlin.ts)
//     any()  isNull()  isNotNull()  ofType(Cls)  match((v) => boolean)  eqArg(v)  capture(slot | tableau)
//     slot<T>()  →  `slot.captured`, `slot.isCaptured`
//
// Écarts assumés : pas de distinction de surcharges (une seule méthode TS par nom : utiliser `ofType`/`match`
// pour reproduire `any<Collection<X>>()`), les filtres ne sont reconnus qu'au premier niveau des arguments.
import { eq } from '../../src/port/kotlin.js'

// ---------------------------------------------------------------------------
// Filtres
// ---------------------------------------------------------------------------

class Matcher {
  constructor(
    readonly description: string,
    readonly test: (v: unknown) => boolean,
    readonly onMatch?: (v: unknown) => void,
  ) {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function any<T = any>(): T {
  return new Matcher('any()', () => true) as unknown as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNull<T = any>(): T {
  return new Matcher('isNull()', (v) => v === null || v === undefined) as unknown as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNotNull<T = any>(): T {
  return new Matcher('isNotNull()', (v) => v !== null && v !== undefined) as unknown as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ofType<T = any>(cls: abstract new (...args: any[]) => unknown): T {
  return new Matcher(`ofType(${cls.name})`, (v) => v instanceof cls) as unknown as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function match<T = any>(predicate: (v: T) => boolean, description = 'match(...)'): T {
  return new Matcher(description, (v) => predicate(v as T)) as unknown as T
}

export function eqArg<T>(value: T): T {
  return new Matcher(`eq(${String(value)})`, (v) => eq(v, value)) as unknown as T
}

export class CapturingSlot<T> {
  private value: T | undefined = undefined
  private has = false

  get captured(): T {
    if (!this.has) throw new MockKException('slot has not been captured')
    return this.value as T
  }

  get isCaptured(): boolean {
    return this.has
  }

  set(v: T): void {
    this.value = v
    this.has = true
  }

  clear(): void {
    this.value = undefined
    this.has = false
  }
}

export function slot<T>(): CapturingSlot<T> {
  return new CapturingSlot<T>()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function capture<T = any>(target: CapturingSlot<T> | T[]): T {
  return new Matcher('capture()', () => true, (v) => {
    if (target instanceof CapturingSlot) target.set(v as T)
    else target.push(v as T)
  }) as unknown as T
}

function argMatches(pattern: unknown, actual: unknown): boolean {
  if (pattern instanceof Matcher) return pattern.test(actual)
  return eq(pattern, actual)
}

function describeArg(a: unknown): string {
  if (a instanceof Matcher) return a.description
  if (typeof a === 'string') return JSON.stringify(a)
  try {
    return String(a)
  } catch {
    return typeof a
  }
}

// ---------------------------------------------------------------------------
// État des mocks
// ---------------------------------------------------------------------------

export class MockKException extends Error {}

class AssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssertionError'
  }
}

type Call = { method: string; args: unknown[]; verified: boolean }

type CallContext = { args: unknown[]; self: unknown; callOriginal: () => unknown }

type Answer = (c: CallContext) => unknown

type Stub = { method: string; args: unknown[]; answer: Answer }

type MockState = {
  name: string
  kind: 'mock' | 'spy'
  relaxed: boolean
  target: () => object | null
  stubs: Stub[]
  calls: Call[]
}

const states = new WeakMap<object, MockState>()

/** Mode enregistrement (bloc de `every` / `verify`) : les appels sont capturés au lieu d'être exécutés */
let recording: { mock: object; method: string; args: unknown[] }[] | null = null

function stateOf(mock: object): MockState {
  const s = states.get(mock)
  if (!s) throw new MockKException('Not a mock or spy')
  return s
}

// Propriétés sondées par Vitest, Node ou les promesses : jamais traitées comme des méthodes du mock
const IGNORED_PROPS = new Set(['then', 'catch', 'finally', 'asymmetricMatch', '$$typeof', 'nodeType', 'toJSON', 'constructor', '@@__IMMUTABLE_ITERABLE__@@', '@@__IMMUTABLE_RECORD__@@', '_isMockFunction'])

function invoke(proxy: object, state: MockState, method: string, args: unknown[], original: ((...a: unknown[]) => unknown) | null): unknown {
  if (recording !== null) {
    recording.push({ mock: proxy, method, args })
    return undefined
  }
  state.calls.push({ method, args, verified: false })
  // la dernière programmation correspondante l'emporte (comme MockK)
  for (let i = state.stubs.length - 1; i >= 0; i--) {
    const stub = state.stubs[i] as Stub
    if (stub.method !== method || stub.args.length > args.length) continue
    if (!stub.args.every((p, j) => argMatches(p, args[j]))) continue
    stub.args.forEach((p, j) => {
      if (p instanceof Matcher && p.onMatch) p.onMatch(args[j])
    })
    return stub.answer({
      args,
      self: proxy,
      callOriginal: () => {
        if (original === null) throw new MockKException(`No original method for ${state.name}.${method}`)
        return original.apply(proxy, args)
      },
    })
  }
  if (original !== null) return original.apply(proxy, args)
  if (state.relaxed) return undefined
  throw new MockKException(`no answer found for: ${state.name}.${method}(${args.map(describeArg).join(', ')})`)
}

function makeProxy(state: MockState, base: object): object {
  const methodCache = new Map<string, (...a: unknown[]) => unknown>()
  const proxy: object = new Proxy(base, {
    get(_t, prop, receiver) {
      const target = state.target()
      if (typeof prop === 'symbol' || IGNORED_PROPS.has(prop)) {
        return target !== null ? Reflect.get(target, prop, receiver) : Reflect.get(base, prop, receiver)
      }
      if (state.kind === 'spy') {
        const t = target as object
        const v = Reflect.get(t, prop, receiver) as unknown
        if (typeof v !== 'function') return v
        let f = methodCache.get(prop)
        if (!f) {
          f = function (this: unknown, ...args: unknown[]) {
            const orig = Reflect.get(state.target() as object, prop) as (...a: unknown[]) => unknown
            return invoke(proxy, state, prop, args, orig)
          }
          methodCache.set(prop, f)
        }
        return f
      }
      let f = methodCache.get(prop)
      if (!f) {
        f = (...args: unknown[]) => invoke(proxy, state, prop, args, null)
        methodCache.set(prop, f)
      }
      return f
    },
    set(_t, prop, value) {
      const target = state.target()
      return Reflect.set(target ?? base, prop, value)
    },
    has(_t, prop) {
      const target = state.target()
      return Reflect.has(target ?? base, prop)
    },
    getPrototypeOf() {
      const target = state.target()
      return Reflect.getPrototypeOf(target ?? base)
    },
  })
  states.set(proxy, state)
  return proxy
}

/** `mockk<T>()` ; `cls` optionnel pour que `instanceof cls` soit vrai */
export function mockk<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cls?: abstract new (...args: any[]) => T,
  { relaxed = false, name }: { relaxed?: boolean; name?: string } = {},
): T {
  const base = cls ? (Object.create(cls.prototype) as object) : {}
  const state: MockState = { name: name ?? `#mockk<${cls?.name ?? 'T'}>`, kind: 'mock', relaxed, target: () => null, stubs: [], calls: [] }
  return makeProxy(state, base) as T
}

/** `spyk(obj)` */
export function spyk<T extends object>(obj: T, { name }: { name?: string } = {}): T {
  const state: MockState = { name: name ?? `#spyk<${obj.constructor?.name ?? 'T'}>`, kind: 'spy', relaxed: false, target: () => obj, stubs: [], calls: [] }
  return makeProxy(state, obj) as T
}

/** Espion dont l'objet réel est résolu au premier accès */
export function spykLazy<T extends object>(resolve: () => T, { name, prototype }: { name?: string; prototype?: object } = {}): T {
  let obj: T | null = null
  const state: MockState = {
    name: name ?? '#spyk',
    kind: 'spy',
    relaxed: false,
    target: () => {
      if (obj === null) obj = resolve()
      return obj
    },
    stubs: [],
    calls: [],
  }
  return makeProxy(state, prototype ? (Object.create(prototype) as object) : {}) as T
}

// ---------------------------------------------------------------------------
// every / verify
// ---------------------------------------------------------------------------

function record(block: () => unknown): { mock: object; method: string; args: unknown[] }[] {
  if (recording !== null) throw new MockKException('Nested every/verify blocks are not supported')
  recording = []
  try {
    const r = block()
    // bloc asynchrone (coEvery { }) : les appels ont déjà été enregistrés de manière synchrone
    if (r instanceof Promise) r.catch(() => {})
    return recording
  } finally {
    recording = null
  }
}

export class Stubbing<R> {
  constructor(
    private readonly mock: object,
    private readonly method: string,
    private readonly args: unknown[],
  ) {}

  private add(answer: Answer): void {
    stateOf(this.mock).stubs.push({ method: this.method, args: this.args, answer })
  }

  returns(value: R): void {
    this.add(() => value)
  }

  returnsMany(...values: R[]): void {
    let i = 0
    this.add(() => {
      const v = values[Math.min(i, values.length - 1)]
      i++
      return v
    })
  }

  answers(f: (c: CallContext) => R): void {
    this.add(f)
  }

  throws(e: unknown): void {
    this.add(() => {
      throw e
    })
  }

  /** `just Runs` */
  justRuns(): void {
    this.add(() => undefined)
  }
}

/** `every { mock.method(...) }` : le dernier appel du bloc est programmé */
export function every<R>(block: () => R): Stubbing<Awaited<R> | R> {
  const calls = record(block)
  const last = calls[calls.length - 1]
  if (!last) throw new MockKException('Missing mocked calls inside every { ... } block: make sure the object inside the block is a mock')
  return new Stubbing(last.mock, last.method, last.args)
}

export const coEvery = every

/** `justRun { mock.method(...) }` */
export function justRun(block: () => unknown): void {
  every(block).justRuns()
}

export const coJustRun = justRun

export type VerifyOptions = { exactly?: number; atLeast?: number; atMost?: number; inverse?: boolean }

/** `verify(exactly = n) { ... }` : `verify({ exactly: n }, () => ...)` ou `verify(() => ...)` */
export function verify(optsOrBlock: VerifyOptions | (() => unknown), maybeBlock?: () => unknown): void {
  const opts: VerifyOptions = typeof optsOrBlock === 'function' ? {} : optsOrBlock
  const block = typeof optsOrBlock === 'function' ? optsOrBlock : (maybeBlock as () => unknown)
  const patterns = record(block)
  if (patterns.length === 0) throw new MockKException('Missing calls inside verify { ... } block.')
  for (const p of patterns) {
    const state = stateOf(p.mock)
    const matching = state.calls.filter((c) => c.method === p.method && p.args.length <= c.args.length && p.args.every((a, j) => argMatches(a, c.args[j])))
    const n = matching.length
    const desc = `${state.name}.${p.method}(${p.args.map(describeArg).join(', ')})`
    let ok: boolean
    let expected: string
    if (opts.exactly !== undefined) {
      ok = n === opts.exactly
      expected = `exactly ${opts.exactly}`
    } else {
      const min = opts.atLeast ?? 1
      const max = opts.atMost ?? Number.POSITIVE_INFINITY
      ok = n >= min && n <= max
      expected = `between ${min} and ${max}`
    }
    if (opts.inverse) ok = !ok
    if (!ok) {
      const all = state.calls.map((c) => `  ${c.method}(${c.args.map(describeArg).join(', ')})`).join('\n')
      throw new AssertionError(`Verification failed: call ${desc} was expected to happen ${expected} times, but happened ${n} times.\nRecorded calls:\n${all}`)
    }
    for (const c of matching) {
      c.verified = true
      p.args.forEach((a, j) => {
        if (a instanceof Matcher && a.onMatch) a.onMatch(c.args[j])
      })
    }
  }
}

export const coVerify = verify

/** `confirmVerified(mocks...)` : tous les appels enregistrés doivent avoir été vérifiés */
export function confirmVerified(...mocks: object[]): void {
  for (const m of mocks) {
    const state = stateOf(m)
    const left = state.calls.filter((c) => !c.verified)
    if (left.length > 0)
      throw new AssertionError(`Verification acknowledgment failed\n\nVerified call count: ${state.calls.length - left.length}\nRecorded call count: ${state.calls.length}\n\nNot verified calls:\n${left.map((c) => `  ${state.name}.${c.method}(${c.args.map(describeArg).join(', ')})`).join('\n')}`)
  }
}

/** `clearMocks(mocks...)` : retire programmations et appels enregistrés */
export function clearMocks(...mocks: object[]): void {
  for (const m of mocks) {
    const state = stateOf(m)
    state.stubs.length = 0
    state.calls.length = 0
  }
}

/** Vrai si l'objet est un mock ou un espion créé par ce module */
export function isMockKMock(o: unknown): boolean {
  return typeof o === 'object' && o !== null && states.has(o)
}
