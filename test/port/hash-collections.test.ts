// Collections Java à égalité structurelle de port/kotlin.ts (LinkedHashSet, LinkedHashMap, HashSet, HashMap)
// et helpers de collections Kotlin qui les utilisent. Sémantique attendue : celle de java.util.
import { describe, expect, it } from 'vitest'
import {
  associate,
  associateBy,
  DataClass,
  distinct,
  distinctBy,
  distinctSet,
  eq,
  groupBy,
  hash,
  HashMap,
  HashSet,
  intersect,
  LinkedHashMap,
  LinkedHashSet,
  mapPlus,
  subtract,
  union,
} from '../../src/port/kotlin.js'
import { URL } from '../../src/port/java-net.js'

interface PParams {
  x: number
  y: string
}
class P extends DataClass<PParams> {
  readonly x: number
  readonly y: string
  constructor({ x, y }: PParams) {
    super()
    this.x = x
    this.y = y
  }
}
const p = (x: number, y = 'a') => new P({ x, y })

/** hash constant : tous les éléments dans le même seau */
class Collide {
  constructor(readonly v: number) {}
  equals(o: unknown): boolean {
    return o instanceof Collide && o.v === this.v
  }
  hashCode(): number {
    return 42
  }
}

describe('LinkedHashSet', () => {
  it('uses equals/hashCode for data classes', () => {
    const s = new LinkedHashSet<P>()
    const a = p(1)
    s.add(a)
    s.add(p(1))
    s.add(p(2))
    expect(s.size).toBe(2)
    expect(s.has(p(1))).toBe(true)
    expect(s.has(p(3))).toBe(false)
    // le premier élément reste (HashSet.add ne remplace pas)
    expect([...s][0]).toBe(a)
  })

  it('keeps insertion order, re-adding does not move', () => {
    const s = new LinkedHashSet([p(3), p(1), p(2)])
    s.add(p(3))
    expect([...s].map((it) => it.x)).toEqual([3, 1, 2])
  })

  it('remove then add appends at the end', () => {
    const s = new LinkedHashSet([p(1), p(2), p(3)])
    expect(s.delete(p(1))).toBe(true)
    expect(s.delete(p(1))).toBe(false)
    s.add(p(1))
    expect([...s].map((it) => it.x)).toEqual([2, 3, 1])
  })

  it('handles hash collisions', () => {
    const s = new LinkedHashSet([new Collide(1), new Collide(2), new Collide(1)])
    expect(s.size).toBe(2)
    expect(s.has(new Collide(2))).toBe(true)
    expect(s.delete(new Collide(1))).toBe(true)
    expect(s.has(new Collide(1))).toBe(false)
    expect(s.has(new Collide(2))).toBe(true)
    expect(s.size).toBe(1)
  })

  it('primitives, URL, lists and identity objects', () => {
    const s = new LinkedHashSet<unknown>(['a', 'a', 1, 1, NaN, NaN, null, null])
    expect([...s]).toEqual(['a', 1, NaN, null])
    s.add(new URL('file:/a/b'))
    expect(s.has(new URL('file:/a/b'))).toBe(true)
    s.add([1, 2])
    expect(s.has([1, 2])).toBe(true)
    // ByteArray : égalité de référence
    const bytes = new Uint8Array([1])
    s.add(bytes)
    expect(s.has(new Uint8Array([1]))).toBe(false)
    expect(s.has(bytes)).toBe(true)
  })

  it('clear', () => {
    const s = new LinkedHashSet([p(1)])
    s.clear()
    expect(s.size).toBe(0)
    expect(s.has(p(1))).toBe(false)
    s.add(p(1))
    expect(s.has(p(1))).toBe(true)
  })

  it('equals any Set with the same elements (AbstractSet.equals)', () => {
    expect(eq(new LinkedHashSet([p(1), p(2)]), new Set([p(2), p(1)]))).toBe(true)
    expect(eq(new Set([p(2), p(1)]), new LinkedHashSet([p(1), p(2)]))).toBe(true)
    expect(eq(new Set([p(1), p(2)]), new Set([p(2), p(3)]))).toBe(false)
    expect(hash(new LinkedHashSet([p(1), p(2)]))).toBe(hash(new Set([p(2), p(1)])))
    expect(new HashSet(['a'])).toEqual(new Set(['a']))
    expect(new HashSet(['a']) instanceof LinkedHashSet).toBe(true)
  })
})

describe('LinkedHashMap', () => {
  it('uses equals/hashCode for keys, keeps the first key and its position, replaces the value', () => {
    const m = new LinkedHashMap<P, string>()
    const k1 = p(1)
    m.set(k1, 'a')
    m.set(p(2), 'b')
    m.set(p(1), 'c')
    expect(m.size).toBe(2)
    expect(m.get(p(1))).toBe('c')
    expect([...m.keys()][0]).toBe(k1)
    expect([...m.values()]).toEqual(['c', 'b'])
    expect(m.has(p(3))).toBe(false)
    expect(m.get(p(3))).toBeUndefined()
  })

  it('remove and collisions', () => {
    const m = new LinkedHashMap<Collide, number>([
      [new Collide(1), 1],
      [new Collide(2), 2],
    ])
    expect(m.delete(new Collide(1))).toBe(true)
    expect(m.delete(new Collide(1))).toBe(false)
    expect(m.get(new Collide(2))).toBe(2)
    m.set(new Collide(1), 3)
    expect([...m.values()]).toEqual([2, 3])
  })

  it('equals any Map with the same entries (AbstractMap.equals)', () => {
    const a = new LinkedHashMap<unknown, number>([
      [p(1), 1],
      ['x', 2],
    ])
    const b = new Map<unknown, number>([
      ['x', 2],
      [p(1), 1],
    ])
    expect(eq(a, b)).toBe(true)
    expect(eq(b, a)).toBe(true)
    expect(eq(b, new Map<unknown, number>([['x', 2], [p(1), 9]]))).toBe(false)
    expect(new HashMap([['a', 1]])).toEqual(new Map([['a', 1]]))
  })
})

describe('collection helpers', () => {
  it('distinct / distinctSet keep the first occurrence', () => {
    const a = p(1, 'first')
    const l = [a, p(2), new P({ x: 1, y: 'first' })]
    expect(distinct(l)).toHaveLength(2)
    expect(distinct(l)[0]).toBe(a)
    expect([...distinctSet(l)][0]).toBe(a)
  })

  it('distinctBy keeps the first element for each key', () => {
    expect(distinctBy([p(1, 'a'), p(1, 'b'), p(2, 'c')], (it) => it.x).map((it) => it.y)).toEqual(['a', 'c'])
    expect(distinctBy([p(1, 'a'), p(2, 'b'), p(3, 'a')], (it) => [it.y]).map((it) => it.x)).toEqual([1, 2])
  })

  it('union / intersect / subtract', () => {
    expect([...union([p(1), p(2)], [p(2), p(3)])].map((it) => it.x)).toEqual([1, 2, 3])
    expect([...intersect([p(3), p(1), p(2), p(1)], [p(1), p(3)])].map((it) => it.x)).toEqual([3, 1])
    expect([...subtract([p(1), p(2), p(3), p(2)], [p(2)])].map((it) => it.x)).toEqual([1, 3])
  })

  it('groupBy / associateBy / associate with data class keys', () => {
    const g = groupBy([p(1, 'a'), p(2, 'b'), p(1, 'c')], (it) => p(it.x))
    expect(g.size).toBe(2)
    expect(g.get(p(1))?.map((it) => it.y)).toEqual(['a', 'c'])
    const ab = associateBy([p(1, 'a'), p(2, 'b'), p(1, 'c')], (it) => p(it.x))
    expect([...ab.values()].map((it) => it.y)).toEqual(['c', 'b'])
    const as = associate([1, 2, 1], (it) => [p(it), it * 10])
    expect(as.size).toBe(2)
    expect(as.get(p(2))).toBe(20)
    const plus = mapPlus(as, [[p(1), 5]])
    expect([...plus.values()]).toEqual([5, 20])
  })

  it('scales linearly', () => {
    const l = Array.from({ length: 50_000 }, (_, i) => p(i % 25_000, 'x'))
    const t = performance.now()
    expect(distinct(l)).toHaveLength(25_000)
    expect(union(l, l).size).toBe(25_000)
    expect(groupBy(l, (it) => p(it.x)).size).toBe(25_000)
    expect(performance.now() - t).toBeLessThan(5_000)
  })
})
