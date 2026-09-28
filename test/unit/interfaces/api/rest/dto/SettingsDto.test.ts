// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/SettingsDtoOracleTest.kt
import { SettingMultiSource, SettingsDto, publicSettings } from '../../../../../../src/interfaces/api/rest/dto/SettingsDto.js'
import { ThumbnailSizeDto } from '../../../../../../src/interfaces/api/rest/dto/ThumbnailSizeDto.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/SettingsDto')

const full = new SettingsDto({
  deleteEmptyCollections: true,
  deleteEmptyReadLists: false,
  rememberMeDurationDays: 365,
  thumbnailSize: ThumbnailSizeDto.LARGE,
  taskPoolSize: 4,
  serverPort: new SettingMultiSource({ configurationSource: 8080, databaseSource: null, effectiveValue: 8080 }),
  serverContextPath: new SettingMultiSource({ configurationSource: null, databaseSource: '/komga', effectiveValue: '/komga' }),
  koboProxy: true,
  koboPort: 443,
  kepubifyPath: new SettingMultiSource<string>({ configurationSource: null, databaseSource: null, effectiveValue: null }),
  maxUploadFileSizeBytes: 1048576,
})

func('public', () => {
  kase('full', () => publicSettings(full))
  kase('empty', () => publicSettings(new SettingsDto()))
  kase('json full', () => json(full))
  kase('json public', () => json(publicSettings(full)))
  kase('json empty', () => json(publicSettings(new SettingsDto())))
})
