// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/SettingsController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Duration } from '@js-joda/core'
import { KomgaSettingsProvider } from '../../../infrastructure/configuration/KomgaSettingsProvider.js'
import { KepubConverter } from '../../../infrastructure/kobo/KepubConverter.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { WebServerEffectiveSettings } from '../../../infrastructure/web/WebServerEffectiveSettings.js'
import { MultipartProperties } from '../../../port/spring-boot-web.js'
import { HttpStatus, MediaType, authenticationPrincipal, requestBody, restController, withParameter } from '../../../port/spring-web.js'
import { SettingMultiSource, SettingsDto, publicSettings } from './dto/SettingsDto.js'
import { SettingsUpdateDto } from './dto/SettingsUpdateDto.js'
import { toDomain, toDto } from './dto/ThumbnailSizeDto.js'

// @RestController
// @RequestMapping(value = ["api/v1/settings"], produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.SERVER_SETTINGS)
export class SettingsController {
  constructor(
    private readonly komgaSettingsProvider: KomgaSettingsProvider,
    // @param:Value($$"${server.port:#{null}}")
    private readonly configServerPort: number | null,
    // @param:Value($$"${server.servlet.context-path:#{null}}")
    private readonly configServerContextPath: string | null,
    private readonly serverSettings: WebServerEffectiveSettings,
    private readonly kepubConverter: KepubConverter,
    private readonly multipartProperties: MultipartProperties,
  ) {}

  // @GetMapping
  // @Operation(summary = "Retrieve server settings")
  getServerSettings(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
  ): SettingsDto {
    const settingsDto = new SettingsDto({
      deleteEmptyCollections: this.komgaSettingsProvider.deleteEmptyCollections,
      deleteEmptyReadLists: this.komgaSettingsProvider.deleteEmptyReadLists,
      rememberMeDurationDays: this.komgaSettingsProvider.rememberMeDuration.toDays(),
      thumbnailSize: toDto(this.komgaSettingsProvider.thumbnailSize),
      taskPoolSize: this.komgaSettingsProvider.taskPoolSize,
      serverPort: new SettingMultiSource({
        configurationSource: this.configServerPort,
        databaseSource: this.komgaSettingsProvider.serverPort,
        effectiveValue: this.serverSettings.effectiveServerPort,
      }),
      serverContextPath: new SettingMultiSource({
        configurationSource: this.configServerContextPath,
        databaseSource: this.komgaSettingsProvider.serverContextPath,
        effectiveValue: this.serverSettings.effectiveServletContextPath,
      }),
      koboProxy: this.komgaSettingsProvider.koboProxy,
      koboPort: this.komgaSettingsProvider.koboPort,
      kepubifyPath: new SettingMultiSource({
        configurationSource: this.kepubConverter.kepubifyConfigurationPath,
        databaseSource: this.komgaSettingsProvider.kepubifyPath,
        effectiveValue: this.kepubConverter.kepubifyPath?.toString() ?? null,
      }),
      maxUploadFileSizeBytes: this.multipartProperties.maxFileSize?.toBytes() ?? null,
    })

    return principal.user.isAdmin ? settingsDto : publicSettings(settingsDto)
  }

  // @PatchMapping
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @Operation(summary = "Update server settings", description = "You can omit fields you don't want to update")
  // @PreAuthorize("hasRole('ADMIN')")
  updateServerSettings(
    // @Valid @RequestBody
    // @Parameter(description = "Fields to update. You can omit fields you don't want to update.")
    newSettings: SettingsUpdateDto,
  ): void {
    if (newSettings.deleteEmptyCollections !== null) this.komgaSettingsProvider.deleteEmptyCollections = newSettings.deleteEmptyCollections
    if (newSettings.deleteEmptyReadLists !== null) this.komgaSettingsProvider.deleteEmptyReadLists = newSettings.deleteEmptyReadLists
    if (newSettings.rememberMeDurationDays !== null) this.komgaSettingsProvider.rememberMeDuration = Duration.ofDays(newSettings.rememberMeDurationDays)
    if (newSettings.renewRememberMeKey === true) this.komgaSettingsProvider.renewRememberMeKey()
    if (newSettings.thumbnailSize !== null) this.komgaSettingsProvider.thumbnailSize = toDomain(newSettings.thumbnailSize)
    if (newSettings.taskPoolSize !== null) this.komgaSettingsProvider.taskPoolSize = newSettings.taskPoolSize

    if (newSettings.isSet('serverPort')) this.komgaSettingsProvider.serverPort = newSettings.serverPort
    if (newSettings.isSet('serverContextPath')) this.komgaSettingsProvider.serverContextPath = newSettings.serverContextPath

    if (newSettings.koboProxy !== null) this.komgaSettingsProvider.koboProxy = newSettings.koboProxy
    if (newSettings.isSet('koboPort')) this.komgaSettingsProvider.koboPort = newSettings.koboPort
    if (newSettings.isSet('kepubifyPath')) this.komgaSettingsProvider.kepubifyPath = newSettings.kepubifyPath
  }
}

restController(SettingsController, {
  inject: [
    KomgaSettingsProvider,
    // PORT: @Value("${server.port:#{null}}") private val configServerPort: Int?
    {
      expression: (ctx) => {
        const v = ctx.environment.getProperty('server.port')
        return v === null ? null : Number(v)
      },
    },
    { expression: (ctx) => ctx.environment.getProperty('server.servlet.context-path') },
    WebServerEffectiveSettings,
    KepubConverter,
    MultipartProperties,
  ],
  javaName: 'org.gotson.komga.interfaces.api.rest.SettingsController',
  requestMapping: { path: ['api/v1/settings'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.SERVER_SETTINGS] },
  handlers: {
    getServerSettings: {
      mapping: { method: 'GET' },
      args: [authenticationPrincipal()],
      returns: { class: SettingsDto },
      openapi: { operation: { summary: 'Retrieve server settings' } },
    },
    updateServerSettings: {
      mapping: { method: 'PATCH' },
      args: [withParameter(requestBody({ class: SettingsUpdateDto }, { valid: true }), { description: "Fields to update. You can omit fields you don't want to update." })],
      responseStatus: HttpStatus.NO_CONTENT,
      preAuthorize: "hasRole('ADMIN')",
      openapi: { operation: { summary: 'Update server settings', description: "You can omit fields you don't want to update" } },
    },
  },
})
