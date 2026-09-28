// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/ClientSettingsController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ClientSettingsDtoDao } from '../../../infrastructure/jooq/main/ClientSettingsDtoDao.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { HttpStatus, MediaType, authenticationPrincipal, requestBody, restController, withConstraints } from '../../../port/spring-web.js'
import { IterableElement, MapKey, MapValue, NotNull, Pattern, Valid } from '../../../port/validation.js'
import { ClientSettingDto, ClientSettingGlobalUpdateDto, ClientSettingUserUpdateDto } from './dto/ClientSettingDto.js'

const KEY_REGEX = '^[a-z](?:[a-z0-9_-]*[a-z0-9])*(?:\\.[a-z0-9](?:[a-z0-9_-]*[a-z0-9])*)*$'

// @RestController
// @RequestMapping(value = ["api/v1/client-settings"], produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.CLIENT_SETTINGS)
// @Validated
export class ClientSettingsController {
  constructor(private readonly clientSettingsDtoDao: ClientSettingsDtoDao) {}

  // @GetMapping("global/list")
  // @Operation(summary = "Retrieve global client settings", description = "For unauthenticated users, only settings with 'allowUnauthorized=true' will be returned.")
  // @SecurityRequirements
  getGlobalSettings(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal | null,
  ): Map<string, ClientSettingDto> {
    return this.clientSettingsDtoDao.findAllGlobal({ onlyUnauthorized: principal === null })
  }

  // @GetMapping("user/list")
  // @Operation(summary = "Retrieve user client settings")
  getUserSettings(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
  ): Map<string, ClientSettingDto> {
    return this.clientSettingsDtoDao.findAllUser(principal.user.id)
  }

  // @PatchMapping("global")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @PreAuthorize("hasRole('ADMIN')")
  // @Operation(summary = "Save global settings", description = "Setting key should be a valid lowercase namespace string like 'application.domain.key'")
  // @OASRequestBody(content = [Content(examples = [ExampleObject(value = """{ "application.key1": {...}, "application.key2": {...} }""")])])
  saveGlobalSetting(
    // @RequestBody newSettings: Map<@Pattern(regexp = KEY_REGEX) String, @NotNull @Valid ClientSettingGlobalUpdateDto>
    newSettings: Map<string, ClientSettingGlobalUpdateDto>,
  ): void {
    for (const [key, setting] of newSettings) {
      this.clientSettingsDtoDao.saveGlobal(key, setting.value, setting.allowUnauthorized)
    }
  }

  // @PatchMapping("user")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @Operation(summary = "Save user settings", description = "Setting key should be a valid lowercase namespace string like 'application.domain.key'")
  // @OASRequestBody(content = [Content(examples = [ExampleObject(value = """{ "application.key1": {...}, "application.key2": {...} }""")])])
  saveUserSetting(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
    // @RequestBody newSettings: Map<@Pattern(regexp = KEY_REGEX) String, @NotNull @Valid ClientSettingUserUpdateDto>
    newSettings: Map<string, ClientSettingUserUpdateDto>,
  ): void {
    for (const [key, setting] of newSettings) {
      this.clientSettingsDtoDao.saveForUser(principal.user.id, key, setting.value)
    }
  }

  // @DeleteMapping("global")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @PreAuthorize("hasRole('ADMIN')")
  // @Operation(summary = "Delete global settings", description = "Setting key should be a valid lowercase namespace string like 'application.domain.key'")
  // @OASRequestBody(content = [Content(examples = [ExampleObject(value = """["application.key1", "application.key2"]""")])])
  deleteGlobalSettings(
    // @RequestBody keysToDelete: Set<@Pattern(regexp = KEY_REGEX) String>
    keysToDelete: Set<string>,
  ): void {
    this.clientSettingsDtoDao.deleteGlobalByKeys(keysToDelete)
  }

  // @DeleteMapping("user")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @Operation(summary = "Delete user settings", description = "Setting key should be a valid lowercase namespace string like 'application.domain.key'")
  // @OASRequestBody(content = [Content(examples = [ExampleObject(value = """["application.key1", "application.key2"]""")])])
  deleteUserSettings(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
    // @RequestBody keysToDelete: Set<@Pattern(regexp = KEY_REGEX) String>
    keysToDelete: Set<string>,
  ): void {
    this.clientSettingsDtoDao.deleteByUserIdAndKeys(principal.user.id, keysToDelete)
  }
}

const SETTING_DESCRIPTION = "Setting key should be a valid lowercase namespace string like 'application.domain.key'"

restController(ClientSettingsController, {
  inject: [ClientSettingsDtoDao],
  javaName: 'org.gotson.komga.interfaces.api.rest.ClientSettingsController',
  requestMapping: { path: ['api/v1/client-settings'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  validated: true,
  openapi: { tags: [OpenApiConfiguration.TagNames.CLIENT_SETTINGS] },
  handlers: {
    getGlobalSettings: {
      mapping: { method: 'GET', path: ['global/list'] },
      args: [authenticationPrincipal()],
      returns: { map: { class: ClientSettingDto } },
      openapi: {
        operation: { summary: 'Retrieve global client settings', description: "For unauthenticated users, only settings with 'allowUnauthorized=true' will be returned." },
        securityRequirements: true,
      },
    },
    getUserSettings: {
      mapping: { method: 'GET', path: ['user/list'] },
      args: [authenticationPrincipal()],
      returns: { map: { class: ClientSettingDto } },
      openapi: { operation: { summary: 'Retrieve user client settings' } },
    },
    saveGlobalSetting: {
      mapping: { method: 'PATCH', path: ['global'] },
      args: [
        withConstraints(requestBody({ map: { class: ClientSettingGlobalUpdateDto } }), 'newSettings', [
          MapKey([Pattern({ regexp: KEY_REGEX })]),
          MapValue([NotNull(), Valid()]),
        ]),
      ],
      responseStatus: HttpStatus.NO_CONTENT,
      preAuthorize: "hasRole('ADMIN')",
      openapi: { operation: { summary: 'Save global settings', description: SETTING_DESCRIPTION } },
    },
    saveUserSetting: {
      mapping: { method: 'PATCH', path: ['user'] },
      args: [
        authenticationPrincipal(),
        withConstraints(requestBody({ map: { class: ClientSettingUserUpdateDto } }), 'newSettings', [
          MapKey([Pattern({ regexp: KEY_REGEX })]),
          MapValue([NotNull(), Valid()]),
        ]),
      ],
      responseStatus: HttpStatus.NO_CONTENT,
      openapi: { operation: { summary: 'Save user settings', description: SETTING_DESCRIPTION } },
    },
    deleteGlobalSettings: {
      mapping: { method: 'DELETE', path: ['global'] },
      args: [withConstraints(requestBody({ set: 'String' }), 'keysToDelete', [IterableElement([Pattern({ regexp: KEY_REGEX })])])],
      responseStatus: HttpStatus.NO_CONTENT,
      preAuthorize: "hasRole('ADMIN')",
      openapi: { operation: { summary: 'Delete global settings', description: SETTING_DESCRIPTION } },
    },
    deleteUserSettings: {
      mapping: { method: 'DELETE', path: ['user'] },
      args: [authenticationPrincipal(), withConstraints(requestBody({ set: 'String' }), 'keysToDelete', [IterableElement([Pattern({ regexp: KEY_REGEX })])])],
      responseStatus: HttpStatus.NO_CONTENT,
      openapi: { operation: { summary: 'Delete user settings', description: SETTING_DESCRIPTION } },
    },
  },
})
