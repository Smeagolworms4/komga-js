# Portage à plat de Komga (Kotlin → TypeScript)

Objectif : le **même logiciel**, ligne pour ligne, avec seulement le langage et les
bibliothèques remplacés. Les frontends (`komga-webui`, `next-ui`) sont servis tels quels.
Quand Komga évolue, on doit pouvoir reporter les changements en lisant le diff Kotlin.

Révision upstream portée : voir `UPSTREAM_REF` (Komga 1.27.1 au départ).
`upstream/` pointe vers le clone Komga.

## Règles de portage

### Écarts volontaires avec Komga (règle obligatoire)

Quand le portage s'écarte volontairement du comportement ou du code de Komga (performance, mémoire, asynchrone,
SQLite…), l'écart doit rester visible face au Kotlin :

1. **le code Kotlin d'origine est gardé en commentaire** à l'endroit de l'écart, tel quel ;
2. **la différence et sa raison sont écrites** juste au-dessus (`// PORT: écart — …`) : ce qui change, pourquoi, et
   l'impact observable (ou « aucun ») ;
3. **la nouvelle implémentation est isolée dans une fonction à part, documentée** (JSDoc : ce qu'elle fait, en quoi elle
   diffère de Komga, comment revenir au comportement d'origine si c'est réglable), appelée depuis le jumeau ; le
   jumeau garde ainsi la forme du fichier Kotlin et le diff d'une future version de Komga se reporte au même endroit ;
4. l'écart est ajouté au tableau « Écarts connus et assumés ».

```ts
// PORT: écart — les insertions de métadonnées d'un lot sont validées dans une seule transaction (Komga : une par
// livre) ; aucun impact sur les données, un crash annule le lot entier, repris au scan suivant.
// Kotlin : books.forEach { bookMetadataRepository.insert(it) }
insertMetadataBatch(this.bookMetadataRepository, books)
```


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

## Tests unitaires à oracle (`test/unit/`)

But : chaque fonction Kotlin (inventaire `coverage-baseline/kotlin-functions.json`, 1 384 fonctions avec du code)
est appelée sur le vrai Komga avec de nombreux cas limites, et son jumeau TS doit rendre exactement le même résultat.
Rapides : pas de contexte Spring (ni côté Kotlin ni côté TS), SQLite en mémoire seulement quand un DAO l'exige.

- **Oracle Kotlin** : branche `unit-oracles` du fork (https://github.com/Smeagolworms4/komga), un test par fichier Kotlin :
  `komga/src/test/kotlin/org/gotson/komga/oracle/<p>/XOracleTest.kt` pour `.../komga/<p>/X.kt`, qui étend `OracleTest`
  (`oracle/Oracle.kt`) et déclare `cases()` : `func("nomExact") { case("description") { ... } }`. Surcharges ou
  fonctions homonymes du même fichier : `func("nom@<ligne>")` (ligne de l'inventaire). Le résultat (ou l'exception)
  est écrit sous forme canonique (`Canon`) dans `test/unit/fixtures/<p>/X.json`.
- **Jumeau TS** : `test/unit/<p>/X.test.ts`, mêmes cas dans le même ordre :
  `const { func, kase, deviation } = oracle('<p>/X')`, `func('nomExact', () => { kase('description', () => ...) })`.
  `canon.ts` est le miroir exact de `Canon` (KEnum → `{"@enum"}`, data class → `{"@class", champs dans l'ordre du
  constructeur}`, Set → `{"@set"}`, Map → `{"@map"}`, dates js-joda → `{"@time": toString()}`, Path = chaîne,
  exception → `{"@throws": nom, message}`). Un cas de la fixture non rejoué fait échouer le fichier.
  Aides partagées : `oracleBytes(n)` / `tempDir()` / `exceptionType { }` (mêmes noms des deux côtés).
- **Écart** : un cas qui diffère est un bug de portage, corrigé dans `src/`. Seul un écart assumé (bibliothèque,
  voir tableau ci-dessous) est déclaré par `deviation('description', 'raison')`.
- **Base de données** (DAO, services) : `OracleDb` (`oracle/OracleDb.kt`) et son miroir `test/unit/db.ts`, sans Spring.
  Base principale SQLite `:memory:` sur `SqliteUdfDataSource` (REGEXP, UDF, collations), clés étrangères actives,
  migrée par Flyway comme au démarrage de Komga (SQL + migrations code, placeholders par défaut) ; base des tâches
  (paresseuse) ; `dsl` / `tasksDsl` construits comme `KomgaJooqConfiguration` (le même contexte sert de RW et RO) ;
  chaque DAO en propriété paresseuse au même nom des deux côtés (`db.libraryDao`, `db.bookDtoDao`, `db.tasksDao`...),
  avec `batchSize` par défaut, l'ObjectMapper de Spring Boot (`db.mapper`) et un index Lucene en mémoire (`db.lucene`) ;
  `db.rawQuery(sql)` lit les valeurs stockées. Une base par fichier de test (`private val db = OracleDb()` /
  `const db = new OracleDb()`), partagée par ses cas qui s'exécutent dans l'ordre : toute écriture se fait *dans* un
  `case` / `kase` (jamais au niveau de `func`), pour que l'état soit le même aux deux endroits. `@Transactional` n'est
  appliqué d'aucun côté. Côté TS, les modules natifs sont nécessaires (`npm run build:native`).
- **Ids et dates générés** : les cas fixent eux-mêmes ids et dates (`id = "L1"`, dates fixes loin d'aujourd'hui).
  Ce que le code testé génère (TSID, `LocalDateTime.now()`, dates par défaut de la base) est neutralisé par
  `stable(valeur)` (même aide des deux côtés, appliquée à la forme canonique) : chaque TSID devient `"@id:<n>"`
  (numéroté par ordre d'apparition dans la valeur) et chaque `{"@time"}` à deux jours près d'aujourd'hui devient
  `{"@time": "@now"}`. Les messages des erreurs SQL (qui contiennent la requête) ne sont pas comparés : `exceptionType { }`.
  Un ordre qui dépend de ces dates n'est pas reproductible : dates de la base (`CURRENT_TIMESTAMP`, à la seconde, un
  changement de seconde pendant le remplissage suffit), `now()` (à la milliseconde côté JS, à la microseconde côté JVM :
  ex æquo possibles d'un seul côté), tri explicite ou `GROUP BY` (SQLite rend les groupes triés sur leurs colonnes,
  `CREATED_DATE` en tête). Les cas concernés fixent ces dates (`db.dsl.execute("update ... set CREATED_DATE = ...")`).
  De même l'ordre brut de readdir dépend du système de fichiers (graine de hachage ext4) : l'enregistrer trié.
- **Collaborateurs** des services / contrôleurs : de préférence les vrais DAO sur `OracleDb` ; un faux (mock) n'est
  admis que s'il est écrit de façon identique des deux côtés (même classe, mêmes réponses), dans le fichier de test.
- Fuseau `Europe/Paris` et locale `en_US` des deux côtés (propriété Gradle `oracleOut`, `vitest.unit.config.ts`).
  Les valeurs dépendant de la machine (chemins temporaires, messages d'erreur du système) ne sont pas enregistrées.

```bash
tools/run-kotlin-oracles.sh                          # tous les oracles (Gradle, ../komga-oracle, JDK 21)
tools/run-kotlin-oracles.sh language/LanguageUtils 'domain/model/*'
npm run test:unit                                    # jumeaux TS (sans Java : les fixtures sont versionnées)
npm run test:unit:coverage                           # fonctions de l'inventaire couvertes, par paquet
node tools/oracle-coverage.mjs --missing domain/model  # fonctions restantes d'un paquet
```

En CI : `npm run test:unit` (build.yml de KomgaJS) ; côté fork, `.github/workflows/oracles.yml` relance les oracles
et vérifie que les fixtures produites sont identiques à celles de la branche `unit-tests` de KomgaJS.

## Suivre une nouvelle version de Komga

```bash
git -C upstream fetch --tags origin
node tools/upstream-diff.mjs 1.28.0 --stat   # liste des fichiers touchés et de leurs jumeaux
node tools/upstream-diff.mjs 1.28.0          # diffs complets à reporter
node tools/upstream-report.mjs 1.28.0        # résumé Markdown (jumeaux, lignes, tests, migrations, interfaces web)
# reporter chaque diff dans le jumeau, puis passer son en-tête @port-of au nouveau sha
echo <sha> > UPSTREAM_REF
node tools/port-status.mjs                   # doit indiquer 0 fichier périmé
```

Le workflow `.github/workflows/upstream-watch.yml` (chaque jour, ou à la main) compare la dernière version publiée de
Komga à `UPSTREAM_REF` et ouvre ou met à jour une issue « Komga <tag> released — port the diff » (étiquette `upstream`)
avec ce résumé ; le diff complet est joint au run.

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
| `setOf(..)`, `emptySet()` | `new Set([..])`, `new Set()` (éléments primitifs, enums) |
| `mutableSetOf` / `toSet()` / `mutableMapOf` / `toMap()` / `HashMap` avec éléments ou clés objets (data class, URL, java.time…) | `new LinkedHashSet(..)` / `new LinkedHashMap(..)` de `port/kotlin.ts` : sous-classes de `Set` / `Map` natifs, appartenance par `equals`/`hashCode` (seaux par `hash()`), ordre d'insertion ; `HashSet` / `HashMap` idem (ordre Java des seaux non reproduit, voir `javaHashSet`). Jamais de recherche linéaire par `eq` dans une boucle |
| `listOf(..)`, `emptyList()` | `[..]`, `[]` |
| fonctions d'extension `fun A.f()` | fonction exportée `f(self: A, ...)` dans le fichier jumeau |
| fonctions d'extension de collection de la stdlib | helpers de `port/kotlin.ts` (`mapNotNull`, `associateBy`, `groupBy`, `sortedBy`, `intersect`, `distinct`…) ; ceux qui rendent un Set ou une Map rendent un `LinkedHashSet` / `LinkedHashMap` (clés structurelles, comme Kotlin) |
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
| Exceptions js-joda | `DateTimeException` là où java.time lève sa sous-classe `UnsupportedTemporalTypeException` (même message) | aucun : Komga n'intercepte pas ces exceptions |
| Casse Unicode | Node suit Unicode 17, le JDK 21 Unicode 15 : `Character.toUpperCase`/`toLowerCase` (`charToUpperCase`...) diffèrent sur 110 caractères ajoutés depuis | négligeable |
| Base des tâches (`tasks.sqlite`) | `synchronous = NORMAL` en WAL au lieu de FULL, et chaque lot de `TasksDao.save` validé dans une transaction (sqlite-jdbc valide chaque insertion) : pas de synchronisation du disque par tâche sur le thread unique (voir « Architecture d'exécution ») ; réglable par `komga.tasks-db.pragmas` | après une coupure de courant (pas un arrêt du processus), les dernières tâches émises peuvent manquer ; un lot en échec est annulé en entier |

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

SQL rendu par jOOQ 3.19 (dialecte SQLite), relevé par les oracles de `infrastructure/jooq` et reproduit par `port/jooq` :
noms sans guillemets sauf besoin (`SERIES.ID`, `"RLB_a""b c"`, mots-clés SQLite), `isTrue()` / `isFalse()` en ligne (`= 1`),
messages d'erreur de sqlite-jdbc (`[SQLITE_ERROR] SQL error or missing database (...)`, `[SQLITE_CONSTRAINT_NOTNULL] ...`).

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

Komga exécute ses tâches (pool de threads de `TaskProcessor`, réglage « Task threads ») et ses requêtes HTTP dans des
threads Java qui attendent le disque sans gêner les autres. KomgaJS n'a **qu'un thread JS** (un seul tas V8, pour la
mémoire) : tâches et requêtes s'y partagent le temps, et les attentes (disque, décompression, images, processus externes)
sont asynchrones (`await`), exécutées par le pool de threads de libuv (`UV_THREADPOOL_SIZE`, 4 par défaut) ou par
libvips.

- Accès base et transactions **synchrones** (better-sqlite3, requêtes courtes), comme le code Kotlin bloquant ;
  `transactional()` refuse une fonction asynchrone. Vérifié : les blocs `@Transactional` / `transactionTemplate` de Komga
  ne font que des accès base (et des suppressions de fichiers, faites en synchrone). **Invariant : aucun `await` dans une
  transaction.** Chaque portion synchrone entre deux `await` s'exécute donc d'un bloc, sans qu'une autre tâche ou une
  requête s'intercale : c'est ce qui rend l'entrelacement sûr, sans verrou (la connexion n'est jamais partagée par deux
  transactions en cours ; même granularité que les transactions de Komga).
  Chaque validation synchronise le disque (WAL, `synchronous = FULL` de sqlite-jdbc) et bloque le thread pendant ce
  temps : la base des tâches (une file, réémise par le scan suivant) est en `synchronous = NORMAL`, et ses insertions en
  lot sont validées une fois par lot (`TasksDao.save`) ; sans cela, émettre les tâches d'analyse et d'empreinte d'une
  bibliothèque de 6 500 livres bloquait le serveur plus de 45 s (une synchronisation par tâche). Voir « Écarts connus ».
- **Convention `async`** : la fonction Kotlin garde son nom et sa place, devient `async`, et ses appelants font `await`
  (`// PORT: async (<cause>)`) ; l'asynchronisme se propage ainsi le long de la chaîne d'appels, sans autre changement
  de logique. Écarts de forme, marqués `// PORT:` :
  - `forEach` / `map` / `mapNotNull` dont le corps attend → boucle `for..of` dans le même ordre (jamais d'exécution
    parallèle là où Kotlin est séquentiel) ;
  - interface Kotlin dont une implémentation attend (`BookMetadataProvider`, `SeriesMetadataFromBookProvider`) :
    résultat `T | Promise<T>`, les appelants font `await` ;
  - appelant qui doit rester synchrone (fonction appelée dans une transaction) : variante `...Blocking`, l'ancienne forme
    synchrone (`Hasher.computeHashBlocking`, `getZipEntryBytesBlocking`) ; `LibraryContentLifecycle.tryRestoreBooks`
    (appelée hors transaction par le scan, et dans la transaction de `tryRestoreSeries`) a son corps en générateur
    (`tryRestoreBooksSteps`, `yield` du chemin dont il faut l'empreinte), exécuté de façon asynchrone ou synchrone ;
  - tests jumeaux : mêmes cas, `await` ajouté ; les fixtures ne changent pas.
- **Ce qui est asynchrone** (lectures sur le pool de libuv, `src/port/async-io.ts`) :
  - empreintes des fichiers : `Hasher.computeHash(path)` (lecture par blocs de 1 Mio, même XXH3-128) et
    `KoreaderHasher.computeHash` ;
  - parcours de la bibliothèque : `walkFileTree` (`opendir` / `stat` asynchrones, attributs des entrées d'un
    répertoire demandés ensemble, mêmes événements dans le même ordre) ;
  - archives ZIP (`src/port/zip.ts`) : `ZipFileBuilder.getAsync()` lit d'avance la fin du fichier, le répertoire
    central, les en-têtes locaux et le début des données de chaque entrée (16 Kio pour l'analyse : type et dimensions)
    avant le décodage synchrone d'origine (une lecture hors des zones préchargées se fait par `readSync`, même
    résultat) ; `ZipFile.readEntryBytesAsync` lit une entrée entière et la décompresse (DEFLATED) avec le zlib de Node
    sur le pool (`getZipEntryBytes` : pages, couvertures, ComicInfo.xml, ressources EPUB) ;
  - analyse (`BookAnalyzer.analyze`, `getPoster`, `getPageContent`, `getFileContent`, extracteurs ZIP/RAR/EPUB),
    donc service des pages et des miniatures à la volée, conversion CBZ et suppression de pages ;
  - JPEG de la JVM (`src/port/jpeg-jdk.ts`) : décodage et encodage libjpeg 6b sur le pool (`jpegDecodeAsync`,
    `jpegEncodeAsync` de `native/komga_jpeg.c`, mêmes appels, mêmes octets) : empreintes de pages, conversions ;
  - sharp / libvips (déjà asynchrone), `KOMGAJS_IMAGE_THREADS` threads natifs par opération ;
  - vérification des mots de passe (`BCryptPasswordEncoder.matches`, à chaque requête HTTP Basic sans cookie de
    session — clients OPDS, scripts — et à chaque connexion ; ~70 ms en x86, bien plus sur un Raspberry Pi) : cœur de
    bcrypt dans `native/komga_bcrypt.c` (`build/komgabcrypt.node`) sur le pool, préparation et format de bcryptjs
    repris dans `src/port/bcrypt.ts` (mêmes empreintes, `test/port/bcrypt.test.ts`) ; `AuthenticationManager.authenticate`,
    `AuthenticationProvider.authenticate`, `retrieveUser` et `additionalAuthenticationChecks` rendent `T | Promise<T>`.
    `encode` (création d'utilisateur, changement de mot de passe, actions ponctuelles) reste synchrone ;
  - kepubify (`KepubConverter.convertEpubToKepub*`) : processus attendu sans bloquer (`spawnAsync`, même délai de 10 s) ;
  - réponses HTTP en flux (téléchargement d'un livre, d'une série ou d'une liste en ZIP), clients HTTP.
- **Pool de tâches** : `ThreadPoolTaskExecutor` (`src/port/spring-scheduling.ts`) garde la comptabilité d'un
  `ThreadPoolExecutor` Java ; chaque « thread » est logique et attend la fin de sa tâche avant la suivante, donc
  `taskPoolSize` tâches progressent ensemble, entrelacées à leurs `await`, comme les threads de Komga ;
  `Thread.currentThread().name` suit la tâche à travers ses `await` (AsyncLocalStorage, colonne OWNER de TASK).
- **Passages coopératifs** : une longue portion de JS synchrone retarde tout le reste. `cooperativeYield()`
  (`src/port/async-io.ts`) rend la main à la boucle d'événements (`setImmediate`) si le code tourne depuis plus de 10 ms,
  sinon ne coûte rien ; appelé hors transaction, à des endroits où Komga n'en a pas d'ouverte : entre deux séries du scan
  (`LibraryContentLifecycle.scanRootFolder`), entre deux séries triées après le scan, entre deux entrées d'une archive
  analysée (ZIP, RAR). Les événements (`applicationTaskExecutor`, diffusion asynchrone d'`AsynchronousSpringEventsConfig`)
  sont traités dans l'ordre par tranches de 5 ms (un scan publie des milliers de `BookAdded`, chacun met à jour l'index
  de recherche).
- **Mémoire rendue après les tâches** : un seul tas V8 sert aux tâches et aux requêtes ; après l'analyse d'une grosse
  bibliothèque, V8 garde en réserve les pages libérées et glibc les blocs libérés. Quand les threads du pool de tâches
  expirent (60 s sans tâche, comme l'arrêt du worker), `src/port/spring-boot-application.ts` vide les caches
  d'instructions SQLite (`releaseStatementCaches`, `shrink_memory`), lance un ramasse-miettes complet « last-resort »
  (`bin/komgajs` démarre node avec `--expose-gc`), qui rend aussi les pages en réserve, puis `malloc_trim`. Mesuré après
  le scan et l'analyse de 6 500 livres : 262 Mo avant, 173 Mo après (164 Mo au démarrage).
- **Restent synchrones** (bloquent le thread pendant leur durée) : requêtes SQLite, rendu PDF (mupdf wasm, lecture du
  fichier à la demande par `readSync`), décompression RAR (JS), analyse EPUB (lecture de l'OPF, de la table des matières
  et des positions : fichiers courts), écriture d'un CBZ (conversion, suppression de pages), Deflate64 / bzip2, mise à
  jour et reconstruction de l'index de recherche, conversions en DTO, vérification du chemin de kepubify au démarrage
  (3 s au plus).
- **Worker des tâches (optionnel)** : `KOMGAJS_TASK_WORKER=true` exécute `TaskProcessor` dans un `worker_thread`
  dédié (`src/port/task-worker.ts`, `task-worker-thread.ts`, `thread-codec.ts`), l'ancienne architecture : second tas
  V8 et seconds modules (60 à 100 Mo tant qu'il tourne), mais une tâche longue et synchrone (PDF, RAR) n'y retarde pas
  les requêtes HTTP.
  - Le worker a **son propre contexte** : mêmes définitions de beans et même environnement, ses propres connexions
    SQLite ; seul `TaskProcessor` y est créé au démarrage (avec ses dépendances). Même base, même schéma que Komga.
  - Place des beans (`component(X, { taskWorker })`, marqué `// PORT:` dans le jumeau) : `run` = n'existe que dans le
    worker (`TaskProcessor`) ; `callMain` = état unique dans le thread principal, appelé depuis le worker par un appel
    synchrone (`Atomics.wait`, le worker attend la réponse) : `LuceneHelper`, `SearchIndexLifecycle` (index de recherche
    en mémoire), `SimpleMeterRegistry` (métriques de l'actuator) ; `mirrorMain` = une instance par thread, l'état du thread
    principal est recopié dans le worker après chaque modification (`KomgaSettingsProvider`). Par défaut, chaque thread a
    son instance (services sans état, DAO). Sans worker, ces rôles n'ont aucun effet.
  - Événements : ceux publiés dans le worker sans listener créé dans le worker (tous les `DomainEvent`) sont publiés dans
    le thread principal (SSE, métriques, index) ; ceux du thread principal écoutés par un bean du worker (`TaskAddedEvent`,
    `ApplicationReadyEvent`, `SettingChangedEvent`) lui sont transmis, traités par tranches de 5 ms.
  - SQLite (WAL) : chaque thread a sa connexion d'écriture ; les transactions d'écriture commencent par
    `BEGIN IMMEDIATE` et `busy_timeout` vaut au moins 30 s.
  - Jamais sous le profil `test` ni avec une base en mémoire. Un worker arrêté anormalement est relancé ; il s'arrête
    et rend sa mémoire quand les threads du pool ont expiré (60 s sans tâche), et est relancé au prochain événement.
- Mesure : `node tools/scan-latency-bench.mjs <port> <config> <bibliothèque>` (latence HTTP pendant un scan, RSS au
  repos et en pointe ; bibliothèques de test : `tools/gen-big-library.mjs`, gros CBZ ; `tools/gen-many-library.mjs`,
  6 500 petits livres).
- Instructions préparées (better-sqlite3) : une instruction n'est libérée qu'au ramasse-miettes de son objet JS, après un
  retour à la boucle d'événements. Pendant une longue tâche synchrone, préparer une instruction par requête (comme jOOQ)
  accumulait des centaines de Mo de mémoire native : les instructions sont réutilisées par connexion
  (`prepareCached`, `src/port/jooq/core.ts`), et les noms des tables temporaires (`TempTable`) sont réutilisés par
  connexion pour que leurs requêtes le soient aussi.
- Mémoire : `bin/komgajs` limite le tas V8 de chaque thread au quart de la mémoire du conteneur (cgroup), comme la JVM
  (`MaxRAMPercentage` 25 %), au moins 256 Mo, ou à `KOMGAJS_MAX_HEAP_MB`.
- Index de recherche (`src/port/lucene/index.ts`) : dictionnaire des termes, postings, champs des documents et documents
  sérialisés dans des tableaux typés hors du tas V8 (comme les pools de l'IndexingChain de Lucene) ; il ne reste dans le
  tas qu'un petit objet par document. Mesuré (livres avec titre, ISBN, 2 auteurs, 1 étiquette) : 7 000 livres = 21 Mo
  hors tas + ~8 Mo de tas ; 48 000 livres = 112 Mo hors tas + ~40 Mo de tas. `RebuildIndex` passe avec un tas de 256 Mo
  pour 50 000 livres (192 Mo aussi). Les gros commits (pages de 5 000 documents, reconstruction) sont écrits et relus
  par lignes de 1 000 opérations. L'ancien index en objets JS prenait ~70 Ko de tas par livre (heap out of memory à
  256 Mo avec 6 600 livres).

| Index de recherche | format disque propre (journal JSONL ré-analysé à l'ouverture, ~8 s pour 50 000 livres) ; statistiques BM25 sur les documents vivants (Lucene compte aussi les supprimés jusqu'à la fusion des segments) | ordre de pertinence identique après fusion ; index en mémoire hors tas V8 (~2,3 Ko par livre) |
| Images (miniatures, conversions) | pixels légèrement différents (sharp lanczos3 contre Thumbnailator bilinéaire progressif, encodeur PNG différent) ; dimensions, formats, décisions identiques (122 fichiers, oracle Komga) | visuel négligeable |
| JPEG (lecture, écriture, `BookAnalyzer.hashPage`) | octets identiques à Komga sur Temurin 21 (JDK 23 vérifié identique sur 61 cas) (libjpeg 6b et LittleCMS 2.19 du JDK compilés dans `build/komgajpeg.node`, logique TwelveMonkeys dans `src/port/jpeg-jdk.ts` ; `test/port/jpeg-jdk.test.ts`, 208 cas). Non reproduits (sharp) : JPEG sans perte (SOF3), CMYK avec un profil ICC non CMYK. Le cache global de TwelveMonkeys (16 profils ICC) est reproduit par processus (un par worker). Un JDK de distribution lié à la libjpeg-turbo du système (OpenJDK Ubuntu) donne lui-même d'autres octets (4:4:0, progressifs tronqués) | empreintes de pages identiques à celles de l'image Docker de Komga |
| Rendu PDF | mupdf au lieu de PDFBox : pixels différents | visuel |

## À optimiser (mémoire)

- Charger à la demande les modules lourds (sharp, mupdf wasm, libheif-js, @jsquash/jxl) : premier usage seulement.
