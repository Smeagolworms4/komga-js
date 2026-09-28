// @port-of komga/src/main/kotlin/org/gotson/komga/application/tasks/TasksRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Task } from './Task.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class TasksRepository {
  abstract hasAvailable(): boolean

  // PORT: valeur par défaut `Thread.currentThread().name` portée par l'implémentation
  abstract takeFirst(owner?: string): Task | null

  abstract findAll(): Task[]

  abstract findAllGroupedByOwner(): Map<string | null, Task[]>

  abstract count(): number

  abstract countBySimpleType(): Map<string, number>

  // PORT: surcharges save(task: Task) / save(tasks: Collection<Task>) -> une seule méthode avec union de types
  abstract save(taskOrTasks: Task | Iterable<Task>): void

  // PORT: save(tasks: Collection<Task>) fusionné avec save(task) ci-dessus

  abstract delete(taskId: string): void

  abstract deleteAll(): void

  abstract deleteAllWithoutOwner(): number

  abstract disown(): number
}
