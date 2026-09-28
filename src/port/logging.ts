// Support de portage : équivalent de io.github.oshai.kotlinlogging (KotlinLogging.logger {}).
// Ce fichier n'a pas de jumeau Kotlin. Niveaux et format proches de la sortie Logback de Komga.

import { writeSync } from 'node:fs'
import { inspect } from 'node:util'

export type Level = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
const ORDER: Record<Level, number> = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 }

let rootLevel: Level = (process.env.KOMGA_LOG_LEVEL?.toUpperCase() as Level | undefined) ?? 'INFO'
const levels = new Map<string, Level>()

export function setLogLevel(level: Level, name?: string): void {
  if (name === undefined) rootLevel = level
  else levels.set(name, level)
}

function effectiveLevel(name: string): Level {
  let best: Level = rootLevel
  let bestLen = -1
  for (const [prefix, l] of levels)
    if ((name === prefix || name.startsWith(prefix + '.')) && prefix.length > bestLen) {
      best = l
      bestLen = prefix.length
    }
  return best
}

type Msg = () => unknown

/**
 * Dans un worker_thread (tâches, port/task-worker.ts), la console est relayée par le thread principal et n'est vidée
 * qu'au retour à la boucle d'événements du worker : pendant une longue tâche synchrone (scan), les lignes
 * s'accumuleraient. Elles sont écrites directement sur le descripteur du processus, comme depuis le thread principal.
 */
let directOutput = false

/** Écriture directe des journaux (appelé au démarrage du worker des tâches) */
export function useDirectLogOutput(): void {
  directOutput = true
}

function writeLine(fd: number, text: string): boolean {
  try {
    writeSync(fd, `${text}\n`)
    return true
  } catch {
    // descripteur non bloquant plein (EAGAIN) ou fermé : relais par la console
    return false
  }
}

export class KLogger {
  constructor(readonly name: string) {}

  isEnabled(level: Level): boolean {
    return ORDER[level] >= ORDER[effectiveLevel(this.name)]
  }

  private log(level: Level, a: Msg | Error, b?: Msg): void {
    if (!this.isEnabled(level)) return
    const [err, msg] = a instanceof Error ? [a, b] : [undefined, a]
    const line = `${new Date().toISOString()} ${level.padStart(5)} ${this.name} : ${String(msg?.() ?? '')}`
    const out = ORDER[level] >= ORDER.WARN ? console.error : console.log
    if (directOutput && writeLine(ORDER[level] >= ORDER.WARN ? 2 : 1, err ? `${line}\n${inspect(err)}` : line)) return
    if (err) out(line, err)
    else out(line)
  }

  trace(a: Msg | Error, b?: Msg): void {
    this.log('TRACE', a, b)
  }
  debug(a: Msg | Error, b?: Msg): void {
    this.log('DEBUG', a, b)
  }
  info(a: Msg | Error, b?: Msg): void {
    this.log('INFO', a, b)
  }
  warn(a: Msg | Error, b?: Msg): void {
    this.log('WARN', a, b)
  }
  error(a: Msg | Error, b?: Msg): void {
    this.log('ERROR', a, b)
  }
}

export const KotlinLogging = {
  /** `KotlinLogging.logger {}` : le nom est celui du fichier/classe Kotlin (passé explicitement). */
  logger(name: string): KLogger {
    return new KLogger(name)
  },
}
