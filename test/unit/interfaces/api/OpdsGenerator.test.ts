// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/OpdsGeneratorOracleTest.kt
import type { OpdsGenerator } from '../../../../src/interfaces/api/OpdsGenerator.js'
import { oracle } from '../../oracle.js'
import { webPubCases } from './webpub-cases.js'

const o = oracle('interfaces/api/OpdsGenerator')
const { func, kase } = o
const { generator, json, web, book, commonCases } = webPubCases(o, (s) => s.opdsGenerator)
const opds = () => generator() as OpdsGenerator

commonCases()

func('toOpdsPublicationDto', () => {
  for (const id of ['B1', 'B4', 'B5', 'B6']) kase(id, () => web(() => json(opds().toOpdsPublicationDto(book(id)))))
  kase('context path', () => web(() => json(opds().toOpdsPublicationDto(book('B2'))), '/komga'))
})

func('generateOpdsAuthDocument', () => {
  kase('document', () => web(() => json(opds().generateOpdsAuthDocument())))
  kase('context path', () => web(() => json(opds().generateOpdsAuthDocument()), '/k/sub'))
})
