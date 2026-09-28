// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/pdf/PdfExtractor.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import * as mupdf from 'mupdf'
import { Dimension } from '../../../domain/model/Dimension.js'
import { MediaContainerEntry } from '../../../domain/model/MediaContainerEntry.js'
import { MediaType } from '../../../domain/model/MediaType.js'
import { TypedBytes } from '../../../domain/model/TypedBytes.js'
import { IOException } from '../../../port/java-io.js'
import { IllegalArgumentException } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { component } from '../../../port/spring.js'
import type { ImageType } from '../../image/ImageType.js'

// PORT: PDFBox -> mupdf (WebAssembly, API synchrone). Le nombre de pages, les dimensions (CropBox limitée à la
// MediaBox, héritage des attributs, sans rotation, en float comme PDRectangle), le type et la taille des images rendues
// (floor(dimension × échelle), rotation de page) reproduisent PDFBox ; les pixels rendus et les octets encodés
// (JPEG qualité 0.75 comme ImageIO, PNG) diffèrent : écart accepté. Le PDF d'une page extraite est produit par
// mupdf (même contenu, octets différents).

// PORT: messages de mupdf (réparations, avertissements) envoyés au journal, comme les avertissements de PDFBox
const pdfLogger = KotlinLogging.logger('org.apache.pdfbox')
mupdf.setLog({ warning: (message: string) => pdfLogger.warn(() => message), error: (message: string) => pdfLogger.error(() => message) })

/** `org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException` */
export class InvalidPasswordException extends IOException {}

/** `javax.imageio.IIOException` */
export class IIOException extends IOException {}

/** Rectangle PDFBox (PDRectangle) : coins normalisés, valeurs float */
type PDRectangle = { llx: number; lly: number; urx: number; ury: number }

const f = Math.fround

function width(r: PDRectangle): number {
  return f(r.urx - r.llx)
}

function height(r: PDRectangle): number {
  return f(r.ury - r.lly)
}

/** `new PDRectangle(COSArray)` */
function rectangleOf(array: mupdf.PDFObject): PDRectangle {
  const values = [0, 0, 0, 0]
  for (let i = 0; i < Math.min(4, array.length); i++) {
    const v = array.get(i)
    values[i] = v.isNumber() ? f(v.asNumber()) : 0
  }
  const [x1, y1, x2, y2] = values as [number, number, number, number]
  return { llx: Math.min(x1, x2), lly: Math.min(y1, y2), urx: Math.max(x1, x2), ury: Math.max(y1, y2) }
}

/** `PDPage.getMediaBox()` : LETTER par défaut */
function mediaBoxOf(page: mupdf.PDFObject): PDRectangle {
  const base = page.getInheritable('MediaBox')
  return base.isArray() ? rectangleOf(base) : { llx: 0, lly: 0, urx: f(8.5 * 72), ury: f(11 * 72) }
}

/** `PDPage.getCropBox()` : CropBox limitée à la MediaBox, ou MediaBox */
function cropBoxOf(page: mupdf.PDFObject): PDRectangle {
  const base = page.getInheritable('CropBox')
  if (!base.isArray()) return mediaBoxOf(page)
  const box = rectangleOf(base)
  const mediaBox = mediaBoxOf(page)
  return {
    llx: Math.max(mediaBox.llx, box.llx),
    lly: Math.max(mediaBox.lly, box.lly),
    urx: Math.min(mediaBox.urx, box.urx),
    ury: Math.min(mediaBox.ury, box.ury),
  }
}

/** `PDPage.getRotation()` */
function rotationOf(page: mupdf.PDFObject): number {
  const obj = page.getInheritable('Rotate')
  if (!obj.isNumber()) return 0
  const rotationAngle = Math.trunc(obj.asNumber())
  if (rotationAngle % 90 === 0) return ((rotationAngle % 360) + 360) % 360
  return 0
}

/** `Float.roundToInt()` */
function roundToInt(x: number): number {
  if (Number.isNaN(x)) throw new IllegalArgumentException('Cannot round NaN value.')
  if (x > 2147483647) return 2147483647
  if (x < -2147483648) return -2147483648
  return Math.round(x)
}

/** `Loader.loadPDF(file)` : lecture à la demande du fichier (mupdf.Stream sur fs.readSync) */
function loadPDF(path: string): mupdf.PDFDocument {
  const fd = openSync(path, 'r')
  const size = fstatSync(fd).size
  let closed = false
  const stream = new mupdf.Stream({
    fileSize: () => size,
    read: (memory: Uint8Array, offset: number, length: number, position: number) => readSync(fd, memory, offset, length, position),
    close: () => {
      if (!closed) {
        closed = true
        closeSync(fd)
      }
    },
  })
  try {
    const doc = mupdf.Document.openDocument(stream, 'application/pdf') as mupdf.PDFDocument
    // PDFBox ouvre un PDF chiffré avec un mot de passe utilisateur vide, sinon InvalidPasswordException
    if (doc.needsPassword() && doc.authenticatePassword('') === 0) {
      doc.destroy()
      throw new InvalidPasswordException('Cannot decrypt PDF, the password is incorrect')
    }
    return doc
  } catch (e) {
    if (e instanceof IOException) throw e
    throw new IOException(String((e as Error).message ?? e), e)
  } finally {
    stream.destroy()
  }
}

function use<R>(doc: mupdf.PDFDocument, block: (doc: mupdf.PDFDocument) => R): R {
  try {
    return block(doc)
  } finally {
    doc.destroy()
  }
}

export class PdfExtractor {
  constructor(
    // @Qualifier("pdfImageType")
    private readonly imageType: ImageType,
    // @Qualifier("pdfResolution")
    private readonly resolution: number,
  ) {}

  getPages(path: string, analyzeDimensions: boolean): MediaContainerEntry[] {
    return use(loadPDF(path), (pdf) =>
      Array.from({ length: pdf.countPages() }, (_, index) => {
        const page = (pdf.loadPage(index) as mupdf.PDFPage).getObject()
        const dimension = analyzeDimensions ? new Dimension({ width: roundToInt(width(cropBoxOf(page))), height: roundToInt(height(cropBoxOf(page))) }) : null
        return new MediaContainerEntry({ name: `${index + 1}`, dimension: dimension })
      }),
    )
  }

  getPageContentAsImage(path: string, pageNumber: number): TypedBytes {
    return use(loadPDF(path), (pdf) => {
      const page = pdf.loadPage(pageNumber - 1) as mupdf.PDFPage
      const scale = this.getPageScale(page.getObject())
      // PDFRenderer.renderImage(pageIndex, scale, RGB)
      const cropBox = cropBoxOf(page.getObject())
      let widthPx = Math.trunc(Math.max(Math.floor(f(width(cropBox) * scale)), 1))
      let heightPx = Math.trunc(Math.max(Math.floor(f(height(cropBox) * scale)), 1))
      const rotationAngle = rotationOf(page.getObject())
      if (rotationAngle === 90 || rotationAngle === 270) [widthPx, heightPx] = [heightPx, widthPx]
      // PDFRenderer : image de plus de Integer.MAX_VALUE pixels refusée ; ImageIO JPEG : 65500 pixels au plus par côté
      if (widthPx * heightPx > 2147483647) throw new IOException(`Maximum size of image exceeded (w * h * scale) = ${widthPx * heightPx} > ${2147483647}`)
      if (this.imageType.imageIOFormat === 'JPEG' && (widthPx > 65500 || heightPx > 65500)) throw new IIOException('Maximum supported image dimension is 65500 pixels')
      const bounds = page.getBounds('CropBox')
      const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, widthPx, heightPx], false)
      try {
        pixmap.clear(255)
        const device = new mupdf.DrawDevice(mupdf.Matrix.concat(mupdf.Matrix.translate(-bounds[0], -bounds[1]), mupdf.Matrix.scale(scale, scale)), pixmap)
        try {
          page.run(device, mupdf.Matrix.identity)
          device.close()
        } finally {
          device.destroy()
        }
        // ImageIO.write(image, imageType.imageIOFormat, out)
        const bytes = this.imageType.imageIOFormat === 'JPEG' ? pixmap.asJPEG(75) : pixmap.asPNG()
        return new TypedBytes({ bytes: new Uint8Array(bytes), mediaType: this.imageType.mediaType })
      } finally {
        pixmap.destroy()
      }
    })
  }

  getPageContentAsPdf(path: string, pageNumber: number): TypedBytes {
    return use(loadPDF(path), (pdf) => {
      // PageExtractor(pdf, pageNumber, pageNumber).extract().save(out)
      const out = new mupdf.PDFDocument()
      try {
        out.graftPage(0, pdf, pageNumber - 1)
        const bytes = out.saveToBuffer('compress').asUint8Array()
        return new TypedBytes({ bytes: new Uint8Array(bytes), mediaType: MediaType.PDF.type })
      } finally {
        out.destroy()
      }
    })
  }

  private getPageScale(page: mupdf.PDFObject): number {
    const cropBox = cropBoxOf(page)
    return this.getScale(width(cropBox), height(cropBox))
  }

  private getScale(width: number, height: number): number {
    return f(this.resolution / Math.min(width, height))
  }

  scaleDimension(dimension: Dimension): Dimension {
    const scale = this.getScale(f(dimension.width), f(dimension.height))
    return new Dimension({ width: roundToInt(f(dimension.width * scale)), height: roundToInt(f(dimension.height * scale)) })
  }
}

// @Service
component(PdfExtractor, {
  inject: [{ expression: (ctx) => ctx.getBean('pdfImageType') }, { expression: (ctx) => ctx.getBean('pdfResolution') }],
})
