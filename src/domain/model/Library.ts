// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/Library.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { URL } from '../../port/java-net.js'
import { LocalDateTime } from '@js-joda/core'
import { urlToPath } from '../../port/java.js'
import { DataClass, KEnum, lazy } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import type { Auditable } from './Auditable.js'

type LibraryParams = {
  name: string
  root: URL
  importComicInfoBook?: boolean
  importComicInfoSeries?: boolean
  importComicInfoCollection?: boolean
  importComicInfoReadList?: boolean
  importComicInfoSeriesAppendVolume?: boolean
  importEpubBook?: boolean
  importEpubSeries?: boolean
  importMylarSeries?: boolean
  importLocalArtwork?: boolean
  importBarcodeIsbn?: boolean
  scanForceModifiedTime?: boolean
  scanOnStartup?: boolean
  scanInterval?: Library.ScanInterval
  scanCbx?: boolean
  scanPdf?: boolean
  scanEpub?: boolean
  scanDirectoryExclusions?: ReadonlySet<string>
  repairExtensions?: boolean
  convertToCbz?: boolean
  emptyTrashAfterScan?: boolean
  seriesCover?: Library.SeriesCover
  hashFiles?: boolean
  hashPages?: boolean
  hashKoreader?: boolean
  analyzeDimensions?: boolean
  oneshotsDirectory?: string | null
  unavailableDate?: LocalDateTime | null
  id?: string
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class Library extends DataClass<LibraryParams> implements Auditable {
  readonly name: string
  readonly root: URL
  readonly importComicInfoBook: boolean
  readonly importComicInfoSeries: boolean
  readonly importComicInfoCollection: boolean
  readonly importComicInfoReadList: boolean
  readonly importComicInfoSeriesAppendVolume: boolean
  readonly importEpubBook: boolean
  readonly importEpubSeries: boolean
  readonly importMylarSeries: boolean
  readonly importLocalArtwork: boolean
  readonly importBarcodeIsbn: boolean
  readonly scanForceModifiedTime: boolean
  readonly scanOnStartup: boolean
  readonly scanInterval: Library.ScanInterval
  readonly scanCbx: boolean
  readonly scanPdf: boolean
  readonly scanEpub: boolean
  readonly scanDirectoryExclusions: ReadonlySet<string>
  readonly repairExtensions: boolean
  readonly convertToCbz: boolean
  readonly emptyTrashAfterScan: boolean
  readonly seriesCover: Library.SeriesCover
  readonly hashFiles: boolean
  readonly hashPages: boolean
  readonly hashKoreader: boolean
  readonly analyzeDimensions: boolean
  readonly oneshotsDirectory: string | null
  readonly unavailableDate: LocalDateTime | null
  readonly id: string
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    name,
    root,
    importComicInfoBook = true,
    importComicInfoSeries = true,
    importComicInfoCollection = true,
    importComicInfoReadList = true,
    importComicInfoSeriesAppendVolume = true,
    importEpubBook = true,
    importEpubSeries = true,
    importMylarSeries = true,
    importLocalArtwork = true,
    importBarcodeIsbn = true,
    scanForceModifiedTime = false,
    scanOnStartup = false,
    scanInterval = Library.ScanInterval.EVERY_6H,
    scanCbx = true,
    scanPdf = true,
    scanEpub = true,
    scanDirectoryExclusions = new Set(),
    repairExtensions = false,
    convertToCbz = false,
    emptyTrashAfterScan = false,
    seriesCover = Library.SeriesCover.FIRST,
    hashFiles = true,
    hashPages = false,
    hashKoreader = false,
    analyzeDimensions = true,
    oneshotsDirectory = null,
    unavailableDate = null,
    id = TsidCreator.getTsid256().toString(),
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: LibraryParams) {
    super()
    this.name = name
    this.root = root
    this.importComicInfoBook = importComicInfoBook
    this.importComicInfoSeries = importComicInfoSeries
    this.importComicInfoCollection = importComicInfoCollection
    this.importComicInfoReadList = importComicInfoReadList
    this.importComicInfoSeriesAppendVolume = importComicInfoSeriesAppendVolume
    this.importEpubBook = importEpubBook
    this.importEpubSeries = importEpubSeries
    this.importMylarSeries = importMylarSeries
    this.importLocalArtwork = importLocalArtwork
    this.importBarcodeIsbn = importBarcodeIsbn
    this.scanForceModifiedTime = scanForceModifiedTime
    this.scanOnStartup = scanOnStartup
    this.scanInterval = scanInterval
    this.scanCbx = scanCbx
    this.scanPdf = scanPdf
    this.scanEpub = scanEpub
    this.scanDirectoryExclusions = scanDirectoryExclusions
    this.repairExtensions = repairExtensions
    this.convertToCbz = convertToCbz
    this.emptyTrashAfterScan = emptyTrashAfterScan
    this.seriesCover = seriesCover
    this.hashFiles = hashFiles
    this.hashPages = hashPages
    this.hashKoreader = hashKoreader
    this.analyzeDimensions = analyzeDimensions
    this.oneshotsDirectory = oneshotsDirectory
    this.unavailableDate = unavailableDate
    this.id = id
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }

  get path(): string {
    return lazy(this, 'path', () => urlToPath(this.root))
  }
}

export namespace Library {
  export class SeriesCover extends KEnum {
    static readonly FIRST = new SeriesCover('FIRST')
    static readonly FIRST_UNREAD_OR_FIRST = new SeriesCover('FIRST_UNREAD_OR_FIRST')
    static readonly FIRST_UNREAD_OR_LAST = new SeriesCover('FIRST_UNREAD_OR_LAST')
    static readonly LAST = new SeriesCover('LAST')
  }

  export class ScanInterval extends KEnum {
    static readonly DISABLED = new ScanInterval('DISABLED')
    static readonly HOURLY = new ScanInterval('HOURLY')
    static readonly EVERY_6H = new ScanInterval('EVERY_6H')
    static readonly EVERY_12H = new ScanInterval('EVERY_12H')
    static readonly DAILY = new ScanInterval('DAILY')
    static readonly WEEKLY = new ScanInterval('WEEKLY')
  }
}
