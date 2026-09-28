import { readFileSync } from 'node:fs'
const res = '/home/smeagol/Works/JS/Komga/KomgaJS/test/resources/epub/'
const opfs = []
for (const f of ['1979.opf', 'clash.opf', 'Die Drei 3.opf', 'Panik im Paradies - namespace.opf', 'Panik im Paradies.opf']) opfs.push(readFileSync(res + f, 'utf8'))
const wrap = (meta, spine = '<spine toc="ncx"/>', pkgAttrs = '') => `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"${pkgAttrs}>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
${meta}
  </metadata>
  <manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest>
  ${spine}
</package>`
const M = (meta, spine) => opfs.push(wrap(meta, spine))
// titles
for (const t of ['Simple', '  spaced   title  ', 'A &amp; B', 'A &nbsp;B', 'A&eacute;B &copy 2020', 'caf&eacute;', 'x &unknown; y', 'x & y', 'a < b', 'a > b', '&#233;&#xE9;&#x1F600;&#0;&#128;&#150;&#xD800;&#99999999;', '<![CDATA[ cdata  <b>x</b> ]]>', 'a<!-- c -->b', 'a<br/>b', 'a <br/> b', '<span>A</span> B', '<span>A</span><span>B</span>', 'ta\tb\nc d​e­f', '', '   ', '&notit; &not &amp', '&AMP &lt3', 'ends with &', 'Die drei ??? Kids'])
  M(`<dc:title>${t}</dc:title>`)
M(`<dc:title>First</dc:title><dc:title>Second</dc:title>`)
M(`<DC:TITLE>Upper</DC:TITLE>`)
M(`<title>No prefix</title>`)
M(`<dc:Title>Mixed</dc:Title>`)
M(`<x:title>other prefix</x:title>`)
M(`<dc:title>Unclosed`)
M(`<dc:title>Mis</dc:titel> matched</dc:title>`)
opfs.push(`<package><opf:metadata xmlns:opf="x"><dc:title>opf prefixed metadata</dc:title></opf:metadata></package>`)
opfs.push(`<package><metadata><outer><dc:title>nested not child</dc:title></outer></metadata></package>`)
opfs.push(`<package><dc:title>no metadata</dc:title></package>`)
opfs.push(`<!DOCTYPE package [<!ENTITY foo "bar">]><package><metadata><dc:title>doctype &foo;</dc:title></metadata></package>`)
opfs.push(`<?xml version="1.0"?><!-- comment --><package><metadata><dc:title>with pi <?pi x?> inside</dc:title></metadata></package>`)
opfs.push(`not xml at all`)
opfs.push(``)
// descriptions
for (const d of ['plain text', '&lt;p&gt;Hello &amp;amp; world&lt;/p&gt;', '&lt;div&gt;\n  &lt;p&gt;Para 1&lt;/p&gt;\n  &lt;p&gt;Para 2&lt;/p&gt;&lt;/div&gt;', '&lt;p&gt;a&lt;br&gt;b&lt;/p&gt;', '&lt;script&gt;alert(1)&lt;/script&gt;visible', '&lt;style&gt;p{}&lt;/style&gt;x', '<p>raw html in xml</p>', '<![CDATA[<p>cdata html</p> & more]]>', 'Tom &amp;amp; Jerry', 'a &amp;lt; b', '&amp;nbsp;x&amp;nbsp;', 'x y', '   ', '&lt;p&gt;&lt;/p&gt;', 'quote " and \' apostrophe', '&lt;b&gt;bold&lt;/b&gt; and &lt;i&gt;italic&lt;/i&gt;', 'line1\nline2\n\nline3', '&lt;!-- c --&gt;text', '&lt;textarea&gt;&amp;lt;x&amp;gt;&lt;/textarea&gt;', '&lt;table&gt;&lt;tr&gt;&lt;td&gt;cell&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;after', 'control \u0001 char', 'emoji 😀 &amp;#x1F600;'])
  M(`<dc:title>t</dc:title><dc:description>${d}</dc:description>`)
// dates
for (const d of ['2021-06-20', '2021-06-20T10:00:00Z', '1999-07-31T16:00:00+00:00', '2021-06', '2021', '0101-01-01T00:00:00+00:00', 'June 2021', '2021-06-20+02:00', '20210620', ' 2021-06-20 ', '2021-02-30', '2021-06-20T10:00', '2021-06-20T10:00:00.123+05:30[Asia/Kolkata]', '+12021-06-20', '2021-06-20Z', '', '2021-06-20T10:00:00Z[UTC]', '2021-06-20T10:00:00Z[Nope/Zone]', '2021-06-20T10:00:00+01:00[Z]', '2021-06-20T10:00:00+01:00[+02:00]', '2021-06-20T10:00:00+01:00[asia/kolkata]', '2021-06-20T10:00:00[Europe/Paris]', '2021-06-20T24:00:00Z', '2021-06-20T23:59:60Z', '2021-06-20T10:00:00.1234567891Z', '2021-06-20T10:00:00.123456789Z', '2021-06-20+05:30[Asia/Kolkata]', '2021-06-20t10:00:00z', '2021-06-20T10:00:00+05:30:15', '2021-06-20T10Z', '-0001-01-01', '0000-01-01', '2021-6-20'])
  M(`<dc:title>t</dc:title><dc:date>${d}</dc:date>`)
// authors
M(`<dc:creator opf:role="aut">A1</dc:creator><dc:creator opf:role="ill">I1</dc:creator><dc:creator opf:role="art">P1</dc:creator><dc:creator opf:role="trl">T1</dc:creator><dc:creator opf:role="clr">C1</dc:creator><dc:creator opf:role="cov">Cv1</dc:creator><dc:creator opf:role="edt">E1</dc:creator><dc:creator opf:role="pbl">Pb1</dc:creator><dc:creator>NoRole</dc:creator><dc:creator opf:role="">EmptyRole</dc:creator><dc:creator>  </dc:creator><dc:creator opf:role="AUT">Upper</dc:creator>`)
M(`<dc:creator id="c1">R1</dc:creator><dc:creator id="c2">R2</dc:creator><dc:creator id="c3">R3</dc:creator><dc:creator id="c4" opf:role="edt">R4</dc:creator><meta refines="#c1" property="role" scheme="marc:relators">ill</meta><meta refines="#c2" property="role" scheme="marc:relators">  </meta><meta refines="#c3" property="role" scheme="other">trl</meta><meta refines="#c4" property="role" scheme="marc:relators">aut</meta><meta refines="c2" property="role" scheme="marc:relators">clr</meta>`)
M(`<dc:creator id="c1">Dup</dc:creator><meta refines="#c1" property="role" scheme="marc:relators">edt</meta><meta refines="#c1" property="role" scheme="marc:relators">ill</meta><meta refines="#c1" property="ROLE" scheme="MARC:RELATORS">trl</meta>`)
M(`<dc:creator id="C1">Case</dc:creator><meta Refines="#c1" Property="role" Scheme="marc:relators">edt</meta><dc:creator ID="x" OPF:ROLE="edt">AttrCase</dc:creator>`)
M(`<dc:creator>Kracht, Christian</dc:creator><dc:creator>  Spaced   Name  </dc:creator><dc:creator>A &amp; B</dc:creator>`)
// identifiers
for (const i of ['isbn:9783440077894', 'urn:isbn:9783440077894', 'ISBN:9783440077894', '9783440077894', '978-3-440-07789-4', 'isbn:3440077895', '3440077895', 'isbn: 9783440077894', 'uuid:499def46', 'isbn:9783440077895', 'ISBN 9783440077894', ' isbn:9783440077894 '])
  M(`<dc:title>t</dc:title><dc:identifier>${i}</dc:identifier>`)
M(`<dc:identifier>uuid:x</dc:identifier><dc:identifier>isbn:0306406152</dc:identifier><dc:identifier>isbn:9783440077894</dc:identifier>`)
// series
for (const [id, pos, text] of [['s1', '1.5', 'Series'], ['s1', ' 2 ', 'Series'], ['s1', 'abc', 'Series'], ['s1', '1e2', 'Series'], ['s1', '', 'Series'], ['s1', '3', '  '], ['s.1', '4', 'Dot id'], ['s 1', '5', 'Space id'], ['S1', '6', 'Case id'], ["s'1", '7', 'Quote id'], ['s]1', '8', 'Bracket id'], ['', '9', 'Empty id']])
  M(`<dc:title>t</dc:title><meta property="belongs-to-collection" id="${id}">${text}</meta><meta refines="#${id}" property="group-position">${pos}</meta>`)
M(`<meta property="belongs-to-collection">No id</meta><meta refines="#" property="group-position">1</meta>`)
M(`<meta property="belongs-to-collection" id="a">First</meta><meta property="belongs-to-collection" id="b">Second</meta><meta refines="#b" property="group-position">2</meta><meta refines="#a" property="group-position">1</meta>`)
M(`<opf:meta property="BELONGS-TO-COLLECTION" id="u">Upper prop</opf:meta><opf:meta refines="#U" property="GROUP-POSITION">7</opf:meta>`)
// series-level
for (const l of ['en', 'fr-FR', 'English', 'jpn', '', 'de ', 'zh-Hant', 'x-klingon'])
  M(`<dc:language>${l}</dc:language><dc:publisher>Pub</dc:publisher>`)
M(`<dc:subject>A</dc:subject><dc:subject> A </dc:subject><dc:subject></dc:subject><dc:subject>B &amp; C</dc:subject><dc:publisher>  </dc:publisher>`)
for (const sp of ['<spine page-progression-direction="rtl"/>', '<spine page-progression-direction="ltr"/>', '<spine page-progression-direction="RTL"/>', '<spine page-progression-direction="default"/>', '<spine/>', '<SPINE page-progression-direction="rtl"/>', '<opf:spine page-progression-direction="rtl"/>', '<spine PAGE-PROGRESSION-DIRECTION="rtl"/>', ''])
  M(`<dc:title>t</dc:title>`, sp)
process.stdout.write(JSON.stringify(opfs))
