// Support de portage : org.springframework.boot.actuate.web.exchanges (HttpExchange, InMemoryHttpExchangeRepository).
// Ce fichier n'a pas de jumeau Kotlin.

/** `org.springframework.boot.actuate.web.exchanges.HttpExchange` (forme sérialisée par l'actuator) */
export type HttpExchange = {
  timestamp: string
  request: { uri: string; remoteAddress?: string | null; method: string; headers: Record<string, string[]> }
  response: { status: number; headers: Record<string, string[]> }
  principal?: { name: string } | null
  session?: { id: string } | null
  timeTaken?: string | null
}

/** `org.springframework.boot.actuate.web.exchanges.HttpExchangeRepository` */
export abstract class HttpExchangeRepository {
  abstract findAll(): HttpExchange[]
  abstract add(httpExchange: HttpExchange): void
}

/** `InMemoryHttpExchangeRepository` : capacité 100, plus récents en premier (reverse = true) */
export class InMemoryHttpExchangeRepository extends HttpExchangeRepository {
  private capacity = 100
  private reverse = true
  private readonly httpExchanges: HttpExchange[] = []

  setReverse(reverse: boolean): void {
    this.reverse = reverse
  }

  setCapacity(capacity: number): void {
    this.capacity = capacity
  }

  findAll(): HttpExchange[] {
    return [...this.httpExchanges]
  }

  add(exchange: HttpExchange): void {
    while (this.httpExchanges.length >= this.capacity) this.httpExchanges.splice(this.reverse ? this.capacity - 1 : 0, 1)
    if (this.reverse) this.httpExchanges.unshift(exchange)
    else this.httpExchanges.push(exchange)
  }
}
