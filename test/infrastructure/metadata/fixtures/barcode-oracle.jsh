import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import org.apache.commons.validator.routines.ISBNValidator;
import org.gotson.komga.domain.model.*;
import org.gotson.komga.domain.service.BookAnalyzer;
import java.util.*;

var om = new ObjectMapper();

class FakeAnalyzer extends BookAnalyzer {
  static byte[] content = new byte[0];
  static byte[] page = new byte[0];
  FakeAnalyzer() { super(null, null, null, null, null, null, null, 0, null, null, null); }
  @Override public byte[] getFileContent(BookWithMedia b, String f) { return content; }
  @Override public byte[] getPageContent(BookWithMedia b, int p) { return page; }
}
var analyzer = (FakeAnalyzer) sun.reflect.ReflectionFactory.getReflectionFactory().newConstructorForSerialization(FakeAnalyzer.class, Object.class.getDeclaredConstructor()).newInstance();

String exc(Throwable e) { return "EXC:" + e.getClass().getSimpleName(); }

Object dumpBookPatch(BookMetadataPatch p) {
  if (p == null) return null;
  var m = new LinkedHashMap<String,Object>();
  m.put("title", p.getTitle()); m.put("summary", p.getSummary()); m.put("number", p.getNumber());
  m.put("numberSort", p.getNumberSort() == null ? null : p.getNumberSort().toString());
  m.put("releaseDate", p.getReleaseDate() == null ? null : p.getReleaseDate().toString());
  if (p.getAuthors() == null) m.put("authors", null); else { var l = new ArrayList<Object>(); for (var a : p.getAuthors()) l.add(List.of(a.getName(), a.getRole())); m.put("authors", l); }
  m.put("isbn", p.getIsbn());
  if (p.getLinks() == null) m.put("links", null); else { var l = new ArrayList<Object>(); for (var a : p.getLinks()) l.add(List.of(a.getLabel(), a.getUrl().toString())); m.put("links", l); }
  m.put("tags", p.getTags() == null ? null : new ArrayList<Object>(p.getTags()));
  var rl = new ArrayList<Object>(); for (var r : p.getReadLists()) { var e = new ArrayList<Object>(); e.add(r.getName()); e.add(r.getNumber()); rl.add(e); } m.put("readLists", rl);
  return m;
}
Object dumpSeriesPatch(SeriesMetadataPatch p) {
  if (p == null) return null;
  var m = new LinkedHashMap<String,Object>();
  m.put("title", p.getTitle()); m.put("titleSort", p.getTitleSort());
  m.put("status", p.getStatus() == null ? null : p.getStatus().name()); m.put("summary", p.getSummary());
  m.put("readingDirection", p.getReadingDirection() == null ? null : p.getReadingDirection().name());
  m.put("publisher", p.getPublisher()); m.put("ageRating", p.getAgeRating()); m.put("language", p.getLanguage());
  m.put("genres", p.getGenres() == null ? null : new ArrayList<Object>(p.getGenres()));
  m.put("totalBookCount", p.getTotalBookCount());
  m.put("collections", new ArrayList<Object>(p.getCollections()));
  return m;
}
Object dumpFields(Object o) throws Exception {
  if (o == null) return null;
  var m = new LinkedHashMap<String,Object>();
  for (var f : o.getClass().getDeclaredFields()) {
    if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
    f.setAccessible(true);
    Object v = f.get(o);
    if (v instanceof Enum<?> e) v = e.name();
    else if (v instanceof List<?> l) { var out = new ArrayList<Object>(); for (var x : l) out.add(dumpFields(x)); v = out; }
    m.put(f.getName(), v);
  }
  return m;
}
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
import org.gotson.komga.infrastructure.metadata.barcode.*;
List<String> files = om.readValue(new java.io.File("test/infrastructure/metadata/fixtures/barcode/list.json"), new com.fasterxml.jackson.core.type.TypeReference<List<String>>(){});
var hints = Map.of(DecodeHintType.POSSIBLE_FORMATS, EnumSet.of(BarcodeFormat.EAN_13), DecodeHintType.TRY_HARDER, true);
var provider = new IsbnBarcodeProvider(analyzer, new ISBNValidator(true));
var book = org.gotson.komga.domain.model.UtilsKt.makeBook("Book1", java.time.LocalDateTime.now(), "", "", null, "id");
var media = new Media(Media.Status.READY, "application/zip", List.of(new BookPage("page", "image/jpeg", null, "", null)), 1, List.of(), null, null, "", false, false, java.time.LocalDateTime.now(), java.time.LocalDateTime.now());
var res = new LinkedHashMap<String,Object>();
for (String f : files) {
  byte[] bytes = java.nio.file.Files.readAllBytes(java.nio.file.Path.of(f));
  var m = new LinkedHashMap<String,Object>();
  try {
    var image = javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(bytes));
    if (image == null) m.put("decode", "NULL_IMAGE"); else {
      int[] pixels = image.getRGB(0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth());
      try { m.put("decode", new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(image.getWidth(), image.getHeight(), pixels))), hints).getText()); } catch (Exception e) { m.put("decode", null); }
    }
  } catch (Exception e) { m.put("decode", exc(e)); }
  FakeAnalyzer.page = bytes;
  try { var p = provider.getBookMetadataFromBook(new BookWithMedia(book, media)); m.put("isbn", p == null ? null : p.getIsbn()); } catch (Exception e) { m.put("isbn", exc(e)); }
  res.put(f, m);
}
om.writerWithDefaultPrettyPrinter().writeValue(new java.io.File("test/infrastructure/metadata/fixtures/barcode/../barcode-oracle.json"), res);
/exit
