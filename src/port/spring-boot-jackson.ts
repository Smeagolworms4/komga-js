// Support de portage : JacksonAutoConfiguration de Spring Boot (bean `ObjectMapper` construit par
// Jackson2ObjectMapperBuilder, configuré par application.yml de Komga ; voir port/jackson-mapper.ts).
// Ce fichier n'a pas de jumeau Kotlin.
import { ObjectMapper } from './jackson-mapper.js'
import { component } from './spring.js'

component(ObjectMapper, { name: 'jacksonObjectMapper' })
