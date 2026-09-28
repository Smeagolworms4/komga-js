// Support de portage : springdoc-openapi 2.8 (springdoc-openapi-starter-webmvc-ui) tel que configuré par Komga
// (application.yml : `springdoc.paths-to-match: /api/**`, `writer-with-order-by-keys: true`,
// `swagger-ui.disable-swagger-default-url: true`) :
// - génération du document OpenAPI 3.1 (/v3/api-docs, /v3/api-docs.yaml) à partir du bean `OpenAPI`, des contrôleurs
//   enregistrés (port/spring-web.ts), de leurs annotations OpenAPI (port/swagger-annotations.ts) et des métadonnées
//   Jackson des DTO (jsonProperties, json, constraints) ; OperationCustomizer puis OpenApiCustomizer ;
// - interface Swagger UI (/swagger-ui.html, /swagger-ui/**, /v3/api-docs/swagger-config) servie depuis le paquet
//   npm swagger-ui-dist (5.21.0, la version embarquée par springdoc 2.8.9, fichiers identiques).
// Les règles reproduisent springdoc / swagger-core (ModelResolver, module Kotlin) sur les cas présents dans Komga.
// Ce fichier n'a pas de jumeau Kotlin.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { stringify as yamlStringify } from 'yaml'
import { type JavaType, JsonTypes, jsonPropertiesOf } from './jackson-mapper.js'
import { jsonMetaOf } from './jackson.js'
import { Exception, KEnum, RuntimeException, sealedInterfaceList } from './kotlin.js'
import { MultipartFile } from './servlet.js'
import { type ApplicationContext, ApplicationContext as ApplicationContextToken, configuration } from './spring.js'
import { PageImpl } from './spring-data.js'
import {
  type ArgSpec,
  type ControllerSpec,
  type HandlerSpec,
  HttpStatus,
  ResponseEntity,
  registeredAdvices,
  registeredControllers,
  restController,
} from './spring-web.js'
import { ServletUriComponentsBuilder } from './spring-web-uri.js'
import { type ResourceHandlerRegistry, WebMvcConfigurer } from './spring-webmvc-config.js'
import {
  type ApiResponseAnnotation,
  type ContentAnnotation,
  OpenApiTypes,
  type ParameterAnnotation,
  type SchemaAnnotation,
  openApiSchemaOf,
} from './swagger-annotations.js'
import {
  ApiResponse,
  ApiResponses,
  Content,
  Discriminator,
  MediaType,
  OpenAPI,
  Operation,
  Parameter,
  PathItem,
  RequestBody,
  Schema,
  SecurityRequirement,
  Server,
  Tag,
  toJsonValue,
} from './swagger-models.js'
import type { Constraint } from './validation.js'
import { constraintsOf } from './validation.js'

// ---------------------------------------------------------------------------
// Personnalisation (org.springdoc.core.customizers)
// ---------------------------------------------------------------------------

/** Annotation lue par un OperationCustomizer (`HandlerMethod.getMethodAnnotation(PreAuthorize::class.java)`) */
export const PreAuthorize = 'PreAuthorize' as const

/** Vue de `org.springframework.web.method.HandlerMethod` offerte aux OperationCustomizer */
export class HandlerMethod {
  constructor(
    private readonly controller: ControllerSpec,
    private readonly handler: HandlerSpec,
    readonly methodName: string,
  ) {}

  /** `getMethodAnnotation(PreAuthorize::class.java)` */
  getMethodAnnotation(annotation: typeof PreAuthorize): { value: string } | null {
    void annotation
    return this.handler.preAuthorize !== undefined ? { value: this.handler.preAuthorize } : null
  }

  /** `beanType.getAnnotation(PreAuthorize::class.java)` */
  get beanType(): { getAnnotation(annotation: typeof PreAuthorize): { value: string } | null } {
    const c = this.controller
    return { getAnnotation: () => (c.preAuthorize !== undefined ? { value: c.preAuthorize } : null) }
  }
}

/** `org.springdoc.core.customizers.OperationCustomizer` */
export abstract class OperationCustomizer {
  abstract customize(operation: Operation, handlerMethod: HandlerMethod): Operation
}

/** SAM Kotlin `OperationCustomizer { operation, handlerMethod -> ... }` */
export function operationCustomizer(fn: (operation: Operation, handlerMethod: HandlerMethod) => Operation): OperationCustomizer {
  return new (class extends OperationCustomizer {
    customize(operation: Operation, handlerMethod: HandlerMethod): Operation {
      return fn(operation, handlerMethod)
    }
  })()
}

/** `org.springdoc.core.customizers.OpenApiCustomizer` */
export abstract class OpenApiCustomizer {
  abstract customise(openApi: OpenAPI): void
}

/** SAM Kotlin `OpenApiCustomizer { openApi -> ... }` */
export function openApiCustomizer(fn: (openApi: OpenAPI) => void): OpenApiCustomizer {
  return new (class extends OpenApiCustomizer {
    customise(openApi: OpenAPI): void {
      fn(openApi)
    }
  })()
}

// ---------------------------------------------------------------------------
// Schémas (swagger-core ModelResolver + module Kotlin de springdoc)
// ---------------------------------------------------------------------------

type AnyClass = abstract new (...a: never[]) => unknown

/** Nom Java simple d'un type (noms des composants génériques : `PageString`, `SettingMultiSourceInteger`) */
function javaSimpleName(t: JavaType): string {
  if (typeof t === 'string') {
    switch (t) {
      case 'Int':
        return 'Integer'
      case 'Any':
        return 'Object'
      case 'Number':
        return 'Number'
      default:
        return t
    }
  }
  if ('nullable' in t) return javaSimpleName(t.nullable)
  if ('list' in t) return `List${javaSimpleName(t.list)}`
  if ('set' in t) return `Set${javaSimpleName(t.set)}`
  if ('map' in t) return `Map${javaSimpleName(t.key ?? 'String')}${javaSimpleName(t.map)}`
  if ('enum' in t) return (t.enum as unknown as { name: string }).name
  if ('class' in t) return componentName(t.class, t.args ?? [])
  if ('scalar' in t) return t.scalar
  return 'Object'
}

function componentName(cls: object, args: readonly JavaType[]): string {
  const meta = openApiSchemaOf(cls)
  const base = meta?.name ?? (cls === PageImpl ? 'Page' : ((cls as { name?: string }).name ?? 'Object'))
  return base + args.map((a) => javaSimpleName(a)).join('')
}

function isRuntime(e: AnyClass): boolean {
  let c: object | null = e
  while (c) {
    if (c === RuntimeException) return true
    if (c === Exception) return false
    c = Object.getPrototypeOf(c) as object | null
  }
  return true
}

function enumValues(e: { entries(): KEnum[] }): string[] {
  return e.entries().map((it) => {
    const j = (it as unknown as { toJSON?: () => unknown }).toJSON
    return typeof j === 'function' ? String(j.call(it)) : it.name
  })
}

/** Applique les contraintes jakarta (swagger-core : @NotBlank, @NotEmpty, @Size, @Min, @Max, @Pattern) */
function applyConstraints(schema: Schema, constraints: readonly Constraint[] | undefined): void {
  if (!constraints) return
  const isArray = schema.getType() === 'array'
  for (const c of constraints) {
    switch (c.type) {
      case 'NotBlank':
        schema.minLength(1)
        break
      case 'NotEmpty':
        if (isArray) schema.minItems(1)
        else if (schema.getType() === 'string') schema.minLength(1)
        break
      case 'Size': {
        const min = c.min as number | undefined
        const max = c.max as number | undefined
        if (isArray) {
          if (min !== undefined && min > 0) schema.minItems(min)
          if (max !== undefined && max < 2147483647) schema.maxItems(max)
        } else {
          if (min !== undefined && min > 0) schema.minLength(min)
          if (max !== undefined && max < 2147483647) schema.maxLength(max)
        }
        break
      }
      case 'Min':
        schema.minimum(c.value as number)
        break
      case 'Max':
        schema.maximum(c.value as number)
        break
      case 'Pattern':
        schema.pattern(c.regexp as string)
        break
    }
  }
}

/** Schéma d'une annotation `@Schema(type, format, ...)` */
function annotationSchema(a: SchemaAnnotation, resolver: SchemaResolver): Schema {
  if (a.implementation !== undefined) return resolver.resolve({ class: a.implementation })
  const s = new Schema()
  if (a.type !== undefined) s.type(a.type)
  if (a.format !== undefined) s.format(a.format)
  if (a.description !== undefined) s.description(a.description)
  if (a.defaultValue !== undefined) s._default(convertDefault(a.defaultValue, a.type ?? 'string'))
  if (a.example !== undefined) s.example(a.example)
  return s
}

function convertDefault(value: string, type: string | null): unknown {
  switch (type) {
    case 'integer':
      return Number.parseInt(value, 10)
    case 'number':
      return Number.parseFloat(value)
    case 'boolean':
      return value === 'true'
    default:
      return value
  }
}

/** `ModelConverters` : résolution des types en schémas, enregistrement des composants */
export class SchemaResolver {
  readonly components = new Map<string, Schema>()
  /** sous-types de @Schema(oneOf) : nom du composant -> classes parentes annotées enregistrées (noms) */
  private readonly subtypeParents = new Map<string, { name: string; cls: object; sub: object }[]>()
  private readonly subtypeInline = new Map<string, Schema>()

  resolve(type: JavaType, typeArgs: Map<string, JavaType> = new Map()): Schema {
    if (typeof type === 'string') {
      switch (type) {
        case 'String':
          return new Schema().type('string')
        case 'Boolean':
          return new Schema().type('boolean')
        case 'Int':
          return new Schema().type('integer').format('int32')
        case 'Long':
          return new Schema().type('integer').format('int64')
        case 'Float':
          return new Schema().type('number').format('float')
        case 'Double':
          return new Schema().type('number').format('double')
        case 'Number':
          return new Schema().type('number')
        case 'Any':
        default:
          return new Schema()
      }
    }
    if ('nullable' in type) return this.resolve(type.nullable, typeArgs)
    if ('typeVar' in type) {
      const t = typeArgs.get(type.typeVar)
      return t !== undefined ? this.resolve(t, typeArgs) : new Schema()
    }
    if ('list' in type) return new Schema().type('array').items(this.resolve(type.list, typeArgs))
    if ('set' in type) return new Schema().type('array').items(this.resolve(type.set, typeArgs)).uniqueItems(true)
    if ('map' in type) return new Schema().type('object').additionalProperties(this.resolve(type.map, typeArgs))
    if ('enum' in type) return new Schema().type('string')._enum(enumValues(type.enum))
    if ('scalar' in type) {
      // @JsonFormat(pattern) : `LocalDateTime(pattern)` (port/jackson-format.ts), même schéma
      switch (type.scalar.split('(')[0]) {
        case JsonTypes.LocalDateTime.scalar:
        case JsonTypes.ZonedDateTime.scalar:
        case JsonTypes.Instant.scalar:
        case 'OffsetDateTime':
          return new Schema().type('string').format('date-time')
        case JsonTypes.LocalDate.scalar:
          return new Schema().type('string').format('date')
        case JsonTypes.ByteArray.scalar:
          return new Schema().type('string').format('byte')
        case OpenApiTypes.Resource.scalar:
          return new Schema().type('string').format('binary')
        case OpenApiTypes.StreamingResponseBody.scalar:
          if (!this.components.has('StreamingResponseBody')) this.components.set('StreamingResponseBody', new Schema())
          return new Schema().$ref('StreamingResponseBody')
        default:
          return new Schema().type('string')
      }
    }
    if ('class' in type) {
      const args = (type.args ?? []).map((a) => (typeof a === 'object' && 'typeVar' in a ? (typeArgs.get(a.typeVar) ?? a) : a))
      if (type.class === MultipartFile) return new Schema().type('string').format('binary')
      return this.resolveClass(type.class, args)
    }
    return new Schema()
  }

  private resolveClass(cls: object, args: readonly JavaType[]): Schema {
    const name = componentName(cls, args)
    if (!this.components.has(name)) {
      const placeholder = new Schema()
      this.components.set(name, placeholder)
      const built = this.buildClassSchema(cls, args, name)
      built.setName(name)
      this.components.set(name, built)
    }
    return new Schema().$ref(name)
  }

  private buildClassSchema(cls: object, args: readonly JavaType[], name: string): Schema {
    const meta = openApiSchemaOf(cls)
    // @Schema(oneOf = [...]) : parent (interface scellée)
    if (meta?.oneOf !== undefined) {
      const s = new Schema()
      if (meta.discriminatorProperty !== undefined) {
        const d = new Discriminator().propertyName(meta.discriminatorProperty)
        for (const m of meta.discriminatorMapping ?? []) d.mapping(m.value, `#/components/schemas/${componentName(m.schema, [])}`)
        s.discriminator(d)
      }
      for (const sub of meta.oneOf) {
        const ref = this.resolveClass(sub, [])
        s.addOneOfItem(ref)
        const subName = componentName(sub, [])
        const parents = this.subtypeParents.get(subName) ?? []
        if (!parents.some((it) => it.name === name)) parents.push({ name, cls, sub })
        this.subtypeParents.set(subName, parents)
      }
      if (meta.discriminatorProperty !== undefined) {
        s.addProperty(meta.discriminatorProperty, new Schema().type('string'))
        s.addRequiredItem(meta.discriminatorProperty)
      }
      if (meta.description !== undefined) s.description(meta.description)
      return s
    }

    if (cls === PageImpl) return this.pageSchema(args[0] ?? 'Any')

    const s = new Schema().type('object')
    if (meta?.description !== undefined) s.description(meta.description)
    if (meta?.example !== undefined) s.example(meta.example)
    const pm = jsonPropertiesOf(cls)
    const typeArgs = new Map<string, JavaType>()
    pm?.typeParams.forEach((p, i) => {
      const a = args[i]
      if (a !== undefined) typeArgs.set(p, a)
    })
    const jm = jsonMetaOf(cls)
    const cons = constraintsOf(cls)
    const props = new Map<string, Schema>()
    const required: string[] = []
    for (const [prop, t] of Object.entries(pm?.props ?? {})) {
      if (jm.ignore?.includes(prop)) continue
      const pmeta = meta?.properties?.[prop]
      if (pmeta?.hidden) continue
      const jsonName = jm.rename?.[prop] ?? prop
      let ps = this.resolve(t, typeArgs)
      applyConstraints(ps, cons[prop])
      if (pmeta !== undefined) ps = this.applyPropertyAnnotation(ps, pmeta)
      props.set(jsonName, ps)
      const nullable = typeof t === 'object' && 'nullable' in t
      if (pmeta?.required ?? !nullable) required.push(jsonName)
    }
    for (const g of pm?.getters ?? []) {
      if (jm.ignore?.includes(g)) continue
      const pmeta = meta?.properties?.[g]
      const jsonName = jm.rename?.[g] ?? g
      let ps = new Schema().type('string')
      if (pmeta !== undefined) ps = this.applyPropertyAnnotation(ps, pmeta)
      props.set(jsonName, ps)
      if (pmeta?.required ?? true) required.push(jsonName)
    }
    const sortedProps = new Map([...props].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    if (sortedProps.size > 0) s.properties(sortedProps)
    s.required(required.sort())
    // sous-type d'une interface annotée @Schema(oneOf) : allOf [$ref parents, { propriétés }]
    if (this.isAnnotatedSubtype(cls)) {
      const root = new Schema()
      root.required(required.sort())
      const inline = new Schema().type('object')
      if (sortedProps.size > 0) inline.properties(sortedProps)
      this.subtypeInline.set(name, inline)
      return root
    }
    return s
  }

  private applyPropertyAnnotation(ps: Schema, a: SchemaAnnotation): Schema {
    if (ps.get$ref() !== null && (a.description !== undefined || a.example !== undefined)) {
      // swagger-core 3.1 : $ref avec frères
    }
    if (a.type !== undefined) ps.type(a.type)
    if (a.format !== undefined) ps.format(a.format)
    if (a.description !== undefined) ps.description(a.description)
    if (a.example !== undefined) ps.example(a.example)
    if (a.examples !== undefined) ps.examples(a.examples)
    return ps
  }

  private isAnnotatedSubtype(cls: object): boolean {
    for (const s of sealedInterfaceList()) {
      const m = openApiSchemaOf(s)
      if (m?.oneOf?.includes(cls)) return true
    }
    return false
  }

  /** `PageImpl<T>` sérialisé par Jackson (getters) : PageableObject, SortObject */
  private pageSchema(content: JavaType): Schema {
    const sortRef = () => {
      if (!this.components.has('SortObject'))
        this.components.set(
          'SortObject',
          new Schema().type('object').properties(
            new Map([
              ['empty', new Schema().type('boolean')],
              ['sorted', new Schema().type('boolean')],
              ['unsorted', new Schema().type('boolean')],
            ]),
          ),
        )
      return new Schema().$ref('SortObject')
    }
    if (!this.components.has('PageableObject'))
      this.components.set(
        'PageableObject',
        new Schema().type('object').properties(
          new Map([
            ['offset', new Schema().type('integer').format('int64')],
            ['pageNumber', new Schema().type('integer').format('int32')],
            ['pageSize', new Schema().type('integer').format('int32')],
            ['paged', new Schema().type('boolean')],
            ['sort', sortRef()],
            ['unpaged', new Schema().type('boolean')],
          ]),
        ),
      )
    return new Schema().type('object').properties(
      new Map([
        ['content', new Schema().type('array').items(this.resolve(content))],
        ['empty', new Schema().type('boolean')],
        ['first', new Schema().type('boolean')],
        ['last', new Schema().type('boolean')],
        ['number', new Schema().type('integer').format('int32')],
        ['numberOfElements', new Schema().type('integer').format('int32')],
        ['pageable', new Schema().$ref('PageableObject')],
        ['size', new Schema().type('integer').format('int32')],
        ['sort', sortRef()],
        ['totalElements', new Schema().type('integer').format('int64')],
        ['totalPages', new Schema().type('integer').format('int32')],
      ]),
    )
  }

  /** Description posée sur un schéma, ou sur le composant qu'il référence */
  describe(schema: Schema, description: string): void {
    const ref = schema.get$ref()
    const target = ref !== null ? this.components.get(ref.replace('#/components/schemas/', '')) : schema
    target?.description(description)
  }

  /** Fin de résolution : allOf des sous-types d'interfaces annotées */
  finish(): Map<string, Schema> {
    for (const [name, parents] of this.subtypeParents) {
      const s = this.components.get(name)
      if (s === undefined) continue
      const inline = this.subtypeInline.get(name)
      const supertypes = parents.length > 0 ? (openApiSchemaOf((parents[0] as { sub: object }).sub)?.supertypes ?? []) : []
      const order = (c: object) => {
        const i = supertypes.indexOf(c)
        return i < 0 ? supertypes.length : i
      }
      const allOf = [...parents].sort((a, b) => order(a.cls) - order(b.cls)).map((p) => new Schema().$ref(p.name))
      if (inline !== undefined && inline.getProperties() !== null) allOf.push(inline)
      s.allOf(allOf)
    }
    for (const [name, s] of this.components) if (s.getName() === null) s.setName(name)
    return this.components
  }
}

// ---------------------------------------------------------------------------
// Opérations (AbstractOpenApiResource.calculatePath)
// ---------------------------------------------------------------------------

type HttpMethodLower = (typeof PathItem.HttpMethods)[number]

type MappedHandler = {
  controller: ControllerSpec
  controllerName: string
  methodName: string
  handler: HandlerSpec
  paths: string[]
  methods: HttpMethodLower[]
  /** `RequestMappingInfo.toString()` (ordre de traitement de springdoc : décroissant) */
  infoString: string
}

function joinPath(a: string, b: string): string {
  if (!a) return b.startsWith('/') ? b : `/${b}`
  const left = a.startsWith('/') ? a : `/${a}`
  if (!b) return left
  return `${left.replace(/\/$/, '')}/${b.replace(/^\//, '')}`
}

function asList<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
}

function mappedHandlers(): MappedHandler[] {
  const out: MappedHandler[] = []
  for (const { type, spec } of registeredControllers()) {
    if (spec.openapi?.hidden) continue
    const classPaths = spec.requestMapping?.path?.length ? spec.requestMapping.path : ['']
    for (const [methodName, handler] of Object.entries(spec.handlers)) {
      if (handler.openapi?.operation?.hidden) continue
      const methodPaths = handler.mapping.path?.length ? handler.mapping.path : ['']
      const rawPaths: string[] = []
      for (const c of classPaths) for (const m of methodPaths) rawPaths.push(joinPath(c, m))
      // springdoc : `{*var}` et `{var:regex}` écrits `{var}` dans le document
      const paths = rawPaths.map((it) => it.replace(/\{\*?([^}:]+)(?::[^}]*)?\}/g, '{$1}'))
      const methods = asList(handler.mapping.method ?? spec.requestMapping?.method).map((m) => m.toLowerCase() as HttpMethodLower)
      const produces = handler.mapping.produces?.length ? handler.mapping.produces : (spec.requestMapping?.produces ?? [])
      const consumes = handler.mapping.consumes?.length ? handler.mapping.consumes : (spec.requestMapping?.consumes ?? [])
      let info = `{${methods.length === 1 ? methods[0]?.toUpperCase() : `[${methods.map((m) => m.toUpperCase()).join(', ')}]`} [${rawPaths.join(' || ')}]`
      if (consumes.length) info += `, consumes [${consumes.join(' || ')}]`
      if (produces.length) info += `, produces [${produces.join(' || ')}]`
      info += '}'
      out.push({ controller: spec, controllerName: (type as { name: string }).name, methodName, handler, paths, methods, infoString: info })
    }
  }
  // byReversedRequestMappingInfos
  return out.sort((a, b) => (b.infoString < a.infoString ? -1 : b.infoString > a.infoString ? 1 : 0))
}

/** `springdoc.paths-to-match` (AntPathMatcher) */
function matchesPaths(path: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    if (p.endsWith('/**')) {
      const base = p.slice(0, -3)
      return path === base || path.startsWith(`${base}/`)
    }
    return path === p
  })
}

/** `MethodAttributes.fillMethods` : produces / consumes de la méthode fusionnés avec ceux de la classe */
function mergeMediaTypes(classTypes: string[] | undefined, methodTypes: string[] | undefined, def: string): string[] {
  const c = classTypes ?? []
  const m = methodTypes ?? []
  if (m.length > 0) return [...new Set([...c, ...m])]
  if (c.length > 0) return c
  return [def]
}

function kebabCase(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export type SpringdocProperties = {
  pathsToMatch: string[]
}

/** Génération du document (OpenApiWebMvcResource) */
export class OpenApiGenerator {
  constructor(
    private readonly openApiBean: OpenAPI,
    private readonly operationCustomizers: OperationCustomizer[],
    private readonly openApiCustomizers: OpenApiCustomizer[],
    private readonly properties: SpringdocProperties = { pathsToMatch: ['/api/**'] },
  ) {}

  generate(serverUrl: string | null): OpenAPI {
    const openApi = this.openApiBean.copy()
    const resolver = new SchemaResolver()
    const existingIds = new Set<string>()
    const uniqueId = (id: string): string => {
      let candidate = id
      let counter = 0
      while (existingIds.has(candidate)) candidate = `${id}_${++counter}`
      existingIds.add(candidate)
      return candidate
    }

    // chemins déclarés dans le bean : copies des opérations, identifiants dédoublonnés
    const paths = new Map<string, PathItem>()
    for (const [p, item] of openApi.getPaths() ?? new Map<string, PathItem>()) {
      for (const [m, op] of item.readOperationsMap()) {
        const copy = op.copy()
        const id = copy.getOperationId()
        if (id !== null) copy.setOperationId(uniqueId(id))
        item.operation(m, copy)
      }
      paths.set(p, item)
    }

    const genericResponses = this.genericResponses(resolver)
    const usedTags: string[] = []

    for (const mh of mappedHandlers()) {
      for (const path of mh.paths) {
        if (!matchesPaths(path, this.properties.pathsToMatch)) continue
        for (const method of mh.methods) {
          let operation = this.buildOperation(mh, method, resolver, genericResponses, usedTags)
          operation.setOperationId(uniqueId(operation.getOperationId() ?? mh.methodName))
          const hm = new HandlerMethod(mh.controller, mh.handler, mh.methodName)
          for (const c of this.operationCustomizers) operation = c.customize(operation, hm)
          const item = paths.get(path) ?? new PathItem()
          item.operation(method, operation)
          paths.set(path, item)
        }
      }
    }

    for (const [p, item] of [...paths].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) openApi.path(p, item)
    // tags de classe absents de la liste globale
    const tags = openApi.getTags() ?? []
    for (const t of usedTags) if (!tags.some((it) => it.getName() === t)) tags.push(new Tag().name(t))
    if (tags.length > 0) openApi.tags(tags)

    const components = openApi.getComponents()
    const schemas = resolver.finish()
    if (components !== null) for (const [n, s] of [...schemas].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) components.addSchemas(n, s)

    for (const c of this.openApiCustomizers) c.customise(openApi)

    if ((openApi.getServers() ?? []).length === 0 && serverUrl !== null) openApi.servers([new Server().url(serverUrl).description('Generated server url')])
    return openApi
  }

  /** Réponses des @ExceptionHandler des @ControllerAdvice (GenericResponseService) */
  private genericResponses(resolver: SchemaResolver): { exceptions: AnyClass[]; code: string; response: ApiResponse }[] {
    const out: { exceptions: AnyClass[]; code: string; response: ApiResponse }[] = []
    for (const advice of registeredAdvices()) {
      for (const eh of Object.values(advice.handlers)) {
        if (eh.responseStatus === undefined) continue
        const response = new ApiResponse().description(eh.responseStatus.reasonPhrase)
        if (eh.returns !== undefined) response.content(new Content().addMediaType('*/*', new MediaType().schema(resolver.resolve(eh.returns))))
        out.push({ exceptions: eh.exceptions as AnyClass[], code: String(eh.responseStatus.value), response })
      }
    }
    return out
  }

  private buildOperation(
    mh: MappedHandler,
    method: HttpMethodLower,
    resolver: SchemaResolver,
    genericResponses: { exceptions: AnyClass[]; code: string; response: ApiResponse }[],
    usedTags: string[],
  ): Operation {
    const { controller, handler } = mh
    const oa = handler.openapi ?? {}
    const operation = new Operation()

    // tags : @Operation(tags), puis @Tag de classe ; à défaut, nom du contrôleur en kebab-case
    const tags: string[] = []
    for (const t of [...(oa.operation?.tags ?? []), ...(controller.openapi?.tags ?? [])]) if (!tags.includes(t)) tags.push(t)
    for (const t of controller.openapi?.tags ?? []) if (!usedTags.includes(t)) usedTags.push(t)
    if (tags.length === 0) tags.push(kebabCase(mh.controllerName))
    operation.tags(tags)
    if (oa.operation?.summary !== undefined) operation.summary(oa.operation.summary)
    if (oa.operation?.description !== undefined) operation.description(oa.operation.description)
    operation.operationId(oa.operation?.operationId ?? mh.methodName)
    if (oa.deprecated || oa.operation?.deprecated) operation.deprecated(true)
    if (oa.securityRequirements || controller.openapi?.securityRequirements) operation.security([])

    const produces = mergeMediaTypes(controller.requestMapping?.produces, handler.mapping.produces, '*/*')
    const consumes = mergeMediaTypes(controller.requestMapping?.consumes, handler.mapping.consumes, 'application/json')

    // paramètres
    const parameters: Parameter[] = []
    let requestBody: RequestBody | null = null
    const multipart = new Map<string, { schema: Schema; required: boolean }>()
    for (const arg of handler.args ?? []) {
      if (arg.openapi?.hidden) continue
      switch (arg.kind) {
        case 'pathVariable':
        case 'requestParam':
        case 'requestHeader':
        case 'cookieValue': {
          const argType = 'type' in arg ? arg.type : 'String'
          if (arg.kind === 'requestParam' && isMultipart(argType)) {
            multipart.set(arg.name, { schema: new Schema().type('string').format('binary'), required: this.isRequired(arg) })
            break
          }
          const p = new Parameter()
            .in(arg.kind === 'pathVariable' ? 'path' : arg.kind === 'requestParam' ? 'query' : arg.kind === 'requestHeader' ? 'header' : 'cookie')
            .name(arg.name)
          if (arg.openapi?.description !== undefined) p.description(arg.openapi.description)
          p.required(arg.kind === 'pathVariable' ? true : this.isRequired(arg))
          const schema = resolver.resolve(argType)
          applyConstraints(schema, arg.constraints)
          if ((arg.kind === 'requestParam' || arg.kind === 'requestHeader') && arg.defaultValue !== null)
            schema._default(convertDefault(arg.defaultValue, schema.getType()))
          p.schema(schema)
          parameters.push(p)
          break
        }
        case 'requestPart':
          multipart.set(arg.name, { schema: new Schema().type('string').format('binary'), required: arg.required })
          break
        case 'requestBody': {
          const content = new Content()
          const schema = resolver.resolve(arg.type)
          for (const c of consumes) content.addMediaType(c, new MediaType().schema(schema))
          requestBody = new RequestBody().content(content)
          if (oa.requestBody?.description !== undefined) requestBody.description(oa.requestBody.description)
          // @Parameter(description) sur un @RequestBody : description du schéma (du composant référencé)
          if (arg.openapi?.description !== undefined) resolver.describe(schema, arg.openapi.description)
          const required = oa.requestBody?.required ?? (arg.required && !arg.nullable)
          if (required) requestBody.required(true)
          break
        }
        default:
          break
      }
    }
    // @Parameter(s) de méthode et annotations méta : remplacent un paramètre de même nom
    for (const pa of oa.parameters ?? []) {
      if (pa.hidden) continue
      const p = this.annotationParameter(pa, resolver)
      const idx = parameters.findIndex((it) => it.getName() === pa.name && (pa.in === undefined || it.getIn() === pa.in))
      if (idx >= 0) parameters[idx] = p
      else parameters.push(p)
    }
    operation.parameters(parameters)
    if (multipart.size > 0) {
      const schema = new Schema().type('object')
      for (const [n, { schema: ps, required }] of multipart) {
        schema.addProperty(n, ps)
        if (required) schema.addRequiredItem(n)
      }
      requestBody = new RequestBody().content(new Content().addMediaType('multipart/form-data', new MediaType().schema(schema)))
    }
    if (requestBody !== null) operation.requestBody(requestBody)

    // réponses
    const responses = new ApiResponses()
    if (oa.responses !== undefined && oa.responses.length > 0) {
      for (const r of oa.responses) this.annotationResponse(r, produces, resolver, responses)
    } else {
      const status = handler.responseStatus ?? HttpStatus.OK
      const response = new ApiResponse().description(status.reasonPhrase)
      if (handler.returns !== undefined) {
        const schema = resolver.resolve(handler.returns)
        const content = new Content()
        for (const p of produces) content.addMediaType(p, new MediaType().schema(schema))
        response.content(content)
      }
      responses.addApiResponse(String(status.value), response)
    }
    // @ExceptionHandler de l'advice : exceptions non contrôlées, ou déclarées par @Throws
    const ownCodes = new Set(responses.keys())
    for (const g of genericResponses) {
      const applies = g.exceptions.some((e) => isRuntime(e) || (oa.throws ?? []).some((t) => t === e || t.prototype instanceof (e as never)))
      // GenericResponseService : réponses indexées par code, la dernière déclarée l'emporte
      if (applies && !ownCodes.has(g.code)) responses.addApiResponse(g.code, g.response)
    }
    operation.responses(new ApiResponses([...responses].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))))
    return operation
  }

  private isRequired(arg: ArgSpec): boolean {
    const required = 'required' in arg ? (arg.required as boolean) : true
    return required && !arg.nullable && !arg.hasDefault
  }

  private annotationParameter(pa: ParameterAnnotation, resolver: SchemaResolver): Parameter {
    const p = new Parameter()
    if (pa.description !== undefined) p.description(pa.description)
    if (pa.in !== undefined) p.in(pa.in)
    if (pa.name !== undefined) p.name(pa.name)
    if (pa.required !== undefined) p.required(pa.required)
    if (pa.deprecated) p.deprecated(true)
    if (pa.example !== undefined) p.example(pa.example)
    if (pa.array !== undefined) p.schema(new Schema().type('array').items(annotationSchema(pa.array.schema, resolver)))
    else if (pa.schema !== undefined) p.schema(annotationSchema(pa.schema, resolver))
    return p
  }

  private annotationResponse(r: ApiResponseAnnotation, produces: string[], resolver: SchemaResolver, responses: ApiResponses): void {
    const code = r.responseCode ?? 'default'
    const response = new ApiResponse().description(r.description ?? (code === 'default' ? 'default response' : (HttpStatus.valueOfCode(Number(code))?.reasonPhrase ?? '')))
    const content = new Content()
    for (const c of r.content ?? []) {
      const schema = this.contentSchema(c, resolver)
      for (const mt of c.mediaType !== undefined ? [c.mediaType] : produces) content.addMediaType(mt, new MediaType().schema(schema))
    }
    response.content(content)
    responses.addApiResponse(code, response)
  }

  private contentSchema(c: ContentAnnotation, resolver: SchemaResolver): Schema {
    if (c.array !== undefined) return new Schema().type('array').items(annotationSchema(c.array.schema, resolver))
    return annotationSchema(c.schema ?? {}, resolver)
  }
}

function isMultipart(t: JavaType): boolean {
  const u = typeof t === 'object' && 'nullable' in t ? t.nullable : t
  return typeof u === 'object' && 'class' in u && u.class === MultipartFile
}

/** Document sérialisé en JSON (compact, comme springdoc) */
export function writeJson(openApi: OpenAPI): string {
  return JSON.stringify(toJsonValue(openApi))
}

/** Document sérialisé en YAML (`/v3/api-docs.yaml`) */
export function writeYaml(openApi: OpenAPI): string {
  // PORT: YAMLFactory de Jackson -> paquet `yaml` (mêmes données ; mise en forme des chaînes longues différente)
  return yamlStringify(toJsonValue(openApi), { lineWidth: 0 })
}

// ---------------------------------------------------------------------------
// Points d'accès (OpenApiWebMvcResource, SwaggerConfigResource, SwaggerWelcomeWebMvc, SwaggerWebMvcConfigurer)
// ---------------------------------------------------------------------------

const API_DOCS_URL = '/v3/api-docs'
const SWAGGER_UI_PATH = '/swagger-ui'

function currentServerUrl(): string | null {
  try {
    return ServletUriComponentsBuilder.fromCurrentContextPath().toUriString()
  } catch {
    return null
  }
}

function currentContextPath(): string {
  try {
    return ServletUriComponentsBuilder.fromCurrentContextPath().build().path
  } catch {
    return ''
  }
}

/** Répertoire du paquet swagger-ui-dist */
export function swaggerUiDistDir(): string {
  return dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'))
}

/** Contrôleurs de springdoc */
export class OpenApiWebMvcResource {
  private cached: OpenAPI | null = null

  constructor(private readonly context: ApplicationContext) {}

  private openApi(): OpenAPI {
    if (this.cached === null) {
      const bean = this.context.getBeansOfType(OpenAPI)[0] ?? new OpenAPI()
      const cacheDisabled = String(this.context.environment.getProperty('springdoc.cache.disabled') ?? 'false') === 'true'
      const pathsToMatch = String(this.context.environment.getProperty('springdoc.paths-to-match') ?? '/api/**')
        .split(',')
        .map((s) => s.trim())
      const generated = new OpenApiGenerator(bean, this.context.getBeansOfType(OperationCustomizer), this.context.getBeansOfType(OpenApiCustomizer), {
        pathsToMatch,
      }).generate(null)
      if (cacheDisabled) return generated
      this.cached = generated
    }
    return this.cached
  }

  private withServer(): OpenAPI {
    const openApi = this.openApi().copy()
    const url = currentServerUrl()
    if ((openApi.getServers() ?? []).length === 0 && url !== null) openApi.servers([new Server().url(url).description('Generated server url')])
    return openApi
  }

  openapiJson(): ResponseEntity<Uint8Array> {
    return ResponseEntity.ok().contentType('application/json').body(new Uint8Array(Buffer.from(writeJson(this.withServer()), 'utf8')))
  }

  openapiYaml(): ResponseEntity<Uint8Array> {
    return ResponseEntity.ok().contentType('application/vnd.oai.openapi').body(new Uint8Array(Buffer.from(writeYaml(this.withServer()), 'utf8')))
  }

  /** `SwaggerConfigResource.openapiJson` : configuration de Swagger UI */
  swaggerConfig(): ResponseEntity<Uint8Array> {
    const contextPath = currentContextPath()
    const config = {
      configUrl: `${contextPath}${API_DOCS_URL}/swagger-config`,
      oauth2RedirectUrl: `${currentServerUrl() ?? ''}${SWAGGER_UI_PATH}/oauth2-redirect.html`,
      url: `${contextPath}${API_DOCS_URL}`,
      validatorUrl: '',
    }
    return ResponseEntity.ok().contentType('application/json').body(new Uint8Array(Buffer.from(JSON.stringify(config), 'utf8')))
  }

  /** `SwaggerWelcomeWebMvc.redirectToUi` */
  redirectToUi(): ResponseEntity<void> {
    return ResponseEntity.status(HttpStatus.FOUND).location(`${currentContextPath()}${SWAGGER_UI_PATH}/index.html`).build()
  }

  /** `SwaggerIndexPageTransformer` : swagger-initializer.js avec la configuration de springdoc */
  swaggerInitializer(): ResponseEntity<Uint8Array> {
    const contextPath = currentContextPath()
    let js = readFileSync(`${swaggerUiDistDir()}/swagger-initializer.js`, 'utf8')
    js = js.replace('url: "https://petstore.swagger.io/v2/swagger.json"', 'url: ""')
    js = js.replace(
      'layout: "StandaloneLayout"',
      `layout: "StandaloneLayout" ,\n\n  "configUrl" : "${contextPath}${API_DOCS_URL}/swagger-config",\n  "validatorUrl" : ""\n`,
    )
    return ResponseEntity.ok().contentType('text/javascript').cacheControl('no-store').body(new Uint8Array(Buffer.from(js, 'utf8')))
  }
}

restController(OpenApiWebMvcResource, {
  inject: [ApplicationContextToken],
  javaName: 'org.springdoc.webmvc.api.OpenApiWebMvcResource',
  openapi: { hidden: true },
  handlers: {
    openapiJson: { mapping: { method: 'GET', path: [API_DOCS_URL], produces: ['application/json'] } },
    openapiYaml: { mapping: { method: 'GET', path: [`${API_DOCS_URL}.yaml`], produces: ['application/vnd.oai.openapi'] } },
    swaggerConfig: { mapping: { method: 'GET', path: [`${API_DOCS_URL}/swagger-config`], produces: ['application/json'] } },
    redirectToUi: { mapping: { method: 'GET', path: ['/swagger-ui.html'] } },
    swaggerInitializer: { mapping: { method: 'GET', path: [`${SWAGGER_UI_PATH}/swagger-initializer.js`] } },
  },
})

/** `SwaggerWebMvcConfigurer` : ressources de Swagger UI */
export class SwaggerWebMvcConfigurer extends WebMvcConfigurer {
  override addResourceHandlers(registry: ResourceHandlerRegistry): void {
    // PORT: `/swagger-ui*/**` -> classpath:/META-INF/resources/webjars/ + résolveur de version des webjars
    // (swagger-ui/index.html -> swagger-ui/5.21.0/index.html) : ici `/swagger-ui/**` -> répertoire de swagger-ui-dist
    registry.addResourceHandler(`${SWAGGER_UI_PATH}/**`).addResourceLocations(`file:${swaggerUiDistDir()}/`)
  }
}

configuration(SwaggerWebMvcConfigurer)
