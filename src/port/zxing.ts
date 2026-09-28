// Support de portage : écarts entre @zxing/library (portage JS de ZXing 3.3) et com.google.zxing:core 3.5.4 utilisé
// par Komga. Ce fichier n'a pas de jumeau Kotlin.
// - `RGBLuminanceSource` : en 3.5.4 elle hérite de `GrayscaleLuminanceSource`, qui sait tourner l'image
//   (`isRotateSupported() == true`) ; avec TRY_HARDER, `OneDReader.decode` retente donc sur l'image tournée de 90°.
//   La version JS ne le fait pas : portage à plat de GrayscaleLuminanceSource / RGBLuminanceSource 3.5.4.
// Vérifié contre la vraie bibliothèque (jshell) : test/infrastructure/metadata/barcode/BarcodeOracle.test.ts.
import { IllegalArgumentException, InvertedLuminanceSource, LuminanceSource } from '@zxing/library'

/** `com.google.zxing.GrayscaleLuminanceSource` (3.5.4) */
export class GrayscaleLuminanceSource extends LuminanceSource {
  private readonly luminances: Uint8ClampedArray
  private readonly dataWidth: number
  private readonly dataHeight: number
  private readonly left: number
  private readonly top: number

  constructor(width: number, height: number, pixels: Uint8ClampedArray)
  constructor(pixels: Uint8ClampedArray, dataWidth: number, dataHeight: number, left: number, top: number, width: number, height: number)
  constructor(...args: [number, number, Uint8ClampedArray] | [Uint8ClampedArray, number, number, number, number, number, number]) {
    if (typeof args[0] === 'number') {
      const [width, height, pixels] = args as [number, number, Uint8ClampedArray]
      super(width, height)
      this.luminances = pixels
      this.dataWidth = width
      this.dataHeight = height
      this.left = 0
      this.top = 0
    } else {
      const [pixels, dataWidth, dataHeight, left, top, width, height] = args as [Uint8ClampedArray, number, number, number, number, number, number]
      super(width, height)
      if (left + width > dataWidth || top + height > dataHeight) {
        throw new IllegalArgumentException('Crop rectangle does not fit within image data.')
      }
      this.luminances = pixels
      this.dataWidth = dataWidth
      this.dataHeight = dataHeight
      this.left = left
      this.top = top
    }
  }

  getRow(y: number, row?: Uint8ClampedArray): Uint8ClampedArray {
    if (y < 0 || y >= this.getHeight()) {
      throw new IllegalArgumentException('Requested row is outside the image: ' + y)
    }
    const width = this.getWidth()
    if (row === undefined || row === null || row.length < width) {
      row = new Uint8ClampedArray(width)
    }
    const offset = (y + this.top) * this.dataWidth + this.left
    row.set(this.luminances.subarray(offset, offset + width), 0)
    return row
  }

  getMatrix(): Uint8ClampedArray {
    const width = this.getWidth()
    const height = this.getHeight()
    // If the caller asks for the entire underlying image, save the copy and give them the
    // original data. The docs specifically warn that result.length must be ignored.
    if (width === this.dataWidth && height === this.dataHeight) {
      return this.luminances
    }
    const area = width * height
    const matrix = new Uint8ClampedArray(area)
    let inputOffset = this.top * this.dataWidth + this.left
    // If the width matches the full width of the underlying data, perform a single copy.
    if (width === this.dataWidth) {
      matrix.set(this.luminances.subarray(inputOffset, inputOffset + area), 0)
      return matrix
    }
    // Otherwise copy one cropped row at a time.
    for (let y = 0; y < height; y++) {
      const outputOffset = y * width
      matrix.set(this.luminances.subarray(inputOffset, inputOffset + width), outputOffset)
      inputOffset += this.dataWidth
    }
    return matrix
  }

  override isCropSupported(): boolean {
    return true
  }

  override crop(left: number, top: number, width: number, height: number): LuminanceSource {
    return new GrayscaleLuminanceSource(this.luminances, this.dataWidth, this.dataHeight, this.left + left, this.top + top, width, height)
  }

  override isRotateSupported(): boolean {
    return true
  }

  override rotateCounterClockwise(): LuminanceSource {
    const rotated = new Uint8ClampedArray(this.luminances.length)
    for (let y = 0; y < this.dataHeight; y++) {
      for (let x = 0; x < this.dataWidth; x++) {
        const i = y * this.dataWidth + x
        const x2 = y
        const y2 = this.dataWidth - 1 - x
        const j = y2 * this.dataHeight + x2
        rotated[j] = this.luminances[i] as number
      }
    }
    const newWidth = this.getHeight()
    const newHeight = this.getWidth()
    const newLeft = this.top
    const newTop = this.dataWidth - (this.left + this.getWidth())
    return new GrayscaleLuminanceSource(rotated, this.dataHeight, this.dataWidth, newLeft, newTop, newWidth, newHeight)
  }

  // LuminanceSource.invert() (Java : méthode concrète de la classe de base)
  invert(): LuminanceSource {
    return new InvertedLuminanceSource(this)
  }
}

/** `com.google.zxing.RGBLuminanceSource` (3.5.4) : pixels ARGB empaquetés */
export class RGBLuminanceSource extends GrayscaleLuminanceSource {
  constructor(width: number, height: number, pixels: Int32Array) {
    super(width, height, RGBLuminanceSource.toGrayscale(width, height, pixels))
  }

  private static toGrayscale(width: number, height: number, pixels: Int32Array): Uint8ClampedArray {
    const size = width * height
    if (pixels === null || pixels.length < size) {
      throw new IllegalArgumentException('Pixel array length is less than width * height')
    }
    const luminances = new Uint8ClampedArray(size)
    for (let offset = 0; offset < size; offset++) {
      const pixel = pixels[offset] as number
      const r = (pixel >> 16) & 0xff // red
      const g2 = (pixel >> 7) & 0x1fe // 2 * green
      const b = pixel & 0xff // blue
      // Calculate green-favouring average cheaply
      luminances[offset] = ((r + g2 + b) / 4) & 0xff
    }
    return luminances
  }
}
