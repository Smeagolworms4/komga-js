// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/openapi/OpenApiConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'
import { Environment, configuration } from '../../port/spring.js'
import { OperationCustomizer, PreAuthorize, operationCustomizer } from '../../port/springdoc.js'
import {
  ApiResponse,
  ApiResponses,
  Components,
  Content,
  Example,
  ExternalDocumentation,
  Info,
  License,
  MediaType,
  OpenAPI,
  Operation,
  PathItem,
  Schema,
  SecurityRequirement,
  SecurityScheme,
  Server,
  ServerVariable,
  ServerVariables,
  Tag,
} from '../../port/swagger-models.js'

export class OpenApiConfiguration {
  private readonly generateOpenApi: boolean

  constructor(
    private readonly appVersion: string,
    env: Environment,
  ) {
    this.generateOpenApi = env.activeProfiles.includes('generate-openapi')
  }

  openApi(): OpenAPI {
    const logoutOperation = new Operation()
      .tags([OpenApiConfiguration.TagNames.USER_SESSION])
      .summary('Logout')
      .description('Invalidates the current session and clean up any remember-me authentication.')
      .responses(new ApiResponses().addApiResponse('204', new ApiResponse().description('No Content')))

    const openApi = new OpenAPI()
      .info(
        new Info()
          .title('Komga API')
          .version(this.appVersion)
          .description(
            `Komga REST API.

## Reference

Check the API reference:
- on the [Komga website](https://komga.org/docs/openapi/komga-api)
- on any running Komga instance at \`/swagger-ui.html\`
- on [GitHub](https://raw.githubusercontent.com/gotson/komga/refs/heads/master/komga/docs/openapi.json)

## Authentication

Most endpoints require authentication. Authentication is done using either:
- Basic Authentication
- Passing an API Key in the \`X-API-Key\` header

## Sessions

Upon successful authentication, a session is created, and can be reused.

- By default, a \`KOMGA-SESSION\` cookie is set via \`Set-Cookie\` response header. This works well for browsers and clients that can handle cookies.
- If you specify a header \`X-Auth-Token\` during authentication, the session ID will be returned via this same header. You can then pass that header again for subsequent requests to reuse the session.

If you need to set the session cookie later on, you can call \`/api/v1/login/set-cookie\` with \`X-Auth-Token\`. The response will contain the \`Set-Cookie\` header.

## Remember Me

During authentication, if a request parameter \`remember-me\` is passed and set to \`true\`, the server will also return a \`komga-remember-me\` cookie. This cookie will be used to login automatically even if the session has expired.

## Logout

You can explicitly logout an existing session by calling \`/api/logout\`. This would return a \`204\`.

## Deprecation

API endpoints marked as deprecated will be removed in the next major version.`,
          )
          .license(new License().name('MIT').url('https://github.com/gotson/komga/blob/master/LICENSE')),
      )
      .externalDocs(new ExternalDocumentation().description('Komga documentation').url('https://komga.org'))
      .components(
        new Components()
          .addSecuritySchemes(OpenApiConfiguration.SecuritySchemes.BASIC_AUTH, new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme('basic'))
          .addSecuritySchemes(
            OpenApiConfiguration.SecuritySchemes.API_KEY,
            new SecurityScheme().type(SecurityScheme.Type.APIKEY).in(SecurityScheme.In.HEADER).name('X-API-Key'),
          ),
      )
      .security([
        new SecurityRequirement().addList(OpenApiConfiguration.SecuritySchemes.BASIC_AUTH),
        new SecurityRequirement().addList(OpenApiConfiguration.SecuritySchemes.API_KEY),
      ])
      .tags(this.tags)
      .extensions({ 'x-tagGroups': this.tagGroups })
    // PORT: .apply { if (generateOpenApi) servers(...) }
    if (this.generateOpenApi)
      openApi.servers([
        new Server().url('https://demo.komga.org').description('Demo server'),
        new Server()
          .url('http://localhost:{port}')
          .description('Local development server')
          .variables(new ServerVariables().addServerVariable('port', new ServerVariable().addEnumItem('8080').addEnumItem('25600')._default('25600'))),
      ])
    return openApi
      .path(
        '/api/logout',
        new PathItem().summary('Logout current session').get(logoutOperation.operationId('getLogout')).post(logoutOperation.operationId('postLogout')),
      )
      .path(
        '/actuator/info',
        new PathItem().summary('Get general information about the server').get(
          new Operation()
            .operationId('getActuatorInfo')
            .tags([OpenApiConfiguration.TagNames.MANAGEMENT])
            .description('Required role: **ADMIN**')
            .summary('Get server information')
            .responses(
              new ApiResponses().addApiResponse(
                '200',
                new ApiResponse().description('OK').content(
                  new Content().addMediaType(
                    'application/json',
                    new MediaType()
                      .schema(
                        // PORT: Schema<Map<String, Any>>().apply { type = "object"; additionalProperties = true } ;
                        // en OpenAPI 3.1, swagger-core ne sérialise pas `type` (champ 3.0, remplacé par `types`) : omis
                        new Schema().additionalProperties(true),
                      )
                      .addExamples(
                        'Example',
                        new Example().value(
                          //language=JSON
                          `{
  "git": {
    "branch": "master",
    "commit": {
      "id": "9be980d",
      "time": "2025-03-12T03:40:38Z"
    }
  },
  "build": {
    "artifact": "komga",
    "name": "komga",
    "version": "1.21.2",
    "group": "komga"
  },
  "java": {
    "version": "23.0.2",
    "vendor": {
      "name": "Eclipse Adoptium",
      "version": "Temurin-23.0.2+7"
    },
    "runtime": {
      "name": "OpenJDK Runtime Environment",
      "version": "23.0.2+7"
    },
    "jvm": {
      "name": "OpenJDK 64-Bit Server VM",
      "vendor": "Eclipse Adoptium",
      "version": "23.0.2+7"
    }
  },
  "os": {
    "name": "Linux",
    "version": "6.8.0-57-generic",
    "arch": "amd64"
  }
}`,
                        ),
                      ),
                  ),
                ),
              ),
            ),
        ),
      )
  }

  roleDescriptionCustomizer(): OperationCustomizer {
    const hasRoleRegex = /hasRole\('(?<role>\w+)'\)/g

    return operationCustomizer((operation, handlerMethod) => {
      const preAuthorize = handlerMethod.getMethodAnnotation(PreAuthorize) ?? handlerMethod.beanType.getAnnotation(PreAuthorize)
      if (preAuthorize !== null) {
        const roles = [...preAuthorize.value.matchAll(hasRoleRegex)].map((it) => it.groups?.role).filter((it) => it !== undefined)
        if (roles.length > 0) {
          const description = operation.getDescription() === null ? '' : `${operation.getDescription()}\n\n`
          operation.setDescription(`${description}Required role: **${roles.join(', ')}**`)
        }
      }
      return operation
    })
  }

  private readonly tagGroups = [
    new OpenApiConfiguration.TagGroup({
      name: 'Deprecation',
      tags: [OpenApiConfiguration.TagNames.DEPRECATED],
    }),
    new OpenApiConfiguration.TagGroup({
      name: 'Libraries',
      tags: [OpenApiConfiguration.TagNames.LIBRARIES],
    }),
    new OpenApiConfiguration.TagGroup({
      name: 'Series',
      tags: [OpenApiConfiguration.TagNames.SERIES, OpenApiConfiguration.TagNames.SERIES_POSTER],
    }),
    new OpenApiConfiguration.TagGroup({
      name: 'Books',
      tags: [
        OpenApiConfiguration.TagNames.BOOKS,
        OpenApiConfiguration.TagNames.BOOK_PAGES,
        OpenApiConfiguration.TagNames.BOOK_POSTER,
        OpenApiConfiguration.TagNames.BOOK_IMPORT,
        OpenApiConfiguration.TagNames.DUPLICATE_PAGES,
        OpenApiConfiguration.TagNames.BOOK_WEBPUB,
        OpenApiConfiguration.TagNames.BOOK_FONTS,
      ],
    }),
    new OpenApiConfiguration.TagGroup({
      name: 'Collections',
      tags: [OpenApiConfiguration.TagNames.COLLECTIONS, OpenApiConfiguration.TagNames.COLLECTION_SERIES, OpenApiConfiguration.TagNames.COLLECTION_POSTER],
    }),
    new OpenApiConfiguration.TagGroup({
      name: 'Readlists',
      tags: [OpenApiConfiguration.TagNames.READLISTS, OpenApiConfiguration.TagNames.READLIST_BOOKS, OpenApiConfiguration.TagNames.READLIST_POSTER],
    }),
    new OpenApiConfiguration.TagGroup({
      name: 'Referential',
      tags: [OpenApiConfiguration.TagNames.REFERENTIAL],
    }),
    new OpenApiConfiguration.TagGroup({
      name: 'Users',
      tags: [
        OpenApiConfiguration.TagNames.CURRENT_USER,
        OpenApiConfiguration.TagNames.USERS,
        OpenApiConfiguration.TagNames.API_KEYS,
        OpenApiConfiguration.TagNames.USER_SESSION,
        OpenApiConfiguration.TagNames.OAUTH2,
        OpenApiConfiguration.TagNames.SYNCPOINTS,
      ],
    }),
    new OpenApiConfiguration.TagGroup({
      name: 'Server',
      tags: [
        OpenApiConfiguration.TagNames.CLAIM,
        OpenApiConfiguration.TagNames.SERVER_SETTINGS,
        OpenApiConfiguration.TagNames.TASKS,
        OpenApiConfiguration.TagNames.HISTORY,
        OpenApiConfiguration.TagNames.FILE_SYSTEM,
        OpenApiConfiguration.TagNames.RELEASES,
        OpenApiConfiguration.TagNames.ANNOUNCEMENTS,
        OpenApiConfiguration.TagNames.MANAGEMENT,
      ],
    }),
    new OpenApiConfiguration.TagGroup({
      name: 'Integrations',
      tags: [OpenApiConfiguration.TagNames.CLIENT_SETTINGS, OpenApiConfiguration.TagNames.MIHON, OpenApiConfiguration.TagNames.COMICRACK],
    }),
  ]

  private readonly tags = [
    new Tag().name(OpenApiConfiguration.TagNames.DEPRECATED),
    new Tag().name(OpenApiConfiguration.TagNames.LIBRARIES).description('Manage libraries.'),
    new Tag().name(OpenApiConfiguration.TagNames.SERIES).description('Manage series.'),
    new Tag().name(OpenApiConfiguration.TagNames.SERIES_POSTER).description('Manage posters for series.'),
    new Tag().name(OpenApiConfiguration.TagNames.BOOKS).description('Manage books.'),
    new Tag().name(OpenApiConfiguration.TagNames.BOOK_POSTER).description('Manage posters for books.'),
    new Tag().name(OpenApiConfiguration.TagNames.BOOK_PAGES),
    new Tag().name(OpenApiConfiguration.TagNames.BOOK_WEBPUB),
    new Tag().name(OpenApiConfiguration.TagNames.BOOK_IMPORT),
    new Tag().name(OpenApiConfiguration.TagNames.BOOK_FONTS).description('Provide font files and CSS for the Epub Reader.'),
    new Tag().name(OpenApiConfiguration.TagNames.DUPLICATE_PAGES).description('Manage duplicate pages. Duplicate pages are identified by a page hash.'),
    new Tag().name(OpenApiConfiguration.TagNames.COLLECTIONS).description('Manage collections.'),
    new Tag().name(OpenApiConfiguration.TagNames.COLLECTION_POSTER).description('Manage posters for collections.'),
    new Tag().name(OpenApiConfiguration.TagNames.COLLECTION_SERIES),
    new Tag().name(OpenApiConfiguration.TagNames.READLISTS).description('Manage readlists.'),
    new Tag().name(OpenApiConfiguration.TagNames.READLIST_POSTER).description('Manage posters for readlists.'),
    new Tag().name(OpenApiConfiguration.TagNames.READLIST_BOOKS),
    new Tag().name(OpenApiConfiguration.TagNames.REFERENTIAL).description('Retrieve referential metadata from all items in the Komga server.'),
    new Tag().name(OpenApiConfiguration.TagNames.CURRENT_USER).description('Manage current user.'),
    new Tag().name(OpenApiConfiguration.TagNames.USERS).description('Manage users.'),
    new Tag().name(OpenApiConfiguration.TagNames.API_KEYS).description('Manage API Keys'),
    new Tag().name(OpenApiConfiguration.TagNames.USER_SESSION),
    new Tag().name(OpenApiConfiguration.TagNames.OAUTH2).description('List registered OAuth2 providers'),
    new Tag().name(OpenApiConfiguration.TagNames.SYNCPOINTS).description('Sync points are automatically created during a Kobo sync.'),
    new Tag().name(OpenApiConfiguration.TagNames.CLAIM).description('Claim a freshly installed Komga server.'),
    new Tag().name(OpenApiConfiguration.TagNames.TASKS).description('Manage server tasks'),
    new Tag().name(OpenApiConfiguration.TagNames.HISTORY).description('Server events history'),
    new Tag().name(OpenApiConfiguration.TagNames.FILE_SYSTEM).description("List files from the host server's file system"),
    new Tag().name(OpenApiConfiguration.TagNames.SERVER_SETTINGS).description('Store and retrieve server settings'),
    new Tag().name(OpenApiConfiguration.TagNames.RELEASES).description('Retrieve releases information'),
    new Tag().name(OpenApiConfiguration.TagNames.ANNOUNCEMENTS).description('Retrieve announcements from the Komga website'),
    new Tag().name(OpenApiConfiguration.TagNames.MANAGEMENT).description('Manage server'),
    new Tag().name(OpenApiConfiguration.TagNames.MIHON),
    new Tag().name(OpenApiConfiguration.TagNames.COMICRACK),
    new Tag()
      .name(OpenApiConfiguration.TagNames.CLIENT_SETTINGS)
      .description('Store and retrieve global and per-user settings. Those settings are not used by Komga itself, but can be stored for convenience by client applications.'),
  ]
}

type TagGroupParams = {
  name: string
  tags: string[]
}

export namespace OpenApiConfiguration {
  export class TagGroup extends DataClass<TagGroupParams> {
    readonly name: string
    readonly tags: string[]

    constructor({ name, tags }: TagGroupParams) {
      super()
      this.name = name
      this.tags = tags
    }

    // PORT: sérialisation Jackson de la data class (extension x-tagGroups)
    toJSON(): unknown {
      return { name: this.name, tags: this.tags }
    }
  }

  export const SecuritySchemes = {
    BASIC_AUTH: 'basicAuth',
    API_KEY: 'apiKey',
  } as const

  export const TagNames = {
    DEPRECATED: 'Deprecated',

    LIBRARIES: 'Libraries',
    SERIES: 'Series',

    SERIES_POSTER: 'Series Poster',
    BOOKS: 'Books',
    BOOK_POSTER: 'Book Poster',
    BOOK_PAGES: 'Book Pages',
    BOOK_WEBPUB: 'WebPub Manifest',
    BOOK_IMPORT: 'Import',
    BOOK_FONTS: 'Fonts',

    DUPLICATE_PAGES: 'Duplicate Pages',
    COLLECTIONS: 'Collections',
    COLLECTION_SERIES: 'Collection Series',

    COLLECTION_POSTER: 'Collection Poster',
    READLISTS: 'Readlists',
    READLIST_BOOKS: 'Readlist Books',

    READLIST_POSTER: 'Readlist Poster',

    REFERENTIAL: 'Referential metadata',
    CURRENT_USER: 'Current user',
    USERS: 'Users',
    API_KEYS: 'API Keys',
    USER_SESSION: 'User session',
    OAUTH2: 'OAuth2',

    SYNCPOINTS: 'Sync points',
    CLAIM: 'Claim',
    TASKS: 'Tasks',
    HISTORY: 'History',
    FILE_SYSTEM: 'File system',
    SERVER_SETTINGS: 'Server settings',
    RELEASES: 'Releases',
    MANAGEMENT: 'Management',

    ANNOUNCEMENTS: 'Announcements',
    MIHON: 'Mihon',
    COMICRACK: 'ComicRack',

    CLIENT_SETTINGS: 'Client settings',
  } as const
}

// @Configuration
configuration(OpenApiConfiguration, {
  // @param:Value($$"${application.version}") private val appVersion: String
  inject: [{ value: '${application.version}' }, Environment],
  beans: [
    { method: 'openApi', type: OpenAPI },
    { method: 'roleDescriptionCustomizer', type: OperationCustomizer },
  ],
})
