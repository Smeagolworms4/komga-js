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

/**
 * Contraintes sur les éléments d'un conteneur (annotations d'usage de type, `Map<@Pattern String, @NotNull @Valid X>`,
 * `Set<@Pattern String>`) : chemins Hibernate `p<K>[k].<map key>`, `p[k].<map value>`, `p[].<iterable element>`.
 */
export const MapKey = (constraints: Constraint[]): Constraint => ({ type: 'ContainerElement', element: 'mapKey', constraints })
export const MapValue = (constraints: Constraint[]): Constraint => ({ type: 'ContainerElement', element: 'mapValue', constraints })
export const IterableElement = (constraints: Constraint[]): Constraint => ({ type: 'ContainerElement', element: 'iterable', constraints })

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

// ---------------------------------------------------------------------------
// Exécution des contraintes (sous-ensemble de Hibernate Validator 8.0)
// ---------------------------------------------------------------------------

/** `jakarta.validation.ConstraintValidatorContext` (non utilisé par les validateurs de Komga) */
export type ConstraintValidatorContext = unknown

/** `jakarta.validation.ConstraintValidator` */
export interface ConstraintValidator {
  isValid(value: unknown, context: ConstraintValidatorContext | null): boolean
}

/** `@ConstraintComposition(CompositionType.X)` */
export type CompositionType = 'AND' | 'OR' | 'ALL_FALSE'

/** Définition d'une annotation de contrainte : `@Constraint(validatedBy = [...])` et contraintes composantes */
export type ConstraintDefinition = {
  validatedBy: (new (constraint: Constraint) => ConstraintValidator)[]
  composingConstraints?: () => Constraint[]
  composition?: CompositionType
}

const definitions = new Map<string, ConstraintDefinition>()

/** Enregistre la définition d'une annotation de contrainte (par son `type`). */
export function constraintDefinition(type: string, def: ConstraintDefinition): void {
  definitions.set(type, def)
}

export function constraintDefinitionOf(type: string): ConstraintDefinition | undefined {
  return definitions.get(type)
}

/**
 * Évalue une contrainte sur une valeur : validateurs de l'annotation, puis contraintes composantes
 * combinées selon la composition (AND par défaut), comme Hibernate Validator.
 * Lève une erreur si aucun validateur n'est connu pour le type de contrainte.
 */
export function isConstraintValid(value: unknown, constraint: Constraint): boolean {
  return constraintViolations(value, constraint).length === 0
}

/**
 * Violations produites par une contrainte, comme Hibernate Validator sans `@ReportAsSingleViolation` :
 * la contrainte elle-même si un de ses validateurs échoue, et les violations de chaque contrainte composante
 * en échec — sauf si la composition est satisfaite (OR : une composante valide ; ALL_FALSE : toutes en échec),
 * auquel cas aucune violation. Vérifié contre Hibernate Validator 8.0.3 (NullOrNotBlank : "" -> Null + NotBlank).
 */
export function constraintViolations(value: unknown, constraint: Constraint): Constraint[] {
  const def = definitions.get(constraint.type)
  if (def === undefined) throw new Error(`No ConstraintValidator registered for constraint ${constraint.type}`)
  const own = def.validatedBy.every((v) => new v(constraint).isValid(value, null))
  const composing = (def.composingConstraints?.() ?? []).map((c) => constraintViolations(value, c))
  const results = [...(def.validatedBy.length > 0 ? [own] : []), ...composing.map((v) => v.length === 0)]
  let valid: boolean
  switch (def.composition ?? 'AND') {
    case 'OR':
      valid = results.some((r) => r)
      break
    case 'ALL_FALSE':
      valid = results.every((r) => !r)
      break
    default:
      valid = results.every((r) => r)
  }
  if (valid) return []
  return [...(own ? [] : [constraint]), ...composing.flat()]
}

/** `jakarta.validation.constraints.Null` */
export const Null = (): Constraint => ({ type: 'Null', message: '{jakarta.validation.constraints.Null.message}' })
/** `org.hibernate.validator.constraints.ISBN` (type ISBN_13 par défaut) */
export const ISBN = (attrs: { type?: 'ISBN_10' | 'ISBN_13' | 'ANY' } = {}): Constraint => ({ type: 'ISBN', isbnType: attrs.type ?? 'ISBN_13', message: '{org.hibernate.validator.constraints.ISBN.message}' })

/** Java `String.trim()` : retire les caractères <= U+0020 */
function javaTrim(s: string): string {
  let st = 0
  let len = s.length
  while (st < len && s.charCodeAt(st) <= 0x20) st++
  while (st < len && s.charCodeAt(len - 1) <= 0x20) len--
  return s.substring(st, len)
}

function sizeOf(value: unknown): number | null {
  if (typeof value === 'string' || Array.isArray(value) || value instanceof Uint8Array) return value.length
  if (value instanceof Set || value instanceof Map) return value.size
  return null
}

/** `NullValidator` */
class NullValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    return value === null || value === undefined
  }
}

/** `NotBlankValidator` : `charSequence.toString().trim().length() > 0` */
class NotBlankValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    if (value === null || value === undefined) return false
    return javaTrim(String(value)).length > 0
  }
}

/** `NotEmptyValidatorForCharSequence` / `ForCollection` / `ForMap` / `ForArray` */
class NotEmptyValidator implements ConstraintValidator {
  isValid(value: unknown): boolean {
    if (value === null || value === undefined) return false
    return (sizeOf(value) ?? 0) > 0
  }
}

/** `org.hibernate.validator.internal.constraintvalidators.hv.ISBNValidator` */
class ISBNValidator implements ConstraintValidator {
  private static readonly NOT_DIGITS_OR_NOT_X = /[^\dX]/g
  private readonly type: string

  constructor(constraint: Constraint) {
    this.type = (constraint.isbnType as string | undefined) ?? 'ISBN_13'
  }

  isValid(value: unknown): boolean {
    if (value === null || value === undefined) return true
    const digits = String(value).replace(ISBNValidator.NOT_DIGITS_OR_NOT_X, '')
    const length = digits.length
    if (this.type === 'ISBN_10') return length === 10 && ISBNValidator.checkChecksumISBN10(digits)
    if (this.type === 'ISBN_13') return length === 13 && ISBNValidator.checkChecksumISBN13(digits)
    if (length === 10) return ISBNValidator.checkChecksumISBN10(digits)
    if (length === 13) return ISBNValidator.checkChecksumISBN13(digits)
    return false
  }

  private static checkChecksumISBN10(isbn: string): boolean {
    let sum = 0
    for (let i = 0; i < isbn.length - 1; i++) sum += (isbn.charCodeAt(i) - 48) * (10 - i)
    sum += isbn.charAt(9) === 'X' ? 10 : isbn.charCodeAt(9) - 48
    return sum % 11 === 0
  }

  private static checkChecksumISBN13(isbn: string): boolean {
    let sum = 0
    for (let i = 0; i < isbn.length; i++) sum += (isbn.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3)
    return sum % 10 === 0
  }
}

constraintDefinition('Null', { validatedBy: [NullValidator] })
constraintDefinition('NotBlank', { validatedBy: [NotBlankValidator] })
constraintDefinition('NotEmpty', { validatedBy: [NotEmptyValidator] })
constraintDefinition('ISBN', { validatedBy: [ISBNValidator] })
