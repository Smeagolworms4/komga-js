// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/httpexchange/HttpExchangeConfigurationOracleTest.kt
import { HttpExchangeConfiguration } from '../../../../src/infrastructure/httpexchange/HttpExchangeConfiguration.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/httpexchange/HttpExchangeConfiguration')

const config = new HttpExchangeConfiguration()
func('httpExchangeRepository', () => {
  kase('type', () => config.httpExchangeRepository().constructor.name)
  kase('empty', () => config.httpExchangeRepository().findAll())
  kase('same instance', () => config.httpExchangeRepository() === config.httpExchangeRepository())
  kase('new configuration, new repository', () => new HttpExchangeConfiguration().httpExchangeRepository() === config.httpExchangeRepository())
})
