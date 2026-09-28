// Oracle de test/port/jackson-xml-write.test.ts : tools/jshell-komga.sh test/port/fixtures/jackson-xml-write.jsh (sortie -> jackson-xml-write-oracle.json, FEED1 décodé du base64)
import com.fasterxml.jackson.databind.*;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.http.converter.xml.MappingJackson2XmlHttpMessageConverter;
import org.gotson.komga.infrastructure.xml.NamespaceXmlFactory;
import org.gotson.komga.interfaces.api.opds.v1.dto.*;
import org.springframework.mock.http.MockHttpOutputMessage;
import org.springframework.http.MediaType;
import java.time.*;
import java.util.*;
var b = new Jackson2ObjectMapperBuilder();
b.featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
var m = b.createXmlMapper(true).factory(new NamespaceXmlFactory(null, XmlNamespacesKt.getPrefixToNamespace())).build();
var conv = new MappingJackson2XmlHttpMessageConverter(m);
String write(Object o, java.lang.reflect.Type t) throws Exception { var out = new MockHttpOutputMessage(); conv.write(o, t, MediaType.parseMediaType("application/atom+xml"), out); return out.getBodyAsString(java.nio.charset.StandardCharsets.UTF_8); }
var zdt = ZonedDateTime.of(2024,3,5,7,8,9,120000000, ZoneOffset.ofHours(1));
var t = "x]>y <b> & \"q\" 's'\r\n\t" + (char)0x7f + (char)0x2028 + new String(Character.toChars(0x1F600)) + ">z";
var links = List.<OpdsLink>of(new OpdsLinkFeedNavigation("self", "http://h/a?b=1&c=2"), new OpdsLinkPageStreaming("image/jpeg", "http://h/p/{pageNumber}", 3, 2, LocalDateTime.of(2024,1,2,3,4,5,600)), new OpdsLinkPageStreaming("image/png", "u", 1, null, null), new OpdsLinkFileAcquisition(null, "f" + (char)0x7f + (char)0x85 + "\r\n\t<>&\"'"));
var e1 = new OpdsEntryAcquisition(t, zdt, "id1", "line1\nline2", List.of(new OpdsAuthor("A1", null), new OpdsAuthor("A2", new java.net.URI("http://x"))), links);
var e2 = new OpdsEntryNavigation("nav", zdt.withZoneSameInstant(ZoneOffset.UTC).withNano(0), "id2", "", new OpdsLinkFeedNavigation("subsection", "http://h/s"));
var feed = new OpdsFeedAcquisition("fid", t, zdt, new OpdsAuthor("Komga", new java.net.URI("https://github.com/gotson/komga")), List.of(new OpdsLinkSearch("s")), List.of(e1));
var feed2 = new OpdsFeedNavigation("fid2", "T", zdt, new OpdsAuthor("Komga", null), List.of(), List.of(e2));
System.out.println("FEED1=" + java.util.Base64.getEncoder().encodeToString(write(feed, OpdsFeed.class).getBytes("UTF-8")));
System.out.println("FEED2=" + write(feed2, OpdsFeed.class));
System.out.println("OSD=" + write(new OpenSearchDescription("Search", "Search for series", "UTF-8", "UTF-8", new OpenSearchDescription.OpenSearchUrl("http://h/series?search={searchTerms}")), OpenSearchDescription.class));
var map = new LinkedHashMap<String,Object>(); map.put("timestamp", new Date(0)); map.put("status", 404); map.put("error", "Not Found"); map.put("message", null); map.put("path", "/x");
System.out.println("MAP=" + write(map, Map.class));

/exit
