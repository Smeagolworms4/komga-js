// Support de portage : point d'entrée du worker_thread des tâches (voir port/task-worker.ts). Le worker construit son
// propre contexte (mêmes définitions de beans, même environnement que le thread principal) et crée les beans
// `taskWorker: 'run'` (TaskProcessor et ses dépendances : services, DAO, connexions SQLite propres au worker).
// Ce fichier n'a pas de jumeau Kotlin.
import { parentPort, receiveMessageOnPort, workerData } from 'node:worker_threads'
import { RuntimeException } from './kotlin.js'
import { KotlinLogging, useDirectLogOutput } from './logging.js'
import { createEnvironment, scanComponents } from './spring-boot-application.js'
import { ApplicationContext, type BeanDefinition } from './spring.js'
import { ThreadPoolTaskExecutor } from './spring-scheduling.js'
import type { CallReply, CallTarget, FromWorker, TaskWorkerData, ToWorker } from './task-worker.js'
import { decode, encode, exportedPath } from './thread-codec.js'

useDirectLogOutput()
const logger = KotlinLogging.logger('org.gotson.komga.application.tasks.TaskWorker')
const port = parentPort
if (port === null) throw new Error('task-worker-thread must run in a worker_thread')
const data = workerData as TaskWorkerData
const signal = new Int32Array(data.signal)

const send = (m: FromWorker) => port.postMessage(m)

/** Appel synchrone d'une méthode dans le thread principal : le worker attend la réponse */
function callMain(target: CallTarget, method: string, args: unknown[]): unknown {
  Atomics.store(signal, 0, 0)
  send({ t: 'call', target, method, args: encode(args) })
  for (;;) {
    Atomics.wait(signal, 0, 0, 60_000)
    const r = receiveMessageOnPort(data.replyPort)
    if (r !== undefined) {
      const reply = r.message as CallReply
      if (reply.ok) return decode(reply.value, remoteHandle)
      const error = decode(reply.error)
      throw error instanceof Error ? error : new RuntimeException(String(error))
    }
    logger.debug(() => `Still waiting for main thread: ${method}`)
  }
}

const IGNORED = new Set(['then', 'toJSON', 'constructor', 'inspect', 'asymmetricMatch', '$$typeof'])

function remoteObject(target: CallTarget, prototype: object | null, label: string): object {
  return new Proxy(Object.create(prototype) as object, {
    get: (obj, p) => {
      if (typeof p === 'symbol' || IGNORED.has(p)) return Reflect.get(obj, p)
      if (p === 'toString') return () => label
      return (...args: unknown[]) => callMain(target, p, args)
    },
  })
}

function remoteHandle(id: number): unknown {
  return remoteObject({ handle: id }, Object.prototype, `Remote(#${id})`)
}

let ready = false
let listenPaths = ''
const listened = () => {
  const paths: string[] = []
  for (const t of ctx.listenedEventTypes()) {
    const p = exportedPath(t)
    if (p !== null) paths.push(p)
    else logger.warn(() => `Event type not exported, cannot be received from main thread: ${t.name}`)
  }
  return paths.sort()
}

const environment = await createEnvironment(data.argv)
await scanComponents()
const ctx: ApplicationContext = new ApplicationContext(environment, [], {
  role: 'taskWorker',
  remoteBean: (d: BeanDefinition) => remoteObject({ bean: d.name }, d.type.prototype as object, `Remote(${d.name})`),
  forwardEvent: (event) => {
    try {
      send({ t: 'event', e: encode(event) })
    } catch (e) {
      logger.error(e as Error, () => `Cannot send event to main thread: ${String(event)}`)
    }
  },
  beanCreated: (_d, bean) => {
    // nouveau bean avec des listeners : le thread principal lui transmet désormais ces événements
    if (ready) {
      const paths = listened()
      if (paths.join('\n') !== listenPaths) {
        listenPaths = paths.join('\n')
        send({ t: 'listen', listen: paths })
      }
    }
    return bean
  },
})

let lastSeq = 0
port.on('message', (m: ToWorker) => {
  switch (m.t) {
    case 'event':
      lastSeq = m.seq
      ctx.publishLocalEvent(decode(m.e))
      break
    case 'mirror':
      Object.assign(ctx.getBean(m.bean) as object, decode(m.state) as object)
      break
    case 'close':
      try {
        ctx.close()
      } finally {
        process.exit(0)
      }
  }
})

// PORT: les threads du pool de TaskProcessor expirent après leur keep-alive (60 s, allowCoreThreadTimeout de Spring
// Boot) : quand il n'en reste aucun, le worker le signale au thread principal, qui l'arrête pour rendre sa mémoire
ThreadPoolTaskExecutor.onPoolEmpty = () =>
  setImmediate(() => {
    if (ThreadPoolTaskExecutor.allPoolsEmpty()) send({ t: 'idle', seq: lastSeq })
  })

ctx.startTaskWorkerBeans()
const paths = listened()
listenPaths = paths.join('\n')
ready = true
send({ t: 'ready', listen: paths })
