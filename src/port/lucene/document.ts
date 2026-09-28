// Support de portage : sous-ensemble de org.apache.lucene.document / org.apache.lucene.index.Term (Lucene 9.9.1)
// utilisé par Komga : Document, Field.Store, TextField, StringField, Term, DateTools.dateToString.
// Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException, NullPointerException } from '../kotlin.js'
import { compareTerms, toTermText } from './analysis.js'

/** `IndexOptions` */
export type IndexOptions = 'DOCS' | 'DOCS_AND_FREQS_AND_POSITIONS'

/** `Field` (champ indexé, éventuellement stocké) */
export class Field {
  constructor(
    readonly name: string,
    readonly value: string,
    readonly store: Field.Store,
    readonly tokenized: boolean,
    readonly indexOptions: IndexOptions,
    readonly omitNorms: boolean,
  ) {
    if (name === null || name === undefined) throw new IllegalArgumentException('name must not be null')
    if (value === null || value === undefined) throw new IllegalArgumentException('value must not be null')
  }

  stringValue(): string {
    return this.value
  }
}

export namespace Field {
  /** Specifies whether and how a field should be stored. */
  export enum Store {
    YES = 'YES',
    NO = 'NO',
  }
}

/** A field that is indexed and tokenized, without term vectors. */
export class TextField extends Field {
  constructor(name: string, value: string, store: Field.Store) {
    super(name, value, store, true, 'DOCS_AND_FREQS_AND_POSITIONS', false)
  }
}

/** A field that is indexed but not tokenized: the entire String value is indexed as a single token. */
export class StringField extends Field {
  constructor(name: string, value: string, store: Field.Store) {
    super(name, value, store, false, 'DOCS', true)
  }
}

/** Documents are the unit of indexing and search. */
export class Document implements Iterable<Field> {
  private readonly fields: Field[] = []

  add(field: Field): void {
    this.fields.push(field)
  }

  getFields(): readonly Field[] {
    return this.fields
  }

  [Symbol.iterator](): Iterator<Field> {
    return this.fields[Symbol.iterator]()
  }

  /** `get(name)` : valeur du premier champ de ce nom, ou null */
  get(name: string): string | null {
    for (const field of this.fields) if (field.name === name) return field.stringValue()
    return null
  }
}

/** A Term represents a word from text. */
export class Term {
  /** texte du terme (BytesRef UTF-8) */
  readonly bytes: string

  constructor(
    readonly field: string,
    text: string,
  ) {
    if (text === null || text === undefined) throw new NullPointerException()
    this.bytes = toTermText(text)
  }

  text(): string {
    return this.bytes
  }

  equals(other: Term): boolean {
    return this.field === other.field && this.bytes === other.bytes
  }

  compareTo(other: Term): number {
    if (this.field === other.field) return compareTerms(this.bytes, other.bytes)
    return this.field < other.field ? -1 : 1
  }

  toString(): string {
    return `${this.field}:${this.bytes}`
  }
}

/** `DateTools` : seule la résolution YEAR est utilisée par Komga */
export namespace DateTools {
  export enum Resolution {
    YEAR = 'YEAR',
  }

  // début du calendrier grégorien de java.util.GregorianCalendar (15 octobre 1582)
  const GREGORIAN_CUTOVER = -12219292800000

  /** Année au sens de SimpleDateFormat("yyyy") en GMT (calendrier julien avant 1582, ère) */
  function yearOf(time: number): number {
    const days = Math.floor(time / 86400000)
    if (time >= GREGORIAN_CUTOVER) return new Date(days * 86400000).getUTCFullYear()
    // calendrier julien : jour julien -> année
    const jdn = days + 2440588
    const c = jdn + 32082
    const d = Math.floor((4 * c + 3) / 1461)
    const e = c - Math.floor((1461 * d) / 4)
    const m = Math.floor((5 * e + 2) / 153)
    return d - 4800 + Math.floor(m / 10)
  }

  /** `dateToString(Date, Resolution)` */
  export function dateToString(date: Date, resolution: Resolution): string {
    if (resolution !== Resolution.YEAR) throw new NullPointerException()
    const year = yearOf(date.getTime())
    // SimpleDateFormat "yyyy" : année de l'ère (1 - année avant J.-C.), au moins 4 chiffres
    const y = year <= 0 ? 1 - year : year
    return String(y).padStart(4, '0')
  }
}
