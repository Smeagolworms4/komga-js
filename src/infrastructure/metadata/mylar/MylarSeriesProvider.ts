// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/mylar/MylarSeriesProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Library } from '../../../domain/model/Library.js'
import { MetadataPatchTarget } from '../../../domain/model/MetadataPatchTarget.js'
import type { Series } from '../../../domain/model/Series.js'
import { SeriesMetadata } from '../../../domain/model/SeriesMetadata.js'
import { SeriesMetadataPatch } from '../../../domain/model/SeriesMetadataPatch.js'
import { Sidecar } from '../../../domain/model/Sidecar.js'
import { ObjectMapper } from '../../../port/jackson-mapper.js'
import { str } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { component } from '../../../port/spring.js'
import { SidecarSeriesConsumer } from '../../sidecar/SidecarSeriesConsumer.js'
import { SeriesMetadataProvider } from '../SeriesMetadataProvider.js'
import { Status } from './dto/Status.js'
import { Series as MylarSeries } from './dto/Series.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.metadata.mylar.MylarSeriesProvider')

const SERIES_JSON = 'series.json'

export class MylarSeriesProvider implements SeriesMetadataProvider, SidecarSeriesConsumer {
  constructor(private readonly mapper: ObjectMapper) {}

  getSeriesMetadata(series: Series): SeriesMetadataPatch | null {
    if (series.oneshot) {
      logger.debug(() => 'Disabled for oneshot series, skipping')
      return null
    }

    try {
      const seriesJsonPath = join(series.path, SERIES_JSON)
      if (!existsSync(seriesJsonPath)) {
        logger.debug(() => `Series folder does not contain any ${SERIES_JSON} file: ${str(series)}`)
        return null
      }
      // PORT: mapper.readValue(File, Class) -> lecture du fichier puis readValue(bytes)
      const metadata = this.mapper.readValue<MylarSeries>(readFileSync(seriesJsonPath), { class: MylarSeries }).metadata

      const title = metadata.volume === null || metadata.volume === 1 ? metadata.name : `${metadata.name} (${metadata.year})`

      let status: SeriesMetadata.Status
      switch (metadata.status) {
        case Status.Ended:
          status = SeriesMetadata.Status.ENDED
          break
        case Status.Continuing:
          status = SeriesMetadata.Status.ONGOING
          break
        default:
          throw new Error(`Unknown status ${str(metadata.status)}`)
      }

      return new SeriesMetadataPatch({
        title: title,
        titleSort: title,
        status: status,
        summary: metadata.descriptionFormatted ?? metadata.descriptionText,
        readingDirection: null,
        publisher: metadata.publisher,
        ageRating: metadata.ageRating?.ageRating ?? null,
        language: null,
        genres: null,
        totalBookCount: metadata.totalIssues,
        collections: new Set(),
      })
    } catch (e) {
      logger.error(e as Error, () => `Error while retrieving metadata from ${SERIES_JSON}`)
      return null
    }
  }

  shouldLibraryHandlePatch(library: Library, target: MetadataPatchTarget): boolean {
    switch (target) {
      case MetadataPatchTarget.SERIES:
        return library.importMylarSeries
      default:
        return false
    }
  }

  getSidecarSeriesType(): Sidecar.Type {
    return Sidecar.Type.METADATA
  }

  getSidecarSeriesFilenames(): string[] {
    return [SERIES_JSON]
  }
}

// @Service
component(MylarSeriesProvider, { inject: [ObjectMapper], types: [SeriesMetadataProvider, SidecarSeriesConsumer] })
