// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/configuration/ConfigurationChecker.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ConfigurationException } from '../../domain/model/Exceptions.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'
import { KomgaProperties } from './KomgaProperties.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.configuration.ConfigurationChecker')

// PORT: Files.getFileStore(path).type() (LinuxFileStore) : type du point de montage le plus long contenant le chemin
// réel, lu dans /proc/self/mounts ; lève une exception si la table des montages n'est pas lisible (hors Linux)
function fileStoreType(path: string): string {
  const real = realpathSync(path)
  const mounts = readFileSync('/proc/self/mounts', 'utf8')
  let best: { dir: string; type: string } | null = null
  for (const line of mounts.split('\n')) {
    const parts = line.split(' ')
    if (parts.length < 3) continue
    // les espaces etc. sont encodés en octal dans /proc/mounts
    const dir = (parts[1] as string).replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)))
    const type = parts[2] as string
    const matches = dir === '/' || real === dir || real.startsWith(`${dir}/`)
    if (matches && (best === null || dir.length >= best.dir.length)) best = { dir, type }
  }
  if (best === null) throw new Error(`Mount point not found for ${real}`)
  return best.type
}

// PORT: Path.parent (null pour un chemin sans parent)
function pathParent(path: string): string | null {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path
  if (!trimmed.includes('/') || trimmed === '/') return null
  return dirname(trimmed)
}

export class ConfigurationChecker {
  constructor(private readonly komgaProperties: KomgaProperties) {}

  private readonly blockTypes = ['cifs', 'nfs']

  // @PostConstruct
  checkDatabasesPath(): void {
    this.checkDatabaseIsLocal(this.komgaProperties.database, 'komga.database.check-local-filesystem: false')
    this.checkDatabaseIsLocal(this.komgaProperties.tasksDb, 'komga.tasks-db.check-local-filesystem: false')
  }

  private checkDatabaseIsLocal(database: KomgaProperties.Database, ignoreProp: string): void {
    if (database.checkLocalFilesystem) {
      let path: string
      try {
        // PORT: Path(String) lève InvalidPathException pour un caractère NUL
        if (database.file.includes('\u0000')) throw new Error('Nul character not allowed')
        path = database.file
      } catch {
        return
      }
      this.checkIfRemote(path, ignoreProp)
      if (!existsSync(path)) this.checkIfRemote(pathParent(path), ignoreProp)
    }
  }

  private checkIfRemote(path: string | null, ignoreProp: string): void {
    if (path === null) return
    if (existsSync(path)) {
      let storeType: string
      try {
        storeType = fileStoreType(resolve(path)).toLowerCase()
      } catch (e) {
        logger.warn(e as Error, () => `Could not get FileStore type for path: ${path}`)
        storeType = 'unknown'
      }

      if (this.blockTypes.some((it) => storeType.toLowerCase().startsWith(it.toLowerCase()))) {
        const errorMessage = `The path '${path}' should be on a local filesystem, but was detected to be on a remote filesystem (${storeType}). If this is inaccurate you can set '${ignoreProp}' to ignore this check.`

        logger.error(() => errorMessage)
        throw new ConfigurationException(errorMessage)
      } else {
        logger.debug(() => `FileStore type: ${storeType}, path: ${path}`)
      }
    }
  }
}

// @Component
component(ConfigurationChecker, { inject: [KomgaProperties], postConstruct: ['checkDatabasesPath'] })
