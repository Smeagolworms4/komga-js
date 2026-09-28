// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/AnnouncementController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LRUCache } from 'lru-cache'
import { KomgaUserRepository } from '../../../domain/persistence/KomgaUserRepository.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { ObjectMapper } from '../../../port/jackson-mapper.js'
import { RuntimeException } from '../../../port/kotlin.js'
import { HttpStatus, MediaType, ResponseStatusException, authenticationPrincipal, requestBody, restController } from '../../../port/spring-web.js'
import { JsonFeedDto } from './dto/JsonFeedDto.js'

const WEBSITE = 'https://komga.org'

// @RestController
// @RequestMapping("api/v1/announcements", produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.ANNOUNCEMENTS)
export class AnnouncementController {
  // PORT: WebClient (webClientBuilder.baseUrl(..).build()) -> fetch sur la même URL, corps lu par l'ObjectMapper de Spring Boot
  private readonly webClient: { baseUrl: string }

  // PORT: Caffeine.newBuilder().expireAfterAccess(1, TimeUnit.HOURS) -> lru-cache (ttl réarmé à chaque lecture) ;
  // comme Caffeine, une valeur calculée nulle n'est pas mise en cache
  private readonly cache = new LRUCache<string, JsonFeedDto>({ max: 1000, ttl: 60 * 60 * 1000, updateAgeOnGet: true })

  constructor(
    private readonly userRepository: KomgaUserRepository,
    // PORT: WebClient.Builder remplacé par l'ObjectMapper (lecture du corps JSON)
    private readonly objectMapper: ObjectMapper,
  ) {
    this.webClient = { baseUrl: `${WEBSITE}/blog/feed.json` }
  }

  // @GetMapping
  // @PreAuthorize("hasRole('ADMIN')")
  // @Operation(summary = "Retrieve announcements")
  // PORT: async (requête HTTP)
  async getAnnouncements(principal: KomgaPrincipal): Promise<JsonFeedDto> {
    let cached = this.cache.get('announcements') ?? null
    if (cached === null) {
      cached = await this.fetchWebsiteAnnouncements()
      if (cached !== null) this.cache.set('announcements', cached)
    }
    if (cached !== null) {
      const feed = cached
      const read = this.userRepository.findAnnouncementIdsReadByUserId(principal.user.id)
      return feed.copy({ items: feed.items.map((item) => item.copy({ komgaExtension: new JsonFeedDto.KomgaExtensionDto({ read: read.has(item.id) }) })) })
    }
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @PreAuthorize("hasRole('ADMIN')")
  // @PutMapping
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @Operation(summary = "Mark announcements as read")
  markAnnouncementsRead(principal: KomgaPrincipal, announcementIds: Set<string>): void {
    this.userRepository.saveAnnouncementIdsRead(principal.user, announcementIds)
  }

  // PORT: async (WebClient.block())
  async fetchWebsiteAnnouncements(): Promise<JsonFeedDto | null> {
    const response = await fetch(this.webClient.baseUrl)
    // retrieve() : WebClientResponseException pour un statut 4xx / 5xx
    if (!response.ok) throw new RuntimeException(`${response.status} ${response.statusText} from GET ${this.webClient.baseUrl}`)
    const body = await response.text()
    return body.length > 0 ? this.objectMapper.readValue<JsonFeedDto>(body, { class: JsonFeedDto }) : null
  }
}

restController(AnnouncementController, {
  inject: [KomgaUserRepository, ObjectMapper],
  javaName: 'org.gotson.komga.interfaces.api.rest.AnnouncementController',
  requestMapping: { path: ['api/v1/announcements'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.ANNOUNCEMENTS] },
  handlers: {
    getAnnouncements: {
      mapping: { method: 'GET' },
      args: [authenticationPrincipal()],
      preAuthorize: "hasRole('ADMIN')",
      returns: { class: JsonFeedDto },
      openapi: { operation: { summary: 'Retrieve announcements' } },
    },
    markAnnouncementsRead: {
      mapping: { method: 'PUT' },
      args: [authenticationPrincipal(), requestBody({ set: 'String' })],
      preAuthorize: "hasRole('ADMIN')",
      responseStatus: HttpStatus.NO_CONTENT,
      openapi: { operation: { summary: 'Mark announcements as read' } },
    },
  },
})
