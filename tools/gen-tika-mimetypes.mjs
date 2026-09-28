// Génère src/port/tika-mimetypes.ts : le registre de types de tika-core (org/apache/tika/mime/tika-mimetypes.xml),
// extrait tel quel du jar tika-core présent dans le classpath de Komga (build/komga-classpath.txt, voir tools/jshell-komga.sh).
// Usage : node tools/gen-tika-mimetypes.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cp = readFileSync(join(root, 'build/komga-classpath.txt'), 'utf8').split(':')
const jar = cp.find((e) => /tika-core-[\d.]+\.jar$/.test(e))
if (!jar) throw new Error('tika-core introuvable dans build/komga-classpath.txt')
const version = /tika-core-([\d.]+)\.jar$/.exec(jar)[1]
const xml = execFileSync('unzip', ['-p', jar, 'org/apache/tika/mime/tika-mimetypes.xml'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const out = `// Fichier généré par tools/gen-tika-mimetypes.mjs : ne pas modifier.
// org/apache/tika/mime/tika-mimetypes.xml de tika-core ${version} (Apache License 2.0), copie exacte.
export const TIKA_VERSION = ${JSON.stringify(version)}
export const TIKA_MIMETYPES_XML = ${JSON.stringify(xml)}
`
writeFileSync(join(root, 'src/port/tika-mimetypes.ts'), out)
console.log(`src/port/tika-mimetypes.ts : tika-core ${version}, ${xml.length} caractères`)
