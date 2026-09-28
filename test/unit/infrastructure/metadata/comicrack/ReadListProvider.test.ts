// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/comicrack/ReadListProviderOracleTest.kt
import { ReadListProvider } from '../../../../../src/infrastructure/metadata/comicrack/ReadListProvider.js'
import { oracle } from '../../../oracle.js'
import { xmlCases } from '../metadataSamples.js'

const { func, kase } = oracle('infrastructure/metadata/comicrack/ReadListProvider')

const provider = new ReadListProvider()

const cbl = (books: string) => Buffer.from(`<?xml version="1.0"?><ReadingList><Name>L</Name><Books>${books}</Books></ReadingList>`)

func('importFromCbl', () => {
  for (const [id, cls, content] of xmlCases) kase(`${cls} #${id}`, () => provider.importFromCbl(content))
  kase('empty', () => provider.importFromCbl(new Uint8Array(0)))
  kase('volume 1', () => provider.importFromCbl(cbl('<Book Series="S" Number="1" Volume="1"/>')))
  kase('volume 2', () => provider.importFromCbl(cbl('<Book Series="S" Number=" 2 " Volume="2"/>')))
  kase('blank series', () => provider.importFromCbl(cbl('<Book Series=" " Number="1"/>')))
  kase('missing number', () => provider.importFromCbl(cbl('<Book Series="S" Volume="3" Year="2000"><FileName>f.cbz</FileName></Book>')))
  kase('elements instead of attributes', () => provider.importFromCbl(cbl('<Book><Series>S</Series><Number>5</Number></Book>')))
  kase('duplicate books', () => provider.importFromCbl(cbl('<Book Series="S" Number="1"/><Book Series="S" Number="1"/>')))
})
