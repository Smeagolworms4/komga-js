// Oracle : ZXing Java de Komga (ImageIO + MultiFormatReader, EAN_13 + TRY_HARDER) sur list.json -> oracle.json.
// Pages où @zxing/library (calcul en double) diffère de ZXing Java (float) ; lancé depuis la racine du projet :
// tools/jshell-komga.sh test/port/fixtures/zxing-float/zxing-float.jsh (JDK Temurin 21)
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
import java.util.*;

var om = new ObjectMapper();
List<String> files = om.readValue(new java.io.File("test/port/fixtures/zxing-float/list.json"), new com.fasterxml.jackson.core.type.TypeReference<List<String>>(){});
var hints = Map.of(DecodeHintType.POSSIBLE_FORMATS, EnumSet.of(BarcodeFormat.EAN_13), DecodeHintType.TRY_HARDER, true);
var res = new LinkedHashMap<String,Object>();
for (String f : files) {
  try {
    var image = javax.imageio.ImageIO.read(new java.io.File(f));
    if (image == null) res.put(f, "NULL_IMAGE"); else {
      int[] pixels = image.getRGB(0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth());
      try { res.put(f, new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(image.getWidth(), image.getHeight(), pixels))), hints).getText()); } catch (Exception e) { res.put(f, null); }
    }
  } catch (Exception e) { res.put(f, "EXC:" + e.getClass().getSimpleName()); }
}
om.writerWithDefaultPrettyPrinter().writeValue(new java.io.File("test/port/fixtures/zxing-float/oracle.json"), res);
/exit
