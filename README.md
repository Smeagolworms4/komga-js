# KomgaJS

[![Build](https://github.com/Smeagolworms4/komga-js/actions/workflows/build.yml/badge.svg)](https://github.com/Smeagolworms4/komga-js/actions/workflows/build.yml)
[![Image](https://img.shields.io/badge/ghcr.io-komga--js%3Amain-0b7285)](https://github.com/Smeagolworms4/komga-js/pkgs/container/komga-js)
[![Komga](https://img.shields.io/badge/port%20of-Komga%201.27.1-005ed3)](https://github.com/gotson/komga)
[![Licence](https://img.shields.io/badge/licence-MIT-3d7a3d)](LICENSE)

[Komga](https://komga.org), the media server for your comics, mangas, BDs, magazines and
eBooks — with its backend ported line by line from Kotlin to TypeScript. Same server, same
API, same database, same web interface, **two to three times less memory**.

*[Version française](README.fr.md)*

Komga is written in Kotlin on the JVM, and a JVM is generous with memory: an idle Komga
with an empty library sits above half a gigabyte, and grows past a gigabyte once it has
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
| Idle, after start-up | 574 MB | **241 MB** | ÷ 2.4 |
| After scanning and analysing the library | 1,011 MB | **346 MB** | ÷ 2.9 |
| After reading (thumbnails, pages) | 1,088 MB | **347 MB** | ÷ 3.1 |
| Start-up | 22.1 s | **2.0 s** | ÷ 11 |
| Scan and analysis of the 60 books | **57 s** | 66 s | 1.2 × slower |

**Large libraries.** The search index used to be the problem: the port kept it as JavaScript
objects, about 70 KB per book, so on a Raspberry Pi 4 with a real library of 6,594 books
KomgaJS idled at 564 MB, no better than Komga. The index now lives off the V8 heap, in compact
typed arrays, with the same search results as Lucene. On a generated library of 7,000 books,
the idle memory after rebuilding the index went from 797 MB to about 300 MB, and the rebuild
fits in a 256 MB heap up to at least 48,000 books (x86-64 bench). The Raspberry Pi figures will
be re-measured with this version.

The scan is slower: image processing uses one native thread by default to keep memory low.
Everything runs on a single JavaScript thread, with a single V8 heap: background tasks (scan,
analysis, hashing, thumbnails) and web requests share it. Every wait (file reads, hashing,
decompression, image and JPEG coding, kepubify) runs on libuv's thread pool, and long loops
hand the thread back every 10 ms, so several tasks progress together, like Komga's task
threads, while the web server keeps answering: 11 ms median, 29 ms at the 99th percentile,
measured during the scan and analysis of 6,500 generated books (the previous architecture,
with the tasks in a separate worker thread, used 80 MB more at start-up and 170 MB more at the
peak of the scan; 60 s after the last task, both give their memory back, about 175 MB). The benchmarks are `tools/mem-bench.mjs` and `tools/scan-latency-bench.mjs`;
run them on your own library. In a container, the V8 heap is capped at a quarter of the memory
limit (at least 256 MB) (`KOMGAJS_MAX_HEAP_MB` sets it explicitly); `KOMGAJS_IMAGE_THREADS`
sets the number of native libvips threads per image operation (default 1, the lowest memory;
2 made thumbnails about 20 % faster on large pages, 4 no faster; 0 lets libvips use every core); `UV_THREADPOOL_SIZE`
(Node, default 4) bounds how many of those waits run at once, keep it above the number of task
threads. What still runs on the JavaScript thread and can delay requests while it lasts: SQLite
queries, PDF rendering, RAR decompression, EPUB parsing, search index updates.
`KOMGAJS_TASK_WORKER=true` runs the tasks in a separate worker thread instead (a second V8 heap,
60–100 MB more while tasks run, stopped after 60 s without tasks).

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
