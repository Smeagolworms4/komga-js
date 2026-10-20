// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/mvc/IndexController.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { KomgaSettingsProvider } from '../../infrastructure/configuration/KomgaSettingsProvider.js'
import { ServletContext } from '../../port/spring-boot-web.js'
import { modelArg, restController } from '../../port/spring-web.js'
import type { Model } from '../../port/spring-web-dispatcher.js'

export class IndexController {
  private readonly baseUrl: string

  constructor(
    servletContext: ServletContext,
    readonly komgaSettingsProvider: KomgaSettingsProvider,
  ) {
    this.baseUrl = `${servletContext.contextPath}/`
  }

  index(model: Model): string {
    model.addAttribute('baseUrl', this.baseUrl)

    return this.komgaSettingsProvider.nextUiAsDefault ? 'index-next' : 'index'
  }

  indexClassic(model: Model): string {
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
  inject: [ServletContext, KomgaSettingsProvider],
  rest: false,
  javaName: 'org.gotson.komga.interfaces.mvc.IndexController',
  handlers: {
    index: { mapping: { method: 'GET', path: ['/'] }, args: [modelArg()] },
    indexClassic: { mapping: { method: 'GET', path: ['/classic', '/classic/**'] }, args: [modelArg()] },
    indexNext: { mapping: { method: 'GET', path: ['/next', '/next/**'] }, args: [modelArg()] },
  },
})
