// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/sidecar/SidecarSeriesConsumer.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Sidecar } from '../../domain/model/Sidecar.js'

// PORT: interface Kotlin -> classe abstraite (jeton d'injection de List<SidecarSeriesConsumer>) ;
// les implémentations la déclarent avec `implements` et `types: [SidecarSeriesConsumer]`
export abstract class SidecarSeriesConsumer {
  abstract getSidecarSeriesType(): Sidecar.Type

  abstract getSidecarSeriesFilenames(): string[]
}
