// Support de portage : ré-export de org.springframework.scheduling.TaskScheduler, déplacé dans port/spring-scheduling.ts.
// Ce fichier n'a pas de jumeau Kotlin.
export { type ScheduledFuture, TaskScheduler, ThreadPoolTaskScheduler } from '../spring-scheduling.js'
