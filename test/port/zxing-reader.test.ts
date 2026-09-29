// port/zxing-reader.ts : la lecture native (build/komgazxing.node, native/komga_zxing.c) rend les mêmes résultats que
// ZXing Java (fixtures de test/infrastructure/metadata/fixtures/barcode-oracle.json, produites par Komga) et que
// @zxing/library (chemin d'origine) sur des pages générées : EAN-13 valides ou non, petits, tournés, flous, bruités,
// coupés, avec extension, rayures et bruit sans code-barres. Comparaison plus large : tools/barcode-diff.mjs.
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { ImageIO } from '../../src/port/imageio-codecs.js'
import type { BufferedImage } from '../../src/port/imageio.js'
import { type BarcodeHints, decodeBarcode, decodeBarcodeZxingJs, nativeZxing } from '../../src/port/zxing-reader.js'

const hints: BarcodeHints = { possibleFormats: ['EAN_13'], tryHarder: true }
const native = nativeZxing()!
const decodeNative = (image: BufferedImage, useDouble: boolean) =>
  native.decode(image.data, image.width, image.height, image.channels, image.info.cmyk === true && image.channels === 4, useDouble)
const decodeJs = async (image: BufferedImage) => (await decodeBarcodeZxingJs(image, hints))?.getText() ?? null

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = L.map((p) => [...p].map((c) => (c === '0' ? '1' : '0')).reverse().join(''))
const R = L.map((p) => [...p].map((c) => (c === '0' ? '1' : '0')).join(''))
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
const checkDigit = (d12: string) => {
  let s = 0
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1)
  return String((10 - (s % 10)) % 10)
}
function modules(code: string): string {
  const first = Number(code[0])
  let m = '101'
  for (let i = 1; i <= 6; i++) m += (PARITY[first]![i - 1] === 'L' ? L : G)[Number(code[i])]
  m += '01010'
  for (let i = 7; i <= 12; i++) m += R[Number(code[i])]
  return m + '101'
}

/** Page générée (graine) : code-barres EAN-13 (85 %), rayures (8 %) ou bruit, puis bruit, rotation, flou, réduction, format */
async function generatedPage(seed: number): Promise<Uint8Array> {
  const r = rng(seed * 2654435761)
  const W = [240, 400, 640, 900][Math.floor(r() * 4)]!
  const H = Math.round(W * (1.2 + r() * 0.4))
  const canvas = new Uint8Array(W * H).fill(200 + Math.floor(r() * 56))
  const kind = r()
  if (kind < 0.85) {
    let d = ['978', '979', '0', '3', ''][Math.floor(r() * 5)]!
    while (d.length < 12) d += Math.floor(r() * 10)
    const code = r() < 0.1 ? d + String((Number(checkDigit(d)) + 1 + Math.floor(r() * 9)) % 10) : d + checkDigit(d)
    let mods = modules(code)
    if (r() < 0.15) mods += '000000000' + '1011' + L[3] + '01' + G[7] + '01' + L[1] + '01' + L[0] + '01' + G[9]
    const mw = [0.7, 1, 1.3, 1.5, 2, 3][Math.floor(r() * 6)]!
    const bw = mods.length * mw
    const bh = Math.max(4, Math.round(bw * (0.1 + r() * 0.5)))
    const quiet = r() < 0.15 ? r() * 4 * mw : (7 + r() * 10) * mw
    const bx = Math.floor(r() * Math.max(1, W - bw)) + (r() < 0.1 ? Math.floor((r() - 0.5) * bw * 0.4) : 0)
    const by = Math.floor(r() * Math.max(1, H - bh))
    const paper = 225 + Math.floor(r() * 31)
    const ink = Math.floor(r() * 90)
    for (let y = by - 4; y < by + bh + 4; y++)
      for (let x = Math.floor(bx - quiet); x < Math.ceil(bx + bw + quiet); x++) if (x >= 0 && x < W && y >= 0 && y < H) canvas[y * W + x] = paper
    for (let i = 0; i < mods.length; i++) {
      if (mods[i] !== '1') continue
      const a = bx + i * mw
      const b = a + mw
      for (let x = Math.floor(a); x < Math.ceil(b); x++) {
        if (x < 0 || x >= W) continue
        const cov = Math.min(b, x + 1) - Math.max(a, x)
        for (let y = by; y < by + bh && y < H; y++) canvas[y * W + x] = Math.round(canvas[y * W + x]! - cov * (canvas[y * W + x]! - ink))
      }
    }
  } else if (kind < 0.93) {
    const y0 = Math.floor(r() * H * 0.8)
    const hh = Math.floor(10 + r() * H * 0.2)
    let x = Math.floor(r() * W * 0.2)
    while (x < W * 0.9) {
      const w = 1 + Math.floor(r() * 5)
      if (r() < 0.5) for (let y = y0; y < y0 + hh; y++) for (let k = x; k < x + w && k < W; k++) canvas[y * W + k] = 20
      x += w
    }
  } else {
    for (let i = 0; i < canvas.length; i++) canvas[i] = Math.floor(r() * 256)
  }
  const sigma = r() < 0.5 ? 0 : r() * 40
  if (sigma > 0) for (let i = 0; i < canvas.length; i++) canvas[i] = Math.max(0, Math.min(255, Math.round(canvas[i]! + (r() + r() + r() - 1.5) * sigma)))
  let img = sharp(Buffer.from(canvas), { raw: { width: W, height: H, channels: 1 } })
  const angle = [0, 0, 0, 90, 180, 270, 1, -2, 5, 30][Math.floor(r() * 10)]!
  if (angle) img = sharp(await img.rotate(angle, { background: '#ffffff' }).png().toBuffer())
  if (r() < 0.3) img = img.blur(0.3 + r() * 1.5)
  if (r() < 0.3) img = sharp(await img.resize(Math.max(8, Math.round(W * (0.3 + r() * 0.7)))).png().toBuffer())
  if (r() < 0.05) img = img.negate()
  const f = r()
  if (f < 0.5) {
    if (r() < 0.5) img = img.toColourspace('srgb')
    if (r() < 0.05) img = img.toColourspace('cmyk')
    return img.jpeg({ quality: [10, 40, 75, 95][Math.floor(r() * 4)]! }).toBuffer()
  }
  if (f < 0.8) return (r() < 0.3 ? img.ensureAlpha(0.5 + r() * 0.5) : img).png().toBuffer()
  return img.webp({ quality: 30 + Math.floor(r() * 70) }).toBuffer()
}

describe('zxing-reader', () => {
  it('reads the Komga fixtures like ZXing Java', async () => {
    const oracle = JSON.parse(readFileSync(new URL('../infrastructure/metadata/fixtures/barcode-oracle.json', import.meta.url), 'utf8')) as Record<string, { decode: string | null }>
    let images = 0
    for (const [file, expected] of Object.entries(oracle)) {
      const image = await ImageIO.read(new Uint8Array(readFileSync(file))).catch(() => null)
      if (image === null) continue
      images++
      expect(decodeNative(image, false), file).toBe(expected.decode)
      expect((await decodeBarcode(image, hints))?.getText() ?? null, file).toBe(expected.decode)
      expect(await decodeJs(image), file).toBe(expected.decode)
    }
    expect(images).toBeGreaterThan(10)
  })

  // pages générées où @zxing/library (patternMatchVariance en double) diffère de ZXing Java (float), trouvées par
  // tools/barcode-diff.mjs (4 sur 8 000) ; résultat Java : fixtures/zxing-float/zxing-float.jsh
  it('reads like ZXing Java where @zxing/library differs (float arithmetic)', async () => {
    const oracle = JSON.parse(readFileSync(new URL('./fixtures/zxing-float/oracle.json', import.meta.url), 'utf8')) as Record<string, string | null>
    for (const [file, expected] of Object.entries(oracle)) {
      const image = (await ImageIO.read(new Uint8Array(readFileSync(file))))!
      expect(decodeNative(image, false), file).toBe(expected)
      expect((await decodeBarcode(image, hints))?.getText() ?? null, file).toBe(expected)
      // en double (comme @zxing/library), l'autre résultat
      expect(decodeNative(image, true), file).toBe(await decodeJs(image))
      expect(decodeNative(image, true), file).not.toBe(expected)
    }
  })

  it('reads generated pages like @zxing/library', async () => {
    const results: (string | null)[] = []
    for (let seed = 0; seed < 150; seed++) {
      const image = (await ImageIO.read(await generatedPage(seed)))!
      const js = await decodeJs(image)
      expect(decodeNative(image, false), `seed ${seed}`).toBe(js)
      expect(decodeNative(image, true), `seed ${seed}`).toBe(js)
      expect(await native.decodeAsync(image.data, image.width, image.height, image.channels, image.info.cmyk === true && image.channels === 4, false)).toBe(js)
      results.push(js)
    }
    // des pages avec et sans code-barres lu
    expect(results.filter((it) => it !== null).length).toBeGreaterThan(20)
    expect(results.filter((it) => it === null).length).toBeGreaterThan(20)
  }, 120000)

  it('rejects invalid arguments', () => {
    expect(() => native.decode(new Uint8Array(3), 2, 2, 1, false, false)).toThrow(TypeError)
    expect(() => native.decode(new Uint8Array(4), 2, 2, 5, false, false)).toThrow(TypeError)
    expect(native.decode(new Uint8Array(0), 0, 0, 1, false, false)).toBe(null)
  })
})
