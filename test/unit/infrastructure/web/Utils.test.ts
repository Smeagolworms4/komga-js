// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/UtilsOracleTest.kt
import { filePathToUrl, getCurrentRequest, getMediaTypeOrDefault, setCachePrivate, toFilePath } from '../../../../src/infrastructure/web/Utils.js'
import { URL } from '../../../../src/port/java-net.js'
import { ResponseEntity } from '../../../../src/port/spring-web.js'
import { exceptionType, oracle, tempDir } from '../../oracle.js'
import { describeEntity, request, withRequest } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/web/Utils')

func('toFilePath', () => {
  kase('simple', () => toFilePath(new URL('file:/tmp/a/c.cbz')))
  kase('encoded space', () => toFilePath(new URL('file:/tmp/a%20b/c.cbz')))
  kase('triple slash', () => toFilePath(new URL('file:///data/b.cbz')))
  kase('encoded unicode', () => toFilePath(new URL('file:/data/%C3%BC%E6%BC%AB.cbz')))
  kase('raw unicode', () => toFilePath(new URL('file:/data/ü漫.cbz')))
  kase('trailing slash', () => toFilePath(new URL('file:/data/dir/')))
  kase('dot segments', () => toFilePath(new URL('file:/a/./b/../c')))
  kase('encoded percent and hash', () => toFilePath(new URL('file:/a/%25%23b')))
  kase('root', () => toFilePath(new URL('file:/')))
  kase('http scheme', () => exceptionType(() => toFilePath(new URL('http://host/a'))))
  kase('query', () => exceptionType(() => toFilePath(new URL('file:/a?b=c'))))
})

func('filePathToUrl', () => {
  kase('simple', () => filePathToUrl('/oracle-missing/a/c.cbz'))
  kase('space', () => filePathToUrl('/oracle-missing/a b/c d.cbz'))
  kase('unicode', () => filePathToUrl('/oracle-missing/ü漫画.cbz'))
  kase('special characters', () => filePathToUrl("/oracle-missing/#h%a[b]{c};d=e&f+g,h'i!j@k$.cbz"))
  kase('trailing slash on missing path', () => filePathToUrl('/oracle-missing/dir/'))
  kase('double slash', () => filePathToUrl('/oracle-missing//a'))
  kase('round trip', () => toFilePath(filePathToUrl('/oracle-missing/ü a#b/c%d.cbz')))
  kase('existing directory gets a trailing slash', () => filePathToUrl(tempDir()).toString().endsWith('/'))
})

func('setCachePrivate', () => {
  kase('ok', () => describeEntity(setCachePrivate(ResponseEntity.ok()).build()))
  kase('with body', () => describeEntity(setCachePrivate(ResponseEntity.status(201)).body('x')))
  kase('twice', () => describeEntity(setCachePrivate(setCachePrivate(ResponseEntity.ok())).build()))
})

func('getMediaTypeOrDefault', () => {
  for (const it of [
    null,
    'image/jpeg',
    'IMAGE/JPEG',
    'text/html;charset=utf-8',
    'text/html; charset="UTF-8"',
    'application/*+xml',
    '*/*',
    '*',
    '*/json',
    '',
    '  ',
    'invalid',
    'a/b/c',
    'application/vnd.comicbook+zip',
    'application/epub+zip; q=0.5',
    'text/plain;a',
    'text/plain;a=',
    'x/y; a=b; c=d',
    ' image/png ',
    'image/png;',
    'image/ png',
    'text/plain; charset=unknown-charset',
  ]) {
    kase(`${it}`, () => getMediaTypeOrDefault(it).toString())
  }
})

func('getCurrentRequest', () => {
  kase('no request', () => getCurrentRequest().requestURI)
  kase('bound request', () => withRequest(request({ uri: '/api/v1/books' }), () => getCurrentRequest().requestURI))
  kase('after the request', () => getCurrentRequest())
})
