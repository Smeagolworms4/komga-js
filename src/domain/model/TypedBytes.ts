// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/TypedBytes.kt@65981e600edb24944ffaae4818ff2716a5fa08dd

type TypedBytesParams = {
  bytes: Uint8Array
  mediaType: string
}

export class TypedBytes {
  readonly bytes: Uint8Array
  readonly mediaType: string

  constructor({ bytes, mediaType }: TypedBytesParams) {
    this.bytes = bytes
    this.mediaType = mediaType
  }
}
