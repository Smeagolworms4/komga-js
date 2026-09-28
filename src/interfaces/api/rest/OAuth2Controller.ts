// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/OAuth2Controller.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'
import { InMemoryClientRegistrationRepository } from '../../../port/spring-security-oauth2.js'
import { MediaType, restController } from '../../../port/spring-web.js'

// @RestController
// @RequestMapping("api/v1/oauth2", produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.OAUTH2)
// @SecurityRequirements
export class OAuth2Controller {
  readonly registrationIds: OAuth2ClientDto[]

  constructor(clientRegistrationRepository: InMemoryClientRegistrationRepository | null) {
    this.registrationIds = clientRegistrationRepository?.map((it) => new OAuth2ClientDto({ name: it.clientName, registrationId: it.registrationId })) ?? []
  }

  // @GetMapping("providers")
  // @Operation(summary = "List registered OAuth2 providers")
  getOAuth2Providers(): OAuth2ClientDto[] {
    return this.registrationIds
  }
}

type OAuth2ClientDtoParams = {
  name: string
  registrationId: string
}

export class OAuth2ClientDto extends DataClass<OAuth2ClientDtoParams> {
  readonly name: string
  readonly registrationId: string

  constructor({ name, registrationId }: OAuth2ClientDtoParams) {
    super()
    this.name = name
    this.registrationId = registrationId
  }
}

jsonProperties(OAuth2ClientDto, { name: 'String', registrationId: 'String' }, [], { required: ['name', 'registrationId'] })

restController(OAuth2Controller, {
  inject: [{ optional: InMemoryClientRegistrationRepository }],
  javaName: 'org.gotson.komga.interfaces.api.rest.OAuth2Controller',
  requestMapping: { path: ['api/v1/oauth2'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.OAUTH2], securityRequirements: true },
  handlers: {
    getOAuth2Providers: {
      mapping: { method: 'GET', path: ['providers'] },
      returns: { list: { class: OAuth2ClientDto } },
      openapi: { operation: { summary: 'List registered OAuth2 providers' } },
    },
  },
})
