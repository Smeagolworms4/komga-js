// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/kobo/KepubConverter.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { spawnSync } from 'node:child_process'
import { accessSync, constants as fsConstants, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Book } from '../../domain/model/Book.js'
import { BookProjection } from '../../domain/model/BookProjection.js'
import { KEPUB_DEFAULT } from '../../domain/model/BookProjectionProfiles.js'
import type { BookWithMedia } from '../../domain/model/BookWithMedia.js'
import { MediaType } from '../../domain/model/MediaType.js'
import { BookProjectionRepository } from '../../domain/persistence/BookProjectionRepository.js'
import { spawnAsync } from '../../port/async-io.js'
import { filesIsDirectory } from '../../port/java.js'
import { check, isBlank, require } from '../../port/kotlin.js'
import { deleteIfExists, exists, nameWithoutExtension } from '../../port/kotlin-io-path.js'
import { KotlinLogging } from '../../port/logging.js'
import { component, type Token } from '../../port/spring.js'
import { KomgaSettingsProvider } from '../configuration/KomgaSettingsProvider.js'
import { SettingChangedEvent } from '../configuration/SettingChangedEvent.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.kobo.KepubConverter')

export class KepubConverter {
  private _kepubifyPath: string | null = null
  get kepubifyPath(): string | null {
    return this._kepubifyPath
  }

  private _isAvailable = false
  get isAvailable(): boolean {
    return this._isAvailable
  }

  private get tmpDir(): string {
    return tmpdir()
  }

  constructor(
    private readonly settingsProvider: KomgaSettingsProvider,
    private readonly bookProjectionRepository: BookProjectionRepository,
    readonly kepubifyConfigurationPath: string | null,
  ) {}

  private configureKepubifyOnStartup(): void {
    if (!isBlank(this.settingsProvider.kepubifyPath)) this.configureKepubify(this.settingsProvider.kepubifyPath, true)
    else if (!isBlank(this.kepubifyConfigurationPath)) this.configureKepubify(this.kepubifyConfigurationPath)
    else logger.info(() => 'Kepub conversion unavailable. kepubify path is not set')
  }

  private configureKepubifyOnSettingsChange(): void {
    this.configureKepubify(this.settingsProvider.kepubifyPath, true)
  }

  /**
   * Configure the path for kepubify
   * @param newValue path to kepubify
   * @param fallback whether to fallback to configuration properties in case [newValue] is invalid
   */
  configureKepubify(newValue: string | null, fallback = false): void {
    if (newValue === null || isBlank(newValue)) {
      this._isAvailable = false
      this._kepubifyPath = null
      if (fallback && !isBlank(this.kepubifyConfigurationPath)) {
        this.configureKepubify(this.kepubifyConfigurationPath)
      }
    } else {
      const newPath = newValue
      if (!this.isExecutable(newPath)) {
        logger.warn(() => `kepubify path is not executable, not found or not valid: ${newPath}`)
        this._isAvailable = false
        if (fallback && !isBlank(this.kepubifyConfigurationPath)) {
          this.configureKepubify(this.kepubifyConfigurationPath)
        }
      } else {
        logger.info(() => `Kepub conversion available. kepubify path: ${newPath}`)
        this._isAvailable = true
      }
      this._kepubifyPath = newPath
    }
  }

  private isExecutable(path: string): boolean {
    try {
      // PORT: Files.isExecutable
      try {
        accessSync(path, fsConstants.X_OK)
        return true
      } catch {}
      // path may be an executable in the PATH, try running it
      // PORT: Runtime.exec(String) découpe la commande sur les blancs (StringTokenizer) ; waitFor(3, SECONDS) puis
      // exitValue() lève une exception si le processus tourne encore : ici le processus est arrêté au bout de 3 s
      const [cmd, ...args] = path.split(/[ \t\n\r\f]+/).filter((it) => it.length > 0)
      const process = spawnSync(cmd ?? '', args, { timeout: 3000, stdio: 'ignore' })
      if (process.error) throw process.error

      return process.status === 0
    } catch (e) {
      logger.warn(e as Error, () => `Error while verifying executable: ${path}`)
      return false
    }
  }

  /**
   * Converts an EPUB book to KEPUB. The destination filename will be built from the original book file name.
   *
   * @param bookWithMedia the source book
   * @param destinationDir the destination directory in which to save the converted file, else the default temporary directory is used
   * @throws IllegalArgumentException if the source book is not an EPUB, or is already a KEPUB
   * @return the [Path] of the converted file in case of success, else null
   */
  // PORT: async (convertEpubToKepubWithoutChecks)
  async convertEpubToKepub(bookWithMedia: BookWithMedia, destinationDir: string | null = null): Promise<string | null> {
    require(bookWithMedia.media.mediaType === MediaType.EPUB.type, () => `Cannot convert, not an EPUB: ${bookWithMedia.book.path}`)
    require(!bookWithMedia.media.epubIsKepub, () => `Cannot convert, EPUB is already a KEPUB: ${bookWithMedia.book.path}`)
    require(exists(bookWithMedia.book.path), () => `Source file does not exist: ${bookWithMedia.book.path}`)

    return await this.convertEpubToKepubWithoutChecks(bookWithMedia.book, destinationDir)
  }

  /**
   * Converts an EPUB book to KEPUB. The destination filename will be built from the original file name.
   * This function does not check whether the file is an EPUB, or is already a KEPUB, or if the source file exists.
   *
   * This is intended for internal use in the EpubExtractor
   */
  // PORT: async (processus kepubify attendu sans bloquer le thread, voir PORTING.md « Architecture d'exécution »)
  async convertEpubToKepubWithoutChecks(book: Book, destinationDir: string | null = null): Promise<string | null> {
    check(this.isAvailable, () => 'Kepub conversion is not available, kepubify path may not be set, or may be invalid')

    if (destinationDir !== null) require(filesIsDirectory(destinationDir), () => `Destination directory does not exist: ${destinationDir}`)

    // kepubify will only convert when the destination name has the .kepub.epub extension, so we have to force it
    const destinationPath = join(destinationDir ?? this.tmpDir, nameWithoutExtension(book.path) + '.kepub.epub')
    deleteIfExists(destinationPath)

    const command = [String(this.kepubifyPath), book.path, '-o', destinationPath]
    logger.debug(() => `Starting conversion with: ${command.join(' ')}`)
    // PORT: Runtime.exec(command) + waitFor(10, SECONDS) -> spawnAsync (spawnSync sans bloquer) avec délai (le processus
    // est arrêté à l'expiration du délai, Java le laisse tourner)
    const process = await spawnAsync(command[0] as string, command.slice(1), { timeout: 10_000, maxBuffer: 64 * 1024 * 1024 })
    if (process.error && (process.error as NodeJS.ErrnoException).code !== 'ETIMEDOUT') {
      logger.error(process.error, () => 'Failed to create process')
      return null
    }

    if (process.error || process.status === null) {
      logger.error(() => `Kepub conversion timeout. Command: ${command.join(' ')}`)
      return null
    }

    if (process.status !== 0) {
      const error = lines(process.stderr).join(' ')
      logger.error(() => `Kepub conversion failed. Command: ${command.join(' ')}. Error: ${error}`)
      return null
    }
    logger.debug(() => 'kepubify output: ' + lines(process.stdout).join('\n'))

    if (!exists(destinationPath)) {
      logger.error(() => `Converted file not found: ${destinationPath}`)
      return null
    }

    // store the kepub filesize, so we can pass it back during Kobo Sync
    this.bookProjectionRepository.save(new BookProjection({ bookId: book.id, profile: KEPUB_DEFAULT, fileSize: statSync(destinationPath).size }))

    return destinationPath
  }
}

// PORT: BufferedReader.useLines (terminateurs \n, \r, \r\n)
function lines(buf: Buffer | null): string[] {
  if (buf === null || buf.length === 0) return []
  const l = buf.toString('utf8').split(/\r\n|\r|\n/)
  if (l[l.length - 1] === '') l.pop()
  return l
}

// @Component
component(KepubConverter, {
  inject: [KomgaSettingsProvider, BookProjectionRepository, { expression: (ctx) => ctx.environment.getProperty('komga.kobo.kepubify-path') }],
  // @PostConstruct
  postConstruct: ['configureKepubifyOnStartup'],
  // @EventListener(SettingChangedEvent.KepubifyPath::class)
  eventListeners: [{ method: 'configureKepubifyOnSettingsChange', events: [SettingChangedEvent.KepubifyPath.constructor as Token] }],
})
