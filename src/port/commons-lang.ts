// Support de portage : sous-ensemble d'Apache Commons Lang 3 (org.apache.commons.lang3) utilisé par Komga.
// Ce fichier n'a pas de jumeau Kotlin.
import { randomInt } from 'node:crypto'

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

class SecureRandomStringUtils {
  /** `nextAlphanumeric(count)` : caractères [A-Za-z0-9] tirés par un générateur cryptographique */
  nextAlphanumeric(count: number): string {
    let s = ''
    for (let i = 0; i < count; i++) s += ALPHANUMERIC[randomInt(ALPHANUMERIC.length)]
    return s
  }
}

/** `org.apache.commons.lang3.RandomStringUtils` */
export const RandomStringUtils = {
  secure(): SecureRandomStringUtils {
    return new SecureRandomStringUtils()
  },
}
