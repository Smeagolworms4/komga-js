// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/FontsControllerOracleTest.kt
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { KomgaProperties } from '../../../../../src/infrastructure/configuration/KomgaProperties.js'
import { FontsController } from '../../../../../src/interfaces/api/rest/FontsController.js'
import type { ResponseEntity } from '../../../../../src/port/spring-web.js'
import { oracle, oracleBytes, tempDir } from '../../../oracle.js'
import { entity } from './rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/FontsController')

const props = (dir: string) => {
  const p = new KomgaProperties()
  p.fonts.dataDirectory = dir
  return p
}

let instance: FontsController | null = null
/** Même arborescence côté Kotlin : un fichier par groupe style/graisse, l'ordre de listage n'intervient pas */
const controller = (): FontsController => {
  if (instance === null) {
    const dir = join(tempDir(), 'fonts')
    const tree: [string, string[]][] = [
      ['Solo', ['Solo-Regular.TTF']],
      ['Duo', ['duo-bolditalic.otf', 'readme.txt', 'Duo.woff.bak']],
      ['Other', ['x.woff2']],
      ['Empty', []],
    ]
    for (const [family, files] of tree) {
      mkdirSync(join(dir, family), { recursive: true })
      for (const it of files) writeFileSync(join(dir, family, it), oracleBytes(8))
    }
    writeFileSync(join(dir, 'stray.ttf'), oracleBytes(1))
    instance = new FontsController(props(dir))
  }
  return instance
}

const head = (e: ResponseEntity) => [e.statusCode, e.headers.getFirst('Content-Disposition'), e.headers.getFirst('Content-Type')]
const css = async (family: string) => Buffer.from(((await entity(controller().getFontFamilyAsCss(family))).value as [number, unknown, { '@bytes': string }])[2]['@bytes'], 'base64').toString('utf8')

func('getFonts', () => {
  kase('sorted families', () => [...controller().getFonts()].sort())
  kase('no data directory', () => [...new FontsController(props(join(tempDir(), 'none'))).getFonts()].sort())
})
func('getFontFile', () => {
  kase('additional font', () => entity(controller().getFontFile('Solo', 'Solo-Regular.TTF')))
  kase('otf', () => entity(controller().getFontFile('Duo', 'duo-bolditalic.otf')))
  kase('unsupported file', () => controller().getFontFile('Duo', 'readme.txt'))
  kase('embedded font', () => head(controller().getFontFile('OpenDyslexic', 'OpenDyslexic-Bold.woff2')))
  kase('missing file', () => controller().getFontFile('Solo', 'nope.ttf'))
  kase('missing family', () => controller().getFontFile('Nope', 'Solo-Regular.TTF'))
  kase('family is case sensitive', () => controller().getFontFile('solo', 'Solo-Regular.TTF'))
})
func('getFontFamilyAsCss', () => {
  kase('single file', () => entity(controller().getFontFamilyAsCss('Solo')))
  kase('missing family', () => controller().getFontFamilyAsCss('Nope'))
  kase('empty family', () => entity(controller().getFontFamilyAsCss('Empty')))
})
func('buildFontFaceBlock', () => {
  kase('truetype', () => css('Solo'))
  kase('opentype bold italic', () => css('Duo'))
  kase('woff2', () => css('Other'))
  kase('embedded, several groups', () => css('OpenDyslexic'))
})
func('getFontCharacteristics', () => {
  kase('embedded groups', async () => (await css('OpenDyslexic')).split('\n').filter((it) => it.includes('font-weight') || it.includes('font-style')))
})
