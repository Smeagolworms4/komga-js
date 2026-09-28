// Support de portage : sous-ensemble de Micrometer (io.micrometer.core.instrument) utilisé par Komga, et le
// SimpleMeterRegistry auto-configuré par Spring Boot Actuator (bean `simpleMeterRegistry`, injectable comme MeterRegistry).
// Ce fichier n'a pas de jumeau Kotlin. Les mesures sont gardées en mémoire (lues par /actuator/metrics).
import type { Duration } from '@js-joda/core'
import { component } from './spring.js'

/** `io.micrometer.core.instrument.Tag` */
export class Tag {
  constructor(
    readonly key: string,
    readonly value: string,
  ) {}
}

/** `io.micrometer.core.instrument.Tags` (triés par clé, clés uniques) */
export class Tags implements Iterable<Tag> {
  private constructor(private readonly tags: Tag[]) {}

  /** `Tags.of(key, value, ...)` */
  static of(...keyValues: string[]): Tags {
    const m = new Map<string, string>()
    for (let i = 0; i + 1 < keyValues.length; i += 2) m.set(keyValues[i] as string, keyValues[i + 1] as string)
    return new Tags([...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => new Tag(k, v)))
  }

  static empty(): Tags {
    return new Tags([])
  }

  and(other: Tags): Tags {
    return Tags.of(...[...this.tags, ...other.tags].flatMap((t) => [t.key, t.value]))
  }

  [Symbol.iterator](): Iterator<Tag> {
    return this.tags[Symbol.iterator]()
  }

  /** clé d'identification */
  key(): string {
    return this.tags.map((t) => `${t.key}=${t.value}`).join(',')
  }
}

/** `Meter.Id` */
export class MeterId {
  constructor(
    readonly name: string,
    readonly tags: Tags,
    readonly type: 'TIMER' | 'COUNTER' | 'GAUGE',
    readonly description: string | null = null,
    readonly baseUnit: string | null = null,
  ) {}

  key(): string {
    return `${this.name}{${this.tags.key()}}`
  }
}

export abstract class Meter {
  constructor(readonly id: MeterId) {}
}

/** `io.micrometer.core.instrument.Timer` */
export class Timer extends Meter {
  private _count = 0
  private _totalNanos = 0
  private _maxNanos = 0

  record(duration: Duration): void {
    const nanos = duration.toNanos()
    if (nanos < 0) return
    this._count++
    this._totalNanos += nanos
    this._maxNanos = Math.max(this._maxNanos, nanos)
  }

  count(): number {
    return this._count
  }

  totalTimeNanos(): number {
    return this._totalNanos
  }

  maxNanos(): number {
    return this._maxNanos
  }

  static builder(name: string): Timer.Builder {
    return new Timer.Builder(name)
  }
}

export namespace Timer {
  export class Builder {
    private tags = Tags.empty()
    private desc: string | null = null
    constructor(private readonly name: string) {}
    description(description: string): this {
      this.desc = description
      return this
    }
    tag(key: string, value: string): this {
      this.tags = this.tags.and(Tags.of(key, value))
      return this
    }
    register(registry: MeterRegistry): Timer {
      // unité de base des Timer : l'unité de temps du registre (SimpleMeterRegistry : secondes)
      return registry.registerMeter(new MeterId(this.name, this.tags, 'TIMER', this.desc, 'seconds'), (id) => new Timer(id))
    }
  }
}

/** `io.micrometer.core.instrument.Counter` */
export class Counter extends Meter {
  private _count = 0

  increment(amount = 1): void {
    this._count += amount
  }

  count(): number {
    return this._count
  }

  static builder(name: string): Counter.Builder {
    return new Counter.Builder(name)
  }
}

export namespace Counter {
  export class Builder {
    private tags = Tags.empty()
    private desc: string | null = null
    constructor(private readonly name: string) {}
    description(description: string): this {
      this.desc = description
      return this
    }
    tag(key: string, value: string): this {
      this.tags = this.tags.and(Tags.of(key, value))
      return this
    }
    register(registry: MeterRegistry): Counter {
      return registry.registerMeter(new MeterId(this.name, this.tags, 'COUNTER', this.desc), (id) => new Counter(id))
    }
  }
}

/** `io.micrometer.core.instrument.Gauge` */
export class Gauge extends Meter {
  constructor(
    id: MeterId,
    private readonly f: () => number,
  ) {
    super(id)
  }

  value(): number {
    const v = this.f()
    return Number.isNaN(v) ? Number.NaN : v
  }

  /** `Gauge.builder(name, obj, f)` */
  static builder<T>(name: string, obj: T, f: (obj: T) => number): Gauge.Builder<T> {
    return new Gauge.Builder(name, obj, f)
  }
}

export namespace Gauge {
  export class Builder<T> {
    private tagList = Tags.empty()
    private desc: string | null = null
    private unit: string | null = null
    constructor(
      private readonly name: string,
      private readonly obj: T,
      private readonly f: (obj: T) => number,
    ) {}
    description(description: string): this {
      this.desc = description
      return this
    }
    baseUnit(unit: string): this {
      this.unit = unit
      return this
    }
    tags(tags: Tags): this {
      this.tagList = this.tagList.and(tags)
      return this
    }
    register(registry: MeterRegistry): Gauge {
      const obj = this.obj
      const f = this.f
      return registry.registerMeter(new MeterId(this.name, this.tagList, 'GAUGE', this.desc, this.unit), (id) => new Gauge(id, () => f(obj)))
    }
  }
}

/** `io.micrometer.core.instrument.MultiGauge` */
export class MultiGauge {
  private registered = new Map<string, Gauge>()

  private constructor(
    private readonly name: string,
    private readonly desc: string | null,
    private readonly unit: string | null,
    private readonly registry: MeterRegistry,
  ) {}

  /** `register(rows, overwrite)` : les lignes absentes sont retirées du registre */
  register(rows: Iterable<MultiGauge.Row>, overwrite = false): void {
    const next = new Map<string, Gauge>()
    for (const row of rows) {
      const id = new MeterId(this.name, row.uniqueTags, 'GAUGE', this.desc, this.unit)
      const k = id.key()
      const existing = this.registered.get(k)
      if (existing !== undefined && !overwrite) {
        next.set(k, existing)
        continue
      }
      if (existing !== undefined) this.registry.remove(existing)
      const value = row.value
      next.set(k, this.registry.registerMeter(id, (i) => new Gauge(i, () => value)))
    }
    for (const [k, g] of this.registered) if (!next.has(k)) this.registry.remove(g)
    this.registered = next
  }

  static builder(name: string): MultiGauge.Builder {
    return new MultiGauge.Builder(name)
  }

  /** @internal */
  static create(name: string, desc: string | null, unit: string | null, registry: MeterRegistry): MultiGauge {
    return new MultiGauge(name, desc, unit, registry)
  }
}

export namespace MultiGauge {
  export class Row {
    private constructor(
      readonly uniqueTags: Tags,
      readonly value: number,
    ) {}

    static of(uniqueTags: Tags, value: number): Row {
      return new Row(uniqueTags, value)
    }
  }

  export class Builder {
    private desc: string | null = null
    private unit: string | null = null
    constructor(private readonly name: string) {}
    description(description: string): this {
      this.desc = description
      return this
    }
    baseUnit(unit: string): this {
      this.unit = unit
      return this
    }
    register(registry: MeterRegistry): MultiGauge {
      return MultiGauge.create(this.name, this.desc, this.unit, registry)
    }
  }
}

/** `io.micrometer.core.instrument.MeterRegistry` */
export abstract class MeterRegistry {
  private readonly meters = new Map<string, Meter>()

  /** @internal enregistrement idempotent (même nom et mêmes tags : même instance) */
  registerMeter<M extends Meter>(id: MeterId, create: (id: MeterId) => M): M {
    const k = id.key()
    const existing = this.meters.get(k)
    if (existing !== undefined) return existing as M
    const m = create(id)
    this.meters.set(k, m)
    return m
  }

  remove(meter: Meter): void {
    this.meters.delete(meter.id.key())
  }

  getMeters(): Meter[] {
    return [...this.meters.values()]
  }

  /** `timer(name, vararg tags)` */
  timer(name: string, ...tags: string[]): Timer {
    return this.registerMeter(new MeterId(name, Tags.of(...tags), 'TIMER', null, 'seconds'), (id) => new Timer(id))
  }

  /** `counter(name, vararg tags)` */
  counter(name: string, ...tags: string[]): Counter {
    return this.registerMeter(new MeterId(name, Tags.of(...tags), 'COUNTER'), (id) => new Counter(id))
  }
}

/** `io.micrometer.core.instrument.simple.SimpleMeterRegistry` */
export class SimpleMeterRegistry extends MeterRegistry {}

component(SimpleMeterRegistry, { name: 'simpleMeterRegistry', types: [MeterRegistry] })
