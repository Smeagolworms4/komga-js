// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/MediaExtensionOracleTest.kt
import { MediaExtension, MediaExtensionEpub, ProxyExtension } from '../../../../src/domain/model/MediaExtension.js'
import { R2Progression } from '../../../../src/domain/model/R2Progression.js'
import { exceptionType, oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/MediaExtension')

func('of', () => {
  kase('null', () => ProxyExtension.of(null))
  kase('epub extension', () => ProxyExtension.of('org.gotson.komga.domain.model.MediaExtensionEpub'))
  kase('proxy extension itself', () => ProxyExtension.of('org.gotson.komga.domain.model.ProxyExtension'))
  kase('interface', () => ProxyExtension.of('org.gotson.komga.domain.model.MediaExtension'))
  kase('komga class, not an extension', () => ProxyExtension.of('org.gotson.komga.domain.model.R2Progression'))
  kase('unknown class', () => ProxyExtension.of('org.gotson.komga.domain.model.Nope'))
  kase('empty', () => exceptionType(() => ProxyExtension.of('')))
  kase('simple name', () => exceptionType(() => ProxyExtension.of('MediaExtensionEpub')))
})
const epub = ProxyExtension.of('org.gotson.komga.domain.model.MediaExtensionEpub') as ProxyExtension
const proxy = ProxyExtension.of('org.gotson.komga.domain.model.ProxyExtension') as ProxyExtension
func('proxyForType@22', () => {
  kase('same type', () => epub.proxyForType(MediaExtensionEpub))
  kase('other type', () => epub.proxyForType(ProxyExtension))
  kase('interface', () => epub.proxyForType(MediaExtension))
  kase('proxy of proxy', () => proxy.proxyForType(ProxyExtension))
})
func('proxyForType@24', () => {
  kase('same type', () => epub.proxyForType(MediaExtensionEpub))
  kase('other type', () => epub.proxyForType(R2Progression))
  kase('interface', () => epub.proxyForType(MediaExtension))
  kase('proxy of proxy', () => proxy.proxyForType(ProxyExtension))
})
