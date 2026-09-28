// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ScanIntervalDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Library } from '../../../../domain/model/Library.js'
import { KEnum } from '../../../../port/kotlin.js'

export class ScanIntervalDto extends KEnum {
  static readonly DISABLED = new ScanIntervalDto('DISABLED')
  static readonly HOURLY = new ScanIntervalDto('HOURLY')
  static readonly EVERY_6H = new ScanIntervalDto('EVERY_6H')
  static readonly EVERY_12H = new ScanIntervalDto('EVERY_12H')
  static readonly DAILY = new ScanIntervalDto('DAILY')
  static readonly WEEKLY = new ScanIntervalDto('WEEKLY')
}

export function toDto(self: Library.ScanInterval): ScanIntervalDto {
  switch (self) {
    case Library.ScanInterval.DISABLED:
      return ScanIntervalDto.DISABLED
    case Library.ScanInterval.HOURLY:
      return ScanIntervalDto.HOURLY
    case Library.ScanInterval.EVERY_6H:
      return ScanIntervalDto.EVERY_6H
    case Library.ScanInterval.EVERY_12H:
      return ScanIntervalDto.EVERY_12H
    case Library.ScanInterval.DAILY:
      return ScanIntervalDto.DAILY
    case Library.ScanInterval.WEEKLY:
      return ScanIntervalDto.WEEKLY
  }
  // PORT: when exhaustif
  throw new Error(`Unknown ${self}`)
}

export function toDomain(self: ScanIntervalDto): Library.ScanInterval {
  switch (self) {
    case ScanIntervalDto.DISABLED:
      return Library.ScanInterval.DISABLED
    case ScanIntervalDto.HOURLY:
      return Library.ScanInterval.HOURLY
    case ScanIntervalDto.EVERY_6H:
      return Library.ScanInterval.EVERY_6H
    case ScanIntervalDto.EVERY_12H:
      return Library.ScanInterval.EVERY_12H
    case ScanIntervalDto.DAILY:
      return Library.ScanInterval.DAILY
    case ScanIntervalDto.WEEKLY:
      return Library.ScanInterval.WEEKLY
  }
  // PORT: when exhaustif
  throw new Error(`Unknown ${self}`)
}
