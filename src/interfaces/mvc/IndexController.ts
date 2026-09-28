// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/mvc/IndexController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ServletContext } from '../../port/spring-boot-web.js'
import { modelArg, restController } from '../../port/spring-web.js'
import type { Model } from '../../port/spring-web-dispatcher.js'

export class IndexController {
  private readonly baseUrl: string

  constructor(servletContext: ServletContext) {
    this.baseUrl = `${servletContext.contextPath}/`
  }

  index(model: Model): string {
    model.addAttribute('baseUrl', this.baseUrl)
    return 'index'
  }

  indexNext(model: Model): string {
    model.addAttribute('baseUrl', this.baseUrl)
    return 'index-next'
  }
}

// @Controller
restController(IndexController, {
  inject: [ServletContext],
  rest: false,
  javaName: 'org.gotson.komga.interfaces.mvc.IndexController',
  handlers: {
    index: { mapping: { method: 'GET', path: ['/'] }, args: [modelArg()] },
    indexNext: { mapping: { method: 'GET', path: ['/next'] }, args: [modelArg()] },
  },
})
