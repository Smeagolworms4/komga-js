// Support de portage : modèle OpenAPI de swagger-core (io.swagger.v3.oas.models, 2.2) utilisé par Komga
// (OpenApiConfiguration) et par la génération du document (port/springdoc.ts) : mêmes classes et mêmes méthodes
// fluides (`info.title("x")`). Les propriétés Kotlin (`operation.description`, `schema.allOf`) s'écrivent
// `getX()` / `setX(v)`. La sérialisation (`toJsonValue`) reproduit l'ObjectMapper de springdoc (Json31, NON_NULL,
// `springdoc.writer-with-order-by-keys` : clés triées, sauf l'ordre fixe de l'objet racine et `type` en tête des schémas).
// Ce fichier n'a pas de jumeau Kotlin.

/** Base : champs JSON stockés dans l'ordre d'affectation, `null` = absent */
abstract class OasModel {
  /** @internal */
  readonly fields = new Map<string, unknown>()

  protected setField(name: string, value: unknown): this {
    if (value === null || value === undefined) this.fields.delete(name)
    else this.fields.set(name, value)
    return this
  }

  protected getField<T>(name: string): T | null {
    return (this.fields.get(name) as T | undefined) ?? null
  }

  /** `extensions` (`x-...`) */
  extensions(extensions: Record<string, unknown>): this {
    for (const [k, v] of Object.entries(extensions)) this.fields.set(k, v)
    return this
  }

  addExtension(name: string, value: unknown): this {
    this.fields.set(name, value)
    return this
  }
}

/** Valeur JSON brute (exemples, valeurs par défaut) : sérialisée telle quelle, sans tri des clés */
export class RawJson {
  constructor(readonly value: unknown) {}
}

export class ExternalDocumentation extends OasModel {
  description(v: string): this {
    return this.setField('description', v)
  }
  url(v: string): this {
    return this.setField('url', v)
  }
}

export class License extends OasModel {
  name(v: string): this {
    return this.setField('name', v)
  }
  url(v: string): this {
    return this.setField('url', v)
  }
}

export class Info extends OasModel {
  title(v: string): this {
    return this.setField('title', v)
  }
  version(v: string): this {
    return this.setField('version', v)
  }
  description(v: string): this {
    return this.setField('description', v)
  }
  license(v: License): this {
    return this.setField('license', v)
  }
}

export class ServerVariable extends OasModel {
  addEnumItem(v: string): this {
    const l = this.getField<string[]>('enum') ?? []
    l.push(v)
    return this.setField('enum', l)
  }
  _default(v: string): this {
    return this.setField('default', v)
  }
}

export class ServerVariables extends Map<string, ServerVariable> {
  addServerVariable(name: string, v: ServerVariable): this {
    this.set(name, v)
    return this
  }
}

export class Server extends OasModel {
  url(v: string): this {
    return this.setField('url', v)
  }
  description(v: string): this {
    return this.setField('description', v)
  }
  variables(v: ServerVariables): this {
    return this.setField('variables', v)
  }
  getUrl(): string | null {
    return this.getField('url')
  }
}

export class SecurityRequirement extends Map<string, string[]> {
  addList(name: string, scopes: string[] = []): this {
    this.set(name, scopes)
    return this
  }
}

export class SecurityScheme extends OasModel {
  type(v: SecurityScheme.Type): this {
    return this.setField('type', v.value)
  }
  scheme(v: string): this {
    return this.setField('scheme', v)
  }
  in(v: SecurityScheme.In): this {
    return this.setField('in', v.value)
  }
  name(v: string): this {
    return this.setField('name', v)
  }
}

export namespace SecurityScheme {
  export class Type {
    static readonly APIKEY = new Type('apiKey')
    static readonly HTTP = new Type('http')
    static readonly OAUTH2 = new Type('oauth2')
    static readonly OPENIDCONNECT = new Type('openIdConnect')
    private constructor(readonly value: string) {}
  }
  export class In {
    static readonly COOKIE = new In('cookie')
    static readonly HEADER = new In('header')
    static readonly QUERY = new In('query')
    private constructor(readonly value: string) {}
  }
}

export class Tag extends OasModel {
  name(v: string): this {
    return this.setField('name', v)
  }
  description(v: string): this {
    return this.setField('description', v)
  }
  getName(): string | null {
    return this.getField('name')
  }
}

export class Discriminator extends OasModel {
  propertyName(v: string): this {
    return this.setField('propertyName', v)
  }
  mapping(name: string, value: string): this {
    const m = this.getField<Map<string, string>>('mapping') ?? new Map<string, string>()
    m.set(name, value)
    return this.setField('mapping', m)
  }
}

/** `io.swagger.v3.oas.models.media.Schema` : `type` sérialisé en tête */
export class Schema extends OasModel {
  /** `name` : nom du composant, non sérialisé (@JsonIgnore) */
  private schemaName: string | null = null

  getName(): string | null {
    return this.schemaName
  }
  setName(v: string | null): void {
    this.schemaName = v
  }
  name(v: string): this {
    this.schemaName = v
    return this
  }

  type(v: string | null): this {
    return this.setField('type', v)
  }
  getType(): string | null {
    return this.getField('type')
  }
  format(v: string | null): this {
    return this.setField('format', v)
  }
  getFormat(): string | null {
    return this.getField('format')
  }
  $ref(v: string | null): this {
    return this.setField('$ref', v === null || v.startsWith('#') ? v : `#/components/schemas/${v}`)
  }
  get$ref(): string | null {
    return this.getField('$ref')
  }
  description(v: string | null): this {
    return this.setField('description', v)
  }
  getDescription(): string | null {
    return this.getField('description')
  }
  title(v: string | null): this {
    return this.setField('title', v)
  }
  example(v: unknown): this {
    return this.setField('example', v === null || v === undefined ? null : new RawJson(v))
  }
  examples(v: unknown[] | null): this {
    return this.setField('examples', v === null ? null : new RawJson(v))
  }
  _default(v: unknown): this {
    return this.setField('default', v === null || v === undefined ? null : new RawJson(v))
  }
  deprecated(v: boolean | null): this {
    return this.setField('deprecated', v)
  }
  items(v: Schema | null): this {
    return this.setField('items', v)
  }
  getItems(): Schema | null {
    return this.getField('items')
  }
  uniqueItems(v: boolean | null): this {
    return this.setField('uniqueItems', v)
  }
  minLength(v: number | null): this {
    return this.setField('minLength', v)
  }
  maxLength(v: number | null): this {
    return this.setField('maxLength', v)
  }
  minItems(v: number | null): this {
    return this.setField('minItems', v)
  }
  maxItems(v: number | null): this {
    return this.setField('maxItems', v)
  }
  minimum(v: number | null): this {
    return this.setField('minimum', v)
  }
  maximum(v: number | null): this {
    return this.setField('maximum', v)
  }
  pattern(v: string | null): this {
    return this.setField('pattern', v)
  }
  _enum(v: string[] | null): this {
    return this.setField('enum', v)
  }
  addEnumItemObject(v: string): this {
    const l = this.getField<string[]>('enum') ?? []
    l.push(v)
    return this.setField('enum', l)
  }
  additionalProperties(v: Schema | boolean | null): this {
    return this.setField('additionalProperties', v)
  }
  discriminator(v: Discriminator | null): this {
    return this.setField('discriminator', v)
  }
  /** `properties` (Map ordonnée) */
  getProperties(): Map<string, Schema> | null {
    return this.getField('properties')
  }
  setProperties(v: Map<string, Schema> | null): void {
    this.setField('properties', v)
  }
  properties(v: Map<string, Schema> | null): this {
    return this.setField('properties', v)
  }
  addProperty(name: string, v: Schema): this {
    const m = this.getField<Map<string, Schema>>('properties') ?? new Map<string, Schema>()
    m.set(name, v)
    return this.setField('properties', m)
  }
  getRequired(): string[] | null {
    return this.getField('required')
  }
  required(v: string[] | null): this {
    return this.setField('required', v !== null && v.length > 0 ? v : null)
  }
  addRequiredItem(v: string): this {
    const l = this.getField<string[]>('required') ?? []
    if (!l.includes(v)) l.push(v)
    return this.setField('required', l)
  }
  getAllOf(): Schema[] | null {
    return this.getField('allOf')
  }
  setAllOf(v: Schema[] | null): void {
    this.setField('allOf', v)
  }
  allOf(v: Schema[] | null): this {
    return this.setField('allOf', v)
  }
  addAllOfItem(v: Schema): this {
    return this.setField('allOf', [...(this.getField<Schema[]>('allOf') ?? []), v])
  }
  oneOf(v: Schema[] | null): this {
    return this.setField('oneOf', v)
  }
  addOneOfItem(v: Schema): this {
    return this.setField('oneOf', [...(this.getField<Schema[]>('oneOf') ?? []), v])
  }
  anyOf(v: Schema[] | null): this {
    return this.setField('anyOf', v)
  }
}

export class Example extends OasModel {
  value(v: unknown): this {
    return this.setField('value', new RawJson(v))
  }
}

export class MediaType extends OasModel {
  example(v: unknown): this {
    return this.setField('example', v === null || v === undefined ? null : new RawJson(v))
  }
  schema(v: Schema): this {
    return this.setField('schema', v)
  }
  getSchema(): Schema | null {
    return this.getField('schema')
  }
  addExamples(name: string, v: Example): this {
    const m = this.getField<Map<string, Example>>('examples') ?? new Map<string, Example>()
    m.set(name, v)
    return this.setField('examples', m)
  }
}

export class Content extends Map<string, MediaType> {
  addMediaType(name: string, v: MediaType): this {
    this.set(name, v)
    return this
  }
}

export class ApiResponse extends OasModel {
  description(v: string): this {
    return this.setField('description', v)
  }
  content(v: Content | null): this {
    return this.setField('content', v !== null && v.size > 0 ? v : null)
  }
  getContent(): Content | null {
    return this.getField('content')
  }
}

export class ApiResponses extends Map<string, ApiResponse> {
  addApiResponse(name: string, v: ApiResponse): this {
    this.set(name, v)
    return this
  }
}

export class Parameter extends OasModel {
  name(v: string): this {
    return this.setField('name', v)
  }
  getName(): string | null {
    return this.getField('name')
  }
  in(v: string): this {
    return this.setField('in', v)
  }
  getIn(): string | null {
    return this.getField('in')
  }
  description(v: string | null): this {
    return this.setField('description', v)
  }
  required(v: boolean | null): this {
    return this.setField('required', v)
  }
  deprecated(v: boolean | null): this {
    return this.setField('deprecated', v)
  }
  schema(v: Schema | null): this {
    return this.setField('schema', v)
  }
  example(v: unknown): this {
    return this.setField('example', v === null || v === undefined ? null : new RawJson(v))
  }
}

export class RequestBody extends OasModel {
  description(v: string | null): this {
    return this.setField('description', v)
  }
  content(v: Content): this {
    return this.setField('content', v)
  }
  getContent(): Content | null {
    return this.getField('content')
  }
  required(v: boolean | null): this {
    return this.setField('required', v)
  }
}

export class Operation extends OasModel {
  tags(v: string[] | null): this {
    return this.setField('tags', v)
  }
  getTags(): string[] | null {
    return this.getField('tags')
  }
  addTagsItem(v: string): this {
    return this.setField('tags', [...(this.getField<string[]>('tags') ?? []), v])
  }
  summary(v: string | null): this {
    return this.setField('summary', v)
  }
  description(v: string | null): this {
    return this.setField('description', v)
  }
  getDescription(): string | null {
    return this.getField('description')
  }
  setDescription(v: string | null): void {
    this.setField('description', v)
  }
  operationId(v: string | null): this {
    return this.setField('operationId', v)
  }
  getOperationId(): string | null {
    return this.getField('operationId')
  }
  setOperationId(v: string | null): void {
    this.setField('operationId', v)
  }
  parameters(v: Parameter[] | null): this {
    return this.setField('parameters', v !== null && v.length > 0 ? v : null)
  }
  getParameters(): Parameter[] | null {
    return this.getField('parameters')
  }
  requestBody(v: RequestBody | null): this {
    return this.setField('requestBody', v)
  }
  responses(v: ApiResponses): this {
    return this.setField('responses', v)
  }
  getResponses(): ApiResponses | null {
    return this.getField('responses')
  }
  deprecated(v: boolean | null): this {
    return this.setField('deprecated', v)
  }
  security(v: SecurityRequirement[] | null): this {
    return this.setField('security', v)
  }

  /** Copie profonde (springdoc travaille sur des copies des opérations déclarées dans le bean OpenAPI) */
  copy(): Operation {
    return deepCopy(this) as Operation
  }
}

export class PathItem extends OasModel {
  static readonly HttpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

  summary(v: string): this {
    return this.setField('summary', v)
  }
  description(v: string): this {
    return this.setField('description', v)
  }
  get(v: Operation): this {
    return this.setField('get', v)
  }
  put(v: Operation): this {
    return this.setField('put', v)
  }
  post(v: Operation): this {
    return this.setField('post', v)
  }
  delete(v: Operation): this {
    return this.setField('delete', v)
  }
  options(v: Operation): this {
    return this.setField('options', v)
  }
  head(v: Operation): this {
    return this.setField('head', v)
  }
  patch(v: Operation): this {
    return this.setField('patch', v)
  }
  trace(v: Operation): this {
    return this.setField('trace', v)
  }
  operation(method: (typeof PathItem.HttpMethods)[number], v: Operation): this {
    return this.setField(method, v)
  }
  /** `readOperationsMap()` : opérations dans l'ordre get, put, post, delete, options, head, patch, trace */
  readOperationsMap(): Map<(typeof PathItem.HttpMethods)[number], Operation> {
    const m = new Map<(typeof PathItem.HttpMethods)[number], Operation>()
    for (const k of PathItem.HttpMethods) {
      const o = this.fields.get(k)
      if (o instanceof Operation) m.set(k, o)
    }
    return m
  }
}

export class Components extends OasModel {
  addSecuritySchemes(name: string, v: SecurityScheme): this {
    const m = this.getField<Map<string, SecurityScheme>>('securitySchemes') ?? new Map<string, SecurityScheme>()
    m.set(name, v)
    return this.setField('securitySchemes', m)
  }
  addSchemas(name: string, v: Schema): this {
    const m = this.getField<Map<string, Schema>>('schemas') ?? new Map<string, Schema>()
    m.set(name, v)
    return this.setField('schemas', m)
  }
  getSchemas(): Map<string, Schema> | null {
    return this.getField('schemas')
  }
}

/** Ordre fixe des propriétés de l'objet racine (@JsonPropertyOrder d'OpenAPI 3.1) */
const OPENAPI_ORDER = ['openapi', 'info', 'externalDocs', 'servers', 'security', 'tags', 'paths', 'components', 'webhooks']

export class OpenAPI extends OasModel {
  constructor() {
    super()
    this.setField('openapi', '3.1.0')
  }
  info(v: Info): this {
    return this.setField('info', v)
  }
  externalDocs(v: ExternalDocumentation): this {
    return this.setField('externalDocs', v)
  }
  components(v: Components): this {
    return this.setField('components', v)
  }
  getComponents(): Components | null {
    return this.getField('components')
  }
  security(v: SecurityRequirement[]): this {
    return this.setField('security', v)
  }
  tags(v: Tag[]): this {
    return this.setField('tags', v)
  }
  getTags(): Tag[] | null {
    return this.getField('tags')
  }
  servers(v: Server[] | null): this {
    return this.setField('servers', v)
  }
  getServers(): Server[] | null {
    return this.getField('servers')
  }
  path(name: string, v: PathItem): this {
    const m = this.getField<Map<string, PathItem>>('paths') ?? new Map<string, PathItem>()
    m.set(name, v)
    return this.setField('paths', m)
  }
  getPaths(): Map<string, PathItem> | null {
    return this.getField('paths')
  }

  /** Copie profonde (le bean n'est pas modifié par la génération) */
  copy(): OpenAPI {
    return deepCopy(this) as OpenAPI
  }
}

// ---------------------------------------------------------------------------
// Copie et sérialisation
// ---------------------------------------------------------------------------

function deepCopy(v: unknown, seen = new Map<unknown, unknown>()): unknown {
  if (v === null || typeof v !== 'object') return v
  if (seen.has(v)) return seen.get(v)
  if (v instanceof RawJson) return v
  if (v instanceof OasModel) {
    const c = Object.create(Object.getPrototypeOf(v) as object) as OasModel
    Object.assign(c, v)
    ;(c as { fields: Map<string, unknown> }).fields = new Map()
    seen.set(v, c)
    for (const [k, x] of v.fields) c.fields.set(k, deepCopy(x, seen))
    return c
  }
  if (v instanceof Map) {
    const c = new (v.constructor as MapConstructor)()
    seen.set(v, c)
    for (const [k, x] of v) c.set(k, deepCopy(x, seen))
    return c
  }
  if (Array.isArray(v)) return v.map((x) => deepCopy(x, seen))
  const c: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v)) c[k] = deepCopy(x, seen)
  return c
}

function sortedKeys(keys: string[]): string[] {
  // ORDER_MAP_ENTRIES_BY_KEYS / SORT_PROPERTIES_ALPHABETICALLY : ordre de String.compareTo
  return [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Valeur JSON (objets JS ordonnés) équivalente à la sérialisation de springdoc */
export function toJsonValue(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof RawJson) return v.value
  if (v instanceof OasModel) {
    let keys: string[]
    const all = [...v.fields.keys()]
    if (v instanceof OpenAPI) {
      const ext = sortedKeys(all.filter((k) => !OPENAPI_ORDER.includes(k)))
      keys = [...OPENAPI_ORDER.filter((k) => v.fields.has(k)), ...ext]
    } else if (v instanceof Schema) {
      // `type` puis `format` en tête, le reste trié
      const head = ['type', 'format'].filter((k) => v.fields.has(k))
      keys = [...head, ...sortedKeys(all.filter((k) => !head.includes(k)))]
    } else if (v instanceof Server || v instanceof ServerVariable) {
      // Server / ServerVariable : ordre de déclaration des champs (non triés par springdoc)
      const order = v instanceof Server ? ['url', 'description', 'variables'] : ['enum', 'default', 'description']
      keys = [...order.filter((k) => v.fields.has(k)), ...sortedKeys(all.filter((k) => !order.includes(k)))]
    } else keys = sortedKeys(all)
    const o: Record<string, unknown> = {}
    for (const k of keys) o[k] = toJsonValue(v.fields.get(k))
    return o
  }
  if (v instanceof Map) {
    const o: Record<string, unknown> = {}
    for (const k of sortedKeys([...v.keys()].map(String))) o[k] = toJsonValue(v.get(k))
    return o
  }
  if (Array.isArray(v)) return v.map((x) => toJsonValue(x))
  if (typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of sortedKeys(Object.keys(v))) o[k] = toJsonValue((v as Record<string, unknown>)[k])
    return o
  }
  return v
}
