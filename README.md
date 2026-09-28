# KomgaJS

[![Build](https://github.com/Smeagolworms4/komga-js/actions/workflows/build.yml/badge.svg)](https://github.com/Smeagolworms4/komga-js/actions/workflows/build.yml)
[![Image](https://img.shields.io/badge/ghcr.io-komga--js%3Amain-0b7285)](https://github.com/Smeagolworms4/komga-js/pkgs/container/komga-js)
[![Komga](https://img.shields.io/badge/port%20of-Komga%201.27.1-005ed3)](https://github.com/gotson/komga)
[![Licence](https://img.shields.io/badge/licence-MIT-3d7a3d)](LICENSE)

[Komga](https://komga.org), the media server for your comics, mangas, BDs, magazines and
eBooks — with its backend ported line by line from Kotlin to TypeScript. Same server, same
API, same database, same web interface, **two to three times less memory** on a small library
(see below: not yet on a large one).

*[Version française](README.fr.md)*

Komga is written in Kotlin on the JVM, and a JVM is generous with memory: an idle Komga
with an empty library sits above half a gigabyte, and grows toward a gigabyte once it has
scanned and served a library. KomgaJS runs the same program on Node.js. It is not a
rewrite and not a clone: every one of Komga's 442 backend files has a TypeScript twin of
the same name, in the same place, with the same functions in the same order — so that when
Komga moves on, its changes can be carried over by reading the diff.

## Memory

The same library of 60 comic books (645 MB), the same scenario, each server starting from an
empty configuration with its default settings, both measured on the same machine under the
same load, with the current code (`tools/mem-bench.mjs`). Resident memory of the process:

| | Komga (JVM) | KomgaJS | |
|---|---|---|---|
| Idle, after start-up | 612 MB | **237 MB** | ÷ 2.6 |
| After scanning and analysing the library | 862 MB | **345 MB** | ÷ 2.5 |
| After reading (thumbnails, pages) | 785 MB | **345 MB** | ÷ 2.3 |
| Start-up | 22.8 s | **2.2 s** | ÷ 10 |
| Scan and analysis of the 60 books | **51 s** | 101 s | 2 × slower |

**On a large library, the gain is not there yet.** On a Raspberry Pi 4 with a real library of
6,594 books, KomgaJS sat at 564 MB when idle after rebuilding its search index, against
583 MB for Komga right after its start. This is being worked on (memory of the index rebuild,
memory kept by the allocator after large tasks).

The scan is slower: image processing runs on a single thread to keep memory low. Background
tasks (scan, analysis, hashing, thumbnails) run in a worker thread, like Komga's task pool, so
the web server keeps answering during a scan (10 ms median, 45 ms at the 99th percentile,
measured during a scan); the worker adds about 60–100 MB while it runs and stops after 60 s
without tasks. The benchmarks are `tools/mem-bench.mjs` and `tools/scan-latency-bench.mjs`;
run them on your own library. In a container, each thread's V8 heap is capped at 40 % of the
memory limit (at least 256 MB) (`KOMGAJS_MAX_HEAP_MB` sets it explicitly); `KOMGAJS_IMAGE_THREADS` sets the number of native
libvips threads per image operation (default 1, the lowest memory; 2–4 make thumbnails and
conversions faster; 0 lets libvips use every core);
`KOMGAJS_TASK_WORKER=false` runs the tasks on the main thread.

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
    image: ghcr.io/smeagolworms4/komga-js:main
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

`:main` is a moving tag, republished on every push to `main`: the image to try the latest
version. Anything that must stay stable should point at a version tag.

### From source

Node.js 24, a C compiler, the ICU development files and `zip` (for the tests):

```sh
sudo apt install build-essential libicu-dev zip
npm ci
npm run build:native   # SQLite ICU collations, JDK-identical JPEG codec
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
differ slightly (never their sizes or formats); a scan is slower; validation errors come out
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
[here](https://github.com/Smeagolworms4/komga-js/issues).

The TypeScript port is by [SmeagolWorms4](https://github.com/Smeagolworms4), also the author
of [Media Center Sync](https://github.com/Smeagolworms4/media-center-sync).

## Licence

MIT, like Komga — both copyrights are kept in [`LICENSE`](LICENSE). A few support files are
derived from other projects and keep their own licence: see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
