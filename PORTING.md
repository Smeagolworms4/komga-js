# Portage à plat de Komga (Kotlin → TypeScript)

Objectif : le **même logiciel**, ligne pour ligne, avec seulement le langage et les
bibliothèques remplacés. Les frontends (`komga-webui`, `next-ui`) sont servis tels quels.
Quand Komga évolue, on doit pouvoir reporter les changements en lisant le diff Kotlin.

Révision upstream portée : voir `UPSTREAM_REF` (Komga 1.27.1 au départ).
`upstream/` pointe vers le clone Komga.

## Règles de portage

1. **Un fichier Kotlin = un fichier TS**, même chemin, même nom
   (`org/gotson/komga/` est retiré du préfixe) :
   | Kotlin | TypeScript |
   |---|---|
   | `komga/src/main/kotlin/org/gotson/komga/<p>/X.kt` | `src/<p>/X.ts` |
   | `komga/src/flyway/kotlin/<p>/X.kt` | `src/flyway/<p>/X.ts` |
   | `komga/src/test/kotlin/org/gotson/komga/<p>/X.kt` | `test/<p>/X.test.ts` |
   | `komga/src/*/resources/...` | `resources/...` (copie identique : SQL, polices, fixtures) |
2. **En-tête obligatoire** en première ligne : `// @port-of <chemin kotlin>@<sha>`.
3. **Même ordre, mêmes noms** : classes, méthodes, propriétés, constantes, branches `when`
   et paramètres restent dans l'ordre du Kotlin, pour que les deux fichiers se lisent côte à côte.
   Pas de refactoring, pas d'« amélioration » : un bug upstream est reproduit tel quel
   (on peut le signaler par un commentaire `// UPSTREAM-BUG:`).
4. **Écarts obligatoires** marqués `// PORT: <raison>` (API d'une lib différente,
   absence d'équivalent JVM…). Tout écart qui n'est pas marqué est un bug de portage.
5. **Tests** : chaque `@Test` ou `@ParameterizedTest` Kotlin devient un `it('<nom exact>')`
   dans le fichier jumeau, et chaque classe `@Nested` devient un `describe('<NomClasse>')`.
   Les assertions sont les mêmes, dans le même ordre.
6. **API** : les réponses HTTP (JSON, en-têtes, codes, pagination, erreurs) doivent être
   identiques octet pour octet à celles de Komga, à l'ordre des clés JSON près.

## Correspondance des bibliothèques

| Komga (JVM) | KomgaJS |
|---|---|
| Spring MVC / WebFlux | Fastify |
| Spring DI (`@Component`) | construction explicite dans `src/Application.ts` (même graphe) |
| jOOQ + sqlite-jdbc | Kysely + better-sqlite3 |
| Flyway (SQL + migrations Kotlin) | runner maison qui lit les mêmes fichiers SQL et écrit dans la même table `flyway_schema_history` |
| Spring Security, sessions, OAuth2 | `@fastify/session`, `openid-client` |
| Lucene 9.9.1 | `src/port/lucene/` : portage TS du sous-ensemble utilisé (analyseurs, index, QueryParser, BM25), identique à Lucene sur 7 148 recherches ; format disque propre (index reconstruit si absent, comme Komga) |
| Thumbnailator / ImageIO / TwelveMonkeys | sharp (libvips) ; JPEG : libjpeg 6b + LittleCMS du JDK (`native/komga_jpeg.c`, `src/port/jpeg-jdk.ts`) |
| commons-compress / junrar | yauzl, node-unrar-js, libarchive.js |
| PDFBox | mupdf (wasm) |
| jsoup | `src/port/jsoup-parser.ts` : portage à plat de l'analyseur de jsoup 1.23.1 (tokeniseur, arbres HTML/XML, positions, sélecteurs utilisés, détection du jeu de caractères) |
| Jackson (JSON/XML) | JSON natif, fast-xml-parser |
| Caffeine | lru-cache |
| icu4j | Intl, plus `icu` si nécessaire |
| JUnit 5, AssertJ, MockK, MockMvc | Vitest, `expect`, `vi.mock`, `fastify.inject` |

## Garde-fous

- `node tools/port-status.mjs` : avancement (fichiers, lignes, tests) et détection
  des fichiers manquants, périmés, sans en-tête, ou avec des tests absents. Doit sortir avec le code 0 en CI.
- **Couverture** : chaque fichier TS doit avoir une couverture de lignes au moins égale
  à celle de son jumeau Kotlin (rapport JaCoCo dans `coverage-baseline/`).
  Les lignes Kotlin non couvertes reçoivent de nouveaux tests, écrits d'abord en Kotlin
  (pour valider le comportement attendu sur l'original), puis portés.
- **Tests de contrat** (`test/contract/`) : les mêmes requêtes HTTP sont rejouées sur le
  Komga JVM et sur KomgaJS avec la même base et la même bibliothèque, puis les réponses sont comparées.
- **Schéma OpenAPI** : chaque réponse est validée contre le schéma OpenAPI généré par Komga.

## Suivre une nouvelle version de Komga

```bash
git -C upstream fetch --tags origin
node tools/upstream-diff.mjs 1.28.0 --stat   # liste des fichiers touchés et de leurs jumeaux
node tools/upstream-diff.mjs 1.28.0          # diffs complets à reporter
# reporter chaque diff dans le jumeau, puis passer son en-tête @port-of au nouveau sha
echo <sha> > UPSTREAM_REF
node tools/port-status.mjs                   # doit indiquer 0 fichier périmé
```

## Conventions de traduction Kotlin → TypeScript

Le support commun est dans `src/port/` (sans jumeau Kotlin) :
`kotlin.ts` (data class, enum, exceptions, collections), `tsid.ts`, `java.ts` (URL/Path),
`jackson.ts` (annotations JSON, `Class.forName`), `validation.ts` (annotations jakarta).
Modèles de référence déjà portés : `src/domain/model/{Book,Media,Library,KomgaUser,MediaExtension,R2Locator}.ts`.

| Kotlin | TypeScript |
|---|---|
| `data class X(val a: T, val b: U = d)` | `class X extends DataClass<XParams>` : champs `readonly` dans le même ordre, constructeur `({ a, b = d }: XParams)` (défauts de déstructuration = sémantique Kotlin, une valeur par défaut peut référencer un paramètre précédent) |
| Appel `X(a, b)` ou `X(a = .., b = ..)` | `new X({ a: .., b: .. })` (toujours nommé) |
| `x.copy(a = ..)` | `x.copy({ a: .. })` |
| `==` / `!=` sur objets | `eq(a, b)` ; sur primitives et enums : `===` |
| classe non-data avec `equals`/`hashCode` | `implements Equatable`, méthodes portées telles quelles |
| `enum class E { A, B }` | `class E extends KEnum { static readonly A = new E('A') ... }` ; `E.entries()`, `E.valueOf(s)`, `e.name`, `e.ordinal` |
| enum avec propriétés | constructeur privé `(name, ...props)` appelant `super(name)` |
| type imbriqué `X.Y` | `export namespace X { export class Y ... }` après la classe |
| `companion object` | membres `static` |
| `val p by lazy { }` | `get p() { return lazy(this, 'p', () => ...) }` |
| `T?` | `T \| null` (jamais `undefined` dans le modèle) |
| `x!!` | `nn(x)` |
| `x?.let { }` / `?:` | `x !== null ? ... : ...` / `??` |
| `when { }` | `if / else if` dans le même ordre (ou `switch` pour un `when (x)` sur enum) |
| `Int`, `Long`, `Double` | `number` (`// PORT: Long` si la valeur peut dépasser 2^53) |
| `Float` | `number` arrondi en float32 à chaque affectation : `this.x = kFloat(x)` ; affichage `javaFloatToString(x)` |
| `ByteArray` | `Uint8Array` |
| `List<T>` / `Set<T>` / `Map<K,V>` | `T[]` / `Set<T>` / `Map<K,V>` (`ReadonlySet` en paramètre) |
| `setOf(..)`, `emptySet()` | `new Set([..])`, `new Set()` |
| `listOf(..)`, `emptyList()` | `[..]`, `[]` |
| fonctions d'extension `fun A.f()` | fonction exportée `f(self: A, ...)` dans le fichier jumeau |
| fonctions d'extension de collection de la stdlib | helpers de `port/kotlin.ts` (`mapNotNull`, `associateBy`, `groupBy`, `sortedBy`, `intersect`, `distinct`…) |
| paramètres nommés / par défaut d'une fonction | les paramètres obligatoires en position, les paramètres par défaut dans un objet final `{ a = d }: {...} = {}` |
| surcharges | une seule fonction avec union de types, marquée `// PORT:` |
| `LocalDateTime`, `LocalDate`, `ZonedDateTime`, `Duration` | `@js-joda/core` (API identique) |
| `URL` | `URL` global ; `Path` = `string` ; `url.toURI().toPath()` = `urlToPath(url)` |
| `TsidCreator.getTsid256().toString()` | identique, depuis `port/tsid.ts` |
| exceptions | classes étendant `Exception`/`RuntimeException` de `port/kotlin.ts`, même hiérarchie |
| `require` / `check` / `error` | idem depuis `port/kotlin.ts` |
| annotations jakarta (`@NotBlank`…) | `constraints(Classe, { prop: [NotBlank()] })` en fin de fichier |
| annotations Jackson (`@JsonInclude`…) | `json(Classe, { include: 'NON_EMPTY' })` en fin de fichier |
| nom qualifié stocké en base (`Class.forName`) | `registerClass('org.gotson.komga...X', X)` |
| KDoc et commentaires | recopiés tels quels |

Tests : `describe('<ClasseDeTest>')`, `describe('<Nested>')`, `it('<nom exact>')`.
AssertJ → `expect` de Vitest ; `.as("msg")` → `expect(x, 'msg')` ; `containsExactlyInAnyOrder` → comparaison après tri ;
MockK → `vi.fn()` / objets factices ; `Thread.sleep` → `threadSleep`.

## Écarts connus et assumés

| Sujet | Écart | Impact |
|---|---|---|
| gzip (`GZIPOutputStream`) | octets compressés différents de la JVM (même contenu décompressé) | aucun : relu par Komga et KomgaJS |
| SQLite : compilation | better-sqlite3 est compilé différemment de sqlite-jdbc. Écarts corrigés au chargement par `native/komga_sqlite.c` : DQS (guillemets doubles). **À traiter** : `MAX_VARIABLE_NUMBER` 32766 contre 250000 (recompiler better-sqlite3 avec les options de sqlite-jdbc) ; `LIKE_DOESNT_MATCH_BLOBS` | à vérifier au portage des DAO |
| Collations ICU | ICU4C du système (74) au lieu d'ICU4J 78 | ordre identique sur les jeux de test ; différences possibles sur des caractères très rares |

## Stockage SQLite (jOOQ 3.19 + sqlite-jdbc), relevé sur les vraies bibliothèques

À respecter par la couche d'accès aux données TS pour que les bases restent interchangeables :

| Type jOOQ / Kotlin | Écrit en base | Relu |
|---|---|---|
| `LOCALDATETIME` / `LocalDateTime` | texte `Timestamp.toString()` : `'2024-03-05 07:08:09.123456789'`, zéros finaux retirés, au moins `.0` (`'2024-03-05 07:08:09.0'`) | précision milliseconde |
| `CURRENT_TIMESTAMP` (défaut SQL) | texte `'2026-09-28 09:56:56'` | idem |
| `LOCALDATE` | texte `'2024-03-05'` | |
| `BOOLEAN` | entier `1` / `0` | |
| `REAL` / `Float` | le float32 élargi en double : `0.1f` → `0.10000000149011612` (`Math.fround` avant écriture) | float32 |
| `INTEGER`, `BIGINT` | entier | `number` (`bigint` au-delà de 2^53) |
| `BLOB` | octets | `Uint8Array` |

## Conventions : couche d'accès aux données (DAO)

Référence : `src/infrastructure/jooq/main/LibraryDao.ts` et `test/infrastructure/jooq/main/LibraryDaoTest.test.ts`.

| Kotlin | TypeScript |
|---|---|
| `interface XRepository` (domain/persistence) | `export abstract class XRepository { abstract ... }` (jeton d'injection) |
| `@Component class XDao(dslRW, @Qualifier("dslContextRO") dslRO) : SplitDslDaoBase(...), XRepository` | `class XDao extends SplitDslDaoBase implements XRepository` + `component(XDao, { inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }], types: [XRepository] })` en fin de fichier |
| `@param:Value("#{@komgaProperties.database.batchChunkSize}") batchSize: Int` | `{ expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize }` dans `inject` |
| `private val b = Tables.BOOK` | `private readonly b = Tables.BOOK` (depuis `port/jooq/generated/main/Tables.js`) ; usage `this.b.ID` |
| DSL jOOQ | même chaîne d'appels (`port/jooq/core.ts`, `port/jooq/dsl.ts`) : `` `in`(x) `` → `.in(x)`, `DSL.xxx` → `DSL.xxx` |
| `record.field` (records générés) | idem, propriétés camelCase générées (`self.importComicinfoBook`) |
| `it[b.ID]` | `it.get(this.b.ID)` |
| fonction d'extension privée `DSLContext.selectBase()` / `XRecord.toDomain()` | méthode privée `selectBase(self: DSLContext)` / `toDomain(self: XRecord)` au même endroit |
| `@Transactional fun f() { ... }` | `f() { transactional(this.dslRW.db, () => { ... }) }` précédé du commentaire `// @Transactional` |
| `@Transactional(readOnly = true)` | `transactional(this.dslRW.db, () => ..., { readOnly: true })` |
| `dsl.withTempTable(batchSize, ids).use { t -> ... }` | `use(TempTable.withTempTable(dsl, batchSize, ids), (t) => ...)` (depuis `infrastructure/jooq/TempTable.js`) |
| `fetchCount` renvoyant `Int` puis `.toLong()` | `number` |
| tests `@SpringBootTest` + `@Autowired` | `const ctx = springBootTest()` (`test/SpringBootTest.ts`), `ctx.getBean(XDao)`, `afterAll(() => closeContext(ctx))` ; importer le module du DAO testé et de ses dépendances |
| `@AfterEach` / `@BeforeAll` / `@AfterAll` | `afterEach` / `beforeAll` / `afterAll` de Vitest, dans le `describe` |
| `assertThat(date).isCloseTo(now, offset)` | `expectCloseTo(date, now)` (`test/infrastructure/jooq/TestUtils.ts`) |

## Conventions : JSON (Jackson)

`ObjectMapper` (`src/port/jackson-mapper.ts`) reproduit l'ObjectMapper de Spring Boot configuré par Komga
(vérifié contre les vraies classes Komga, `test/port/jackson-mapper.test.ts`). La réflexion Kotlin est remplacée par
des déclarations en fin de fichier jumeau, pour toute classe qui passe par Jackson (DTO, blobs JSON en base) :

| Kotlin / Jackson | TypeScript |
|---|---|
| types des propriétés du constructeur | `jsonProperties(X, { a: 'String', n: 'Int', f: 'Float', d: { nullable: JsonTypes.LocalDateTime }, l: { list: { class: Y } } }, [], { required: ['a'] })` |
| paramètre non nul sans valeur par défaut | listé dans `required` (MissingKotlinParameterException si absent ou null) |
| `T?` | `{ nullable: T }` |
| `@JsonProperty("n")`, `@JsonIgnore`, `@JsonInclude` | `json(X, { rename: { a: 'n' }, ignore: ['b'], include: 'NON_NULL' })` |
| `@JsonTypeInfo(use = NAME, property = "p")` + `@JsonTypeName("t")` | `json(Base, { typeInfo: { property: 'p' } })`, `json(Sub, { typeName: 't' })` |
| `@JsonTypeInfo(use = DEDUCTION)` | `jsonTypeInfoDeduction(Base)` |
| `sealed interface` / `sealed class` | `sealedInterface('Name', () => [Sub1, Sub2])` (`port/kotlin.ts`) |
| getter calculé sérialisé (`val x get() = ...`) | `jsonProperties(..., { getters: ['x'] })` |
| `mapper.readValue<T>(json)` | `mapper.readValue<T>(json, { class: T })` |

## Architecture d'exécution (bloquant Kotlin → Node)

- Accès base et transactions **synchrones** (better-sqlite3), comme le code Kotlin bloquant ; `transactional()` refuse une fonction asynchrone.
  Vérifié : les blocs `@Transactional` / `transactionTemplate` de Komga ne font que des accès base (et des suppressions de fichiers, faites en synchrone).
- Système de fichiers : API synchrones de `node:fs` quand le Kotlin est bloquant.
- `async`/`await` uniquement quand une bibliothèque l'impose (traitement d'image, flux HTTP) ; la fonction Kotlin garde son nom, devient `async`, et ses appelants font `await` (`// PORT: async`).
- Les tâches (scan, analyse, miniatures…), exécutées par Komga dans un pool de threads, s'exécuteront dans des `worker_threads` avec leur propre contexte et leurs connexions, pour ne pas bloquer le serveur HTTP.

| Index de recherche | format disque propre (journal JSONL ré-analysé à l'ouverture, ~8 s pour 50 000 livres) ; statistiques BM25 sur les documents vivants (Lucene compte aussi les supprimés jusqu'à la fusion des segments) | ordre de pertinence identique après fusion ; à surveiller : RAM de l'index en mémoire |
| Images (miniatures, conversions) | pixels légèrement différents (sharp lanczos3 contre Thumbnailator bilinéaire progressif, encodeur PNG différent) ; dimensions, formats, décisions identiques (122 fichiers, oracle Komga) | visuel négligeable |
| JPEG (lecture, écriture, `BookAnalyzer.hashPage`) | octets identiques à Komga sur Temurin 21 (JDK 23 vérifié identique sur 61 cas) (libjpeg 6b et LittleCMS 2.19 du JDK compilés dans `build/komgajpeg.node`, logique TwelveMonkeys dans `src/port/jpeg-jdk.ts` ; `test/port/jpeg-jdk.test.ts`, 208 cas). Non reproduits (sharp) : JPEG sans perte (SOF3), CMYK avec un profil ICC non CMYK. Le cache global de TwelveMonkeys (16 profils ICC) est reproduit par processus (un par worker). Un JDK de distribution lié à la libjpeg-turbo du système (OpenJDK Ubuntu) donne lui-même d'autres octets (4:4:0, progressifs tronqués) | empreintes de pages identiques à celles de l'image Docker de Komga |
| Rendu PDF | mupdf au lieu de PDFBox : pixels différents | visuel |

## À optimiser (mémoire)

- Charger à la demande les modules lourds (sharp, mupdf wasm, libheif-js, @jsquash/jxl) : premier usage seulement.
- Mesurer la RAM de l'index de recherche en mémoire sur une grosse bibliothèque.
