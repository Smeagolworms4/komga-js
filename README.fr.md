# KomgaJS

[![Build](https://github.com/Smeagolworms4/komga-js/actions/workflows/build.yml/badge.svg)](https://github.com/Smeagolworms4/komga-js/actions/workflows/build.yml)
[![Image](https://img.shields.io/badge/ghcr.io-komga--js%3Amain-0b7285)](https://github.com/Smeagolworms4/komga-js/pkgs/container/komga-js)
[![Docker Hub](https://img.shields.io/docker/pulls/smeagolworms4/komga-js?label=Docker%20Hub&logo=docker&color=0b7285)](https://hub.docker.com/r/smeagolworms4/komga-js)
[![Komga](https://img.shields.io/badge/port%20of-Komga%201.27.1-005ed3)](https://github.com/gotson/komga)
[![Licence](https://img.shields.io/badge/licence-MIT-3d7a3d)](LICENSE)

[Komga](https://komga.org), le serveur multimédia pour vos BD, mangas, comics, magazines et
livres numériques — avec son backend porté ligne à ligne de Kotlin vers TypeScript. Même
serveur, même API, même base de données, même interface web, **trois à six fois moins de
mémoire**.

*[English version](README.md)*

Komga est écrit en Kotlin sur la JVM, et une JVM est généreuse en mémoire : un Komga au
repos, bibliothèque vide, dépasse déjà le demi-gigaoctet, et dépasse le gigaoctet une
fois une bibliothèque scannée et servie. KomgaJS fait tourner le même programme sur
Node.js. Ce n'est ni une réécriture ni un clone : chacun des 442 fichiers du backend de Komga
a son jumeau TypeScript, du même nom, au même endroit, avec les mêmes fonctions dans le même
ordre — pour que les évolutions de Komga puissent être reportées en lisant le diff.

## Mémoire

La même bibliothèque de 60 BD (645 Mo), le même scénario, chaque serveur partant d'une
configuration vierge avec ses réglages par défaut, les deux mesurés sur la même machine sous la
même charge, avec le code actuel (`tools/mem-bench.mjs`), bibliothèque créée comme le fait
l'interface web (import des ISBN par code-barres désactivé, sauf mention). Mémoire résidente du
processus :

| | Komga (JVM) | KomgaJS | |
|---|---|---|---|
| Au repos, après le démarrage | 599 Mo | **165 Mo** | ÷ 3,6 |
| Après scan et analyse de la bibliothèque | 1 372 Mo | **234 Mo** | ÷ 5,9 |
| Après lecture (miniatures, pages) | 1 496 Mo | **235 Mo** | ÷ 6,4 |
| Démarrage | 11,3 s | **1,0 s** | ÷ 11 |
| Scan et analyse des 60 livres | 13,3 s | **10,4 s** | 1,3 × plus rapide |
| Idem, avec l'import des ISBN par code-barres | 32,0 s | **18,8 s** | 1,7 × plus rapide |

**Grosses bibliothèques.** L'index de recherche vit hors du tas JavaScript, dans des tableaux
typés compacts, avec les mêmes résultats que Lucene : sur 7 000 livres, environ 300 Mo au repos
après reconstruction de l'index, et la reconstruction tient dans un tas de 256 Mo jusqu'à au
moins 48 000 livres.

Sur un Raspberry Pi 4 (arm64) avec une vraie bibliothèque de 6 594 livres en 4 bibliothèques,
la même base et les mêmes fichiers, chaque serveur tournant seul pendant 15 minutes après son
démarrage, mesurés le même soir (le NAS servait des fichiers en NFS pendant ce temps) :

| | Komga (JVM) | KomgaJS | |
|---|---|---|---|
| Au repos, 15 min après le démarrage | 483 Mo | **166 Mo** | ÷ 2,9 |
| Pic (démarrage, scan des 4 bibliothèques) | 492 Mo | **256 Mo** | ÷ 1,9 |
| Démarrage | 18,3 s | **4,5 s** | ÷ 4 |
| Temps de réponse de l'API, médiane | 8 ms | **4 ms** | |
| Temps de réponse de l'API, 99ᵉ centile | 391 ms | **16 ms** | |

**Fonctionnement.** Un seul thread JavaScript sert les requêtes web et exécute les tâches de
fond ; lectures de fichiers, empreintes, décompression et codage d'images passent par le pool
de threads natif de Node, et les longues boucles rendent la main toutes les 10 ms. Pendant le
scan de 6 500 livres, le serveur répond en 11 ms (médiane), 29 ms (99ᵉ centile). Restent sur le
thread principal, et peuvent retarder une requête le temps qu'ils durent : requêtes SQLite,
rendu PDF, décompression RAR, lecture des EPUB, mises à jour de l'index. Bancs d'essai :
`tools/mem-bench.mjs`, `tools/scan-latency-bench.mjs`.

**Réglages** (variables d'environnement) :

| Variable | Par défaut | Effet |
|---|---|---|
| `KOMGAJS_MAX_HEAP_MB` | ¼ de la limite mémoire du conteneur, au moins 256 Mo | plafond du tas JavaScript |
| `KOMGAJS_IMAGE_THREADS` | 2 | threads natifs par opération d'image (1 : le moins de mémoire ; 2 : miniatures ~20 % plus rapides qu'avec 1 ; 0 : tous les cœurs) |
| `UV_THREADPOOL_SIZE` | 4 | opérations natives simultanées ; à garder au-dessus des threads de tâches de Komga |
| `KOMGAJS_TASK_WORKER` | false | `true` exécute les tâches dans un thread séparé (+60 à 100 Mo pendant les tâches) |

## Fonctionnalités

Tout ce que fait Komga, puisque c'est le code de Komga :

- Parcourir bibliothèques, séries et livres dans une interface web qui s'adapte à l'ordinateur, la tablette et le téléphone
- Organiser la bibliothèque en collections et listes de lecture
- Modifier les métadonnées des séries et des livres
- Importer automatiquement les métadonnées intégrées (ComicInfo, EPUB, Mylar, codes-barres ISBN, illustrations locales)
- Liseuse web avec plusieurs modes de lecture
- Plusieurs utilisateurs, avec accès par bibliothèque, restrictions d'âge et de libellés
- Une API REST, utilisée par de nombreux outils et scripts de la communauté
- OPDS v1 et v2
- Synchronisation Kobo avec votre liseuse
- Synchronisation KOReader
- Téléchargement des livres, des séries entières ou des listes de lecture
- Détection des fichiers en double
- Détection et suppression des pages en double
- Import de livres extérieurs directement dans le dossier de leur série
- Import des listes de lecture ComicRack `cbl`

Les interfaces web sont celles de Komga (`komga-webui` et `next-ui`), construites depuis le
commit même que suit ce portage.

## Installation

```yaml
# compose.yaml
services:
  komga:
    image: ghcr.io/smeagolworms4/komga-js:latest
    container_name: komga
    volumes:
      - ./config:/config
      - /chemin/vers/vos/livres:/data:ro
    ports:
      - 25600:25600
    restart: unless-stopped
```

Elle s'utilise exactement comme [l'image de Komga](https://komga.org/docs/installation/docker) :
la configuration et la base de données sont dans `/config`, le serveur écoute sur `25600`,
et les mêmes réglages `application.yml` et variables d'environnement `KOMGA_*` s'appliquent.

La même image est sur Docker Hub sous [`smeagolworms4/komga-js`](https://hub.docker.com/r/smeagolworms4/komga-js)
(amd64, arm64, armv7). Les versions sont taguées `vX.Y.Z.N` : `X.Y.Z` est la version de Komga portée,
`N` la révision du portage. Tags d'image : `:1.27.1.1` (figé), `:1.27.1` (dernière révision du
portage de Komga 1.27.1), `:latest` (dernière version publiée), et `:main`, republié à chaque push
sur `main`, pour essayer les derniers changements.

Plateformes : `linux/amd64` et `linux/arm64` (Node 24), `linux/arm/v7` (Raspberry Pi 32 bits,
Node 22 : Node 24 n'existe pas en armv7 ; la suite de tests tourne aussi sous Node 22 en CI).

### Depuis les sources

Node.js 24, un compilateur C, les fichiers de développement d'ICU et `zip` (pour les tests) :

```sh
sudo apt install build-essential libicu-dev zip
npm ci
npm run build:native   # collations ICU pour SQLite, codec JPEG identique au JDK, bcrypt hors du thread JS
npm run build
bin/komgajs --server.port=25600 --komga.config-dir=$HOME/.komga
```

L'interface web est facultative depuis les sources : construisez `komga-webui` et `next-ui`
de Komga puis installez-les avec
`node tools/install-webui.mjs <komga-webui/dist> <next-ui/dist>`. Sans elle, l'API, l'OPDS
et les points d'accès Kobo et KOReader fonctionnent normalement.

### Reprendre un Komga existant

La base de données est la même, table pour table et octet pour octet : KomgaJS ouvre le
`/config` d'un Komga tel quel, et Komga le rouvre ensuite. Le seul fichier non partagé est
l'index de recherche, reconstruit automatiquement au premier démarrage, comme le fait Komga
quand son index manque.

Passez de l'un à l'autre, mais ne faites jamais tourner les deux en même temps sur la même
base : chacun scannerait, exécuterait des tâches et tiendrait son propre index, sans voir les
modifications de l'autre. Pour les comparer côte à côte, donnez à chacun sa propre copie de
`/config` et les mêmes livres, en lecture seule.

## État

Tout le backend est porté, et tous les tests Kotlin de Komga l'ont été avec lui.

- **Porté** : 442 fichiers sur 442, 775 tests Kotlin sur 775.
- **Comparé fonction par fonction avec Komga** : 1 380 des 1 384 fonctions Kotlin qui ont du
  code ont un test unitaire à oracle. Le vrai code de Komga tourne sur la JVM avec des entrées
  choisies (cas limites, erreurs, valeurs vides, Unicode, grandes listes), ses résultats sont
  enregistrés, et le jumeau TypeScript doit rendre exactement les mêmes valeurs ou lever la
  même exception : 11 684 cas. Les 4 fonctions restantes sont le point d'entrée de
  l'application et les trois chaînes de filtres Spring Security, couvertes par les tests
  différentiels ci-dessous. Écrire ces tests a trouvé et corrigé environ 70 bugs de portage.
- **Vérifié contre le vrai Komga** : le schéma de la base et chaque checksum Flyway ; le
  document OpenAPI (174 opérations sur 174 et 170 schémas sur 170 identiques) ; environ un
  millier de réponses d'API réelles ; le XML OPDS v1 octet pour octet ; les hash des pages
  JPEG octet pour octet ; la recherche, la lecture des archives, l'import des métadonnées,
  l'authentification — chacun contre la bibliothèque Java qu'utilise Komga, exécutée comme
  référence.
- **À chaque push** : environ 1 500 tests du portage et environ 11 900 tests unitaires à
  oracle (en deux minutes environ, sans Java) ; les oracles Kotlin tournent sur
  [un fork de Komga](https://github.com/Smeagolworms4/komga/tree/unit-oracles), dont la CI
  vérifie qu'ils produisent toujours les fixtures enregistrées ici.
- **Pas encore éprouvé en conditions réelles** : une grosse bibliothèque sur plusieurs jours,
  de vraies liseuses Kobo et KOReader, Mihon et les autres clients, OAuth2 avec un vrai
  fournisseur.

Les écarts connus, tous listés dans [`PORTING.md`](PORTING.md) : l'index de recherche a son
propre format de fichier ; les miniatures et les pages PDF sont encodées par d'autres
bibliothèques, leurs pixels diffèrent donc légèrement (jamais leurs dimensions ni leurs
formats) ; les erreurs de validation sortent dans un ordre fixe là où
l'ordre de Komga est aléatoire.

## Comment le portage est construit

Les règles sont dans [`PORTING.md`](PORTING.md). En bref :

- **Un fichier Kotlin, un fichier TypeScript**, même chemin, mêmes noms, même ordre. Chaque
  fichier commence par `// @port-of <fichier kotlin>@<commit>`. Aucun refactoring : un bug de
  Komga est reproduit et marqué `// UPSTREAM-BUG:`, et chaque écart inévitable est marqué
  `// PORT:`.
- **Les bibliothèques Java sont réimplémentées derrière la même API** — Spring (conteneur,
  MVC, Security, Session, Data), jOOQ, Flyway, Jackson, Lucene, Tika, ImageIO — pour que le
  code Kotlin se traduise ligne à ligne. Elles sont dans `src/port`.
- **Le comportement est prouvé, pas supposé.** `tools/jshell-komga.sh` exécute du code Java
  avec le classpath complet de Komga ; les valeurs produites sont enregistrées comme
  fixtures, et les tests comparent le portage à elles.
- **Suivre Komga.** `UPSTREAM_REF` indique le commit de Komga porté ;
  `node tools/upstream-diff.mjs <nouvelle version>` liste chaque fichier Kotlin modifié avec
  son jumeau TypeScript et le diff à reporter, et `node tools/port-status.mjs` échoue tant
  que chaque fichier et chaque test ne sont pas à jour.

## Développement

```sh
npm test                    # toute la suite
npx vitest run test/domain  # une partie
npm run typecheck
node tools/port-status.mjs  # couverture du portage, fichier par fichier et test par test
node tools/progress-page.mjs build/progress.html
```

```
src/                 le backend porté, à l'image de komga/src/main/kotlin/org/gotson/komga
  port/              les bibliothèques Java/Kotlin, réimplémentées (sans jumeau Kotlin)
  flyway/            les migrations de base écrites en Kotlin
test/                les tests portés, à l'image de komga/src/test, plus les comparaisons avec les références
resources/           application.yml, migrations de base, polices (repris de Komga)
native/              extension ICU pour SQLite, libjpeg 6b + LittleCMS (JPEG identique au JDK)
tools/               état du portage, diff avec Komga, référence Java, banc d'essai, installation de l'interface web
```

## Intégration continue

Chaque push vérifie les types, compile les modules natifs, contrôle que chaque fichier et
chaque test Kotlin ont leur jumeau, exécute toute la suite et compile. Ce n'est que si tout
cela passe que l'image est construite puis publiée. Rien dans la chaîne n'a besoin de Java
ni d'un Komga en fonctionnement.

## Crédits

**Komga** est l'œuvre de [Gauthier Roebroeck](https://github.com/gotson) et de ses
contributeurs : chaque fonctionnalité, chaque choix de conception et chaque ligne de
l'interface web de ce projet sont les leurs. Si vous utilisez KomgaJS, soutenez l'original :

[![Open Collective backers and sponsors](https://img.shields.io/opencollective/all/komga?label=OpenCollective%20Sponsors&color=success)](https://opencollective.com/komga)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/gotson?label=Github%20Sponsors&color=success)](https://github.com/sponsors/gotson)
[![Discord](https://img.shields.io/discord/678794935368941569?label=Discord&color=blue)](https://discord.gg/TdRpkDu)

Les questions sur Komga lui-même ont leur place sur [le Discord](https://discord.gg/TdRpkDu)
et [le site](https://komga.org) de Komga ; les problèmes propres à ce portage,
[ici](https://github.com/Smeagolworms4/komga-js/issues), et on peut parler du portage sur
[le Discord de SmeagolWorms4](https://discord.gg/xMBc5SQ).

Le portage TypeScript est l'œuvre de [SmeagolWorms4](https://github.com/Smeagolworms4),
auteur aussi de [Media Center Sync](https://github.com/Smeagolworms4/media-center-sync). Komga,
ses idées et sa conception sont l'œuvre de Gauthier Roebroeck et des contributeurs de Komga :
si vous donnez, donnez d'abord à Komga. Le portage peut aussi être soutenu, en bonus :
[GitHub Sponsors](https://github.com/sponsors/Smeagolworms4) · [Buy me a coffee](https://www.buymeacoffee.com/smeagolworms4) · [PayPal](https://www.paypal.com/donate/?business=SURRPGEXF4YVU&no_recurring=0).

## Licence

MIT, comme Komga — les deux copyrights sont conservés dans [`LICENSE`](LICENSE). Quelques
fichiers de support sont dérivés d'autres projets et gardent leur propre licence : voir
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
