// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/mvc/IndexControllerOracleTest.kt
import { KomgaSettingsProvider } from '../../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { IndexController } from '../../../../src/interfaces/mvc/IndexController.js'
import { ServletContext } from '../../../../src/port/spring-boot-web.js'
import { ApplicationEventPublisher } from '../../../../src/port/spring.js'
import { Model } from '../../../../src/port/spring-web-dispatcher.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('interfaces/mvc/IndexController')

const db = new OracleDb()
class Publisher extends ApplicationEventPublisher {
  publishEvent(): void {}
}
const provider = new KomgaSettingsProvider(db.serverSettingsDao, new Publisher())

const controller = (contextPath: string) => new IndexController(new ServletContext(contextPath), provider)

for (const [path, name] of [
  ['', 'root'],
  ['/komga', 'context path'],
  ['/a/b', 'nested context path'],
] as const) {
  func('index', () => {
    kase(name, () => {
      const model = new Model()
      return [controller(path).index(model), model.getAttribute('baseUrl'), model.attributes.size]
    })
  })
  func('indexClassic', () => {
    kase(name, () => {
      const model = new Model()
      return [controller(path).indexClassic(model), model.getAttribute('baseUrl'), model.attributes.size]
    })
  })
  func('indexNext', () => {
    kase(name, () => {
      const model = new Model()
      return [controller(path).indexNext(model), model.getAttribute('baseUrl'), model.attributes.size]
    })
  })
}
func('index', () => {
  kase('next ui as default', () => {
    provider.nextUiAsDefault = true
    const model = new Model()
    const result = [controller('/komga').index(model), model.getAttribute('baseUrl'), model.attributes.size, controller('').indexClassic(new Model())]
    provider.nextUiAsDefault = false
    return result
  })
})
