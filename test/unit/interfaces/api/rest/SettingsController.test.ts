// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/SettingsControllerOracleTest.kt
import { UserRoles } from '../../../../../src/domain/model/UserRoles.js'
import { KomgaSettingsProvider } from '../../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { KepubConverter } from '../../../../../src/infrastructure/kobo/KepubConverter.js'
import { WebServerEffectiveSettings } from '../../../../../src/infrastructure/web/WebServerEffectiveSettings.js'
import { SettingsController } from '../../../../../src/interfaces/api/rest/SettingsController.js'
import { SettingsUpdateDto } from '../../../../../src/interfaces/api/rest/dto/SettingsUpdateDto.js'
import { DataSize, MultipartProperties, ServletContext } from '../../../../../src/port/spring-boot-web.js'
import { ApplicationEventPublisher, Environment } from '../../../../../src/port/spring.js'
import { Canonical } from '../../../canon.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { Calls, principal, read, user } from './rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/SettingsController')

const db = new OracleDb()
const calls = new Calls()
class Publisher extends ApplicationEventPublisher {
  publishEvent(event: unknown): void {
    calls.add('publishEvent', event)
  }
}
const provider = new KomgaSettingsProvider(db.serverSettingsDao, new Publisher())
const kepub = new KepubConverter(provider, db.bookProjectionDao, '/opt/kepubify')
const serverSettings = new WebServerEffectiveSettings(new ServletContext('/komga'))
const multipart = new MultipartProperties(new Environment({ env: {} }))
const admin = principal(user('A', { roles: new Set([UserRoles.ADMIN]) }))
const regular = principal(user('U'))

const controller = (port: number | null = null, path: string | null = null) => new SettingsController(provider, port, path, serverSettings, kepub, multipart)
const update = (src: string) => read<SettingsUpdateDto>(src, { class: SettingsUpdateDto })

func('getServerSettings', () => {
  kase('defaults, admin', () => [controller().getServerSettings(admin), calls.take()])
  kase('defaults, user', () => controller().getServerSettings(regular))
  kase('configured, admin', () => {
    serverSettings.effectiveServerPort = 25600
    ;(kepub as unknown as { _kepubifyPath: string })._kepubifyPath = '/usr/bin/kepubify'
    multipart.maxFileSize = DataSize.ofMegabytes(50)
    return controller(8080, '/cfg').getServerSettings(admin)
  })
  kase('no max file size', () => {
    multipart.maxFileSize = null
    return [controller().getServerSettings(admin), controller().getServerSettings(regular)]
  })
})
func('updateServerSettings', () => {
  kase('empty', () => {
    controller().updateServerSettings(update('{}'))
    return [controller().getServerSettings(admin), calls.take()]
  })
  kase('all values', () => {
    controller().updateServerSettings(
      update(`{"deleteEmptyCollections":false,"deleteEmptyReadLists":false,"rememberMeDurationDays":30,"thumbnailSize":"LARGE","taskPoolSize":3,
"serverPort":9000,"serverContextPath":"/k","koboProxy":true,"koboPort":443,"kepubifyPath":"/bin/kepubify"}`),
    )
    return [controller().getServerSettings(admin), calls.take()]
  })
  kase('nulls reset nullable settings only', () => {
    controller().updateServerSettings(update('{"deleteEmptyCollections":null,"taskPoolSize":null,"serverPort":null,"serverContextPath":null,"koboPort":null,"kepubifyPath":null}'))
    return [controller().getServerSettings(admin), calls.take()]
  })
  kase('renew remember me key', () => {
    const before = provider.rememberMeKey
    controller().updateServerSettings(update('{"renewRememberMeKey":true}'))
    return [before !== provider.rememberMeKey, provider.rememberMeKey.length, ((calls.take() as Canonical).value as unknown[]).length]
  })
  kase('renew false', () => {
    const before = provider.rememberMeKey
    controller().updateServerSettings(update('{"renewRememberMeKey":false}'))
    return before === provider.rememberMeKey
  })
  kase('stored', () => db.rawQuery("SELECT KEY, VALUE FROM SERVER_SETTINGS WHERE KEY <> 'REMEMBER_ME_KEY' ORDER BY KEY"))
})
