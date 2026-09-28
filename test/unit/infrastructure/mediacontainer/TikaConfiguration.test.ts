// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/TikaConfigurationOracleTest.kt
import { TikaConfiguration } from '../../../../src/infrastructure/mediacontainer/TikaConfiguration.js'
import { ByteArrayInputStream } from '../../../../src/port/java-io.js'
import { Metadata } from '../../../../src/port/tika.js'
import { oracle } from '../../oracle.js'
import { t, zipBytes } from './oracleZip.js'

const { func, kase } = oracle('infrastructure/mediacontainer/TikaConfiguration')

func('tika', () => {
  kase('detector on zip bytes', () => new TikaConfiguration().tika().detector.detect(new ByteArrayInputStream(zipBytes([t('a', 'b')])), new Metadata()).toString())
  kase('detector on empty stream', () => new TikaConfiguration().tika().detector.detect(new ByteArrayInputStream(new Uint8Array(0)), new Metadata()).toString())
  kase('mime repository extension of image/png', () => new TikaConfiguration().tika().mimeRepository.forName('image/png').getExtension())
  kase('mime repository extensions of image/jpeg', () => new TikaConfiguration().tika().mimeRepository.forName('image/jpeg').getExtensions())
  kase('two instances are distinct', () => new TikaConfiguration().tika() !== new TikaConfiguration().tika())
})
