// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/SettingsDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { ThumbnailSizeDto } from './ThumbnailSizeDto.js'

type SettingsDtoParams = {
  deleteEmptyCollections?: boolean | null
  deleteEmptyReadLists?: boolean | null
  rememberMeDurationDays?: number | null
  thumbnailSize?: ThumbnailSizeDto | null
  taskPoolSize?: number | null
  serverPort?: SettingMultiSource<number> | null
  serverContextPath?: SettingMultiSource<string> | null
  koboProxy?: boolean | null
  koboPort?: number | null
  kepubifyPath?: SettingMultiSource<string> | null
  maxUploadFileSizeBytes?: number | null
}

export class SettingsDto extends DataClass<SettingsDtoParams> {
  readonly deleteEmptyCollections: boolean | null
  readonly deleteEmptyReadLists: boolean | null
  readonly rememberMeDurationDays: number | null
  readonly thumbnailSize: ThumbnailSizeDto | null
  readonly taskPoolSize: number | null
  readonly serverPort: SettingMultiSource<number> | null
  readonly serverContextPath: SettingMultiSource<string> | null
  readonly koboProxy: boolean | null
  readonly koboPort: number | null
  readonly kepubifyPath: SettingMultiSource<string> | null
  readonly maxUploadFileSizeBytes: number | null

  constructor({
    deleteEmptyCollections = null,
    deleteEmptyReadLists = null,
    rememberMeDurationDays = null,
    thumbnailSize = null,
    taskPoolSize = null,
    serverPort = null,
    serverContextPath = null,
    koboProxy = null,
    koboPort = null,
    kepubifyPath = null,
    maxUploadFileSizeBytes = null,
  }: SettingsDtoParams = {}) {
    super()
    this.deleteEmptyCollections = deleteEmptyCollections
    this.deleteEmptyReadLists = deleteEmptyReadLists
    this.rememberMeDurationDays = rememberMeDurationDays
    this.thumbnailSize = thumbnailSize
    this.taskPoolSize = taskPoolSize
    this.serverPort = serverPort
    this.serverContextPath = serverContextPath
    this.koboProxy = koboProxy
    this.koboPort = koboPort
    this.kepubifyPath = kepubifyPath
    this.maxUploadFileSizeBytes = maxUploadFileSizeBytes
  }
}

// PORT: `public` est un mot réservé en mode strict, renommé
export function publicSettings(self: SettingsDto): SettingsDto {
  return new SettingsDto({
    maxUploadFileSizeBytes: self.maxUploadFileSizeBytes,
  })
}

type SettingMultiSourceParams<T> = {
  configurationSource: T | null
  databaseSource: T | null
  effectiveValue: T | null
}

export class SettingMultiSource<T> extends DataClass<SettingMultiSourceParams<T>> {
  readonly configurationSource: T | null
  readonly databaseSource: T | null
  readonly effectiveValue: T | null

  constructor({ configurationSource, databaseSource, effectiveValue }: SettingMultiSourceParams<T>) {
    super()
    this.configurationSource = configurationSource
    this.databaseSource = databaseSource
    this.effectiveValue = effectiveValue
  }
}

json(SettingsDto, { include: 'NON_NULL' })
jsonProperties(SettingsDto, {
  deleteEmptyCollections: { nullable: 'Boolean' },
  deleteEmptyReadLists: { nullable: 'Boolean' },
  rememberMeDurationDays: { nullable: 'Long' },
  thumbnailSize: { nullable: { enum: ThumbnailSizeDto } },
  taskPoolSize: { nullable: 'Int' },
  serverPort: { nullable: { class: SettingMultiSource, args: ['Int'] } },
  serverContextPath: { nullable: { class: SettingMultiSource, args: ['String'] } },
  koboProxy: { nullable: 'Boolean' },
  koboPort: { nullable: 'Int' },
  kepubifyPath: { nullable: { class: SettingMultiSource, args: ['String'] } },
  maxUploadFileSizeBytes: { nullable: 'Long' },
})
jsonProperties(
  SettingMultiSource,
  { configurationSource: { nullable: { typeVar: 'T' } }, databaseSource: { nullable: { typeVar: 'T' } }, effectiveValue: { nullable: { typeVar: 'T' } } },
  ['T'],
)
