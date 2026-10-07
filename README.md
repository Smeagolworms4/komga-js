# KomgaJS

[![Build](https://github.com/Smeagolworms4/komga-js/actions/workflows/build.yml/badge.svg)](https://github.com/Smeagolworms4/komga-js/actions/workflows/build.yml)
[![Image](https://img.shields.io/badge/ghcr.io-komga--js%3Amain-0b7285)](https://github.com/Smeagolworms4/komga-js/pkgs/container/komga-js)
[![Docker Hub](https://img.shields.io/docker/pulls/smeagolworms4/komga-js?label=Docker%20Hub&logo=docker&color=0b7285)](https://hub.docker.com/r/smeagolworms4/komga-js)
[![Komga](https://img.shields.io/badge/port%20of-Komga%201.28.1-005ed3)](https://github.com/gotson/komga)
[![Licence](https://img.shields.io/badge/licence-MIT-3d7a3d)](LICENSE)

[Komga](https://komga.org), the media server for your comics, mangas, BDs, magazines and
eBooks — with its backend ported line by line from Kotlin to TypeScript. Same server, same
API, same database, same web interface, **three to five times less memory**.

*[Version française](https://github.com/Smeagolworms4/komga-js/blob/main/README.fr.md)* · *The story of the port: [KomgaJS on smea.tech](https://smea.tech/komgajs-komga-nodejs/) (in French)*

Komga is written in Kotlin on the JVM, and a JVM is generous with memory: an idle Komga
with an empty library sits above half a gigabyte, and grows towards a gigabyte once it has
scanned and served a library. KomgaJS runs the same program on Node.js. It is not a
rewrite and not a clone: every one of Komga's 442 backend files has a TypeScript twin of
the same name, in the same place, with the same functions in the same order — so that when
Komga moves on, its changes can be carried over by reading the diff.

## Memory

Measured on Komga 1.28.1 with `tools/mem-bench.mjs`: the same library, the same scenario for every
server (start, scan, read thumbnails and pages, then an API load: 2,000 requests in a row, then the
same 16 at a time), resident memory of the process. Komga is measured twice: as it ships, and with a JVM tuned for memory, because tuning the
JVM cuts its footprint almost threefold and a fair comparison has to show it. KomgaJS is shown as
the image before 1.28.1.2 (Debian, stock Node.js) and as the current image (Alpine, Node.js built
with V8 pointer compression).

**Desktop, x86-64, library of 60 comic books (645 MB)** — each server starts from an empty
configuration, library created as the web interface does (ISBN barcode import off); mean of 10 runs:

| | Komga, default | Komga, tuned JVM | KomgaJS 1.28.1.1 | KomgaJS 1.28.1.2 |
|---|---|---|---|---|
| Idle, after start-up | 603 MB | 318 MB | 169 MB | **155 MB** |
| After scanning and analysing the library | 908 MB | 332 MB | 244 MB | **174 MB** |
| After reading (thumbnails, pages) | 932 MB | 350 MB | 244 MB | **184 MB** |
| After the API load | 878 MB | 349 MB | 275 MB | **192 MB** |
| Start-up | 11.4 s | 13.9 s | **1.4 s** | 1.6 s |
| Scan and analysis of the 60 books | 7.4 s | 9.2 s | **4.8 s** | 5.5 s |
| API response time, median | 5.2 ms | 6.6 ms | **4.2 ms** | 4.8 ms |
| API throughput, 16 requests at a time | **739 req/s** | 536 req/s | 412 req/s | 358 req/s |

**Raspberry Pi 4, arm64, real library of about 6,500 books** (4 libraries, 286 GB on hard drives) —
each server starts on its own copy of the same production database, finishes its start-up tasks,
reads 200 books spread over the library, then takes the same API load; median of 3 to 4 runs:

| | Komga, default | Komga, tuned JVM | KomgaJS 1.28.1.1 | KomgaJS 1.28.1.2 |
|---|---|---|---|---|
| Idle, start-up tasks done | 547 MB | 344 MB | 275 MB | **207 MB** |
| After reading 200 books | 724 MB | 388 MB | 225 MB | **183 MB** |
| After the API load | 703 MB | 386 MB | 258 MB | **193 MB** |
| Peak | 755 MB | 427 MB | 352 MB | **284 MB** |
| API response time, median | 10.5 ms | 13.7 ms | **9.3 ms** | **9.3 ms** |
| API throughput, 16 requests at a time | **97 req/s** | 70 req/s | 88 req/s | 83 req/s |

What these numbers say:

- **Against Komga as it ships**, KomgaJS uses four to five times less memory on the desktop and
  about three to four times less on the Pi, starts in a second or two instead of eleven, and scans faster.
- **Against a JVM tuned for memory**, KomgaJS still uses about half. The tuned JVM pays for its
  smaller footprint with a quarter of its throughput and slower responses.
- **Komga keeps the higher throughput** when many requests arrive at once: it serves them on several
  threads, KomgaJS on one. On the Pi, with few cores, the two are close.
- **1.28.1.2 against 1.28.1.1**: 40 to 80 MB less once a library is loaded (little change when idle
  on the desktop), for a scan about 15% slower and about 10% less throughput.
- On the Pi, start-up takes about 7 to 10 s for KomgaJS on an undisturbed run and 20 to 40 s for
  Komga; the machine was running other services, so start-up times vary from run to run and are
  left out of the table.

"Default" is Komga's jar on Java 21 (desktop) and the official image with its Java 23 (Pi). "Tuned"
is G1 with a 256 MB heap, periodic collection every 5 s, C1 compiler only, 512 k thread stacks, a
64 MB code cache and `MALLOC_ARENA_MAX=2`, plus compact object headers on Java 25 (desktop). Java 25
alone changes nothing; its AOT cache brings start-up down to 5.4 s. On the desktop Komga runs as a
process and KomgaJS in its container.

**Large libraries.** The search index lives off the JavaScript heap, in compact typed arrays,
with the same results as Lucene: on 7,000 books, about 300 MB idle after rebuilding the index,
and the rebuild fits in a 256 MB heap up to at least 48,000 books.

**How it runs.** A single JavaScript thread serves the web requests and runs the background
tasks; file reads, hashing, decompression and image coding run on Node's native thread pool,
and long loops yield every 10 ms. During the scan of 6,500 books the server answers in 11 ms
(median), 29 ms (99th percentile). Still on the main thread, and able to delay a request while
they last: SQLite queries, PDF rendering, RAR decompression, EPUB parsing, index updates.
Benchmarks: `tools/mem-bench.mjs`, `tools/scan-latency-bench.mjs`.

**Settings** (environment variables):

| Variable | Default | Effect |
|---|---|---|
| `KOMGAJS_MAX_HEAP_MB` | ¼ of the container memory limit, at least 256 MB | JavaScript heap cap |
| `KOMGAJS_IMAGE_THREADS` | 2 | native threads per image operation (1: lowest memory; 2: thumbnails ~20 % faster than 1; 0: all cores) |
| `UV_THREADPOOL_SIZE` | 4 | concurrent native operations; keep it above Komga's task threads |
| `KOMGAJS_TASK_WORKER` | false | `true` runs tasks in a separate thread (+60–100 MB while tasks run) |
| `KOMGAJS_NODE_OPTIONS` | empty | extra Node.js / V8 options; `--optimize-for-size` trades 10 to 15% of speed for about 20 MB less |

## Features

Everything Komga does, because it is Komga's code:

- Browse libraries, series and books via a responsive web UI that works on desktop, tablets and phones
- Organize your library with collections and read lists
- Edit metadata for your series and books
- Import embedded metadata automatically (ComicInfo, EPUB, Mylar, ISBN barcodes, local artwork)
- Webreader with multiple reading modes
- Manage multiple users, with per-library access control, age restrictions, and labels restrictions
- Offers a REST API, many community tools and scripts can interact with Komga
- OPDS v1 and v2 support
- Kobo Sync with your Kobo eReader
- KOReader Sync
- Download book files, whole series, or read lists
- Duplicate files detection
- Duplicate pages detection and removal
- Import books from outside your libraries directly into your series folder
- Import ComicRack `cbl` read lists

The web interfaces are Komga's own (`komga-webui` and `next-ui`), built from the very commit
this port follows.

## Install

```yaml
# compose.yaml
services:
  komga:
    image: ghcr.io/smeagolworms4/komga-js:latest
    container_name: komga
    volumes:
      - ./config:/config
      - /path/to/your/books:/data:ro
    ports:
      - 25600:25600
    restart: unless-stopped
```

It is used exactly like [Komga's image](https://komga.org/docs/installation/docker): the
configuration and the database live in `/config`, the server listens on `25600`, and the
same `application.yml` settings and `KOMGA_*` environment variables apply.

The same image is on Docker Hub as [`smeagolworms4/komga-js`](https://hub.docker.com/r/smeagolworms4/komga-js)
(amd64, arm64, armv7). Versions are tagged `vX.Y.Z.N`: `X.Y.Z` is the Komga version ported, `N` the
revision of the port. Image tags: `:1.28.1.2` (fixed), `:1.28.1` (latest revision of the port of
Komga 1.28.1), `:latest` (latest release), and `:main`, republished on every push to `main`, to try
the latest changes.

Platforms: `linux/amd64` and `linux/arm64` (Alpine, on a Node 24 built with V8 pointer compression,
[node-pointer-compression](https://github.com/Smeagolworms4/node-pointer-compression): a smaller JavaScript
heap), `linux/arm/v7` (32-bit Raspberry Pi: Debian and the stock Node 22, since pointer compression only
exists on 64-bit and Node 24 has no armv7 build). The test suite runs in CI on both runtimes.

### From source

Node.js 24, a C compiler, the ICU development files and `zip` (for the tests):

```sh
sudo apt install build-essential libicu-dev zip
npm ci
npm run build:native   # SQLite ICU collations, JDK-identical JPEG codec, bcrypt off the JS thread
npm run build
bin/komgajs --server.port=25600 --komga.config-dir=$HOME/.komga
```

The web interface is optional from source: build Komga's `komga-webui` and `next-ui` and
install them with `node tools/install-webui.mjs <komga-webui/dist> <next-ui/dist>`. Without
it, the API, OPDS, Kobo and KOReader endpoints work as usual.

### Using an existing Komga

The database is the same, table for table and byte for byte: KomgaJS opens a Komga
`/config` as it is, and Komga opens it again afterwards. The only file that is not shared is
the search index, which is rebuilt automatically on the first start, as Komga does when its
index is missing.

Switch from one to the other, never run both on the same database at once: each would scan,
run tasks and keep its own index, and neither would see the other's changes. To compare them
side by side, give each its own copy of `/config` and the same books, read-only.

## Status

The whole backend is ported and every Kotlin test of Komga has been ported with it.

- **Ported**: 442 of 442 source files, 775 of 775 Kotlin tests.
- **Compared function by function with Komga**: 1,380 of the 1,384 Kotlin functions that have
  code have an oracle unit test. The real Komga code runs on the JVM on given inputs (edge cases,
  errors, empty values, Unicode, large lists), its results are recorded, and the TypeScript twin
  must return exactly the same values or throw the same exception: 11,684 cases. The 4 functions
  left are the application entry point and the three Spring Security filter chains, which the
  differential tests below cover. Writing these tests found and fixed about 70 port bugs.
- **Checked against the real Komga**: the database schema and every Flyway checksum; the
  OpenAPI document (174 of 174 operations, 170 of 170 schemas identical); about a thousand
  live API responses; OPDS v1 XML byte for byte; JPEG page hashes byte for byte; search
  results, archive reading, metadata import, authentication — each against the Java library
  Komga uses, run as an oracle.
- **Every push** runs about 1,500 port tests and about 11,900 oracle unit tests (in about
  two minutes, no Java needed); the Kotlin oracles run on
  [a fork of Komga](https://github.com/Smeagolworms4/komga/tree/unit-oracles), whose CI checks
  that they still produce the fixtures committed here.
- **Not yet tried in real life**: a large library over days, real Kobo and KOReader devices,
  Mihon and other clients, OAuth2 against a real provider.

Known differences, all listed in [`PORTING.md`](PORTING.md): the search index uses its own
file format; thumbnails and PDF pages are encoded by different libraries, so their pixels
differ slightly (never their sizes or formats); validation errors come out
in a fixed order where Komga's order is random.

## How the port is built

The rules are in [`PORTING.md`](PORTING.md). In short:

- **One Kotlin file, one TypeScript file**, same path, same names, same order. Every file
  starts with `// @port-of <kotlin file>@<commit>`. No refactoring: an upstream bug is
  reproduced and marked `// UPSTREAM-BUG:`, and every unavoidable deviation is marked
  `// PORT:`.
- **The Java libraries are reimplemented behind the same API** — Spring (container, MVC,
  Security, Session, Data), jOOQ, Flyway, Jackson, Lucene, Tika, ImageIO — so that Kotlin
  code translates line for line. They live in `src/port`.
- **Behaviour is proven, not assumed.** `tools/jshell-komga.sh` runs Java code with Komga's
  complete classpath; the values it produces are committed as fixtures, and the tests compare
  the port against them.
- **Following Komga.** `UPSTREAM_REF` records the Komga commit ported;
  `node tools/upstream-diff.mjs <new version>` lists every changed Kotlin file with its
  TypeScript twin and the diff to carry over, and `node tools/port-status.mjs` fails until
  every file and every test is up to date.

## Development

```sh
npm test                    # the whole suite
npx vitest run test/domain  # one area
npm run typecheck
node tools/port-status.mjs  # port coverage, file by file and test by test
node tools/progress-page.mjs build/progress.html
```

```
src/                 the ported backend, mirroring komga/src/main/kotlin/org/gotson/komga
  port/              the Java/Kotlin libraries, reimplemented (no Kotlin twin)
  flyway/            the Kotlin database migrations
test/                the ported tests, mirroring komga/src/test, plus the oracle comparisons
resources/           application.yml, database migrations, fonts (from Komga)
native/              SQLite ICU extension, libjpeg 6b + LittleCMS (JDK-identical JPEG)
tools/               port status, upstream diff, oracle, benchmark, web UI install
```

## Continuous integration

Every push runs the types, builds the native modules, checks that every Kotlin file and
test has its twin, runs the whole suite, and compiles. Only if all of that passes is the
image built and published. Nothing in the pipeline needs Java or a running Komga.

## Credits

**Komga** is the work of [Gauthier Roebroeck](https://github.com/gotson) and its
contributors: every feature, every design decision and every line of the web interface of
this project is theirs. If you use KomgaJS, please support the original:

[![Open Collective backers and sponsors](https://img.shields.io/opencollective/all/komga?label=OpenCollective%20Sponsors&color=success)](https://opencollective.com/komga)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/gotson?label=Github%20Sponsors&color=success)](https://github.com/sponsors/gotson)
[![Discord](https://img.shields.io/discord/678794935368941569?label=Discord&color=blue)](https://discord.gg/TdRpkDu)

Questions about Komga itself belong on [Komga's Discord](https://discord.gg/TdRpkDu) and
[website](https://komga.org); issues specific to this port belong
[here](https://github.com/Smeagolworms4/komga-js/issues), and you can talk about the port on
[SmeagolWorms4's Discord](https://discord.gg/xMBc5SQ).

The TypeScript port is by [SmeagolWorms4](https://github.com/Smeagolworms4), also the author
of [Media Center Sync](https://github.com/Smeagolworms4/media-center-sync). Komga, its ideas and
its design belong to Gauthier Roebroeck and the Komga contributors: if you give, give to Komga
first. The port can also be supported, as a bonus:

[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-SmeagolWorms4-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Smeagolworms4)
[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-smeagolworms4-ffdd00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/smeagolworms4)
[![PayPal](https://img.shields.io/badge/PayPal-donate-003087?logo=paypal&logoColor=white)](https://www.paypal.com/donate/?business=SURRPGEXF4YVU&no_recurring=0)

## Licence

MIT, like Komga — both copyrights are kept in [`LICENSE`](LICENSE). A few support files are
derived from other projects and keep their own licence: see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
