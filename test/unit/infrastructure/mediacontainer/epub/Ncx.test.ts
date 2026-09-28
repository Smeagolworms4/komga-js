// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/epub/NcxOracleTest.kt
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { epub } from '../../../../../src/infrastructure/mediacontainer/epub/Epub.js'
import { Epub2Nav } from '../../../../../src/infrastructure/mediacontainer/epub/Epub2Nav.js'
import { getNcxResource, processNcx } from '../../../../../src/infrastructure/mediacontainer/epub/Ncx.js'
import { ResourceContent } from '../../../../../src/infrastructure/mediacontainer/epub/ResourceContent.js'
import { exceptionType, oracle, tempDir } from '../../../oracle.js'
import { epubFiles, komgaRes, pathless } from '../samples.js'

const { func, kase } = oracle('infrastructure/mediacontainer/epub/Ncx')

const ncxs: [string, string][] = [
  ['fixture toc.ncx', readFileSync(komgaRes('epub/toc.ncx'), 'utf8')],
  ['empty', ''],
  ['empty navMap', '<ncx><navMap/><pageList/></ncx>'],
  [
    'nested',
    '<ncx><navMap><navPoint><navLabel><text>A</text></navLabel><content src="a.html"/><navPoint><navLabel><text>A1</text></navLabel><content src="a.html#x%20y"/><navPoint><navLabel><text>A11</text></navLabel><content src="../a11.html"/></navPoint></navPoint></navPoint><navPoint><content src="notitle.html"/><navPoint><navLabel><text>Child of untitled</text></navLabel><content src="c.html"/></navPoint></navPoint><navPoint><navLabel><text>No content</text></navLabel></navPoint><navPoint><navLabel><text>  Spaces   inside  </text></navLabel><content src=""/></navPoint></navMap></ncx>',
  ],
  [
    'page list',
    '<ncx><navMap><navPoint><navLabel><text>T</text></navLabel><content src="t.html"/></navPoint></navMap><pageList><pageTarget><navLabel><text>1</text></navLabel><content src="p.html#1"/></pageTarget><pageTarget><navLabel><text>2</text></navLabel><content src="p.html#2"/><pageTarget><navLabel><text>nested</text></navLabel><content src="n.html"/></pageTarget></pageTarget></pageList></ncx>',
  ],
  ['navPoint not direct child', '<ncx><navMap><div><navPoint><navLabel><text>X</text></navLabel><content src="x"/></navPoint></div></navMap></ncx>'],
  [
    'label text nested',
    '<ncx><navMap><navPoint><navLabel><div><text>Deep</text></div></navLabel><content src="d"/></navPoint><navPoint><navLabel><text><b>Bold</b> text</text></navLabel><content src="b"/></navPoint></navMap></ncx>',
  ],
  ['encoded src', '<ncx><navMap><navPoint><navLabel><text>E</text></navLabel><content src="%C3%A9.html"/></navPoint><navPoint><navLabel><text>P</text></navLabel><content src="a+b.html"/></navPoint></navMap></ncx>'],
  ['two navMaps', '<ncx><navMap><navPoint><navLabel><text>1</text></navLabel></navPoint></navMap><navMap><navPoint><navLabel><text>2</text></navLabel></navPoint></navMap></ncx>'],
]

const ncxPaths = ['toc.ncx', 'OEBPS/toc.ncx', 'a/b/toc.ncx']

func('getNcxResource', () => {
  const dir = join(tempDir(), 'synthetic')
  mkdirSync(dir, { recursive: true })
  for (const [label, p] of epubFiles(dir)) kase(label, () => pathless(p, () => epub(p, (it) => getNcxResource(it))))
})

func('processNcx', () => {
  for (const [label, ncx] of ncxs) {
    for (const type of Epub2Nav.entries()) {
      for (const path of ncxPaths) kase(`${label}, ${type}, ${path}`, () => processNcx(new ResourceContent({ path, content: ncx }), type))
    }
  }
  kase('bad encoding in src', () =>
    exceptionType(() =>
      processNcx(new ResourceContent({ path: 't.ncx', content: '<ncx><navMap><navPoint><navLabel><text>B</text></navLabel><content src="bad%zz"/></navPoint></navMap></ncx>' }), Epub2Nav.TOC),
    ),
  )
})

// privée : appelée par processNcx
func('ncxElementToTocEntry', () => {
  for (const [label, ncx] of ncxs) kase(label, () => processNcx(new ResourceContent({ path: 'x/toc.ncx', content: ncx }), Epub2Nav.TOC))
})
