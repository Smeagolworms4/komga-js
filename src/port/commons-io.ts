// Support de portage : org.apache.commons.io.FilenameUtils (commons-io), sans jumeau Kotlin.
import { IllegalArgumentException } from './kotlin.js'

function indexOfLastSeparator(fileName: string): number {
  return Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'))
}

export const FilenameUtils = {
  /** `FilenameUtils.getName(fileName)` : partie après le dernier séparateur (`/` ou `\`) */
  getName<T extends string | null>(fileName: T): T {
    if (fileName === null) return null as T
    if (fileName.includes('\0'))
      throw new IllegalArgumentException('Null character present in file/path name. There are no known legitimate use cases for such data, but several injection attacks may use it')
    return fileName.substring(indexOfLastSeparator(fileName) + 1) as T
  },

  /** `FilenameUtils.getBaseName(fileName)` : `removeExtension(getName(fileName))` */
  getBaseName<T extends string | null>(fileName: T): T {
    return FilenameUtils.removeExtension(FilenameUtils.getName(fileName))
  },

  /** `FilenameUtils.removeExtension(fileName)` (hors Windows : pas de contrôle des flux NTFS) */
  removeExtension<T extends string | null>(fileName: T): T {
    if (fileName === null) return null as T
    if (fileName.includes('\0'))
      throw new IllegalArgumentException('Null character present in file/path name. There are no known legitimate use cases for such data, but several injection attacks may use it')
    const extensionPos = fileName.lastIndexOf('.')
    const index = indexOfLastSeparator(fileName) > extensionPos ? -1 : extensionPos
    return (index === -1 ? fileName : fileName.substring(0, index)) as T
  },

  /** `FilenameUtils.getExtension(fileName)` : partie après le dernier `.` du nom (`""` si aucune) */
  getExtension<T extends string | null>(fileName: T): T {
    if (fileName === null) return null as T
    if (fileName.includes('\0'))
      throw new IllegalArgumentException('Null character present in file/path name. There are no known legitimate use cases for such data, but several injection attacks may use it')
    const extensionPos = fileName.lastIndexOf('.')
    const index = indexOfLastSeparator(fileName) > extensionPos ? -1 : extensionPos
    return (index === -1 ? '' : fileName.substring(index + 1)) as T
  },
}
