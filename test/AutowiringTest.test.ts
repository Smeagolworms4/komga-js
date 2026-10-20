// @port-of komga/src/test/kotlin/org/gotson/komga/AutowiringTest.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { afterAll, describe, expect, it } from 'vitest'
import { DSLContext } from '../src/port/jooq/dsl.js'
import { closeContext, springBootTest } from './SpringBootTest.js'
// PORT: le scan des composants de @SpringBootTest (tous les modules de src/) est fait par test/support/mockmvc.ts
import { scanFailures } from './support/mockmvc.js'

// @SpringBootTest
describe('AutowiringTest', () => {
  const ctx = springBootTest()
  const dslContexts = ctx.getBeansOfType(DSLContext)

  afterAll(() => closeContext(ctx))

  it('Application loads properly with test properties', () => {
    // PORT: un module de src/ qui ne se charge pas ferait échouer le chargement du contexte Spring
    expect(scanFailures).toEqual([])
  })

  it('Application has 4 dsl contexts', () => {
    expect(dslContexts).toHaveLength(4)
  })
})
