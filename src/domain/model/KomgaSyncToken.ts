// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/KomgaSyncToken.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../port/jackson-mapper.js'
import { DataClass } from '../../port/kotlin.js'

type KomgaSyncTokenParams = {
  version?: number
  rawKoboSyncToken?: string
  ongoingSyncPointId?: string | null
  lastSuccessfulSyncPointId?: string | null
}

export class KomgaSyncToken extends DataClass<KomgaSyncTokenParams> {
  readonly version: number
  readonly rawKoboSyncToken: string
  /**
   * Only if a sync is currently ongoing, else null.
   */
  readonly ongoingSyncPointId: string | null
  /**
   * The last successful SyncPoint ID.
   */
  readonly lastSuccessfulSyncPointId: string | null

  constructor({
    version = 1,
    rawKoboSyncToken = '',
    ongoingSyncPointId = null,
    lastSuccessfulSyncPointId = null,
  }: KomgaSyncTokenParams = {}) {
    super()
    this.version = version
    this.rawKoboSyncToken = rawKoboSyncToken
    this.ongoingSyncPointId = ongoingSyncPointId
    this.lastSuccessfulSyncPointId = lastSuccessfulSyncPointId
  }
}

jsonProperties(KomgaSyncToken, { version: 'Int', rawKoboSyncToken: 'String', ongoingSyncPointId: { nullable: 'String' }, lastSuccessfulSyncPointId: { nullable: 'String' } })
