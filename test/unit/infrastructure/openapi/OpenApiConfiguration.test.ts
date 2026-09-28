// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/openapi/OpenApiConfigurationOracleTest.kt
import { OpenApiConfiguration } from '../../../../src/infrastructure/openapi/OpenApiConfiguration.js'
import { Environment } from '../../../../src/port/spring.js'
import { HandlerMethod, writeJson } from '../../../../src/port/springdoc.js'
import { type OpenAPI, Operation } from '../../../../src/port/swagger-models.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/openapi/OpenApiConfiguration')

/** JSON écrit comme springdoc, clés triées récursivement (même normalisation que le test Kotlin) */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v !== null && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) o[k] = sortKeys((v as Record<string, unknown>)[k])
    return o
  }
  return v
}
const json = (openApi: OpenAPI) => JSON.stringify(sortKeys(JSON.parse(writeJson(openApi))))

// PORT: contrôleurs annotés @PreAuthorize -> descriptions ControllerSpec / HandlerSpec du portage
const AdminController = { preAuthorize: "hasRole('ADMIN')", handlers: { inherited: {}, own: { preAuthorize: "hasRole('FILE_DOWNLOAD') and hasRole('PAGE_STREAMING')" } } }
const OpenController = {
  handlers: {
    none: {},
    noRole: { preAuthorize: 'isAuthenticated()' },
    several: { preAuthorize: "hasRole('KOBO_SYNC') or hasRole('ADMIN') or hasRole('KOBO_SYNC')" },
    anyRole: { preAuthorize: "hasAnyRole('ADMIN', 'USER')" },
    oddQuotes: { preAuthorize: 'hasRole("ADMIN") and hasRole(\'\')' },
  },
}
type Controller = { preAuthorize?: string; handlers: Record<string, { preAuthorize?: string }> }
const handlerMethod = (c: Controller, method: string) => new HandlerMethod(c as never, c.handlers[method] as never, method)

func('openApi', () => {
  kase('default profile', () => json(new OpenApiConfiguration('1.2.3', new Environment({ env: {}, profiles: [] })).openApi()))
  kase('generate-openapi profile', () => json(new OpenApiConfiguration('', new Environment({ env: {}, profiles: ['generate-openapi'] })).openApi()))
})

func('roleDescriptionCustomizer', () => {
  const customizer = new OpenApiConfiguration('1', new Environment({ env: {}, profiles: [] })).roleDescriptionCustomizer()
  const run = (c: Controller, method: string, description: string | null = null) =>
    customizer.customize(new Operation().description(description), handlerMethod(c, method)).getDescription()

  kase('class annotation', () => run(AdminController, 'inherited'))
  kase('method annotation wins', () => run(AdminController, 'own'))
  kase('existing description', () => run(AdminController, 'own', 'Existing.'))
  kase('empty description', () => run(AdminController, 'inherited', ''))
  kase('no annotation', () => run(OpenController, 'none', 'Kept'))
  kase('no role in expression', () => run(OpenController, 'noRole'))
  kase('several roles with duplicate', () => run(OpenController, 'several'))
  kase('hasAnyRole not matched', () => run(OpenController, 'anyRole'))
  kase('odd quotes', () => run(OpenController, 'oddQuotes'))
  kase('same operation returned', () => {
    const op = new Operation()
    return customizer.customize(op, handlerMethod(AdminController, 'own')) === op
  })
})
