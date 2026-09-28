// Oracle de test/port/jpeg-jdk.test.ts : empreinte de BookAnalyzer.hashPage pour une page JPEG,
// c'est-à-dire Hasher().computeHash(ImageIO.write(ImageIO.read(bytes), "jpeg")) sur la JVM de Komga.
// Usage (JDK Temurin 21, libjpeg 6b intégrée, comme l'image Docker de Komga) :
//   PATH=<temurin-21>/bin:$PATH RESOURCES=test/resources tools/jshell-komga.sh -R-Djava.awt.headless=true test/port/fixtures/jpeg-jdk.jsh > test/port/fixtures/jpeg-jdk.json
import javax.imageio.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;
var hasher = new org.gotson.komga.infrastructure.hash.Hasher();
var root = Paths.get(System.getenv("RESOURCES")).toAbsolutePath();
String hashPage(byte[] content) {
  try {
    var buffer = new ByteArrayOutputStream();
    ImageIO.write(ImageIO.read(new ByteArrayInputStream(content)), "jpeg", buffer);
    return "\"hash\":\"" + hasher.computeHash(new ByteArrayInputStream(buffer.toByteArray())) + "\"";
  } catch (Throwable t) {
    return "\"error\":\"" + t.getClass().getName() + ": " + String.valueOf(t.getMessage()).replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
  }
}
String q(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
var out = new ArrayList<String>();
List<Path> files;
try (var s = Files.walk(root)) { files = s.filter(Files::isRegularFile).sorted().collect(Collectors.toList()); }
var truncated = Set.of("port/jpeg-jdk/progressive-420.jpg", "port/jpeg-jdk/gen/prog-dclast.jpg", "port/jpeg-jdk/gen/prog-unrefined.jpg",
  "port/image/progressive.jpg", "port/jpeg-jdk/gen/prog-ycck.jpg", "port/jpeg-jdk/restart.jpg", "port/image/rgb.jpg",
  "port/jpeg-jdk/icc/rgb-AdobeRGB1998.jpg", "port/jpeg-jdk/cmyk-fogra39.jpg", "port/jpeg-jdk/gen/ycck.jpg");
for (Path p : files) {
  String rel = root.relativize(p).toString().replace('\\', '/');
  String lower = rel.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    byte[] content = Files.readAllBytes(p);
    out.add("{\"file\":" + q(rel) + "," + hashPage(content) + "}");
    if (truncated.contains(rel)) for (int k = 1; k <= 9; k++) {
      out.add("{\"file\":" + q(rel) + ",\"truncate\":" + k + "," + hashPage(Arrays.copyOf(content, content.length * k / 10)) + "}");
    }
  } else if (lower.endsWith(".zip") || lower.endsWith(".epub") || lower.endsWith(".cbz")) {
    try (var z = org.apache.commons.compress.archivers.zip.ZipFile.builder().setPath(p).get()) {
      for (var e : Collections.list(z.getEntries())) {
        byte[] content;
        try (var in = z.getInputStream(e)) { content = in.readAllBytes(); } catch (Throwable t) { continue; }
        if (content.length >= 2 && (content[0] & 0xff) == 0xff && (content[1] & 0xff) == 0xd8)
          out.add("{\"file\":" + q(rel) + ",\"entry\":" + q(e.getName()) + "," + hashPage(content) + "}");
      }
    } catch (Throwable t) { }
  }
}
System.out.println("[\n" + String.join(",\n", out) + "\n]");
/exit
