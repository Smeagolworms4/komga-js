// Comportements de java.net.URL et Path.toUri() relevés sur Java 21 (jshell).
import { describe, expect, it } from 'vitest'
import { URL, pathToUrl, urlToPath } from '../../src/port/java-net.js'

describe('java-net', () => {
  it.each([
    ['/a b/é.cbz', 'file:/a%20b/%C3%A9.cbz'],
    ['/data/comics/x.cbz', 'file:/data/comics/x.cbz'],
    ['/a%b/#c?d[e]{f}|g^h`i\\j', 'file:/a%25b/%23c%3Fd%5Be%5D%7Bf%7D%7Cg%5Eh%60i%5Cj'],
    ['/日本/ö.cbz', 'file:/%E6%97%A5%E6%9C%AC/%C3%B6.cbz'],
    ['/tab\tx', 'file:/tab%09x'],
  ])('Path.toUri().toURL() of %s', (path, expected) => {
    expect(pathToUrl(path).toString()).toBe(expected)
    expect(urlToPath(pathToUrl(path))).toBe(path)
  })

  it('URL parsing and toString like java.net.URL', () => {
    expect(new URL('file://library').toString()).toBe('file://library')
    expect(new URL('file://library').host).toBe('library')
    expect(new URL('file:///a/b').toString()).toBe('file:/a/b')
    expect(new URL('FILE:/x').toString()).toBe('file:/x')
    expect(new URL('file:/x#frag').toString()).toBe('file:/x#frag')
    expect(new URL('file:/a/b').equals(new URL('file:///a/b'))).toBe(true)
    expect(() => urlToPath(new URL('file://library'))).toThrow('URI has an authority component')
  })
})
