// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/epub/OpfOracleTest.kt
import { readFileSync } from 'node:fs'
import { getManifest, normalizeHref, processOpfGuide } from '../../../../../src/infrastructure/mediacontainer/epub/Opf.js'
import { Jsoup, Parser } from '../../../../../src/port/jsoup-parser.js'
import { oracle } from '../../../oracle.js'
import { komgaRes } from '../samples.js'

const { func, kase } = oracle('infrastructure/mediacontainer/epub/Opf')

const opfs: [string, string][] = [
  ['empty', ''],
  ['no manifest', '<package><metadata/></package>'],
  ['empty manifest', '<package><manifest/></package>'],
  [
    'items',
    '<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="img/b%20c.png" media-type="image/png" properties="cover-image"/><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav  scripted svg"/></manifest></package>',
  ],
  ['missing attributes', '<package><manifest><item/><item id="x"/><item href="y"/></manifest></package>'],
  ['duplicate ids', '<package><manifest><item id="a" href="1"/><item id="a" href="2"/></manifest></package>'],
  ['prefixed', '<opf:package xmlns:opf="http://www.idpf.org/2007/opf"><opf:manifest><opf:item id="a" href="a.html" media-type="text/html"/></opf:manifest></opf:package>'],
  ['nested item not direct child', '<package><manifest><group><item id="a" href="a"/></group><item id="b" href="b"/></manifest></package>'],
  ['two manifests', '<package><manifest><item id="a" href="a"/></manifest><manifest><item id="b" href="b"/></manifest></package>'],
  ['uppercase tags', '<package><MANIFEST><ITEM id="a" href="a"/></MANIFEST></package>'],
  [
    'guide',
    '<package><guide><reference type="cover" title="Cover" href="cover.xhtml"/><reference type="toc" title="Table" href="text/toc.xhtml#t%C3%A9"/><reference type="x" title="" href=""/><reference type="y" href="  "/><reference title="Up" href="../up.html"/><reference title="Plus" href="a+b.html"/></guide></package>',
  ],
  ['empty guide', '<package><guide/></package>'],
  ['prefixed guide', '<opf:package xmlns:opf="x"><opf:guide><opf:reference title="T" href="t.html#a"/></opf:guide></opf:package>'],
  ['fixture 1979', readFileSync(komgaRes('epub/1979.opf'), 'utf8')],
  ['fixture Panik', readFileSync(komgaRes('epub/Panik im Paradies.opf'), 'utf8')],
  ['fixture Panik namespace', readFileSync(komgaRes('epub/Panik im Paradies - namespace.opf'), 'utf8')],
  ['fixture clash', readFileSync(komgaRes('epub/clash.opf'), 'utf8')],
  ['fixture Die Drei', readFileSync(komgaRes('epub/Die Drei 3.opf'), 'utf8')],
]

const dirs = [null, '', 'OEBPS', 'a/b', '/abs', 'a/../b', '.', '..', 'dir with space']

// prettier-ignore
const hrefs = [
  'x.html', '../x.html', 'x.html#frag', '#only', 'a/./b/../c.html', '', 'x.html#', 'a#b#c', 'dir/', '  ', 'x.html# ', '/root.html',
  '../../up.html', '%20.html', 'a//b.html', './x.html', 'x.html#frag with space', 'é/ü.html', '..', '.',
]

func('getManifest', () => {
  for (const [label, opf] of opfs) kase(label, () => getManifest(Jsoup.parse(opf, '', Parser.xmlParser())))
})

func('normalizeHref', () => {
  for (const dir of dirs) {
    for (const href of hrefs) kase(`'${dir}' + '${href}'`, () => normalizeHref(dir, href))
  }
})

func('processOpfGuide', () => {
  for (const [label, opf] of opfs) {
    for (const dir of [null, 'OEBPS', 'a/b']) kase(`${label} in '${dir}'`, () => processOpfGuide(Jsoup.parse(opf, '', Parser.xmlParser()), dir))
  }
})
