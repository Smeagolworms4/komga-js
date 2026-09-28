// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/mvc/ResourceNotFoundControllerOracleTest.kt
import { ResourceNotFoundController } from '../../../../src/interfaces/mvc/ResourceNotFoundController.js'
import { oracle } from '../../oracle.js'
import { request } from '../../web-oracle.js'

const { func, kase } = oracle('interfaces/mvc/ResourceNotFoundController')

const controller = new ResourceNotFoundController()

func('notFound', () => {
  kase('apis', () => controller.apis)
  for (const uri of ['/', '/books/123', '/api', '/api/v1/unknown', '/API/v1/x', '/apiv2', '/opds/v1.2/x', '/OPDS', '/sse/v1/events', '/sSe', '/kobo/x', '/web/api', '/%61pi/x'])
    kase(uri, () => controller.notFound(request({ uri })))
})
