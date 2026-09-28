// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/FileSystemScanner.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import '@js-joda/timezone'
import { Book } from '../model/Book.js'
import { DirectoryNotFoundException } from '../model/Exceptions.js'
import { ScanResult } from '../model/ScanResult.js'
import { Series } from '../model/Series.js'
import { Sidecar } from '../model/Sidecar.js'
import { SidecarBookConsumer } from '../../infrastructure/sidecar/SidecarBookConsumer.js'
import { SidecarSeriesConsumer } from '../../infrastructure/sidecar/SidecarSeriesConsumer.js'
import type { IOException } from '../../port/java-io.js'
import { type URL, pathToUrl } from '../../port/java-net.js'
import {
  type BasicFileAttributes,
  type FileTime,
  FileVisitOption,
  FileVisitResult,
  type FileVisitor,
  exists,
  isDirectory,
  isReadable,
  listDirectoryEntries,
  pathExtension,
  pathName,
  pathNameWithoutExtension,
  pathParent,
  readAttributes,
  walkFileTree,
} from '../../port/java-nio-file.js'
import { containsIgnoreCase, regexMatches } from '../../port/kotlin-text.js'
import { DataClass, equalsIgnoreCase, firstOrNull, ifBlank, isNullOrBlank, LinkedHashMap, LinkedHashSet, mapNotNull, nn, sumOf } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.FileSystemScanner')

type TempSidecarParams = {
  name: string
  url: URL
  lastModifiedTime: LocalDateTime
  type?: Sidecar.Type | null
}

class TempSidecar extends DataClass<TempSidecarParams> {
  readonly name: string
  readonly url: URL
  readonly lastModifiedTime: LocalDateTime
  readonly type: Sidecar.Type | null

  constructor({ name, url, lastModifiedTime, type = null }: TempSidecarParams) {
    super()
    this.name = name
    this.url = url
    this.lastModifiedTime = lastModifiedTime
    this.type = type
  }
}

export class FileSystemScanner {
  // PORT: private data class TempSidecar déclarée au niveau du module (avant la classe)

  private readonly sidecarBookPrefilter: RegExp[]

  constructor(
    private readonly sidecarBookConsumers: SidecarBookConsumer[],
    private readonly sidecarSeriesConsumers: SidecarSeriesConsumer[],
  ) {
    this.sidecarBookPrefilter = sidecarBookConsumers.flatMap((it) => it.getSidecarBookPrefilter())
  }

  scanRootFolder(
    root: string,
    {
      forceDirectoryModifiedTime = false,
      oneshotsDir = null,
      scanCbx = true,
      scanPdf = true,
      scanEpub = true,
      directoryExclusions = new Set(),
    }: {
      forceDirectoryModifiedTime?: boolean
      oneshotsDir?: string | null
      scanCbx?: boolean
      scanPdf?: boolean
      scanEpub?: boolean
      directoryExclusions?: ReadonlySet<string>
    } = {},
  ): ScanResult {
    const scanForExtensions: string[] = []
    if (scanCbx) scanForExtensions.push(...['cbz', 'zip', 'cbr', 'rar'])
    if (scanPdf) scanForExtensions.push('pdf')
    if (scanEpub) scanForExtensions.push('epub')
    logger.info(() => `Scanning folder: ${root}`)
    logger.info(() => `Scan for extensions: [${scanForExtensions.join(', ')}]`)
    logger.info(() => `Excluded directory patterns: [${[...directoryExclusions].join(', ')}]`)
    logger.info(() => `Force directory modified time: ${forceDirectoryModifiedTime}`)

    if (!(isDirectory(root) && isReadable(root))) throw new DirectoryNotFoundException(`Folder is not accessible: ${root}`, 'ERR_1016')

    // PORT: mutableMapOf<Series, List<Book>>() : Map à clés par identité (chaque Series a un id TSID unique, deux clés ne sont jamais égales)
    const scannedSeries = new Map<Series, Book[]>()
    const scannedSidecars: Sidecar[] = []

    // measureTime
    const start = performance.now()
    {
      // path is the series directory
      const pathToSeries = new Map<string, Series>()
      const pathToSeriesSidecars = new Map<string, Sidecar[]>()
      // path is the book's parent directory, ie the series directory
      const pathToBooks = new Map<string, Book[]>()
      const pathToBookSidecars = new Map<string, TempSidecar[]>()

      // PORT: MutableMap.merge(key, value) { prev, one -> prev.union(one).toMutableList() }
      // Même résultat qu'un union recalculé à chaque fichier, mais incrémental : un LinkedHashSet par clé
      // (prev est déjà dédoublonné), sinon le scan d'un dossier de milliers de livres devient quadratique.
      const mergeSets = new Map<Map<string, unknown[]>, Map<string, LinkedHashSet<unknown>>>()
      function merge<T>(map: Map<string, T[]>, key: string, value: T[]): void {
        let sets = mergeSets.get(map as Map<string, unknown[]>) as Map<string, LinkedHashSet<T>> | undefined
        if (sets === undefined) mergeSets.set(map as Map<string, unknown[]>, (sets = new Map()) as Map<string, LinkedHashSet<unknown>>)
        let prev = map.get(key)
        let set = sets.get(key)
        if (prev === undefined || set === undefined) {
          prev = []
          set = new LinkedHashSet()
          map.set(key, prev)
          sets.set(key, set)
        }
        for (const x of value) {
          if (set.has(x)) continue
          set.add(x)
          prev.push(x)
        }
      }

      // PORT: `self` : instance englobante pour le visiteur (this implicite de Kotlin dans l'objet anonyme)
      const self = this
      walkFileTree(
        root,
        new Set([FileVisitOption.FOLLOW_LINKS]),
        2147483647,
        new (class implements FileVisitor {
          preVisitDirectory(dir: string, attrs: BasicFileAttributes): FileVisitResult {
            logger.trace(() => `preVisit: ${dir} (regularFile:${attrs.isRegularFile}, directory:${attrs.isDirectory}, symbolicLink:${attrs.isSymbolicLink}, other:${attrs.isOther})`)
            if (pathName(dir).startsWith('.') || [...directoryExclusions].some((exclude) => containsIgnoreCase(dir, exclude))) return FileVisitResult.SKIP_SUBTREE

            pathToSeries.set(
              dir,
              new Series({
                name: ifBlank(pathName(dir), () => dir),
                url: pathToUrl(dir),
                fileLastModified: getUpdatedTime(attrs),
              }),
            )

            return FileVisitResult.CONTINUE
          }

          visitFile(file: string, attrs: BasicFileAttributes): FileVisitResult {
            logger.trace(() => `visitFile: ${file} (regularFile:${attrs.isRegularFile}, directory:${attrs.isDirectory}, symbolicLink:${attrs.isSymbolicLink}, other:${attrs.isOther})`)
            if (!attrs.isSymbolicLink && !attrs.isDirectory) {
              if (scanForExtensions.includes(pathExtension(file).toLowerCase()) && !pathName(file).startsWith('.')) {
                const book = self.pathToBook(file, attrs)
                const key = nn(pathParent(file))
                merge(pathToBooks, key, [book])
              }

              const consumer = firstOrNull(self.sidecarSeriesConsumers, (consumer) =>
                consumer.getSidecarSeriesFilenames().some((it) => equalsIgnoreCase(pathName(file), it)),
              )
              if (consumer !== null) {
                const it = consumer
                const sidecar = new Sidecar({
                  url: pathToUrl(file),
                  parentUrl: pathToUrl(nn(pathParent(file))),
                  lastModifiedTime: getUpdatedTime(attrs),
                  type: it.getSidecarSeriesType(),
                  source: Sidecar.Source.SERIES,
                })
                merge(pathToSeriesSidecars, nn(pathParent(file)), [sidecar])
              }

              // book sidecars can't be exactly matched during a file visit
              // this prefilters files to reduce the candidates
              if (self.sidecarBookPrefilter.some((it) => regexMatches(it, pathName(file)))) {
                const sidecar = new TempSidecar({ name: pathName(file), url: pathToUrl(file), lastModifiedTime: getUpdatedTime(attrs) })
                merge(pathToBookSidecars, nn(pathParent(file)), [sidecar])
              }
            }

            return FileVisitResult.CONTINUE
          }

          visitFileFailed(file: string | null, exc: IOException | null): FileVisitResult {
            void exc
            logger.warn(() => `Could not access: ${file}`)
            return FileVisitResult.SKIP_SUBTREE
          }

          postVisitDirectory(dir: string, exc: IOException | null): FileVisitResult {
            void exc
            logger.trace(() => `postVisit: ${dir}`)
            const books = pathToBooks.get(dir)
            const tempSeries = pathToSeries.get(dir)
            if (books !== undefined && books.length > 0 && tempSeries !== undefined) {
              if (!isNullOrBlank(oneshotsDir) && containsIgnoreCase(dir, oneshotsDir)) {
                books.forEach((book) => {
                  const series = new Series({
                    name: book.name,
                    url: book.url,
                    fileLastModified: book.fileLastModified,
                    oneshot: true,
                  })
                  scannedSeries.set(series, [book.copy({ oneshot: true })])
                })
              } else {
                let series: Series
                if (forceDirectoryModifiedTime) {
                  const booksMax = books.map((it) => it.fileLastModified).reduce((a, b) => (b.compareTo(a) > 0 ? b : a))
                  series = tempSeries.copy({ fileLastModified: tempSeries.fileLastModified.compareTo(booksMax) >= 0 ? tempSeries.fileLastModified : booksMax })
                } else series = tempSeries

                scannedSeries.set(series, books)

                // only add series sidecars if series has books
                const seriesSidecars = pathToSeriesSidecars.get(dir)
                if (seriesSidecars !== undefined) scannedSidecars.push(...seriesSidecars)
              }

              // book sidecars are matched here, with the actual list of books
              books.forEach((book) => {
                const bookSidecars = pathToBookSidecars.get(dir)
                const sidecars =
                  bookSidecars !== undefined
                    ? new LinkedHashMap(
                        mapNotNull(bookSidecars, (sidecar) => {
                          const it = firstOrNull(self.sidecarBookConsumers, (it) => it.isSidecarBookMatch(book.name, sidecar.name))
                          return it !== null ? ([sidecar, it.getSidecarBookType()] as const) : null
                        }),
                      )
                    : new LinkedHashMap<TempSidecar, Sidecar.Type>()
                // PORT: MutableList.minusAssign(keys) : retrait de tous les éléments égaux (keys : ensemble structurel), sur place
                if (bookSidecars !== undefined) {
                  const kept = bookSidecars.filter((it) => !sidecars.has(it))
                  bookSidecars.length = 0
                  bookSidecars.push(...kept)
                }

                for (const [sidecar, type] of sidecars)
                  scannedSidecars.push(
                    new Sidecar({ url: sidecar.url, parentUrl: book.url, lastModifiedTime: sidecar.lastModifiedTime, type: type, source: Sidecar.Source.BOOK }),
                  )
              })
            }

            return FileVisitResult.CONTINUE
          }
        })(),
      )
    }
    {
      const it = performance.now() - start
      const countOfBooks = sumOf(scannedSeries.values(), (it) => it.length)
      // PORT: format de kotlin.time.Duration.toString() approché (millisecondes)
      logger.info(() => `Scanned ${scannedSeries.size} series, ${countOfBooks} books, and ${scannedSidecars.length} sidecars in ${it.toFixed(3)}ms`)
    }

    return new ScanResult({ series: scannedSeries, sidecars: scannedSidecars })
  }

  scanFile(path: string): Book | null {
    if (!exists(path)) return null

    return this.pathToBook(path, readAttributes(path))
  }

  scanBookSidecars(path: string): Sidecar[] {
    const bookBaseName = pathNameWithoutExtension(path)
    const parent = nn(pathParent(path))
    return mapNotNull(
      listDirectoryEntries(parent).filter((candidate) => this.sidecarBookPrefilter.some((it) => regexMatches(it, pathName(candidate)))),
      (candidate) => {
        const it = firstOrNull(this.sidecarBookConsumers, (it) => it.isSidecarBookMatch(bookBaseName, pathName(candidate)))
        return it !== null
          ? new Sidecar({
              url: pathToUrl(candidate),
              parentUrl: pathToUrl(parent),
              lastModifiedTime: getUpdatedTime(readAttributes(candidate)),
              type: it.getSidecarBookType(),
              source: Sidecar.Source.BOOK,
            })
          : null
      },
    )
  }

  // PORT: private (appelée depuis le visiteur, classe anonyme)
  pathToBook(path: string, attrs: BasicFileAttributes): Book {
    return new Book({
      name: pathNameWithoutExtension(path),
      url: pathToUrl(path),
      fileLastModified: getUpdatedTime(attrs),
      fileSize: attrs.size(),
    })
  }
}

export function getUpdatedTime(self: BasicFileAttributes): LocalDateTime {
  // maxOf(a, b) : a si a >= b
  const creation = self.creationTime()
  const modified = self.lastModifiedTime()
  return toLocalDateTime(creation.compareTo(modified) >= 0 ? creation : modified)
}

export function toLocalDateTime(self: FileTime): LocalDateTime {
  return LocalDateTime.ofInstant(self.toInstant(), ZoneId.systemDefault())
}

// @Service
component(FileSystemScanner, { inject: [{ list: SidecarBookConsumer }, { list: SidecarSeriesConsumer }] })
