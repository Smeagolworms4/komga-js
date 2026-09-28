// Support de portage : métadonnées des annotations jakarta.validation posées sur les propriétés.
// Ce fichier n'a pas de jumeau Kotlin. L'exécution des contraintes (équivalent Hibernate Validator)
// est portée avec la couche web (infrastructure/validation).

export type Constraint = { readonly type: string; readonly [attr: string]: unknown }

const registry = new WeakMap<object, Record<string, Constraint[]>>()

/** Enregistre les annotations de validation des propriétés d'une classe. */
export function constraints(cls: object, byProperty: Record<string, Constraint[]>): void {
  registry.set(cls, { ...(registry.get(cls) ?? {}), ...byProperty })
}

/** Annotations enregistrées pour une classe (ses classes parentes incluses). */
export function constraintsOf(cls: object): Record<string, Constraint[]> {
  const parent = Object.getPrototypeOf(cls) as object | null
  return { ...(parent ? constraintsOf(parent) : {}), ...(registry.get(cls) ?? {}) }
}

export const NotBlank = (): Constraint => ({ type: 'NotBlank' })
export const NotEmpty = (): Constraint => ({ type: 'NotEmpty' })
export const NotNull = (): Constraint => ({ type: 'NotNull' })
export const Email = (attrs: { regexp?: string } = {}): Constraint => ({ type: 'Email', ...attrs })
export const Positive = (): Constraint => ({ type: 'Positive' })
export const PositiveOrZero = (): Constraint => ({ type: 'PositiveOrZero' })
export const Min = (value: number): Constraint => ({ type: 'Min', value })
export const Max = (value: number): Constraint => ({ type: 'Max', value })
export const Size = (attrs: { min?: number; max?: number }): Constraint => ({ type: 'Size', ...attrs })
export const Valid = (): Constraint => ({ type: 'Valid' })
export const Custom = (name: string, attrs: Record<string, unknown> = {}): Constraint => ({ type: name, ...attrs })
export const Pattern = (attrs: { regexp: string }): Constraint => ({ type: 'Pattern', ...attrs })
/** `org.hibernate.validator.constraints.UniqueElements` */
export const UniqueElements = (): Constraint => ({ type: 'UniqueElements' })
/** `org.hibernate.validator.constraints.URL` */
export const URL = (attrs: { protocol?: string; host?: string; port?: number } = {}): Constraint => ({ type: 'URL', ...attrs })

const classRegistry = new WeakMap<object, Constraint[]>()

/** Enregistre les annotations de validation posées sur une classe (`@Target(AnnotationTarget.CLASS)`). */
export function classConstraints(cls: object, list: Constraint[]): void {
  classRegistry.set(cls, [...(classRegistry.get(cls) ?? []), ...list])
}

/** Annotations de classe enregistrées pour une classe (ses classes parentes incluses). */
export function classConstraintsOf(cls: object): Constraint[] {
  const parent = Object.getPrototypeOf(cls) as object | null
  return [...(parent ? classConstraintsOf(parent) : []), ...(classRegistry.get(cls) ?? [])]
}
