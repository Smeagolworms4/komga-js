// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/UserController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { AgeRestriction } from '../../../domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../domain/model/ContentRestrictions.js'
import { DuplicateNameException, UserEmailAlreadyExistsException } from '../../../domain/model/Exceptions.js'
import { KomgaUser } from '../../../domain/model/KomgaUser.js'
import { UserRoles } from '../../../domain/model/UserRoles.js'
import { AuthenticationActivityRepository } from '../../../domain/persistence/AuthenticationActivityRepository.js'
import { KomgaUserRepository } from '../../../domain/persistence/KomgaUserRepository.js'
import { LibraryRepository } from '../../../domain/persistence/LibraryRepository.js'
import { KomgaUserLifecycle } from '../../../domain/service/KomgaUserLifecycle.js'
import { UnpagedSorted } from '../../../infrastructure/jooq/UnpagedSorted.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { Environment } from '../../../port/spring.js'
import type { ParameterAnnotation } from '../../../port/swagger-annotations.js'
import { Order, type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import {
  HttpStatus,
  MediaType,
  ResponseStatusException,
  authenticationPrincipal,
  pageable,
  pathVariable,
  requestBody,
  requestParam,
  restController,
  withParameter,
} from '../../../port/spring-web.js'
import { ApiKeyDto, redacted, toDto as apiKeyToDto } from './dto/ApiKeyDto.js'
import { ApiKeyRequestDto } from './dto/ApiKeyRequestDto.js'
import { AuthenticationActivityDto, toDto as authenticationActivityToDto } from './dto/AuthenticationActivityDto.js'
import { PasswordUpdateDto } from './dto/PasswordUpdateDto.js'
import { UserCreationDto } from './dto/UserCreationDto.js'
import { UserDto, komgaPrincipalToDto, toDto } from './dto/UserDto.js'
import { AllowExcludeDto, UserUpdateDto } from './dto/UserUpdateDto.js'

const TagNames = OpenApiConfiguration.TagNames

// PORT: `org.springdoc.core.converters.models.PageableAsQueryParam` (annotation de springdoc, différente de celle de
// infrastructure/openapi/PageableAnnotations) : paramètres page / size / sort avec valeurs par défaut
const PageableAsQueryParam: readonly ParameterAnnotation[] = [
  { description: 'Zero-based page index (0..N)', in: 'query', name: 'page', schema: { type: 'integer', defaultValue: '0' } },
  { description: 'The size of the page to be returned', in: 'query', name: 'size', schema: { type: 'integer', defaultValue: '20' } },
  {
    description: 'Sorting criteria in the format: property,(asc|desc). Default sort order is ascending. Multiple sort criteria are supported.',
    in: 'query',
    name: 'sort',
    array: { schema: { type: 'string' } },
  },
]

// @RestController
// @RequestMapping("api/v2/users", produces = [MediaType.APPLICATION_JSON_VALUE])
export class UserController {
  private readonly demo: boolean

  constructor(
    private readonly userLifecycle: KomgaUserLifecycle,
    private readonly userRepository: KomgaUserRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly authenticationActivityRepository: AuthenticationActivityRepository,
    env: Environment,
  ) {
    this.demo = env.activeProfiles.includes('demo')
  }

  // @GetMapping("me")
  // @Operation(summary = "Retrieve current user", tags = [TagNames.CURRENT_USER])
  getCurrentUser(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
    // @RequestParam(name = "remember-me", required = false)
    _rememberMe: boolean | null,
  ): UserDto {
    return komgaPrincipalToDto(principal)
  }

  // @PatchMapping("me/password")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @Operation(summary = "Update current user's password", tags = [TagNames.CURRENT_USER])
  updatePasswordForCurrentUser(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
    // @Valid @RequestBody
    newPasswordDto: PasswordUpdateDto,
  ): void {
    if (this.demo) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
    const user = this.userRepository.findByEmailIgnoreCaseOrNull(principal.getUsername())
    if (user !== null) {
      this.userLifecycle.updatePassword(user, newPasswordDto.password, false)
    } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @GetMapping
  // @PreAuthorize("hasRole('ADMIN')")
  // @Operation(summary = "List users", tags = [TagNames.USERS])
  getUsers(): UserDto[] {
    return this.userRepository.findAll().map((it) => toDto(it))
  }

  // @PostMapping
  // @ResponseStatus(HttpStatus.CREATED)
  // @PreAuthorize("hasRole('ADMIN')")
  // @Operation(summary = "Create user", tags = [TagNames.USERS])
  addUser(
    // @Valid @RequestBody
    newUser: UserCreationDto,
  ): UserDto {
    try {
      return toDto(
        this.userLifecycle.createUser(
          ((it) => {
            const { email, password, roles, sharedLibraries, ageRestriction, labelsAllow, labelsExclude } = it
            return new KomgaUser({
              email,
              password,
              roles: UserRoles.valuesOf(roles),
              // keep existing behaviour before those properties were added, by default new user has access to all libraries
              sharedAllLibraries: sharedLibraries === null || sharedLibraries.all,
              sharedLibrariesIds:
                sharedLibraries === null || sharedLibraries.all ? new Set() : new Set(this.libraryRepository.findAllByIds(sharedLibraries.libraryIds).map((it) => it.id)),
              // keep existing behaviour before those properties were added, by default no restrictions are applied
              restrictions: new ContentRestrictions({
                ageRestriction: ((it) => {
                  if (it === null || it.restriction === AllowExcludeDto.NONE) return null
                  else return new AgeRestriction({ age: it.age, restriction: it.restriction.toDomain() })
                })(ageRestriction),
                labelsAllow: labelsAllow ?? new Set(),
                labelsExclude: labelsExclude ?? new Set(),
              }),
            })
          })(newUser),
        ),
      )
    } catch (e) {
      if (e instanceof UserEmailAlreadyExistsException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 'A user with this email already exists')
      throw e
    }
  }

  // @DeleteMapping("{id}")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @PreAuthorize("hasRole('ADMIN') and #principal.user.id != #id")
  // @Operation(summary = "Delete user", tags = [TagNames.USERS])
  deleteUserById(
    // @PathVariable
    id: string,
    // @AuthenticationPrincipal
    _principal: KomgaPrincipal,
  ): void {
    const it = this.userRepository.findByIdOrNull(id)
    if (it !== null) {
      this.userLifecycle.deleteUser(it)
    } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @PatchMapping("{id}")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @PreAuthorize("hasRole('ADMIN') and #principal.user.id != #id")
  // @Operation(summary = "Update user", tags = [TagNames.USERS])
  updateUserById(
    // @PathVariable
    id: string,
    // @Valid @RequestBody
    patch: UserUpdateDto,
    // @AuthenticationPrincipal
    _principal: KomgaPrincipal,
  ): void {
    const existing = this.userRepository.findByIdOrNull(id)
    if (existing !== null) {
      const updatedUser = ((it: UserUpdateDto) =>
        existing.copy({
          roles: it.isSet('roles') ? UserRoles.valuesOf(it.roles as ReadonlySet<string>) : existing.roles,
          sharedAllLibraries: it.isSet('sharedLibraries') ? (it.sharedLibraries as NonNullable<UserUpdateDto['sharedLibraries']>).all : existing.sharedAllLibraries,
          sharedLibrariesIds: it.isSet('sharedLibraries')
            ? (it.sharedLibraries as NonNullable<UserUpdateDto['sharedLibraries']>).all
              ? new Set()
              : new Set(this.libraryRepository.findAllByIds((it.sharedLibraries as NonNullable<UserUpdateDto['sharedLibraries']>).libraryIds).map((it) => it.id))
            : existing.sharedLibrariesIds,
          restrictions: new ContentRestrictions({
            ageRestriction: it.isSet('ageRestriction')
              ? it.ageRestriction === null || it.ageRestriction?.restriction === AllowExcludeDto.NONE
                ? null
                : new AgeRestriction({ age: it.ageRestriction.age, restriction: it.ageRestriction.restriction.toDomain() })
              : existing.restrictions.ageRestriction,
            labelsAllow: it.isSet('labelsAllow') ? (it.labelsAllow ?? new Set()) : existing.restrictions.labelsAllow,
            labelsExclude: it.isSet('labelsExclude') ? (it.labelsExclude ?? new Set()) : existing.restrictions.labelsExclude,
          }),
        }))(patch)
      this.userLifecycle.updateUser(updatedUser)
    } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @PatchMapping("{id}/password")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @PreAuthorize("hasRole('ADMIN') or #principal.user.id == #id")
  // @Operation(summary = "Update user's password", tags = [TagNames.USERS])
  updatePasswordByUserId(
    // @PathVariable
    id: string,
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
    // @Valid @RequestBody
    newPasswordDto: PasswordUpdateDto,
  ): void {
    if (this.demo) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
    const user = this.userRepository.findByIdOrNull(id)
    if (user !== null) {
      this.userLifecycle.updatePassword(user, newPasswordDto.password, user.id !== principal.user.id)
    } else throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @GetMapping("me/authentication-activity")
  // @PageableAsQueryParam
  // @Operation(summary = "Retrieve authentication activity for the current user", tags = [TagNames.CURRENT_USER])
  getAuthenticationActivityForCurrentUser(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
    // @RequestParam(name = "unpaged", required = false)
    unpaged: boolean = false,
    // @Parameter(hidden = true)
    page: Pageable,
  ): Page<AuthenticationActivityDto> {
    if (this.demo && !principal.user.isAdmin) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
    const sort = page.sort.isSorted ? page.sort : Sort.by(Order.desc('dateTime'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.authenticationActivityRepository.findAllByUser(principal.user, pageRequest).map((it) => authenticationActivityToDto(it))
  }

  // @GetMapping("authentication-activity")
  // @PageableAsQueryParam
  // @PreAuthorize("hasRole('ADMIN')")
  // @Operation(summary = "Retrieve authentication activity", tags = [TagNames.USERS])
  getAuthenticationActivity(
    // @RequestParam(name = "unpaged", required = false)
    unpaged: boolean = false,
    // @Parameter(hidden = true)
    page: Pageable,
  ): Page<AuthenticationActivityDto> {
    const sort = page.sort.isSorted ? page.sort : Sort.by(Order.desc('dateTime'))

    const pageRequest = unpaged ? new UnpagedSorted(sort) : PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.authenticationActivityRepository.findAll(pageRequest).map((it) => authenticationActivityToDto(it))
  }

  // @GetMapping("{id}/authentication-activity/latest")
  // @PreAuthorize("hasRole('ADMIN') or #principal.user.id == #id")
  // @Operation(summary = "Retrieve latest authentication activity for a user", tags = [TagNames.USERS])
  getLatestAuthenticationActivityByUserId(
    // @PathVariable
    id: string,
    // @AuthenticationPrincipal
    _principal: KomgaPrincipal,
    // @RequestParam(required = false, name = "apikey_id")
    apiKeyId: string | null,
  ): AuthenticationActivityDto {
    const user = this.userRepository.findByIdOrNull(id)
    if (user === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    const activity = this.authenticationActivityRepository.findMostRecentByUser(user, apiKeyId)
    if (activity === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    return authenticationActivityToDto(activity)
  }

  // @GetMapping("me/api-keys")
  // @Operation(summary = "Retrieve API keys", tags = [TagNames.API_KEYS])
  getApiKeysForCurrentUser(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
  ): ApiKeyDto[] {
    if (this.demo && !principal.user.isAdmin) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
    return this.userRepository.findApiKeyByUserId(principal.user.id).map((it) => redacted(apiKeyToDto(it)))
  }

  // @PostMapping("me/api-keys")
  // @Operation(summary = "Create API key", tags = [TagNames.API_KEYS])
  createApiKeyForCurrentUser(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
    // @Valid @RequestBody
    apiKeyRequest: ApiKeyRequestDto,
  ): ApiKeyDto {
    if (this.demo && !principal.user.isAdmin) throw new ResponseStatusException(HttpStatus.FORBIDDEN)
    let result: ApiKeyDto | null
    try {
      const apiKey = this.userLifecycle.createApiKey(principal.user, apiKeyRequest.comment)
      result = apiKey !== null ? apiKeyToDto(apiKey) : null
    } catch (e) {
      if (e instanceof DuplicateNameException) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.code)
      throw e
    }
    return result ?? (() => { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, 'Failed to generate API key') })()
  }

  // @DeleteMapping("me/api-keys/{keyId}")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @Operation(summary = "Delete API key", tags = [TagNames.API_KEYS])
  deleteApiKeyByKeyId(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
    // @PathVariable
    keyId: string,
  ): void {
    if (!this.userRepository.existsApiKeyByIdAndUserId(keyId, principal.user.id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
    this.userRepository.deleteApiKeyByIdAndUserId(keyId, principal.user.id)
  }
}

restController(UserController, {
  inject: [KomgaUserLifecycle, KomgaUserRepository, LibraryRepository, AuthenticationActivityRepository, Environment],
  javaName: 'org.gotson.komga.interfaces.api.rest.UserController',
  requestMapping: { path: ['api/v2/users'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  handlers: {
    getCurrentUser: {
      mapping: { method: 'GET', path: ['me'] },
      args: [authenticationPrincipal(), requestParam('remember-me', { nullable: 'Boolean' }, { required: false, nullable: true })],
      returns: { class: UserDto },
      openapi: { operation: { summary: 'Retrieve current user', tags: [TagNames.CURRENT_USER] } },
    },
    updatePasswordForCurrentUser: {
      mapping: { method: 'PATCH', path: ['me/password'] },
      args: [authenticationPrincipal(), requestBody({ class: PasswordUpdateDto }, { valid: true })],
      responseStatus: HttpStatus.NO_CONTENT,
      openapi: { operation: { summary: "Update current user's password", tags: [TagNames.CURRENT_USER] } },
    },
    getUsers: {
      mapping: { method: 'GET' },
      preAuthorize: "hasRole('ADMIN')",
      returns: { list: { class: UserDto } },
      openapi: { operation: { summary: 'List users', tags: [TagNames.USERS] } },
    },
    addUser: {
      mapping: { method: 'POST' },
      args: [requestBody({ class: UserCreationDto }, { valid: true })],
      responseStatus: HttpStatus.CREATED,
      preAuthorize: "hasRole('ADMIN')",
      returns: { class: UserDto },
      openapi: { operation: { summary: 'Create user', tags: [TagNames.USERS] } },
    },
    deleteUserById: {
      mapping: { method: 'DELETE', path: ['{id}'] },
      args: [pathVariable('id'), authenticationPrincipal()],
      responseStatus: HttpStatus.NO_CONTENT,
      preAuthorize: "hasRole('ADMIN') and #principal.user.id != #id",
      openapi: { operation: { summary: 'Delete user', tags: [TagNames.USERS] } },
    },
    updateUserById: {
      mapping: { method: 'PATCH', path: ['{id}'] },
      args: [pathVariable('id'), requestBody({ class: UserUpdateDto }, { valid: true }), authenticationPrincipal()],
      responseStatus: HttpStatus.NO_CONTENT,
      preAuthorize: "hasRole('ADMIN') and #principal.user.id != #id",
      openapi: { operation: { summary: 'Update user', tags: [TagNames.USERS] } },
    },
    updatePasswordByUserId: {
      mapping: { method: 'PATCH', path: ['{id}/password'] },
      args: [pathVariable('id'), authenticationPrincipal(), requestBody({ class: PasswordUpdateDto }, { valid: true })],
      responseStatus: HttpStatus.NO_CONTENT,
      preAuthorize: "hasRole('ADMIN') or #principal.user.id == #id",
      openapi: { operation: { summary: "Update user's password", tags: [TagNames.USERS] } },
    },
    getAuthenticationActivityForCurrentUser: {
      mapping: { method: 'GET', path: ['me/authentication-activity'] },
      args: [authenticationPrincipal(), requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }), withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: [{ class: AuthenticationActivityDto }] },
      openapi: {
        operation: { summary: 'Retrieve authentication activity for the current user', tags: [TagNames.CURRENT_USER] },
        parameters: [...PageableAsQueryParam],
      },
    },
    getAuthenticationActivity: {
      mapping: { method: 'GET', path: ['authentication-activity'] },
      args: [requestParam('unpaged', 'Boolean', { required: false, hasDefault: true }), withParameter(pageable(), { hidden: true })],
      preAuthorize: "hasRole('ADMIN')",
      returns: { class: PageImpl, args: [{ class: AuthenticationActivityDto }] },
      openapi: {
        operation: { summary: 'Retrieve authentication activity', tags: [TagNames.USERS] },
        parameters: [...PageableAsQueryParam],
      },
    },
    getLatestAuthenticationActivityByUserId: {
      mapping: { method: 'GET', path: ['{id}/authentication-activity/latest'] },
      args: [pathVariable('id'), authenticationPrincipal(), requestParam('apikey_id', { nullable: 'String' }, { required: false, nullable: true })],
      preAuthorize: "hasRole('ADMIN') or #principal.user.id == #id",
      returns: { class: AuthenticationActivityDto },
      openapi: { operation: { summary: 'Retrieve latest authentication activity for a user', tags: [TagNames.USERS] } },
    },
    getApiKeysForCurrentUser: {
      mapping: { method: 'GET', path: ['me/api-keys'] },
      args: [authenticationPrincipal()],
      returns: { list: { class: ApiKeyDto } },
      openapi: { operation: { summary: 'Retrieve API keys', tags: [TagNames.API_KEYS] } },
    },
    createApiKeyForCurrentUser: {
      mapping: { method: 'POST', path: ['me/api-keys'] },
      args: [authenticationPrincipal(), requestBody({ class: ApiKeyRequestDto }, { valid: true })],
      returns: { class: ApiKeyDto },
      openapi: { operation: { summary: 'Create API key', tags: [TagNames.API_KEYS] } },
    },
    deleteApiKeyByKeyId: {
      mapping: { method: 'DELETE', path: ['me/api-keys/{keyId}'] },
      args: [authenticationPrincipal(), pathVariable('keyId')],
      responseStatus: HttpStatus.NO_CONTENT,
      openapi: { operation: { summary: 'Delete API key', tags: [TagNames.API_KEYS] } },
    },
  },
})
