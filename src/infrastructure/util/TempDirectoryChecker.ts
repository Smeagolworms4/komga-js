// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/util/TempDirectoryChecker.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { check, IllegalStateException } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.util.TempDirectoryChecker')

// PORT: Files.isWritable(path)
function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Checks that the temp directory, obtained with System.getProperty("java.io.tmpdir"),
 * exists and is accessible.
 * If the directory does not exist, this will attempt to create it.
 *
 * @throws IllegalStateException if the temp directory cannot be created,
 * or is not accessible, or if the system property 'java.io.tmpdir' is not defined.
 */
export function checkTempDirectory(): void {
  // PORT: System.getProperty("java.io.tmpdir") -> os.tmpdir() (TMPDIR, TMP, TEMP ou /tmp)
  const it: string | null = tmpdir()
  if (it !== null) {
    const tmpDir = it

    // PORT: Files.notExists(tmpDir)
    if (!existsSync(tmpDir)) {
      logger.warn(() => `Temp directory does not exist, attempting to create it: ${tmpDir}`)
      try {
        mkdirSync(tmpDir, { recursive: true })
        logger.info(() => `Created missing temp directory: ${tmpDir}`)
      } catch (e) {
        logger.error(e as Error, () => `Could not create missing temp directory: ${tmpDir}`)
        throw new IllegalStateException(`Could not create missing temp directory: ${tmpDir}`, e)
      }
    }

    check(isWritable(tmpDir), () => `Temp directory is not writable: ${tmpDir}`)
  } else throw new IllegalStateException("System property 'java.io.tmpdir' is not defined")
}
