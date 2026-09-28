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
| Lucene | SQLite FTS5 (`// PORT:` sur chaque analyseur) |
| Thumbnailator / ImageIO / TwelveMonkeys | sharp (libvips) |
| commons-compress / junrar | yauzl, node-unrar-js, libarchive.js |
| PDFBox | mupdf (wasm) |
| jsoup | cheerio |
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
