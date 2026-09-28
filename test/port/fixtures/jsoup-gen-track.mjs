// Cas de test de jsoup-parser.ts pour les usages de mediacontainer/epub : positions de source
// (Parser.htmlParser().setTrackPosition(true)), sélecteurs (.classe, #id, :root, combinateur racine, *|balise, [attr]),
// getElementsByTag / getElementsByClass, et Jsoup.parse(InputStream, null, "", parser) (détection du jeu de caractères).
// Usage : node jsoup-gen-track.mjs > jsoup-track-cases.json, puis tools/jshell-komga.sh jsoup-track.jsh (fichiers compressés par gzip)
let seed = 424242
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed % n
}
const tokens = ['<p>', '</p>', '<div>', '</div>', '<b>', '</b>', '<span class="koboSpan" id="kobo.1.1">', '<span class="koboSpan" id="kobo.2.1"/>', '<SPAN CLASS="KoboSpan x" ID="kobo.3.1">', '</span>', '</SPAN>', '<span>', '<a href=x>', '</a>', '<br>', '<br/>', '<table>', '<tr>', '<td>', '</td>', '</table>', '<ul>', '<li>', '</ul>', '<script>', '</script>', '<style>', '</style>', '<title>', '</title>', '<!--', '-->', '<![CDATA[', ']]>', ' ', '\n', '\r\n', '\t', 'a', 'Déf', '😀', '&amp;', '&nbsp;', '&#x1F600;', '&notit;', '<', '>', '<?xml version="1.0" encoding="utf-8"?>', '<!DOCTYPE html>', '<html xmlns="http://www.w3.org/1999/xhtml">', '</html>', '<head>', '</head>', '<body>', '</body>', '<svg>', '<image xlink:href="i.png"/>', '</svg>', '<img src="a.png"/>', '<p class="calibre">', '<h1 id="t">', '</h1>', '<p/>', '<div/>', '<template>', '</template>', '<select><option>', '<textarea>', '</textarea>', '</ br>', '</br>', '</p >']
const html = []
function koboDoc(n, filler) {
  let s = '<?xml version="1.0" encoding="utf-8"?>\r\n<!DOCTYPE html>\r\n<html xmlns="http://www.w3.org/1999/xhtml">\r\n<head><title>T</title></head>\r\n<body>\r\n<div class="book-inner">\r\n'
  for (let i = 1; i <= n; i++) s += `<p class="calibre"><span class="koboSpan" id="kobo.${i}.1">${filler(i)}</span> <span class="koboSpan" id="kobo.${i}.2">Déjà vu &amp; 😀 ${'x'.repeat(i % 7)}</span></p>\r\n`
  return s + '</div>\r\n</body>\r\n</html>\r\n'
}
html.push(koboDoc(5, () => 'Hello'))
html.push(koboDoc(80, (i) => 'Lorem ipsum '.repeat(i % 13)))
html.push(koboDoc(200, (i) => '&eacute;&#233;'.repeat(i % 5) + '<b>b</b><br/>'))
for (let i = 0; i < 700; i++) {
  const n = 1 + rnd(i < 650 ? 40 : 900)
  let s = ''
  for (let j = 0; j < n; j++) s += tokens[rnd(tokens.length)]
  html.push(s)
}

// sélecteurs sur des documents HTML et XML
const selectDocs = [
  koboDoc(3, () => 'a'),
  '<div id=x class="a b"><p class=A>1</p><p class="b  a">2</p><span class="ab">3</span></div><div class=" a ">4</div>',
  '<nav epub:type="toc"><ol><li><a href="a.html">A</a><ol><li><span>S</span><a href="b.html">B</a></li></ol></li></ol></nav>',
  '<svg><image xlink:href="i.png"/></svg><SVG><Image XLink:Href="j.png"></Image></SVG>',
]
const htmlQueries = ['span.koboSpan', '.a', 'p.b', '#x', '#kobo.1.1', 'div#x > p.a', ':root', ':root > body', '> div', 'ol > li', 'svg > image[xlink:href]', 'p', '*|p', '.KOBOSPAN', 'span.koboSpan, p.calibre']
const xmlQueries = [':root > ol > li', ':root > a, span', 'nav', '*|item', 'svg > image[xlink:href]', ':root', '.a', '#x', 'p.b', '> div', 'ol > li > a']

// flux d'octets : détection du jeu de caractères
const enc = (s) => [...Buffer.from(s, 'utf8')]
const latin1 = (s) => [...Buffer.from(s, 'latin1')]
const long = 'Z'.repeat(6000)
const streams = [
  { parser: 'xml', bytes: enc('<?xml version="1.0" encoding="UTF-8"?><package><metadata><title>Déjà</title></metadata></package>') },
  { parser: 'xml', bytes: latin1('<?xml version="1.0" encoding="ISO-8859-1"?><package><title>Déjà ©</title></package>') },
  { parser: 'xml', bytes: latin1("<?xml version='1.0' encoding='windows-1252'?><package><title>Déjà \u0080</title></package>") },
  { parser: 'xml', bytes: [0xef, 0xbb, 0xbf, ...enc('<?xml version="1.0"?><a>é</a>')] },
  { parser: 'xml', bytes: [0xfe, 0xff, ...[...Buffer.from('<a>é😀</a>', 'utf16le')].map((_, i, a) => a[i ^ 1])] },
  { parser: 'xml', bytes: [0xff, 0xfe, ...Buffer.from('<a>é😀</a>', 'utf16le')] },
  { parser: 'xml', bytes: latin1('<html><head><meta charset="iso-8859-1"/></head><body><p>é</p></body></html>') },
  { parser: 'xml', bytes: enc('<a>' + long + '</a><b>é</b>') },
  { parser: 'xml', bytes: latin1('<?xml version="1.0" encoding="bogus"?><a>é</a>') },
  { parser: 'xml', bytes: enc('<a>é') },
  { parser: 'xml', bytes: [0x3c, 0x61, 0x3e, 0xc3, 0x28, 0xff, 0x3c, 0x2f, 0x61, 0x3e] },
  { parser: 'html', bytes: latin1('<html><head><meta charset="iso-8859-1"></head><body><p class=koboSpan>é</p></body></html>') },
  { parser: 'html', bytes: latin1('<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"></head><body><span class="koboSpan">é</span></body></html>') },
  { parser: 'html', bytes: latin1('<?xml version="1.0" encoding="ISO-8859-1"?><html><body><span class="koboSpan">é</span></body></html>') },
  { parser: 'html', bytes: enc('<html><body><span class="koboSpan">é😀</span></body></html>') },
  { parser: 'html', bytes: enc('<html><body>' + long + '<span class="koboSpan">é</span></body></html>') },
  { parser: 'html', bytes: latin1('<html><body>' + long + '<meta charset="iso-8859-1"><span class="koboSpan">é</span></body></html>') },
  { parser: 'html', bytes: [0xef, 0xbb, 0xbf, ...enc('<p class="koboSpan">é</p>')] },
]
process.stdout.write(JSON.stringify({ html, selectDocs, htmlQueries, xmlQueries, streams }))
