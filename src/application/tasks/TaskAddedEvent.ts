// @port-of komga/src/main/kotlin/org/gotson/komga/application/tasks/TaskAddedEvent.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataObject } from '../../port/kotlin.js'

// PORT: data object -> instance unique d'une classe nommée
export const TaskAddedEvent = new (class TaskAddedEvent extends DataObject {})()
export type TaskAddedEvent = typeof TaskAddedEvent
