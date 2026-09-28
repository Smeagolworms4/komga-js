// @port-of komga/src/test/kotlin/org/gotson/komga/AutowiringTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, describe, expect, it } from 'vitest'
import { DSLContext } from '../src/port/jooq/dsl.js'
import { HikariDataSource } from '../src/port/sqlite.js'
import { closeContext, springBootTest } from './SpringBootTest.js'
// PORT: le scan des composants de @SpringBootTest (tous les modules de src/) est fait par test/support/mockmvc.ts
import { scanFailures } from './support/mockmvc.js'

// @SpringBootTest
describe('AutowiringTest', () => {
  const ctx = springBootTest()
  const dataSources = ctx.getBeansOfType(HikariDataSource)
  const dslContexts = ctx.getBeansOfType(DSLContext)

  afterAll(() => closeContext(ctx))

  it('Application loads properly with test properties', () => {
    // PORT: un module de src/ qui ne se charge pas ferait échouer le chargement du contexte Spring
    expect(scanFailures).toEqual([])
  })

  it('Application has 4 dsl contexts', () => {
    expect(dataSources).toHaveLength(4)
    expect(dslContexts).toHaveLength(4)
  })
})
