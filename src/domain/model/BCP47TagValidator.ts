// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/BCP47TagValidator.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ULocale, isNullOrBlank } from '../../port/extra-metadata.js'
import { isNotBlank, lazy } from '../../port/kotlin.js'

// PORT: com.ibm.icu.util.ULocale -> ULocale de port/extra-metadata.ts, portage à plat du chemin
// ULocale.forLanguageTag / getLanguage / toLanguageTag / getISOLanguages d'icu4j 78.3.
// Intl.Locale n'est pas équivalent (RangeError sur les tags mal formés, substitutions CLDR mo->ro, sh->sr-Latn...).
// Vérifié contre icu4j-78.3.jar (jshell) : isValid, normalize, getLanguage et toLanguageTag identiques
// sur les entrées de BCP47TagValidatorTest, ~120 tags choisis (valides, invalides, casse, grandfathered,
// extlang, extensions -u-/-t-/-x-, lvariant, POSIX, und, root, vide), 3 650 tags ciblés sur les
// extensions -u- (toutes les clés/types de KeyTypeData) et 18 000 tags aléatoires : 0 écart.
// PORT: object Kotlin -> classe à membres statiques
export class BCP47TagValidator {
  private static get languages(): Set<string> {
    return lazy(BCP47TagValidator, 'languages', () => new Set(ULocale.getISOLanguages()))
  }

  static isValid(value: string | null): boolean {
    if (value === null) return false
    const it = ULocale.forLanguageTag(value)
    return isNotBlank(it.language) && BCP47TagValidator.languages.has(it.language)
  }

  static normalize(value: string | null): string {
    if (isNullOrBlank(value)) return ''
    try {
      return ULocale.forLanguageTag(value).toLanguageTag()
    } catch (e) {
      return ''
    }
  }
}
