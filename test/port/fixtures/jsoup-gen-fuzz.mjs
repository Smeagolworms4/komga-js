let seed = 987654
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
const htmlTokens = ['<p>', '</p>', '<div>', '</div>', '<b>', '</b>', '<i>', '</i>', '<a>', '</a>', '<br>', '<span>', '</span>', '<table>', '<tr>', '<td>', '</td>', '<th>', '</tr>', '</table>', '<tbody>', '<ul>', '<li>', '</ul>', '<ol>', '<dl><dt>', '<dd>', '<script>', '</script>', '<style>', '</style>', '<textarea>', '</textarea>', '<title>', '</title>', '<!--', '-->', ' ', '  ', '\n', '\t', ' ', 'a', 'bc', 'Déf', 'x y', '&amp;', '&nbsp;', '&lt;', '&copy', '&', '<', '>', '"', "'", '<a href=x>', '<svg>', '</svg>', '<math>', '</math>', '<mi>', '<annotation-xml encoding="text/html">', '<foreignObject>', '</foreignObject>', '<pre>', '</pre>', '<h1>', '</h1>', '<h2>', '<select>', '<option>', '</option>', '<optgroup>', '<noscript>', '</noscript>', '<template>', '</template>', '<xmp>', '</xmp>', '<iframe>', '</iframe>', '<noembed>', '<noframes>', '<plaintext>', '&#233;', '&#x1F600;', '&#0;', '&#xD800;', '&#128;', '​', '­', '<![CDATA[', ']]>', '<frameset>', '<frame>', '<body>', '</body>', '<html>', '</html>', '<head>', '</head>', '<caption>', '<colgroup>', '<col>', '<hr>', '<button>', '</button>', '<form>', '</form>', '<input type=hidden>', '<input>', '<img>', '<nobr>', '<font color=red>', '</font>', '<s>', '<u>', '<em>', '</em>', '<strong>', '</strong>', '<rb>', '<rt>', '<ruby>', '<isindex>', '<image>', '<marquee>', '<object>', '<applet>', '<param>', '<keygen>', '<wbr>', '<listing>', '<menu>', '<summary>', '<details>', '<center>', '<dir>', '<address>', '<search>', '<sarcasm>', '</sarcasm>', '</br>', '</p >', '<p/>', '<br/>', '<div/>', '<A HREF="x">', '<B>', '</B>', '<?pi?>', '<!doctype html>', '<!x>', '</ >', '</>', '<<', '&notit;', '&not', '&AMP', '&#x;', '&#65', '\r\n', '\u0000', '\u0001', '<p class=a>', '<b class=a>', '<b id=1>', 'Tom &amp; Jerry', '1 < 2']
const xmlTokens = ['<metadata>', '</metadata>', '<opf:metadata>', '</opf:metadata>', '<dc:title>', '</dc:title>', '<DC:Title>', '<title>', '</title>', '<dc:creator opf:role="aut">', '<dc:creator id="c1">', '</dc:creator>', '<meta refines="#c1" property="role" scheme="marc:relators">', '<meta property="belongs-to-collection" id="s">', '<meta refines="#s" property="group-position">', '</meta>', '<spine page-progression-direction="rtl"/>', '<spine>', '</spine>', '<br/>', '<br>', '<p>', '</p>', '<x:y>', '</x:y>', ' ', '\n', '\t', ' ', 'a', 'bc', 'Déf', '&amp;', '&nbsp;', '&lt;', '&eacute;', '&copy', '&', '<', '>', '"', "'", '<![CDATA[', ']]>', '<!--', '-->', '<?xml version="1.0"?>', '<!DOCTYPE x [<!ENTITY a "b">]>', '&a;', '<a b=c>', '<a b>', '<a b=\'c\'>', '<a b="c" b="d">', '</a>', '<a/>', '</ a>', '</>', '<<', '<?pi x?>', '&#233;', '&#x1F600;', '&#0;', '\u0000', '​', '<script>', '</script>', '<textarea>', '</textarea>', '<![CDATA[x]]>']
const html = [], xml = []
for (let i = 0; i < 2500; i++) {
  const n = 1 + rnd(i < 2400 ? 30 : 600)
  let s = ''
  for (let j = 0; j < n; j++) s += htmlTokens[rnd(htmlTokens.length)]
  html.push(s)
}
// long inputs crossing the 2048 buffer
for (let i = 0; i < 40; i++) {
  let s = '<textarea>' + 'x'.repeat(1500 + rnd(2000)) + (rnd(2) ? '</textarea>' : '') + '<b>tail</b>'
  html.push(s)
  s = 'y'.repeat(2040 + rnd(20)) + '&amp;&notit;<title>' + 'z'.repeat(rnd(3000)) + '<i>i</i>'
  html.push(s)
}
for (let i = 0; i < 2500; i++) {
  const n = 1 + rnd(i < 2400 ? 40 : 700)
  let s = ''
  for (let j = 0; j < n; j++) s += xmlTokens[rnd(xmlTokens.length)]
  xml.push(s)
}
for (let i = 0; i < 40; i++) xml.push('<metadata><dc:title>' + 'x'.repeat(2000 + rnd(200)) + '<![CDATA[' + 'c'.repeat(rnd(3000)) + ']]>&amp;</dc:title><!--' + '-'.repeat(rnd(2500)) + '--><dc:creator>A</dc:creator></metadata>')
process.stdout.write(JSON.stringify({ html, xml }))
