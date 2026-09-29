// Support de portage : serveur web embarqué de Spring Boot 3.5 (Tomcat 10.1) sur node:http :
// - fabrique ConfigurableServletWebServerFactory (server.port, server.servlet.context-path) et
//   WebServerFactoryCustomizer, ServletContext, ServletWebServerInitializedEvent, arrêt gracieux (server.shutdown) ;
// - chaîne de filtres : beans FilterRegistrationBean (et GenericFilterBean non enregistrés) triés par ordre,
//   plus ceux de Spring Boot (ForwardedHeaderFilter), par type de dispatch (REQUEST, FORWARD, ERROR), puis le
//   DispatcherServlet ;
// - pages d'erreur de Tomcat : sendError ou exception non traitée -> dispatch ERROR vers /error
//   (BasicErrorController), attributs jakarta.servlet.error.* ;
// - corps de requête : multipart limité par spring.servlet.multipart (max-file-size 1 Mo, max-request-size 10 Mo
//   par défaut) -> MaxUploadSizeExceededException ; en-têtes et découpage de réponse de Tomcat (port/tomcat-output.ts).
// Ce fichier n'a pas de jumeau Kotlin.
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { KotlinLogging } from './logging.js'
import { type Filter, FilterRegistrationBean, HttpServletRequest, HttpServletResponse, buildFilterChain } from './servlet.js'
import { ApplicationContext, Environment, configuration, parseSpringDuration } from './spring.js'
import { DispatcherServlet, MULTIPART_EXCEEDED_ATTRIBUTE, RequestContextFilter, dispatchRequest } from './spring-web-dispatcher.js'
import { type DispatcherType, ForwardedHeaderFilter, GenericFilterBean, RequestDispatcher, filterDispatcherTypes } from './spring-web-filter.js'
import { installTomcatOutput, isOutputCommitted } from './tomcat-output.js'

const logger = KotlinLogging.logger('org.springframework.boot.web.embedded.tomcat.TomcatWebServer')
const gracefulShutdownLogger = KotlinLogging.logger('org.springframework.boot.web.embedded.tomcat.GracefulShutdown')

/** `Ordered.HIGHEST_PRECEDENCE` / `LOWEST_PRECEDENCE` */
export const Ordered = {
  HIGHEST_PRECEDENCE: -2147483648,
  LOWEST_PRECEDENCE: 2147483647,
} as const

// ---------------------------------------------------------------------------
// DataSize / MultipartProperties
// ---------------------------------------------------------------------------

/** `org.springframework.util.unit.DataSize` */
export class DataSize {
  private constructor(private readonly bytes: number) {}

  static ofBytes(bytes: number): DataSize {
    return new DataSize(bytes)
  }

  static ofMegabytes(mb: number): DataSize {
    return new DataSize(mb * 1024 * 1024)
  }

  /** `DataSize.parse("10MB")` (unité par défaut : octets) */
  static parse(text: string): DataSize {
    const m = /^([+-]?\d+)\s*(B|KB|MB|GB|TB)?$/i.exec(text.trim())
    if (!m) throw new Error(`'${text}' is not a valid data size`)
    const n = Number(m[1])
    const unit = (m[2] ?? 'B').toUpperCase()
    const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit] as number
    return new DataSize(n * mult)
  }

  toBytes(): number {
    return this.bytes
  }

  toString(): string {
    return `${this.bytes}B`
  }
}

/** `org.springframework.boot.autoconfigure.web.servlet.MultipartProperties` (spring.servlet.multipart) */
export class MultipartProperties {
  enabled = true
  maxFileSize: DataSize | null = DataSize.ofMegabytes(1)
  maxRequestSize: DataSize | null = DataSize.ofMegabytes(10)

  constructor(env: Environment) {
    const f = env.getProperty('spring.servlet.multipart.max-file-size')
    if (f !== null) this.maxFileSize = DataSize.parse(f)
    const r = env.getProperty('spring.servlet.multipart.max-request-size')
    if (r !== null) this.maxRequestSize = DataSize.parse(r)
    const e = env.getProperty('spring.servlet.multipart.enabled')
    if (e !== null) this.enabled = e.trim().toLowerCase() === 'true'
  }
}

// ---------------------------------------------------------------------------
// Fabrique, personnalisation, contexte
// ---------------------------------------------------------------------------

/** `ConfigurableServletWebServerFactory` (TomcatServletWebServerFactory) */
export class ConfigurableServletWebServerFactory {
  port: number
  contextPath: string
  address: string | null

  constructor(env: Environment) {
    this.port = Number(env.getProperty('server.port', '8080'))
    this.contextPath = env.getProperty('server.servlet.context-path', '')
    this.address = env.getProperty('server.address')
  }

  setPort(port: number): void {
    this.port = port
  }

  setContextPath(contextPath: string): void {
    this.contextPath = contextPath
  }
}

/** `WebServerFactoryCustomizer<ConfigurableServletWebServerFactory>` */
export abstract class WebServerFactoryCustomizer {
  abstract customize(factory: ConfigurableServletWebServerFactory): void
}

/** `jakarta.servlet.ServletContext` */
export class ServletContext {
  constructor(readonly contextPath: string) {}
}

/** `org.springframework.boot.web.server.WebServer` */
export class WebServer {
  constructor(
    private readonly server: Server,
    private readonly graceful: boolean,
    private readonly gracePeriodMs: number,
  ) {}

  /** durée maximale de `stop()` */
  get shutdownTimeoutMs(): number {
    return this.graceful ? this.gracePeriodMs : 0
  }

  get port(): number {
    const a = this.server.address() as AddressInfo | null
    return a ? a.port : -1
  }

  /**
   * Arrêt : gracieux (attend les requêtes en cours, au plus spring.lifecycle.timeout-per-shutdown-phase, puis ferme les
   * connexions restantes) ou immédiat. Les connexions keep-alive inactives sont fermées tout de suite.
   */
  async stop(): Promise<void> {
    if (!this.server.listening) return
    if (this.graceful) gracefulShutdownLogger.info(() => 'Commencing graceful shutdown. Waiting for active requests to complete')
    const complete = await new Promise<boolean>((resolve) => {
      let timedOut = false
      const timer = setTimeout(
        () => {
          timedOut = true
          this.server.closeAllConnections()
        },
        this.graceful ? this.gracePeriodMs : 0,
      )
      this.server.close(() => {
        clearTimeout(timer)
        resolve(!timedOut)
      })
      this.server.closeIdleConnections()
      if (!this.graceful) this.server.closeAllConnections()
    })
    if (this.graceful) {
      if (complete) gracefulShutdownLogger.info(() => 'Graceful shutdown complete')
      else gracefulShutdownLogger.info(() => 'Graceful shutdown aborted with one or more requests still active')
    }
  }
}

/** `ServletWebServerInitializedEvent` */
export class ServletWebServerInitializedEvent {
  constructor(readonly webServer: WebServer) {}
}

/** Auto-configuration du serveur web (ServletWebServerFactoryAutoConfiguration, DispatcherServletAutoConfiguration…) */
export class SpringBootWebAutoConfiguration {
  servletWebServerFactory(env: Environment, ctx: ApplicationContext): ConfigurableServletWebServerFactory {
    const factory = new ConfigurableServletWebServerFactory(env)
    // WebServerFactoryCustomizerBeanPostProcessor
    for (const c of ctx.getBeansOfType(WebServerFactoryCustomizer)) c.customize(factory)
    return factory
  }

  servletContext(factory: ConfigurableServletWebServerFactory): ServletContext {
    return new ServletContext(factory.contextPath)
  }

  multipartProperties(env: Environment): MultipartProperties {
    return new MultipartProperties(env)
  }

  dispatcherServlet(ctx: ApplicationContext, env: Environment, multipart: MultipartProperties): DispatcherServlet {
    return new DispatcherServlet(ctx, {
      maxFileSize: multipart.maxFileSize?.toBytes() ?? Number.MAX_SAFE_INTEGER,
      maxRequestSize: multipart.maxRequestSize?.toBytes() ?? Number.MAX_SAFE_INTEGER,
      asyncRequestTimeout: env.containsProperty('spring.mvc.async.request-timeout')
        ? parseSpringDuration(env.getProperty('spring.mvc.async.request-timeout') as string).toMillis()
        : 30_000,
      errorPath: env.getProperty('server.error.path', '/error'),
      templatePrefix: env.getProperty('spring.thymeleaf.prefix', 'classpath:/templates/'),
    })
  }

  /** OrderedRequestContextFilter : ordre -105 (REQUEST_WRAPPER_FILTER_MAX_ORDER - 105) */
  requestContextFilter(): FilterRegistrationBean {
    return new FilterRegistrationBean(new RequestContextFilter(), -105, ['/*'], 'requestContextFilter')
  }

  /** server.forward-headers-strategy=framework : ForwardedHeaderFilter, ordre HIGHEST_PRECEDENCE */
  forwardedHeaderFilter(): FilterRegistrationBean {
    return new FilterRegistrationBean(new ForwardedHeaderFilter(), Ordered.HIGHEST_PRECEDENCE, ['/*'], 'forwardedHeaderFilter')
  }
}

configuration(SpringBootWebAutoConfiguration, {
  beans: [
    { method: 'servletWebServerFactory', type: ConfigurableServletWebServerFactory, inject: [Environment, ApplicationContext] },
    { method: 'servletContext', type: ServletContext, inject: [ConfigurableServletWebServerFactory] },
    { method: 'multipartProperties', type: MultipartProperties, inject: [Environment] },
    { method: 'dispatcherServlet', type: DispatcherServlet, inject: [ApplicationContext, Environment, MultipartProperties] },
    { method: 'requestContextFilter', type: FilterRegistrationBean },
    {
      method: 'forwardedHeaderFilter',
      type: FilterRegistrationBean,
      condition: (env) => (env.getProperty('server.forward-headers-strategy') ?? '').toLowerCase() === 'framework',
    },
  ],
})

// ---------------------------------------------------------------------------
// Serveur
// ---------------------------------------------------------------------------

/** Lecture du corps : multipart au-delà de maxRequestSize -> tronqué et signalé */
function readBody(req: IncomingMessage, multipartLimit: number): Promise<{ body: Buffer; exceeded: boolean }> {
  const isMultipart = (req.headers['content-type'] ?? '').toLowerCase().startsWith('multipart/')
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let exceeded = false
    req.on('data', (c: Buffer) => {
      if (exceeded) return
      size += c.length
      if (isMultipart && size > multipartLimit) {
        exceeded = true
        chunks.length = 0
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve({ body: exceeded ? Buffer.alloc(0) : Buffer.concat(chunks), exceeded }))
    req.on('error', reject)
  })
}

export type WebServerOptions = {
  /** Port d'écoute (remplace celui de la fabrique ; 0 = aléatoire) */
  port?: number
  host?: string
}

type Chains = Record<'REQUEST' | 'FORWARD' | 'ERROR', { doFilter(req: HttpServletRequest, res: HttpServletResponse): Promise<void> }>

/** Filtres du conteneur (FilterRegistrationBean, ou beans GenericFilterBean enregistrés automatiquement sur /*) */
export function collectFilters(ctx: ApplicationContext): FilterRegistrationBean[] {
  const registrations = ctx.getBeansOfType(FilterRegistrationBean)
  const registered = new Set<Filter>(registrations.map((r) => r.filter))
  for (const r of registrations) if (r.filter instanceof GenericFilterBean && r.filter.filterName === null) r.filter.filterName = r.name
  const others = ctx
    .getBeansOfType(GenericFilterBean as never)
    .filter((f) => !registered.has(f as Filter))
    .map((f) => new FilterRegistrationBean(f as Filter, (f as { order?: number }).order ?? Ordered.LOWEST_PRECEDENCE))
  return [...registrations, ...others]
}

/** Chaînes de filtres par type de dispatch, terminées par le DispatcherServlet */
export function buildChains(filters: FilterRegistrationBean[], dispatcher: DispatcherServlet): Chains {
  const servlet = (req: HttpServletRequest, res: HttpServletResponse) => dispatcher.service(req, res)
  const forType = (t: DispatcherType) =>
    buildFilterChain(
      filters.filter((f) => filterDispatcherTypes(f).has(t)),
      servlet,
    )
  // stable : ordre croissant puis ordre d'enregistrement
  return { REQUEST: forType('REQUEST'), FORWARD: forType('FORWARD'), ERROR: forType('ERROR') }
}

/** Traitement complet d'une requête par le conteneur (filtres, servlet, page d'erreur) */
export async function serviceRequest(
  chains: Chains,
  req: IncomingMessage,
  res: ServerResponse,
  opts: { contextPath: string; errorPath: string; multipartLimit: number },
): Promise<void> {
  installTomcatOutput(res, req)
  const { body, exceeded } = await readBody(req, opts.multipartLimit)
  const request = new HttpServletRequest(req, body, opts.contextPath)
  const response = new HttpServletResponse(res)
  if (exceeded) request.setAttribute(MULTIPART_EXCEEDED_ATTRIBUTE, true)
  if (opts.contextPath && !(request.requestURI === opts.contextPath || request.requestURI.startsWith(`${opts.contextPath}/`))) {
    // hors du contexte : Tomcat répond 404
    response.setStatus(404)
    response.send()
    return
  }
  let failure: unknown = null
  try {
    await chains.REQUEST.doFilter(request, response)
  } catch (e) {
    failure = e
  }
  try {
    if (failure !== null) {
      logger.error(failure as Error, () => `Servlet.service() for servlet [dispatcherServlet] in context with path [${opts.contextPath}] threw exception`)
      if (!isOutputCommitted(res)) await errorDispatch(chains, request, response, 500, (failure as Error)?.message ?? null, failure, opts.errorPath)
    } else if (response.attributesForError !== null && !isOutputCommitted(res)) {
      const { status, message } = response.attributesForError
      await errorDispatch(chains, request, response, status, message, null, opts.errorPath)
    }
  } catch (e) {
    logger.error(e as Error, () => 'Exception Processing ErrorPage')
    if (!isOutputCommitted(res)) {
      response.setStatus(500)
      response.raw.statusCode = 500
    }
  } finally {
    if (!res.writableEnded) {
      if (!isOutputCommitted(res)) {
        response.commit()
        res.statusCode = response.status
      }
      res.end()
    }
  }
}

/** `StandardHostValve.custom` : dispatch ERROR vers la page d'erreur */
async function errorDispatch(
  chains: Chains,
  request: HttpServletRequest,
  response: HttpServletResponse,
  status: number,
  message: string | null,
  exception: unknown,
  errorPath: string,
): Promise<void> {
  response.attributesForError = null
  response.setStatus(status)
  request.setAttribute(RequestDispatcher.ERROR_STATUS_CODE, status)
  request.setAttribute(RequestDispatcher.ERROR_MESSAGE, message ?? '')
  request.setAttribute(RequestDispatcher.ERROR_REQUEST_URI, request.requestURI)
  request.setAttribute(RequestDispatcher.ERROR_SERVLET_NAME, 'dispatcherServlet')
  if (exception !== null) {
    request.setAttribute(RequestDispatcher.ERROR_EXCEPTION, exception)
    request.setAttribute(RequestDispatcher.ERROR_EXCEPTION_TYPE, (exception as object).constructor)
  }
  const errorRequest = dispatchRequest(request, errorPath, 'ERROR')
  await chains.ERROR.doFilter(errorRequest, response)
  // une page d'erreur qui appelle elle-même sendError n'est pas redispatchée
  if (response.attributesForError !== null) response.attributesForError = null
}

/**
 * Démarre le serveur web (après `ctx.refresh()`) : fabrique personnalisée, chaîne de filtres, écoute,
 * puis publication de ServletWebServerInitializedEvent.
 */
export async function startWebServer(ctx: ApplicationContext, opts: WebServerOptions = {}): Promise<WebServer> {
  const env = ctx.environment
  const factory = ctx.getBean(ConfigurableServletWebServerFactory)
  const dispatcher = ctx.getBean(DispatcherServlet)
  const multipart = ctx.getBean(MultipartProperties)
  const filters = collectFilters(ctx)
  const chains = buildChains(filters, dispatcher)
  const errorPath = env.getProperty('server.error.path', '/error')
  dispatcher.forward = async (request, response, path) => {
    request.setAttribute(RequestDispatcher.FORWARD_REQUEST_URI, request.requestURI)
    request.setAttribute(RequestDispatcher.FORWARD_SERVLET_PATH, request.servletPath)
    await chains.FORWARD.doFilter(dispatchRequest(request, path, 'FORWARD'), response)
  }
  const serviceOpts = { contextPath: factory.contextPath, errorPath, multipartLimit: multipart.maxRequestSize?.toBytes() ?? Number.MAX_SAFE_INTEGER }
  const server = createServer({ keepAliveTimeout: 60_000 }, (req, res) => {
    serviceRequest(chains, req, res, serviceOpts).catch((e) => {
      logger.error(e as Error, () => 'Request processing failed')
      if (!res.headersSent) res.statusCode = 500
      if (!res.writableEnded) res.end()
    })
  })
  const port = opts.port ?? factory.port
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, opts.host ?? factory.address ?? undefined, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const graceful = (env.getProperty('server.shutdown') ?? 'immediate').toLowerCase() === 'graceful'
  const grace = env.containsProperty('spring.lifecycle.timeout-per-shutdown-phase')
    ? parseSpringDuration(env.getProperty('spring.lifecycle.timeout-per-shutdown-phase') as string).toMillis()
    : 30_000
  const webServer = new WebServer(server, graceful, grace)
  logger.info(() => `Tomcat started on port ${webServer.port} (http) with context path '${factory.contextPath || '/'}'`)
  ctx.publishEvent(new ServletWebServerInitializedEvent(webServer))
  return webServer
}
