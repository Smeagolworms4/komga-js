// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/PageHashMatchDtoOracleTest.kt
import { PageHashMatch } from '../../../../../../src/domain/model/PageHashMatch.js'
import { toDto } from '../../../../../../src/interfaces/api/rest/dto/PageHashMatchDto.js'
import { URL } from '../../../../../../src/port/java-net.js'
import { oracle } from '../../../../oracle.js'
import { json } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/PageHashMatchDto')

const m = (bookId: string, url: string, pageNumber: number, fileName: string, fileSize: number, mediaType: string) =>
  new PageHashMatch({ bookId, url: new URL(url), pageNumber, fileName, fileSize, mediaType })

func('toDto', () => {
  kase('simple', () => toDto(m('B1', 'file:/lib/series/book.cbz', 3, 'p3.jpg', 1000, 'image/jpeg')))
  kase('encoded url', () => toDto(m('B1', 'file:/lib/my%20series/%C3%A9.cbz', 1, '', 0, '')))
  kase('json', () => json(toDto(m('B1', 'file:/a/b.cbz', 1, 'x.png', 5, 'image/png'))))
})
