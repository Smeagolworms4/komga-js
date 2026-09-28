// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/web/BracketParamsRequestWrapperTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { BracketParamsRequestWrapper } from '../../../src/infrastructure/web/BracketParamsRequestWrapper.js'
import { MockHttpServletRequest } from '../../MockHttpServletRequest.js'

const sorted = (a: readonly string[] | null | undefined) => [...(a ?? [])].sort()

describe('BracketParamsRequestWrapperTest', () => {
  describe('ParameterNames', () => {
    it('given parameters with and without brackets when getting parameter names then only the name without bracket is returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param')
      request.setParameter('param[]')

      // when
      const filtered = new BracketParamsRequestWrapper(request)

      // then
      expect(sorted(filtered.getParameterNames())).toEqual(sorted(['param']))
    })

    it('given parameters with brackets when getting parameter names then only the name without bracket is returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param[]')

      // when
      const filtered = new BracketParamsRequestWrapper(request)

      // then
      expect(sorted(filtered.getParameterNames())).toEqual(sorted(['param']))
    })

    it('given parameters without brackets when getting parameter names then only the name without bracket is returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param')

      // when
      const filtered = new BracketParamsRequestWrapper(request)

      // then
      expect(sorted(filtered.getParameterNames())).toEqual(sorted(['param']))
    })

    it('given empty parameters when getting parameter names then it is empty', () => {
      // given
      const request = new MockHttpServletRequest()

      // when
      const filtered = new BracketParamsRequestWrapper(request)

      // then
      expect(filtered.getParameterNames()).toHaveLength(0)
    })
  })

  describe('ParameterValue', () => {
    it('given parameters with and without brackets when getting parameter value then both values are joined to string', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param', 'a')
      request.setParameter('param[]', 'b')

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const value = filtered.getParameter('param')
      const valueBracket = filtered.getParameter('param[]')

      // then
      expect(value).toEqual(valueBracket)
      expect(value).toEqual('a,b')
    })

    it('given parameters with brackets when getting parameter value single value is returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param[]', 'b')

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const value = filtered.getParameter('param')
      const valueBracket = filtered.getParameter('param[]')

      // then
      expect(value).toEqual(valueBracket)
      expect(value).toEqual('b')
    })

    it('given parameters without brackets when getting parameter value single value is returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param', 'b')

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const value = filtered.getParameter('param')
      const valueBracket = filtered.getParameter('param[]')

      // then
      expect(value).toEqual(valueBracket)
      expect(value).toEqual('b')
    })

    it('given empty parameters when getting parameter value then return null', () => {
      // given
      const request = new MockHttpServletRequest()

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const value = filtered.getParameter('param')

      // then
      expect(value).toBeNull()
    })
  })

  describe('ParameterValues', () => {
    it('given parameters with and without brackets when getting parameter values then both values are returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param[]', 'a')
      request.setParameter('param', 'b')

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const values = filtered.getParameterValues('param')
      const valuesBracket = filtered.getParameterValues('param[]')

      // then
      expect(values).toEqual(valuesBracket)
      expect(sorted(values)).toEqual(sorted(['a', 'b']))
    })

    it('given parameters with brackets when getting parameter values then value is returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param[]', 'a')

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const values = filtered.getParameterValues('param')
      const valuesBracket = filtered.getParameterValues('param[]')

      // then
      expect(values).toEqual(valuesBracket)
      expect(sorted(values)).toEqual(sorted(['a']))
    })

    it('given parameters without brackets when getting parameter values then value is returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param', 'a')

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const values = filtered.getParameterValues('param')
      const valuesBracket = filtered.getParameterValues('param[]')

      // then
      expect(values).toEqual(valuesBracket)
      expect(sorted(values)).toEqual(sorted(['a']))
    })

    it('given empty parameters when getting parameter values then return null', () => {
      // given
      const request = new MockHttpServletRequest()

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const values = filtered.getParameterValues('param')

      // then
      expect(values).toBeNull()
    })
  })

  describe('ParameterMap', () => {
    it('given parameters with and without brackets when getting parameter map then both values are returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param[]', 'a')
      request.setParameter('param', 'b')

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const map = filtered.getParameterMap()

      // then
      expect([...map.keys()]).toHaveLength(1)
      expect([...map.keys()]).toEqual(['param'])
      expect(sorted(map.get('param'))).toEqual(sorted(['a', 'b']))
    })

    it('given parameters with brackets when getting parameter map then key without bracket is returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param[]', 'a')

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const map = filtered.getParameterMap()

      // then
      expect([...map.keys()]).toHaveLength(1)
      expect([...map.keys()]).toEqual(['param'])
      expect(sorted(map.get('param'))).toEqual(sorted(['a']))
    })

    it('given parameters without brackets when getting parameter map then key without bracket is returned', () => {
      // given
      const request = new MockHttpServletRequest()
      request.setParameter('param', 'a')

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const map = filtered.getParameterMap()

      // then
      expect([...map.keys()]).toHaveLength(1)
      expect([...map.keys()]).toEqual(['param'])
      expect(sorted(map.get('param'))).toEqual(sorted(['a']))
    })

    it('given empty parameters when getting parameter map then empty map is returned', () => {
      // given
      const request = new MockHttpServletRequest()

      // when
      const filtered = new BracketParamsRequestWrapper(request)
      const map = filtered.getParameterMap()

      // then
      expect(map.size).toBe(0)
    })
  })
})
