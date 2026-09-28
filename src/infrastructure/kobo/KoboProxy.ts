// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/kobo/KoboProxy.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { request as httpsRequest } from 'node:https'
import { KomgaSettingsProvider } from '../configuration/KomgaSettingsProvider.js'
import { getCurrentRequest } from '../web/Utils.js'
import { ObjectMapper } from '../../port/jackson-mapper.js'
import type { JsonNode } from '../../port/jackson-tree.js'
import { IOException } from '../../port/java-io.js'
import { IllegalStateException, lazy } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import type { HttpServletRequest } from '../../port/servlet.js'
import { component } from '../../port/spring.js'
import { CaseSensitiveHttpHeaders, HttpStatus, ResponseEntity, ResponseStatusException } from '../../port/spring-web.js'
import { KoboHeaders } from './KoboHeaders.js'
import { KomgaSyncTokenGenerator } from './KomgaSyncTokenGenerator.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.kobo.KoboProxy')

const X_KOBO_SYNCTOKEN = KoboHeaders.X_KOBO_SYNCTOKEN

/** Réponse brute du client HTTP (en-têtes dans l'ordre et la casse reçus) */
type ClientResponse = { statusCode: number; statusText: string; headers: Map<string, string[]>; body: Buffer }

/**
 * PORT: RestClient (Reactor Netty) sur DefaultUriBuilderFactory("https://storeapi.kobo.com") en EncodingMode.NONE,
 * délais de connexion et de lecture de 1 minute -> node:https (délai d'inactivité du socket de 1 minute).
 */
class KoboApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  exchange(method: string, uri: string, headers: [string, string][], body: Uint8Array | null): Promise<ClientResponse> {
    return new Promise((resolve, reject) => {
      const outHeaders: Record<string, string[]> = {}
      for (const [k, v] of headers) (outHeaders[k] ??= []).push(v)
      const req = httpsRequest(new URL(this.baseUrl + uri), { method: method, headers: outHeaders, timeout: this.timeoutMs }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('error', reject)
        res.on('end', () => {
          // HttpHeaders : multi-map insensible à la casse, clé gardée avec la casse de la première occurrence
          const map = new Map<string, string[]>()
          const raw = res.rawHeaders
          for (let i = 0; i + 1 < raw.length; i += 2) {
            const name = raw[i] as string
            const existing = [...map.keys()].find((k) => k.toLowerCase() === name.toLowerCase())
            if (existing !== undefined) map.get(existing)?.push(raw[i + 1] as string)
            else map.set(name, [raw[i + 1] as string])
          }
          resolve({ statusCode: res.statusCode ?? 0, statusText: res.statusMessage ?? '', headers: map, body: Buffer.concat(chunks) })
        })
      })
      req.on('timeout', () => req.destroy(new IOException(`Read timed out after ${this.timeoutMs}ms`)))
      req.on('error', reject)
      if (body !== null) req.write(body)
      req.end()
    })
  }
}

export class KoboProxy {
  private readonly koboApiClient: KoboApiClient = new KoboApiClient('https://storeapi.kobo.com', 60_000)

  private readonly pathRegex = /\/kobo\/[-\w]*(.*)/

  private readonly headersOutInclude = new Set([
    // HttpHeaders.AUTHORIZATION, USER_AGENT, ACCEPT, ACCEPT_LANGUAGE, CONTENT_TYPE
    'Authorization',
    'User-Agent',
    'Accept',
    'Accept-Language',
    'Content-Type',
  ])

  private readonly headersOutExclude = new Set([X_KOBO_SYNCTOKEN])

  constructor(
    private readonly objectMapper: ObjectMapper,
    private readonly komgaSyncTokenGenerator: KomgaSyncTokenGenerator,
    private readonly komgaSettingsProvider: KomgaSettingsProvider,
  ) {}

  private isKoboHeader(headerName: string): boolean {
    return headerName.toLowerCase().startsWith('x-kobo-')
  }

  isEnabled(): boolean {
    return this.komgaSettingsProvider.koboProxy
  }

  /**
   * Proxy the current request to the Kobo store, if enabled.
   * If [includeSyncToken] is set, the raw sync token will be extracted from the current request and sent to the store.
   * If a X_KOBO_SYNCTOKEN header is present in the response, the original Komga sync token will be updated with the
   * raw Kobo sync token returned, and added to the response headers.
   */
  // PORT: async (client HTTP asynchrone)
  async proxyCurrentRequest({ body = null, includeSyncToken = false }: { body?: Uint8Array | null; includeSyncToken?: boolean } = {}): Promise<ResponseEntity<JsonNode>> {
    if (!this.komgaSettingsProvider.koboProxy) throw new IllegalStateException('kobo proxying is disabled')

    const request = getCurrentRequest()
    const match = this.pathRegex.exec(request.requestURI)
    if (match === null) throw new IllegalStateException('Could not get path from current request')
    const path = match[1] as string

    const syncToken = includeSyncToken ? this.komgaSyncTokenGenerator.fromRequestHeaders(request) : null

    // uriBuilder.path(path).query(request.queryString).build()
    // UriComponents.toUriString : un chemin non vide qui ne commence pas par / en reçoit un après l'hôte
    const uri = (path.length > 0 && !path.startsWith('/') ? `/${path}` : path) + (request.queryString !== null ? `?${request.queryString}` : '')
    logger.debug(() => `Proxy URL: https://storeapi.kobo.com${uri}`)
    const headersOut: [string, string][] = []
    headerNames(request)
      .filter((it) => !containsIgnoreCase(this.headersOutExclude, it))
      .filter((it) => containsIgnoreCase(this.headersOutInclude, it) || this.isKoboHeader(it))
      .forEach((it) => {
        for (const v of request.getHeaders(it) ?? []) headersOut.push([it, v])
      })
    if (includeSyncToken) {
      if (syncToken !== null && syncToken.rawKoboSyncToken.trim().length > 0) {
        headersOut.push([X_KOBO_SYNCTOKEN, syncToken.rawKoboSyncToken])
      }
    }
    // PORT: RestClient.body(ByteArray) : ByteArrayHttpMessageConverter ajoute Content-Type (application/octet-stream
    // s'il est absent) et Content-Length
    if (body !== null) {
      if (!headersOut.some(([k]) => k.toLowerCase() === 'content-type')) headersOut.push(['Content-Type', 'application/octet-stream'])
      headersOut.push(['Content-Length', String(body.length)])
    }
    logger.debug(() => `Headers out: [${headersOut.map(([k, v]) => `${k}:"${v}"`).join(', ')}]`)
    const response = await this.koboApiClient.exchange(request.method, uri, headersOut, body)
    // onStatus(HttpStatusCode::isError)
    if (response.statusCode >= 400) {
      logger.debug(() => `Kobo response: ${response.statusCode}: ${response.body.toString('utf8')}`)
      throw new ResponseStatusException(statusOf(response.statusCode), response.statusText)
    }
    const responseBody: JsonNode | null = response.body.length > 0 ? this.objectMapper.readTree(response.body) : null

    logger.debug(() => `Kobo response: <${response.statusCode},${responseBody},[${[...response.headers].map(([k, v]) => `${k}:"${v.join('", "')}"`).join(', ')}]>`)

    // PORT: filterKeys -> Map ordinaire (sensible à la casse), comme le Map Kotlin
    const headersToReturn = new Map([...response.headers].filter(([k]) => this.isKoboHeader(k)))
    if ([...headersToReturn.keys()].some((k) => k.toLowerCase() === X_KOBO_SYNCTOKEN.toLowerCase())) {
      const koboSyncToken = headersToReturn.get(X_KOBO_SYNCTOKEN)?.[0] ?? null
      if (koboSyncToken !== null && includeSyncToken && syncToken !== null) {
        const komgaSyncToken = syncToken.copy({ rawKoboSyncToken: koboSyncToken })
        headersToReturn.set(X_KOBO_SYNCTOKEN, [this.komgaSyncTokenGenerator.toBase64(komgaSyncToken)])
      }
    }

    // PORT: ResponseEntity(body, LinkedMultiValueMap(headersToReturn), status) : noms sensibles à la casse
    const headers = new CaseSensitiveHttpHeaders()
    for (const [k, values] of headersToReturn) for (const v of values) headers.add(k, v)
    return new ResponseEntity<JsonNode>(responseBody, headers, response.statusCode)
  }

  readonly imageHostUrl = 'https://cdn.kobo.com/book-images/{ImageId}/{Width}/{Height}/false/image.jpg'

  get nativeKoboResources(): JsonNode {
    return lazy(this, 'nativeKoboResources', () =>
      this.objectMapper.readTree(
        // language=JSON
        NATIVE_KOBO_RESOURCES,
      ),
    )
  }
}

// PORT: request.headerNames (Tomcat : noms uniques, casse reçue)
function headerNames(request: HttpServletRequest): string[] {
  const raw = request.raw.rawHeaders
  const names: string[] = []
  for (let i = 0; i < raw.length; i += 2) {
    const n = raw[i] as string
    if (!names.some((it) => it.toLowerCase() === n.toLowerCase())) names.push(n)
  }
  return names
}

// org.gotson.komga.language.contains(s, ignoreCase = true)
function containsIgnoreCase(set: Set<string>, s: string): boolean {
  return [...set].some((it) => it.toLowerCase() === s.toLowerCase())
}

// PORT: HttpStatusCode.valueOf(code) : le port de HttpStatus ne couvre pas tous les codes, repli sur la classe du code
function statusOf(code: number): HttpStatus {
  return HttpStatus.valueOfCode(code) ?? (code >= 500 ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.BAD_REQUEST)
}

const NATIVE_KOBO_RESOURCES = `{
  "account_page": "https://www.kobo.com/account/settings",
  "account_page_rakuten": "https://my.rakuten.co.jp/",
  "add_device": "https://storeapi.kobo.com/v1/user/add-device",
  "add_entitlement": "https://storeapi.kobo.com/v1/library/{RevisionIds}",
  "affiliaterequest": "https://storeapi.kobo.com/v1/affiliate",
  "assets": "https://storeapi.kobo.com/v1/assets",
  "audiobook": "https://storeapi.kobo.com/v1/products/audiobooks/{ProductId}",
  "audiobook_detail_page": "https://www.kobo.com/{region}/{language}/audiobook/{slug}",
  "audiobook_get_credits": "https://www.kobo.com/{region}/{language}/audiobooks/plans",
  "audiobook_landing_page": "https://www.kobo.com/{region}/{language}/audiobooks",
  "audiobook_preview": "https://storeapi.kobo.com/v1/products/audiobooks/{Id}/preview",
  "audiobook_purchase_withcredit": "https://storeapi.kobo.com/v1/store/audiobook/{Id}",
  "audiobook_subscription_management": "https://www.kobo.com/{region}/{language}/account/subscriptions",
  "audiobook_subscription_orange_deal_inclusion_url": "https://authorize.kobo.com/inclusion",
  "audiobook_subscription_purchase": "https://www.kobo.com/{region}/{language}/checkoutoption/21C6D938-934B-4A91-B979-E14D70B2F280",
  "audiobook_subscription_tiers": "https://www.kobo.com/{region}/{language}/checkoutoption/21C6D938-934B-4A91-B979-E14D70B2F280",
  "authorproduct_recommendations": "https://storeapi.kobo.com/v1/products/books/authors/recommendations",
  "autocomplete": "https://storeapi.kobo.com/v1/products/autocomplete",
  "bam": "https://storeapi.kobo.com/v2/activity/bam/success",
  "blackstone_header": {
    "key": "x-amz-request-payer",
    "value": "requester"
  },
  "book": "https://storeapi.kobo.com/v1/products/books/{ProductId}",
  "book_detail_page": "https://www.kobo.com/{region}/{language}/ebook/{slug}",
  "book_detail_page_rakuten": "http://books.rakuten.co.jp/rk/{crossrevisionid}",
  "book_landing_page": "https://www.kobo.com/ebooks",
  "book_subscription": "https://storeapi.kobo.com/v1/products/books/subscriptions",
  "browse_history": "https://storeapi.kobo.com/v1/user/browsehistory",
  "categories": "https://storeapi.kobo.com/v1/categories",
  "categories_page": "https://www.kobo.com/ebooks/categories",
  "categoriesv2": "https://storeapi.kobo.com/api/v2/Categories/Top",
  "category": "https://storeapi.kobo.com/v1/categories/{CategoryId}",
  "category_featured_lists": "https://storeapi.kobo.com/v1/categories/{CategoryId}/featured",
  "category_products": "https://storeapi.kobo.com/v1/categories/{CategoryId}/products",
  "checkout_borrowed_book": "https://storeapi.kobo.com/v1/library/borrow",
  "client_authd_referral": "https://authorize.kobo.com/api/AuthenticatedReferral/client/v1/getLink",
  "configuration_data": "https://storeapi.kobo.com/v1/configuration",
  "content_access_book": "https://storeapi.kobo.com/v1/products/books/{ProductId}/access",
  "contributorsv2": "https://storeapi.kobo.com/v2/contributors/author",
  "createpurchaseifallowed_url": "https://www.kobo.com/checkout/createpurchaseifallowed",
  "customer_care_live_chat": "https://v2.zopim.com/widget/livechat.html?key=Y6gwUmnu4OATxN3Tli4Av9bYN319BTdO",
  "daily_deal": "https://storeapi.kobo.com/v1/products/dailydeal",
  "deals": "https://storeapi.kobo.com/v1/deals",
  "delete_entitlement": "https://storeapi.kobo.com/v1/library/{Ids}",
  "delete_tag": "https://storeapi.kobo.com/v1/library/tags/{TagId}",
  "delete_tag_items": "https://storeapi.kobo.com/v1/library/tags/{TagId}/items/delete",
  "delete_user_linked_accounts": "https://storeapi.kobo.com/v1/user/linkedaccounts/{Id}",
  "device_auth": "https://storeapi.kobo.com/v1/auth/device",
  "device_refresh": "https://storeapi.kobo.com/v1/auth/refresh",
  "dictionary_host": "https://ereaderfiles.kobo.com",
  "discovery_host": "https://discovery.kobobooks.com",
  "display_accessibility_enabled": "False",
  "display_parental_controls_enabled": "True",
  "dropbox_link_account_poll": "https://authorize.kobo.com/{region}/{language}/LinkDropbox",
  "dropbox_link_account_start": "https://authorize.kobo.com/LinkDropbox/start",
  "elabel_url": "https://ereaderfiles.kobo.com/elabels/",
  "ereaderdevices": "https://storeapi.kobo.com/v2/products/EReaderDeviceFeeds",
  "eula_page": "https://www.kobo.com/termsofuse?style=onestore",
  "exchange_auth": "https://storeapi.kobo.com/v1/auth/exchange",
  "external_book": "https://storeapi.kobo.com/v1/products/books/external/{Ids}",
  "facebook_sso_page": "https://authorize.kobo.com/signin/provider/Facebook/login?returnUrl=https://kobo.com/",
  "featured_list": "https://storeapi.kobo.com/v1/products/featured/{FeaturedListId}",
  "featured_lists": "https://storeapi.kobo.com/v1/products/featured",
  "featuredlist2": "https://storeapi.kobo.com/v2/products/list/featured",
  "fixed_layout_page_cache_enabled": "True",
  "free_books_page": {
    "EN": "https://www.kobo.com/{region}/{language}/p/free-ebooks",
    "FR": "https://www.kobo.com/{region}/{language}/p/livres-gratuits",
    "IT": "https://www.kobo.com/{region}/{language}/p/libri-gratuiti",
    "NL": "https://www.kobo.com/{region}/{language}/List/bekijk-het-overzicht-van-gratis-ebooks/QpkkVWnUw8sxmgjSlCbJRg",
    "PT": "https://www.kobo.com/{region}/{language}/p/livros-gratis"
  },
  "fte_feedback": "https://storeapi.kobo.com/v1/products/ftefeedback",
  "funnel_metrics": "https://storeapi.kobo.com/v1/funnelmetrics",
  "geography_data": "https://storeapi.kobo.com/v2/configuration/geography/country",
  "get_download_keys": "https://storeapi.kobo.com/v1/library/downloadkeys",
  "get_download_link": "https://storeapi.kobo.com/v1/library/downloadlink",
  "get_tests_request": "https://storeapi.kobo.com/v1/analytics/gettests",
  "giftcard_epd_redeem_url": "https://www.kobo.com/{storefront}/{language}/redeem-ereader",
  "giftcard_redeem_url": "https://www.kobo.com/{storefront}/{language}/redeem",
  "googledrive_link_account_start": "https://authorize.kobo.com/{region}/{language}/linkcloudstorage/provider/google_drive",
  "gpb_flow_enabled": "False",
  "help_page": "https://www.kobo.com/help",
  "image_host": "//cdn.kobo.com/book-images/",
  "image_url_quality_template": "https://cdn.kobo.com/book-images/{ImageId}/{Width}/{Height}/{Quality}/{IsGreyscale}/image.jpg",
  "image_url_template": "https://cdn.kobo.com/book-images/{ImageId}/{Width}/{Height}/false/image.jpg",
  "instapaper_enabled": "True",
  "instapaper_env_url": "https://www.instapaper.com/api/kobo",
  "instapaper_link_account_start": "https://authorize.kobo.com/{region}/{language}/linkinstapaper",
  "kobo_audiobooks_credit_redemption": "True",
  "kobo_audiobooks_enabled": "True",
  "kobo_audiobooks_orange_deal_enabled": "True",
  "kobo_audiobooks_subscriptions_enabled": "True",
  "kobo_display_price": "True",
  "kobo_dropbox_link_account_enabled": "True",
  "kobo_google_tax": "False",
  "kobo_googledrive_link_account_enabled": "True",
  "kobo_nativeborrow_enabled": "False",
  "kobo_onedrive_link_account_enabled": "False",
  "kobo_onestorelibrary_enabled": "False",
  "kobo_privacyCentre_url": "https://www.kobo.com/privacy",
  "kobo_redeem_enabled": "True",
  "kobo_shelfie_enabled": "False",
  "kobo_shopping_cart_enabled": "False",
  "kobo_subscriptions_enabled": "True",
  "kobo_superpoints_enabled": "False",
  "kobo_wishlist_enabled": "True",
  "library_book": "https://storeapi.kobo.com/v1/user/library/books/{LibraryItemId}",
  "library_items": "https://storeapi.kobo.com/v1/user/library",
  "library_metadata": "https://storeapi.kobo.com/v1/library/{Ids}/metadata",
  "library_prices": "https://storeapi.kobo.com/v1/user/library/previews/prices",
  "library_search": "https://storeapi.kobo.com/v1/library/search",
  "library_sync": "https://storeapi.kobo.com/v1/library/sync",
  "love_dashboard_page": "https://www.kobo.com/{region}/{language}/kobosuperpoints",
  "love_points_redemption_page": "https://www.kobo.com/{region}/{language}/KoboSuperPointsRedemption?productId={ProductId}",
  "magazine_landing_page": "https://www.kobo.com/emagazines",
  "more_sign_in_options": "https://authorize.kobo.com/signin?returnUrl=https://kobo.com/#allProviders",
  "morebyauthor": "https://storeapi.kobo.com/v2/products/recommendations/morebyauthor",
  "notebooks": "https://storeapi.kobo.com/api/internal/notebooks",
  "notifications_registration_issue": "https://storeapi.kobo.com/v1/notifications/registration",
  "oauth_host": "https://oauth.kobo.com",
  "optimus_enabled": "False",
  "password_retrieval_page": "https://www.kobo.com/passwordretrieval.html",
  "patch_user_linked_accounts": "https://storeapi.kobo.com/v1/user/linkedaccounts/{Id}",
  "personalizedrecommendations": "https://storeapi.kobo.com/v2/users/personalizedrecommendations",
  "pocket_link_account_start": "https://authorize.kobo.com/{region}/{language}/linkpocket",
  "post_analytics_event": "https://storeapi.kobo.com/v1/analytics/event",
  "ppx_purchasing_url": "https://purchasing.kobo.com",
  "privacy_page": "https://www.kobo.com/privacypolicy?style=onestore",
  "product_nextread": "https://storeapi.kobo.com/v1/products/{ProductIds}/nextread",
  "product_prices": "https://storeapi.kobo.com/v1/products/{ProductIds}/prices",
  "product_recommendations": "https://storeapi.kobo.com/v1/products/{ProductId}/recommendations",
  "product_reviews": "https://storeapi.kobo.com/v1/products/{ProductIds}/reviews",
  "productbyid": "https://storeapi.kobo.com/v2/products/itemDetailById/{ProductType}/{Id}",
  "productbyslug": "https://storeapi.kobo.com/v2/products/itemDetail/{ProductType}/{Slug}",
  "products": "https://storeapi.kobo.com/v1/products",
  "productstatebyid": "https://storeapi.kobo.com/v2/products/itemStateById/{ProductType}/{Id}",
  "productstatebyslug": "https://storeapi.kobo.com/v2/products/itemState/{ProductType}/{Slug}",
  "productsv2": "https://storeapi.kobo.com/v2/products",
  "provider_external_sign_in_page": "https://authorize.kobo.com/ExternalSignIn/{providerName}?returnUrl=https://kobo.com/",
  "purchase_buy": "https://www.kobo.com/checkoutoption/",
  "purchase_buy_templated": "https://www.kobo.com/{region}/{language}/checkoutoption/{ProductId}",
  "quickbuy_checkout": "https://storeapi.kobo.com/v1/store/quickbuy/{PurchaseId}/checkout",
  "quickbuy_create": "https://storeapi.kobo.com/v1/store/quickbuy/purchase",
  "rakuten_token_exchange": "https://storeapi.kobo.com/v1/auth/rakuten_token_exchange",
  "rating": "https://storeapi.kobo.com/v1/products/{ProductId}/rating/{Rating}",
  "reading_services_host": "https://readingservices.kobo.com",
  "reading_state": "https://storeapi.kobo.com/v1/library/{Ids}/state",
  "recommendations": "https://storeapi.kobo.com/v1/products/bulk",
  "redeem_interstitial_page": "https://www.kobo.com",
  "redeem_loyalty_points": "https://storeapi.kobo.com/v1/user/loyalty/redeem",
  "reflowable_page_cache_enabled": "True",
  "registration_page": "https://authorize.kobo.com/signup?returnUrl=https://kobo.com/",
  "related": "https://storeapi.kobo.com/v2/products/recommendations/related",
  "related_items": "https://storeapi.kobo.com/v1/products/{Id}/related",
  "remaining_book_series": "https://storeapi.kobo.com/v1/products/books/series/{SeriesId}",
  "rename_tag": "https://storeapi.kobo.com/v1/library/tags/{TagId}",
  "review": "https://storeapi.kobo.com/v1/products/reviews/{ReviewId}",
  "review_sentiment": "https://storeapi.kobo.com/v1/products/reviews/{ReviewId}/sentiment/{Sentiment}",
  "sepa_banks": "https://storeapi.kobo.com/v2/purchasing/sepa/banks",
  "shelfie_recommendations": "https://storeapi.kobo.com/v1/user/recommendations/shelfie",
  "sign_in_page": "https://auth.kobobooks.com/ActivateOnWeb",
  "social_authorization_host": "https://social.kobobooks.com:8443",
  "social_host": "https://social.kobobooks.com",
  "store_home": "www.kobo.com/{region}/{language}",
  "store_host": "www.kobo.com",
  "store_newreleases": "https://www.kobo.com/{region}/{language}/List/new-releases/961XUjtsU0qxkFItWOutGA",
  "store_search": "https://www.kobo.com/{region}/{language}/Search?Query={query}",
  "store_top50": "https://www.kobo.com/{region}/{language}/ebooks/Top",
  "subs_landing_page": "https://www.kobo.com/{region}/{language}/plus",
  "subs_management_page": "https://www.kobo.com/{region}/{language}/account/subscriptions",
  "subs_purchase_buy_templated": "https://www.kobo.com/{region}/{language}/Checkoutoption/{ProductId}/{TierId}",
  "subscription_publisher_price_page": "https://www.kobo.com/{region}/{language}/subscriptionpublisherprice",
  "tag_items": "https://storeapi.kobo.com/v1/library/tags/{TagId}/Items",
  "tags": "https://storeapi.kobo.com/v1/library/tags",
  "taste_profile": "https://storeapi.kobo.com/v1/products/tasteprofile",
  "terms_of_sale_page": "https://authorize.kobo.com/{region}/{language}/terms/termsofsale",
  "text_to_speech_region_override": "False",
  "topproducts": "https://storeapi.kobo.com/v2/products/list/topproducts",
  "tracking": "https://storeapi.kobo.com/v2/tracking/searchperformed",
  "update_accessibility_to_preview": "https://storeapi.kobo.com/v1/library/{EntitlementIds}/preview",
  "use_one_store": "True",
  "user_currencyconversion": "https://storeapi.kobo.com/v1/user/currency/convert",
  "user_linked_accounts": "https://storeapi.kobo.com/v1/user/linkedaccounts",
  "user_loyalty_benefits": "https://storeapi.kobo.com/v1/user/loyalty/benefits",
  "user_loyalty_membership": "https://storeapi.kobo.com/v1/user/loyalty/membership",
  "user_platform": "https://storeapi.kobo.com/v1/user/platform",
  "user_profile": "https://storeapi.kobo.com/v1/user/profile",
  "user_ratings": "https://storeapi.kobo.com/v1/user/ratings",
  "user_recommendations": "https://storeapi.kobo.com/v1/user/recommendations",
  "user_reviews": "https://storeapi.kobo.com/v1/user/reviews",
  "user_subscription_koboplus": "https://storeapi.kobo.com/v1/user/subscription/kp/state",
  "user_tasteprofile_complete": "https://storeapi.kobo.com/v2/user/tasteprofile/complete",
  "user_tasteprofile_genre": "https://storeapi.kobo.com/v2/user/tasteprofile/genre",
  "user_wishlist": "https://storeapi.kobo.com/v1/user/wishlist",
  "userguide_host": "https://ereaderfiles.kobo.com",
  "wishlist_page": "https://www.kobo.com/{region}/{language}/account/wishlist",
  "workbooks": "https://storeapi.kobo.com/v2/products/workbooks"
}`

// @Component
component(KoboProxy, { inject: [ObjectMapper, KomgaSyncTokenGenerator, KomgaSettingsProvider] })
