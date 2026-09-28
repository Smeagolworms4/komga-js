// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/ServerSettingsDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { ServerSettingsDao } from '../../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'

describe('ServerSettingsDaoTest', () => {
  const ctx = springBootTest()
  const serverSettingsDao = ctx.getBean(ServerSettingsDao)
  afterAll(() => closeContext(ctx))

  afterEach(() => {
    serverSettingsDao.deleteAll()
  })

  it('when saving String setting then it is persisted', () => {
    serverSettingsDao.saveSetting('setting', 'value')

    const fetch = serverSettingsDao.getSettingByKey('setting', String)

    expect(fetch).toBe('value')
  })

  it('when saving Int setting then it is persisted', () => {
    serverSettingsDao.saveSetting('setting', 12)

    const fetch = serverSettingsDao.getSettingByKey('setting', Number)

    expect(fetch).toBe(12)
  })

  it('when saving Boolean setting then it is persisted', () => {
    serverSettingsDao.saveSetting('setting', true)

    const fetch = serverSettingsDao.getSettingByKey('setting', Boolean)

    expect(fetch).toBe(true)
  })

  it('given existing setting when saving again then it is overridden', () => {
    serverSettingsDao.saveSetting('setting', 'value')

    const initial = serverSettingsDao.getSettingByKey('setting', String)
    expect(initial).toBe('value')

    serverSettingsDao.saveSetting('setting', 'updated')
    const updated = serverSettingsDao.getSettingByKey('setting', String)
    expect(updated).toBe('updated')
  })

  it('given existing setting when deleting then it is deleted', () => {
    serverSettingsDao.saveSetting('setting', 'value')

    const initial = serverSettingsDao.getSettingByKey('setting', String)
    expect(initial).toBe('value')

    serverSettingsDao.deleteSetting('setting')
    const updated = serverSettingsDao.getSettingByKey('setting', String)
    expect(updated).toBeNull()
  })
})
