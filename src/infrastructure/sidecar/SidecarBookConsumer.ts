// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/sidecar/SidecarBookConsumer.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Sidecar } from '../../domain/model/Sidecar.js'

// PORT: interface Kotlin -> classe abstraite (jeton d'injection de List<SidecarBookConsumer>) ;
// les implémentations la déclarent avec `implements` et `types: [SidecarBookConsumer]`
export abstract class SidecarBookConsumer {
  abstract getSidecarBookType(): Sidecar.Type

  abstract getSidecarBookPrefilter(): RegExp[]

  abstract isSidecarBookMatch(basename: string, sidecar: string): boolean
}
