// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/mvc/IndexControllerOracleTest.kt
import { IndexController } from '../../../../src/interfaces/mvc/IndexController.js'
import { ServletContext } from '../../../../src/port/spring-boot-web.js'
import { Model } from '../../../../src/port/spring-web-dispatcher.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('interfaces/mvc/IndexController')

const controller = (contextPath: string) => new IndexController(new ServletContext(contextPath))

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
  func('indexNext', () => {
    kase(name, () => {
      const model = new Model()
      return [controller(path).indexNext(model), model.getAttribute('baseUrl'), model.attributes.size]
    })
  })
}
