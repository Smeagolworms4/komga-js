// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/MetadataProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Library } from '../../domain/model/Library.js'
import type { MetadataPatchTarget } from '../../domain/model/MetadataPatchTarget.js'

// PORT: interface Kotlin -> classe abstraite (jeton d'injection) ; les implémentations la déclarent avec `implements`
export abstract class MetadataProvider {
  abstract shouldLibraryHandlePatch(library: Library, target: MetadataPatchTarget): boolean
}
