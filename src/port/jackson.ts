// Support de portage : métadonnées des annotations Jackson et registre des classes par nom qualifié
// (équivalent de Class.forName). Ce fichier n'a pas de jumeau Kotlin.
// La (dé)sérialisation elle-même est portée avec l'ObjectMapper de Komga (infrastructure).
import { Exception } from './kotlin.js'

export type JsonIncludeValue = 'ALWAYS' | 'NON_NULL' | 'NON_ABSENT' | 'NON_EMPTY' | 'NON_DEFAULT'

export type JsonMeta = {
  /** @JsonInclude au niveau de la classe */
  include?: JsonIncludeValue
  /** @JsonInclude au niveau des propriétés */
  propertyInclude?: Record<string, JsonIncludeValue>
  /** @JsonProperty("nom") */
  rename?: Record<string, string>
  /** @JsonIgnore */
  ignore?: string[]
  /** @JsonTypeInfo(use = NAME, property = ...) */
  typeInfo?: { property: string }
  /** @JsonTypeName / @JsonSubTypes */
  typeName?: string
}

const meta = new WeakMap<object, JsonMeta>()

export function json(cls: object, m: JsonMeta): void {
  meta.set(cls, { ...(meta.get(cls) ?? {}), ...m })
}

export function jsonMetaOf(cls: object): JsonMeta {
  return meta.get(cls) ?? {}
}

// ---------------------------------------------------------------------------
// Class.forName
// ---------------------------------------------------------------------------

export class ClassNotFoundException extends Exception {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClass = abstract new (...args: any[]) => unknown

const classes = new Map<string, AnyClass>()
const qualifiedNames = new WeakMap<object, string>()

/** Associe une classe TS au nom qualifié de sa classe Kotlin (valeur stockée en base par Komga). */
export function registerClass(qualifiedName: string, cls: AnyClass): void {
  classes.set(qualifiedName, cls)
  qualifiedNames.set(cls, qualifiedName)
}

/** `Class.forName(name)` : lève ClassNotFoundException si la classe n'est pas connue. */
export function classForName(qualifiedName: string): AnyClass {
  const c = classes.get(qualifiedName)
  if (!c) throw new ClassNotFoundException(qualifiedName)
  return c
}

/** `KClass.qualifiedName` */
export function qualifiedNameOf(cls: object): string | null {
  return qualifiedNames.get(cls) ?? null
}
