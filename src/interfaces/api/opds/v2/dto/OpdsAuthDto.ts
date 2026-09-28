// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/v2/dto/OpdsAuthDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../../port/jackson.js'
import { jsonProperties } from '../../../../../port/jackson-mapper.js'
import { DataClass, KEnum } from '../../../../../port/kotlin.js'
import { WPLinkDto } from '../../../dto/WepPub.js'

type AuthenticationDocumentDtoParams = {
  authentication: AuthenticationFlowDto[]
  title: string
  id: string
  description?: string | null
  links?: WPLinkDto[]
}

/**
 * https://drafts.opds.io/authentication-for-opds-1.0.html#23-syntax
 */
export class AuthenticationDocumentDto extends DataClass<AuthenticationDocumentDtoParams> {
  /**
   * A list of supported Authentication Flows as defined in section 3. Authentication Flows.
   */
  readonly authentication: AuthenticationFlowDto[]
  /**
   * Title of the Catalog being accessed.
   */
  readonly title: string
  /**
   * Unique identifier for the Catalog provider and canonical location for the Authentication Document.
   */
  readonly id: string
  /**
   * A description of the service being displayed to the user.
   */
  readonly description: string | null
  /**
   * An Authentication Document may also contain a links object.
   * This is used to associate the Authentication Document with resources that are not locally available.
   */
  readonly links: WPLinkDto[]

  constructor({ authentication, title, id, description = null, links = [] }: AuthenticationDocumentDtoParams) {
    super()
    this.authentication = authentication
    this.title = title
    this.id = id
    this.description = description
    this.links = links
  }
}

type AuthenticationFlowDtoParams = {
  type: AuthenticationType
  labels?: LabelsDto | null
  links?: WPLinkDto[]
}

/**
 * In addition to the Authentication Document, this specification also defines multiple scenarios to handle how the client is authenticated.
 * Each Authentication Document contains at least one Authentication Object that describes how a client can leverage an Authentication Flow.
 */
export class AuthenticationFlowDto extends DataClass<AuthenticationFlowDtoParams> {
  readonly type: AuthenticationType
  readonly labels: LabelsDto | null
  readonly links: WPLinkDto[]

  constructor({ type, labels = null, links = [] }: AuthenticationFlowDtoParams) {
    super()
    this.type = type
    this.labels = labels
    this.links = links
  }
}

type LabelsDtoParams = {
  login?: string | null
  password?: string | null
}

export class LabelsDto extends DataClass<LabelsDtoParams> {
  readonly login: string | null
  readonly password: string | null

  constructor({ login = null, password = null }: LabelsDtoParams = {}) {
    super()
    this.login = login
    this.password = password
  }
}

export class AuthenticationType extends KEnum {
  static readonly BASIC = new AuthenticationType('BASIC', 'http://opds-spec.org/auth/basic')
  static readonly OAUTH2_IMPLICIT = new AuthenticationType('OAUTH2_IMPLICIT', 'http://opds-spec.org/auth/oauth/implicit')
  static readonly OAUTH2_PASSWORD = new AuthenticationType('OAUTH2_PASSWORD', 'http://opds-spec.org/auth/oauth/password')

  private constructor(
    name: string,
    // @get:JsonValue
    readonly value: string,
  ) {
    super(name)
  }

  // PORT: @get:JsonValue
  override toJSON(): string {
    return this.value
  }
}

// @JsonInclude(JsonInclude.Include.NON_EMPTY)
json(AuthenticationDocumentDto, { include: 'NON_EMPTY' })
jsonProperties(AuthenticationDocumentDto, {
  authentication: { list: { class: AuthenticationFlowDto } },
  title: 'String',
  id: 'String',
  description: { nullable: 'String' },
  links: { list: { class: WPLinkDto } },
})
// @JsonInclude(JsonInclude.Include.NON_EMPTY)
json(AuthenticationFlowDto, { include: 'NON_EMPTY' })
jsonProperties(AuthenticationFlowDto, {
  type: { enum: AuthenticationType },
  labels: { nullable: { class: LabelsDto } },
  links: { list: { class: WPLinkDto } },
})
// @JsonInclude(JsonInclude.Include.NON_NULL)
json(LabelsDto, { include: 'NON_NULL' })
jsonProperties(LabelsDto, { login: { nullable: 'String' }, password: { nullable: 'String' } })
