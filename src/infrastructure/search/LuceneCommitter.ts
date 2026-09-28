// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/search/LuceneCommitter.kt@65981e600edb24944ffaae4818ff2716a5fa08dd

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class LuceneCommitter {
  abstract commitAndMaybeRefresh(): void
}
