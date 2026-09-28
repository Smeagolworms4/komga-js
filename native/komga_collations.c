/*
 * Support de portage : extension SQLite chargeable qui enregistre les collations ICU de Komga.
 * Équivalent de SqliteUdfDataSource.createUnicodeCollation + infrastructure/unicode/Collators.kt :
 *   COLLATION_UNICODE_1 : Collator.getInstance(), strength PRIMARY,  decomposition CANONICAL (matching)
 *   COLLATION_UNICODE_3 : Collator.getInstance(), strength TERTIARY, decomposition CANONICAL (sorting)
 * Collator.getInstance() utilise la locale par défaut (JVM) ; ici uloc_getDefault() (LANG/LC_ALL),
 * surchargeable par la variable d'environnement KOMGA_COLLATION_LOCALE.
 * Aucun des pilotes SQLite de Node (better-sqlite3, node:sqlite) n'expose sqlite3_create_collation.
 */
#include <sqlite3ext.h>
SQLITE_EXTENSION_INIT1

#include <stdlib.h>
#include <unicode/ucol.h>
#include <unicode/uloc.h>
#include <unicode/ustring.h>

static int collate(void *arg, int n1, const void *s1, int n2, const void *s2) {
  UErrorCode status = U_ZERO_ERROR;
  UCollationResult r = ucol_strcollUTF8((UCollator *)arg, (const char *)s1, n1, (const char *)s2, n2, &status);
  if (U_FAILURE(status)) return 0;
  return r == UCOL_LESS ? -1 : (r == UCOL_GREATER ? 1 : 0);
}

static void destroy(void *arg) { ucol_close((UCollator *)arg); }

static int register_collation(sqlite3 *db, const char *name, UColAttributeValue strength, char **err) {
  UErrorCode status = U_ZERO_ERROR;
  const char *locale = getenv("KOMGA_COLLATION_LOCALE");
  UCollator *coll = ucol_open(locale ? locale : uloc_getDefault(), &status);
  if (U_FAILURE(status)) {
    *err = sqlite3_mprintf("ucol_open failed: %s", u_errorName(status));
    return SQLITE_ERROR;
  }
  ucol_setStrength(coll, strength);
  ucol_setAttribute(coll, UCOL_NORMALIZATION_MODE, UCOL_ON, &status);
  if (U_FAILURE(status)) {
    ucol_close(coll);
    *err = sqlite3_mprintf("ucol_setAttribute failed: %s", u_errorName(status));
    return SQLITE_ERROR;
  }
  return sqlite3_create_collation_v2(db, name, SQLITE_UTF8, coll, collate, destroy);
}

#ifdef _WIN32
__declspec(dllexport)
#endif
int sqlite3_komgacollations_init(sqlite3 *db, char **err, const sqlite3_api_routines *api) {
  SQLITE_EXTENSION_INIT2(api);
  int rc = register_collation(db, "COLLATION_UNICODE_3", UCOL_TERTIARY, err);
  if (rc == SQLITE_OK) rc = register_collation(db, "COLLATION_UNICODE_1", UCOL_PRIMARY, err);
  return rc;
}
