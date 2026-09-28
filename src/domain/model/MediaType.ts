// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/MediaType.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../port/kotlin.js'
import { MediaProfile } from './MediaProfile.js'

export class MediaType extends KEnum {
  static readonly ZIP = new MediaType('ZIP', 'application/zip', MediaProfile.DIVINA, 'cbz', 'application/vnd.comicbook+zip')
  static readonly RAR_GENERIC = new MediaType('RAR_GENERIC', 'application/x-rar-compressed', MediaProfile.DIVINA, 'cbr', 'application/vnd.comicbook-rar')
  static readonly RAR_4 = new MediaType('RAR_4', 'application/x-rar-compressed; version=4', MediaProfile.DIVINA, 'cbr', 'application/vnd.comicbook-rar')
  static readonly RAR_5 = new MediaType('RAR_5', 'application/x-rar-compressed; version=5', MediaProfile.DIVINA, 'cbr', 'application/vnd.comicbook-rar')
  static readonly EPUB = new MediaType('EPUB', 'application/epub+zip', MediaProfile.EPUB, 'epub')
  static readonly PDF = new MediaType('PDF', 'application/pdf', MediaProfile.PDF, 'pdf')

  private constructor(
    name: string,
    readonly type: string,
    readonly profile: MediaProfile,
    readonly fileExtension: string,
    readonly exportType: string = type,
  ) {
    super(name)
  }

  static fromMediaType(mediaType: string | null | undefined): MediaType | null {
    return MediaType.entries().find((it) => it.type === mediaType) ?? null
  }

  static matchingMediaProfile(mediaProfile: MediaProfile): MediaType[] {
    return MediaType.entries().filter((it) => it.profile === mediaProfile)
  }
}
