// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/WebPubGeneratorOracleTest.kt
import { oracle } from '../../oracle.js'
import { webPubCases } from './webpub-cases.js'

const o = oracle('interfaces/api/WebPubGenerator')
webPubCases(o, (s) => s.webPubGenerator).commonCases()
