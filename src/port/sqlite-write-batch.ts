// Support de portage : regroupement des écritures des tâches sur la base principale (écart avec Komga).
// Ce fichier n'a pas de jumeau Kotlin.
//
// PORT: écart — dans Komga (sqlite-jdbc, WAL, synchronous = FULL), chaque écriture en autocommit et chaque transaction
// est validée séparément, avec une synchronisation du disque (fsync) à chaque fois : l'analyse d'un livre neuf en fait
// au moins cinq (média, suppression et insertion de la miniature, sélection de la miniature, empreinte du fichier).
// better-sqlite3 est synchrone : chaque synchronisation bloque l'unique thread JS de KomgaJS (quelques ms sur un SSD,
// souvent des dizaines sur la carte SD d'un Raspberry Pi), pendant laquelle ni les autres tâches ni les requêtes HTTP
// n'avancent.
// Ici, les écritures faites pendant l'exécution des tâches (TaskProcessor) sont regroupées dans une transaction de lot
// sur la connexion d'écriture de la base principale, validée au plus tard `KOMGAJS_WRITE_BATCH_MS` ms (1 000 par défaut)
// après son ouverture : une synchronisation du disque par lot au lieu d'une par écriture. La base principale reste en
// synchronous = FULL.
//
// Ce qui ne change pas :
// - les données écrites et leur ordre ; chaque transaction de Komga (@Transactional, TransactionTemplate) reste atomique :
//   dans le lot, elle devient un point de sauvegarde (SAVEPOINT), annulé seul si elle échoue ; une écriture en
//   autocommit qui échoue est annulée seule (instruction), comme dans Komga ;
// - ce que lisent les tâches et les requêtes : pendant un lot, les lectures des DAO passent par la connexion d'écriture
//   (SplitDslDaoBase, comme dans une transaction de Komga), qui voit le lot ; la connexion change seulement en début de
//   tâche et au moment de valider (entre deux `await`, jamais au milieu d'une portion synchrone : tables temporaires
//   et transactions restent sur une seule connexion) ;
// - les écritures faites hors des tâches (requêtes HTTP : progression de lecture, réglages...) : si un lot est ouvert,
//   elles y entrent et le lot est validé aussitôt après (tour suivant de la boucle d'événements), sans attendre le délai.
// Ce qui change : la durabilité. Après une coupure de courant ou un arrêt brutal du processus (SIGKILL, plantage), les
// écritures des tâches des dernières `KOMGAJS_WRITE_BATCH_MS` ms peuvent manquer (la tâche est déjà retirée de la file) :
// livres encore à analyser (réanalysés au scan suivant), empreinte manquante (recalculée au scan suivant), miniature
// ou métadonnées d'un livre à régénérer. Un arrêt normal (SIGTERM, fermeture de la base, sortie du processus) valide le
// lot. Une erreur de SQLite qui annule toute la transaction (disque plein, erreur d'entrée-sortie) perd aussi le lot.
//
// Désactivé (comportement de Komga) avec KOMGAJS_WRITE_BATCH_MS=0, pour une base en mémoire, et dans le worker des
// tâches (KOMGAJS_TASK_WORKER=true : les requêtes lisent par d'autres connexions, qui ne verraient pas le lot).
import type Database from 'better-sqlite3'
import { AsyncLocalStorage } from 'node:async_hooks'
import { isMainThread } from 'node:worker_threads'
import { KotlinLogging } from './logging.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.datasource.WriteBatch')

type Batch = {
  readonly db: Database.Database
  readonly delayMs: number
  /** transaction de lot ouverte (BEGIN IMMEDIATE) */
  open: boolean
  /** tâches en cours (runWithWriteBatching) */
  running: number
  timer: NodeJS.Timeout | null
  commitSoon: boolean
  /** nombre de lots validés (mesure et tests) */
  commits: number
}

const batches = new Map<Database.Database, Batch>()
/** exécution d'une tâche (et de ce qu'elle lance de façon asynchrone) */
const taskContext = new AsyncLocalStorage<true>()

/** KOMGAJS_WRITE_BATCH_MS : entier ≥ 0 (0 : désactivé) ; absent ou invalide : 1 000 */
export function writeBatchDelay(value: string | undefined): number {
  const n = Number(value)
  return value !== undefined && value.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : 1000
}

/**
 * Autorise le regroupement des écritures des tâches sur cette connexion (connexion d'écriture de la base principale,
 * fichier, thread principal) ; sans effet si le délai est 0.
 */
export function enableWriteBatching(db: Database.Database, delayMs: number = writeBatchDelay(process.env.KOMGAJS_WRITE_BATCH_MS)): void {
  if (delayMs <= 0 || !isMainThread || db.memory || batches.has(db)) return
  batches.set(db, { db, delayMs, open: false, running: 0, timer: null, commitSoon: false, commits: 0 })
}

/** Une transaction de lot est-elle ouverte sur cette connexion ? (vaut transaction en cours pour SplitDslDaoBase) */
export function isWriteBatchOpen(db: Database.Database): boolean {
  const batch = batches.get(db)
  return batch !== undefined && batch.open && db.inTransaction
}

/** Nombre de lots validés sur cette connexion */
export function writeBatchCommits(db: Database.Database): number {
  return batches.get(db)?.commits ?? 0
}

function open(batch: Batch): void {
  if (batch.open || batch.db.inTransaction || !batch.db.open) return
  batch.db.exec('BEGIN IMMEDIATE')
  batch.open = true
  batch.timer = setTimeout(() => flush(batch), batch.delayMs)
  batch.timer.unref()
}

/** Valide le lot ; le rouvre aussitôt si des tâches sont en cours et `reopen` */
function commit(batch: Batch, reopen: boolean): void {
  if (batch.timer !== null) clearTimeout(batch.timer)
  batch.timer = null
  batch.commitSoon = false
  if (!batch.open) return
  batch.open = false
  if (batch.db.open && batch.db.inTransaction) {
    try {
      batch.db.exec('COMMIT')
      batch.commits++
    } catch (e) {
      logger.error(e as Error, () => 'Could not commit the batch of task writes, it is rolled back')
      if (batch.db.inTransaction) batch.db.exec('ROLLBACK')
    }
  } else {
    logger.warn(() => 'The batch of task writes was rolled back by SQLite')
  }
  if (reopen && batch.running > 0) open(batch)
}

/** Validation par le minuteur ou après une écriture hors tâche : tour de boucle d'événements à part, hors transaction */
function flush(batch: Batch): void {
  try {
    commit(batch, true)
  } catch (e) {
    logger.error(e as Error, () => 'Could not reopen the batch of task writes')
  }
}

function scheduleCommit(batch: Batch): void {
  if (batch.commitSoon) return
  batch.commitSoon = true
  setImmediate(() => {
    if (batch.commitSoon) flush(batch)
  })
}

/** Valide le lot en cours (fermeture de la base, arrêt) */
export function commitWriteBatch(db: Database.Database): void {
  const batch = batches.get(db)
  if (batch !== undefined) commit(batch, false)
}

/**
 * Exécute une tâche (`TaskHandler.handleTask`) en regroupant ses écritures sur les connexions où c'est autorisé :
 * ouvre le lot s'il ne l'est pas (début de tâche : aucune portion synchrone en cours sur la base principale).
 * Sans lot possible (désactivé, base occupée), la tâche s'exécute comme dans Komga.
 */
export async function runWithWriteBatching<T>(fn: () => Promise<T>): Promise<T> {
  const active: Batch[] = []
  for (const batch of batches.values()) {
    if (!batch.db.open) continue
    try {
      open(batch)
    } catch (e) {
      logger.warn(() => `Task writes are not batched: ${(e as Error).message}`)
      continue
    }
    batch.running++
    active.push(batch)
  }
  try {
    return await taskContext.run(true, fn)
  } finally {
    // le lot reste ouvert jusqu'à son délai, pour les tâches suivantes
    for (const batch of active) batch.running--
  }
}

/** Écriture (instruction autre qu'une lecture) sur `db` : hors tâche, le lot ouvert est validé au tour suivant */
export function beforeWrite(db: Database.Database, sql: string): void {
  if (batches.size === 0) return
  const batch = batches.get(db)
  if (batch === undefined || !batch.open || taskContext.getStore() === true) return
  // tables temporaires (TempTable) : propres à la connexion, rien à rendre durable
  if (/^\s*(create temporary table|insert into "?temp_|drop table if exists "?temp_)/i.test(sql)) return
  scheduleCommit(batch)
}

/**
 * Transaction de Komga (`transactional`, profondeur 0) pendant un lot ouvert : point de sauvegarde dans le lot, annulé
 * seul en cas d'échec ; hors tâche, le lot est validé au tour suivant. `undefined` si aucun lot n'est ouvert (la
 * transaction se fait alors comme dans Komga).
 */
export function inWriteBatch<T>(db: Database.Database, fn: () => T): { result: T } | undefined {
  if (batches.size === 0) return undefined
  const batch = batches.get(db)
  if (batch === undefined || !isWriteBatchOpen(db)) return undefined
  if (taskContext.getStore() !== true) scheduleCommit(batch)
  db.exec('SAVEPOINT komga_tx')
  try {
    const result = fn()
    if (result instanceof Promise) throw new Error('@Transactional function must be synchronous (better-sqlite3)')
    db.exec('RELEASE komga_tx')
    return { result }
  } catch (e) {
    if (db.inTransaction) {
      db.exec('ROLLBACK TO komga_tx')
      db.exec('RELEASE komga_tx')
    } else {
      batch.open = false
      logger.warn(() => 'The batch of task writes was rolled back by SQLite')
    }
    throw e
  }
}

// sortie du processus (process.exit, fin de la boucle d'événements) : le lot en cours est validé
process.on('exit', () => {
  for (const batch of batches.values()) {
    try {
      commit(batch, false)
    } catch {
      // base déjà fermée
    }
  }
})
