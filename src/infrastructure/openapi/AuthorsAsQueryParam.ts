// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/openapi/AuthorsAsQueryParam.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ParameterAnnotation } from '../../port/swagger-annotations.js'

// PORT: annotation méta -> liste de @Parameter, à ajouter à HandlerSpec.openapi.parameters
// @Target(AnnotationTarget.ANNOTATION_CLASS, AnnotationTarget.FUNCTION)
// @Parameters(
export const AuthorsAsQueryParam: readonly ParameterAnnotation[] = [
  {
    description: 'Author criteria in the format: name,role. Multiple author criteria are supported.',
    in: 'query',
    name: 'author',
    array: { schema: { type: 'string' } },
  },
]
