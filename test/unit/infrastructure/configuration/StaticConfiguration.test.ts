// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/configuration/StaticConfigurationOracleTest.kt
import { StaticConfiguration } from '../../../../src/infrastructure/configuration/StaticConfiguration.js'
import { kFloat } from '../../../../src/port/kotlin.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/configuration/StaticConfiguration')

const c = new StaticConfiguration()
func('thumbnailType', () => {
  kase('value', () => c.thumbnailType())
  kase('media type', () => [c.thumbnailType().mediaType, c.thumbnailType().imageIOFormat])
})
func('pdfImageType', () => {
  kase('value', () => c.pdfImageType())
  kase('same as thumbnail type', () => c.pdfImageType() === c.thumbnailType())
})
func('pdfResolution', () => {
  kase('value', () => kFloat(c.pdfResolution()))
})
