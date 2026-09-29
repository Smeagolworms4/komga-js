#!/usr/bin/env node
// Comparaison différentielle de la lecture des codes-barres (src/port/zxing-reader.ts) : @zxing/library (chemin
// d'origine) contre build/komgazxing.node, en float (ZXing Java) et en double (@zxing/library), sur des pages générées
// (EAN-13 valides ou non, petits, tournés, flous, bruités, coupés, avec extension, rayures, bruit ; JPEG, PNG, WebP,
// CMJN, alpha) et sur de vraies pages. Écarts et images dans build/barcode-diff/ (mismatch.jsonl, mismatch/).
// Prérequis : npm run build && npm run build:native.
// Usage : node tools/barcode-diff.mjs <shard> <shards> <pages générées> [dossier de vraies pages] [première graine]
//   (4 processus : shard 0 à 3 sur 4). DUMP=<dossier> : écrit seulement les images générées (pour ZXing Java,
//   voir test/port/fixtures/zxing-float/zxing-float.jsh).
// Relevé (septembre 2026) : 12 374 pages (4 000 + 8 000 générées, 374 vraies), 0 écart en double ; en float, 4 écarts
// avec @zxing/library, où ZXing Java donne le résultat du float (test/port/fixtures/zxing-float).
import { mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import zxing from '@zxing/library'
import sharp from 'sharp'
import { ImageIO } from '../dist/src/port/imageio-codecs.js'
import { RGBLuminanceSource, quietly } from '../dist/src/port/zxing.js'

sharp.concurrency(1)
const native = createRequire(import.meta.url)('../build/komgazxing.node')
const { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader } = zxing
const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]], [DecodeHintType.TRY_HARDER, true]])
const [shard = "0", shards = "1", synth = "100", realDir, start = "0"] = process.argv.slice(2)
const OUT = new URL('../build/barcode-diff/', import.meta.url).pathname
mkdirSync(`${OUT}mismatch`, { recursive: true })

// --- copie de getRGB de IsbnBarcodeProvider.ts
function getRGB(image) {
  const { width, height, data, channels } = image
  const pixels = new Int32Array(width * height)
  const n = pixels.length
  const alpha = (channels === 2 || channels === 4) && image.colorModel.hasAlpha()
  const cmyk = image.info.cmyk === true && channels === 4
  if (channels <= 2) {
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const v = data[p]
      const a = alpha ? data[p + 1] : 255
      pixels[i] = (a << 24) | (v << 16) | (v << 8) | v
    }
  } else if (cmyk) {
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const k = data[p + 3]
      const r = 255 - Math.min(255, data[p] + k)
      const g = 255 - Math.min(255, data[p + 1] + k)
      const b = 255 - Math.min(255, data[p + 2] + k)
      pixels[i] = (255 << 24) | (r << 16) | (g << 8) | b
    }
  } else {
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const a = alpha ? data[p + 3] : 255
      pixels[i] = (a << 24) | (data[p] << 16) | (data[p + 1] << 8) | data[p + 2]
    }
  }
  return pixels
}

function decodeJs(image) {
  const source = new RGBLuminanceSource(image.getWidth(), image.getHeight(), getRGB(image))
  try {
    return quietly(() => new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(source)), hints)).getText()
  } catch {
    return null
  }
}
const decodeNative = (image, useDouble) => native.decode(image.data, image.width, image.height, image.channels, image.info.cmyk === true, useDouble)

// --- générateur pseudo-aléatoire déterministe
function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

// --- EAN-13
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = L.map((p) => [...p].map((c) => (c === '0' ? '1' : '0')).reverse().join(''))
const R = L.map((p) => [...p].map((c) => (c === '0' ? '1' : '0')).join(''))
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
const checkDigit = (d12) => {
  let s = 0
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1)
  return String((10 - (s % 10)) % 10)
}
function modules(code) {
  const first = Number(code[0])
  let m = '101'
  for (let i = 1; i <= 6; i++) m += PARITY[first][i - 1] === 'L' ? L[Number(code[i])] : G[Number(code[i])]
  m += '01010'
  for (let i = 7; i <= 12; i++) m += R[Number(code[i])]
  return m + '101'
}
// extension à 5 chiffres (prix), dessinée après le code
function addon5(digits) {
  const CHECK = ['GGLLL', 'GLGLL', 'GLLGL', 'GLLLG', 'LGGLL', 'LLGGL', 'LLLGG', 'LGLGL', 'LGLLG', 'LLGLG']
  let c = 0
  for (let i = 0; i < 5; i++) c += Number(digits[i]) * (i % 2 ? 9 : 3)
  const par = CHECK[c % 10]
  let m = '1011'
  for (let i = 0; i < 5; i++) {
    if (i > 0) m += '01'
    m += par[i] === 'L' ? L[Number(digits[i])] : G[Number(digits[i])]
  }
  return m
}

/** Page grise (1 canal) avec un code-barres : largeur de module mw (flottant), anticrénelé */
function drawBarcode(canvas, W, H, x0, y0, mods, mw, bh, ink, paper) {
  for (let i = 0; i < mods.length; i++) {
    if (mods[i] !== '1') continue
    const a = x0 + i * mw
    const b = a + mw
    for (let x = Math.floor(a); x < Math.ceil(b); x++) {
      if (x < 0 || x >= W) continue
      const cov = Math.min(b, x + 1) - Math.max(a, x)
      for (let y = y0; y < y0 + bh; y++) {
        if (y < 0 || y >= H) continue
        const o = y * W + x
        canvas[o] = Math.round(canvas[o] - cov * (canvas[o] - ink))
      }
    }
  }
}

let backgrounds = []
async function background(r, W, H) {
  const kind = r()
  if (kind < 0.3 || backgrounds.length === 0) {
    const paper = 200 + Math.floor(r() * 56)
    return new Uint8Array(W * H).fill(paper)
  }
  const src = backgrounds[Math.floor(r() * backgrounds.length)]
  return new Uint8Array(await sharp(src).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer())
}

async function synthCase(seed) {
  const r = rng(seed * 2654435761)
  const W = [300, 500, 800, 1000, 1200, 1600][Math.floor(r() * 6)]
  const H = Math.round(W * (1.2 + r() * 0.4))
  const canvas = await background(r, W, H)
  const kind = r()
  let code = null
  const desc = { seed, W, H }
  if (kind < 0.85) {
    // code EAN-13 : ISBN 978/979, code commençant par 0, ou autre ; parfois chiffre de contrôle faux
    const prefix = ['978', '979', '0', '3', '5', ''][Math.floor(r() * 6)]
    let d = prefix
    while (d.length < 12) d += Math.floor(r() * 10)
    code = d + checkDigit(d)
    if (r() < 0.08) code = d + String((Number(checkDigit(d)) + 1 + Math.floor(r() * 9)) % 10)
    let mods = modules(code)
    if (r() < 0.15) mods += '000000000' + addon5(String(Math.floor(r() * 100000)).padStart(5, '0'))
    const mw = [0.6, 0.8, 1, 1, 1.3, 1.5, 2, 2, 2.5, 3, 4][Math.floor(r() * 11)]
    const bw = mods.length * mw
    const bh = Math.max(4, Math.round(bw * (0.1 + r() * 0.6)))
    const quiet = r() < 0.15 ? r() * 4 * mw : (7 + r() * 10) * mw
    // encadré blanc (zone de silence) puis code ; position quelconque, parfois au bord ou coupée
    const bx = Math.floor(r() * Math.max(1, W - bw)) + (r() < 0.1 ? Math.floor((r() - 0.5) * bw * 0.4) : 0)
    const by = Math.floor(r() * Math.max(1, H - bh))
    const paper = 225 + Math.floor(r() * 31)
    for (let y = by - 4; y < by + bh + 4; y++)
      for (let x = Math.floor(bx - quiet); x < Math.ceil(bx + bw + quiet); x++) if (x >= 0 && x < W && y >= 0 && y < H) canvas[y * W + x] = paper
    const ink = Math.floor(r() * 90)
    drawBarcode(canvas, W, H, bx, by, mods, mw, bh, ink, paper)
    Object.assign(desc, { code, mw, bh, quiet: Math.round(quiet * 10) / 10, ink })
  } else if (kind < 0.93) {
    // rayures aléatoires (faux positifs)
    const y0 = Math.floor(r() * H * 0.8)
    const hh = Math.floor(10 + r() * H * 0.2)
    let x = Math.floor(r() * W * 0.2)
    while (x < W * 0.9) {
      const w = 1 + Math.floor(r() * 5)
      if (r() < 0.5) for (let y = y0; y < y0 + hh; y++) for (let k = x; k < x + w && k < W; k++) canvas[y * W + k] = 20
      x += w
    }
    desc.stripes = true
  } else {
    // bruit pur
    for (let i = 0; i < canvas.length; i++) canvas[i] = Math.floor(r() * 256)
    desc.noise = true
  }
  // bruit gaussien approché
  const sigma = r() < 0.5 ? 0 : r() * 40
  if (sigma > 0) for (let i = 0; i < canvas.length; i++) canvas[i] = Math.max(0, Math.min(255, Math.round(canvas[i] + (r() + r() + r() - 1.5) * sigma)))
  desc.sigma = Math.round(sigma)
  let img = sharp(Buffer.from(canvas), { raw: { width: W, height: H, channels: 1 } })
  const angles = [0, 0, 0, 90, 180, 270, 1, -2, 3, 5, -8, 15, 30, 45]
  const angle = angles[Math.floor(r() * angles.length)]
  if (angle) img = sharp(await img.rotate(angle, { background: '#ffffff' }).png().toBuffer())
  const blur = r() < 0.3 ? 0.3 + r() * 1.5 : 0
  if (blur) img = img.blur(blur)
  const scale = r() < 0.3 ? 0.3 + r() * 0.7 : 1
  if (scale !== 1) {
    const meta = await img.clone().png().toBuffer().then((b) => sharp(b).metadata())
    img = sharp(await img.resize(Math.max(8, Math.round(meta.width * scale))).png().toBuffer())
  }
  if (r() < 0.05) img = img.negate()
  Object.assign(desc, { angle, blur: Math.round(blur * 10) / 10, scale: Math.round(scale * 100) / 100 })
  const f = r()
  let bytes
  if (f < 0.5) {
    const q = [5, 10, 20, 40, 60, 75, 90, 95][Math.floor(r() * 8)]
    const color = r() < 0.5
    if (color) img = img.toColourspace('srgb')
    if (r() < 0.05) {
      img = img.toColourspace('cmyk')
      desc.cmyk = true
    }
    bytes = await img.jpeg({ quality: q }).toBuffer()
    desc.fmt = `jpeg${q}${color ? 'c' : ''}`
  } else if (f < 0.8) {
    if (r() < 0.3) img = img.ensureAlpha(0.5 + r() * 0.5)
    bytes = await img.png().toBuffer()
    desc.fmt = 'png'
  } else {
    bytes = await img.webp({ quality: 30 + Math.floor(r() * 70) }).toBuffer()
    desc.fmt = 'webp'
  }
  return { name: `synth-${seed}`, bytes, desc }
}

function* realPages(dir) {
  const files = readdirSync(dir, { recursive: true }).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort()
  for (const f of files) yield f
}

const stats = { cases: 0, jsFound: 0, nativeFound: 0, mismatchDouble: 0, mismatchFloat: 0, jsMs: 0, nativeMs: 0, nullImage: 0 }
const now = () => performance.now()
async function check(name, bytes, desc) {
  const image = await ImageIO.read(bytes)
  if (image === null) {
    stats.nullImage++
    return
  }
  let t = now()
  const js = decodeJs(image)
  stats.jsMs += now() - t
  t = now()
  const nf = decodeNative(image, false)
  stats.nativeMs += now() - t
  const nd = decodeNative(image, true)
  stats.cases++
  if (js !== null) stats.jsFound++
  if (nf !== null) stats.nativeFound++
  if (js !== nd) stats.mismatchDouble++
  if (js !== nf) stats.mismatchFloat++
  if (js !== nd || js !== nf) {
    const ext = bytes[0] === 0xff ? 'jpg' : bytes[0] === 0x89 ? 'png' : 'webp'
    writeFileSync(`${OUT}mismatch/${name.replace(/[^\w.-]/g, '_')}.${ext}`, bytes)
    appendFileSync(`${OUT}mismatch.jsonl`, JSON.stringify({ name, js, nativeFloat: nf, nativeDouble: nd, desc }) + '\n')
  }
  appendFileSync(`${OUT}results-${shard}.jsonl`, JSON.stringify({ name, js, nf, desc }) + '\n')
}

if (process.env.DUMP) {
  // DUMP=<dossier> : écrit les images des graines [start, start + synth) (pour ZXing Java)
  mkdirSync(process.env.DUMP, { recursive: true })
  const all = [...realPages(realDir)]
  backgrounds = all.filter((_, k) => k % 7 === 0).map((f) => `${realDir}/${f}`)
  for (let seed = Number(start); seed < Number(start) + Number(synth); seed++) {
    const c = await synthCase(seed)
    const ext = c.bytes[0] === 0xff ? 'jpg' : c.bytes[0] === 0x89 ? 'png' : 'webp'
    writeFileSync(`${process.env.DUMP}/${c.name}.${ext}`, c.bytes)
  }
  process.exit(0)
}
const sh = Number(shard)
const shs = Number(shards)
if (realDir) {
  let i = 0
  const all = [...realPages(realDir)]
  backgrounds = all.filter((_, k) => k % 7 === 0).map((f) => `${realDir}/${f}`)
  for (const f of all) {
    if (i++ % shs !== sh || start !== "0") continue
    await check(`real-${f}`, readFileSync(`${realDir}/${f}`), { real: f })
  }
}
for (let seed = Number(start) + sh; seed < Number(start) + Number(synth); seed += shs) {
  const c = await synthCase(seed)
  await check(c.name, c.bytes, c.desc)
}
console.log(JSON.stringify({ shard, ...stats, jsMsPerPage: stats.jsMs / stats.cases, nativeMsPerPage: stats.nativeMs / stats.cases }))
