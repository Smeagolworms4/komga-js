// Support de portage : sous-ensemble de org.apache.lucene.index (Lucene 9.9.1) utilisé par Komga :
// IndexWriter (addDocument, addDocuments, updateDocument, deleteDocuments, commit, close), IndexWriterConfig,
// DirectoryReader (indexExists, open(IndexWriter) : lecteur quasi temps réel), IndexUpgrader (sans effet).
//
// L'inversion des documents reprend IndexingChain.PerField.invert (positions, incréments, recouvrements,
// écart de position entre valeurs d'un même champ, norme BM25 = SmallFloat.intToByte4(longueur - recouvrements)).
//
// PORT: l'index est un seul « segment » en mémoire, persisté par le Directory sous forme de journal de documents
// (voir store.ts) et reconstruit (réanalysé) à l'ouverture. Les numéros de documents suivent l'ordre d'ajout.
// Écarts assumés avec Lucene, dont le comportement dépend lui-même du moment des fusions de segments :
// - les statistiques (docFreq, docCount, sumTotalTermFreq) ne comptent que les documents vivants, comme après
//   une fusion complète (Lucene compte aussi les documents supprimés tant que leur segment n'est pas fusionné) ;
// - l'ordre des documents à score égal est l'ordre d'ajout (une fusion Lucene peut réordonner des segments).
// Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException, IllegalStateException } from '../kotlin.js'
import type { Analyzer } from './analysis.js'
import { toTermText } from './analysis.js'
import { Document, Field, type IndexOptions, StringField, Term, TextField } from './document.js'
import type { Directory } from './store.js'

/** `IndexWriter.MAX_TERM_LENGTH` (octets UTF-8) */
export const MAX_TERM_LENGTH = 32766
/** `IndexWriter.MAX_POSITION` */
export const MAX_POSITION = 2147483647 - 128

// ---------------------------------------------------------------------------
// SmallFloat
// ---------------------------------------------------------------------------

export namespace SmallFloat {
  function numberOfLeadingZeros64(i: number): number {
    return i === 0 ? 64 : 64 - Math.floor(Math.log2(i)) - 1
  }

  export function longToInt4(i: number): number {
    if (i < 0) {
      throw new IllegalArgumentException(`Only supports positive values, got ${i}`)
    }
    const numBits = 64 - numberOfLeadingZeros64(i)
    if (numBits < 4) {
      // subnormal value
      return i
    } else {
      // normal value
      const shift = numBits - 4
      // only keep the 5 most significant bits
      let encoded = Math.floor(i / 2 ** shift)
      // clear the most significant bit, which is implicit
      encoded &= 0x07
      // encode the shift, adding 1 because 0 is reserved for subnormal values
      encoded |= (shift + 1) << 3
      return encoded
    }
  }

  export function int4ToLong(i: number): number {
    const bits = i & 0x07
    const shift = (i >>> 3) - 1
    let decoded: number
    if (shift === -1) {
      // subnormal value
      decoded = bits
    } else {
      // normal value
      decoded = (bits | 0x08) * 2 ** shift
    }
    return decoded
  }

  const MAX_INT4 = longToInt4(2147483647)
  const NUM_FREE_VALUES = 255 - MAX_INT4

  /** Encode an integer to a byte (unsigned 0-255 here) */
  export function intToByte4(i: number): number {
    if (i < 0) {
      throw new IllegalArgumentException(`Only supports positive values, got ${i}`)
    }
    if (i < NUM_FREE_VALUES) {
      return i
    } else {
      return (NUM_FREE_VALUES + longToInt4(i - NUM_FREE_VALUES)) & 0xff
    }
  }

  /** Decode values that have been encoded with intToByte4 (unsigned byte) */
  export function byte4ToInt(b: number): number {
    const i = b & 0xff
    if (i < NUM_FREE_VALUES) {
      return i
    } else {
      return NUM_FREE_VALUES + int4ToLong(i - NUM_FREE_VALUES)
    }
  }
}

// ---------------------------------------------------------------------------
// Données de l'index
// ---------------------------------------------------------------------------

/** Champ inversé d'un document */
export type FieldData = {
  indexOptions: IndexOptions
  /** norme encodée (octet non signé), -1 si omitNorms */
  norm: number
  /** contribution à sumTotalTermFreq */
  totalTermFreq: number
  /** terme -> positions (vide pour un champ DOCS) */
  terms: Map<string, number[]>
}

export class DocRecord {
  /** génération de suppression (Infinity tant que le document est vivant) */
  deletedGen = Infinity

  constructor(
    readonly id: number,
    readonly fields: Map<string, FieldData>,
    readonly stored: readonly (readonly [string, string])[],
    readonly source: SerializedDoc,
  ) {}
}

type FieldStats = { docCount: number; sumTotalTermFreq: number; sumDocFreq: number }

/** Structures partagées entre l'écrivain et les lecteurs (remplacées, jamais vidées, lors d'un compactage) */
export class IndexData {
  readonly docs = new Map<number, DocRecord>()
  readonly postings = new Map<string, Map<string, DocRecord[]>>()
  readonly fieldOptions = new Map<string, IndexOptions>()
}

/** Document sérialisé : [nom, valeur, type] (t = TextField, s = StringField ; majuscule = Store.YES) */
export type SerializedDoc = [string, string, string][]

function serialize(doc: Document): SerializedDoc {
  return doc.getFields().map((f) => [f.name, f.value, (f.tokenized ? 't' : 's')[f.store === Field.Store.YES ? 'toUpperCase' : 'toLowerCase']()])
}

function deserialize(s: SerializedDoc): Document {
  const doc = new Document()
  for (const [name, value, kind] of s) {
    const store = kind === 'T' || kind === 'S' ? Field.Store.YES : Field.Store.NO
    doc.add(kind === 't' || kind === 'T' ? new TextField(name, value, store) : new StringField(name, value, store))
  }
  return doc
}

function utf8Length(s: string): number {
  return Buffer.byteLength(s, 'utf8')
}

// ---------------------------------------------------------------------------
// IndexWriter
// ---------------------------------------------------------------------------

export class IndexWriterConfig {
  constructor(readonly analyzer: Analyzer) {}
}

type Op = ['a', SerializedDoc] | ['d', string, string] | ['u', string, string, SerializedDoc]

export class IndexWriter {
  private data = new IndexData()
  private readonly stats = new Map<string, FieldStats>()
  private nextId = 0
  private gen = 0
  private liveCount = 0
  private deletedCount = 0
  private pending: Op[] = []
  private hasCommit: boolean
  private logLength = 0
  private closed = false
  /** incrémenté à chaque modification visible (pour SearcherManager.maybeRefresh) */
  version = 0

  private readonly analyzer: Analyzer

  constructor(
    private readonly directory: Directory,
    conf: IndexWriterConfig,
  ) {
    this.analyzer = conf.analyzer
    // OpenMode.CREATE_OR_APPEND : relit le dernier commit
    const log = directory.readCommits()
    this.hasCommit = log !== null && log.commits.length > 0
    if (log !== null) {
      for (const line of log.commits) for (const op of (JSON.parse(line) as { ops: Op[] }).ops) this.apply(op)
      this.logLength = log.commits.length
      if (log.needsRewrite) this.rewriteLog()
    }
    this.version = 0
  }

  private ensureOpen(): void {
    if (this.closed) throw new AlreadyClosedException('this IndexWriter is closed')
  }

  private apply(op: Op): void {
    switch (op[0]) {
      case 'a':
        this.addInternal(deserialize(op[1]), op[1])
        break
      case 'd':
        this.deleteInternal(new Term(op[1], op[2]))
        break
      case 'u':
        this.deleteInternal(new Term(op[1], op[2]))
        this.addInternal(deserialize(op[3]), op[3])
        break
    }
  }

  addDocument(doc: Iterable<Field> & Document): void {
    this.ensureOpen()
    const s = serialize(doc)
    const record = this.invert(doc, s)
    this.index(record)
    this.pending.push(['a', s])
  }

  addDocuments(docs: Iterable<Document>): void {
    this.ensureOpen()
    // les documents d'un bloc sont inversés avant d'être ajoutés (tout ou rien)
    const records = [...docs].map((d) => {
      const s = serialize(d)
      return [this.invert(d, s), s] as const
    })
    for (const [r, s] of records) {
      this.index(r)
      this.pending.push(['a', s])
    }
  }

  updateDocument(term: Term, doc: Document): void {
    this.ensureOpen()
    const s = serialize(doc)
    const record = this.invert(doc, s)
    this.deleteInternal(term)
    this.index(record)
    this.pending.push(['u', term.field, term.bytes, s])
  }

  deleteDocuments(...terms: Term[]): void {
    this.ensureOpen()
    for (const term of terms) {
      this.deleteInternal(term)
      this.pending.push(['d', term.field, term.bytes])
    }
  }

  /** Commits all pending changes */
  commit(): number {
    this.ensureOpen()
    if (this.pending.length > 0 || !this.hasCommit) {
      this.directory.appendCommit(JSON.stringify({ ops: this.pending }))
      this.pending = []
      this.hasCommit = true
      this.logLength++
      // compactage du journal quand il contient beaucoup plus d'opérations que de documents vivants
      if (this.logLength > 1000 && this.logLength > this.liveCount) this.rewriteLog()
    }
    // compactage de la mémoire quand les documents supprimés dominent
    if (this.deletedCount > 1000 && this.deletedCount > this.liveCount) this.compact()
    return this.gen
  }

  /** Closes all open resources and releases the write lock (commitOnClose = true) */
  close(): void {
    if (this.closed) return
    this.commit()
    this.closed = true
  }

  // PORT: méthode de destruction déduite par Spring pour un @Bean Closeable (IndexWriter.close())
  destroy(): void {
    this.close()
  }

  isOpen(): boolean {
    return !this.closed
  }

  private rewriteLog(): void {
    const ops: Op[] = []
    for (const d of this.data.docs.values()) if (d.deletedGen === Infinity) ops.push(['a', d.source])
    // les opérations non encore validées restent en attente
    this.directory.rewrite([JSON.stringify({ ops })])
    this.logLength = 1
  }

  private compact(): void {
    const data = new IndexData()
    for (const d of this.data.docs.values()) {
      if (d.deletedGen !== Infinity) continue
      data.docs.set(d.id, d)
      this.addPostings(data, d)
    }
    for (const [f, o] of this.data.fieldOptions) data.fieldOptions.set(f, o)
    this.data = data
    this.deletedCount = 0
  }

  // -------------------------------------------------------------------------
  // Inversion (IndexingChain)
  // -------------------------------------------------------------------------

  private invert(doc: Document, source: SerializedDoc): DocRecord {
    const fields = new Map<string, FieldData>()
    const states = new Map<string, InvertState>()
    const stored: [string, string][] = []
    for (const field of doc) {
      if (field.store === Field.Store.YES) stored.push([field.name, field.stringValue()])
      const first = !states.has(field.name)
      let state = states.get(field.name)
      if (state === undefined) {
        state = new InvertState()
        states.set(field.name, state)
      }
      let fd = fields.get(field.name)
      if (fd === undefined) {
        fd = { indexOptions: field.indexOptions, norm: -1, totalTermFreq: 0, terms: new Map() }
        fields.set(field.name, fd)
      } else if (fd.indexOptions !== field.indexOptions) {
        throw new IllegalArgumentException(`cannot change field "${field.name}" from index options=${fd.indexOptions} to inconsistent index options=${field.indexOptions}`)
      }
      const known = this.data.fieldOptions.get(field.name)
      if (known !== undefined && known !== field.indexOptions)
        throw new IllegalArgumentException(`cannot change field "${field.name}" from index options=${known} to inconsistent index options=${field.indexOptions}`)
      if (first) state.reset()
      if (field.tokenized) this.invertTokenStream(field, state, fd)
      else this.invertTerm(field, state, fd)
    }
    // PerField.finish : normes
    for (const [name, fd] of fields) {
      const state = states.get(name) as InvertState
      const omitNorms = doc.getFields().find((f) => f.name === name)?.omitNorms ?? true
      if (!omitNorms) {
        // BM25Similarity.computeNorm, discountOverlaps = true
        fd.norm = state.length === 0 ? 0 : SmallFloat.intToByte4(state.length - state.numOverlap)
      }
      fd.totalTermFreq = fd.indexOptions === 'DOCS' ? fd.terms.size : state.length
    }
    return new DocRecord(-1, fields, stored, source)
  }

  private invertTerm(field: Field, state: InvertState, fd: FieldData): void {
    const term = toTermText(field.stringValue())
    if (utf8Length(term) > MAX_TERM_LENGTH)
      throw new IllegalArgumentException(`Document contains at least one immense term in field="${field.name}" (whose UTF8 encoding is longer than the max length ${MAX_TERM_LENGTH}), all of which were skipped.`)
    state.position++
    state.length++
    if (!fd.terms.has(term)) fd.terms.set(term, [])
  }

  private invertTokenStream(field: Field, state: InvertState, fd: FieldData): void {
    const stream = this.analyzer.tokenStream(field.name, field.stringValue())
    const att = stream.attributes
    try {
      stream.reset()
      while (stream.incrementToken()) {
        const posIncr = att.positionIncrement
        state.position += posIncr
        if (state.position < state.lastPosition) {
          if (posIncr === 0) {
            throw new IllegalArgumentException(`first position increment must be > 0 (got 0) for field '${field.name}'`)
          } else {
            throw new IllegalArgumentException(`position overflowed Integer.MAX_VALUE (got posIncr=${posIncr} lastPosition=${state.lastPosition} position=${state.position}) for field '${field.name}'`)
          }
        } else if (state.position > MAX_POSITION) {
          throw new IllegalArgumentException(`position ${state.position} is too large for field '${field.name}': max allowed position is ${MAX_POSITION}`)
        }
        state.lastPosition = state.position
        if (posIncr === 0) {
          state.numOverlap++
        }

        const startOffset = state.offset + att.startOffset
        const endOffset = state.offset + att.endOffset
        if (startOffset < state.lastStartOffset || endOffset < startOffset) {
          throw new IllegalArgumentException(
            `startOffset must be non-negative, and endOffset must be >= startOffset, and offsets must not go backwards startOffset=${startOffset},endOffset=${endOffset},lastStartOffset=${state.lastStartOffset} for field '${field.name}'`,
          )
        }
        state.lastStartOffset = startOffset

        state.length += att.termFrequency

        const term = toTermText(att.termAtt.toString())
        if (utf8Length(term) > MAX_TERM_LENGTH)
          throw new IllegalArgumentException(`Document contains at least one immense term in field="${field.name}" (whose UTF8 encoding is longer than the max length ${MAX_TERM_LENGTH}), all of which were skipped.`)
        let positions = fd.terms.get(term)
        if (positions === undefined) {
          positions = []
          fd.terms.set(term, positions)
        }
        positions.push(state.position)
      }

      // trigger streams to perform end-of-stream operations
      stream.end()

      state.position += att.positionIncrement
      state.offset += att.endOffset
    } finally {
      stream.close()
    }

    state.position += this.analyzer.getPositionIncrementGap(field.name)
    state.offset += this.analyzer.getOffsetGap(field.name)
  }

  // -------------------------------------------------------------------------
  // Ajout / suppression
  // -------------------------------------------------------------------------

  private addInternal(doc: Document, s: SerializedDoc): void {
    this.index(this.invert(doc, s))
  }

  private index(r: DocRecord): void {
    const record = new DocRecord(this.nextId++, r.fields, r.stored, r.source)
    this.data.docs.set(record.id, record)
    this.addPostings(this.data, record)
    for (const [name, fd] of record.fields) {
      if (!this.data.fieldOptions.has(name)) this.data.fieldOptions.set(name, fd.indexOptions)
      if (fd.terms.size === 0) continue
      const st = this.stats.get(name) ?? { docCount: 0, sumTotalTermFreq: 0, sumDocFreq: 0 }
      st.docCount++
      st.sumTotalTermFreq += fd.totalTermFreq
      st.sumDocFreq += fd.terms.size
      this.stats.set(name, st)
    }
    this.liveCount++
    this.version++
  }

  private addPostings(data: IndexData, record: DocRecord): void {
    for (const [name, fd] of record.fields) {
      let byTerm = data.postings.get(name)
      if (byTerm === undefined) {
        byTerm = new Map()
        data.postings.set(name, byTerm)
      }
      for (const term of fd.terms.keys()) {
        const list = byTerm.get(term)
        if (list === undefined) byTerm.set(term, [record])
        else list.push(record)
      }
    }
  }

  private deleteInternal(term: Term): void {
    const list = this.data.postings.get(term.field)?.get(term.bytes)
    if (list === undefined) return
    for (const record of list) {
      if (record.deletedGen !== Infinity) continue
      record.deletedGen = ++this.gen
      for (const [name, fd] of record.fields) {
        if (fd.terms.size === 0) continue
        const st = this.stats.get(name) as FieldStats
        st.docCount--
        st.sumTotalTermFreq -= fd.totalTermFreq
        st.sumDocFreq -= fd.terms.size
      }
      this.liveCount--
      this.deletedCount++
      this.version++
    }
  }

  /** Lecteur quasi temps réel (DirectoryReader.open(IndexWriter)) : vue figée de l'état courant */
  getReader(): IndexReader {
    this.ensureOpen()
    const stats = new Map<string, FieldStats>()
    for (const [k, v] of this.stats) stats.set(k, { ...v })
    return new IndexReader(this.data, this.nextId, this.gen, this.liveCount, stats, this.version)
  }
}

class InvertState {
  position = -1
  length = 0
  numOverlap = 0
  offset = 0
  lastStartOffset = 0
  lastPosition = 0

  reset(): void {
    this.position = -1
    this.length = 0
    this.numOverlap = 0
    this.offset = 0
    this.lastStartOffset = 0
    this.lastPosition = 0
  }
}

export class AlreadyClosedException extends IllegalStateException {}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** `CollectionStatistics` */
export type CollectionStatistics = { field: string; maxDoc: number; docCount: number; sumTotalTermFreq: number; sumDocFreq: number }

/** Vue figée de l'index (DirectoryReader) */
export class IndexReader {
  constructor(
    private readonly data: IndexData,
    /** documents d'identifiant < maxDoc visibles */
    private readonly maxDocId: number,
    private readonly gen: number,
    private readonly numDocsL: number,
    private readonly stats: Map<string, FieldStats>,
    readonly version: number,
  ) {}

  isLive(d: DocRecord): boolean {
    return d.id < this.maxDocId && d.deletedGen > this.gen
  }

  maxDoc(): number {
    return this.maxDocId
  }

  numDocs(): number {
    return this.numDocsL
  }

  /** documents vivants, par identifiant croissant */
  *liveDocs(): Iterable<DocRecord> {
    for (const d of this.data.docs.values()) if (this.isLive(d)) yield d
  }

  /** postings vivants d'un terme, par identifiant croissant */
  postings(field: string, term: string): DocRecord[] {
    const list = this.data.postings.get(field)?.get(term)
    if (list === undefined) return []
    return list.filter((d) => this.isLive(d))
  }

  /** termes d'un champ ayant au moins un document vivant (ordre quelconque) */
  *terms(field: string): Iterable<string> {
    const byTerm = this.data.postings.get(field)
    if (byTerm === undefined) return
    for (const [term, list] of byTerm) if (list.some((d) => this.isLive(d))) yield term
  }

  /** `reader.terms(field) != null` : le champ a des termes */
  hasField(field: string): boolean {
    const st = this.stats.get(field)
    return st !== undefined && st.docCount > 0
  }

  fieldIndexOptions(field: string): IndexOptions | null {
    return this.data.fieldOptions.get(field) ?? null
  }

  collectionStatistics(field: string): CollectionStatistics | null {
    const st = this.stats.get(field)
    if (st === undefined || st.docCount === 0) return null
    return { field, maxDoc: this.maxDocId, docCount: st.docCount, sumTotalTermFreq: st.sumTotalTermFreq, sumDocFreq: st.sumDocFreq }
  }

  /** `TermStates.build` : docFreq et totalTermFreq d'un terme */
  termStates(term: Term): { docFreq: number; totalTermFreq: number } {
    const docs = this.postings(term.field, term.bytes)
    let ttf = 0
    const docsOnly = this.fieldIndexOptions(term.field) === 'DOCS'
    for (const d of docs) ttf += docsOnly ? 1 : ((d.fields.get(term.field) as FieldData).terms.get(term.bytes) as number[]).length
    return { docFreq: docs.length, totalTermFreq: ttf }
  }

  /** `storedFields().document(docID)` */
  document(docId: number): Document {
    const d = this.data.docs.get(docId)
    if (d === undefined) throw new IllegalArgumentException(`docID must be >= 0 and < maxDoc=${this.maxDocId} (got docID=${docId})`)
    const doc = new Document()
    for (const [name, value] of d.stored) doc.add(new StoredField(name, value))
    return doc
  }
}

/** champ relu depuis les champs stockés */
class StoredField extends Field {
  constructor(name: string, value: string) {
    super(name, value, Field.Store.YES, false, 'DOCS', true)
  }
}

export namespace DirectoryReader {
  /** Returns true if an index likely exists at the specified directory. */
  export function indexExists(directory: Directory): boolean {
    const log = directory.readCommits()
    return log !== null && log.commits.length > 0
  }

  /** Open a near real time IndexReader from the IndexWriter. */
  export function open(writer: IndexWriter): IndexReader {
    return writer.getReader()
  }
}

/** This is an easy-to-use tool that upgrades all segments of an index from previous Lucene versions */
export class IndexUpgrader {
  constructor(
    private readonly dir: Directory,
    private readonly conf: IndexWriterConfig,
    private readonly deletePriorCommits: boolean,
  ) {}

  // PORT: format d'index propre à KomgaJS, pas de segments d'une ancienne version de Lucene à réécrire
  upgrade(): void {}
}
