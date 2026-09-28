import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.jsoup.*;
import org.jsoup.nodes.*;
import org.jsoup.parser.Parser;
var om = new ObjectMapper();
Map<String, Object> in = om.readValue(new java.io.File("jsoup-track-cases.json"), Map.class);
List<Object> nodesOf(Node n, List<Object> out) {
  var sr = n.sourceRange();
  var l = new ArrayList<Object>(List.of(n.nodeName(), sr.startPos(), sr.endPos()));
  if (n instanceof Element) { var er = ((Element) n).endSourceRange(); l.add(er.startPos()); l.add(er.endPos()); }
  out.add(l);
  for (Node c : n.childNodes()) nodesOf(c, out);
  return out;
}
var track = new ArrayList<Object>();
for (Object o : (List<Object>) in.get("html")) {
  try { track.add(nodesOf(Jsoup.parse((String) o, Parser.htmlParser().setTrackPosition(true)), new ArrayList<Object>())); }
  catch (Exception e) { track.add("EXC:" + e.getClass().getSimpleName()); }
}
List<Object> sel(Document doc, List<Object> queries) {
  var m = new ArrayList<Object>();
  for (Object q : queries) {
    try { var l = new ArrayList<Object>(); for (Element e : doc.select((String) q)) l.add(List.of(e.tagName(), e.id(), e.text())); m.add(l); }
    catch (Exception e) { m.add("EXC:" + e.getClass().getSimpleName()); }
    try { var l = new ArrayList<Object>(); for (Element c : doc.select("*")) { Element f = c.selectFirst((String) q); l.add(f == null ? "" : f.tagName() + "#" + f.id()); } m.add(l); }
    catch (Exception e) { m.add("EXC:" + e.getClass().getSimpleName()); }
  }
  var l = new ArrayList<Object>(); for (Element e : doc.getElementsByClass("koboSpan")) l.add(e.id()); m.add(l);
  l = new ArrayList<Object>(); for (Element e : doc.getElementsByTag("SPAN")) l.add(e.id()); m.add(l);
  m.add(doc.body().text());
  return m;
}
var select = new ArrayList<Object>();
for (Object o : (List<Object>) in.get("selectDocs")) {
  select.add(sel(Jsoup.parse((String) o, "", Parser.htmlParser()), (List<Object>) in.get("htmlQueries")));
  select.add(sel(Jsoup.parse((String) o, "", Parser.xmlParser()), (List<Object>) in.get("xmlQueries")));
}
var streams = new ArrayList<Object>();
for (Object o : (List<Object>) in.get("streams")) {
  Map<String, Object> s = (Map<String, Object>) o;
  List<Object> bl = (List<Object>) s.get("bytes");
  byte[] b = new byte[bl.size()];
  for (int i = 0; i < b.length; i++) b[i] = (byte) ((Integer) bl.get(i)).intValue();
  try {
    var is = new java.io.ByteArrayInputStream(b);
    Document doc = "xml".equals(s.get("parser")) ? Jsoup.parse(is, null, "", Parser.xmlParser()) : Jsoup.parse(is, null, "");
    var l = new ArrayList<Object>();
    for (Element e : doc.select("*")) l.add(e.tagName());
    streams.add(List.of(l, doc.text(), doc.body().text(), doc.getElementsByClass("koboSpan").size()));
  } catch (Exception e) { streams.add("EXC:" + e.getClass().getSimpleName()); }
}
var res = new LinkedHashMap<String,Object>(); res.put("track", track); res.put("select", select); res.put("streams", streams);
om.writeValue(new java.io.File("jsoup-track-oracle.json"), res);
/exit
