// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/WebLinkDtoOracleTest.kt
import { WebLink } from '../../../../../../src/domain/model/WebLink.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/WebLinkDto.js'
import { URI } from '../../../../../../src/port/java-net.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/WebLinkDto')

func('toDto', () => {
  kase('https', () => toDto(new WebLink({ label: 'site', url: new URI('https://example.org/a?b=c#d') })))
  kase('encoded', () => toDto(new WebLink({ label: 'enc', url: new URI('https://example.org/a%20b/%C3%A9') })))
  kase('relative', () => toDto(new WebLink({ label: '', url: new URI('relative/path') })))
  kase('json', () => json(toDto(new WebLink({ label: 'x', url: new URI('http://h/') }))))
})
