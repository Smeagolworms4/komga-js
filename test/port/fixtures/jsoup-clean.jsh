import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
var om = new ObjectMapper();
List<String> cases = om.readValue(new java.io.File("clean-cases.json"), new com.fasterxml.jackson.core.type.TypeReference<List<String>>(){});
var res = new ArrayList<Object>();
for (String c : cases) { try { res.add(org.jsoup.Jsoup.clean(c, org.jsoup.safety.Safelist.none())); } catch (Exception e) { res.add("EXC:" + e.getClass().getSimpleName()); } }
om.writeValue(new java.io.File("clean-oracle.json"), res);
/exit
