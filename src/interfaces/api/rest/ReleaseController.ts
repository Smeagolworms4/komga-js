// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/ReleaseController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LRUCache } from 'lru-cache'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { ObjectMapper } from '../../../port/jackson-mapper.js'
import { RuntimeException } from '../../../port/kotlin.js'
import { HttpStatus, MediaType, ResponseStatusException, restController } from '../../../port/spring-web.js'
import { GithubReleaseDto } from './dto/GithubReleaseDto.js'
import { ReleaseDto } from './dto/ReleaseDto.js'

const GITHUB_API = 'https://api.github.com/repos/gotson/komga/releases'

// @RestController
// @PreAuthorize("hasRole('ADMIN')")
// @RequestMapping("api/v1/releases", produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.RELEASES)
export class ReleaseController {
  // PORT: WebClient (webClientBuilder.baseUrl(GITHUB_API).build()) -> fetch sur la même URL, corps lu par l'ObjectMapper de Spring Boot
  private readonly webClient: { baseUrl: string }

  // PORT: Caffeine.newBuilder().expireAfterAccess(1, TimeUnit.HOURS) -> lru-cache (ttl réarmé à chaque lecture)
  private readonly cache = new LRUCache<string, GithubReleaseDto[]>({ max: 1000, ttl: 60 * 60 * 1000, updateAgeOnGet: true })

  constructor(
    // PORT: WebClient.Builder remplacé par l'ObjectMapper (lecture du corps JSON)
    private readonly objectMapper: ObjectMapper,
  ) {
    this.webClient = { baseUrl: GITHUB_API }
  }

  // @GetMapping
  // @PreAuthorize("hasRole('ADMIN')")
  // @Operation(summary = "List releases")
  // PORT: async (requête HTTP)
  async getReleases(): Promise<ReleaseDto[]> {
    let releases = this.cache.get('releases') ?? null
    if (releases === null) {
      releases = await this.fetchGitHubReleases()
      this.cache.set('releases', releases)
    }
    if (releases !== null) {
      return releases.map(
        (ghRel, index) =>
          new ReleaseDto({
            version: ghRel.tagName,
            releaseDate: ghRel.publishedAt,
            url: ghRel.htmlUrl,
            latest: index === 0,
            preRelease: ghRel.prerelease,
            description: ghRel.body,
          }),
      )
    }
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // PORT: async (WebClient.block())
  async fetchGitHubReleases(): Promise<GithubReleaseDto[]> {
    const url = `${this.webClient.baseUrl}?per_page=20`
    const response = await fetch(url)
    // retrieve() : WebClientResponseException pour un statut 4xx / 5xx
    if (!response.ok) throw new RuntimeException(`${response.status} ${response.statusText} from GET ${url}`)
    const body = await response.text()
    return (body.length > 0 ? this.objectMapper.readValue<GithubReleaseDto[] | null>(body, { list: { class: GithubReleaseDto } }) : null) ?? []
  }
}

restController(ReleaseController, {
  inject: [ObjectMapper],
  javaName: 'org.gotson.komga.interfaces.api.rest.ReleaseController',
  preAuthorize: "hasRole('ADMIN')",
  requestMapping: { path: ['api/v1/releases'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.RELEASES] },
  handlers: {
    getReleases: {
      mapping: { method: 'GET' },
      preAuthorize: "hasRole('ADMIN')",
      returns: { list: { class: ReleaseDto } },
      openapi: { operation: { summary: 'List releases' } },
    },
  },
})
