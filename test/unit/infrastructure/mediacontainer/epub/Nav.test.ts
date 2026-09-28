// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/epub/NavOracleTest.kt
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { epub } from '../../../../../src/infrastructure/mediacontainer/epub/Epub.js'
import { Epub3Nav } from '../../../../../src/infrastructure/mediacontainer/epub/Epub3Nav.js'
import { getNavResource, processNav } from '../../../../../src/infrastructure/mediacontainer/epub/Nav.js'
import { ResourceContent } from '../../../../../src/infrastructure/mediacontainer/epub/ResourceContent.js'
import { oracle, tempDir } from '../../../oracle.js'
import { epubFiles, komgaRes, pathless } from '../samples.js'

const { func, kase } = oracle('infrastructure/mediacontainer/epub/Nav')

const navs: [string, string][] = [
  ['fixture nav.xhtml', readFileSync(komgaRes('epub/nav.xhtml'), 'utf8')],
  ['empty', ''],
  ['no nav', '<html><body><ol><li><a href="a">A</a></li></ol></body></html>'],
  [
    'toc',
    '<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="a.html">A</a><ol><li><a href="a.html#1">A1</a></li><li><span>S</span><ol><li><a href="b%20c.html">BC</a></li></ol></li></ol></li><li><a href="../up.html">Up</a></li><li><ol><li><a href="orphan.html">Orphan</a></li></ol></li><li><a>No href</a></li><li><span>Span only</span></li><li><a href="">Empty href</a></li></ol></nav></body></html>',
  ],
  ['type without namespace', '<html><body><nav type="toc"><ol><li><a href="x">X</a></li></ol></nav></body></html>'],
  [
    'other prefix',
    '<html xmlns:e="http://www.idpf.org/2007/ops"><body><nav e:type="landmarks"><ol><li><a href="l">L</a></li></ol></nav><nav e:type="page-list"><ol><li><a href="p#1">1</a></li></ol></nav></body></html>',
  ],
  [
    'several nav',
    '<html xmlns:epub="x"><body><nav epub:type="toc"><ol><li><a href="first">First</a></li></ol></nav><nav epub:type="toc"><ol><li><a href="second">Second</a></li></ol></nav></body></html>',
  ],
  ['nested markup in title', '<html xmlns:epub="x"><body><nav epub:type="toc"><ol><li><a href="t"><b>Bold</b>  and   <i>italic</i></a></li><li><a href="t2">Line\nbreak</a></li></ol></nav></body></html>'],
  ['ol not direct child', '<html xmlns:epub="x"><body><nav epub:type="toc"><div><ol><li><a href="x">X</a></li></ol></div></nav></body></html>'],
  [
    'encoded href',
    '<html xmlns:epub="x"><body><nav epub:type="toc"><ol><li><a href="%C3%A9t%C3%A9.html#a%20b">Été</a></li><li><a href="a+b.html">Plus</a></li><li><a href="bad%zz.html">Bad</a></li></ol></nav></body></html>',
  ],
]

const navPaths = ['nav.xhtml', 'OEBPS/nav.xhtml', 'a/b/nav.xhtml', '../nav.xhtml']

func('getNavResource', () => {
  const dir = join(tempDir(), 'synthetic')
  mkdirSync(dir, { recursive: true })
  for (const [label, p] of epubFiles(dir)) kase(label, () => pathless(p, () => epub(p, (it) => getNavResource(it))))
})

func('processNav', () => {
  for (const [label, nav] of navs) {
    for (const type of Epub3Nav.entries()) {
      for (const path of navPaths) kase(`${label}, ${type}, ${path}`, () => processNav(new ResourceContent({ path, content: nav }), type))
    }
  }
})

// privée : appelée par processNav
func('navLiElementToTocEntry', () => {
  for (const [label, nav] of navs) kase(label, () => processNav(new ResourceContent({ path: 'x/nav.xhtml', content: nav }), Epub3Nav.TOC))
})
