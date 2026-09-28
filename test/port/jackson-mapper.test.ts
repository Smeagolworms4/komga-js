// ObjectMapper comparé au Jackson de Komga (Jackson2ObjectMapperBuilder de Spring Boot, classes Komga réelles),
// valeurs relevées avec tools/jshell-komga.sh.
import { Duration, LocalDate, LocalDateTime, ZoneId, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import '@js-joda/timezone'
import { describe, expect, it } from 'vitest'
import { EpubTocEntry } from '../../src/domain/model/EpubTocEntry.js'
import { MediaExtensionEpub } from '../../src/domain/model/MediaExtension.js'
import { R2Locator } from '../../src/domain/model/R2Locator.js'
import { MissingKotlinParameterException, ObjectMapper } from '../../src/port/jackson-mapper.js'
import { URL } from '../../src/port/java-net.js'

const m = new ObjectMapper()

describe('ObjectMapper', () => {
  it('writes java.time, numbers and bytes like Spring Boot Jackson', () => {
    const map = new Map<string, unknown>([
      ['ldt0', LocalDateTime.of(2024, 3, 5, 7, 8)],
      ['ldt1', LocalDateTime.of(2024, 3, 5, 7, 8, 9)],
      ['ldt2', LocalDateTime.of(2024, 3, 5, 7, 8, 9, 120000000)],
      ['ldt3', LocalDateTime.of(2024, 3, 5, 7, 8, 9, 123456000)],
      ['ld', LocalDate.of(2024, 3, 5)],
      ['zdt', ZonedDateTime.of(2024, 3, 5, 7, 8, 9, 0, ZoneOffset.UTC)],
      ['zdt2', ZonedDateTime.of(2024, 3, 5, 7, 8, 9, 5000000, ZoneId.of('Europe/Paris'))],
      ['dur', Duration.ofSeconds(90)],
      ['dur2', Duration.ofMillis(1500)],
      ['d', 1.5],
      ['l', 5],
      ['bytes', new Uint8Array([1, 2, 3])],
      ['url', new URL('file:/a%20b')],
      ['nul', null],
      ['set', new Set(['b', 'a'])],
    ])
    expect(m.writeValueAsString(map)).toBe(
      '{"ldt0":"2024-03-05T07:08:00","ldt1":"2024-03-05T07:08:09","ldt2":"2024-03-05T07:08:09.12","ldt3":"2024-03-05T07:08:09.123456","ld":"2024-03-05","zdt":"2024-03-05T07:08:09Z","zdt2":"2024-03-05T07:08:09.005+01:00","dur":"PT1M30S","dur2":"PT1.5S","d":1.5,"l":5,"bytes":"AQID","url":"file:/a%20b","nul":null,"set":["b","a"]}',
    )
  })

  it('writes Komga R2Locator and MediaExtensionEpub like Komga', () => {
    const loc = new R2Locator({
      href: 'OEBPS/c1.xhtml',
      type: 'application/xhtml+xml',
      locations: new R2Locator.Location({ progression: 0.5, position: 3, totalProgression: 0.1 }),
    })
    expect(m.writeValueAsString(loc)).toBe('{"href":"OEBPS/c1.xhtml","type":"application/xhtml+xml","locations":{"progression":0.5,"position":3,"totalProgression":0.1}}')
    const loc2 = new R2Locator({
      href: 'h',
      type: 't',
      title: 'title',
      locations: new R2Locator.Location({ fragments: ['f1'], progression: 1.0 }),
      text: new R2Locator.Text({ after: 'a', highlight: '' }),
      koboSpan: 'kobo.1.1',
    })
    expect(m.writeValueAsString(loc2)).toBe('{"href":"h","type":"t","title":"title","locations":{"fragments":["f1"],"progression":1.0},"text":{"after":"a"},"koboSpan":"kobo.1.1"}')
    const ext = new MediaExtensionEpub({ toc: [new EpubTocEntry({ title: 'Ch 1', href: 'c1.xhtml' })], isFixedLayout: true, positions: [loc] })
    expect(m.writeValueAsString(ext)).toBe(
      '{"toc":[{"title":"Ch 1","href":"c1.xhtml","children":[]}],"landmarks":[],"pageList":[],"isFixedLayout":true,"positions":[{"href":"OEBPS/c1.xhtml","type":"application/xhtml+xml","locations":{"progression":0.5,"position":3,"totalProgression":0.1}}]}',
    )
    expect(m.readValue<MediaExtensionEpub>(m.writeValueAsString(ext), { class: MediaExtensionEpub }).equals(ext)).toBe(true)
  })

  it('reads with Kotlin module rules', () => {
    const r = m.readValue<R2Locator>('{"href":"x","TYPE":"t","unknown":1,"locations":{"progression":0.30000001192092896}}', { class: R2Locator })
    expect(r.type).toBe('t')
    expect(String(r.locations?.progression)).toBe(String(Math.fround(0.3)))
    expect(() => m.readValue('{"href":"x"}', { class: R2Locator })).toThrow(MissingKotlinParameterException)
    expect(m.writerWithDefaultPrettyPrinter().writeValueAsString(new Map<string, unknown>([['a', 1], ['b', [1, 2]], ['c', new Map()]]))).toBe(
      '{\n  "a" : 1,\n  "b" : [ 1, 2 ],\n  "c" : { }\n}',
    )
  })
})

describe('javaHashSet', () => {
  it('iterates like java.util.HashSet<String> (values from jshell)', async () => {
    const { javaHashSet } = await import('../../src/port/jackson-mapper.js')
    expect([...javaHashSet(['b', 'a', 'zebra', 'action', 'Comedy', '12', 'x y'])].join(',')).toBe('zebra,x y,a,12,b,action,Comedy')
    expect([...javaHashSet(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12', 't13', 't14'])].join(',')).toBe(
      't4,t5,t6,t7,t8,t9,t10,t12,t11,t14,t13,t1,t2,t3',
    )
  })
})
