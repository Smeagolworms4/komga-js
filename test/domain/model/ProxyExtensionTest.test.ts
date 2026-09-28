// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/ProxyExtensionTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { Media } from '../../../src/domain/model/Media.js'
import { MediaExtension, MediaExtensionEpub, ProxyExtension } from '../../../src/domain/model/MediaExtension.js'
import { qualifiedNameOf } from '../../../src/port/jackson.js'
import { nn } from '../../../src/port/kotlin.js'

describe('ProxyExtensionTest', () => {
  it('when creating proxy of MediaExtension class then it is created', () => {
    const proxy = ProxyExtension.of(qualifiedNameOf(MediaExtensionEpub))

    expect(proxy).not.toBeNull()
  })

  it('when creating proxy of MediaExtension interface then it is null', () => {
    const proxy = ProxyExtension.of(qualifiedNameOf(MediaExtension))

    expect(proxy).toBeNull()
  })

  it('given proxy extension of class when checking against the class type then it returns true', () => {
    const proxy = nn(ProxyExtension.of(qualifiedNameOf(MediaExtensionEpub)))

    // PORT: proxyForType<T>() et proxyForType(T::class) ont la même forme en TS
    expect(proxy.proxyForType(MediaExtensionEpub)).toBe(true)
    expect(proxy.proxyForType(MediaExtension)).toBe(false)
    expect(proxy.proxyForType(Media)).toBe(false)

    expect(proxy.proxyForType(MediaExtensionEpub)).toBe(true)
    expect(proxy.proxyForType(MediaExtension)).toBe(false)
    expect(proxy.proxyForType(Media)).toBe(false)
  })
})
