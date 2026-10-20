// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/Exceptions.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { Exception, registerJavaExceptionNames, throwableToString } from '../../port/kotlin.js'

export class CodedException extends Exception {
  readonly code: string

  // PORT: deux constructeurs Kotlin (cause, code) / (message, code) fusionnés
  constructor(causeOrMessage: Error | string, code: string) {
    if (typeof causeOrMessage === 'string') super(causeOrMessage)
    // comme Throwable(cause) : message = cause.toString() (nom de classe Java qualifié)
    else super(throwableToString(causeOrMessage), causeOrMessage)
    this.code = code
  }
}

export function withCode(self: Error, code: string): CodedException {
  return new CodedException(self, code)
}

export class MediaNotReadyException extends Exception {}

export class NoThumbnailFoundException extends Exception {}

export class MediaUnsupportedException extends CodedException {
  constructor(message: string, code: string = '') {
    super(message, code)
  }
}

export class ImageConversionException extends CodedException {
  constructor(message: string, code: string = '') {
    super(message, code)
  }
}

export class DirectoryNotFoundException extends CodedException {
  constructor(message: string, code: string = '') {
    super(message, code)
  }
}

export class DuplicateNameException extends CodedException {
  constructor(message: string, code: string = '') {
    super(message, code)
  }
}

export class PathContainedInPath extends CodedException {
  constructor(message: string, code: string = '') {
    super(message, code)
  }
}

export class UserEmailAlreadyExistsException extends CodedException {
  constructor(message: string, code: string = '') {
    super(message, code)
  }
}

export class BookConversionException extends Exception {
  constructor(message: string) {
    super(message)
  }
}

export class ComicRackListException extends CodedException {
  constructor(message: string, code: string = '') {
    super(message, code)
  }
}

export class EntryNotFoundException extends Exception {
  constructor(message: string) {
    super(message)
  }
}

export class ConfigurationException extends Exception {
  constructor(message: string) {
    super(message)
  }
}

registerJavaExceptionNames(
  'org.gotson.komga.domain.model',
  'CodedException',
  'MediaNotReadyException',
  'NoThumbnailFoundException',
  'MediaUnsupportedException',
  'ImageConversionException',
  'DirectoryNotFoundException',
  'DuplicateNameException',
  'PathContainedInPath',
  'UserEmailAlreadyExistsException',
  'BookConversionException',
  'ComicRackListException',
  'EntryNotFoundException',
  'ConfigurationException',
)
