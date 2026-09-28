// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/configuration/KomgaSettingsProviderOracleTest.kt
import { KomgaSettingsProvider } from '../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/configuration/KomgaSettingsProvider')

const db = new OracleDb()
const events: unknown[] = []
const publisher = new (class extends ApplicationEventPublisher {
  publishEvent(event: unknown): void {
    events.push(event)
  }
})()

const stored = () => db.serverSettingsDao.getSettingByKey<string>('REMEMBER_ME_KEY', String)
const describe = (key: string) => [key.length, /^[a-zA-Z0-9]*$/.test(key)]

func('getRandomRememberMeKey', () => {
  kase('generated at creation and stored', () => {
    const provider = new KomgaSettingsProvider(db.serverSettingsDao, publisher)
    return [...describe(provider.rememberMeKey), stored() === provider.rememberMeKey]
  })
  kase('read back by a new provider', () => {
    const first = new KomgaSettingsProvider(db.serverSettingsDao, publisher).rememberMeKey
    return new KomgaSettingsProvider(db.serverSettingsDao, publisher).rememberMeKey === first
  })
  kase('keys differ', () => new Set([1, 2, 3, 4, 5].map(() => new KomgaSettingsProvider(new OracleDb().serverSettingsDao, publisher).rememberMeKey)).size)
})
func('renewRememberMeKey', () => {
  kase('new key stored', () => {
    const provider = new KomgaSettingsProvider(db.serverSettingsDao, publisher)
    const before = provider.rememberMeKey
    provider.renewRememberMeKey()
    return [...describe(provider.rememberMeKey), provider.rememberMeKey !== before, stored() === provider.rememberMeKey]
  })
  kase('twice', () => {
    const provider = new KomgaSettingsProvider(db.serverSettingsDao, publisher)
    provider.renewRememberMeKey()
    const first = provider.rememberMeKey
    provider.renewRememberMeKey()
    return [first !== provider.rememberMeKey, new KomgaSettingsProvider(db.serverSettingsDao, publisher).rememberMeKey === provider.rememberMeKey]
  })
  kase('no event published', () => events.length)
})
