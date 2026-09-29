// Vérification de la lecture / écriture JPEG (port/jpeg-jdk.ts via port/imageio-codecs.ts) contre la JVM de Komga :
// BookAnalyzer.hashPage réécrit chaque page JPEG (ImageIO.read puis ImageIO.write "jpeg") avant d'en calculer
// l'empreinte, qui est comparée aux empreintes connues (pages en double). Les octets doivent donc être identiques.
//
// Oracle : fixtures/jpeg-jdk.jsh (tools/jshell-komga.sh sur Temurin 21, libjpeg 6b du JDK + TwelveMonkeys), exécuté sur
// tous les JPEG de test/resources, sur les pages JPEG des archives ZIP/EPUB de test/resources, et sur des JPEG tronqués
// (1/10 à 9/10 de la taille) ; résultat dans fixtures/jpeg-jdk.json.
// test/resources/port/jpeg-jdk : JPEG générés pour couvrir les chemins de lecture (PIL/libjpeg-turbo, ImageMagick,
// libjpeg 6b pour les cas particuliers de gen/ : YCCK, alpha, marqueurs Adobe incohérents, identifiants de composantes,
// scripts progressifs ; profils ICC de colord et profils générés par LittleCMS dans icc/).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Hasher } from '../../src/infrastructure/hash/Hasher.js'
import { ByteArrayInputStream, ByteArrayOutputStream } from '../../src/port/java-io.js'
import { ImageIO } from '../../src/port/imageio-codecs.js'
import { readJpegLikeJdk } from '../../src/port/jpeg-jdk.js'
import { ZipFile } from '../../src/port/zip.js'

const here = dirname(fileURLToPath(import.meta.url))
const resources = join(here, '../resources')
const oracle = JSON.parse(readFileSync(join(here, 'fixtures/jpeg-jdk.json'), 'utf8')) as {
  file: string
  entry?: string
  truncate?: number
  hash?: string
  error?: string
}[]

/**
 * Écarts connus : image CMYK avec un profil ICC qui n'a pas 4 composantes. TwelveMonkeys convertit alors avec son
 * espace CMYK non ICC (ColorConvertOp pixel par pixel via CIEXYZ), non reproduit : décodage par sharp.
 */
const KNOWN_DIFFERENCES = new Set(['port/jpeg-jdk/icc/cmykwithrgb.jpg'])

const hasher = new Hasher()

/** BookAnalyzer.hashPage pour une page image/jpeg */
async function hashPage(content: Uint8Array): Promise<string> {
  const image = await ImageIO.read(new ByteArrayInputStream(content))
  // ImageIO.write(null, ...) : IllegalArgumentException sur la JVM
  if (image === null) throw new Error('image == null!')
  const buffer = new ByteArrayOutputStream()
  await ImageIO.write(image, 'jpeg', buffer)
  return hasher.computeHash(new ByteArrayInputStream(buffer.toByteArray()))
}

const zipEntries = new Map<string, Map<string, Uint8Array>>()
function zipEntry(file: string, entry: string): Uint8Array {
  let entries = zipEntries.get(file)
  if (entries === undefined) {
    entries = new Map()
    const z = ZipFile.builder().setPath(join(resources, file)).get()
    for (const e of z.getEntries()) {
      try {
        entries.set(e.getName(), z.getInputStream(e).readAllBytes())
      } catch {
        // entrée illisible : absente de l'oracle
      }
    }
    zipEntries.set(file, entries)
  }
  const bytes = entries.get(entry)
  if (bytes === undefined) throw new Error(`${file}!${entry} introuvable`)
  return bytes
}

function content(c: (typeof oracle)[number]): Uint8Array {
  if (c.entry !== undefined) return zipEntry(c.file, c.entry)
  const bytes = new Uint8Array(readFileSync(join(resources, c.file)))
  return c.truncate === undefined ? bytes : bytes.subarray(0, Math.floor((bytes.length * c.truncate) / 10))
}

function label(c: (typeof oracle)[number]): string {
  return c.file + (c.entry !== undefined ? `!${c.entry}` : '') + (c.truncate !== undefined ? ` [${c.truncate}/10]` : '')
}

describe('jpeg-jdk', () => {
  it('hashPage of JPEG pages matches Komga (JVM) byte for byte', async () => {
    const mismatches: string[] = []
    let checked = 0
    for (const c of oracle) {
      if (KNOWN_DIFFERENCES.has(c.file) && c.truncate === undefined) continue
      let actual: string
      try {
        actual = `hash ${await hashPage(content(c))}`
      } catch (e) {
        actual = `error ${(e as Error).message}`
      }
      const expected = c.hash !== undefined ? `hash ${c.hash}` : `error ${c.error!.replace(/^[\w.$]+: /, '')}`
      if (actual !== expected) mismatches.push(`${label(c)}: ${actual} != ${expected}`)
      checked++
    }
    expect(mismatches).toEqual([])
    expect(checked).toBeGreaterThan(200)
  }, 120_000)

  it('known differences fall back to sharp', async () => {
    for (const file of KNOWN_DIFFERENCES) expect(await readJpegLikeJdk(new Uint8Array(readFileSync(join(resources, file)))), file).toBeNull()
  })
})
