// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/MediaExtension.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { classForName, qualifiedNameOf, registerClass } from '../../port/jackson.js'
import { DataClass } from '../../port/kotlin.js'
import type { EpubTocEntry } from './EpubTocEntry.js'
import type { R2Locator } from './R2Locator.js'

// PORT: interface Kotlin représentée par une classe abstraite vide (sert aussi de MediaExtension::class) ;
// les implémentations s'enregistrent dans mediaExtensionClasses pour reproduire isSubclassOf(MediaExtension::class)
export abstract class MediaExtension {}
const mediaExtensionClasses = new Set<object>()
const MEDIA_EXTENSION_QUALIFIED_NAME = 'org.gotson.komga.domain.model.MediaExtension'

export class ProxyExtension implements MediaExtension {
  private constructor(readonly extensionClassName: string) {}

  static of(extensionClass: string | null): ProxyExtension | null {
    if (extensionClass === null) return null
    const kClass = classForName(extensionClass)
    return qualifiedNameOf(kClass) !== MEDIA_EXTENSION_QUALIFIED_NAME && mediaExtensionClasses.has(kClass)
      ? new ProxyExtension(extensionClass)
      : null
  }

  // PORT: proxyForType<T>() et proxyForType(clazz) fusionnés (pas de reified en TS)
  proxyForType(clazz: object): boolean {
    return qualifiedNameOf(clazz) === this.extensionClassName
  }
}

type MediaExtensionEpubParams = {
  toc?: EpubTocEntry[]
  landmarks?: EpubTocEntry[]
  pageList?: EpubTocEntry[]
  isFixedLayout?: boolean
  positions?: R2Locator[]
}

export class MediaExtensionEpub extends DataClass<MediaExtensionEpubParams> implements MediaExtension {
  readonly toc: EpubTocEntry[]
  readonly landmarks: EpubTocEntry[]
  readonly pageList: EpubTocEntry[]
  readonly isFixedLayout: boolean
  readonly positions: R2Locator[]

  constructor({ toc = [], landmarks = [], pageList = [], isFixedLayout = false, positions = [] }: MediaExtensionEpubParams = {}) {
    super()
    this.toc = toc
    this.landmarks = landmarks
    this.pageList = pageList
    this.isFixedLayout = isFixedLayout
    this.positions = positions
  }
}

registerClass(MEDIA_EXTENSION_QUALIFIED_NAME, MediaExtension)
registerClass('org.gotson.komga.domain.model.ProxyExtension', ProxyExtension as never)
registerClass('org.gotson.komga.domain.model.MediaExtensionEpub', MediaExtensionEpub)
mediaExtensionClasses.add(ProxyExtension)
mediaExtensionClasses.add(MediaExtensionEpub)
