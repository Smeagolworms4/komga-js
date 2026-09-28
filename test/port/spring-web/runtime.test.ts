// Tests du DispatcherServlet sur des comportements de Spring MVC non observables sur le Komga de référence sans
// données (checkNotModified, StreamingResponseBody, SseEmitter, CORS configuré, vues, context-path…) :
// comportements attendus relevés dans le code de Spring Framework 6.2 / Spring Boot 3.5.
// Ce fichier n'a pas de jumeau Kotlin.
process.env.LANG = 'fr_FR.UTF-8'
import '../../../src/port/spring-boot-jackson.js'
import '../../../src/port/spring-boot-web.js'
import '../../../src/infrastructure/web/WebMvcConfiguration.js'
import '../../../src/infrastructure/web/EtagFilterConfiguration.js'
import '../../../src/infrastructure/web/BracketParamsFilterConfiguration.js'
import '../../../src/interfaces/mvc/ResourceNotFoundController.js'
import '../../../src/interfaces/mvc/IndexController.js'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { Agent, request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Author } from '../../../src/domain/model/Author.js'
import { Authors } from '../../../src/infrastructure/web/Authors.js'
import { setCachePrivate } from '../../../src/infrastructure/web/Utils.js'
import { jsonProperties } from '../../../src/port/jackson-mapper.js'
import { DataClass } from '../../../src/port/kotlin.js'
import { PathContainer, PathPattern, PathPatternParser } from '../../../src/port/path-pattern.js'
import { FilterRegistrationBean } from '../../../src/port/servlet.js'
import { ApplicationContext, Environment, configuration } from '../../../src/port/spring.js'
import { type WebServer, startWebServer } from '../../../src/port/spring-boot-web.js'
import type { Pageable } from '../../../src/port/spring-data.js'
import {
  HttpStatus,
  MethodArgumentNotValidException,
  ResponseEntity,
  type WebRequest,
  controllerAdvice,
  pageable,
  pathVariable,
  requestBody,
  requestParam,
  restController,
  streamingResponseBody,
  webRequest,
} from '../../../src/port/spring-web.js'
import { CorsConfiguration, CorsFilter, UrlBasedCorsConfigurationSource } from '../../../src/port/spring-web-cors.js'
import { SseEmitter } from '../../../src/port/spring-web-sse.js'
import { ServletUriComponentsBuilder, UriComponentsBuilder } from '../../../src/port/spring-web-uri.js'
import { interpolateMessage, validate } from '../../../src/port/validation-engine.js'
import { type Constraint, NotBlank, Size, Valid, classConstraints, constraints } from '../../../src/port/validation.js'

const LAST_MODIFIED = Date.UTC(2024, 2, 5, 7, 8, 9, 123)

// ---------------------------------------------------------------------------
// DTO validés
// ---------------------------------------------------------------------------

class RtAuthor extends DataClass<{ name: string }> {
  readonly name: string
  constructor({ name }: { name: string }) {
    super()
    this.name = name
  }
}
jsonProperties(RtAuthor, { name: 'String' }, [], { required: ['name'] })
constraints(RtAuthor, { name: [NotBlank()] })

class RtDto extends DataClass<{ title: string; authors: RtAuthor[]; page: number | null }> {
  readonly title: string
  readonly authors: RtAuthor[]
  readonly page: number | null
  constructor({ title, authors, page }: { title: string; authors: RtAuthor[]; page: number | null }) {
    super()
    this.title = title
    this.authors = authors
    this.page = page
  }
}
class RtDtoValidator {
  isValid(value: RtDto | null): boolean {
    return value !== null && value.page !== null
  }
}
const RtDtoConstraint = (): Constraint => ({ type: 'RtDtoConstraint', message: 'page must be specified', validatedBy: [RtDtoValidator] })
jsonProperties(RtDto, { title: 'String', authors: { list: { class: RtAuthor } }, page: { nullable: 'Int' } }, [], { required: ['title', 'authors'] })
classConstraints(RtDto, [RtDtoConstraint()])
constraints(RtDto, { title: [Size({ min: 2, max: 5 })], authors: [Valid()] })

class RtAdvice {
  onInvalid(e: MethodArgumentNotValidException): unknown {
    return {
      fields: e.bindingResult.fieldErrors.map((it) => `${it.field}: ${it.defaultMessage}`),
      global: e.bindingResult.globalErrors.map((it) => it.defaultMessage),
    }
  }
}
controllerAdvice(RtAdvice, { exceptionHandlers: { onInvalid: { exceptions: [MethodArgumentNotValidException], responseStatus: HttpStatus.BAD_REQUEST } } })

// ---------------------------------------------------------------------------
// Contrôleur de test
// ---------------------------------------------------------------------------

class RtController {
  lastModified(request: WebRequest): unknown {
    if (request.checkNotModified(LAST_MODIFIED)) return null
    return { ok: true }
  }

  entity(): ResponseEntity<Uint8Array> {
    return setCachePrivate(ResponseEntity.ok().lastModified(LAST_MODIFIED)).contentType('image/jpeg').body(new Uint8Array([1, 2, 3]))
  }

  put(request: WebRequest): unknown {
    if (request.checkNotModified('"abc"')) return null
    return 'updated'
  }

  file(): ResponseEntity<unknown> {
    const body = streamingResponseBody(async (out) => {
      out.write(Buffer.from('hello '))
      await new Promise((r) => setTimeout(r, 5))
      out.write(Buffer.from('world'))
      out.end()
    })
    return ResponseEntity.ok().contentType('application/zip').contentLength(11).body(body)
  }

  chunked(): ResponseEntity<unknown> {
    return ResponseEntity.ok()
      .contentType('application/octet-stream')
      .body(
        streamingResponseBody((out) => {
          out.write(Buffer.alloc(20000, 97))
          out.end()
        }),
      )
  }

  events(): SseEmitter {
    const emitter = new SseEmitter()
    emitter.send(SseEmitter.event().comment('heartbeat'))
    setTimeout(() => {
      emitter.send(SseEmitter.event().name('BookAdded').data({ bookId: '1', seriesId: '2' }, 'application/json'))
      emitter.send('line1\nline2')
      emitter.complete()
    }, 5)
    return emitter
  }

  authors(authors: Author[] | null): unknown {
    return authors === null ? 'null' : authors.map((it) => `${it.name}|${it.role}`)
  }

  bytes(): Uint8Array {
    return new Uint8Array([0, 1, 2])
  }

  text(): string {
    return 'héllo'
  }

  valid(dto: RtDto): unknown {
    return dto.title
  }

  pageDefaults(page: Pageable): unknown {
    return { page: page.pageNumber, size: page.pageSize, sort: page.sort.toString() }
  }

  numeric(id: number): unknown {
    return { numeric: id }
  }

  word(id: string): unknown {
    return { word: id }
  }

  rest(path: string): unknown {
    return { path }
  }

  wildcard(): unknown {
    return 'wildcard'
  }

  hex(n: number): unknown {
    return { n }
  }

  uri(): unknown {
    return {
      context: ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment('opds', 'v2').path('/auth').toUriString(),
      segment: ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment('a b', 'c/d').toUriString(),
      expanded: UriComponentsBuilder.fromUriString('https://cdn.kobo.com/{ImageId}/{Width}/{Height}/image.jpg').buildAndExpand('id1', 10, 20).toUri(),
    }
  }
}

restController(RtController, {
  handlers: {
    lastModified: { mapping: { method: 'GET', path: ['rt/lm'] }, args: [webRequest()] },
    entity: { mapping: { method: 'GET', path: ['api/v1/rt/entity'] } },
    put: { mapping: { method: 'PUT', path: ['rt/put'] }, args: [webRequest()] },
    file: { mapping: { method: 'GET', path: ['api/v1/books/{id}/file'] } },
    chunked: { mapping: { method: 'GET', path: ['rt/chunked'] } },
    events: { mapping: { method: 'GET', path: ['sse/v1/events'] } },
    authors: { mapping: { method: 'GET', path: ['api/v1/rt/authors'] }, args: [Authors()] },
    bytes: { mapping: { method: 'GET', path: ['rt/bytes'] } },
    text: { mapping: { method: 'GET', path: ['rt/text'] } },
    valid: { mapping: { method: 'POST', path: ['rt/valid'] }, args: [requestBody({ class: RtDto }, { valid: true })] },
    pageDefaults: { mapping: { method: 'GET', path: ['rt/page'] }, args: [pageable({ size: 50, sort: ['name'] })] },
    numeric: { mapping: { method: 'GET', path: ['rt/items/{id:[0-9]+}'] }, args: [pathVariable('id', 'Int')] },
    word: { mapping: { method: 'GET', path: ['rt/items/new', 'rt/other/{id}'] }, args: [pathVariable('id', 'String', { required: false, nullable: true })] },
    rest: { mapping: { method: 'GET', path: ['rt/files/{*path}'] }, args: [pathVariable('path')] },
    wildcard: { mapping: { method: 'GET', path: ['rt/w/*/x'] } },
    hex: { mapping: { method: 'GET', path: ['rt/hex'] }, args: [requestParam('n', 'Int')] },
    uri: { mapping: { method: 'GET', path: ['rt/uri'] } },
  },
})

class RtCorsConfiguration {
  corsFilter(): FilterRegistrationBean {
    const source = new UrlBasedCorsConfigurationSource()
    const config = new CorsConfiguration().applyPermitDefaultValues()
    config.allowedOrigins = ['http://allowed.com/']
    config.allowedMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']
    config.allowCredentials = true
    config.addExposedHeader('Content-Disposition')
    config.addExposedHeader('X-Auth-Token')
    source.registerCorsConfiguration('/rt/**', config)
    return new FilterRegistrationBean(new CorsFilter(source), -100, ['/rt/*'], 'corsFilter')
  }
}
configuration(RtCorsConfiguration, { beans: [{ method: 'corsFilter', type: FilterRegistrationBean }] })

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

type Res = { status: number; headers: [string, string][]; body: Buffer }

function call(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const agent = new Agent({ keepAlive: true })
    const h = { ...headers }
    if (body !== undefined) h['Content-Length'] = String(Buffer.byteLength(body))
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers: h, agent }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const hs: [string, string][] = []
        for (let i = 0; i < res.rawHeaders.length; i += 2) hs.push([res.rawHeaders[i] as string, res.rawHeaders[i + 1] as string])
        agent.destroy()
        resolve({ status: res.statusCode as number, headers: hs, body: Buffer.concat(chunks) })
      })
    })
    req.on('error', reject)
    req.end(body)
  })
}

function header(r: Res, name: string): string | null {
  return r.headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null
}

function headerNames(r: Res): string[] {
  return r.headers.map(([k]) => k)
}

// ---------------------------------------------------------------------------

describe('DispatcherServlet (comportements de Spring MVC)', () => {
  let ctx: ApplicationContext
  let server: WebServer
  let port: number
  let templates: string

  beforeAll(async () => {
    templates = mkdtempSync(join(tmpdir(), 'komga-templates-'))
    mkdirSync(templates, { recursive: true })
    writeFileSync(
      join(templates, 'index.html'),
      '<html><head><link rel="icon" href="/favicon.ico" th:href="@{/favicon.ico}"><script th:inline="javascript">\n/*<![CDATA[*/\nwindow.resourceBaseUrl = /*[(${"\'" + baseUrl + "\'"})]*/ \'/\'\n/*]]>*/\n</script></head><body></body></html>',
    )
    const env = new Environment({
      properties: { 'server.forward-headers-strategy': 'framework', 'spring.mvc.async.request-timeout': '1h', 'spring.thymeleaf.prefix': `file:${templates}/` },
      env: {},
    })
    ctx = new ApplicationContext(env).refresh()
    server = await startWebServer(ctx, { port: 0, host: '127.0.0.1' })
    port = server.port
  })

  afterAll(async () => {
    await server.stop()
    ctx.close()
    rmSync(templates, { recursive: true, force: true })
  })

  describe('ServletWebRequest.checkNotModified', () => {
    it('adds Last-Modified and answers 304 to If-Modified-Since', async () => {
      const first = await call(port, 'GET', '/rt/lm')
      expect(first.status).toBe(200)
      expect(header(first, 'Last-Modified')).toBe('Tue, 05 Mar 2024 07:08:09 GMT')
      const second = await call(port, 'GET', '/rt/lm', { 'If-Modified-Since': 'Tue, 05 Mar 2024 07:08:09 GMT' })
      expect(second.status).toBe(304)
      expect(second.body.length).toBe(0)
      expect(header(second, 'Last-Modified')).toBe('Tue, 05 Mar 2024 07:08:09 GMT')
      const older = await call(port, 'GET', '/rt/lm', { 'If-Modified-Since': 'Tue, 05 Mar 2024 07:08:08 GMT' })
      expect(older.status).toBe(200)
      const asctime = await call(port, 'GET', '/rt/lm', { 'If-Modified-Since': 'Tue Mar  5 07:08:09 2024' })
      expect(asctime.status).toBe(304)
    })

    it('answers 412 to a failed If-Match on unsafe methods', async () => {
      const failed = await call(port, 'PUT', '/rt/put', { 'If-Match': '"other"' })
      expect(failed.status).toBe(412)
      const ok = await call(port, 'PUT', '/rt/put', { 'If-Match': '"abc"' })
      expect(ok.status).toBe(200)
      expect(ok.body.toString()).toBe('updated')
      expect(header(ok, 'ETag')).toBeNull()
      const wildcard = await call(port, 'PUT', '/rt/put', { 'If-None-Match': '*' })
      expect(wildcard.status).toBe(412)
    })

    it('ResponseEntity with Last-Modified is not modified (HttpEntityMethodProcessor)', async () => {
      const first = await call(port, 'GET', '/api/v1/rt/entity')
      expect(first.status).toBe(200)
      expect(header(first, 'Cache-Control')).toBe('max-age=0, must-revalidate, private')
      expect(header(first, 'Last-Modified')).toBe('Tue, 05 Mar 2024 07:08:09 GMT')
      expect(header(first, 'Content-Type')).toBe('image/jpeg')
      expect(header(first, 'Content-Length')).toBe('3')
      expect(header(first, 'ETag')).toBe('"05289df737df57326fcdd22597afb1fac"')
      const second = await call(port, 'GET', '/api/v1/rt/entity', { 'If-Modified-Since': 'Tue, 05 Mar 2024 07:08:09 GMT' })
      expect(second.status).toBe(304)
      expect(header(second, 'Last-Modified')).toBe('Tue, 05 Mar 2024 07:08:09 GMT')
      const etag = await call(port, 'GET', '/api/v1/rt/entity', { 'If-None-Match': '"05289df737df57326fcdd22597afb1fac"' })
      expect(etag.status).toBe(304)
    })
  })

  describe('StreamingResponseBody', () => {
    it('streams with the entity headers, without ETag on excluded paths', async () => {
      const r = await call(port, 'GET', '/api/v1/books/1/file')
      expect(r.status).toBe(200)
      expect(r.body.toString()).toBe('hello world')
      expect(header(r, 'Content-Length')).toBe('11')
      expect(header(r, 'ETag')).toBeNull()
      expect(header(r, 'Cache-Control')).toBe('max-age=0, must-revalidate, private')
    })

    it('uses chunked encoding without Content-Length', async () => {
      const r = await call(port, 'GET', '/rt/chunked')
      expect(r.body.length).toBe(20000)
      expect(header(r, 'Transfer-Encoding')).toBe('chunked')
    })
  })

  describe('SseEmitter', () => {
    it('writes text/event-stream frames', async () => {
      const r = await call(port, 'GET', '/sse/v1/events')
      expect(header(r, 'Content-Type')).toBe('text/event-stream')
      expect(header(r, 'Transfer-Encoding')).toBe('chunked')
      expect(r.body.toString()).toBe(':heartbeat\n\nevent:BookAdded\ndata:{"bookId":"1","seriesId":"2"}\n\ndata:line1\ndata:line2\n\n')
    })
  })

  describe('Arguments', () => {
    it('custom argument resolver (Authors) honours bracket parameters', async () => {
      const r = await call(port, 'GET', `/api/v1/rt/authors?author=${encodeURIComponent('John, Doe,Writer')}&author[]=x,penciller&author=bad`)
      expect(JSON.parse(r.body.toString())).toEqual(['John, Doe|writer', 'x|penciller'])
      const empty = await call(port, 'GET', '/api/v1/rt/authors?author=')
      expect(empty.body.toString()).toBe('null')
    })

    it('@Valid body: field errors with cascaded paths and class-level errors', async () => {
      const r = await call(
        port,
        'POST',
        '/rt/valid',
        { 'Content-Type': 'application/json', 'Accept-Language': 'en' },
        JSON.stringify({ title: 'abcdefgh', authors: [{ name: 'ok' }, { name: ' ' }], page: null }),
      )
      expect(r.status).toBe(400)
      expect(JSON.parse(r.body.toString())).toEqual({ fields: ['title: size must be between 2 and 5', 'authors[1].name: must not be blank'], global: ['page must be specified'] })
    })

    it('Pageable defaults from @PageableDefault and sort parsing', async () => {
      const r = await call(port, 'GET', '/rt/page')
      expect(JSON.parse(r.body.toString())).toEqual({ page: 0, size: 50, sort: 'name: ASC' })
      const s = await call(port, 'GET', '/rt/page?sort=title,desc,ignorecase&sort=number&page=3&size=9999')
      expect(JSON.parse(r.body.toString()).size).toBe(50)
      expect(JSON.parse(s.body.toString())).toEqual({ page: 3, size: 2000, sort: 'title: DESC, ignoring case,number: ASC' })
    })

    it('Int conversion accepts hexadecimal and whitespace like Spring NumberUtils', async () => {
      expect(JSON.parse((await call(port, 'GET', '/rt/hex?n=0x1F')).body.toString())).toEqual({ n: 31 })
      expect(JSON.parse((await call(port, 'GET', '/rt/hex?n=%2012%20')).body.toString())).toEqual({ n: 12 })
      const missing = await call(port, 'GET', '/rt/hex')
      expect(missing.status).toBe(400)
      expect(JSON.parse(missing.body.toString()).message).toBe("Required parameter 'n' is not present.")
    })
  })

  describe('Mappings', () => {
    it('picks the most specific pattern', async () => {
      expect(JSON.parse((await call(port, 'GET', '/rt/items/42')).body.toString())).toEqual({ numeric: 42 })
      expect(JSON.parse((await call(port, 'GET', '/rt/items/new')).body.toString())).toEqual({ word: null })
      expect(JSON.parse((await call(port, 'GET', '/rt/other/abc')).body.toString())).toEqual({ word: 'abc' })
      // pas de correspondance hors API : ResourceNotFoundController renvoie vers la vue index
      expect(header(await call(port, 'GET', '/rt/items/abc'), 'Content-Type')).toBe('text/html;charset=UTF-8')
      expect(JSON.parse((await call(port, 'GET', '/rt/files/a/b%20c.txt')).body.toString())).toEqual({ path: '/a/b c.txt' })
      expect((await call(port, 'GET', '/rt/w/abc/x')).body.toString()).toBe('wildcard')
      expect(header(await call(port, 'GET', '/rt/w//x'), 'Content-Type')).toBe('text/html;charset=UTF-8')
    })

    it('writes byte arrays and strings with Spring converters', async () => {
      const b = await call(port, 'GET', '/rt/bytes')
      expect(header(b, 'Content-Type')).toBe('application/octet-stream')
      expect(header(b, 'Content-Length')).toBe('3')
      const t = await call(port, 'GET', '/rt/text')
      expect(header(t, 'Content-Type')).toBe('text/plain;charset=UTF-8')
      expect(t.body.toString()).toBe('héllo')
      const j = await call(port, 'GET', '/rt/text', { Accept: 'application/json' })
      expect(header(j, 'Content-Type')).toBe('application/json')
    })
  })

  describe('ServletUriComponentsBuilder', () => {
    it('builds URIs from the current request, honouring X-Forwarded-*', async () => {
      const direct = JSON.parse((await call(port, 'GET', '/rt/uri')).body.toString())
      expect(direct).toEqual({
        context: `http://127.0.0.1:${port}/opds/v2/auth`,
        segment: `http://127.0.0.1:${port}/a%20b/c%2Fd`,
        expanded: 'https://cdn.kobo.com/id1/10/20/image.jpg',
      })
      const forwarded = JSON.parse(
        (await call(port, 'GET', '/rt/uri', { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'komga.example.org', 'X-Forwarded-Port': '443', 'X-Forwarded-Prefix': '/komga' })).body.toString(),
      )
      expect(forwarded.context).toBe('https://komga.example.org/komga/opds/v2/auth')
    })
  })

  describe('CORS', () => {
    it('answers an allowed pre-flight request', async () => {
      const r = await call(port, 'OPTIONS', '/rt/lm', { Origin: 'http://allowed.com', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-a, x-b' })
      expect(r.status).toBe(200)
      expect(headerNames(r).slice(0, 9)).toEqual([
        'Vary',
        'Vary',
        'Vary',
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Methods',
        'Access-Control-Allow-Headers',
        'Access-Control-Expose-Headers',
        'Access-Control-Allow-Credentials',
        'Access-Control-Max-Age',
      ])
      expect(header(r, 'Access-Control-Allow-Origin')).toBe('http://allowed.com')
      expect(header(r, 'Access-Control-Allow-Methods')).toBe('GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS,TRACE')
      expect(header(r, 'Access-Control-Allow-Headers')).toBe('x-a, x-b')
      expect(header(r, 'Access-Control-Expose-Headers')).toBe('Content-Disposition, X-Auth-Token')
      expect(header(r, 'Access-Control-Max-Age')).toBe('1800')
    })

    it('rejects a request from another origin', async () => {
      const r = await call(port, 'GET', '/rt/lm', { Origin: 'http://other.com' })
      expect(r.status).toBe(403)
      expect(r.body.toString()).toBe('Invalid CORS request')
    })
  })

  describe('Views', () => {
    it('forwards unknown non-API paths to the index view', async () => {
      const r = await call(port, 'GET', '/some/route', { 'Accept-Language': 'en-GB' })
      expect(r.status).toBe(200)
      expect(header(r, 'Content-Type')).toBe('text/html;charset=UTF-8')
      expect(header(r, 'Content-Language')).toBe('en-GB')
      expect(r.body.toString()).toBe(
        "<html><head><link rel=\"icon\" href=\"/favicon.ico\"><script>\n/*<![CDATA[*/\nwindow.resourceBaseUrl = '/'\n/*]]>*/\n</script></head><body></body></html>",
      )
    })

    it('keeps 404 for unknown API paths', async () => {
      const r = await call(port, 'GET', '/sse/v1/nope')
      expect(r.status).toBe(404)
    })
  })
})

describe('context path', () => {
  let ctx: ApplicationContext
  let server: WebServer

  beforeAll(async () => {
    const env = new Environment({ properties: { 'server.servlet.context-path': '/komga' }, env: {} })
    ctx = new ApplicationContext(env).refresh()
    server = await startWebServer(ctx, { port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await server.stop()
    ctx.close()
  })

  it('serves under the context path only', async () => {
    const ok = await call(server.port, 'GET', '/komga/rt/items/5')
    expect(JSON.parse(ok.body.toString())).toEqual({ numeric: 5 })
    const err = await call(server.port, 'GET', '/komga/api/v1/nope')
    expect(JSON.parse(err.body.toString()).path).toBe('/komga/api/v1/nope')
    expect((await call(server.port, 'GET', '/rt/items/5')).status).toBe(404)
  })
})

describe('PathPattern', () => {
  const p = (s: string) => PathPatternParser.defaultInstance.parse(s)

  it('matches like Spring', () => {
    expect(p('/api/*').matches('/api/x')).toBe(true)
    expect(p('/api/*').matches('/api')).toBe(false)
    expect(p('/api/**').matches('/api')).toBe(true)
    expect(p('/api/**').matches('/api/a/b')).toBe(true)
    expect(p('/api/v1/claim').matches('/api/v1/claim/')).toBe(false)
    expect(p('/a/{id:\\d+}').matchAndExtract('/a/12')?.get('id')).toBe('12')
    expect(p('/a/{id:\\d+}').matches('/a/x')).toBe(false)
    expect(p('/a/*.css').matches('/a/b.css')).toBe(true)
    expect(p('/a/{name}.{ext}').matchAndExtract('/a/b.c.d')?.get('ext')).toBe('d')
    expect(p('/books/*/file/**').matches(PathContainer.parsePath('/books/1/file/x.cbz'))).toBe(true)
  })

  it('combines and orders by specificity', () => {
    expect(p('/api/v1/claim').combine(p('')).patternString).toBe('/api/v1/claim')
    expect(p('/hotels/*').combine(p('/booking')).patternString).toBe('/hotels/booking')
    expect(p('/api').combine(p('/v1/series')).patternString).toBe('/api/v1/series')
    const sorted = [p('/**'), p('/a/{x}'), p('/a/b'), p('/a/*')].sort(PathPattern.SPECIFICITY_COMPARATOR)
    expect(sorted.map((it) => it.patternString)).toEqual(['/a/b', '/a/{x}', '/a/*', '/**'])
  })

  it('extracts the path within the pattern', () => {
    expect(p('/css/**').extractPathWithinPattern('/css/a/b.css')).toBe('a/b.css')
    expect(p('/docs/cvs/commit.html').extractPathWithinPattern('/docs/cvs/commit.html')).toBe('')
  })
})

describe('Validation messages', () => {
  it('interpolates Hibernate Validator bundles per locale', () => {
    expect(interpolateMessage('{jakarta.validation.constraints.NotBlank.message}', NotBlank(), 'en')).toBe('must not be blank')
    expect(interpolateMessage('{jakarta.validation.constraints.NotBlank.message}', NotBlank(), 'fr-FR')).toBe('ne doit pas être vide')
    expect(interpolateMessage('{jakarta.validation.constraints.NotBlank.message}', NotBlank(), 'de')).toBe('darf nicht leer sein')
    expect(interpolateMessage('{jakarta.validation.constraints.Size.message}', Size({ min: 1 }), 'en')).toBe('size must be between 1 and 2147483647')
    // locale sans bundle : repli sur la locale par défaut (fr_FR)
    expect(interpolateMessage('{jakarta.validation.constraints.NotBlank.message}', NotBlank(), 'xx')).toBe('ne doit pas être vide')
  })

  it('validates nested beans', () => {
    const v = validate(new RtDto({ title: 'abc', authors: [new RtAuthor({ name: '' })], page: 1 }), 'en')
    expect(v.map((it) => `${it.propertyPath}: ${it.message}`)).toEqual(['authors[0].name: must not be blank'])
  })
})
