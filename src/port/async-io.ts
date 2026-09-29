// Support de portage : exécution sur un seul thread (voir PORTING.md, « Architecture d'exécution »). Ce fichier n'a pas
// de jumeau Kotlin.
//
// PORT: Komga exécute ses tâches et ses requêtes HTTP dans des threads Java, qui attendent le disque sans gêner les
// autres. KomgaJS n'a qu'un thread JS : les longues attentes (lecture de fichiers, décompression, processus externes)
// passent par le pool de threads de libuv (`await`), et les longues boucles synchrones rendent la main à la boucle
// d'événements à intervalles réguliers (`cooperativeYield`), à des endroits où Komga n'a pas de transaction ouverte.
import { type ChildProcess, spawn } from 'node:child_process'
import { type Stats, close, closeSync, fstat, open, read } from 'node:fs'
import { promisify } from 'node:util'
import { inflateRaw } from 'node:zlib'
import { readError } from './java-io.js'
import { translateNodeError } from './kotlin-io-path.js'

const openP = promisify(open)
const closeP = promisify(close)

/** Taille des blocs lus de façon asynchrone (un aller-retour par le pool de libuv par bloc) */
export const ASYNC_READ_CHUNK = 1024 * 1024

/** Durée maximale (ms) d'une tranche de code synchrone entre deux passages coopératifs par la boucle d'événements */
export const YIELD_SLICE_MS = 10

let sliceStart = performance.now()

/**
 * Point de passage coopératif : si le code synchrone tourne depuis plus de `YIELD_SLICE_MS`, rend la main à la boucle
 * d'événements (`setImmediate` : requêtes HTTP, entrées/sorties terminées, autres tâches), sinon ne fait rien.
 * À n'appeler qu'en dehors d'une transaction (`transactional` refuse une fonction asynchrone).
 */
export function cooperativeYield(): Promise<void> | undefined {
  const now = performance.now()
  if (now - sliceStart < YIELD_SLICE_MS) return undefined
  return new Promise<void>((resolve) =>
    setImmediate(() => {
      sliceStart = performance.now()
      resolve()
    }),
  )
}

/** Remet à zéro la tranche en cours (tests) */
export function resetYieldSlice(): void {
  sliceStart = performance.now()
}

/** `read(2)` positionnel sur le pool de libuv : nombre d'octets lus (0 en fin de fichier) */
export function preadAsync(fd: number, buf: Uint8Array, off: number, len: number, pos: number): Promise<number> {
  return new Promise<number>((resolve, reject) => read(fd, buf, off, len, pos, (err, n) => (err ? reject(err) : resolve(n))))
}

/** Lit `len` octets à `pos` (moins en fin de fichier) */
export async function preadFullyAsync(fd: number, buf: Uint8Array, off: number, len: number, pos: number): Promise<number> {
  let total = 0
  while (total < len) {
    const n = await preadAsync(fd, buf, off + total, len - total, pos + total)
    if (n <= 0) break
    total += n
  }
  return total
}

/**
 * Ouverture en lecture ; erreurs traduites comme `Path.inputStream()` (NoSuchFileException, AccessDeniedException…),
 * ou rendues telles quelles (`translate = false`)
 */
export async function openAsync(path: string, translate = true): Promise<number> {
  try {
    return await openP(path, 'r')
  } catch (e) {
    throw translate ? translateNodeError(e, path) : e
  }
}

export function fstatAsync(fd: number): Promise<Stats> {
  return new Promise<Stats>((resolve, reject) => fstat(fd, (err, st) => (err ? reject(err) : resolve(st))))
}

export function closeAsync(fd: number): Promise<void> {
  return closeP(fd)
}

/** Lit, en parallèle, `len` octets à chacune des positions (moins en fin de fichier) : un tampon et un compte par position */
export async function preadManyAsync(fd: number, positions: number[], len: number): Promise<[Uint8Array, number][]> {
  return await Promise.all(
    positions.map(async (pos) => {
      const buf = new Uint8Array(len)
      return [buf, await preadFullyAsync(fd, buf, 0, len, pos)] as [Uint8Array, number]
    }),
  )
}

/**
 * Lit tout le fichier par blocs de `ASYNC_READ_CHUNK` octets, dans l'ordre, et passe chaque bloc à `onChunk` (le bloc
 * est réutilisé : à consommer immédiatement). Erreurs d'ouverture traduites comme `Path.inputStream()`.
 */
export async function readChunksAsync(path: string, onChunk: (chunk: Buffer) => void): Promise<void> {
  const fd = await openAsync(path)
  try {
    const buf = Buffer.allocUnsafe(ASYNC_READ_CHUNK)
    let pos = 0
    for (;;) {
      let n: number
      try {
        n = await preadAsync(fd, buf, 0, buf.length, pos)
      } catch (e) {
        throw readError(e)
      }
      if (n <= 0) break
      onChunk(buf.subarray(0, n))
      pos += n
      // lecture incomplète d'un fichier ordinaire : fin du fichier (évite un aller-retour de plus)
      if (n < buf.length) break
    }
  } finally {
    // fermeture : appel système court, sans accès disque
    closeSync(fd)
  }
}

/** `inflateRawSync` sur le pool de libuv */
export function inflateRawAsync(input: Uint8Array, opts: Parameters<typeof inflateRaw>[1] = {}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => inflateRaw(input, opts, (err, out) => (err ? reject(err) : resolve(out))))
}

/** Résultat de `spawnAsync`, comme celui de `child_process.spawnSync` */
export type SpawnResult = { status: number | null; signal: NodeJS.Signals | null; stdout: Buffer; stderr: Buffer; error?: NodeJS.ErrnoException }

/**
 * `child_process.spawnSync` sans bloquer le thread : même résultat (code de sortie, sorties, `error` ETIMEDOUT quand le
 * délai expire et que le processus est arrêté, ENOBUFS au-delà de `maxBuffer`, erreur de lancement)
 */
export function spawnAsync(
  command: string,
  args: string[],
  { timeout = 0, maxBuffer = 1024 * 1024, stdio = 'pipe' }: { timeout?: number; maxBuffer?: number; stdio?: 'pipe' | 'ignore' } = {},
): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolve) => {
    const out: Buffer[] = []
    const err: Buffer[] = []
    let size = 0
    let error: NodeJS.ErrnoException | undefined
    let child: ChildProcess
    try {
      child = spawn(command, args, { stdio: ['ignore', stdio, stdio] })
    } catch (e) {
      resolve({ status: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: e as NodeJS.ErrnoException })
      return
    }
    const kill = (code: string) => {
      error ??= Object.assign(new Error(`spawnSync ${command} ${code}`), { code, syscall: `spawnSync ${command}`, path: command })
      child.kill('SIGTERM')
    }
    const collect = (into: Buffer[]) => (d: Buffer) => {
      size += d.length
      if (size > maxBuffer) kill('ENOBUFS')
      else into.push(d)
    }
    child.stdout?.on('data', collect(out))
    child.stderr?.on('data', collect(err))
    const timer = timeout > 0 ? setTimeout(() => kill('ETIMEDOUT'), timeout) : null
    child.on('error', (e) => {
      error ??= e as NodeJS.ErrnoException
      // échec du lancement : pas de processus
      if (child.pid === undefined) {
        if (timer !== null) clearTimeout(timer)
        resolve({ status: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error })
      }
    })
    child.on('close', (status, signal) => {
      if (timer !== null) clearTimeout(timer)
      resolve({ status: error !== undefined ? null : status, signal, stdout: Buffer.concat(out), stderr: Buffer.concat(err), error })
    })
  })
}
