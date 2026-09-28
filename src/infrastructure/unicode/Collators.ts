// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/unicode/Collators.kt@65981e600edb24944ffaae4818ff2716a5fa08dd

// PORT: com.ibm.icu.text.Collator.getInstance() (locale par défaut) -> Intl.Collator (ICU de Node, locale par défaut).
// PRIMARY -> sensitivity 'base', TERTIARY -> 'variant' ; CANONICAL_DECOMPOSITION -> normalisation (défaut ICU de V8 : activée
// pour la comparaison de chaînes non normalisées). Les tris SQL utilisent eux la collation ICU native (native/komga_sqlite.c).
export class Collator {
  private readonly c: Intl.Collator

  constructor(sensitivity: 'base' | 'variant') {
    this.c = new Intl.Collator(undefined, { sensitivity, usage: 'sort' })
  }

  compare(a: string, b: string): number {
    return this.c.compare(a, b)
  }
}

export const Collators = {
  /**
   * Used for matching
   */
  collator1: new Collator('base'),

  /**
   * Used for sorting
   */
  collator3: new Collator('variant'),
}
