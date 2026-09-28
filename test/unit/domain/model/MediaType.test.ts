// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/MediaTypeOracleTest.kt
import { MediaProfile } from '../../../../src/domain/model/MediaProfile.js'
import { MediaType } from '../../../../src/domain/model/MediaType.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/MediaType')

func('entries', () => {
  kase('properties', () => MediaType.entries().map((it) => [it, it.ordinal, it.type, it.profile, it.fileExtension, it.exportType]))
})

func('fromMediaType', () => {
  kase('null', () => MediaType.fromMediaType(null))
  for (const t of MediaType.entries()) kase(t.type, () => MediaType.fromMediaType(t.type))
  // prettier-ignore
  for (const t of ['', 'application/ZIP', 'application/vnd.comicbook+zip', 'application/x-rar-compressed;version=4', 'application/x-rar-compressed; version=6', 'image/jpeg', ' application/pdf']) {
    kase(`unknown '${t}'`, () => MediaType.fromMediaType(t))
  }
})

func('matchingMediaProfile', () => {
  for (const p of MediaProfile.entries()) kase(p.name, () => MediaType.matchingMediaProfile(p))
})
