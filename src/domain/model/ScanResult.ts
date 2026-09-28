// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ScanResult.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'
import type { Book } from './Book.js'
import type { Series } from './Series.js'
import type { Sidecar } from './Sidecar.js'

type ScanResultParams = {
  series: Map<Series, Book[]>
  sidecars: Sidecar[]
}

export class ScanResult extends DataClass<ScanResultParams> {
  readonly series: Map<Series, Book[]>
  readonly sidecars: Sidecar[]

  constructor({ series, sidecars }: ScanResultParams) {
    super()
    this.series = series
    this.sidecars = sidecars
  }
}
