// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/LibraryCreationDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { NotBlank, constraints } from '../../../../port/validation.js'
import { ScanIntervalDto } from './ScanIntervalDto.js'
import { SeriesCoverDto } from './SeriesCoverDto.js'

type LibraryCreationDtoParams = {
  name: string
  root: string
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
  scanInterval?: ScanIntervalDto
  scanOnStartup?: boolean
  scanCbx?: boolean
  scanPdf?: boolean
  scanEpub?: boolean
  scanDirectoryExclusions?: ReadonlySet<string>
  repairExtensions?: boolean
  convertToCbz?: boolean
  emptyTrashAfterScan?: boolean
  seriesCover?: SeriesCoverDto
  hashFiles?: boolean
  hashPages?: boolean
  hashKoreader?: boolean
  analyzeDimensions?: boolean
  oneshotsDirectory?: string | null
}

export class LibraryCreationDto extends DataClass<LibraryCreationDtoParams> {
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
    scanInterval = ScanIntervalDto.EVERY_6H,
    scanOnStartup = false,
    scanCbx = true,
    scanPdf = true,
    scanEpub = true,
    scanDirectoryExclusions = new Set(),
    repairExtensions = false,
    convertToCbz = false,
    emptyTrashAfterScan = false,
    seriesCover = SeriesCoverDto.FIRST,
    hashFiles = true,
    hashPages = false,
    hashKoreader = false,
    analyzeDimensions = true,
    oneshotsDirectory = null,
  }: LibraryCreationDtoParams) {
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
  }
}

constraints(LibraryCreationDto, {
  name: [NotBlank()],
  root: [NotBlank()],
})
jsonProperties(
  LibraryCreationDto,
  {
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
  },
  [],
  { required: ['name', 'root'] },
)
