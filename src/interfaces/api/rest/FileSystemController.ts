// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/FileSystemController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { readdirSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { json } from '../../../port/jackson.js'
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'
import { IllegalPathException, isDirectory, pathName, pathParent } from '../../../port/java-nio-file.js'
import { HttpStatus, MediaType, ResponseStatusException, requestBody, restController } from '../../../port/spring-web.js'

// PORT: FileSystems.getDefault() (UnixFileSystem) : chemins = chaînes ; getPath normalise comme UnixPath
// (séparateurs multiples fusionnés, séparateur final retiré, caractère NUL refusé : InvalidPathException)
const fs = {
  rootDirectories: ['/'],
  getPath(path: string): string {
    if (path.includes('\u0000')) throw new IllegalPathException(`Nul character not allowed: ${path}`)
    const p = path.replace(/\/+/g, '/')
    return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p
  },
}

/** `Files.isHidden(path)` (Unix : nom commençant par un point) */
function isHidden(path: string): boolean {
  return pathName(path).startsWith('.')
}

/** `String.CASE_INSENSITIVE_ORDER` */
function caseInsensitiveCompare(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    let c1 = a.charAt(i)
    let c2 = b.charAt(i)
    if (c1 !== c2) {
      c1 = c1.toUpperCase()
      c2 = c2.toUpperCase()
      if (c1 !== c2) {
        c1 = c1.toLowerCase()
        c2 = c2.toLowerCase()
        if (c1 !== c2) return c1.charCodeAt(0) - c2.charCodeAt(0)
      }
    }
  }
  return a.length - b.length
}

// @RestController
// @RequestMapping("api/v1/filesystem", produces = [MediaType.APPLICATION_JSON_VALUE])
// @PreAuthorize("hasRole('ADMIN')")
// @Tag(name = OpenApiConfiguration.TagNames.FILE_SYSTEM)
export class FileSystemController {
  private readonly fs = fs

  // @PostMapping
  // @Operation(
  //   summary = "Directory listing",
  //   description = "List folders and files from the host server's file system. If no request body is passed then the root directories are returned.",
  // )
  getDirectoryListing(
    // @RequestBody(required = false)
    request: DirectoryRequestDto = new DirectoryRequestDto(),
  ): DirectoryListingDto {
    if (request.path.length === 0) {
      return new DirectoryListingDto({
        directories: this.fs.rootDirectories.map((it) => toDto(it)),
        files: [],
      })
    } else {
      const path = this.fs.getPath(request.path)
      if (!isAbsolute(path)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 'Path must be absolute')
      const directory = isDirectory(path) ? path : pathParent(path)
      try {
        // PORT: Files.list(directory) (ordre de readdir, trié ensuite)
        const all = readdirSync(directory as string)
          .map((it) => (directory === '/' ? `/${it}` : `${directory}/${it}`))
          .filter((it) => !isHidden(it) && (!request.showFiles ? isDirectory(it) : true))
          .sort((a, b) => caseInsensitiveCompare(a, b))
          .map((it) => toDto(it))
        const directories = all.filter((it) => it.type === 'directory')
        const files = all.filter((it) => it.type !== 'directory')
        return new DirectoryListingDto({
          parent: pathParent(path) ?? '',
          directories: directories,
          files: files,
        })
      } catch (_e) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 'Path does not exist')
      }
    }
  }
}

type DirectoryRequestDtoParams = {
  path?: string
  showFiles?: boolean
}

export class DirectoryRequestDto extends DataClass<DirectoryRequestDtoParams> {
  readonly path: string
  readonly showFiles: boolean

  constructor({ path = '', showFiles = false }: DirectoryRequestDtoParams = {}) {
    super()
    this.path = path
    this.showFiles = showFiles
  }
}

type DirectoryListingDtoParams = {
  parent?: string | null
  directories: PathDto[]
  files: PathDto[]
}

// @JsonInclude(JsonInclude.Include.NON_NULL)
export class DirectoryListingDto extends DataClass<DirectoryListingDtoParams> {
  readonly parent: string | null
  readonly directories: PathDto[]
  readonly files: PathDto[]

  constructor({ parent = null, directories, files }: DirectoryListingDtoParams) {
    super()
    this.parent = parent
    this.directories = directories
    this.files = files
  }
}

type PathDtoParams = {
  type: string
  name: string
  path: string
}

export class PathDto extends DataClass<PathDtoParams> {
  readonly type: string
  readonly name: string
  readonly path: string

  constructor({ type, name, path }: PathDtoParams) {
    super()
    this.type = type
    this.name = name
    this.path = path
  }
}

export function toDto(self: string): PathDto {
  return new PathDto({
    type: isDirectory(self) ? 'directory' : 'file',
    // PORT: fileName ?: this (la racine n'a pas de nom)
    name: self === '/' ? self : pathName(self),
    path: self,
  })
}

jsonProperties(DirectoryRequestDto, { path: 'String', showFiles: 'Boolean' })
json(DirectoryListingDto, { include: 'NON_NULL' })
jsonProperties(
  DirectoryListingDto,
  { parent: { nullable: 'String' }, directories: { list: { class: PathDto } }, files: { list: { class: PathDto } } },
  [],
  { required: ['directories', 'files'] },
)
jsonProperties(PathDto, { type: 'String', name: 'String', path: 'String' }, [], { required: ['type', 'name', 'path'] })

restController(FileSystemController, {
  javaName: 'org.gotson.komga.interfaces.api.rest.FileSystemController',
  requestMapping: { path: ['api/v1/filesystem'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  preAuthorize: "hasRole('ADMIN')",
  openapi: { tags: [OpenApiConfiguration.TagNames.FILE_SYSTEM] },
  handlers: {
    getDirectoryListing: {
      mapping: { method: 'POST' },
      args: [{ ...requestBody({ class: DirectoryRequestDto }, { required: false }), hasDefault: true }],
      returns: { class: DirectoryListingDto },
      openapi: {
        operation: {
          summary: 'Directory listing',
          description: "List folders and files from the host server's file system. If no request body is passed then the root directories are returned.",
        },
      },
    },
  },
})
