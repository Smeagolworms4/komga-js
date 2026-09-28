// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/configuration/SettingChangedEvent.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataObject } from '../../port/kotlin.js'

// PORT: sealed class -> classe abstraite ; elle étend DataObject pour donner aux `data object` equals/hashCode/toString
export abstract class SettingChangedEvent extends DataObject {}

export namespace SettingChangedEvent {
  // PORT: data object -> instance unique d'une classe nommée
  export const TaskPoolSize = new (class TaskPoolSize extends SettingChangedEvent {})()
  export type TaskPoolSize = typeof TaskPoolSize

  // PORT: data object -> instance unique d'une classe nommée
  export const KepubifyPath = new (class KepubifyPath extends SettingChangedEvent {})()
  export type KepubifyPath = typeof KepubifyPath
}
