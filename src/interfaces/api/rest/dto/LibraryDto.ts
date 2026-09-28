// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/LibraryDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Library } from '../../../../domain/model/Library.js'
import { toFilePath } from '../../../../infrastructure/web/Utils.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { ScanIntervalDto, toDto as scanIntervalToDto } from './ScanIntervalDto.js'
import { SeriesCoverDto, toDto as seriesCoverToDto } from './SeriesCoverDto.js'

type LibraryDtoParams = {
  id: string
  name: string
  root: string
  importComicInfoBook: boolean
  importComicInfoSeries: boolean
  importComicInfoCollection: boolean
  importComicInfoReadList: boolean
  importComicInfoSeriesAppendVolume: boolean
  importEpubBook: boolean
  importEpubSeries: boolean
  importMylarSeries: boolean
  importLocalArtwork: boolean
  importBarcodeIsbn: boolean
  scanForceModifiedTime: boolean
  scanInterval: ScanIntervalDto
  scanOnStartup: boolean
  scanCbx: boolean
  scanPdf: boolean
  scanEpub: boolean
  scanDirectoryExclusions: ReadonlySet<string>
  repairExtensions: boolean
  convertToCbz: boolean
  emptyTrashAfterScan: boolean
  seriesCover: SeriesCoverDto
  hashFiles: boolean
  hashPages: boolean
  hashKoreader: boolean
  analyzeDimensions: boolean
  oneshotsDirectory: string | null
  unavailable: boolean
}

export class LibraryDto extends DataClass<LibraryDtoParams> {
  readonly id: string
  readonly name: string
  readonly root: string
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
  readonly scanInterval: ScanIntervalDto
  readonly scanOnStartup: boolean
  readonly scanCbx: boolean
  readonly scanPdf: boolean
  readonly scanEpub: boolean
  readonly scanDirectoryExclusions: ReadonlySet<string>
  readonly repairExtensions: boolean
  readonly convertToCbz: boolean
  readonly emptyTrashAfterScan: boolean
  readonly seriesCover: SeriesCoverDto
  readonly hashFiles: boolean
  readonly hashPages: boolean
  readonly hashKoreader: boolean
  readonly analyzeDimensions: boolean
  readonly oneshotsDirectory: string | null
  readonly unavailable: boolean

  constructor({
    id,
    name,
    root,
    importComicInfoBook,
    importComicInfoSeries,
    importComicInfoCollection,
    importComicInfoReadList,
    importComicInfoSeriesAppendVolume,
    importEpubBook,
    importEpubSeries,
    importMylarSeries,
    importLocalArtwork,
    importBarcodeIsbn,
    scanForceModifiedTime,
    scanInterval,
    scanOnStartup,
    scanCbx,
    scanPdf,
    scanEpub,
    scanDirectoryExclusions,
    repairExtensions,
    convertToCbz,
    emptyTrashAfterScan,
    seriesCover,
    hashFiles,
    hashPages,
    hashKoreader,
    analyzeDimensions,
    oneshotsDirectory,
    unavailable,
  }: LibraryDtoParams) {
    super()
    this.id = id
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
    this.scanInterval = scanInterval
    this.scanOnStartup = scanOnStartup
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
    this.unavailable = unavailable
  }
}

export function toDto(self: Library, includeRoot: boolean): LibraryDto {
  return new LibraryDto({
    id: self.id,
    name: self.name,
    root: includeRoot ? toFilePath(self.root) : '',
    importComicInfoBook: self.importComicInfoBook,
    importComicInfoSeries: self.importComicInfoSeries,
    importComicInfoCollection: self.importComicInfoCollection,
    importComicInfoReadList: self.importComicInfoReadList,
    importComicInfoSeriesAppendVolume: self.importComicInfoSeriesAppendVolume,
    importEpubBook: self.importEpubBook,
    importEpubSeries: self.importEpubSeries,
    importMylarSeries: self.importMylarSeries,
    importLocalArtwork: self.importLocalArtwork,
    importBarcodeIsbn: self.importBarcodeIsbn,
    scanForceModifiedTime: self.scanForceModifiedTime,
    scanInterval: scanIntervalToDto(self.scanInterval),
    scanOnStartup: self.scanOnStartup,
    scanCbx: self.scanCbx,
    scanPdf: self.scanPdf,
    scanEpub: self.scanEpub,
    scanDirectoryExclusions: self.scanDirectoryExclusions,
    repairExtensions: self.repairExtensions,
    convertToCbz: self.convertToCbz,
    emptyTrashAfterScan: self.emptyTrashAfterScan,
    seriesCover: seriesCoverToDto(self.seriesCover),
    hashFiles: self.hashFiles,
    hashPages: self.hashPages,
    hashKoreader: self.hashKoreader,
    analyzeDimensions: self.analyzeDimensions,
    oneshotsDirectory: self.oneshotsDirectory,
    unavailable: self.unavailableDate !== null,
  })
}

jsonProperties(
  LibraryDto,
  {
    id: 'String',
    name: 'String',
    root: 'String',
    importComicInfoBook: 'Boolean',
    importComicInfoSeries: 'Boolean',
    importComicInfoCollection: 'Boolean',
    importComicInfoReadList: 'Boolean',
    importComicInfoSeriesAppendVolume: 'Boolean',
    importEpubBook: 'Boolean',
    importEpubSeries: 'Boolean',
    importMylarSeries: 'Boolean',
    importLocalArtwork: 'Boolean',
    importBarcodeIsbn: 'Boolean',
    scanForceModifiedTime: 'Boolean',
    scanInterval: { enum: ScanIntervalDto },
    scanOnStartup: 'Boolean',
    scanCbx: 'Boolean',
    scanPdf: 'Boolean',
    scanEpub: 'Boolean',
    scanDirectoryExclusions: { set: 'String' },
    repairExtensions: 'Boolean',
    convertToCbz: 'Boolean',
    emptyTrashAfterScan: 'Boolean',
    seriesCover: { enum: SeriesCoverDto },
    hashFiles: 'Boolean',
    hashPages: 'Boolean',
    hashKoreader: 'Boolean',
    analyzeDimensions: 'Boolean',
    oneshotsDirectory: { nullable: 'String' },
    unavailable: 'Boolean',
  },
  [],
  {
    required: [
      'id',
      'name',
      'root',
      'importComicInfoBook',
      'importComicInfoSeries',
      'importComicInfoCollection',
      'importComicInfoReadList',
      'importComicInfoSeriesAppendVolume',
      'importEpubBook',
      'importEpubSeries',
      'importMylarSeries',
      'importLocalArtwork',
      'importBarcodeIsbn',
      'scanForceModifiedTime',
      'scanInterval',
      'scanOnStartup',
      'scanCbx',
      'scanPdf',
      'scanEpub',
      'scanDirectoryExclusions',
      'repairExtensions',
      'convertToCbz',
      'emptyTrashAfterScan',
      'seriesCover',
      'hashFiles',
      'hashPages',
      'hashKoreader',
      'analyzeDimensions',
      'unavailable',
    ],
  },
)
