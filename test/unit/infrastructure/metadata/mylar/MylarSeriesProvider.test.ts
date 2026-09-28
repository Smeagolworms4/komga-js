// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/mylar/MylarSeriesProviderOracleTest.kt
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MetadataPatchTarget } from '../../../../../src/domain/model/MetadataPatchTarget.js'
import { Series } from '../../../../../src/domain/model/Series.js'
import { MylarSeriesProvider } from '../../../../../src/infrastructure/metadata/mylar/MylarSeriesProvider.js'
import { ObjectMapper } from '../../../../../src/port/jackson-mapper.js'
import { pathToUrl } from '../../../../../src/port/java-net.js'
import { oracle, tempDir } from '../../../oracle.js'
import { date, libraries, mylarCases } from '../metadataSamples.js'

const { func, kase } = oracle('infrastructure/metadata/mylar/MylarSeriesProvider')

// PORT: l'ObjectMapper porté a la configuration de Spring Boot et de Komga
const provider = new MylarSeriesProvider(new ObjectMapper())

const series = (dir: string, oneshot = false) => new Series({ name: 'series', url: pathToUrl(dir), fileLastModified: date, id: 'SERIES', oneshot, createdDate: date })

function dir(name: string): string {
  const d = join(tempDir(), name)
  mkdirSync(d, { recursive: true })
  return d
}

func('getSeriesMetadata', () => {
  mylarCases.forEach((json, i) => {
    kase(`#${i}`, () => {
      const d = dir(`mylar-${i}`)
      writeFileSync(join(d, 'series.json'), json)
      return provider.getSeriesMetadata(series(d))
    })
  })
  kase('oneshot', () => {
    const d = dir('mylar-oneshot')
    writeFileSync(join(d, 'series.json'), mylarCases[0]!)
    return provider.getSeriesMetadata(series(d, true))
  })
  kase('no series.json', () => provider.getSeriesMetadata(series(dir('mylar-none'))))
  kase('series.json is a directory', () => {
    const d = dir('mylar-dir')
    mkdirSync(join(d, 'series.json'), { recursive: true })
    return provider.getSeriesMetadata(series(d))
  })
  kase('missing series directory', () => provider.getSeriesMetadata(series(join(tempDir(), 'mylar-missing'))))
})

func('shouldLibraryHandlePatch', () => {
  for (const [name, library] of libraries) {
    for (const target of MetadataPatchTarget.entries()) kase(`${name}, ${target}`, () => provider.shouldLibraryHandlePatch(library, target))
  }
})

func('getSidecarSeriesType', () => {
  kase('type', () => provider.getSidecarSeriesType())
})

func('getSidecarSeriesFilenames', () => {
  kase('names', () => provider.getSidecarSeriesFilenames())
})
