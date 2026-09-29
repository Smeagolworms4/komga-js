// Support de portage : lecture du code-barres d'une page par IsbnBarcodeProvider (ZXing 3.5.4 dans Komga).
// Ce fichier n'a pas de jumeau Kotlin.
//
// PORT: écart — Komga lit le code-barres avec ZXing Java dans le thread de la tâche. Le portage JS de ZXing
// (@zxing/library) prenait ~60 ms par page de 1000x1500 sur le seul thread JS (6 pages par livre sans code-barres,
// ~24 % du temps d'analyse d'une bibliothèque neuve), avec ses tableaux (pixels ARGB, luminances, image tournée) dans
// le tas V8. Ici, par défaut, la lecture est faite par build/komgazxing.node (native/komga_zxing.c : portage à plat en C
// du seul chemin de ZXing parcouru avec POSSIBLE_FORMATS = {EAN_13} et TRY_HARDER, float de Java compris) sur le pool
// de threads de libuv : ~6 ms par page, hors du thread JS.
// Mêmes résultats que ZXing Java : fixtures Java de Komga (oracles de test/unit et test/infrastructure/metadata/barcode,
// test/port/fixtures/zxing-float). Mêmes résultats que @zxing/library en calcul double, sauf sur de rares pages (4 sur
// 8 000 générées, tools/barcode-diff.mjs) où le float de Java change la décision : là, le C donne le résultat de ZXing
// Java, @zxing/library un autre (test/port/zxing-reader.test.ts).
// @zxing/library n'est plus chargé qu'à la demande : sans l'extension native, ou avec KOMGAJS_NATIVE_BARCODE=false
// (chemin d'origine, sur le thread JS).
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BufferedImage } from './imageio.js'
import { KotlinLogging } from './logging.js'

/** Indications de ZXing passées par IsbnBarcodeProvider (`DecodeHintType.POSSIBLE_FORMATS`, `TRY_HARDER`) */
export type BarcodeHints = { possibleFormats: readonly 'EAN_13'[]; tryHarder: boolean }

/** `com.google.zxing.Result`, réduit à ce que lit IsbnBarcodeProvider */
export type BarcodeResult = { getText(): string }

type Native = {
  decode(data: Uint8Array, width: number, height: number, channels: number, cmyk: boolean, useDouble: boolean): string | null
  decodeAsync(data: Uint8Array, width: number, height: number, channels: number, cmyk: boolean, useDouble: boolean): Promise<string | null>
}

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.metadata.barcode.IsbnBarcodeProvider')
const here = dirname(fileURLToPath(import.meta.url))
let nativeModule: Native | null | undefined

/** build/komgazxing.node, chargé au premier usage ; null s'il est absent ou désactivé (KOMGAJS_NATIVE_BARCODE=false) */
export function nativeZxing(): Native | null {
  if (nativeModule === undefined) {
    nativeModule = null
    if (process.env.KOMGAJS_NATIVE_BARCODE === 'false') return nativeModule
    for (const p of [join(here, '../..', 'build/komgazxing.node'), join(here, '../../..', 'build/komgazxing.node'), join(process.cwd(), 'build/komgazxing.node')])
      if (existsSync(p)) {
        nativeModule = createRequire(import.meta.url)(p) as Native
        break
      }
    if (nativeModule === null) logger.warn(() => 'build/komgazxing.node not found (npm run build:native): barcodes are read on the event loop with @zxing/library')
  }
  return nativeModule
}

/**
 * Lit le code-barres d'une image décodée, comme les lignes de `IsbnBarcodeProvider.getBookMetadataFromBook` :
 * `image.getRGB(...)`, `RGBLuminanceSource`, `BinaryBitmap(HybridBinarizer(source))`,
 * `try { MultiFormatReader().decode(bitmap, hints) } catch (e: Exception) { null }`.
 *
 * Écart avec Komga : avec l'extension native (par défaut), décodage en C sur le pool de threads de libuv (voir en tête
 * du fichier), même résultat ; sinon, ou avec KOMGAJS_NATIVE_BARCODE=false, le code d'origine avec @zxing/library,
 * chargé à ce moment-là. Seules les indications de Komga (EAN_13 + TRY_HARDER) sont lues en natif.
 */
export async function decodeBarcode(image: BufferedImage, hints: BarcodeHints): Promise<BarcodeResult | null> {
  const native = nativeZxing()
  if (native !== null && hints.tryHarder && hints.possibleFormats.length === 1 && hints.possibleFormats[0] === 'EAN_13') {
    const text = await native.decodeAsync(image.data, image.width, image.height, image.channels, image.info.cmyk === true && image.channels === 4, false)
    return text === null ? null : { getText: () => text }
  }
  return decodeBarcodeZxingJs(image, hints)
}

/**
 * `image.getRGB(0, 0, width, height, null, 0, width)` : pixels ARGB empaquetés à partir des pixels 8 bits entrelacés
 * du BufferedImage de port/imageio.ts (1 gris, 2 gris+alpha, 3 RGB, 4 RGBA).
 * PORT: raster CMYK (TIFF CMYK) converti sans profil ICC (Java passe par l'espace colorimétrique de l'image).
 */
export function getRGB(image: BufferedImage): Int32Array {
  const { width, height, data, channels } = image
  const pixels = new Int32Array(width * height)
  const n = pixels.length
  // invariants sortis de la boucle (un appel de hasAlpha() par pixel coûtait autant que la conversion)
  const alpha = (channels === 2 || channels === 4) && image.colorModel.hasAlpha()
  const cmyk = image.info.cmyk === true && channels === 4
  if (channels <= 2) {
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const v = data[p] as number
      const a = alpha ? (data[p + 1] as number) : 255
      pixels[i] = (a << 24) | (v << 16) | (v << 8) | v
    }
  } else if (cmyk) {
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const k = data[p + 3] as number
      const r = 255 - Math.min(255, (data[p] as number) + k)
      const g = 255 - Math.min(255, (data[p + 1] as number) + k)
      const b = 255 - Math.min(255, (data[p + 2] as number) + k)
      pixels[i] = (255 << 24) | (r << 16) | (g << 8) | b
    }
  } else {
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const a = alpha ? (data[p + 3] as number) : 255
      pixels[i] = (a << 24) | ((data[p] as number) << 16) | ((data[p + 1] as number) << 8) | (data[p + 2] as number)
    }
  }
  return pixels
}

/** Chemin d'origine (sur le thread JS) : @zxing/library et port/zxing.ts, chargés au premier appel */
export async function decodeBarcodeZxingJs(image: BufferedImage, hints: BarcodeHints): Promise<BarcodeResult | null> {
  // PORT: exports lus sur l'export par défaut du module CommonJS (Node 22, runtime de l'image linux/arm/v7, ne voit pas
  // ses exports nommés)
  const zxing = (await import('@zxing/library')).default
  // PORT: com.google.zxing -> @zxing/library ; RGBLuminanceSource de ZXing 3.5.4 (rotation) portée dans port/zxing.ts
  const { quietly, RGBLuminanceSource } = await import('./zxing.js')
  const { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader } = zxing
  const zxingHints = new Map<import('@zxing/library').DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, hints.possibleFormats.map((it) => BarcodeFormat[it])],
    [DecodeHintType.TRY_HARDER, hints.tryHarder],
  ])

  const pixels = getRGB(image)
  const source = new RGBLuminanceSource(image.getWidth(), image.getHeight(), pixels)
  const bitmap = new BinaryBitmap(new HybridBinarizer(source))

  try {
    // PORT: décodage sans piles d'exception ni sortie console de @zxing/library (voir port/zxing.ts)
    return quietly(() => new MultiFormatReader().decode(bitmap, zxingHints))
  } catch (e) {
    return null
  }
}
