// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/ContentDetector.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { basename } from 'node:path'
import { ByteArrayInputStream, InputStream, use } from '../../port/java-io.js'
import { component } from '../../port/spring.js'
import { Metadata, TikaConfig, TikaInputStream } from '../../port/tika.js'

export class ContentDetector {
  constructor(private readonly tika: TikaConfig) {}

  // PORT: surcharges detectMediaType(path: Path) / detectMediaType(stream: InputStream) fusionnées (Path = string) ;
  // un ByteArray est aussi accepté (équivaut à `bytes.inputStream()`)
  detectMediaType(pathOrStream: string | InputStream | Uint8Array): string {
    if (typeof pathOrStream === 'string') {
      const path = pathOrStream
      const metadata = new Metadata()
      metadata.set(Metadata.TIKA_MIME_FILE, basename(path))

      return use(TikaInputStream.get(path), (it) => {
        const mediaType = this.tika.detector.detect(it, metadata)
        return mediaType.toString()
      })
    }
    /**
     * Detects the media type of the content of the stream.
     * The stream will not be closed.
     */
    const stream = pathOrStream instanceof Uint8Array ? new ByteArrayInputStream(pathOrStream) : pathOrStream
    return this.tika.detector.detect(stream, new Metadata()).toString()
  }

  isImage(mediaType: string): boolean {
    return mediaType.startsWith('image/')
  }

  mediaTypeToExtension(mediaType: string): string | null {
    try {
      return this.tika.mimeRepository.forName(mediaType).getExtension()
    } catch {
      return null
    }
  }
}

// @Service
component(ContentDetector, { inject: [TikaConfig] })
