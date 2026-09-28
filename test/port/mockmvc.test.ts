// Tests du support MockMvc (test/support/mockmvc.ts) : JsonPath (sémantique Jayway), assertions de spring-test
// (JsonPathExpectationsHelper, status, header, cookie, content, xpath) et exécution par le vrai pipeline.
// Ce fichier n'a pas de jumeau Kotlin.
import { afterAll, describe, expect, it } from 'vitest'
import {
  JsonPath,
  MockHttpServletResponse,
  MockMvc,
  MockMvcRequestBuilders,
  MockMvcResultMatchers,
  MockMvcResultMatchersDsl,
  MvcResult,
  allOf,
  closeContext,
  containsString,
  expandAndEncode,
  hasItem,
  httpBasic,
  matchesPattern,
  mockMvcTest,
  withAnonymousUser,
  withMockUser,
} from '../support/mockmvc.js'
import type { HttpServletRequest } from '../../src/port/servlet.js'

const doc = {
  content: [
    { id: 'a', name: 'Lib1', filtered: false, readProgress: null },
    { id: 'b', name: 'Lib2', filtered: true },
  ],
  totalElements: 2,
  roles: ['USER', 'ADMIN'],
  labels: [],
  empty: '',
  nested: { value: 'v', n: { deep: 1 } },
}

function result(body: string, { status = 200, headers = {} as Record<string, string[]>, errorMessage = null as string | null } = {}): MvcResult {
  const map = new Map(Object.entries({ 'content-type': ['application/json'], ...headers }).map(([k, v]) => [k.toLowerCase(), v]))
  return new MvcResult({} as HttpServletRequest, new MockHttpServletResponse(status, map, Buffer.from(body, 'utf8'), errorMessage), null)
}

function expectDsl(r: MvcResult, dsl: (m: MockMvcResultMatchersDsl) => void): void {
  dsl(new MockMvcResultMatchersDsl(r))
}

describe('JsonPath', () => {
  it('reads definite paths', () => {
    expect(JsonPath.read(doc, '$.totalElements')).toBe(2)
    expect(JsonPath.read(doc, 'totalElements')).toBe(2)
    expect(JsonPath.read(doc, '$.content[1].name')).toBe('Lib2')
    expect(JsonPath.read(doc, "$['nested']['value']")).toBe('v')
    expect(JsonPath.read(doc, '$.content[-1].id')).toBe('b')
    expect(JsonPath.read(doc, '$.content[0].readProgress')).toBeNull()
    expect(JsonPath.read(doc, '$.nested.n.deep')).toBe(1)
  })

  it('reads functions', () => {
    expect(JsonPath.read(doc, '$.content.length()')).toBe(2)
    expect(JsonPath.read(doc, '$.length()')).toBe(6)
    expect(JsonPath.read(doc, '$.roles.size()')).toBe(2)
  })

  it('reads indefinite paths', () => {
    expect(JsonPath.read(doc, "$.content.[*].['id']")).toEqual(['a', 'b'])
    expect(JsonPath.read(doc, "$.content[?(@.name == 'Lib2')].filtered")).toEqual([true])
    expect(JsonPath.read(doc, '$.content[?(@.filtered == false)].id')).toEqual(['a'])
    expect(JsonPath.read(doc, '$.content[?(@.readProgress)].id')).toEqual(['a'])
    expect(JsonPath.read(doc, '$..deep')).toEqual([1])
    expect(JsonPath.read(doc, '$.content[*].missing')).toEqual([])
    expect(JsonPath.read(doc, '$.content[0:1].id')).toEqual(['a'])
    expect(JsonPath.read(doc, "$.content[?(@.name =~ /lib.*/i)].id")).toEqual(['a', 'b'])
    expect(JsonPath.read(doc, "$.content[?(@.id in ['b'])].name")).toEqual(['Lib2'])
  })

  it('throws on missing definite paths', () => {
    expect(() => JsonPath.read(doc, '$.missing')).toThrow('No results for path')
    expect(() => JsonPath.read(doc, '$.content[5]')).toThrow()
    expect(() => JsonPath.read(doc, '$.content[0].readProgress.completed')).toThrow()
  })
})

describe('JsonPathExpectationsHelper', () => {
  const r = result(JSON.stringify(doc))

  it('value unwraps single-element lists and fails on mismatch', () => {
    expectDsl(r, (m) => m.jsonPath("$.content[?(@.name == 'Lib2')].filtered", (j) => j.value(true)))
    expect(() => expectDsl(r, (m) => m.jsonPath("$.content[?(@.name == 'Lib2')].filtered", (j) => j.value(false)))).toThrow('expected:<false> but was:<true>')
    expect(() => expectDsl(r, (m) => m.jsonPath('$.content[*].id', (j) => j.value('a')))).toThrow('Got a list of values')
    expect(() => expectDsl(r, (m) => m.jsonPath("$.content[?(@.name == 'X')].id", (j) => j.value('a')))).toThrow('No matching value')
    expectDsl(r, (m) => m.jsonPath('$.roles', (j) => j.value(['USER', 'ADMIN'])))
    expectDsl(r, (m) => m.jsonPath('$.roles', (j) => j.value(allOf(hasItem('USER'), hasItem('ADMIN')))))
    expect(() => expectDsl(r, (m) => m.jsonPath('$.roles', (j) => j.value(hasItem('X'))))).toThrow('Expected: a collection containing "X"')
    expect(() => expectDsl(r, (m) => m.jsonPath('$.missing', (j) => j.value(1)))).toThrow('No value at JSON path "$.missing"')
    expectDsl(r, (m) => m.jsonPath('$.content[0].readProgress', (j) => j.value(null)))
    expectDsl(r, (m) => m.jsonPath('$.content[0].id', (j) => j.value(matchesPattern(/[^*]+/))))
  })

  it('value converts the actual value to the expected type (json-smart)', () => {
    const c = result('{"id":"1","n":2,"b":"true"}')
    expectDsl(c, (m) => m.jsonPath('$.id', (j) => j.value(1)))
    expectDsl(c, (m) => m.jsonPath('$.n', (j) => j.value('2')))
    expectDsl(c, (m) => m.jsonPath('$.b', (j) => j.value(true)))
    expect(() => expectDsl(c, (m) => m.jsonPath('$.id', (j) => j.value(2)))).toThrow('expected:<2> but was:<1>')
  })

  it('exists / doesNotExist / hasJsonPath / doesNotHaveJsonPath', () => {
    expectDsl(r, (m) => m.jsonPath('$.totalElements', (j) => j.exists()))
    expect(() => expectDsl(r, (m) => m.jsonPath('$.content[0].readProgress', (j) => j.exists()))).toThrow()
    expectDsl(r, (m) => m.jsonPath('$.missing', (j) => j.doesNotExist()))
    expectDsl(r, (m) => m.jsonPath('$.content[0].readProgress', (j) => j.doesNotExist()))
    expect(() => expectDsl(r, (m) => m.jsonPath('$.totalElements', (j) => j.doesNotExist()))).toThrow()
    expectDsl(r, (m) => m.jsonPath('$.content[0].readProgress', (j) => j.hasJsonPath()))
    expectDsl(r, (m) => m.jsonPath('$.missing', (j) => j.doesNotHaveJsonPath()))
    expect(() => expectDsl(r, (m) => m.jsonPath('$.content[0].readProgress', (j) => j.doesNotHaveJsonPath()))).toThrow()
  })

  it('isEmpty / isNotEmpty / type checks', () => {
    expectDsl(r, (m) => m.jsonPath('$.labels', (j) => j.isEmpty()))
    expectDsl(r, (m) => m.jsonPath('$.empty', (j) => j.isEmpty()))
    expectDsl(r, (m) => m.jsonPath('$.roles', (j) => j.isNotEmpty()))
    expect(() => expectDsl(r, (m) => m.jsonPath('$.roles', (j) => j.isEmpty()))).toThrow()
    expectDsl(r, (m) => m.jsonPath('$.roles', (j) => j.isArray()))
    expectDsl(r, (m) => m.jsonPath('$.nested', (j) => j.isMap()))
    expectDsl(r, (m) => m.jsonPath('$.totalElements', (j) => j.isNumber()))
    expect(() => expectDsl(r, (m) => m.jsonPath('$.totalElements', (j) => j.isString()))).toThrow()
  })

  it('java style matchers', () => {
    MockMvcResultMatchers.jsonPath('$.totalElements').value(2)(r)
    expect(() => MockMvcResultMatchers.jsonPath('$.totalElements').value(3)(r)).toThrow()
    MockMvcResultMatchers.status().isOk()(r)
  })
})

describe('ResultMatchers', () => {
  it('status', () => {
    const r = result('', { status: 400, errorMessage: 'ERR_1015' })
    expectDsl(r, (m) =>
      m.status((s) => {
        s.isBadRequest()
        s.is4xxClientError()
        s.reason('ERR_1015')
      }),
    )
    expect(() => expectDsl(r, (m) => m.status((s) => s.isOk()))).toThrow('Status expected:<200> but was:<400>')
    expect(() => expectDsl(r, (m) => m.status((s) => s.is2xxSuccessful()))).toThrow()
  })

  it('header, cookie, content', () => {
    const r = result('{"a":1,"b":[1,2]}', {
      headers: {
        'Set-Cookie': ['komga-remember-me=abc; Max-Age=100; Path=/; HttpOnly', 'KOMGA-SESSION=; Max-Age=0; Path=/; HttpOnly'],
        'Content-Disposition': ['attachment; filename="x.css"'],
      },
    })
    expectDsl(r, (m) => {
      m.header((h) => {
        h.string('Set-Cookie', containsString('komga-remember-me='))
        h.string('content-disposition', 'attachment; filename="x.css"')
        h.exists('Content-Type')
        h.doesNotExist('X-Auth-Token')
      })
      m.cookie((c) => {
        c.exists('KOMGA-SESSION')
        c.httpOnly('komga-remember-me', true)
        c.maxAge('KOMGA-SESSION', 0)
        c.value('komga-remember-me', 'abc')
        c.doesNotExist('other')
      })
      m.content((c) => {
        c.contentType('application/json')
        c.json('{"b":[2,1]}')
        c.string('{"a":1,"b":[1,2]}')
      })
    })
    expect(() => expectDsl(r, (m) => m.content((c) => c.json('{"b":[2,1]}', true)))).toThrow()
    expect(() => expectDsl(r, (m) => m.header((h) => h.string('Set-Cookie', containsString('KOMGA-SESSION'))))).toThrow()
  })

  it('xpath', () => {
    const r = result('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>1</id><title>A</title></entry><entry><id>2</id><title>B</title></entry></feed>', {
      headers: { 'content-type': ['application/atom+xml;charset=UTF-8'] },
    })
    expectDsl(r, (m) => {
      m.xpath('/feed/entry', (x) => x.nodeCount(2))
      m.xpath('/feed/entry/id', (x) => x.nodeCount(2))
      m.xpath('/feed/entry[2]/title', (x) => x.string('B'))
      m.xpath('/feed/entry[%s]/id', 1, (x) => x.string('1'))
      m.xpath('/feed/missing', (x) => x.doesNotExist())
    })
    expect(() => expectDsl(r, (m) => m.xpath('/feed/entry[1]/title', (x) => x.string('B')))).toThrow()
  })
})

describe('request building', () => {
  it('encodes like UriComponentsBuilder.encode()', () => {
    expect(expandAndEncode('/api/v1/series/{id}/books', ['a b'])).toBe('/api/v1/series/a%20b/books')
    expect(expandAndEncode('/api/v1/series?sort=metadata.titleSort,asc', [])).toBe('/api/v1/series?sort=metadata.titleSort,asc')
    expect(expandAndEncode('/x/アキラ', [])).toBe('/x/%E3%82%A2%E3%82%AD%E3%83%A9')
  })
})

// @SpringBootTest @AutoConfigureMockMvc
describe('MockMvc', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)

  afterAll(() => closeContext(ctx))

  it(
    'runs requests through the security filter chain and the dispatcher',
    withAnonymousUser(async () => {
      const r = await mockMvc.get('/api/v1/claim').andExpect((m) => {
        m.status((s) => s.isOk())
        m.jsonPath('$.isClaimed', (j) => j.value(false))
        m.header((h) => h.string('X-Frame-Options', 'SAMEORIGIN'))
      })
      expect(r.response.contentAsString).toBe('{"isClaimed":false}')
    }),
  )

  it('returns 401 without authentication, with a Basic challenge', async () => {
    await mockMvc.get('/api/v2/users').andExpect((m) => {
      m.status((s) => s.isUnauthorized())
      m.header((h) => h.string('WWW-Authenticate', 'Basic realm="Realm"'))
    })
    await mockMvc.get('/api/v2/users', (r) => r.with(httpBasic('nobody@example.org', 'x'))).andExpect((m) => m.status((s) => s.isUnauthorized()))
  })

  it(
    'applies @PreAuthorize with the test security context',
    withMockUser(async () => {
      await mockMvc.get('/api/v2/users').andExpect((m) => m.status((s) => s.isForbidden()))
    }),
  )

  it(
    'supports java style perform',
    withMockUser({ roles: ['ADMIN'] }, async () => {
      await mockMvc.perform(MockMvcRequestBuilders.get('/api/v2/users').contentType('application/json')).andExpect(MockMvcResultMatchers.status().isOk(), MockMvcResultMatchers.jsonPath('$.length()').value(0))
    }),
  )

  it('records forwards without executing them', async () => {
    const r = await mockMvc.get('/book/0DBTWY6S0KNX9').andExpect((m) => {
      m.status((s) => s.isOk())
      m.forwardedUrl('/')
    })
    expect(r.response.contentAsByteArray.length).toBe(0)
  })

  it(
    'reports sendError reason and renders the error page',
    withMockUser({ roles: ['ADMIN'] }, async () => {
      const r = await mockMvc
        .post('/api/v1/claim', (r) => {
          r.header('X-Komga-Email', 'a@b.cd')
          r.header('X-Komga-Password', 'x')
        })
        .andReturn()
      // serveur non réclamé : administrateur créé
      expect(r.response.status).toBe(200)
      await mockMvc
        .post('/api/v1/claim', (r) => {
          r.header('X-Komga-Email', 'a@b.cd')
          r.header('X-Komga-Password', 'x')
        })
        .andExpect((m) => {
          m.status((s) => {
            s.isBadRequest()
            s.reason('This server has already been claimed')
          })
          m.jsonPath('$.message', (j) => j.value('This server has already been claimed'))
        })
    }),
  )
})
