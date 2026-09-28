// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/MediaProfile.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../port/kotlin.js'
import { registerClass } from '../../port/jackson.js'

export class MediaProfile extends KEnum {
  static readonly DIVINA = new MediaProfile('DIVINA')
  static readonly PDF = new MediaProfile('PDF')
  static readonly EPUB = new MediaProfile('EPUB')
}

registerClass('org.gotson.komga.domain.model.MediaProfile', MediaProfile as never)
