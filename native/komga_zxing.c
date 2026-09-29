/*
 * komga_zxing : module N-API, lecture d'un code-barres EAN-13 comme IsbnBarcodeProvider de Komga
 * (`MultiFormatReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(...))), hints)` de ZXing 3.5.4 avec
 * POSSIBLE_FORMATS = {EAN_13} et TRY_HARDER), exécutée sur le pool de threads de libuv.
 *
 * Portage à plat, en C, du seul chemin de ZXing que ces indications parcourent (ZXing, Apache License 2.0,
 * https://github.com/zxing/zxing, voir THIRD_PARTY_NOTICES.md) :
 *   RGBLuminanceSource (conversion en luminance, rotation de GrayscaleLuminanceSource)
 *   -> MultiFormatReader (un seul lecteur : MultiFormatOneDReader, mis en dernier en TRY_HARDER)
 *   -> OneDReader.decode / doDecode (lignes depuis le milieu, pas de hauteur >> 8, puis image tournée de 90°)
 *   -> BinaryBitmap.getBlackRow -> GlobalHistogramBinarizer.getBlackRow (HybridBinarizer ne redéfinit que
 *      getBlackMatrix, inutilisée par les lecteurs 1D)
 *   -> MultiFormatUPCEANReader (EAN13Reader seul, pas de conversion UPC-A : UPC_A absent des formats)
 *   -> UPCEANReader.decodeRow / EAN13Reader.decodeMiddle.
 * Non repris, sans effet sur le texte ni sur la réussite : l'extension EAN à 2 ou 5 chiffres (métadonnée seulement,
 * ALLOWED_EAN_EXTENSIONS absent), le pays (EANManufacturerOrgSupport), les points et l'orientation du résultat.
 *
 * Arithmétique : entiers 32 bits de Java (débordement circulaire) ; `patternMatchVariance` en float (Java) ou en
 * double (portage JS @zxing/library, qui calcule en nombres JS) selon `useDouble`, pour comparer aux deux.
 * Compilé avec -ffp-contract=off (pas de FMA : mêmes arrondis float que la JVM sur x86, arm64 et armv7).
 *
 * Fonctions exportées :
 *   decode(data, width, height, channels, cmyk, useDouble)      -> string | null (texte du code-barres)
 *   decodeAsync(data, width, height, channels, cmyk, useDouble) -> Promise<string | null> (pool de threads de libuv)
 * data : Uint8Array, pixels 8 bits entrelacés du BufferedImage de src/port/imageio.ts (1 gris, 2 gris + alpha,
 * 3 RGB, 4 RGBA ou CMJN si `cmyk`) ; la luminance est celle de `IsbnBarcodeProvider.getRGB` suivie de
 * `RGBLuminanceSource.toGrayscale` ((r + 2g + b) / 4, alpha ignoré). Le tableau n'est pas copié : l'appelant ne doit
 * pas le modifier avant la fin de decodeAsync.
 */
#define NAPI_VERSION 8
#include <math.h>
#include <node_api.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* ---------------------------------------------------------------------------------------------------------------
 * Constantes de ZXing
 * ------------------------------------------------------------------------------------------------------------- */

/* GlobalHistogramBinarizer */
#define LUMINANCE_BITS 5
#define LUMINANCE_SHIFT (8 - LUMINANCE_BITS)
#define LUMINANCE_BUCKETS (1 << LUMINANCE_BITS)

/* UPCEANReader : MAX_AVG_VARIANCE = 0.48f, MAX_INDIVIDUAL_VARIANCE = 0.7f */
#define MAX_AVG_VARIANCE_F 0.48f
#define MAX_INDIVIDUAL_VARIANCE_F 0.7f
#define MAX_AVG_VARIANCE_D 0.48
#define MAX_INDIVIDUAL_VARIANCE_D 0.7

static const int START_END_PATTERN[3] = {1, 1, 1};
static const int MIDDLE_PATTERN[5] = {1, 1, 1, 1, 1};
static const int L_PATTERNS[10][4] = {
    {3, 2, 1, 1}, /* 0 */
    {2, 2, 2, 1}, /* 1 */
    {2, 1, 2, 2}, /* 2 */
    {1, 4, 1, 1}, /* 3 */
    {1, 1, 3, 2}, /* 4 */
    {1, 2, 3, 1}, /* 5 */
    {1, 1, 1, 4}, /* 6 */
    {1, 3, 1, 2}, /* 7 */
    {1, 2, 1, 3}, /* 8 */
    {3, 1, 1, 2}, /* 9 */
};
/* L_AND_G_PATTERNS : L_PATTERNS puis les mêmes renversés (motifs G) */
static const int L_AND_G_PATTERNS[20][4] = {
    {3, 2, 1, 1}, {2, 2, 2, 1}, {2, 1, 2, 2}, {1, 4, 1, 1}, {1, 1, 3, 2}, {1, 2, 3, 1}, {1, 1, 1, 4}, {1, 3, 1, 2}, {1, 2, 1, 3}, {3, 1, 1, 2},
    {1, 1, 2, 3}, {1, 2, 2, 2}, {2, 2, 1, 2}, {1, 1, 4, 1}, {2, 3, 1, 1}, {1, 3, 2, 1}, {4, 1, 1, 1}, {2, 1, 3, 1}, {3, 1, 2, 1}, {2, 1, 1, 3},
};

/* EAN13Reader.FIRST_DIGIT_ENCODINGS */
static const int FIRST_DIGIT_ENCODINGS[10] = {0x00, 0x0B, 0x0D, 0xE, 0x13, 0x19, 0x1C, 0x15, 0x16, 0x1A};

/* Multiplication int de Java (débordement circulaire) */
static inline int32_t jmul(int32_t a, int32_t b) { return (int32_t)((uint32_t)a * (uint32_t)b); }

/* ---------------------------------------------------------------------------------------------------------------
 * BitArray : un octet par bit (0 blanc, 1 noir) ; mêmes résultats que les mots de 32 bits de Java
 * ------------------------------------------------------------------------------------------------------------- */

/* BitArray.getNextSet */
static int next_set(const uint8_t *row, int size, int from) {
  if (from >= size) return size;
  while (from < size && !row[from]) from++;
  return from;
}

/* BitArray.getNextUnset */
static int next_unset(const uint8_t *row, int size, int from) {
  if (from >= size) return size;
  while (from < size && row[from]) from++;
  return from;
}

/* BitArray.isRange (appelé ici seulement avec 0 <= start <= end <= size) */
static bool is_range(const uint8_t *row, int start, int end, bool value) {
  for (int i = start; i < end; i++)
    if ((row[i] != 0) != value) return false;
  return true;
}

/* BitArray.reverse */
static void reverse_row(uint8_t *row, int size) {
  for (int i = 0, j = size - 1; i < j; i++, j--) {
    uint8_t t = row[i];
    row[i] = row[j];
    row[j] = t;
  }
}

/* ---------------------------------------------------------------------------------------------------------------
 * OneDReader
 * ------------------------------------------------------------------------------------------------------------- */

/* OneDReader.recordPattern ; false = NotFoundException */
static bool record_pattern(const uint8_t *row, int size, int start, int *counters, int numCounters) {
  memset(counters, 0, (size_t)numCounters * sizeof(int));
  int end = size;
  if (start >= end) return false;
  bool isWhite = !row[start];
  int counterPosition = 0;
  int i = start;
  while (i < end) {
    if ((row[i] != 0) != isWhite) {
      counters[counterPosition]++;
    } else {
      if (++counterPosition == numCounters) break;
      counters[counterPosition] = 1;
      isWhite = !isWhite;
    }
    i++;
  }
  /* If we read fully the last section of pixels and filled up our counters -- or filled
   * the last counter but ran off the side of the image, OK. Otherwise, a problem. */
  return counterPosition == numCounters || (counterPosition == numCounters - 1 && i == end);
}

/* OneDReader.patternMatchVariance : float (Java) ou double (@zxing/library), rendu en double (exact) */
static double pattern_match_variance(const int *counters, const int *pattern, int numCounters, bool useDouble) {
  int total = 0;
  int patternLength = 0;
  for (int i = 0; i < numCounters; i++) {
    total += counters[i];
    patternLength += pattern[i];
  }
  /* If we don't even have one pixel per unit of bar width, assume this is too small to reliably match, so fail */
  if (total < patternLength) return INFINITY;
  if (useDouble) {
    double unitBarWidth = (double)total / patternLength;
    double maxIndividualVariance = MAX_INDIVIDUAL_VARIANCE_D * unitBarWidth;
    double totalVariance = 0.0;
    for (int x = 0; x < numCounters; x++) {
      int counter = counters[x];
      double scaledPattern = pattern[x] * unitBarWidth;
      double variance = counter > scaledPattern ? counter - scaledPattern : scaledPattern - counter;
      if (variance > maxIndividualVariance) return INFINITY;
      totalVariance += variance;
    }
    return totalVariance / total;
  } else {
    float unitBarWidth = (float)total / (float)patternLength;
    float maxIndividualVariance = MAX_INDIVIDUAL_VARIANCE_F * unitBarWidth;
    float totalVariance = 0.0f;
    for (int x = 0; x < numCounters; x++) {
      int counter = counters[x];
      float scaledPattern = (float)pattern[x] * unitBarWidth;
      float variance = (float)counter > scaledPattern ? (float)counter - scaledPattern : scaledPattern - (float)counter;
      if (variance > maxIndividualVariance) return INFINITY;
      totalVariance += variance;
    }
    return (double)(totalVariance / (float)total);
  }
}

static inline double max_avg_variance(bool useDouble) { return useDouble ? MAX_AVG_VARIANCE_D : (double)MAX_AVG_VARIANCE_F; }

/* ---------------------------------------------------------------------------------------------------------------
 * UPCEANReader / EAN13Reader
 * ------------------------------------------------------------------------------------------------------------- */

/* UPCEANReader.findGuardPattern ; false = NotFoundException */
static bool find_guard_pattern(const uint8_t *row, int width, int rowOffset, bool whiteFirst, const int *pattern, int patternLength,
                               int *counters, bool useDouble, int range[2]) {
  rowOffset = whiteFirst ? next_unset(row, width, rowOffset) : next_set(row, width, rowOffset);
  int counterPosition = 0;
  int patternStart = rowOffset;
  bool isWhite = whiteFirst;
  for (int x = rowOffset; x < width; x++) {
    if ((row[x] != 0) != isWhite) {
      counters[counterPosition]++;
    } else {
      if (counterPosition == patternLength - 1) {
        if (pattern_match_variance(counters, pattern, patternLength, useDouble) < max_avg_variance(useDouble)) {
          range[0] = patternStart;
          range[1] = x;
          return true;
        }
        patternStart += counters[0] + counters[1];
        memmove(counters, counters + 2, (size_t)(counterPosition - 1) * sizeof(int));
        counters[counterPosition - 1] = 0;
        counters[counterPosition] = 0;
        counterPosition--;
      } else {
        counterPosition++;
      }
      counters[counterPosition] = 1;
      isWhite = !isWhite;
    }
  }
  return false;
}

/* UPCEANReader.findStartGuardPattern */
static bool find_start_guard_pattern(const uint8_t *row, int size, bool useDouble, int startRange[2]) {
  bool foundStart = false;
  int nextStart = 0;
  int counters[3];
  while (!foundStart) {
    memset(counters, 0, sizeof counters);
    if (!find_guard_pattern(row, size, nextStart, false, START_END_PATTERN, 3, counters, useDouble, startRange)) return false;
    int start = startRange[0];
    nextStart = startRange[1];
    /* Make sure there is a quiet zone at least as big as the start pattern before the barcode.
     * If this check would run off the left edge of the image, do not accept this barcode,
     * as it is very likely to be a false positive. */
    int quietStart = start - (nextStart - start);
    if (quietStart >= 0) foundStart = is_range(row, quietStart, start, false);
  }
  return true;
}

/* UPCEANReader.decodeDigit ; -1 = NotFoundException */
static int decode_digit(const uint8_t *row, int size, int *counters, int rowOffset, const int (*patterns)[4], int max, bool useDouble) {
  if (!record_pattern(row, size, rowOffset, counters, 4)) return -1;
  double bestVariance = max_avg_variance(useDouble); /* worst variance we'll accept */
  int bestMatch = -1;
  for (int i = 0; i < max; i++) {
    double variance = pattern_match_variance(counters, patterns[i], 4, useDouble);
    if (variance < bestVariance) {
      bestVariance = variance;
      bestMatch = i;
    }
  }
  return bestMatch;
}

/* EAN13Reader.decodeMiddle ; -1 = NotFoundException, sinon rowOffset (fin du milieu) */
static int decode_middle(const uint8_t *row, int size, const int startRange[2], bool useDouble, char *result, int *resultLength) {
  int counters[4] = {0, 0, 0, 0};
  int end = size;
  int rowOffset = startRange[1];
  int lgPatternFound = 0;
  int len = 0;

  for (int x = 0; x < 6 && rowOffset < end; x++) {
    int bestMatch = decode_digit(row, size, counters, rowOffset, L_AND_G_PATTERNS, 20, useDouble);
    if (bestMatch < 0) return -1;
    result[len++] = (char)('0' + bestMatch % 10);
    for (int i = 0; i < 4; i++) rowOffset += counters[i];
    if (bestMatch >= 10) lgPatternFound |= 1 << (5 - x);
  }

  /* EAN13Reader.determineFirstDigit */
  int d = 0;
  while (d < 10 && lgPatternFound != FIRST_DIGIT_ENCODINGS[d]) d++;
  if (d == 10) return -1;
  memmove(result + 1, result, (size_t)len);
  result[0] = (char)('0' + d);
  len++;

  int middleCounters[5] = {0, 0, 0, 0, 0};
  int middleRange[2];
  if (!find_guard_pattern(row, size, rowOffset, true, MIDDLE_PATTERN, 5, middleCounters, useDouble, middleRange)) return -1;
  rowOffset = middleRange[1];

  for (int x = 0; x < 6 && rowOffset < end; x++) {
    int bestMatch = decode_digit(row, size, counters, rowOffset, L_PATTERNS, 10, useDouble);
    if (bestMatch < 0) return -1;
    result[len++] = (char)('0' + bestMatch);
    for (int i = 0; i < 4; i++) rowOffset += counters[i];
  }

  *resultLength = len;
  return rowOffset;
}

/* UPCEANReader.checkStandardUPCEANChecksum (chiffres seulement : écrits par decode_middle) */
static bool check_checksum(const char *s, int length) {
  if (length == 0) return false;
  int check = s[length - 1] - '0';
  int n = length - 1; /* getStandardUPCEANChecksum(s.subSequence(0, length - 1)) */
  int sum = 0;
  for (int i = n - 1; i >= 0; i -= 2) sum += s[i] - '0';
  sum *= 3;
  for (int i = n - 2; i >= 0; i -= 2) sum += s[i] - '0';
  return (1000 - sum) % 10 == check;
}

/* MultiFormatUPCEANReader.decodeRow -> UPCEANReader.decodeRow (EAN13Reader) ; false = ReaderException */
static bool decode_row(const uint8_t *row, int size, bool useDouble, char *text) {
  int startGuardRange[2];
  if (!find_start_guard_pattern(row, size, useDouble, startGuardRange)) return false;

  char result[16];
  int len = 0;
  int endStart = decode_middle(row, size, startGuardRange, useDouble, result, &len);
  if (endStart < 0) return false;

  /* UPCEANReader.decodeEnd */
  int endCounters[3] = {0, 0, 0};
  int endRange[2];
  if (!find_guard_pattern(row, size, endStart, false, START_END_PATTERN, 3, endCounters, useDouble, endRange)) return false;

  /* Make sure there is a quiet zone at least as big as the end pattern after the end pattern */
  int end = endRange[1];
  int quietEnd = end + (end - endRange[0]);
  if (quietEnd >= size || !is_range(row, end, quietEnd, false)) return false;

  /* UPC/EAN should never be less than 8 chars anyway */
  if (len < 8) return false;
  if (!check_checksum(result, len)) return false;

  memcpy(text, result, (size_t)len);
  text[len] = '\0';
  return true;
}

/* ---------------------------------------------------------------------------------------------------------------
 * GlobalHistogramBinarizer
 * ------------------------------------------------------------------------------------------------------------- */

/* GlobalHistogramBinarizer.estimateBlackPoint ; -1 = NotFoundException */
static int estimate_black_point(const int32_t *buckets) {
  /* Find the tallest peak in the histogram. */
  int numBuckets = LUMINANCE_BUCKETS;
  int32_t maxBucketCount = 0;
  int firstPeak = 0;
  int32_t firstPeakSize = 0;
  for (int x = 0; x < numBuckets; x++) {
    if (buckets[x] > firstPeakSize) {
      firstPeak = x;
      firstPeakSize = buckets[x];
    }
    if (buckets[x] > maxBucketCount) maxBucketCount = buckets[x];
  }

  /* Find the second-tallest peak which is somewhat far from the tallest peak. */
  int secondPeak = 0;
  int32_t secondPeakScore = 0;
  for (int x = 0; x < numBuckets; x++) {
    int distanceToBiggest = x - firstPeak;
    /* Encourage more distant second peaks by multiplying by square of distance. */
    int32_t score = jmul(jmul(buckets[x], distanceToBiggest), distanceToBiggest);
    if (score > secondPeakScore) {
      secondPeak = x;
      secondPeakScore = score;
    }
  }

  /* Make sure firstPeak corresponds to the black peak. */
  if (firstPeak > secondPeak) {
    int temp = firstPeak;
    firstPeak = secondPeak;
    secondPeak = temp;
  }

  /* If there is too little contrast in the image to pick a meaningful black point, throw rather
   * than waste time trying to decode the image, and risk false positives. */
  if (secondPeak - firstPeak <= numBuckets / 16) return -1;

  /* Find a valley between them that is low and closer to the white peak. */
  int bestValley = secondPeak - 1;
  int32_t bestValleyScore = -1;
  for (int x = secondPeak - 1; x > firstPeak; x--) {
    int fromFirst = x - firstPeak;
    int32_t score = jmul(jmul(jmul(fromFirst, fromFirst), secondPeak - x), (int32_t)((uint32_t)maxBucketCount - (uint32_t)buckets[x]));
    if (score > bestValleyScore) {
      bestValley = x;
      bestValleyScore = score;
    }
  }

  return bestValley << LUMINANCE_SHIFT;
}

/* GlobalHistogramBinarizer.getBlackRow sur une ligne de luminances ; false = NotFoundException */
static bool get_black_row(const uint8_t *localLuminances, int width, uint8_t *row) {
  memset(row, 0, (size_t)width);
  int32_t localBuckets[LUMINANCE_BUCKETS];
  memset(localBuckets, 0, sizeof localBuckets);
  for (int x = 0; x < width; x++) localBuckets[localLuminances[x] >> LUMINANCE_SHIFT]++;
  int blackPoint = estimate_black_point(localBuckets);
  if (blackPoint < 0) return false;

  if (width < 3) {
    /* Special case for very small images */
    for (int x = 0; x < width; x++)
      if (localLuminances[x] < blackPoint) row[x] = 1;
  } else {
    int left = localLuminances[0];
    int center = localLuminances[1];
    for (int x = 1; x < width - 1; x++) {
      int right = localLuminances[x + 1];
      /* A simple -1 4 -1 box filter with a weight of 2. (division entière de Java : vers zéro, comme en C) */
      if (((center * 4) - left - right) / 2 < blackPoint) row[x] = 1;
      left = center;
      center = right;
    }
  }
  return true;
}

/* ---------------------------------------------------------------------------------------------------------------
 * OneDReader.decode / doDecode
 * ------------------------------------------------------------------------------------------------------------- */

typedef struct {
  const uint8_t *data; /* pixels entrelacés de l'image (voir en tête) */
  int width;
  int height;
  int channels;
  bool cmyk;
} image_t;

/* Luminance d'un pixel : IsbnBarcodeProvider.getRGB puis RGBLuminanceSource.toGrayscale, (r + 2g + b) / 4 */
static inline uint8_t luminance(const image_t *im, const uint8_t *p) {
  if (im->channels <= 2) return p[0]; /* gris : r = g = b = v, (v + 2v + v) >> 2 = v */
  if (im->cmyk) {
    int k = p[3];
    int r = 255 - (p[0] + k < 255 ? p[0] + k : 255);
    int g = 255 - (p[1] + k < 255 ? p[1] + k : 255);
    int b = 255 - (p[2] + k < 255 ? p[2] + k : 255);
    return (uint8_t)((r + 2 * g + b) >> 2);
  }
  return (uint8_t)((p[0] + 2 * p[1] + p[2]) >> 2);
}

/* Lignes lues par OneDReader.doDecode (TRY_HARDER), dans l'ordre : depuis le milieu, en alternant dessus et dessous,
 * jusqu'à sortir de l'image */
static int scan_rows(int height, int *rows) {
  int rowStep = height >> 8;
  if (rowStep < 1) rowStep = 1;
  int maxLines = height; /* Look at the whole image, not just the center */
  int middle = height / 2;
  int n = 0;
  for (int x = 0; x < maxLines; x++) {
    /* Scanning from the middle out. Determine which row we're looking at next: */
    int rowStepsAboveOrBelow = (x + 1) / 2;
    bool isAbove = (x & 0x01) == 0; /* i.e. is x even? */
    int rowNumber = middle + rowStep * (isAbove ? rowStepsAboveOrBelow : -rowStepsAboveOrBelow);
    /* Oops, if we run off the top or bottom, stop */
    if (rowNumber < 0 || rowNumber >= height) break;
    rows[n++] = rowNumber;
  }
  return n;
}

/* Suite de OneDReader.doDecode sur les lignes de luminances déjà extraites (lines + k * width : k-ième ligne lue) ;
 * false = NotFoundException */
static bool decode_rows(const uint8_t *lines, int count, int width, bool useDouble, uint8_t *row, char *text) {
  for (int k = 0; k < count; k++) {
    /* Estimate black point for this row and load it: */
    if (!get_black_row(lines + (size_t)k * (size_t)width, width, row)) continue;
    /* While we have the image data in a BitArray, it's fairly cheap to reverse it in place to
     * handle decoding upside down barcodes. */
    for (int attempt = 0; attempt < 2; attempt++) {
      if (attempt == 1) reverse_row(row, width); /* reverse the row and continue */
      if (decode_row(row, width, useDouble, text)) return true;
    }
  }
  return false;
}

/*
 * MultiFormatReader.decode -> OneDReader.decode ; 1 trouvé (texte dans text), 0 non trouvé, -1 mémoire.
 * Seules les lignes lues sont converties en luminances : lignes de l'image, puis, pour l'image tournée de 90° dans le
 * sens inverse des aiguilles (TRY_HARDER, GrayscaleLuminanceSource.rotateCounterClockwise : sa ligne y est la colonne
 * width - 1 - y de l'image, lue de haut en bas), les colonnes lues, extraites en un seul passage sur l'image.
 */
static int decode_image(const image_t *im, bool useDouble, char *text) {
  int width = im->width;
  int height = im->height;
  size_t ch = (size_t)im->channels;
  int m = width > height ? width : height;
  int found = -1;
  int *rows = malloc(sizeof(int) * (size_t)(m > 0 ? m : 1));
  uint8_t *row = malloc((size_t)(m > 0 ? m : 1));
  uint8_t *lines = NULL;
  if (rows == NULL || row == NULL) goto done;

  /* doDecode(image) */
  int count = scan_rows(height, rows);
  lines = malloc((size_t)(count > 0 ? count : 1) * (size_t)(width > 0 ? width : 1));
  if (lines == NULL) goto done;
  for (int k = 0; k < count; k++) {
    const uint8_t *p = im->data + (size_t)rows[k] * (size_t)width * ch;
    uint8_t *out = lines + (size_t)k * (size_t)width;
    for (int x = 0; x < width; x++, p += ch) out[x] = luminance(im, p);
  }
  if (decode_rows(lines, count, width, useDouble, row, text)) {
    found = 1;
    goto done;
  }
  free(lines);

  /* doDecode(image.rotateCounterClockwise()) : largeur height, hauteur width */
  count = scan_rows(width, rows);
  lines = malloc((size_t)(count > 0 ? count : 1) * (size_t)(height > 0 ? height : 1));
  if (lines == NULL) goto done;
  for (int k = 0; k < count; k++) rows[k] = width - 1 - rows[k];
  for (int y = 0; y < height; y++) {
    const uint8_t *base = im->data + (size_t)y * (size_t)width * ch;
    for (int k = 0; k < count; k++) lines[(size_t)k * (size_t)height + (size_t)y] = luminance(im, base + (size_t)rows[k] * ch);
  }
  found = decode_rows(lines, count, height, useDouble, row, text) ? 1 : 0;

done:
  free(rows);
  free(row);
  free(lines);
  return found;
}

/* ---------------------------------------------------------------------------------------------------------------
 * N-API
 * ------------------------------------------------------------------------------------------------------------- */

typedef struct {
  const uint8_t *data;
  int width;
  int height;
  int channels;
  bool cmyk;
  bool useDouble;
  int found;
  char text[16];
  napi_ref dataRef;
  napi_async_work work;
  napi_deferred deferred;
} job;

/* Lit (data, width, height, channels, cmyk, useDouble) ; false (exception levée) si les arguments sont invalides */
static bool read_args(napi_env env, napi_callback_info info, const char *usage, job *j, napi_value *array) {
  size_t argc = 6;
  napi_value argv[6];
  bool is_ta = false;
  napi_typedarray_type type;
  size_t len;
  void *data;
  uint32_t w, h, c;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 6) goto invalid;
  if (napi_is_typedarray(env, argv[0], &is_ta) != napi_ok || !is_ta) goto invalid;
  if (napi_get_typedarray_info(env, argv[0], &type, &len, &data, NULL, NULL) != napi_ok || type != napi_uint8_array) goto invalid;
  if (napi_get_value_uint32(env, argv[1], &w) != napi_ok || napi_get_value_uint32(env, argv[2], &h) != napi_ok ||
      napi_get_value_uint32(env, argv[3], &c) != napi_ok || napi_get_value_bool(env, argv[4], &j->cmyk) != napi_ok ||
      napi_get_value_bool(env, argv[5], &j->useDouble) != napi_ok)
    goto invalid;
  if (c < 1 || c > 4 || w > INT32_MAX / 4 || h > INT32_MAX / 4 || (uint64_t)w * h * c > len) goto invalid;
  j->data = data;
  j->width = (int)w;
  j->height = (int)h;
  j->channels = (int)c;
  *array = argv[0];
  return true;
invalid:
  napi_throw_type_error(env, NULL, usage);
  return false;
}

static napi_value result_value(napi_env env, job *j) {
  napi_value v = NULL;
  if (j->found == 1)
    napi_create_string_latin1(env, j->text, NAPI_AUTO_LENGTH, &v);
  else
    napi_get_null(env, &v);
  return v;
}

static napi_value js_decode(napi_env env, napi_callback_info info) {
  job j;
  memset(&j, 0, sizeof j);
  napi_value array;
  if (!read_args(env, info, "decode(data: Uint8Array, width, height, channels: 1..4, cmyk: boolean, useDouble: boolean)", &j, &array)) return NULL;
  image_t im = {j.data, j.width, j.height, j.channels, j.cmyk};
  j.found = decode_image(&im, j.useDouble, j.text);
  if (j.found < 0) {
    napi_throw_error(env, NULL, "out of memory");
    return NULL;
  }
  return result_value(env, &j);
}

static void decode_execute(napi_env env, void *data) {
  (void)env;
  job *j = data;
  image_t im = {j->data, j->width, j->height, j->channels, j->cmyk};
  j->found = decode_image(&im, j->useDouble, j->text);
}

static void decode_complete(napi_env env, napi_status status, void *data) {
  job *j = data;
  napi_value err, msg;
  if (status == napi_ok && j->found >= 0) {
    napi_resolve_deferred(env, j->deferred, result_value(env, j));
  } else {
    napi_create_string_utf8(env, j->found < 0 ? "zxing: out of memory" : "zxing: async work failed", NAPI_AUTO_LENGTH, &msg);
    napi_create_error(env, NULL, msg, &err);
    napi_reject_deferred(env, j->deferred, err);
  }
  napi_delete_reference(env, j->dataRef);
  napi_delete_async_work(env, j->work);
  free(j);
}

static napi_value js_decode_async(napi_env env, napi_callback_info info) {
  job *j = calloc(1, sizeof(job));
  napi_value promise, name, array;
  if (j == NULL) {
    napi_throw_error(env, NULL, "out of memory");
    return NULL;
  }
  if (!read_args(env, info, "decodeAsync(data: Uint8Array, width, height, channels: 1..4, cmyk: boolean, useDouble: boolean)", j, &array)) {
    free(j);
    return NULL;
  }
  /* le tableau reste vivant (et ses octets à la même adresse) jusqu'à decode_complete */
  if (napi_create_reference(env, array, 1, &j->dataRef) != napi_ok) {
    free(j);
    napi_throw_error(env, NULL, "napi_create_reference failed");
    return NULL;
  }
  if (napi_create_promise(env, &j->deferred, &promise) != napi_ok ||
      napi_create_string_utf8(env, "komgaZxing", NAPI_AUTO_LENGTH, &name) != napi_ok ||
      napi_create_async_work(env, NULL, name, decode_execute, decode_complete, j, &j->work) != napi_ok) {
    napi_delete_reference(env, j->dataRef);
    free(j);
    napi_throw_error(env, NULL, "napi_create_async_work failed");
    return NULL;
  }
  if (napi_queue_async_work(env, j->work) != napi_ok) {
    napi_delete_async_work(env, j->work);
    napi_delete_reference(env, j->dataRef);
    free(j);
    napi_throw_error(env, NULL, "napi_queue_async_work failed");
    return NULL;
  }
  return promise;
}

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  napi_property_descriptor props[] = {
      {"decode", NULL, js_decode, NULL, NULL, NULL, napi_default, NULL},
      {"decodeAsync", NULL, js_decode_async, NULL, NULL, NULL, napi_default, NULL},
  };
  napi_define_properties(env, exports, sizeof(props) / sizeof(props[0]), props);
  return exports;
}
