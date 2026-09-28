// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/ClaimController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaUser } from '../../../domain/model/KomgaUser.js'
import { UserRoles } from '../../../domain/model/UserRoles.js'
import { KomgaUserLifecycle } from '../../../domain/service/KomgaUserLifecycle.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'
import { HttpStatus, MediaType, ResponseStatusException, requestHeader, restController, withConstraints } from '../../../port/spring-web.js'
import { Email, NotBlank } from '../../../port/validation.js'
import { UserDto, toDto } from './dto/UserDto.js'

// @RestController
// @RequestMapping("api/v1/claim", produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.CLAIM)
// @Validated
// @SecurityRequirements
export class ClaimController {
  constructor(private readonly userDetailsLifecycle: KomgaUserLifecycle) {}

  // @GetMapping
  // @Operation(summary = "Retrieve claim status", description = "Check whether this server has already been claimed.")
  getClaimStatus(): ClaimController.ClaimStatus {
    return new ClaimController.ClaimStatus({ isClaimed: this.userDetailsLifecycle.countUsers() > 0 })
  }

  // @PostMapping
  // @Operation(summary = "Claim server", description = "Creates an admin user with the provided credentials.")
  claimServer(
    // @Email(regexp = ".+@.+\\..+")
    // @RequestHeader("X-Komga-Email")
    email: string,
    // @NotBlank
    // @RequestHeader("X-Komga-Password")
    password: string,
  ): UserDto {
    if (this.userDetailsLifecycle.countUsers() > 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 'This server has already been claimed')

    return toDto(
      this.userDetailsLifecycle.createUser(
        new KomgaUser({
          email: email,
          password: password,
          roles: new Set(UserRoles.entries()),
        }),
      ),
    )
  }
}

export namespace ClaimController {
  type ClaimStatusParams = {
    isClaimed: boolean
  }

  export class ClaimStatus extends DataClass<ClaimStatusParams> {
    readonly isClaimed: boolean

    constructor({ isClaimed }: ClaimStatusParams) {
      super()
      this.isClaimed = isClaimed
    }
  }

  jsonProperties(ClaimStatus, { isClaimed: 'Boolean' }, [], { required: ['isClaimed'] })
}

restController(ClaimController, {
  inject: [KomgaUserLifecycle],
  javaName: 'org.gotson.komga.interfaces.api.rest.ClaimController',
  requestMapping: { path: ['api/v1/claim'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  validated: true,
  openapi: { tags: [OpenApiConfiguration.TagNames.CLAIM], securityRequirements: true },
  handlers: {
    getClaimStatus: {
      mapping: { method: 'GET' },
      returns: { class: ClaimController.ClaimStatus },
      openapi: { operation: { summary: 'Retrieve claim status', description: 'Check whether this server has already been claimed.' } },
    },
    claimServer: {
      mapping: { method: 'POST' },
      args: [
        withConstraints(requestHeader('X-Komga-Email'), 'email', [Email({ regexp: '.+@.+\\..+' })]),
        withConstraints(requestHeader('X-Komga-Password'), 'password', [NotBlank()]),
      ],
      returns: { class: UserDto },
      openapi: { operation: { summary: 'Claim server', description: 'Creates an admin user with the provided credentials.' } },
    },
  },
})
