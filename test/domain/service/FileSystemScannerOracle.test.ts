// Vérification de FileSystemScanner contre le FileSystemScanner de Komga (JVM), sur une vraie arborescence
// construite au moment du test : noms unicode (NFC et NFD), espaces et caractères réservés d'URL, fichiers et
// répertoires cachés, extensions en casse mixte, liens symboliques (répertoire, fichier, cassé, boucle),
// séries imbriquées, répertoire de oneshots, exclusions, sidecars de livres et de séries, dates à la nanoseconde.
//
// Deux modes :
// - par défaut : comparaison avec le résultat enregistré (fixtures/filesystemscanner-oracle.json). L'ordre des
//   entrées de répertoire dépend du système de fichiers (ordre brut de readdir, haché sous ext4) : il n'est pas
//   comparé dans ce mode (lignes triées), les valeurs le sont (noms, URL, dates, tailles, oneshot, sidecars) ;
// - KOMGA_ORACLE=1 : Komga est exécuté en direct (tools/jshell-komga.sh) sur la même arborescence et les sorties
//   sont comparées ligne à ligne, ordre compris ; la fixture est réécrite.
//
// Les sidecars utilisent LocalArtworkProvider et MylarSeriesProvider côté JVM ; côté TS, leurs méthodes
// SidecarBookConsumer / SidecarSeriesConsumer sont reproduites ici (le portage de LocalArtworkProvider est fait ailleurs).
// Les dates de modification sont fixées dans le futur (2031) : elles sont postérieures aux dates de naissance, donc
// maxOf(creationTime, lastModifiedTime) vaut lastModifiedTime avec le JDK 21 de l'oracle comme avec un JDK >= 22.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LocalDateTime, ZoneId } from '@js-joda/core'
import '@js-joda/timezone'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Sidecar } from '../../../src/domain/model/Sidecar.js'
import type { ScanResult } from '../../../src/domain/model/ScanResult.js'
import { FileSystemScanner } from '../../../src/domain/service/FileSystemScanner.js'
import { SidecarBookConsumer } from '../../../src/infrastructure/sidecar/SidecarBookConsumer.js'
import { SidecarSeriesConsumer } from '../../../src/infrastructure/sidecar/SidecarSeriesConsumer.js'
import { str } from '../../../src/port/kotlin.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, 'fixtures/filesystemscanner-oracle.json')
const LIVE = process.env.KOMGA_ORACLE === '1'

// --- sidecars : reproduction de LocalArtworkProvider / MylarSeriesProvider -------------------------------------
const supportedExtensions = ['png', 'jpeg', 'jpg', 'tbn', 'webp', 'gif']
const supportedSeriesFiles = ['cover', 'default', 'folder', 'poster', 'series']
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
const baseName = (s: string) => {
  const n = s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1)
  const i = n.lastIndexOf('.')
  return i < 0 ? n : n.slice(0, i)
}

class LocalArtworkConsumer implements SidecarBookConsumer, SidecarSeriesConsumer {
  getSidecarBookType(): Sidecar.Type {
    return Sidecar.Type.ARTWORK
  }
  getSidecarBookPrefilter(): RegExp[] {
    return supportedExtensions.map((ext) => new RegExp(`.*(-\\d+)?\\.${ext}`, 'iu'))
  }
  isSidecarBookMatch(basename: string, sidecar: string): boolean {
    return new RegExp(`^(?:${escape(basename)}(-\\d+)?)$`, 'iu').test(baseName(sidecar))
  }
  getSidecarSeriesType(): Sidecar.Type {
    return Sidecar.Type.ARTWORK
  }
  getSidecarSeriesFilenames(): string[] {
    return supportedSeriesFiles.flatMap((filename) => supportedExtensions.map((ext) => `${filename}.${ext}`))
  }
}

class MylarConsumer implements SidecarSeriesConsumer {
  getSidecarSeriesType(): Sidecar.Type {
    return Sidecar.Type.METADATA
  }
  getSidecarSeriesFilenames(): string[] {
    return ['series.json']
  }
}

// --- arborescence ------------------------------------------------------------------------------------------------
// [chemin relatif, taille] ; les répertoires finissent par '/'
const FILES: [string, number][] = [
  ['rootbook.cbz', 11],
  ['Series A/', 0],
  ['Series A/Vol 01.cbz', 101],
  ['Series A/Vol 02.CBZ', 102],
  ['Series A/vol 03.pdf', 103],
  ['Series A/Vol 01.jpg', 5],
  ['Series A/Vol 01-1.png', 6],
  ['Series A/VOL 03.webp', 7],
  ['Series A/Vol 02-x.jpg', 8],
  ['Series A/cover.jpg', 9],
  ['Series A/series.json', 10],
  ['Series A/notes.txt', 12],
  ['Series A/.hidden.cbz', 13],
  ['Series A/cbz', 14],
  ['Series A/trailing.', 15],
  ['Séries é ü 日本/', 0],
  ['Séries é ü 日本/第1巻.epub', 201],
  ["Séries é ü 日本/a b+c&d=e;f,g$h@i!j~k*l'm(n).cbz", 202],
  ['Séries é ü 日本/100%.cbr', 203],
  ['Séries é ü 日本/#hash?q.zip', 204],
  ['Séries é ü 日本/a[b]{c}^`|<>"\\.rar', 205],
  ['Séries é ü 日本/énfd.cbz', 206],
  ['Nested/', 0],
  ['Nested/root.cbz', 301],
  ['Nested/Sub1/', 0],
  ['Nested/Sub1/s1.cbz', 302],
  ['Nested/Sub1/Sub2/', 0],
  ['Nested/Sub1/Sub2/s2.rar', 303],
  ['Nested/Sub1/Sub2/.hiddendir/', 0],
  ['Nested/Sub1/Sub2/.hiddendir/x.cbz', 304],
  ['Nested/_OneShots/', 0],
  ['Nested/_OneShots/one3.cbz', 305],
  ['Nested/_OneShots/one3.png', 306],
  ['.hidden/', 0],
  ['.hidden/h.cbz', 401],
  ['#recycle/', 0],
  ['#recycle/trash.cbz', 402],
  ['#recycle/sub/', 0],
  ['#recycle/sub/t2.cbz', 403],
  ['@RECYCLE/', 0],
  ['@RECYCLE/r.cbz', 404],
  ['_oneshots/', 0],
  ['_oneshots/one1.cbz', 501],
  ['_oneshots/one2.pdf', 502],
  ['_oneshots/one1.jpg', 503],
  ['_oneshots/folder.png', 504],
  ['Empty/', 0],
  ['Only txt/', 0],
  ['Only txt/readme.txt', 601],
  ['Only txt/cover.jpg', 602],
  ['Links/', 0],
]
// [lien, cible]
const LINKS: [string, string][] = [
  ['Links/linkToSeriesA', '../Series A'],
  ['Links/book-link.cbz', '../Nested/root.cbz'],
  ['Links/broken.cbz', 'does-not-exist.cbz'],
  ['Links/loop', '..'],
]

function mtime(i: number): string {
  // secondes (2031) et nanosecondes variées : 0, millisecondes seules, nanosecondes complètes
  const sec = 1924992000 + i * 3671
  const nanos = [0, 100000000, 123456789, 5000, 999999999, 120000][i % 6] as number
  return `@${sec}.${String(nanos).padStart(9, '0')}`
}

function buildTree(root: string): void {
  mkdirSync(root)
  for (const [p, size] of FILES) {
    const abs = join(root, p)
    if (p.endsWith('/')) mkdirSync(abs)
    else writeFileSync(abs, Buffer.alloc(size, 0x61))
  }
  for (const [l, t] of LINKS) symlinkSync(t, join(root, l))
  // dates : fichiers, puis répertoires du plus profond au moins profond, puis la racine
  const entries = FILES.map(([p], i) => [p, i] as const)
  const touch = (p: string, i: number) => execFileSync('touch', ['-m', '-d', mtime(i), join(root, p)])
  for (const [p, i] of entries) if (!p.endsWith('/')) touch(p, i)
  for (const [p, i] of [...entries].filter(([p]) => p.endsWith('/')).sort((a, b) => b[0].split('/').length - a[0].split('/').length)) touch(p, i)
  touch('', FILES.length)
}

// --- scénarios ---------------------------------------------------------------------------------------------------
type Scenario = { label: string; force: boolean; oneshots: string | null; cbx: boolean; pdf: boolean; epub: boolean; exclusions: string[] }
const SCENARIOS: Scenario[] = [
  { label: 'A', force: false, oneshots: null, cbx: true, pdf: true, epub: true, exclusions: [] },
  { label: 'B', force: true, oneshots: '_oneshots', cbx: true, pdf: false, epub: true, exclusions: ['#recycle', '@recycle'] },
  { label: 'C', force: false, oneshots: 'oneshots', cbx: false, pdf: true, epub: true, exclusions: ['sub1'] },
]
const SCAN_FILES = ['Links/book-link.cbz', 'Links/broken.cbz', 'Series A/Vol 01.cbz', 'Series A/missing.cbz']
const SIDECARS_OF = ['Series A/Vol 01.cbz', 'Series A/vol 03.pdf', '_oneshots/one1.cbz']

function dumpScan(label: string, r: ScanResult): string[] {
  const out: string[] = []
  for (const [s, books] of r.series) {
    out.push(`${label}\tS\t${s.name}\t${str(s.url)}\t${s.fileLastModified.toString()}\t${s.oneshot}`)
    for (const b of books) out.push(`${label}\tB\t${b.name}\t${str(b.url)}\t${b.fileLastModified.toString()}\t${b.fileSize}\t${b.oneshot}`)
  }
  for (const c of r.sidecars) out.push(`${label}\tC\t${str(c.url)}\t${str(c.parentUrl)}\t${c.lastModifiedTime.toString()}\t${c.type.name}\t${c.source.name}`)
  return out
}

async function runTs(root: string): Promise<string[]> {
  const la = new LocalArtworkConsumer()
  const scanner = new FileSystemScanner([la], [la, new MylarConsumer()])
  const out: string[] = []
  for (const s of SCENARIOS)
    out.push(
      ...dumpScan(
        s.label,
        await scanner.scanRootFolder(root, {
          forceDirectoryModifiedTime: s.force,
          oneshotsDir: s.oneshots,
          scanCbx: s.cbx,
          scanPdf: s.pdf,
          scanEpub: s.epub,
          directoryExclusions: new Set(s.exclusions),
        }),
      ),
    )
  for (const f of SCAN_FILES) {
    const b = scanner.scanFile(join(root, f))
    out.push(b === null ? `F\t${f}\tnull` : `F\t${f}\t${b.name}\t${str(b.url)}\t${b.fileLastModified.toString()}\t${b.fileSize}`)
  }
  for (const f of SIDECARS_OF)
    for (const c of scanner.scanBookSidecars(join(root, f)))
      out.push(`K\t${f}\t${str(c.url)}\t${str(c.parentUrl)}\t${c.lastModifiedTime.toString()}\t${c.type.name}\t${c.source.name}`)
  return out
}

const jstr = (s: string) => JSON.stringify(s)
const jset = (a: string[]) => `Set.of(${a.map(jstr).join(', ')})`

function runJvm(root: string, work: string): string[] {
  const script = `
import org.gotson.komga.domain.service.FileSystemScanner;
import org.gotson.komga.domain.model.ScanResult;
import org.gotson.komga.infrastructure.metadata.localartwork.LocalArtworkProvider;
import org.gotson.komga.infrastructure.metadata.mylar.MylarSeriesProvider;
import org.gotson.komga.infrastructure.mediacontainer.ContentDetector;
import org.gotson.komga.infrastructure.image.ImageAnalyzer;
import java.nio.file.*;
import java.util.*;
var la = new LocalArtworkProvider(new ContentDetector(new org.apache.tika.config.TikaConfig()), new ImageAnalyzer());
var my = new MylarSeriesProvider(new com.fasterxml.jackson.databind.ObjectMapper());
var scanner = new FileSystemScanner(List.of(la), List.of(la, my));
var out = new ArrayList<String>();
void dump(String label, ScanResult r) {
  for (var e : r.getSeries().entrySet()) {
    var s = e.getKey();
    out.add(label + "\\tS\\t" + s.getName() + "\\t" + s.getUrl() + "\\t" + s.getFileLastModified() + "\\t" + s.getOneshot());
    for (var b : e.getValue()) out.add(label + "\\tB\\t" + b.getName() + "\\t" + b.getUrl() + "\\t" + b.getFileLastModified() + "\\t" + b.getFileSize() + "\\t" + b.getOneshot());
  }
  for (var c : r.getSidecars()) out.add(label + "\\tC\\t" + c.getUrl() + "\\t" + c.getParentUrl() + "\\t" + c.getLastModifiedTime() + "\\t" + c.getType() + "\\t" + c.getSource());
}
var root = Path.of(${jstr(root)});
${SCENARIOS.map((s) => `dump(${jstr(s.label)}, scanner.scanRootFolder(root, ${s.force}, ${s.oneshots === null ? 'null' : jstr(s.oneshots)}, ${s.cbx}, ${s.pdf}, ${s.epub}, ${jset(s.exclusions)}));`).join('\n')}
for (var f : List.of(${SCAN_FILES.map(jstr).join(', ')})) {
  var b = scanner.scanFile(root.resolve(f));
  out.add(b == null ? "F\\t" + f + "\\tnull" : "F\\t" + f + "\\t" + b.getName() + "\\t" + b.getUrl() + "\\t" + b.getFileLastModified() + "\\t" + b.getFileSize());
}
for (var f : List.of(${SIDECARS_OF.map(jstr).join(', ')})) {
  for (var c : scanner.scanBookSidecars(root.resolve(f))) out.add("K\\t" + f + "\\t" + c.getUrl() + "\\t" + c.getParentUrl() + "\\t" + c.getLastModifiedTime() + "\\t" + c.getType() + "\\t" + c.getSource());
}
Files.write(Path.of(${jstr(join(work, 'jvm.txt'))}), out, java.nio.charset.StandardCharsets.UTF_8);
/exit
`
  const scriptPath = join(work, 'oracle.jsh')
  writeFileSync(scriptPath, script)
  execFileSync(join(here, '../../../tools/jshell-komga.sh'), ['-R-Dfile.encoding=UTF-8', scriptPath], {
    stdio: ['ignore', 'ignore', 'inherit'],
    timeout: 600_000,
  })
  return readFileSync(join(work, 'jvm.txt'), 'utf8').split('\n').filter((it) => it.length > 0)
}

// --- normalisation -----------------------------------------------------------------------------------------------
const LDT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?/g

/** chemins temporaires -> TMP ; dates locales (fuseau `zone`) -> instants UTC */
function normalize(lines: string[], tmp: string, zone: string): string[] {
  const tmpUrl = tmp.split('/').map((it) => encodeURIComponent(it)).join('/')
  return lines.map((l) =>
    l
      .replaceAll(`file:${tmpUrl}`, 'file:TMP')
      .replace(LDT, (m) => LocalDateTime.parse(m).atZone(ZoneId.of(zone)).toInstant().toString()),
  )
}

describe('FileSystemScanner oracle', () => {
  let work: string
  let root: string

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'komga-fss-oracle-'))
    root = join(work, 'library')
    buildTree(root)
  })

  afterAll(() => rmSync(work, { recursive: true, force: true }))

  it('scan results match Komga', { timeout: 600_000 }, async () => {
    const zone = ZoneId.systemDefault().id()
    const ts = await runTs(root)
    const actual = normalize(ts, work, zone)

    if (LIVE) {
      const jvm = runJvm(root, work)
      // ordre compris : même arborescence, même ordre de readdir
      expect(ts).toEqual(jvm)
      mkdirSync(dirname(FIXTURE), { recursive: true })
      writeFileSync(FIXTURE, JSON.stringify({ zone, lines: normalize(jvm, work, zone) }, null, 1) + '\n')
    }

    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { lines: string[] }
    expect([...actual].sort()).toEqual([...fixture.lines].sort())
  })
})
