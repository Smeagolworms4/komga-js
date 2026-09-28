// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/SettingsUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { Max, Pattern, Positive, constraints } from '../../../../port/validation.js'
import { ThumbnailSizeDto } from './ThumbnailSizeDto.js'

type SettingsUpdateDtoParams = {
  deleteEmptyCollections?: boolean | null
  deleteEmptyReadLists?: boolean | null
  rememberMeDurationDays?: number | null
  renewRememberMeKey?: boolean | null
  thumbnailSize?: ThumbnailSizeDto | null
  taskPoolSize?: number | null
  serverPort?: number | null
  serverContextPath?: string | null
  koboProxy?: boolean | null
  koboPort?: number | null
  kepubifyPath?: string | null
}

// PORT: classe Kotlin sans constructeur principal, dont Jackson affecte les propriétés présentes dans le JSON ;
// le constructeur reçoit ici les propriétés lues et les affecte (les setters observables marquent isSet)
export class SettingsUpdateDto {
  private readonly _isSet = new Map<string, boolean>()

  isSet(prop: string): boolean {
    return this._isSet.get(prop) ?? false
  }

  deleteEmptyCollections: boolean | null = null

  deleteEmptyReadLists: boolean | null = null

  rememberMeDurationDays: number | null = null

  renewRememberMeKey: boolean | null = null

  thumbnailSize: ThumbnailSizeDto | null = null

  taskPoolSize: number | null = null

  private _serverPort: number | null = null
  get serverPort(): number | null {
    return this._serverPort
  }
  set serverPort(value: number | null) {
    this._serverPort = value
    this._isSet.set('serverPort', true)
  }

  private _serverContextPath: string | null = null
  get serverContextPath(): string | null {
    return this._serverContextPath
  }
  set serverContextPath(value: string | null) {
    this._serverContextPath = value
    this._isSet.set('serverContextPath', true)
  }

  koboProxy: boolean | null = null

  private _koboPort: number | null = null
  get koboPort(): number | null {
    return this._koboPort
  }
  set koboPort(value: number | null) {
    this._koboPort = value
    this._isSet.set('koboPort', true)
  }

  /** @deprecated Will be removed in a future version */
  private _kepubifyPath: string | null = null
  get kepubifyPath(): string | null {
    return this._kepubifyPath
  }
  set kepubifyPath(value: string | null) {
    this._kepubifyPath = value
    this._isSet.set('kepubifyPath', true)
  }

  constructor(props: SettingsUpdateDtoParams = {}) {
    Object.assign(this, props)
  }
}

constraints(SettingsUpdateDto, {
  rememberMeDurationDays: [Positive()],
  taskPoolSize: [Positive()],
  serverPort: [Positive(), Max(65535)],
  serverContextPath: [Pattern({ regexp: '^/[\\w-/]*[a-zA-Z0-9]$' })],
  koboPort: [Positive(), Max(65535)],
})
jsonProperties(SettingsUpdateDto, {
  deleteEmptyCollections: { nullable: 'Boolean' },
  deleteEmptyReadLists: { nullable: 'Boolean' },
  rememberMeDurationDays: { nullable: 'Long' },
  renewRememberMeKey: { nullable: 'Boolean' },
  thumbnailSize: { nullable: { enum: ThumbnailSizeDto } },
  taskPoolSize: { nullable: 'Int' },
  serverPort: { nullable: 'Int' },
  serverContextPath: { nullable: 'String' },
  koboProxy: { nullable: 'Boolean' },
  koboPort: { nullable: 'Int' },
  kepubifyPath: { nullable: 'String' },
})
