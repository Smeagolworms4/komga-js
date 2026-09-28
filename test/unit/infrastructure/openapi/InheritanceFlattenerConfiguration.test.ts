// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/openapi/InheritanceFlattenerConfigurationOracleTest.kt
// PORT: Schema.type() du portage = champ `types` d'OpenAPI 3.1 (swagger-core), seul sérialisé par springdoc 2.8
import { InheritanceFlattenerConfiguration } from '../../../../src/infrastructure/openapi/InheritanceFlattenerConfiguration.js'
import { writeJson } from '../../../../src/port/springdoc.js'
import { Components, OpenAPI, Schema } from '../../../../src/port/swagger-models.js'
import { exceptionType, oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/openapi/InheritanceFlattenerConfiguration')

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

const ref = (name: string) => new Schema().$ref(`#/components/schemas/${name}`)
const inline = (...props: string[]) => new Schema().type('object').properties(new Map(props.map((p) => [p, new Schema().type('string')])))
const named = (name: string, allOf: Schema[] | null) => new Schema().name(name).allOf(allOf)

const customizer = new InheritanceFlattenerConfiguration().flattenInheritedSchemasCustomizer()
func('flattenInheritedSchemasCustomizer', () => {
  kase('no components', () => {
    const it = new OpenAPI()
    customizer.customise(it)
    return json(it)
  })
  kase('no schemas', () => {
    const it = new OpenAPI().components(new Components())
    customizer.customise(it)
    return json(it)
  })
  kase('flattened and untouched schemas', () => {
    const openApi = new OpenAPI().components(
      new Components()
        .addSchemas('SearchOperatorIs', named('SearchOperatorIs', [ref('SearchOperatorEquality'), inline('value')]))
        .addSchemas('SearchConditionAnyOfBook', named('SearchConditionAnyOfBook', [inline('anyOf', 'x'), ref('SearchConditionBook')]))
        .addSchemas('SearchConditionOnlyRef', named('SearchConditionOnlyRef', [ref('A'), ref('B')]))
        .addSchemas('SearchOperatorOnlyInline', named('SearchOperatorOnlyInline', [inline('v')]))
        .addSchemas('SearchOperatorNoAllOf', named('SearchOperatorNoAllOf', null).type('object'))
        .addSchemas('searchOperatorLowerCase', named('searchOperatorLowerCase', [ref('X'), inline('y')]))
        .addSchemas('OtherSchema', named('OtherSchema', [ref('X'), inline('y')]))
        .addSchemas('SearchOperatorTwoInline', named('SearchOperatorTwoInline', [ref('R'), inline('first'), inline('second')])),
    )
    customizer.customise(openApi)
    return json(openApi)
  })
  kase('schema without name', () => {
    const openApi = new OpenAPI().components(new Components().addSchemas('SearchOperatorX', new Schema().allOf([ref('A'), inline('b')])))
    return exceptionType(() => customizer.customise(openApi))
  })
})
