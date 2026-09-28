# Third-party notices

KomgaJS is a port of [Komga](https://github.com/gotson/komga) (MIT, © Gauthier Roebroeck).
Every file with a `// @port-of` header is a translation of the Komga file it names, and the
test resources under `test/resources` (except `test/resources/port`) come from Komga.

To behave exactly like the Java libraries Komga relies on, some support code under `src/port`
and `native` is ported from, or includes, the following projects. Their licences apply to those
files.

| Files | Derived from | Licence |
|---|---|---|
| `native/libjpeg6b/` | Independent JPEG Group's libjpeg 6b, as bundled in OpenJDK 21 (Oracle's glue code excluded) | IJG licence (see `native/libjpeg6b/README`) — "this software is based in part on the work of the Independent JPEG Group" |
| `native/lcms2/` | Little-CMS 2.19, © Marti Maria Saguer | MIT (`native/lcms2/LICENSE`) |
| `native/jdk-profiles/*.pf` | ICC profiles from OpenJDK 21 `java.desktop` | GPL v2 with the Classpath Exception |
| `src/port/lucene/` | Apache Lucene 9.9.1 (analysers, JFlex tokenizer tables, ASCIIFoldingFilter table, classic QueryParser, BM25) | Apache License 2.0 |
| `src/port/tika.ts`, `src/port/tika-mimetypes.ts` | Apache Tika 3.3.2 (`tika-mimetypes.xml` and the detector) | Apache License 2.0 |
| `src/port/validation-messages.ts`, `src/port/validation-engine.ts` | Hibernate Validator 8.0.3 (default messages, validator behaviour) | Apache License 2.0 |
| `src/port/commons-validator.ts` | Apache Commons Validator 1.11.0 | Apache License 2.0 |
| `src/port/natsort.ts` | natural-comparator 1.1 (net.grey-panther) | Apache License 2.0 |
| `src/port/zxing.ts` | ZXing 3.5.4 | Apache License 2.0 |
| `src/port/jsoup-parser.ts` | jsoup 1.23.1, © Jonathan Hedley | MIT |
| `src/port/thumbnailator.ts` | Thumbnailator 0.4.21, © Chris Kroells | MIT |
| `src/port/extra-metadata.ts` (ULocale) | ICU4J 78.3 | Unicode License v3 |
| `src/port/junrar.ts` | junrar 8.1.0 (header reading only; decompression is done by node-unrar-js) | UnRAR licence: may not be used to develop a RAR-compatible archiver |
| `src/port/lucene/JavaCharacter.ts`, `src/port/imageio-readers.ts` | behaviour of OpenJDK 21/23 and the TwelveMonkeys ImageIO plugins, reimplemented | behaviour only, no code copied |

Spring, Jackson, jOOQ, Flyway, sqlite-jdbc and the other Java frameworks Komga uses are
**reimplemented** (same API and behaviour, new code); no source was copied from them.

The npm dependencies (sharp, mupdf, better-sqlite3, node-unrar-js, …) are installed from npm
under their own licences and are not part of this repository.
