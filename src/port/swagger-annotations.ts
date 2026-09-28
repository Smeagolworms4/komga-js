// Support de portage : annotations OpenAPI de swagger-core (io.swagger.v3.oas.annotations) et de springdoc,
// déclarées en données, comme les annotations Spring (port/spring-web.ts) et Jackson (port/jackson.ts).
// Elles ne servent qu'à la génération du document OpenAPI (/v3/api-docs, port/springdoc.ts). Ce fichier n'a pas de jumeau Kotlin.
//
// Correspondance (dans le fichier jumeau du contrôleur) :
//
//   @Tag(name = X) sur la classe                  -> ControllerSpec.openapi.tags: [X]
//   @SecurityRequirements sur la classe           -> ControllerSpec.openapi.securityRequirements: true
//   @Hidden sur la classe                         -> ControllerSpec.openapi.hidden: true
//   @Operation(summary, description, tags, ...)   -> HandlerSpec.openapi.operation: { summary, description, tags, operationId?, deprecated?, hidden? }
//   @Deprecated (Kotlin) sur la méthode           -> HandlerSpec.openapi.deprecated: true
//   @SecurityRequirements sur la méthode          -> HandlerSpec.openapi.securityRequirements: true
//   @Throws(X::class)                             -> HandlerSpec.openapi.throws: [X]
//   @Parameter(...) / @Parameters(...) sur la méthode, et annotations méta de Komga
//     (@PageableAsQueryParam, @PageableWithoutSortAsQueryParam, @PageAsQueryParam, @AuthorsAsQueryParam,
//     exportées par infrastructure/openapi/*.ts)  -> HandlerSpec.openapi.parameters: [...], dans l'ordre de sortie :
//     d'abord les @Parameter(s) directs, puis les annotations méta dans l'ordre de déclaration
//   @ApiResponse(responseCode?, description?, content = [Content(mediaType?, schema = Schema(type, format))])
//                                                 -> HandlerSpec.openapi.responses: [{ content: [{ schema: { type: 'string', format: 'binary' } }] }]
//   @io.swagger...RequestBody(description, required) -> HandlerSpec.openapi.requestBody
//   @Parameter(hidden = true) / @Parameter(description = "...") sur un argument
//                                                 -> withParameter(argSpec, { hidden: true }) (port/spring-web.ts)
//   @Schema(name, description, example, oneOf, discriminator...) sur une classe / propriété
//                                                 -> openApiSchema(Classe, { name, ..., properties: { prop: { description, example } } }) en fin de fichier
//
// Type de retour : la génération utilise `HandlerSpec.returns` (type Kotlin de retour, corps de ResponseEntity<T>) ;
// absent = Unit (pas de contenu). Types spéciaux : `OpenApiTypes.StreamingResponseBody`, `OpenApiTypes.Resource`,
// `JsonTypes.ByteArray` (port/jackson-mapper.ts), `{ class: PageImpl, args: [T] }` pour Page<T>.

/** `@io.swagger.v3.oas.annotations.media.Schema` (sous-ensemble) */
export type SchemaAnnotation = {
  /** nom du composant (`@Schema(name = ...)` sur une classe) */
  name?: string
  type?: string
  format?: string
  description?: string
  example?: unknown
  examples?: unknown[]
  /** `defaultValue` */
  defaultValue?: string
  /** `@Schema(implementation = X::class)` */
  implementation?: object
  /** `oneOf = [A::class, B::class]` */
  oneOf?: object[]
  discriminatorProperty?: string
  /** `discriminatorMapping = [DiscriminatorMapping(value, schema)]` */
  discriminatorMapping?: { value: string; schema: object }[]
  /** `requiredMode = REQUIRED` (true) / `NOT_REQUIRED` (false) sur une propriété */
  required?: boolean
  /** `hidden = true` sur une propriété */
  hidden?: boolean
  /** `deprecated = true`, ou `@Deprecated` Kotlin sur la propriété */
  deprecated?: boolean
}

/** `@ArraySchema(schema = Schema(...))` */
export type ArraySchemaAnnotation = { schema: SchemaAnnotation }

/** `@io.swagger.v3.oas.annotations.Parameter` */
export type ParameterAnnotation = {
  name?: string
  in?: 'query' | 'path' | 'header' | 'cookie'
  description?: string
  required?: boolean
  hidden?: boolean
  deprecated?: boolean
  example?: unknown
  schema?: SchemaAnnotation
  array?: ArraySchemaAnnotation
}

/** `@io.swagger.v3.oas.annotations.media.Content` */
export type ContentAnnotation = { mediaType?: string; schema?: SchemaAnnotation; array?: ArraySchemaAnnotation }

/** `@io.swagger.v3.oas.annotations.responses.ApiResponse` */
export type ApiResponseAnnotation = { responseCode?: string; description?: string; content?: ContentAnnotation[] }

/** `@io.swagger.v3.oas.annotations.Operation` */
export type OperationAnnotation = {
  summary?: string
  description?: string
  operationId?: string
  tags?: string[]
  deprecated?: boolean
  hidden?: boolean
}

/** Métadonnées OpenAPI d'une méthode de contrôleur (HandlerSpec.openapi) */
export type OpenApiHandlerSpec = {
  operation?: OperationAnnotation
  /** `@Deprecated` Kotlin/Java */
  deprecated?: boolean
  /** `@SecurityRequirements` (sans valeur) : `security: []` */
  securityRequirements?: boolean
  /** `@Throws(X::class)` : exceptions déclarées (réponses des @ExceptionHandler correspondants) */
  throws?: (abstract new (...a: never[]) => unknown)[]
  /** `@Parameter` / `@Parameters` de méthode et annotations méta, dans l'ordre de sortie */
  parameters?: ParameterAnnotation[]
  /** `@ApiResponse` */
  responses?: ApiResponseAnnotation[]
  /** `@io.swagger.v3.oas.annotations.parameters.RequestBody` */
  requestBody?: { description?: string; required?: boolean }
}

/** Métadonnées OpenAPI d'une classe de contrôleur (ControllerSpec.openapi) */
export type OpenApiControllerSpec = {
  /** `@Tag(name = ...)` */
  tags?: string[]
  /** `@SecurityRequirements` (sans valeur) */
  securityRequirements?: boolean
  /** `@Hidden` */
  hidden?: boolean
}

/** Types de retour propres à la génération OpenAPI (valeurs de `HandlerSpec.returns`) */
export const OpenApiTypes = {
  /** `StreamingResponseBody` : composant vide `StreamingResponseBody` */
  StreamingResponseBody: { scalar: 'StreamingResponseBody', read: (s: string): unknown => s, write: (v: never): string => String(v) },
  /** `Resource` : `{ type: string, format: binary }` */
  Resource: { scalar: 'Resource', read: (s: string): unknown => s, write: (v: never): string => String(v) },
} as const

// ---------------------------------------------------------------------------
// @Schema sur les classes (registre, comme json() de port/jackson.ts)
// ---------------------------------------------------------------------------

export type ClassSchemaAnnotation = SchemaAnnotation & {
  /**
   * PORT: supertypes Kotlin de la classe dans l'ordre de déclaration (réflexion `getInterfaces()`), qui fixent
   * l'ordre des `allOf` d'un sous-type d'interfaces annotées @Schema(oneOf) ; facultatif (défaut : ordre de résolution)
   */
  supertypes?: object[]
  /** `@Schema` sur les propriétés du constructeur (nom Kotlin de la propriété) */
  properties?: Record<string, SchemaAnnotation>
}

const classSchemas = new WeakMap<object, ClassSchemaAnnotation>()

/** `@Schema(...)` sur une classe (ou un `sealedInterface`) et ses propriétés */
export function openApiSchema(cls: object, meta: ClassSchemaAnnotation): void {
  const prev = classSchemas.get(cls) ?? {}
  classSchemas.set(cls, { ...prev, ...meta, properties: { ...(prev.properties ?? {}), ...(meta.properties ?? {}) } })
}

export function openApiSchemaOf(cls: object): ClassSchemaAnnotation | undefined {
  return classSchemas.get(cls)
}
