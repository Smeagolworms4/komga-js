// @port-of komga/src/test/kotlin/org/gotson/komga/Utils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Book } from '../src/domain/model/Book.js'
import { ScanResult } from '../src/domain/model/ScanResult.js'
import type { Series } from '../src/domain/model/Series.js'

export function toScanResult(self: Map<Series, Book[]>): ScanResult {
  return new ScanResult({ series: self, sidecars: [] })
}
