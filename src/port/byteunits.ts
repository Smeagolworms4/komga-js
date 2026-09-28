// Support de portage : com.jakewharton.byteunits.BinaryByteUnit (bibliothèque byteunits 0.9.1), sans jumeau Kotlin.
import { IllegalArgumentException } from './kotlin.js'

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']

/**
 * `new DecimalFormat("#,##0.#")` : séparateurs de la locale par défaut de la JVM (`Locale.getDefault(FORMAT)`),
 * arrondi HALF_EVEN. PORT: la locale par défaut de Node (Intl) remplace celle de la JVM.
 */
function decimalFormat(value: number, locale: string | undefined): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 0, useGrouping: true, roundingMode: 'halfEven' }).format(value)
}

export const BinaryByteUnit = {
  /** `BinaryByteUnit.format(long bytes)` ; `locale` : PORT: pour les tests (locale par défaut sinon) */
  format(bytes: number, locale?: string): string {
    if (bytes < 0) throw new IllegalArgumentException(`bytes < 0: ${bytes}`)
    let unitIndex = 0
    let count = bytes
    while (count >= 1024 && unitIndex < UNITS.length - 1) {
      count /= 1024
      unitIndex += 1
    }
    return `${decimalFormat(count, locale)} ${UNITS[unitIndex]}`
  },
}
