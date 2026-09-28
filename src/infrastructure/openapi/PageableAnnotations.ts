// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/openapi/PageableAnnotations.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ParameterAnnotation } from '../../port/swagger-annotations.js'

// PORT: annotations méta -> listes de @Parameter, à ajouter à HandlerSpec.openapi.parameters

// @Target(AnnotationTarget.ANNOTATION_CLASS, AnnotationTarget.FUNCTION)
// @Parameter(
export const PageAsQueryParam: readonly ParameterAnnotation[] = [
  {
    description: 'Zero-based page index (0..N)',
    in: 'query',
    name: 'page',
    schema: { type: 'integer' },
  },
]

// @Target(AnnotationTarget.ANNOTATION_CLASS, AnnotationTarget.FUNCTION)
// @Parameters(
export const PageableWithoutSortAsQueryParam: readonly ParameterAnnotation[] = [
  {
    description: 'Zero-based page index (0..N)',
    in: 'query',
    name: 'page',
    schema: { type: 'integer' },
  },
  {
    description: 'The size of the page to be returned',
    in: 'query',
    name: 'size',
    schema: { type: 'integer' },
  },
]

// @Target(AnnotationTarget.ANNOTATION_CLASS, AnnotationTarget.FUNCTION)
// @Parameters(
export const PageableAsQueryParam: readonly ParameterAnnotation[] = [
  {
    description: 'Zero-based page index (0..N)',
    in: 'query',
    name: 'page',
    schema: { type: 'integer' },
  },
  {
    description: 'The size of the page to be returned',
    in: 'query',
    name: 'size',
    schema: { type: 'integer' },
  },
  {
    description: 'Sorting criteria in the format: property(,asc|desc). Default sort order is ascending. Multiple sort criteria are supported.',
    in: 'query',
    name: 'sort',
    array: { schema: { type: 'string' } },
  },
]
