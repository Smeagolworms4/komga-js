// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/openapi/InheritanceFlattenerConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { NullPointerException } from '../../port/kotlin.js'
import { configuration } from '../../port/spring.js'
import { OpenApiCustomizer, openApiCustomizer } from '../../port/springdoc.js'

/**
 * The generated schema for sealed classes is somehow wrong.
 * This customizer will correct the issues.
 */
export class InheritanceFlattenerConfiguration {
  private readonly schemaPrefix = ['SearchOperator', 'SearchCondition']

  flattenInheritedSchemasCustomizer(): OpenApiCustomizer {
    return openApiCustomizer((openApi) => {
      ;[...(openApi.getComponents()?.getSchemas()?.values() ?? [])]
        .filter((schema) => {
          // PORT: schema.name (plateforme Java, non nul attendu) : un schéma sans nom lève NullPointerException
          const name = schema.getName()
          if (name === null) throw new NullPointerException()
          return this.schemaPrefix.some((prefix) => name.startsWith(prefix))
        })
        .forEach((schema) => {
          // Swagger models inheritance as an allOf list with exactly two items:
          // 1. The $ref to the parent interface
          // 2. An inline schema containing the child's actual properties
          const allOf = schema.getAllOf()
          if (allOf !== null) {
            const refSchema = allOf.filter((it) => it.get$ref() !== null)
            const inlineSchema = allOf.find((it) => it.getProperties() !== null)

            // If both are found, we know this is an inherited schema wrapper
            if (refSchema.length > 0 && inlineSchema !== undefined) {
              // Move the properties up to the root schema
              schema.setProperties(inlineSchema.getProperties())

              // Delete the allOf array entirely
              schema.setAllOf(null)
            }
          }
        })
    })
  }
}

// @Configuration
// @Order(Ordered.LOWEST_PRECEDENCE)
configuration(InheritanceFlattenerConfiguration, {
  beans: [{ method: 'flattenInheritedSchemasCustomizer', type: OpenApiCustomizer }],
})
