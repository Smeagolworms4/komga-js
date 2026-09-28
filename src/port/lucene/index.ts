// Support de portage : sous-ensemble de org.apache.lucene.index (Lucene 9.9.1) utilisé par Komga :
// IndexWriter (addDocument, addDocuments, updateDocument, deleteDocuments, commit, close), IndexWriterConfig,
// DirectoryReader (indexExists, open(IndexWriter) : lecteur quasi temps réel), IndexUpgrader (sans effet).
//
// L'inversion des documents reprend IndexingChain.PerField.invert (positions, incréments, recouvrements,
// écart de position entre valeurs d'un même champ, norme BM25 = SmallFloat.intToByte4(longueur - recouvrements)).
//
// PORT: l'index est un seul « segment » en mémoire (hors du tas V8 : voir TermPostings), persisté par le Directory sous forme de journal de documents
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
import { type Directory, LockObtainFailedException } from './store.js'
import { FileNotFoundException } from '../java-io.js'

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

// PORT: l'index est gardé hors du tas V8, dans des tableaux typés, comme les structures de l'IndexingChain de Lucene
// (ByteBlockPool, BytesRefHash, ByteSlicePool) : dictionnaire des termes, postings codés en octets (vint, écarts)
// par tranches chaînées de taille croissante, champs par document, documents sérialisés. Un index en objets JS
// (une Map terme -> positions par champ et par document) occupait ~70 Ko de tas par livre (n-grammes des titres) :
// 5 000 livres dépassaient un tas de 256 Mo pendant RebuildIndex. Reste dans le tas : un petit objet par document.

function grow<T extends Int32Array | Uint8Array | Uint16Array>(a: T, n: number): T {
  if (n <= a.length) return a
  const b = new (a.constructor as new (n: number) => T)(Math.max(n, a.length * 2))
  b.set(a)
  return b
}

/** Entiers 32 bits extensibles */
class IntStore {
  data = new Int32Array(1024)
  size = 0

  push(v: number): void {
    if (this.size === this.data.length) this.data = grow(this.data, this.size + 1)
    this.data[this.size++] = v
  }
}

const TEXT_BLOCK = 1 << 20

/** Textes (documents sérialisés) en UTF-8, par blocs de 1 Mo ; adresse = bloc × TEXT_BLOCK + position */
class TextStore {
  private readonly blocks: Buffer[] = []
  private upto = TEXT_BLOCK

  /** Ajoute un texte, renvoie son adresse ; sa longueur en octets est `Buffer.byteLength(s)` */
  append(s: string, length: number): number {
    if (length > TEXT_BLOCK) {
      // texte plus grand qu'un bloc : bloc dédié
      this.blocks.push(Buffer.from(s, 'utf8'))
      this.upto = TEXT_BLOCK
      return (this.blocks.length - 1) * TEXT_BLOCK
    }
    if (this.upto + length > TEXT_BLOCK) {
      this.blocks.push(Buffer.allocUnsafeSlow(TEXT_BLOCK))
      this.upto = 0
    }
    const address = (this.blocks.length - 1) * TEXT_BLOCK + this.upto
    ;(this.blocks[this.blocks.length - 1] as Buffer).write(s, this.upto, 'utf8')
    this.upto += length
    return address
  }

  get(address: number, length: number): string {
    const o = address % TEXT_BLOCK
    return (this.blocks[Math.floor(address / TEXT_BLOCK)] as Buffer).toString('utf8', o, o + length)
  }
}

const CHAR_BLOCK_BITS = 16
const CHAR_BLOCK = 1 << CHAR_BLOCK_BITS
const POOL_BLOCK_BITS = 16
const POOL_BLOCK = 1 << POOL_BLOCK_BITS
const POOL_MASK = POOL_BLOCK - 1
/** tailles des tranches successives de la liste d'un terme ; les 4 derniers octets reçoivent l'adresse de la suivante */
const LEVEL_SIZES = [12, 16, 32, 64, 128, 256, 512, 1024, 2048]
const MAX_LEVEL = LEVEL_SIZES.length - 1

/**
 * Dictionnaire des termes (numéro de champ, texte UTF-16) -> numéro de terme, table de hachage à adressage ouvert
 * (BytesRefHash), et postings de chaque terme : pour chaque document, vint(écart de numéro), puis si positions :
 * vint(freq), vint(écart de position) × freq.
 */
export class TermPostings {
  // textes des termes (unités UTF-16), par blocs ; un terme ne chevauche pas deux blocs
  private readonly chars: Uint16Array[] = []
  private charUpto = CHAR_BLOCK
  // table de hachage : numéro de terme + 1 (0 = libre)
  private table = new Int32Array(1 << 12)
  // métadonnées des termes, indexées par numéro de terme
  private termField = new Int32Array(1024)
  private termText = new Int32Array(1024)
  private termLength = new Uint16Array(1024)
  private termHash = new Int32Array(1024)
  private start = new Int32Array(1024)
  private upto = new Int32Array(1024)
  private end = new Int32Array(1024)
  private level = new Uint8Array(1024)
  private lastDoc = new Int32Array(1024)
  numTerms = 0
  // postings
  private readonly blocks: Uint8Array[] = []
  private blockUpto = POOL_BLOCK

  private static hash(field: number, term: string): number {
    let h = Math.imul(field + 1, 0x9e3779b1)
    for (let i = 0; i < term.length; i++) h = Math.imul(h ^ term.charCodeAt(i), 0x01000193)
    return h ^ (h >>> 16)
  }

  private equals(t: number, field: number, term: string): boolean {
    if (this.termField[t] !== field || this.termLength[t] !== term.length) return false
    const a = this.termText[t] as number
    const block = this.chars[a >>> CHAR_BLOCK_BITS] as Uint16Array
    const o = a & (CHAR_BLOCK - 1)
    for (let i = 0; i < term.length; i++) if (block[o + i] !== term.charCodeAt(i)) return false
    return true
  }

  /** Numéro du terme, -1 s'il n'existe pas */
  find(field: number, term: string): number {
    const mask = this.table.length - 1
    for (let slot = TermPostings.hash(field, term) & mask; ; slot = (slot + 1) & mask) {
      const e = this.table[slot] as number
      if (e === 0) return -1
      if (this.equals(e - 1, field, term)) return e - 1
    }
  }

  /** Numéro du terme, créé s'il n'existe pas */
  add(field: number, term: string): number {
    const h = TermPostings.hash(field, term)
    const mask = this.table.length - 1
    let slot = h & mask
    for (; ; slot = (slot + 1) & mask) {
      const e = this.table[slot] as number
      if (e === 0) break
      if (this.equals(e - 1, field, term)) return e - 1
    }
    const t = this.numTerms++
    if (t >= this.termField.length) {
      const n = t + 1
      this.termField = grow(this.termField, n)
      this.termText = grow(this.termText, n)
      this.termLength = grow(this.termLength, n)
      this.termHash = grow(this.termHash, n)
      this.start = grow(this.start, n)
      this.upto = grow(this.upto, n)
      this.end = grow(this.end, n)
      this.level = grow(this.level, n)
      this.lastDoc = grow(this.lastDoc, n)
    }
    // texte (MAX_TERM_LENGTH octets UTF-8 : au plus 32766 unités UTF-16, tient dans un bloc)
    if (this.charUpto + term.length > CHAR_BLOCK) {
      this.chars.push(new Uint16Array(CHAR_BLOCK))
      this.charUpto = 0
    }
    const block = this.chars[this.chars.length - 1] as Uint16Array
    for (let i = 0; i < term.length; i++) block[this.charUpto + i] = term.charCodeAt(i)
    this.termText[t] = (this.chars.length - 1) * CHAR_BLOCK + this.charUpto
    this.charUpto += term.length
    this.termLength[t] = term.length
    this.termField[t] = field
    this.termHash[t] = h
    // première tranche de postings
    const address = this.alloc(LEVEL_SIZES[0] as number)
    this.start[t] = address
    this.upto[t] = address
    this.end[t] = address + (LEVEL_SIZES[0] as number) - 4
    this.level[t] = 0
    this.lastDoc[t] = -1
    this.table[slot] = t + 1
    // facteur de charge 1/2
    if (this.numTerms * 2 > this.table.length) this.rehash()
    return t
  }

  private rehash(): void {
    const table = new Int32Array(this.table.length * 2)
    const mask = table.length - 1
    for (let t = 0; t < this.numTerms; t++) {
      let slot = (this.termHash[t] as number) & mask
      while (table[slot] !== 0) slot = (slot + 1) & mask
      table[slot] = t + 1
    }
    this.table = table
  }

  field(t: number): number {
    return this.termField[t] as number
  }

  text(t: number): string {
    const a = this.termText[t] as number
    const o = a & (CHAR_BLOCK - 1)
    const block = this.chars[a >>> CHAR_BLOCK_BITS] as Uint16Array
    return String.fromCharCode.apply(null, block.subarray(o, o + (this.termLength[t] as number)) as unknown as number[])
  }

  private alloc(size: number): number {
    if (this.blockUpto + size > POOL_BLOCK) {
      this.blocks.push(new Uint8Array(POOL_BLOCK))
      this.blockUpto = 0
    }
    const address = (this.blocks.length - 1) * POOL_BLOCK + this.blockUpto
    this.blockUpto += size
    return address
  }

  private writeByte(t: number, b: number): void {
    let u = this.upto[t] as number
    if (u === this.end[t]) {
      // tranche pleine : la suivante, plus grande, est chaînée par son adresse
      const lv = Math.min((this.level[t] as number) + 1, MAX_LEVEL)
      const size = LEVEL_SIZES[lv] as number
      const next = this.alloc(size)
      const block = this.blocks[u >>> POOL_BLOCK_BITS] as Uint8Array
      const o = u & POOL_MASK
      block[o] = next >>> 24
      block[o + 1] = (next >>> 16) & 0xff
      block[o + 2] = (next >>> 8) & 0xff
      block[o + 3] = next & 0xff
      this.level[t] = lv
      this.end[t] = next + size - 4
      u = next
    }
    ;(this.blocks[u >>> POOL_BLOCK_BITS] as Uint8Array)[u & POOL_MASK] = b
    this.upto[t] = u + 1
  }

  private writeVInt(t: number, v: number): void {
    while (v > 0x7f) {
      this.writeByte(t, (v & 0x7f) | 0x80)
      v >>>= 7
    }
    this.writeByte(t, v)
  }

  /** Ajoute un document (numéro croissant) aux postings du terme ; positions croissantes, null pour un champ DOCS */
  addPosting(t: number, docId: number, positions: readonly number[] | null): void {
    this.writeVInt(t, docId - (this.lastDoc[t] as number))
    this.lastDoc[t] = docId
    if (positions !== null) {
      this.writeVInt(t, positions.length)
      let last = 0
      for (const p of positions) {
        this.writeVInt(t, p - last)
        last = p
      }
    }
  }

  /** Décode les postings du terme : `consumer` reçoit chaque document (positions : null pour un champ DOCS) */
  read(t: number, positional: boolean, consumer: (docId: number, freq: number, positions: number[] | null) => void): void {
    const blocks = this.blocks
    const stop = this.upto[t] as number
    let address = this.start[t] as number
    let level = 0
    let end = address + (LEVEL_SIZES[0] as number) - 4
    const readByte = (): number => {
      if (address === end) {
        const block = blocks[address >>> POOL_BLOCK_BITS] as Uint8Array
        const o = address & POOL_MASK
        address = (((block[o] as number) << 24) | ((block[o + 1] as number) << 16) | ((block[o + 2] as number) << 8) | (block[o + 3] as number)) >>> 0
        level = Math.min(level + 1, MAX_LEVEL)
        end = address + (LEVEL_SIZES[level] as number) - 4
      }
      const b = (blocks[address >>> POOL_BLOCK_BITS] as Uint8Array)[address & POOL_MASK] as number
      address++
      return b
    }
    const readVInt = (): number => {
      let b = readByte()
      let v = b & 0x7f
      for (let shift = 7; b & 0x80; shift += 7) {
        b = readByte()
        v += (b & 0x7f) * 2 ** shift
      }
      return v
    }
    let doc = -1
    while (address !== stop) {
      doc += readVInt()
      if (positional) {
        const freq = readVInt()
        const positions: number[] = new Array(freq)
        let p = 0
        for (let i = 0; i < freq; i++) {
          p += readVInt()
          positions[i] = p
        }
        consumer(doc, freq, positions)
      } else {
        consumer(doc, 1, null)
      }
    }
  }
}

/** Champ inversé d'un document (transitoire, avant l'écriture des postings) */
type FieldData = {
  indexOptions: IndexOptions
  /** norme encodée (octet non signé), -1 si omitNorms */
  norm: number
  /** contribution à sumTotalTermFreq */
  totalTermFreq: number
  /** terme -> positions (vide pour un champ DOCS) */
  terms: Map<string, number[]>
}

type Inverted = { fields: Map<string, FieldData> }

/** Nombre d'entiers par champ d'un document dans `IndexData.docFields` : numéro du champ, norme, totalTermFreq, nombre de termes */
const FIELD_INTS = 4

export class DocRecord {
  /** génération de suppression (Infinity tant que le document est vivant) */
  deletedGen = Infinity

  constructor(
    readonly id: number,
    /** champs ayant des termes : position dans `IndexData.docFields` et nombre d'entiers */
    readonly fieldsAt: number,
    readonly fieldsLength: number,
    /** document sérialisé (JSON de SerializedDoc) : adresse dans `IndexData.sources` et longueur en octets */
    readonly sourceAt: number,
    readonly sourceLength: number,
  ) {}
}

type FieldStats = { docCount: number; sumTotalTermFreq: number; sumDocFreq: number }

/** Postings vivants d'un terme (freqs : 1 pour un champ DOCS ; positions : null pour un champ DOCS ou sans demande) */
export type Postings = { docs: DocRecord[]; freqs: number[]; positions: number[][] | null }

/** Structures partagées entre l'écrivain et les lecteurs (remplacées, jamais vidées, lors d'un compactage) */
export class IndexData {
  readonly docs = new Map<number, DocRecord>()
  readonly terms = new TermPostings()
  /** [numéro du champ, norme (-1 si omitNorms), totalTermFreq, nombre de termes] des champs de chaque document */
  readonly docFields = new IntStore()
  readonly sources = new TextStore()
  readonly fieldOptions = new Map<string, IndexOptions>()

  constructor(
    /** numéros des champs (conservés par le compactage) */
    readonly fieldNums: Map<string, number> = new Map(),
    readonly fieldNames: string[] = [],
  ) {}

  fieldNum(name: string): number {
    let n = this.fieldNums.get(name)
    if (n === undefined) {
      n = this.fieldNames.length
      this.fieldNums.set(name, n)
      this.fieldNames.push(name)
    }
    return n
  }

  /** norme du champ pour le document (-1 si omitNorms ou sans terme dans ce champ) */
  norm(d: DocRecord, fieldNum: number): number {
    const f = this.docFields.data
    for (let i = d.fieldsAt; i < d.fieldsAt + d.fieldsLength; i += FIELD_INTS) if (f[i] === fieldNum) return f[i + 1] as number
    return -1
  }

  source(d: DocRecord): string {
    return this.sources.get(d.sourceAt, d.sourceLength)
  }

  /** Numéro du terme, -1 s'il n'existe pas */
  term(field: string, term: string): number {
    const n = this.fieldNums.get(field)
    return n === undefined ? -1 : this.terms.find(n, term)
  }

  /** Documents des postings du terme (y compris supprimés) */
  termDocs(field: string, term: string): DocRecord[] {
    const t = this.term(field, term)
    if (t === -1) return []
    const docs: DocRecord[] = []
    this.terms.read(t, this.fieldOptions.get(field) !== 'DOCS', (docId) => {
      const d = this.docs.get(docId)
      if (d !== undefined) docs.push(d)
    })
    return docs
  }
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

/** Opérations par ligne du journal (un gros commit est écrit sur plusieurs lignes, relues une à une) */
const OPS_PER_LINE = 1000

/** Lignes d'un commit (store.ts) : opérations (JSON) par groupes de OPS_PER_LINE, `"more":true` sauf la dernière */
function* commitLines(ops: Iterable<string>): Generator<string> {
  let group: string[] = []
  for (const op of ops) {
    if (group.length === OPS_PER_LINE) {
      yield `{"ops":[${group.join(',')}],"more":true}`
      group = []
    }
    group.push(op)
  }
  yield `{"ops":[${group.join(',')}]}`
}

// ---------------------------------------------------------------------------
// IndexWriter
// ---------------------------------------------------------------------------

export class IndexWriterConfig {
  constructor(readonly analyzer: Analyzer) {}
}

type Op = ['a', SerializedDoc] | ['d', string, string] | ['u', string, string, SerializedDoc]

/** Opération en attente du prochain commit ; le document ajouté est relu dans `IndexData.sources` */
type PendingOp = { op: 'a'; doc: DocRecord } | { op: 'd'; field: string; bytes: string } | { op: 'u'; field: string; bytes: string; doc: DocRecord }

export class IndexWriter {
  private data = new IndexData()
  private readonly stats = new Map<string, FieldStats>()
  private nextId = 0
  private gen = 0
  private liveCount = 0
  private deletedCount = 0
  private pending: PendingOp[] = []
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
    // verrou d'écriture du Directory (SingleInstanceLockFactory)
    if (directory.writeLocked) throw new LockObtainFailedException(`lock instance already obtained: (dir=${directory.constructor.name} lockFactory=SingleInstanceLockFactory, lockName=write.lock)`)
    directory.writeLocked = true
    // OpenMode.CREATE_OR_APPEND : relit le dernier commit
    const log = directory.readCommits((ops) => {
      for (const op of ops as Op[]) this.apply(op)
    })
    this.hasCommit = log !== null && log.commits > 0
    if (log !== null) {
      this.logLength = log.commits
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
        this.index(this.invert(deserialize(op[1])), JSON.stringify(op[1]))
        break
      case 'd':
        this.deleteInternal(new Term(op[1], op[2]))
        break
      case 'u':
        this.deleteInternal(new Term(op[1], op[2]))
        this.index(this.invert(deserialize(op[3])), JSON.stringify(op[3]))
        break
    }
  }

  addDocument(doc: Iterable<Field> & Document): void {
    this.ensureOpen()
    const source = JSON.stringify(serialize(doc))
    this.pending.push({ op: 'a', doc: this.index(this.invert(doc), source) })
  }

  addDocuments(docs: Iterable<Document>): void {
    this.ensureOpen()
    // PORT: les documents d'un bloc sont inversés et indexés un par un (mémoire bornée par document, pas par bloc) ;
    // tout ou rien comme Lucene : en cas d'erreur, ceux du bloc déjà indexés sont supprimés
    // (DocumentsWriterPerThread.updateDocuments -> deleteLastDocs) et aucune opération n'est journalisée
    const added: DocRecord[] = []
    try {
      for (const d of docs) added.push(this.index(this.invert(d), JSON.stringify(serialize(d))))
    } catch (e) {
      for (const r of added) this.deleteRecord(r)
      throw e
    }
    for (const doc of added) this.pending.push({ op: 'a', doc })
  }

  updateDocument(term: Term, doc: Document): void {
    this.ensureOpen()
    const source = JSON.stringify(serialize(doc))
    const inverted = this.invert(doc)
    this.deleteInternal(term)
    this.pending.push({ op: 'u', field: term.field, bytes: term.bytes, doc: this.index(inverted, source) })
  }

  deleteDocuments(...terms: Term[]): void {
    this.ensureOpen()
    for (const term of terms) {
      this.deleteInternal(term)
      this.pending.push({ op: 'd', field: term.field, bytes: term.bytes })
    }
  }

  /** JSON d'une opération en attente (Op) */
  private *pendingJson(): Generator<string> {
    for (const p of this.pending) {
      if (p.op === 'a') yield `["a",${this.data.source(p.doc)}]`
      else if (p.op === 'd') yield JSON.stringify(['d', p.field, p.bytes])
      else yield `["u",${JSON.stringify(p.field)},${JSON.stringify(p.bytes)},${this.data.source(p.doc)}]`
    }
  }

  /** Commits all pending changes */
  commit(): number {
    this.ensureOpen()
    if (this.pending.length > 0 || !this.hasCommit) {
      this.directory.appendCommit(commitLines(this.pendingJson()))
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
    this.directory.writeLocked = false
  }

  // PORT: méthode de destruction déduite par Spring pour un @Bean Closeable (IndexWriter.close())
  destroy(): void {
    this.close()
  }

  isOpen(): boolean {
    return !this.closed
  }

  private rewriteLog(): void {
    // un commit des documents vivants (les opérations non encore validées restent en attente)
    const data = this.data
    function* ops(): Generator<string> {
      for (const d of data.docs.values()) if (d.deletedGen === Infinity) yield `["a",${data.source(d)}]`
    }
    this.directory.rewrite(commitLines(ops()))
    this.logLength = 1
  }

  private compact(): void {
    const old = this.data
    const data = new IndexData(old.fieldNums, old.fieldNames)
    for (const [f, o] of old.fieldOptions) data.fieldOptions.set(f, o)
    // documents vivants, recopiés (nouvelles positions ; les lecteurs ouverts gardent les anciennes données)
    const f = old.docFields.data
    for (const d of old.docs.values()) {
      if (d.deletedGen !== Infinity) continue
      const fieldsAt = data.docFields.size
      for (let i = d.fieldsAt; i < d.fieldsAt + d.fieldsLength; i++) data.docFields.push(f[i] as number)
      const sourceAt = data.sources.append(old.source(d), d.sourceLength)
      data.docs.set(d.id, new DocRecord(d.id, fieldsAt, d.fieldsLength, sourceAt, d.sourceLength))
    }
    // postings des seuls documents vivants
    for (let t = 0; t < old.terms.numTerms; t++) {
      const field = old.terms.field(t)
      let nt = -1
      old.terms.read(t, old.fieldOptions.get(old.fieldNames[field] as string) !== 'DOCS', (docId, _freq, positions) => {
        if (!data.docs.has(docId)) return
        if (nt === -1) nt = data.terms.add(field, old.terms.text(t))
        data.terms.addPosting(nt, docId, positions)
      })
    }
    this.data = data
    this.deletedCount = 0
  }

  // -------------------------------------------------------------------------
  // Inversion (IndexingChain)
  // -------------------------------------------------------------------------

  private invert(doc: Document): Inverted {
    const fields = new Map<string, FieldData>()
    const states = new Map<string, InvertState>()
    for (const field of doc) {
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
    return { fields }
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

  private index(inverted: Inverted, source: string): DocRecord {
    const id = this.nextId++
    const data = this.data
    const fieldsAt = data.docFields.size
    for (const [name, fd] of inverted.fields) {
      if (!data.fieldOptions.has(name)) data.fieldOptions.set(name, fd.indexOptions)
      if (fd.terms.size === 0) continue
      const fieldNum = data.fieldNum(name)
      data.docFields.push(fieldNum)
      data.docFields.push(fd.norm)
      data.docFields.push(fd.totalTermFreq)
      data.docFields.push(fd.terms.size)
      // postings
      const positional = fd.indexOptions !== 'DOCS'
      for (const [term, positions] of fd.terms) data.terms.addPosting(data.terms.add(fieldNum, term), id, positional ? positions : null)
      const st = this.stats.get(name) ?? { docCount: 0, sumTotalTermFreq: 0, sumDocFreq: 0 }
      st.docCount++
      st.sumTotalTermFreq += fd.totalTermFreq
      st.sumDocFreq += fd.terms.size
      this.stats.set(name, st)
    }
    const sourceLength = utf8Length(source)
    const record = new DocRecord(id, fieldsAt, data.docFields.size - fieldsAt, data.sources.append(source, sourceLength), sourceLength)
    data.docs.set(id, record)
    this.liveCount++
    this.version++
    return record
  }

  private deleteInternal(term: Term): void {
    for (const record of this.data.termDocs(term.field, term.bytes)) this.deleteRecord(record)
  }

  private deleteRecord(record: DocRecord): void {
    if (record.deletedGen !== Infinity) return
    record.deletedGen = ++this.gen
    const f = this.data.docFields.data
    for (let i = record.fieldsAt; i < record.fieldsAt + record.fieldsLength; i += FIELD_INTS) {
      const st = this.stats.get(this.data.fieldNames[f[i] as number] as string) as FieldStats
      st.docCount--
      st.sumTotalTermFreq -= f[i + 2] as number
      st.sumDocFreq -= f[i + 3] as number
    }
    this.liveCount--
    this.deletedCount++
    this.version++
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

/** `org.apache.lucene.index.IndexNotFoundException` : aucun commit dans le Directory */
export class IndexNotFoundException extends FileNotFoundException {}

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
    return this.readPostings(field, term, false).docs
  }

  /** postings vivants d'un terme avec fréquences, et positions si `withPositions` (champ non DOCS) */
  readPostings(field: string, term: string, withPositions: boolean): Postings {
    const docs: DocRecord[] = []
    const freqs: number[] = []
    const positional = this.data.fieldOptions.get(field) !== 'DOCS'
    const positions: number[][] | null = withPositions && positional ? [] : null
    const t = this.data.term(field, term)
    if (t === -1) return { docs, freqs, positions }
    this.data.terms.read(t, positional, (docId, freq, pos) => {
      const d = this.data.docs.get(docId)
      if (d === undefined || !this.isLive(d)) return
      docs.push(d)
      freqs.push(freq)
      positions?.push(pos as number[])
    })
    return { docs, freqs, positions }
  }

  /** norme du champ pour le document (-1 si omitNorms) */
  norm(d: DocRecord, field: string): number {
    const n = this.data.fieldNums.get(field)
    return n === undefined ? -1 : this.data.norm(d, n)
  }

  /** termes d'un champ ayant au moins un document vivant (ordre quelconque) */
  *terms(field: string): Iterable<string> {
    const fieldNum = this.data.fieldNums.get(field)
    if (fieldNum === undefined) return
    const positional = this.data.fieldOptions.get(field) !== 'DOCS'
    const terms = this.data.terms
    // numTerms relu à chaque tour : l'écrivain peut ajouter des termes pendant le parcours (documents non visibles)
    for (let t = 0; t < terms.numTerms; t++) {
      if (terms.field(t) !== fieldNum) continue
      let live = false
      terms.read(t, positional, (docId) => {
        if (live) return
        const d = this.data.docs.get(docId)
        if (d !== undefined && this.isLive(d)) live = true
      })
      if (live) yield terms.text(t)
    }
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
    const { docs, freqs } = this.readPostings(term.field, term.bytes, false)
    let ttf = 0
    for (const f of freqs) ttf += f
    return { docFreq: docs.length, totalTermFreq: ttf }
  }

  /** `storedFields().document(docID)` */
  document(docId: number): Document {
    const d = this.data.docs.get(docId)
    if (d === undefined) throw new IllegalArgumentException(`docID must be >= 0 and < maxDoc=${this.maxDocId} (got docID=${docId})`)
    const doc = new Document()
    // champs stockés (Store.YES), relus dans le document sérialisé
    for (const [name, value, kind] of JSON.parse(this.data.source(d)) as SerializedDoc) if (kind === 'T' || kind === 'S') doc.add(new StoredField(name, value))
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
    return directory.hasCommits()
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

  // PORT: format d'index propre à KomgaJS, pas de segments d'une ancienne version de Lucene à réécrire ; comme Lucene,
  // IndexNotFoundException sans index, et un IndexWriter est ouvert (LockObtainFailedException si un autre tient le verrou)
  upgrade(): void {
    if (!DirectoryReader.indexExists(this.dir)) throw new IndexNotFoundException(`no segments* file found in ${this.dir.constructor.name}: files: []`)
    new IndexWriter(this.dir, this.conf).close()
  }
}
