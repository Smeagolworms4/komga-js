/*
 * komga_jpeg : module N-API reproduisant, octet pour octet, le décodage et l'encodage JPEG de la JVM
 * (javax.imageio + libjavajpeg du JDK = IJG libjpeg 6b, native/libjpeg6b) et les conversions ICC de
 * java.awt.image.ColorConvertOp (LittleCMS 2.19 comme le JDK 21, native/lcms2).
 *
 * Code original (licence du projet). Il reproduit le comportement de la glue du JDK (imageioJPEG.c, LCMS.c,
 * JPEGImageReader/Writer.java, LCMSTransform.java) sans en reprendre le code :
 * - lecture : source mémoire (EOF -> marqueur EOI inséré), ajustements de l'espace colorimétrique après
 *   jpeg_read_header, mode « buffered image » pour les JPEG progressifs, pas d'option de décodage particulière
 *   (DCT entière lente, suréchantillonnage « fancy », lissage de blocs par défaut) ;
 * - écriture : jpeg_set_defaults + jpeg_set_colorspace, tables et composantes fournies par l'appelant, SOI puis
 *   segments de métadonnées (JFIF, ICC) écrits par l'appelant, puis DQT/SOF/DHT/SOS écrits par la bibliothèque ;
 * - ICC : profils ouverts par cmsOpenProfileFromMem, sérialisation par cmsSaveProfileToMem, transformation
 *   cmsCreateMultiprofileTransform(profils, intention, formats, 0) puis cmsDoTransformLineStride.
 *
 * Fonctions exportées (toutes synchrones) :
 *   jpegHeader(bytes)                          -> { width, height, jpegColorSpace, outColorSpace, numComponents, progressive }
 *   jpegDecode(bytes, outColorSpace)           -> { width, height, components, data }
 *   jpegEncode(pixels, width, height, components, inCs, outCs, qtables, ids, hSamp, vSamp, qSel, markers, restartInterval)
 *                                              -> Buffer
 *   iccSave(profile)                           -> Buffer (profil relu puis réécrit par LittleCMS) ; exception si invalide
 *   iccTransform(src, dst, intent, inFmt, outFmt, pixels, width, height, inStride, outStride) -> Buffer
 */
#define NAPI_VERSION 8
#include <node_api.h>
#include <setjmp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef __GLIBC__
#include <malloc.h>
#endif

#include "libjpeg6b/jpeglib.h"
#include "libjpeg6b/jerror.h"
#include "lcms2/lcms2.h"

#include <stdarg.h>

/* jerror.c du JDK formate les messages avec jio_snprintf (fourni par libjava) */
int jio_snprintf(char *str, size_t count, const char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  int n = vsnprintf(str, count, fmt, args);
  va_end(args);
  return n;
}

/* ------------------------------------------------------------------------- */
/* Outils N-API                                                               */
/* ------------------------------------------------------------------------- */

#define NAPI_CALL(env, call)                                   \
  do {                                                         \
    if ((call) != napi_ok) {                                   \
      napi_throw_error((env), NULL, "N-API call failed: " #call); \
      return NULL;                                             \
    }                                                          \
  } while (0)

static int get_bytes(napi_env env, napi_value v, const unsigned char **data, size_t *len) {
  bool is_typed = false;
  if (napi_is_typedarray(env, v, &is_typed) == napi_ok && is_typed) {
    napi_typedarray_type type;
    size_t length, offset;
    void *ptr;
    napi_value ab;
    if (napi_get_typedarray_info(env, v, &type, &length, &ptr, &ab, &offset) != napi_ok) return 0;
    if (type != napi_uint8_array && type != napi_int8_array && type != napi_uint8_clamped_array) return 0;
    *data = (const unsigned char *)ptr;
    *len = length;
    return 1;
  }
  bool is_buffer = false;
  if (napi_is_buffer(env, v, &is_buffer) == napi_ok && is_buffer) {
    void *ptr;
    if (napi_get_buffer_info(env, v, &ptr, len) != napi_ok) return 0;
    *data = (const unsigned char *)ptr;
    return 1;
  }
  return 0;
}

static int get_int32_array(napi_env env, napi_value v, const int32_t **data, size_t *len) {
  bool is_typed = false;
  if (napi_is_typedarray(env, v, &is_typed) != napi_ok || !is_typed) return 0;
  napi_typedarray_type type;
  size_t length, offset;
  void *ptr;
  napi_value ab;
  if (napi_get_typedarray_info(env, v, &type, &length, &ptr, &ab, &offset) != napi_ok) return 0;
  if (type != napi_int32_array) return 0;
  *data = (const int32_t *)ptr;
  *len = length;
  return 1;
}

static int get_int(napi_env env, napi_value v, int32_t *out) {
  return napi_get_value_int32(env, v, out) == napi_ok;
}

static void set_int(napi_env env, napi_value obj, const char *name, int32_t value) {
  napi_value v;
  napi_create_int32(env, value, &v);
  napi_set_named_property(env, obj, name, v);
}

static void set_bool(napi_env env, napi_value obj, const char *name, int value) {
  napi_value v;
  napi_get_boolean(env, value ? true : false, &v);
  napi_set_named_property(env, obj, name, v);
}

/* ------------------------------------------------------------------------- */
/* Gestion d'erreur libjpeg : longjmp avec le message formaté                 */
/* ------------------------------------------------------------------------- */

struct komga_error_mgr {
  struct jpeg_error_mgr pub;
  jmp_buf setjmp_buffer;
};

static void komga_error_exit(j_common_ptr cinfo) {
  struct komga_error_mgr *err = (struct komga_error_mgr *)cinfo->err;
  longjmp(err->setjmp_buffer, 1);
}

/* Les avertissements (données corrompues...) n'ont pas d'effet sur les pixels : ignorés */
static void komga_output_message(j_common_ptr cinfo) { (void)cinfo; }

static void throw_jpeg_error(napi_env env, j_common_ptr cinfo) {
  char buffer[JMSG_LENGTH_MAX];
  (*cinfo->err->format_message)(cinfo, buffer);
  napi_throw_error(env, "IIOException", buffer);
}

/* ------------------------------------------------------------------------- */
/* Source mémoire : tout le flux d'un coup, puis EOI inséré à chaque demande  */
/* (même résultat que les lectures par blocs du JDK, qui insère FF D9 en fin) */
/* ------------------------------------------------------------------------- */

static const JOCTET fake_eoi[2] = {0xFF, JPEG_EOI};

struct mem_source {
  struct jpeg_source_mgr pub;
  const JOCTET *data;
  size_t len;
  int delivered;
};

static void mem_init_source(j_decompress_ptr cinfo) {
  struct mem_source *src = (struct mem_source *)cinfo->src;
  src->pub.next_input_byte = NULL;
  src->pub.bytes_in_buffer = 0;
}

static boolean mem_fill_input_buffer(j_decompress_ptr cinfo) {
  struct mem_source *src = (struct mem_source *)cinfo->src;
  if (!src->delivered && src->len > 0) {
    src->delivered = 1;
    src->pub.next_input_byte = src->data;
    src->pub.bytes_in_buffer = src->len;
  } else {
    src->delivered = 1;
    WARNMS(cinfo, JWRN_JPEG_EOF);
    src->pub.next_input_byte = fake_eoi;
    src->pub.bytes_in_buffer = 2;
  }
  return TRUE;
}

static void mem_skip_input_data(j_decompress_ptr cinfo, long num_bytes) {
  struct mem_source *src = (struct mem_source *)cinfo->src;
  if (num_bytes <= 0) return;
  while (num_bytes > (long)src->pub.bytes_in_buffer) {
    num_bytes -= (long)src->pub.bytes_in_buffer;
    src->pub.bytes_in_buffer = 0;
    if (src->delivered) {
      /* fin de flux pendant un saut : EOI inséré */
      WARNMS(cinfo, JWRN_JPEG_EOF);
      src->pub.next_input_byte = fake_eoi;
      src->pub.bytes_in_buffer = 2;
      return;
    }
    (void)mem_fill_input_buffer(cinfo);
  }
  src->pub.next_input_byte += num_bytes;
  src->pub.bytes_in_buffer -= num_bytes;
}

static void mem_term_source(j_decompress_ptr cinfo) { (void)cinfo; }

static void setup_source(j_decompress_ptr cinfo, struct mem_source *src, const unsigned char *data, size_t len) {
  src->pub.init_source = mem_init_source;
  src->pub.fill_input_buffer = mem_fill_input_buffer;
  src->pub.skip_input_data = mem_skip_input_data;
  src->pub.resync_to_restart = jpeg_resync_to_restart;
  src->pub.term_source = mem_term_source;
  src->pub.bytes_in_buffer = 0;
  src->pub.next_input_byte = NULL;
  src->data = data;
  src->len = len;
  src->delivered = 0;
  cinfo->src = &src->pub;
}

/*
 * Lecture de l'en-tête puis ajustements de l'espace colorimétrique faits par le lecteur du JDK
 * (ils restent dans cinfo et pilotent donc le décodage) :
 * - YCbCr avec marqueur Adobe dont la transformation n'est pas 1 : espace inconnu ;
 * - YCbCr sans JFIF ni Exif (le JDK ne conserve que les APP2, donc Exif n'est jamais vu), identifiants autres que
 *   1,2,3 et aucun sous-échantillonnage : RGB ;
 * - YCCK avec marqueur Adobe dont la transformation n'est pas 2 : espace inconnu ;
 * - CMYK dont les composantes 1 et 2 sont sous-échantillonnées par rapport à la 0 : YCCK (sortie CMYK conservée).
 * Retourne 0 si le flux ne contient que des tables.
 */
#define APP2_MARKER (JPEG_APP0 + 2)

static int read_header_jdk(j_decompress_ptr cinfo) {
  jpeg_save_markers(cinfo, APP2_MARKER, 0xFFFF);
  int ret = jpeg_read_header(cinfo, FALSE);
  if (ret == JPEG_HEADER_TABLES_ONLY) return 0;
  jpeg_component_info *c = cinfo->comp_info;
  switch (cinfo->jpeg_color_space) {
    case JCS_YCbCr:
      if (cinfo->saw_Adobe_marker) {
        if (cinfo->Adobe_transform != 1) {
          cinfo->jpeg_color_space = JCS_UNKNOWN;
          cinfo->out_color_space = JCS_UNKNOWN;
        }
      } else if (!cinfo->saw_JFIF_marker &&
                 !(cinfo->marker_list != NULL && cinfo->marker_list->marker == JPEG_APP0 + 1)) {
        if (!(c[0].component_id == 1 && c[1].component_id == 2 && c[2].component_id == 3) &&
            c[1].h_samp_factor == c[0].h_samp_factor && c[2].h_samp_factor == c[0].h_samp_factor &&
            c[1].v_samp_factor == c[0].v_samp_factor && c[2].v_samp_factor == c[0].v_samp_factor) {
          cinfo->jpeg_color_space = JCS_RGB;
        }
      }
      break;
    case JCS_YCCK:
      if (cinfo->saw_Adobe_marker && cinfo->Adobe_transform != 2) {
        cinfo->jpeg_color_space = JCS_UNKNOWN;
        cinfo->out_color_space = JCS_UNKNOWN;
      }
      break;
    case JCS_CMYK:
      if ((c[1].h_samp_factor > c[0].h_samp_factor && c[2].h_samp_factor > c[0].h_samp_factor) ||
          (c[1].v_samp_factor > c[0].v_samp_factor && c[2].v_samp_factor > c[0].v_samp_factor)) {
        cinfo->jpeg_color_space = JCS_YCCK;
      }
      break;
    default:
      break;
  }
  return 1;
}

/* jpegHeader(bytes) */
static napi_value js_jpeg_header(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  const unsigned char *data;
  size_t len;
  if (argc < 1 || !get_bytes(env, argv[0], &data, &len)) {
    napi_throw_type_error(env, NULL, "jpegHeader(bytes: Uint8Array)");
    return NULL;
  }

  struct jpeg_decompress_struct cinfo;
  struct komga_error_mgr jerr;
  struct mem_source src;
  napi_value result = NULL;

  cinfo.err = jpeg_std_error(&jerr.pub);
  jerr.pub.error_exit = komga_error_exit;
  jerr.pub.output_message = komga_output_message;
  if (setjmp(jerr.setjmp_buffer)) {
    throw_jpeg_error(env, (j_common_ptr)&cinfo);
    jpeg_destroy_decompress(&cinfo);
    return NULL;
  }
  jpeg_create_decompress(&cinfo);
  setup_source(&cinfo, &src, data, len);
  int image = read_header_jdk(&cinfo);

  napi_create_object(env, &result);
  set_bool(env, result, "tablesOnly", !image);
  if (image) {
    set_int(env, result, "width", (int32_t)cinfo.image_width);
    set_int(env, result, "height", (int32_t)cinfo.image_height);
    set_int(env, result, "jpegColorSpace", (int32_t)cinfo.jpeg_color_space);
    set_int(env, result, "outColorSpace", (int32_t)cinfo.out_color_space);
    set_int(env, result, "numComponents", (int32_t)cinfo.num_components);
    set_bool(env, result, "progressive", jpeg_has_multiple_scans(&cinfo));
  }
  jpeg_destroy_decompress(&cinfo);
  return result;
}

/*
 * jpegDecode(bytes, outColorSpace) : image entière, pixels entrelacés (composantes de sortie de libjpeg).
 * outColorSpace < 0 : espace de sortie par défaut après les ajustements du JDK.
 *
 * JPEG progressif : le JDK décode en mode « buffered image » et fait une passe de sortie par balayage lu ;
 * seule la dernière passe reste dans l'image. On lit donc tout le flux puis on fait cette dernière passe
 * (même numéro de balayage, mêmes coefficients, même décision de lissage de blocs).
 */
static napi_value js_jpeg_decode(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  const unsigned char *data;
  size_t len;
  int32_t out_cs = -1;
  if (argc < 1 || !get_bytes(env, argv[0], &data, &len) || (argc > 1 && !get_int(env, argv[1], &out_cs))) {
    napi_throw_type_error(env, NULL, "jpegDecode(bytes: Uint8Array, outColorSpace: number)");
    return NULL;
  }

  struct jpeg_decompress_struct cinfo;
  struct komga_error_mgr jerr;
  struct mem_source src;
  JSAMPROW row = NULL;
  napi_value result = NULL;

  cinfo.err = jpeg_std_error(&jerr.pub);
  jerr.pub.error_exit = komga_error_exit;
  jerr.pub.output_message = komga_output_message;
  if (setjmp(jerr.setjmp_buffer)) {
    throw_jpeg_error(env, (j_common_ptr)&cinfo);
    jpeg_destroy_decompress(&cinfo);
    return NULL;
  }
  jpeg_create_decompress(&cinfo);
  setup_source(&cinfo, &src, data, len);
  if (!read_header_jdk(&cinfo)) {
    jpeg_destroy_decompress(&cinfo);
    napi_throw_error(env, "IIOException", "Tables-only JPEG stream");
    return NULL;
  }
  if (out_cs >= 0) cinfo.out_color_space = (J_COLOR_SPACE)out_cs;

  boolean progressive = jpeg_has_multiple_scans(&cinfo);
  if (progressive) {
    cinfo.buffered_image = TRUE;
    cinfo.input_scan_number = 1;
  }
  jpeg_start_decompress(&cinfo);

  int comps = cinfo.output_components;
  if (comps <= 0 || cinfo.output_width > (0xffffffffu / (unsigned int)comps)) {
    jpeg_destroy_decompress(&cinfo);
    napi_throw_error(env, "IIOException", "Invalid number of output components");
    return NULL;
  }
  size_t stride = (size_t)cinfo.output_width * (size_t)comps;
  size_t total = stride * (size_t)cinfo.output_height;
  void *out = NULL;
  napi_value buffer;
  if (napi_create_buffer(env, total, &out, &buffer) != napi_ok) {
    jpeg_destroy_decompress(&cinfo);
    napi_throw_error(env, NULL, "Out of memory");
    return NULL;
  }

  if (progressive) {
    while (!jpeg_input_complete(&cinfo)) {
      if (jpeg_consume_input(&cinfo) == JPEG_SUSPENDED) break;
    }
    jpeg_start_output(&cinfo, cinfo.input_scan_number);
  }
  while (cinfo.output_scanline < cinfo.output_height) {
    row = (JSAMPROW)((unsigned char *)out + stride * cinfo.output_scanline);
    jpeg_read_scanlines(&cinfo, &row, 1);
  }
  if (progressive) jpeg_finish_output(&cinfo);
  jpeg_finish_decompress(&cinfo);

  napi_create_object(env, &result);
  set_int(env, result, "width", (int32_t)cinfo.output_width);
  set_int(env, result, "height", (int32_t)cinfo.output_height);
  set_int(env, result, "components", comps);
  napi_set_named_property(env, result, "data", buffer);
  jpeg_destroy_decompress(&cinfo);
  return result;
}

/* ------------------------------------------------------------------------- */
/* Destination mémoire extensible                                             */
/* ------------------------------------------------------------------------- */

struct mem_dest {
  struct jpeg_destination_mgr pub;
  JOCTET *buf;
  size_t size;
};

static void mem_init_destination(j_compress_ptr cinfo) {
  struct mem_dest *dest = (struct mem_dest *)cinfo->dest;
  dest->pub.next_output_byte = dest->buf;
  dest->pub.free_in_buffer = dest->size;
}

static int mem_grow(struct mem_dest *dest, size_t need) {
  size_t used = dest->size - dest->pub.free_in_buffer;
  size_t size = dest->size;
  while (size - used < need) size = size * 2;
  if (size == dest->size) return 1;
  JOCTET *buf = (JOCTET *)realloc(dest->buf, size);
  if (buf == NULL) return 0;
  dest->buf = buf;
  dest->size = size;
  dest->pub.next_output_byte = buf + used;
  dest->pub.free_in_buffer = size - used;
  return 1;
}

static boolean mem_empty_output_buffer(j_compress_ptr cinfo) {
  struct mem_dest *dest = (struct mem_dest *)cinfo->dest;
  /* contrat libjpeg : tout le tampon est considéré comme plein */
  dest->pub.free_in_buffer = 0;
  if (!mem_grow(dest, 1)) ERREXIT1(cinfo, JERR_OUT_OF_MEMORY, 10);
  return TRUE;
}

static void mem_term_destination(j_compress_ptr cinfo) { (void)cinfo; }

/*
 * jpegEncode(pixels, width, height, components, inCs, outCs, qtables, ids, hSamp, vSamp, qSel, markers, restartInterval)
 * - qtables : Int32Array de 64 * n valeurs (ordre naturel), écrites dans le flux (sent_table = FALSE) ;
 * - tables de Huffman : tables standard de jpeg_set_defaults (celles du JDK), écrites ;
 * - markers : octets écrits tels quels juste après SOI (segments JFIF / ICC du JDK).
 */
static napi_value js_jpeg_encode(napi_env env, napi_callback_info info) {
  size_t argc = 13;
  napi_value argv[13];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  const unsigned char *pixels, *markers;
  size_t pixels_len, markers_len;
  int32_t width, height, comps, in_cs, out_cs, restart;
  const int32_t *qtables, *ids, *hs, *vs, *qs;
  size_t qlen, idlen, hlen, vlen, qslen;
  if (argc < 13 || !get_bytes(env, argv[0], &pixels, &pixels_len) || !get_int(env, argv[1], &width) ||
      !get_int(env, argv[2], &height) || !get_int(env, argv[3], &comps) || !get_int(env, argv[4], &in_cs) ||
      !get_int(env, argv[5], &out_cs) || !get_int32_array(env, argv[6], &qtables, &qlen) ||
      !get_int32_array(env, argv[7], &ids, &idlen) || !get_int32_array(env, argv[8], &hs, &hlen) ||
      !get_int32_array(env, argv[9], &vs, &vlen) || !get_int32_array(env, argv[10], &qs, &qslen) ||
      !get_bytes(env, argv[11], &markers, &markers_len) || !get_int(env, argv[12], &restart)) {
    napi_throw_type_error(env, NULL, "jpegEncode: invalid arguments");
    return NULL;
  }
  if (width <= 0 || height <= 0 || comps < 1 || comps > 4 || (size_t)width * (size_t)height * (size_t)comps > pixels_len ||
      idlen < (size_t)comps || hlen < (size_t)comps || vlen < (size_t)comps || qslen < (size_t)comps || qlen % 64 != 0) {
    napi_throw_error(env, "IIOException", "Invalid argument to native writeImage");
    return NULL;
  }

  struct jpeg_compress_struct cinfo;
  struct komga_error_mgr jerr;
  struct mem_dest dest;
  dest.size = 65536;
  dest.buf = (JOCTET *)malloc(dest.size);
  if (dest.buf == NULL) {
    napi_throw_error(env, NULL, "Out of memory");
    return NULL;
  }

  cinfo.err = jpeg_std_error(&jerr.pub);
  jerr.pub.error_exit = komga_error_exit;
  jerr.pub.output_message = komga_output_message;
  if (setjmp(jerr.setjmp_buffer)) {
    throw_jpeg_error(env, (j_common_ptr)&cinfo);
    jpeg_destroy_compress(&cinfo);
    free(dest.buf);
    return NULL;
  }
  jpeg_create_compress(&cinfo);
  dest.pub.init_destination = mem_init_destination;
  dest.pub.empty_output_buffer = mem_empty_output_buffer;
  dest.pub.term_destination = mem_term_destination;
  cinfo.dest = &dest.pub;

  cinfo.image_width = (JDIMENSION)width;
  cinfo.image_height = (JDIMENSION)height;
  cinfo.input_components = comps;
  cinfo.in_color_space = (J_COLOR_SPACE)in_cs;
  jpeg_set_defaults(&cinfo);
  jpeg_set_colorspace(&cinfo, (J_COLOR_SPACE)out_cs);
  cinfo.optimize_coding = FALSE;
  cinfo.write_JFIF_header = FALSE;
  cinfo.write_Adobe_marker = FALSE;
  for (int i = 0; i < comps; i++) {
    cinfo.comp_info[i].component_id = ids[i];
    cinfo.comp_info[i].h_samp_factor = hs[i];
    cinfo.comp_info[i].v_samp_factor = vs[i];
    cinfo.comp_info[i].quant_tbl_no = qs[i];
  }
  jpeg_suppress_tables(&cinfo, TRUE);
  size_t nq = qlen / 64;
  if (nq > NUM_QUANT_TBLS) nq = NUM_QUANT_TBLS;
  for (size_t t = 0; t < nq; t++) {
    if (cinfo.quant_tbl_ptrs[t] == NULL) cinfo.quant_tbl_ptrs[t] = jpeg_alloc_quant_table((j_common_ptr)&cinfo);
    for (int j = 0; j < DCTSIZE2; j++) cinfo.quant_tbl_ptrs[t]->quantval[j] = (UINT16)qtables[t * 64 + j];
    cinfo.quant_tbl_ptrs[t]->sent_table = FALSE;
  }
  for (int t = 0; t < 2; t++) {
    if (cinfo.dc_huff_tbl_ptrs[t] != NULL) cinfo.dc_huff_tbl_ptrs[t]->sent_table = FALSE;
    if (cinfo.ac_huff_tbl_ptrs[t] != NULL) cinfo.ac_huff_tbl_ptrs[t]->sent_table = FALSE;
  }
  cinfo.restart_interval = (unsigned int)restart;

  jpeg_start_compress(&cinfo, FALSE);
  if (markers_len > 0) {
    if (!mem_grow(&dest, markers_len)) ERREXIT1(&cinfo, JERR_OUT_OF_MEMORY, 11);
    memcpy(dest.pub.next_output_byte, markers, markers_len);
    dest.pub.next_output_byte += markers_len;
    dest.pub.free_in_buffer -= markers_len;
  }
  size_t stride = (size_t)width * (size_t)comps;
  while (cinfo.next_scanline < cinfo.image_height) {
    JSAMPROW row = (JSAMPROW)(pixels + stride * cinfo.next_scanline);
    jpeg_write_scanlines(&cinfo, &row, 1);
  }
  jpeg_finish_compress(&cinfo);

  size_t used = dest.size - dest.pub.free_in_buffer;
  napi_value buffer;
  void *copy;
  if (napi_create_buffer_copy(env, used, dest.buf, &copy, &buffer) != napi_ok) buffer = NULL;
  jpeg_destroy_compress(&cinfo);
  free(dest.buf);
  if (buffer == NULL) napi_throw_error(env, NULL, "Out of memory");
  return buffer;
}

/* ------------------------------------------------------------------------- */
/* LittleCMS                                                                  */
/* ------------------------------------------------------------------------- */

static void lcms_silent(cmsContext id, cmsUInt32Number code, const char *text) {
  (void)id;
  (void)code;
  (void)text;
}

/* Chargement comme LCMS.loadProfileNative : ouverture puis sérialisation de contrôle */
static cmsHPROFILE open_profile(const unsigned char *data, size_t len) {
  cmsHPROFILE pf = cmsOpenProfileFromMem(data, (cmsUInt32Number)len);
  if (pf == NULL) return NULL;
  cmsUInt32Number size = 0;
  if (!cmsSaveProfileToMem(pf, NULL, &size) || size < sizeof(cmsICCHeader)) {
    cmsCloseProfile(pf);
    return NULL;
  }
  return pf;
}

/*
 * iccSave(profile, srgb?) : ICC_Profile.getInstance(data).getData().
 * Avec srgb : getData() après ICC_ColorSpace.fromRGB (validation de TwelveMonkeys), qui crée une transformation
 * sRGB -> profil (intention perceptuelle, 16 bits) ; LittleCMS garde les balises lues sous forme décodée et les
 * réécrit ensuite, les octets peuvent donc changer. Exception si la transformation ne peut pas être créée.
 */
static napi_value js_icc_save(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  const unsigned char *data, *srgb = NULL;
  size_t len, srgb_len = 0;
  if (argc < 1 || !get_bytes(env, argv[0], &data, &len) || (argc > 1 && !get_bytes(env, argv[1], &srgb, &srgb_len))) {
    napi_throw_type_error(env, NULL, "iccSave(profile: Uint8Array, srgb?: Uint8Array)");
    return NULL;
  }
  cmsHPROFILE pf = open_profile(data, len);
  if (pf == NULL) {
    napi_throw_error(env, "IllegalArgumentException", "Invalid profile data");
    return NULL;
  }
  if (srgb != NULL) {
    cmsHPROFILE profiles[2];
    profiles[0] = open_profile(srgb, srgb_len);
    profiles[1] = pf;
    cmsHTRANSFORM xform = NULL;
    if (profiles[0] != NULL) {
      cmsUInt32Number nc = cmsChannelsOf(cmsGetColorSpace(pf));
      xform = cmsCreateMultiprofileTransform(profiles, 2, CHANNELS_SH(3) | BYTES_SH(2), CHANNELS_SH(nc) | BYTES_SH(2), INTENT_PERCEPTUAL, 0);
      if (xform != NULL) {
        cmsUInt16Number in[3] = {65534, 32768, 66}, out[16];
        cmsDoTransform(xform, in, out, 1);
        cmsDeleteTransform(xform);
      }
      cmsCloseProfile(profiles[0]);
    }
    if (xform == NULL) {
      cmsCloseProfile(pf);
      napi_throw_error(env, "CMMException", "Cannot get color transform");
      return NULL;
    }
  }
  cmsUInt32Number size = 0;
  cmsSaveProfileToMem(pf, NULL, &size);
  void *out;
  napi_value buffer;
  if (napi_create_buffer(env, size, &out, &buffer) != napi_ok || !cmsSaveProfileToMem(pf, out, &size)) {
    cmsCloseProfile(pf);
    napi_throw_error(env, "CMMException", "Can not access specified profile.");
    return NULL;
  }
  cmsCloseProfile(pf);
  return buffer;
}

/*
 * iccTransform(src, dst, intent, inFormat, outFormat, pixels, width, height, inStride, outStride)
 * Transformation LCMSTransform (deux profils, drapeaux 0) appliquée à toute l'image en une fois.
 */
static napi_value js_icc_transform(napi_env env, napi_callback_info info) {
  size_t argc = 10;
  napi_value argv[10];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  const unsigned char *src_data, *dst_data, *pixels;
  size_t src_len, dst_len, pixels_len;
  int32_t intent, in_fmt, out_fmt, width, height, in_stride, out_stride;
  if (argc < 10 || !get_bytes(env, argv[0], &src_data, &src_len) || !get_bytes(env, argv[1], &dst_data, &dst_len) ||
      !get_int(env, argv[2], &intent) || !get_int(env, argv[3], &in_fmt) || !get_int(env, argv[4], &out_fmt) ||
      !get_bytes(env, argv[5], &pixels, &pixels_len) || !get_int(env, argv[6], &width) || !get_int(env, argv[7], &height) ||
      !get_int(env, argv[8], &in_stride) || !get_int(env, argv[9], &out_stride)) {
    napi_throw_type_error(env, NULL, "iccTransform: invalid arguments");
    return NULL;
  }
  if (width <= 0 || height <= 0 || in_stride <= 0 || out_stride <= 0 || (size_t)in_stride * (size_t)height > pixels_len) {
    napi_throw_error(env, "IllegalArgumentException", "iccTransform: invalid dimensions");
    return NULL;
  }
  cmsHPROFILE profiles[2];
  profiles[0] = open_profile(src_data, src_len);
  profiles[1] = open_profile(dst_data, dst_len);
  if (profiles[0] == NULL || profiles[1] == NULL) {
    if (profiles[0] != NULL) cmsCloseProfile(profiles[0]);
    if (profiles[1] != NULL) cmsCloseProfile(profiles[1]);
    napi_throw_error(env, "IllegalArgumentException", "Invalid profile data");
    return NULL;
  }
  cmsUInt32Number flags = 0;
  if (T_EXTRA(in_fmt) > 0 && T_EXTRA(out_fmt) > 0) flags |= cmsFLAGS_COPY_ALPHA;
  cmsHTRANSFORM xform = cmsCreateMultiprofileTransform(profiles, 2, (cmsUInt32Number)in_fmt, (cmsUInt32Number)out_fmt,
                                                       (cmsUInt32Number)intent, flags);
  cmsCloseProfile(profiles[0]);
  cmsCloseProfile(profiles[1]);
  if (xform == NULL) {
    napi_throw_error(env, "CMMException", "Cannot get color transform");
    return NULL;
  }
  void *out;
  napi_value buffer;
  if (napi_create_buffer(env, (size_t)out_stride * (size_t)height, &out, &buffer) != napi_ok) {
    cmsDeleteTransform(xform);
    napi_throw_error(env, NULL, "Out of memory");
    return NULL;
  }
  cmsDoTransformLineStride(xform, pixels, out, (cmsUInt32Number)width, (cmsUInt32Number)height, (cmsUInt32Number)in_stride,
                           (cmsUInt32Number)out_stride, 0, 0);
  cmsDeleteTransform(xform);
  return buffer;
}

/* ------------------------------------------------------------------------- */

/* malloc_trim(0) de glibc : rend au système la mémoire libérée par un thread terminé (worker des tâches de KomgaJS,
   src/port/task-worker.ts). Sans effet hors glibc. Renvoie true si de la mémoire a été rendue. */
static napi_value js_malloc_trim(napi_env env, napi_callback_info info) {
  (void)info;
  int released = 0;
#ifdef __GLIBC__
  released = malloc_trim(0);
#endif
  napi_value result;
  napi_get_boolean(env, released != 0, &result);
  return result;
}

/* ------------------------------------------------------------------------- */

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  cmsSetLogErrorHandler(lcms_silent);
  napi_property_descriptor props[] = {
      {"jpegHeader", NULL, js_jpeg_header, NULL, NULL, NULL, napi_default, NULL},
      {"jpegDecode", NULL, js_jpeg_decode, NULL, NULL, NULL, napi_default, NULL},
      {"jpegEncode", NULL, js_jpeg_encode, NULL, NULL, NULL, napi_default, NULL},
      {"iccSave", NULL, js_icc_save, NULL, NULL, NULL, napi_default, NULL},
      {"iccTransform", NULL, js_icc_transform, NULL, NULL, NULL, napi_default, NULL},
      {"mallocTrim", NULL, js_malloc_trim, NULL, NULL, NULL, napi_default, NULL},
  };
  napi_define_properties(env, exports, sizeof(props) / sizeof(props[0]), props);
  return exports;
}
