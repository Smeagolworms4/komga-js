// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/R2Progression.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ZonedDateTime } from '@js-joda/core'
import { toUTCZoned } from '../../language/LanguageUtils.js'
import { DataClass } from '../../port/kotlin.js'
import { R2Device } from './R2Device.js'
import { R2Locator } from './R2Locator.js'
import type { ReadProgress } from './ReadProgress.js'

type R2ProgressionParams = {
  modified: ZonedDateTime
  device: R2Device
  locator: R2Locator
}

export class R2Progression extends DataClass<R2ProgressionParams> {
  readonly modified: ZonedDateTime
  readonly device: R2Device
  readonly locator: R2Locator

  constructor({ modified, device, locator }: R2ProgressionParams) {
    super()
    this.modified = modified
    this.device = device
    this.locator = locator
  }
}

export function toR2Progression(self: ReadProgress): R2Progression {
  return new R2Progression({
    modified: toUTCZoned(self.readDate),
    device: new R2Device({ id: self.deviceId, name: self.deviceName }),
    locator: self.locator ?? new R2Locator({ href: '', type: '' }),
  })
}
