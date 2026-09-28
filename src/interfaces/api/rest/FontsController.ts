// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/FontsController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { KomgaProperties } from '../../../infrastructure/configuration/KomgaProperties.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { containsString } from '../../../language/LanguageUtils.js'
import { FilenameUtils } from '../../../port/commons-io.js'
import { pathExtension, pathName, isDirectory, isReadable, listDirectoryEntries } from '../../../port/java-nio-file.js'
import { DataClass, groupBy } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { resourcesDir } from '../../../port/resources.js'
import { ByteArrayResource, FileSystemResource } from '../../../port/spring-core-io.js'
import { HttpStatus, MediaType, type Resource, ResponseEntity, ResponseStatusException, contentDisposition, pathVariable, restController } from '../../../port/spring-web.js'
import { OpenApiTypes } from '../../../port/swagger-annotations.js'

const logger = KotlinLogging.logger('org.gotson.komga.interfaces.api.rest.FontsController')

// PORT: PathMatchingResourcePatternResolver.getResources("/embeddedFonts/**/*.*") : fichiers du répertoire
// resources/embeddedFonts (classpath), parcourus récursivement, triés par chemin comme Files.walk(..).sorted()
function embeddedFontResources(): FileSystemResource[] {
  const root = join(resourcesDir(), 'embeddedFonts')
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const f = join(dir, name)
      if (statSync(f).isDirectory()) walk(f)
      else if (name.includes('.')) out.push(f)
    }
  }
  walk(root)
  return out.sort().map((it) => new FileSystemResource(it))
}

// @RestController
// @RequestMapping(value = ["api/v1/fonts"], produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.BOOK_FONTS)
export class FontsController {
  private readonly supportedExtensions = ['woff', 'woff2', 'ttf', 'otf']
  private readonly fonts: Map<string, FileSystemResource[]>

  constructor(komgaProperties: KomgaProperties) {
    let fontsEmbedded: Map<string, FileSystemResource[]>
    try {
      fontsEmbedded = groupBy(
        embeddedFontResources()
          .filter((it) => it.filename !== null)
          .filter((it) => containsString(this.supportedExtensions, FilenameUtils.getExtension(it.uri.toString()), true)),
        // PORT: FilenameUtils.getName(FilenameUtils.getPathNoEndSeparator(uri)) : nom du répertoire parent
        (it) => basename(dirname(it.path)),
      )
    } catch (e) {
      logger.error(e as Error, () => 'Could not load embedded fonts')
      fontsEmbedded = new Map()
    }

    const fontsDir = komgaProperties.fonts.dataDirectory
    let fontsAdditional: Map<string, FileSystemResource[]>
    try {
      if (isDirectory(fontsDir) && isReadable(fontsDir)) {
        fontsAdditional = new Map(
          listDirectoryEntries(fontsDir)
            .filter((it) => isDirectory(it))
            .map((dir) => [
              pathName(dir),
              listDirectoryEntries(dir)
                .filter((it) => {
                  try {
                    return statSync(it).isFile()
                  } catch {
                    return false
                  }
                })
                .filter((it) => isReadable(it))
                .filter((it) => containsString(this.supportedExtensions, pathExtension(it), true))
                .map((it) => new FileSystemResource(it)),
            ]),
        )
      } else {
        fontsAdditional = new Map()
      }
    } catch (e) {
      logger.error(e as Error, () => 'Could not load additional fonts')
      fontsAdditional = new Map()
    }

    this.fonts = new Map([...fontsEmbedded, ...fontsAdditional])

    logger.info(() => `Fonts embedded: ${mapToString(fontsEmbedded)}`)
    logger.info(() => `Fonts discovered: ${mapToString(fontsAdditional)}`)
  }

  // @GetMapping("families")
  // @Operation(summary = "List font families", description = "List all available font families.")
  getFonts(): Set<string> {
    return new Set(this.fonts.keys())
  }

  // @GetMapping("resource/{fontFamily}/{fontFile}")
  // @Operation(summary = "Download font file")
  // @SecurityRequirements
  getFontFile(fontFamily: string, fontFile: string): ResponseEntity<Resource> {
    const resources = this.fonts.get(fontFamily)
    if (resources !== undefined) {
      const resource = resources.find((it) => it.filename === fontFile) ?? null
      if (resource === null) throw new ResponseStatusException(HttpStatus.NOT_FOUND)
      const mediaType = `font/${FilenameUtils.getExtension(resource.uri.toString()).toLowerCase()}`
      return ResponseEntity.ok()
        .headersFrom((it) => {
          it.setContentDisposition(contentDisposition('attachment', fontFile))
        })
        .contentType(MediaType.parseMediaType(mediaType))
        .body<Resource>(resource)
    }
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  // @GetMapping("resource/{fontFamily}/css", produces = ["text/css"])
  // @Operation(summary = "Download CSS file", description = "Download a CSS file with the @font-face block for the font family. This is used by the Epub Reader to change fonts.")
  // @SecurityRequirements
  getFontFamilyAsCss(fontFamily: string): ResponseEntity<Resource> {
    const files = this.fonts.get(fontFamily)
    if (files !== undefined) {
      const groups = groupBy(files, (it) => this.getFontCharacteristics(FilenameUtils.getName(it.uri.toString())))

      const css = [...groups.entries()]
        .map(([styleWeight, resources]) => this.buildFontFaceBlock(fontFamily, styleWeight, resources))
        .join('\n')

      return ResponseEntity.ok()
        .headersFrom((it) => {
          it.setContentDisposition(contentDisposition('attachment', `${fontFamily}.css`))
        })
        .body<Resource>(new ByteArrayResource(Buffer.from(css, 'utf8')))
    }
    throw new ResponseStatusException(HttpStatus.NOT_FOUND)
  }

  private buildFontFaceBlock(fontFamily: string, styleAndWeight: FontCharacteristics, fonts: FileSystemResource[]): string {
    const srcBlock = `${fonts
      .map((resource) => {
        const filename = FilenameUtils.getName(resource.uri.toString())
        const extension = FilenameUtils.getExtension(resource.uri.toString()).toLowerCase()
        const format = extension === 'ttf' ? 'truetype' : extension === 'otf' ? 'opentype' : extension
        return `url('${filename}') format('${format}')`
      })
      .join(',')};`
    // language=CSS
    return `@font-face {
    font-family: '${fontFamily}';
    src: ${srcBlock}
    font-weight: ${styleAndWeight.weight};
    font-style: ${styleAndWeight.style};
}
`
  }

  private getFontCharacteristics(filename: string): FontCharacteristics {
    const style = filename.toLowerCase().includes('italic') ? 'italic' : 'normal'
    const weight = filename.toLowerCase().includes('bold') ? 'bold' : 'normal'
    return new FontCharacteristics({ style: style, weight: weight })
  }
}

class FontCharacteristics extends DataClass<{ style: string; weight: string }> {
  readonly style: string
  readonly weight: string

  constructor({ style, weight }: { style: string; weight: string }) {
    super()
    this.style = style
    this.weight = weight
  }
}

/** `Map.toString()` Kotlin (valeurs : `toString()` des ressources) */
function mapToString(m: Map<string, FileSystemResource[]>): string {
  return `{${[...m].map(([k, v]) => `${k}=[${v.map((it) => it.toString()).join(', ')}]`).join(', ')}}`
}

restController(FontsController, {
  inject: [KomgaProperties],
  javaName: 'org.gotson.komga.interfaces.api.rest.FontsController',
  requestMapping: { path: ['api/v1/fonts'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.BOOK_FONTS] },
  handlers: {
    getFonts: {
      mapping: { method: 'GET', path: ['families'] },
      returns: { set: 'String' },
      openapi: { operation: { summary: 'List font families', description: 'List all available font families.' } },
    },
    getFontFile: {
      mapping: { method: 'GET', path: ['resource/{fontFamily}/{fontFile}'] },
      args: [pathVariable('fontFamily'), pathVariable('fontFile')],
      returns: OpenApiTypes.Resource,
      openapi: { operation: { summary: 'Download font file' }, securityRequirements: true },
    },
    getFontFamilyAsCss: {
      mapping: { method: 'GET', path: ['resource/{fontFamily}/css'], produces: ['text/css'] },
      args: [pathVariable('fontFamily')],
      returns: OpenApiTypes.Resource,
      openapi: {
        operation: {
          summary: 'Download CSS file',
          description: 'Download a CSS file with the @font-face block for the font family. This is used by the Epub Reader to change fonts.',
        },
        securityRequirements: true,
      },
    },
  },
})
