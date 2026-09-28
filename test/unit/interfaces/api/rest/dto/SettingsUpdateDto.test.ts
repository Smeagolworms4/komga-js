// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/SettingsUpdateDtoOracleTest.kt
import { SettingsUpdateDto } from '../../../../../../src/interfaces/api/rest/dto/SettingsUpdateDto.js'
import { oracle } from '../../../../oracle.js'
import { read } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/SettingsUpdateDto')

const state = (src: string) => {
  const d = read<SettingsUpdateDto>(src, { class: SettingsUpdateDto })
  return [
    ...['serverPort', 'serverContextPath', 'koboPort', 'kepubifyPath', 'taskPoolSize'].map((it) => d.isSet(it)),
    ...[d.serverPort, d.serverContextPath, d.koboPort, d.kepubifyPath, d.taskPoolSize, d.thumbnailSize, d.rememberMeDurationDays],
  ]
}

func('isSet', () => {
  kase('empty body', () => state('{}'))
  kase('nulls', () => state('{"serverPort":null,"serverContextPath":null,"koboPort":null,"kepubifyPath":null,"taskPoolSize":null}'))
  kase('values', () =>
    state('{"serverPort":8080,"serverContextPath":"/k","koboPort":443,"kepubifyPath":"/bin/k","taskPoolSize":2,"thumbnailSize":"XLARGE","rememberMeDurationDays":30}'),
  )
  kase('setter', () => {
    const it = new SettingsUpdateDto()
    it.serverPort = 1
    return [it.isSet('serverPort'), it.isSet('koboPort')]
  })
})
