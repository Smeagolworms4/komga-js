// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/LibraryUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { NullOrNotBlank } from '../../../../infrastructure/validation/NullOrNotBlank.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { constraints } from '../../../../port/validation.js'
import { ScanIntervalDto } from './ScanIntervalDto.js'
import { SeriesCoverDto } from './SeriesCoverDto.js'

type LibraryUpdateDtoParams = {
  name?: string | null
  root?: string | null
  importComicInfoBook?: boolean | null
  importComicInfoSeries?: boolean | null
  importComicInfoCollection?: boolean | null
  importComicInfoReadList?: boolean | null
  importComicInfoSeriesAppendVolume?: boolean | null
  importEpubBook?: boolean | null
  importEpubSeries?: boolean | null
  importMylarSeries?: boolean | null
  importLocalArtwork?: boolean | null
  importBarcodeIsbn?: boolean | null
  scanForceModifiedTime?: boolean | null
  scanInterval?: ScanIntervalDto | null
  scanOnStartup?: boolean | null
  scanCbx?: boolean | null
  scanPdf?: boolean | null
  scanEpub?: boolean | null
  scanDirectoryExclusions?: ReadonlySet<string> | null
  repairExtensions?: boolean | null
  convertToCbz?: boolean | null
  emptyTrashAfterScan?: boolean | null
  seriesCover?: SeriesCoverDto | null
  hashFiles?: boolean | null
  hashPages?: boolean | null
  hashKoreader?: boolean | null
  analyzeDimensions?: boolean | null
  oneshotsDirectory?: string | null
}

// PORT: classe Kotlin sans constructeur principal, dont Jackson affecte les propriétés présentes dans le JSON ;
// le constructeur reçoit ici les propriétés lues et les affecte (les setters observables marquent isSet)
export class LibraryUpdateDto {
  private readonly _isSet = new Map<string, boolean>()

  isSet(prop: string): boolean {
    return this._isSet.get(prop) ?? false
  }

  readonly name: string | null = null

  readonly root: string | null = null

  readonly importComicInfoBook: boolean | null = null
  readonly importComicInfoSeries: boolean | null = null
  readonly importComicInfoCollection: boolean | null = null
  readonly importComicInfoReadList: boolean | null = null
  readonly importComicInfoSeriesAppendVolume: boolean | null = null
  readonly importEpubBook: boolean | null = null
  readonly importEpubSeries: boolean | null = null
  readonly importMylarSeries: boolean | null = null
  readonly importLocalArtwork: boolean | null = null
  readonly importBarcodeIsbn: boolean | null = null

  readonly scanForceModifiedTime: boolean | null = null
  readonly scanInterval: ScanIntervalDto | null = null
  readonly scanOnStartup: boolean | null = null
  readonly scanCbx: boolean | null = null
  readonly scanPdf: boolean | null = null
  readonly scanEpub: boolean | null = null

  private _scanDirectoryExclusions: ReadonlySet<string> | null = null
  get scanDirectoryExclusions(): ReadonlySet<string> | null {
    return this._scanDirectoryExclusions
  }
  set scanDirectoryExclusions(value: ReadonlySet<string> | null) {
    this._scanDirectoryExclusions = value
    this._isSet.set('scanDirectoryExclusions', true)
  }

  readonly repairExtensions: boolean | null = null
  readonly convertToCbz: boolean | null = null
  readonly emptyTrashAfterScan: boolean | null = null
  readonly seriesCover: SeriesCoverDto | null = null
  readonly hashFiles: boolean | null = null
  readonly hashPages: boolean | null = null
  readonly hashKoreader: boolean | null = null
  readonly analyzeDimensions: boolean | null = null

  private _oneshotsDirectory: string | null = null
  get oneshotsDirectory(): string | null {
    return this._oneshotsDirectory
  }
  set oneshotsDirectory(value: string | null) {
    this._oneshotsDirectory = value
    this._isSet.set('oneshotsDirectory', true)
  }

  constructor(props: LibraryUpdateDtoParams = {}) {
    Object.assign(this, props)
  }
}

constraints(LibraryUpdateDto, {
  name: [NullOrNotBlank()],
  root: [NullOrNotBlank()],
})
jsonProperties(LibraryUpdateDto, {
  name: { nullable: 'String' },
  root: { nullable: 'String' },
  importComicInfoBook: { nullable: 'Boolean' },
  importComicInfoSeries: { nullable: 'Boolean' },
  importComicInfoCollection: { nullable: 'Boolean' },
  importComicInfoReadList: { nullable: 'Boolean' },
  importComicInfoSeriesAppendVolume: { nullable: 'Boolean' },
  importEpubBook: { nullable: 'Boolean' },
  importEpubSeries: { nullable: 'Boolean' },
  importMylarSeries: { nullable: 'Boolean' },
  importLocalArtwork: { nullable: 'Boolean' },
  importBarcodeIsbn: { nullable: 'Boolean' },
  scanForceModifiedTime: { nullable: 'Boolean' },
  scanInterval: { nullable: { enum: ScanIntervalDto } },
  scanOnStartup: { nullable: 'Boolean' },
  scanCbx: { nullable: 'Boolean' },
  scanPdf: { nullable: 'Boolean' },
  scanEpub: { nullable: 'Boolean' },
  scanDirectoryExclusions: { nullable: { set: 'String' } },
  repairExtensions: { nullable: 'Boolean' },
  convertToCbz: { nullable: 'Boolean' },
  emptyTrashAfterScan: { nullable: 'Boolean' },
  seriesCover: { nullable: { enum: SeriesCoverDto } },
  hashFiles: { nullable: 'Boolean' },
  hashPages: { nullable: 'Boolean' },
  hashKoreader: { nullable: 'Boolean' },
  analyzeDimensions: { nullable: 'Boolean' },
  oneshotsDirectory: { nullable: 'String' },
})
