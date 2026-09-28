// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/datasource/DataSourcesConfigurationTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, describe, expect, it } from 'vitest'
import { HikariDataSource } from '../../../src/port/sqlite.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'

describe('DataSourcesConfigurationTest', () => {
  // @SpringBootTest
  describe('WalMode', () => {
    const ctx = springBootTest()
    const dataSourceRW = ctx.getBean(HikariDataSource)
    const dataSourceRO = ctx.getBean(HikariDataSource, 'sqliteDataSourceRO')
    const tasksDataSourceRW = ctx.getBean(HikariDataSource, 'tasksDataSourceRW')
    const tasksDataSourceRO = ctx.getBean(HikariDataSource, 'tasksDataSourceRO')

    afterAll(() => closeContext(ctx))

    it('given wal mode when autoriwiring beans then bean instances are different between RW and RO', () => {
      expect(dataSourceRW).not.toBe(dataSourceRO)
      expect(tasksDataSourceRW).not.toBe(tasksDataSourceRO)
    })
  })

  // @SpringBootTest
  // @ActiveProfiles("test", "memorydb")
  describe('MemoryMode', () => {
    const ctx = springBootTest({}, [], { profiles: ['test', 'memorydb'] })
    const dataSourceRW = ctx.getBean(HikariDataSource)
    const dataSourceRO = ctx.getBean(HikariDataSource, 'sqliteDataSourceRO')
    const tasksDataSourceRW = ctx.getBean(HikariDataSource, 'tasksDataSourceRW')
    const tasksDataSourceRO = ctx.getBean(HikariDataSource, 'tasksDataSourceRO')

    afterAll(() => closeContext(ctx))

    it('given wal mode when autoriwiring beans then bean instances are the same between RW and RO', () => {
      expect(dataSourceRW).toBe(dataSourceRO)
      expect(tasksDataSourceRW).toBe(tasksDataSourceRO)
    })
  })
})
