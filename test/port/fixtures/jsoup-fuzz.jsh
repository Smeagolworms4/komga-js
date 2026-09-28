import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.jsoup.*;
import org.jsoup.nodes.*;
import org.jsoup.parser.Parser;
var om = new ObjectMapper();
Map<String, List<String>> in = om.readValue(new java.io.File("fuzz-cases.json"), new com.fasterxml.jackson.core.type.TypeReference<Map<String, List<String>>>(){});
var clean = new ArrayList<Object>();
for (String c : in.get("html")) { try { clean.add(Jsoup.clean(c, org.jsoup.safety.Safelist.none())); } catch (Exception e) { clean.add("EXC:" + e.getClass().getSimpleName()); } }
String[] queries = {"*|metadata > *|title", "*|metadata > *|creator", "*|metadata > *|meta[property=role][scheme=marc:relators]", "*|metadata > *|meta[property=belongs-to-collection]", "*|metadata > *|meta[refines=#s][property=group-position]", "*|spine", "title", "*|a", "*"};
var xml = new ArrayList<Object>();
for (String c : in.get("xml")) {
  var m = new ArrayList<Object>();
  try {
    Document doc = Jsoup.parse(c, "", Parser.xmlParser());
    for (String q : queries) { var l = new ArrayList<Object>(); for (Element e : doc.select(q)) { l.add(List.of(e.tagName(), e.text(), e.attr("id"), e.attr("refines"), e.attr("opf:role"), e.attr("page-progression-direction"), e.attr("b"))); } m.add(l); }
  } catch (Exception e) { m.add("EXC:" + e.getClass().getSimpleName()); }
  xml.add(m);
}
var res = new LinkedHashMap<String,Object>(); res.put("clean", clean); res.put("xml", xml);
om.writeValue(new java.io.File("fuzz-oracle.json"), res);
/exit
