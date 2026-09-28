// Support de test (sans jumeau Kotlin) : sorties JSON de Komga pour DtoJsonTest.test.ts.
// Valeurs relevées sur Komga (tools/jshell-komga.sh test/interfaces/api/rest/dto/DtoJsonTest.oracle.jsh)
export const WRITES: Record<string, string> = {
  "AlternateTitleDto": "{\"label\":\"fr\",\"title\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\"}",
  "ApiKeyDto": "{\"id\":\"id1\",\"userId\":\"user1\",\"key\":\"key\",\"comment\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"createdDate\":\"2024-03-05T07:08:09.12+02:00\",\"lastModifiedDate\":\"2024-03-05T07:08:00Z\"}",
  "AuthenticationActivityDto.nulls": "{\"userId\":null,\"email\":null,\"apiKeyId\":null,\"apiKeyComment\":null,\"ip\":null,\"userAgent\":null,\"success\":false,\"error\":null,\"dateTime\":\"2024-03-05T07:08:09Z\",\"source\":null}",
  "AuthenticationActivityDto.full": "{\"userId\":\"u\",\"email\":\"a@b.c\",\"apiKeyId\":\"k\",\"apiKeyComment\":\"c\",\"ip\":\"127.0.0.1\",\"userAgent\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"success\":true,\"error\":\"err\",\"dateTime\":\"2024-03-05T07:08:00Z\",\"source\":\"Password\"}",
  "AuthorDto": "{\"name\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"role\":\"writer\"}",
  "MediaDto": "{\"status\":\"READY\",\"mediaType\":\"application/zip\",\"pagesCount\":12,\"comment\":\"\",\"epubDivinaCompatible\":true,\"epubIsKepub\":false,\"mediaProfile\":\"DIVINA\"}",
  "MediaDto.unknown": "{\"status\":\"ERROR\",\"mediaType\":\"application/x-unknown\",\"pagesCount\":0,\"comment\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"epubDivinaCompatible\":false,\"epubIsKepub\":true,\"mediaProfile\":\"\"}",
  "BookMetadataDto": "{\"title\":\"t\",\"titleLock\":true,\"summary\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"summaryLock\":false,\"number\":\"1.5\",\"numberLock\":true,\"numberSort\":1.5,\"numberSortLock\":false,\"releaseDate\":\"2024-03-05\",\"releaseDateLock\":true,\"authors\":[{\"name\":\"n\",\"role\":\"r\"}],\"authorsLock\":false,\"tags\":[\"b\",\"a\"],\"tagsLock\":true,\"isbn\":\"978\",\"isbnLock\":true,\"links\":[{\"label\":\"l\",\"url\":\"https://x/y?z=1\"}],\"linksLock\":false,\"created\":\"2024-03-05T07:08:09Z\",\"lastModified\":\"2024-03-05T07:08:00Z\"}",
  "BookMetadataDto.empty": "{\"title\":\"\",\"titleLock\":false,\"summary\":\"\",\"summaryLock\":false,\"number\":\"\",\"numberLock\":false,\"numberSort\":0.1,\"numberSortLock\":false,\"releaseDate\":null,\"releaseDateLock\":false,\"authors\":[],\"authorsLock\":false,\"tags\":[],\"tagsLock\":false,\"isbn\":\"\",\"isbnLock\":false,\"links\":[],\"linksLock\":false,\"created\":\"2024-03-05T07:08:00Z\",\"lastModified\":\"2024-03-05T07:08:09Z\"}",
  "ReadProgressDto": "{\"page\":3,\"completed\":false,\"readDate\":\"2024-03-05T07:08:09Z\",\"created\":\"2024-03-05T07:08:00Z\",\"lastModified\":\"2024-03-05T07:08:09Z\",\"deviceId\":\"dev\",\"deviceName\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\"}",
  "BookDto": "{\"id\":\"b1\",\"seriesId\":\"s1\",\"seriesTitle\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"libraryId\":\"l1\",\"name\":\"name\",\"url\":\"/a/b/c.cbz\",\"number\":7,\"created\":\"2024-03-05T07:08:09Z\",\"lastModified\":\"2024-03-05T07:08:00Z\",\"fileLastModified\":\"2024-03-05T07:08:09Z\",\"sizeBytes\":2048,\"size\":\"2 KiB\",\"media\":{\"status\":\"READY\",\"mediaType\":\"application/zip\",\"pagesCount\":12,\"comment\":\"\",\"epubDivinaCompatible\":true,\"epubIsKepub\":false,\"mediaProfile\":\"DIVINA\"},\"metadata\":{\"title\":\"t\",\"titleLock\":true,\"summary\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"summaryLock\":false,\"number\":\"1.5\",\"numberLock\":true,\"numberSort\":1.5,\"numberSortLock\":false,\"releaseDate\":\"2024-03-05\",\"releaseDateLock\":true,\"authors\":[{\"name\":\"n\",\"role\":\"r\"}],\"authorsLock\":false,\"tags\":[\"b\",\"a\"],\"tagsLock\":true,\"isbn\":\"978\",\"isbnLock\":true,\"links\":[{\"label\":\"l\",\"url\":\"https://x/y?z=1\"}],\"linksLock\":false,\"created\":\"2024-03-05T07:08:09Z\",\"lastModified\":\"2024-03-05T07:08:00Z\"},\"readProgress\":{\"page\":3,\"completed\":false,\"readDate\":\"2024-03-05T07:08:09Z\",\"created\":\"2024-03-05T07:08:00Z\",\"lastModified\":\"2024-03-05T07:08:09Z\",\"deviceId\":\"dev\",\"deviceName\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\"},\"deleted\":false,\"fileHash\":\"hash\",\"oneshot\":true}",
  "BookDto.noProgress": "{\"id\":\"b2\",\"seriesId\":\"s1\",\"seriesTitle\":\"st\",\"libraryId\":\"l1\",\"name\":\"name\",\"url\":\"c.cbz\",\"number\":0,\"created\":\"2024-03-05T07:08:00Z\",\"lastModified\":\"2024-03-05T07:08:00Z\",\"fileLastModified\":\"2024-03-05T07:08:00Z\",\"sizeBytes\":5000000000,\"size\":\"4,7 GiB\",\"media\":{\"status\":\"ERROR\",\"mediaType\":\"application/x-unknown\",\"pagesCount\":0,\"comment\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"epubDivinaCompatible\":false,\"epubIsKepub\":true,\"mediaProfile\":\"\"},\"metadata\":{\"title\":\"\",\"titleLock\":false,\"summary\":\"\",\"summaryLock\":false,\"number\":\"\",\"numberLock\":false,\"numberSort\":0.1,\"numberSortLock\":false,\"releaseDate\":null,\"releaseDateLock\":false,\"authors\":[],\"authorsLock\":false,\"tags\":[],\"tagsLock\":false,\"isbn\":\"\",\"isbnLock\":false,\"links\":[],\"linksLock\":false,\"created\":\"2024-03-05T07:08:00Z\",\"lastModified\":\"2024-03-05T07:08:09Z\"},\"readProgress\":null,\"deleted\":true,\"fileHash\":\"\",\"oneshot\":false}",
  "BookDto.restrictUrl": "{\"id\":\"b2\",\"seriesId\":\"s1\",\"seriesTitle\":\"st\",\"libraryId\":\"l1\",\"name\":\"name\",\"url\":\"z.cbz\",\"number\":0,\"created\":\"2024-03-05T07:08:00Z\",\"lastModified\":\"2024-03-05T07:08:00Z\",\"fileLastModified\":\"2024-03-05T07:08:00Z\",\"sizeBytes\":512,\"size\":\"512 B\",\"media\":{\"status\":\"ERROR\",\"mediaType\":\"application/x-unknown\",\"pagesCount\":0,\"comment\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"epubDivinaCompatible\":false,\"epubIsKepub\":true,\"mediaProfile\":\"\"},\"metadata\":{\"title\":\"\",\"titleLock\":false,\"summary\":\"\",\"summaryLock\":false,\"number\":\"\",\"numberLock\":false,\"numberSort\":0.1,\"numberSortLock\":false,\"releaseDate\":null,\"releaseDateLock\":false,\"authors\":[],\"authorsLock\":false,\"tags\":[],\"tagsLock\":false,\"isbn\":\"\",\"isbnLock\":false,\"links\":[],\"linksLock\":false,\"created\":\"2024-03-05T07:08:00Z\",\"lastModified\":\"2024-03-05T07:08:09Z\"},\"readProgress\":null,\"deleted\":true,\"fileHash\":\"\",\"oneshot\":false}",
  "BookImportBatchDto": "{\"books\":[{\"sourceFile\":\"/a\",\"seriesId\":\"s\",\"upgradeBookId\":null,\"destinationName\":null},{\"sourceFile\":\"/b\",\"seriesId\":\"s\",\"upgradeBookId\":\"u\",\"destinationName\":\"d\"}],\"copyMode\":\"HARDLINK\"}",
  "ClientSettingDto": "{\"value\":\"v\",\"allowUnauthorized\":true}",
  "ClientSettingDto.null": "{\"value\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\"}",
  "ClientSettingGlobalUpdateDto": "{\"value\":\"v\",\"allowUnauthorized\":false}",
  "ClientSettingUserUpdateDto": "{\"value\":\"v\"}",
  "CollectionCreationDto": "{\"name\":\"n\",\"ordered\":true,\"seriesIds\":[\"a\",\"b\"]}",
  "CollectionDto": "{\"id\":\"c1\",\"name\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"ordered\":false,\"seriesIds\":[],\"createdDate\":\"2024-03-05T07:08:09Z\",\"lastModifiedDate\":\"2024-03-05T07:08:00Z\",\"filtered\":true}",
  "CollectionUpdateDto": "{\"name\":null,\"ordered\":null,\"seriesIds\":null}",
  "GithubReleaseDto": "{\"html_url\":\"https://h\",\"tag_name\":\"1.0.0\",\"published_at\":\"2024-03-05T07:08:09.12+02:00\",\"body\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"prerelease\":false}",
  "GroupCountDto": "{\"group\":\"A\",\"count\":42}",
  "HistoricalEventDto": "{\"id\":\"e1\",\"type\":\"BookFileDeleted\",\"timestamp\":\"2024-03-05T07:08:09.123456789\",\"bookId\":\"b\",\"seriesId\":null,\"properties\":{\"reason\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"name\":\"x\"}}",
  "HistoricalEventDto.empty": "{\"id\":\"e1\",\"type\":\"SeriesFolderDeleted\",\"timestamp\":\"2024-03-05T07:08:00\",\"bookId\":null,\"seriesId\":\"s\",\"properties\":{}}",
  "JsonFeedDto": "{\"version\":\"https://jsonfeed.org/version/1\",\"title\":\"Announcements\",\"home_page_url\":\"https://komga.org/blog\",\"description\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"items\":[{\"id\":\"i1\",\"url\":\"https://u\",\"title\":\"t\",\"summary\":\"s\",\"content_html\":\"<p>x</p>\",\"date_modified\":\"2023-12-15T00:00:00+01:00\",\"author\":{\"name\":\"gotson\",\"url\":null},\"tags\":[\"upgrade\",\"komga\"],\"_komga\":{\"read\":true}},{\"id\":\"i2\",\"url\":null,\"title\":null,\"summary\":null,\"content_html\":null,\"date_modified\":null,\"author\":null,\"tags\":[],\"_komga\":null}]}",
  "JsonFeedDto.ItemDto": "{\"id\":\"i1\",\"url\":\"https://u\",\"title\":\"t\",\"summary\":\"s\",\"content_html\":\"<p>x</p>\",\"date_modified\":\"2023-12-15T00:00:00+01:00\",\"author\":{\"name\":\"gotson\",\"url\":null},\"tags\":[\"upgrade\",\"komga\"],\"_komga\":{\"read\":true}}",
  "LibraryCreationDto": "{\"name\":\"n\",\"root\":\"/r\",\"importComicInfoBook\":true,\"importComicInfoSeries\":false,\"importComicInfoCollection\":true,\"importComicInfoReadList\":false,\"importComicInfoSeriesAppendVolume\":true,\"importEpubBook\":false,\"importEpubSeries\":true,\"importMylarSeries\":false,\"importLocalArtwork\":true,\"importBarcodeIsbn\":false,\"scanForceModifiedTime\":true,\"scanInterval\":\"DAILY\",\"scanOnStartup\":false,\"scanCbx\":true,\"scanPdf\":false,\"scanEpub\":true,\"scanDirectoryExclusions\":[\"#recycle\"],\"repairExtensions\":false,\"convertToCbz\":true,\"emptyTrashAfterScan\":false,\"seriesCover\":\"LAST\",\"hashFiles\":true,\"hashPages\":false,\"hashKoreader\":true,\"analyzeDimensions\":false,\"oneshotsDirectory\":null}",
  "LibraryDto": "{\"id\":\"l1\",\"name\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"root\":\"/root\",\"importComicInfoBook\":true,\"importComicInfoSeries\":false,\"importComicInfoCollection\":true,\"importComicInfoReadList\":false,\"importComicInfoSeriesAppendVolume\":true,\"importEpubBook\":false,\"importEpubSeries\":true,\"importMylarSeries\":false,\"importLocalArtwork\":true,\"importBarcodeIsbn\":false,\"scanForceModifiedTime\":true,\"scanInterval\":\"EVERY_12H\",\"scanOnStartup\":false,\"scanCbx\":true,\"scanPdf\":false,\"scanEpub\":true,\"scanDirectoryExclusions\":[\"#recycle\",\"@eaDir\"],\"repairExtensions\":false,\"convertToCbz\":true,\"emptyTrashAfterScan\":false,\"seriesCover\":\"FIRST_UNREAD_OR_LAST\",\"hashFiles\":true,\"hashPages\":false,\"hashKoreader\":true,\"analyzeDimensions\":false,\"oneshotsDirectory\":\"_oneshots\",\"unavailable\":true}",
  "PageDto": "{\"number\":1,\"fileName\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"mediaType\":\"image/jpeg\",\"width\":800,\"height\":1200,\"sizeBytes\":2048,\"size\":\"2 KiB\"}",
  "PageDto.nulls": "{\"number\":2,\"fileName\":\"p.png\",\"mediaType\":\"image/png\",\"width\":null,\"height\":null,\"sizeBytes\":null,\"size\":\"\"}",
  "PageHashCreationDto": "{\"hash\":\"h\",\"size\":12,\"action\":\"DELETE_AUTO\"}",
  "PageHashKnownDto": "{\"hash\":\"h\",\"size\":null,\"action\":\"IGNORE\",\"deleteCount\":1,\"matchCount\":2,\"created\":\"2024-03-05T07:08:09.123456789\",\"lastModified\":\"2024-03-05T07:08:00\"}",
  "PageHashMatchDto": "{\"bookId\":\"b\",\"url\":\"/a/b.cbz\",\"pageNumber\":3,\"fileName\":\"p.jpg\",\"fileSize\":5000000000,\"mediaType\":\"image/jpeg\"}",
  "PageHashUnknownDto": "{\"hash\":\"h\",\"size\":123,\"matchCount\":4}",
  "PasswordUpdateDto": "{\"password\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\"}",
  "R2Positions": "{\"total\":2,\"positions\":[{\"href\":\"h.xhtml\",\"type\":\"application/xhtml+xml\",\"title\":\"title\",\"locations\":{\"fragments\":[\"f\"],\"progression\":0.1,\"position\":3,\"totalProgression\":1.0}},{\"href\":\"h2\",\"type\":\"t\",\"koboSpan\":\"kobo.1.1\"}]}",
  "R2Positions.empty": "{\"total\":0,\"positions\":[]}",
  "ReadListCreationDto": "{\"name\":\"n\",\"summary\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"ordered\":false,\"bookIds\":[\"a\"]}",
  "ReadListDto": "{\"id\":\"r1\",\"name\":\"n\",\"summary\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"ordered\":true,\"bookIds\":[\"b1\",\"b2\"],\"createdDate\":\"2024-03-05T07:08:09Z\",\"lastModifiedDate\":\"2024-03-05T07:08:00Z\",\"filtered\":false}",
  "ReadListRequestMatchDto": "{\"readListMatch\":{\"name\":\"rl\",\"errorCode\":\"ERR_1\"},\"requests\":[{\"request\":{\"series\":[\"S1\",\"S2\"],\"number\":\"1\"},\"matches\":[{\"series\":{\"seriesId\":\"s\",\"title\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"releaseDate\":\"2024-03-05\"},\"books\":[{\"bookId\":\"b\",\"number\":\"1\",\"title\":\"t\"}]},{\"series\":{\"seriesId\":\"s2\",\"title\":\"t2\",\"releaseDate\":null},\"books\":[]}]},{\"request\":{\"series\":[],\"number\":\"\"},\"matches\":[]}],\"errorCode\":\"\"}",
  "ReadListUpdateDto": "{\"name\":\"n\",\"summary\":null,\"bookIds\":[\"a\"],\"ordered\":true}",
  "ReadProgressUpdateDto": "{\"page\":null,\"completed\":true}",
  "ReleaseDto": "{\"version\":\"1.2.3\",\"releaseDate\":\"2024-03-05T07:08:09.12+02:00\",\"url\":\"https://u\",\"latest\":true,\"preRelease\":false,\"description\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\"}",
  "SeriesMetadataDto": "{\"status\":\"ONGOING\",\"statusLock\":true,\"title\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"titleLock\":false,\"titleSort\":\"ts\",\"titleSortLock\":true,\"summary\":\"sum\",\"summaryLock\":false,\"readingDirection\":\"LEFT_TO_RIGHT\",\"readingDirectionLock\":true,\"publisher\":\"pub\",\"publisherLock\":false,\"ageRating\":16,\"ageRatingLock\":true,\"language\":\"fr\",\"languageLock\":false,\"genres\":[\"g2\",\"g1\"],\"genresLock\":true,\"tags\":[],\"tagsLock\":false,\"totalBookCount\":10,\"totalBookCountLock\":true,\"sharingLabels\":[\"l\"],\"sharingLabelsLock\":false,\"links\":[{\"label\":\"a\",\"url\":\"b\"}],\"linksLock\":true,\"alternateTitles\":[{\"label\":\"jp\",\"title\":\"日本\"}],\"alternateTitlesLock\":false,\"created\":\"2024-03-05T07:08:09Z\",\"lastModified\":\"2024-03-05T07:08:00Z\"}",
  "BookMetadataAggregationDto": "{\"authors\":[{\"name\":\"a\",\"role\":\"b\"}],\"tags\":[\"t1\",\"t2\"],\"releaseDate\":\"2024-03-05\",\"summary\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"summaryNumber\":\"3\",\"created\":\"2024-03-05T07:08:09Z\",\"lastModified\":\"2024-03-05T07:08:00Z\"}",
  "SeriesDto": "{\"id\":\"s1\",\"libraryId\":\"l1\",\"name\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"url\":\"/a/b\",\"created\":\"2024-03-05T07:08:09Z\",\"lastModified\":\"2024-03-05T07:08:00Z\",\"fileLastModified\":\"2024-03-05T07:08:09Z\",\"booksCount\":10,\"booksReadCount\":2,\"booksUnreadCount\":7,\"booksInProgressCount\":1,\"metadata\":{\"status\":\"ONGOING\",\"statusLock\":true,\"title\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"titleLock\":false,\"titleSort\":\"ts\",\"titleSortLock\":true,\"summary\":\"sum\",\"summaryLock\":false,\"readingDirection\":\"LEFT_TO_RIGHT\",\"readingDirectionLock\":true,\"publisher\":\"pub\",\"publisherLock\":false,\"ageRating\":16,\"ageRatingLock\":true,\"language\":\"fr\",\"languageLock\":false,\"genres\":[\"g2\",\"g1\"],\"genresLock\":true,\"tags\":[],\"tagsLock\":false,\"totalBookCount\":10,\"totalBookCountLock\":true,\"sharingLabels\":[\"l\"],\"sharingLabelsLock\":false,\"links\":[{\"label\":\"a\",\"url\":\"b\"}],\"linksLock\":true,\"alternateTitles\":[{\"label\":\"jp\",\"title\":\"日本\"}],\"alternateTitlesLock\":false,\"created\":\"2024-03-05T07:08:09Z\",\"lastModified\":\"2024-03-05T07:08:00Z\"},\"booksMetadata\":{\"authors\":[{\"name\":\"a\",\"role\":\"b\"}],\"tags\":[\"t1\",\"t2\"],\"releaseDate\":\"2024-03-05\",\"summary\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"summaryNumber\":\"3\",\"created\":\"2024-03-05T07:08:09Z\",\"lastModified\":\"2024-03-05T07:08:00Z\"},\"deleted\":false,\"oneshot\":true}",
  "SeriesDto.empty": "{\"id\":\"s2\",\"libraryId\":\"l1\",\"name\":\"n\",\"url\":\"\",\"created\":\"2024-03-05T07:08:00Z\",\"lastModified\":\"2024-03-05T07:08:00Z\",\"fileLastModified\":\"2024-03-05T07:08:00Z\",\"booksCount\":0,\"booksReadCount\":0,\"booksUnreadCount\":0,\"booksInProgressCount\":0,\"metadata\":{\"status\":\"ENDED\",\"statusLock\":false,\"title\":\"\",\"titleLock\":false,\"titleSort\":\"\",\"titleSortLock\":false,\"summary\":\"\",\"summaryLock\":false,\"readingDirection\":\"\",\"readingDirectionLock\":false,\"publisher\":\"\",\"publisherLock\":false,\"ageRating\":null,\"ageRatingLock\":false,\"language\":\"\",\"languageLock\":false,\"genres\":[],\"genresLock\":false,\"tags\":[],\"tagsLock\":false,\"totalBookCount\":null,\"totalBookCountLock\":false,\"sharingLabels\":[],\"sharingLabelsLock\":false,\"links\":[],\"linksLock\":false,\"alternateTitles\":[],\"alternateTitlesLock\":false,\"created\":\"2024-03-05T07:08:00Z\",\"lastModified\":\"2024-03-05T07:08:00Z\"},\"booksMetadata\":{\"authors\":[],\"tags\":[],\"releaseDate\":null,\"summary\":\"\",\"summaryNumber\":\"\",\"created\":\"2024-03-05T07:08:00Z\",\"lastModified\":\"2024-03-05T07:08:00Z\"},\"deleted\":true,\"oneshot\":false}",
  "SettingsDto": "{\"deleteEmptyCollections\":true,\"deleteEmptyReadLists\":false,\"rememberMeDurationDays\":365,\"thumbnailSize\":\"LARGE\",\"taskPoolSize\":4,\"serverPort\":{\"configurationSource\":25600,\"databaseSource\":null,\"effectiveValue\":25600},\"serverContextPath\":{\"configurationSource\":null,\"databaseSource\":\"/komga\",\"effectiveValue\":\"/komga\"},\"koboProxy\":false,\"koboPort\":8080,\"kepubifyPath\":{\"configurationSource\":null,\"databaseSource\":null,\"effectiveValue\":null},\"maxUploadFileSizeBytes\":5000000000}",
  "SettingsDto.empty": "{}",
  "SettingsDto.public": "{\"maxUploadFileSizeBytes\":1024}",
  "TachiyomiReadProgressDto": "{\"booksCount\":10,\"booksReadCount\":2,\"booksUnreadCount\":7,\"booksInProgressCount\":1,\"lastReadContinuousIndex\":3}",
  "TachiyomiReadProgressUpdateDto": "{\"lastBookRead\":5}",
  "TachiyomiReadProgressUpdateV2Dto": "{\"lastBookNumberSortRead\":0.1}",
  "TachiyomiReadProgressV2Dto": "{\"booksCount\":10,\"booksReadCount\":2,\"booksUnreadCount\":7,\"booksInProgressCount\":1,\"lastReadContinuousNumberSort\":3.0,\"maxNumberSort\":12.3}",
  "ThumbnailBookDto": "{\"id\":\"t\",\"bookId\":\"b\",\"type\":\"GENERATED\",\"selected\":true,\"mediaType\":\"image/jpeg\",\"fileSize\":5000000000,\"width\":300,\"height\":400}",
  "ThumbnailReadListDto": "{\"id\":\"t\",\"readListId\":\"r\",\"type\":\"USER_UPLOADED\",\"selected\":false,\"mediaType\":\"image/png\",\"fileSize\":12,\"width\":0,\"height\":0}",
  "ThumbnailSeriesCollectionDto": "{\"id\":\"t\",\"collectionId\":\"c\",\"type\":\"USER_UPLOADED\",\"selected\":false,\"mediaType\":\"image/png\",\"fileSize\":12,\"width\":1,\"height\":2}",
  "ThumbnailSeriesDto": "{\"id\":\"t\",\"seriesId\":\"s\",\"type\":\"SIDECAR\",\"selected\":true,\"mediaType\":\"image/webp\",\"fileSize\":12,\"width\":1,\"height\":2}",
  "UserCreationDto": "{\"email\":\"a@b.c\",\"password\":\"p\",\"roles\":[\"ADMIN\"],\"ageRestriction\":{\"age\":12,\"restriction\":\"NONE\"},\"labelsAllow\":null,\"labelsExclude\":[\"x\"],\"sharedLibraries\":{\"all\":false,\"libraryIds\":[\"l\"]}}",
  "UserDto": "{\"id\":\"u\",\"email\":\"a@b.c\",\"roles\":[\"ADMIN\",\"USER\"],\"sharedAllLibraries\":false,\"sharedLibrariesIds\":[\"l1\",\"l2\"],\"labelsAllow\":[],\"labelsExclude\":[\"x\"],\"ageRestriction\":{\"age\":16,\"restriction\":\"EXCLUDE\"}}",
  "UserDto.noAge": "{\"id\":\"u\",\"email\":\"a@b.c\",\"roles\":[\"USER\"],\"sharedAllLibraries\":true,\"sharedLibrariesIds\":[],\"labelsAllow\":[],\"labelsExclude\":[]}",
  "AgeRestrictionUpdateDto": "{\"age\":3,\"restriction\":\"ALLOW_ONLY\"}",
  "SharedLibrariesUpdateDto": "{\"all\":true,\"libraryIds\":[]}",
  "WebLinkDto": "{\"label\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"url\":\"https://a/b\"}",
  "AmountDto": "{\"CurrencyCode\":\"USD\",\"TotalAmount\":0}",
  "AmountDto.null": "{\"TotalAmount\":5}",
  "AuthDto": "{\"AccessToken\":\"a\",\"RefreshToken\":\"r\",\"TokenType\":\"Bearer\",\"TrackingId\":\"t\",\"UserKey\":\"u\"}",
  "BookEntitlementContainerDto": "{\"BookEntitlement\":{\"Accessibility\":\"Full\",\"ActivePeriod\":{\"From\":\"2024-03-05T07:08:00Z\"},\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"CrossRevisionId\":\"c\",\"Id\":\"i\",\"IsHiddenFromArchive\":false,\"IsLocked\":false,\"IsRemoved\":true,\"LastModified\":\"2024-03-05T07:08:00Z\",\"OriginCategory\":\"Imported\",\"RevisionId\":\"r\",\"Status\":\"Active\"},\"BookMetadata\":{\"Categories\":[\"00000000-0000-0000-0000-000000000001\"],\"ContributorRoles\":[{\"Name\":\"a\"}],\"Contributors\":[\"a\"],\"CoverImageId\":\"cover\",\"CrossRevisionId\":\"c\",\"CurrentDisplayPrice\":{\"CurrencyCode\":\"USD\",\"TotalAmount\":0},\"CurrentLoveDisplayPrice\":{\"TotalAmount\":0},\"Description\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"DownloadUrls\":[{\"DrmType\":\"None\",\"Format\":\"KEPUB\",\"Size\":5000000000,\"Platform\":\"Generic\",\"Url\":\"https://u\"}],\"EntitlementId\":\"e\",\"ExternalIds\":[],\"Genre\":\"00000000-0000-0000-0000-000000000001\",\"IsEligibleForKoboLove\":false,\"IsInternetArchive\":false,\"IsPreOrder\":false,\"IsSocialEnabled\":true,\"Isbn\":\"978\",\"Language\":\"en\",\"PhoneticPronunciations\":{\"a\":\"b\"},\"PublicationDate\":\"2024-03-05T07:08:09.12+02:00\",\"Publisher\":{\"Imprint\":\"\",\"Name\":\"pub\"},\"RevisionId\":\"r\",\"Series\":{\"Id\":\"s\",\"Name\":\"n\",\"Number\":\"1.5\",\"NumberFloat\":1.5},\"Slug\":\"slug\",\"Title\":\"title\",\"WorkId\":\"w\"},\"ReadingState\":{\"Created\":\"2024-03-05T07:08:00Z\",\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"ProgressPercent\":33.333332,\"ContentSourceProgressPercent\":0.1,\"Location\":{\"Value\":\"kobo.1.1\",\"Type\":\"KoboSpan\",\"Source\":\"c.xhtml\"}},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"PriorityTimestamp\":\"2024-03-05T07:08:09.12+02:00\",\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"RemainingTimeMinutes\":10},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"Status\":\"ReadyToRead\",\"TimesStartedReading\":1,\"LastTimeFinished\":\"2024-03-05T07:08:00Z\"}}}",
  "BookEntitlementContainerDto.noState": "{\"BookEntitlement\":{\"Accessibility\":\"Full\",\"ActivePeriod\":{\"From\":\"2024-03-05T07:08:00Z\"},\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"CrossRevisionId\":\"c\",\"Id\":\"i\",\"IsHiddenFromArchive\":false,\"IsLocked\":false,\"IsRemoved\":true,\"LastModified\":\"2024-03-05T07:08:00Z\",\"OriginCategory\":\"Imported\",\"RevisionId\":\"r\",\"Status\":\"Active\"},\"BookMetadata\":{\"Categories\":[],\"ContributorRoles\":[],\"Contributors\":[],\"CrossRevisionId\":\"c\",\"CurrentDisplayPrice\":{\"CurrencyCode\":\"USD\",\"TotalAmount\":0},\"CurrentLoveDisplayPrice\":{\"TotalAmount\":0},\"DownloadUrls\":[],\"EntitlementId\":\"e\",\"ExternalIds\":[],\"Genre\":\"\",\"IsEligibleForKoboLove\":false,\"IsInternetArchive\":false,\"IsPreOrder\":false,\"IsSocialEnabled\":true,\"Language\":\"en\",\"PhoneticPronunciations\":{},\"RevisionId\":\"r\",\"Title\":\"title\",\"WorkId\":\"w\"},\"ReadingState\":null}",
  "BookEntitlementDto": "{\"Accessibility\":\"Full\",\"ActivePeriod\":{\"From\":\"2024-03-05T07:08:00Z\"},\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"CrossRevisionId\":\"c\",\"Id\":\"i\",\"IsHiddenFromArchive\":false,\"IsLocked\":false,\"IsRemoved\":true,\"LastModified\":\"2024-03-05T07:08:00Z\",\"OriginCategory\":\"Imported\",\"RevisionId\":\"r\",\"Status\":\"Active\"}",
  "BookmarkDto": "{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"ProgressPercent\":33.333332,\"ContentSourceProgressPercent\":0.1,\"Location\":{\"Value\":\"kobo.1.1\",\"Type\":\"KoboSpan\",\"Source\":\"c.xhtml\"}}",
  "BookmarkDto.nulls": "{\"LastModified\":\"2024-03-05T07:08:00Z\"}",
  "ContributorDto": "{\"Name\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\"}",
  "DownloadUrlDto": "{\"DrmType\":\"None\",\"Format\":\"EPUB3FL\",\"Size\":1,\"Platform\":\"Android\",\"Url\":\"u\"}",
  "KoboBookMetadataDto": "{\"Categories\":[\"00000000-0000-0000-0000-000000000001\"],\"ContributorRoles\":[{\"Name\":\"a\"}],\"Contributors\":[\"a\"],\"CoverImageId\":\"cover\",\"CrossRevisionId\":\"c\",\"CurrentDisplayPrice\":{\"CurrencyCode\":\"USD\",\"TotalAmount\":0},\"CurrentLoveDisplayPrice\":{\"TotalAmount\":0},\"Description\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"DownloadUrls\":[{\"DrmType\":\"None\",\"Format\":\"KEPUB\",\"Size\":5000000000,\"Platform\":\"Generic\",\"Url\":\"https://u\"}],\"EntitlementId\":\"e\",\"ExternalIds\":[],\"Genre\":\"00000000-0000-0000-0000-000000000001\",\"IsEligibleForKoboLove\":false,\"IsInternetArchive\":false,\"IsPreOrder\":false,\"IsSocialEnabled\":true,\"Isbn\":\"978\",\"Language\":\"en\",\"PhoneticPronunciations\":{\"a\":\"b\"},\"PublicationDate\":\"2024-03-05T07:08:09.12+02:00\",\"Publisher\":{\"Imprint\":\"\",\"Name\":\"pub\"},\"RevisionId\":\"r\",\"Series\":{\"Id\":\"s\",\"Name\":\"n\",\"Number\":\"1.5\",\"NumberFloat\":1.5},\"Slug\":\"slug\",\"Title\":\"title\",\"WorkId\":\"w\"}",
  "KoboBookMetadataDto.min": "{\"Categories\":[],\"ContributorRoles\":[],\"Contributors\":[],\"CrossRevisionId\":\"c\",\"CurrentDisplayPrice\":{\"CurrencyCode\":\"USD\",\"TotalAmount\":0},\"CurrentLoveDisplayPrice\":{\"TotalAmount\":0},\"DownloadUrls\":[],\"EntitlementId\":\"e\",\"ExternalIds\":[],\"Genre\":\"\",\"IsEligibleForKoboLove\":false,\"IsInternetArchive\":false,\"IsPreOrder\":false,\"IsSocialEnabled\":true,\"Language\":\"en\",\"PhoneticPronunciations\":{},\"RevisionId\":\"r\",\"Title\":\"title\",\"WorkId\":\"w\"}",
  "KoboSeriesDto": "{\"Id\":\"s\",\"Name\":\"n\",\"Number\":\"1\",\"NumberFloat\":0.1}",
  "LocationDto": "{\"Value\":null,\"Type\":null,\"Source\":\"s\"}",
  "LocationDto.default": "{\"Value\":null,\"Type\":\"KoboSpan\",\"Source\":\"s\"}",
  "PeriodDto": "{\"From\":\"2024-03-05T07:08:09.12+02:00\"}",
  "PublisherDto": "{\"Imprint\":\"imp\",\"Name\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\"}",
  "ReadingStateDto": "{\"Created\":\"2024-03-05T07:08:00Z\",\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"ProgressPercent\":33.333332,\"ContentSourceProgressPercent\":0.1,\"Location\":{\"Value\":\"kobo.1.1\",\"Type\":\"KoboSpan\",\"Source\":\"c.xhtml\"}},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"PriorityTimestamp\":\"2024-03-05T07:08:09.12+02:00\",\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"RemainingTimeMinutes\":10},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"Status\":\"ReadyToRead\",\"TimesStartedReading\":1,\"LastTimeFinished\":\"2024-03-05T07:08:00Z\"}}",
  "ReadingStateDto.min": "{\"Created\":null,\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:00Z\"},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"PriorityTimestamp\":null,\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:00Z\"},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:00Z\",\"Status\":\"Finished\"}}",
  "WrappedReadingStateDto": "{\"ReadingState\":{\"Created\":null,\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:00Z\"},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"PriorityTimestamp\":null,\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:00Z\"},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:00Z\",\"Status\":\"Finished\"}}}",
  "ReadingStateStateUpdateDto": "{\"ReadingStates\":[{\"Created\":\"2024-03-05T07:08:00Z\",\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"ProgressPercent\":33.333332,\"ContentSourceProgressPercent\":0.1,\"Location\":{\"Value\":\"kobo.1.1\",\"Type\":\"KoboSpan\",\"Source\":\"c.xhtml\"}},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"PriorityTimestamp\":\"2024-03-05T07:08:09.12+02:00\",\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"RemainingTimeMinutes\":10},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"Status\":\"ReadyToRead\",\"TimesStartedReading\":1,\"LastTimeFinished\":\"2024-03-05T07:08:00Z\"}},{\"Created\":null,\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:00Z\"},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"PriorityTimestamp\":null,\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:00Z\"},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:00Z\",\"Status\":\"Finished\"}}]}",
  "RequestResultDto": "{\"RequestResult\":\"Success\",\"UpdateResults\":[{\"EntitlementId\":\"e\",\"CurrentBookmarkResult\":{\"Result\":\"Success\"},\"StatisticsResult\":{\"Result\":\"Failure\"},\"StatusInfoResult\":{\"Result\":\"Ignored\"}}]}",
  "RequestResultDto.empty": "{\"RequestResult\":\"Ignored\",\"UpdateResults\":[]}",
  "ReadingStateUpdateResultDto": "{\"EntitlementId\":\"e\",\"CurrentBookmarkResult\":{\"Result\":\"Success\"},\"StatisticsResult\":{\"Result\":\"Failure\"},\"StatusInfoResult\":{\"Result\":\"Ignored\"}}",
  "WrappedResultDto": "{\"Result\":\"Failure\"}",
  "ResourcesDto": "{\"Resources\":{\"a\":1,\"b\":[1.5,\"x\",null,true],\"c\":{\"d\":1.0E10}}}",
  "StatisticsDto": "{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"RemainingTimeMinutes\":1,\"SpentReadingMinutes\":2}",
  "StatusInfoDto": "{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"Status\":\"Reading\",\"TimesStartedReading\":2,\"LastTimeFinished\":\"2024-03-05T07:08:09.12+02:00\",\"LastTimeStartedReading\":\"2024-03-05T07:08:00Z\"}",
  "NewEntitlementDto": "{\"NewEntitlement\":{\"BookEntitlement\":{\"Accessibility\":\"Full\",\"ActivePeriod\":{\"From\":\"2024-03-05T07:08:00Z\"},\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"CrossRevisionId\":\"c\",\"Id\":\"i\",\"IsHiddenFromArchive\":false,\"IsLocked\":false,\"IsRemoved\":true,\"LastModified\":\"2024-03-05T07:08:00Z\",\"OriginCategory\":\"Imported\",\"RevisionId\":\"r\",\"Status\":\"Active\"},\"BookMetadata\":{\"Categories\":[\"00000000-0000-0000-0000-000000000001\"],\"ContributorRoles\":[{\"Name\":\"a\"}],\"Contributors\":[\"a\"],\"CoverImageId\":\"cover\",\"CrossRevisionId\":\"c\",\"CurrentDisplayPrice\":{\"CurrencyCode\":\"USD\",\"TotalAmount\":0},\"CurrentLoveDisplayPrice\":{\"TotalAmount\":0},\"Description\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"DownloadUrls\":[{\"DrmType\":\"None\",\"Format\":\"KEPUB\",\"Size\":5000000000,\"Platform\":\"Generic\",\"Url\":\"https://u\"}],\"EntitlementId\":\"e\",\"ExternalIds\":[],\"Genre\":\"00000000-0000-0000-0000-000000000001\",\"IsEligibleForKoboLove\":false,\"IsInternetArchive\":false,\"IsPreOrder\":false,\"IsSocialEnabled\":true,\"Isbn\":\"978\",\"Language\":\"en\",\"PhoneticPronunciations\":{\"a\":\"b\"},\"PublicationDate\":\"2024-03-05T07:08:09.12+02:00\",\"Publisher\":{\"Imprint\":\"\",\"Name\":\"pub\"},\"RevisionId\":\"r\",\"Series\":{\"Id\":\"s\",\"Name\":\"n\",\"Number\":\"1.5\",\"NumberFloat\":1.5},\"Slug\":\"slug\",\"Title\":\"title\",\"WorkId\":\"w\"},\"ReadingState\":{\"Created\":\"2024-03-05T07:08:00Z\",\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"ProgressPercent\":33.333332,\"ContentSourceProgressPercent\":0.1,\"Location\":{\"Value\":\"kobo.1.1\",\"Type\":\"KoboSpan\",\"Source\":\"c.xhtml\"}},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"PriorityTimestamp\":\"2024-03-05T07:08:09.12+02:00\",\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"RemainingTimeMinutes\":10},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"Status\":\"ReadyToRead\",\"TimesStartedReading\":1,\"LastTimeFinished\":\"2024-03-05T07:08:00Z\"}}}}",
  "ChangedEntitlementDto": "{\"ChangedEntitlement\":{\"BookEntitlement\":{\"Accessibility\":\"Full\",\"ActivePeriod\":{\"From\":\"2024-03-05T07:08:00Z\"},\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"CrossRevisionId\":\"c\",\"Id\":\"i\",\"IsHiddenFromArchive\":false,\"IsLocked\":false,\"IsRemoved\":true,\"LastModified\":\"2024-03-05T07:08:00Z\",\"OriginCategory\":\"Imported\",\"RevisionId\":\"r\",\"Status\":\"Active\"},\"BookMetadata\":{\"Categories\":[],\"ContributorRoles\":[],\"Contributors\":[],\"CrossRevisionId\":\"c\",\"CurrentDisplayPrice\":{\"CurrencyCode\":\"USD\",\"TotalAmount\":0},\"CurrentLoveDisplayPrice\":{\"TotalAmount\":0},\"DownloadUrls\":[],\"EntitlementId\":\"e\",\"ExternalIds\":[],\"Genre\":\"\",\"IsEligibleForKoboLove\":false,\"IsInternetArchive\":false,\"IsPreOrder\":false,\"IsSocialEnabled\":true,\"Language\":\"en\",\"PhoneticPronunciations\":{},\"RevisionId\":\"r\",\"Title\":\"title\",\"WorkId\":\"w\"},\"ReadingState\":null}}",
  "ChangedProductMetadataDto": "{\"ChangedProductMetadata\":{\"Categories\":[],\"ContributorRoles\":[],\"Contributors\":[],\"CrossRevisionId\":\"c\",\"CurrentDisplayPrice\":{\"CurrencyCode\":\"USD\",\"TotalAmount\":0},\"CurrentLoveDisplayPrice\":{\"TotalAmount\":0},\"DownloadUrls\":[],\"EntitlementId\":\"e\",\"ExternalIds\":[],\"Genre\":\"\",\"IsEligibleForKoboLove\":false,\"IsInternetArchive\":false,\"IsPreOrder\":false,\"IsSocialEnabled\":true,\"Language\":\"en\",\"PhoneticPronunciations\":{},\"RevisionId\":\"r\",\"Title\":\"title\",\"WorkId\":\"w\"}}",
  "NewTagDto": "{\"NewTag\":{\"Tag\":{\"Id\":\"t\",\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"Name\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"Type\":\"UserTag\",\"Items\":[{\"RevisionId\":\"r\",\"Type\":\"ProductRevisionTagItem\"}]}}}",
  "ChangedTagDto": "{\"ChangedTag\":{\"Tag\":{\"Id\":\"t\",\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"Name\":\"n\",\"Type\":\"SystemTag\",\"Items\":null}}}",
  "DeletedTagDto": "{\"DeletedTag\":{\"Tag\":{\"Id\":\"t\",\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"Name\":\"n\",\"Type\":\"SystemTag\",\"Items\":null}}}",
  "ChangedReadingStateDto": "{\"ChangedReadingState\":{\"ReadingState\":{\"Created\":\"2024-03-05T07:08:00Z\",\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"ProgressPercent\":33.333332,\"ContentSourceProgressPercent\":0.1,\"Location\":{\"Value\":\"kobo.1.1\",\"Type\":\"KoboSpan\",\"Source\":\"c.xhtml\"}},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"PriorityTimestamp\":\"2024-03-05T07:08:09.12+02:00\",\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"RemainingTimeMinutes\":10},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"Status\":\"ReadyToRead\",\"TimesStartedReading\":1,\"LastTimeFinished\":\"2024-03-05T07:08:00Z\"}}}}",
  "SyncResultList": "[{\"NewEntitlement\":{\"BookEntitlement\":{\"Accessibility\":\"Full\",\"ActivePeriod\":{\"From\":\"2024-03-05T07:08:00Z\"},\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"CrossRevisionId\":\"c\",\"Id\":\"i\",\"IsHiddenFromArchive\":false,\"IsLocked\":false,\"IsRemoved\":true,\"LastModified\":\"2024-03-05T07:08:00Z\",\"OriginCategory\":\"Imported\",\"RevisionId\":\"r\",\"Status\":\"Active\"},\"BookMetadata\":{\"Categories\":[\"00000000-0000-0000-0000-000000000001\"],\"ContributorRoles\":[{\"Name\":\"a\"}],\"Contributors\":[\"a\"],\"CoverImageId\":\"cover\",\"CrossRevisionId\":\"c\",\"CurrentDisplayPrice\":{\"CurrencyCode\":\"USD\",\"TotalAmount\":0},\"CurrentLoveDisplayPrice\":{\"TotalAmount\":0},\"Description\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"DownloadUrls\":[{\"DrmType\":\"None\",\"Format\":\"KEPUB\",\"Size\":5000000000,\"Platform\":\"Generic\",\"Url\":\"https://u\"}],\"EntitlementId\":\"e\",\"ExternalIds\":[],\"Genre\":\"00000000-0000-0000-0000-000000000001\",\"IsEligibleForKoboLove\":false,\"IsInternetArchive\":false,\"IsPreOrder\":false,\"IsSocialEnabled\":true,\"Isbn\":\"978\",\"Language\":\"en\",\"PhoneticPronunciations\":{\"a\":\"b\"},\"PublicationDate\":\"2024-03-05T07:08:09.12+02:00\",\"Publisher\":{\"Imprint\":\"\",\"Name\":\"pub\"},\"RevisionId\":\"r\",\"Series\":{\"Id\":\"s\",\"Name\":\"n\",\"Number\":\"1.5\",\"NumberFloat\":1.5},\"Slug\":\"slug\",\"Title\":\"title\",\"WorkId\":\"w\"},\"ReadingState\":{\"Created\":\"2024-03-05T07:08:00Z\",\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"ProgressPercent\":33.333332,\"ContentSourceProgressPercent\":0.1,\"Location\":{\"Value\":\"kobo.1.1\",\"Type\":\"KoboSpan\",\"Source\":\"c.xhtml\"}},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"PriorityTimestamp\":\"2024-03-05T07:08:09.12+02:00\",\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"RemainingTimeMinutes\":10},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:09.12+02:00\",\"Status\":\"ReadyToRead\",\"TimesStartedReading\":1,\"LastTimeFinished\":\"2024-03-05T07:08:00Z\"}}}},{\"NewTag\":{\"Tag\":{\"Id\":\"t\",\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"Name\":\"n\",\"Type\":\"SystemTag\",\"Items\":null}}}]",
  "TagDto": "{\"Id\":\"t\",\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"Name\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"Type\":\"UserTag\",\"Items\":[{\"RevisionId\":\"r\",\"Type\":\"ProductRevisionTagItem\"}]}",
  "WrappedTagDto": "{\"Tag\":{\"Id\":\"t\",\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"Name\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\",\"Type\":\"UserTag\",\"Items\":[{\"RevisionId\":\"r\",\"Type\":\"ProductRevisionTagItem\"}]}}",
  "TagItemDto": "{\"RevisionId\":\"r\",\"Type\":\"x\"}",
  "TestsDto": "{\"Result\":\"Success\",\"TestKey\":\"k\",\"Tests\":{\"t\":\"v\"}}",
  "TestsDto.empty": "{\"Result\":\"Success\",\"TestKey\":\"k\",\"Tests\":{}}",
  "FormatDto": "\"EPUB3\"",
  "ResultDto": "\"Success\"",
  "StatusDto": "\"ReadyToRead\"",
  "TagTypeDto": "\"SystemTag\""
}

export const READS: Record<string, string> = {
  "AlternateTitleDto": "{\"label\":\"l\",\"title\":\"t\"}",
  "ApiKeyRequestDto": "{\"comment\":\"c\"}",
  "ApiKeyRequestDto.missing": "ERR KotlinInvalidNullException",
  "ApiKeyRequestDto.null": "ERR KotlinInvalidNullException",
  "BookImportBatchDto": "ERR InvalidFormatException",
  "BookImportBatchDto.enumCase": "{\"books\":[{\"sourceFile\":\"/a\",\"seriesId\":\"s\",\"upgradeBookId\":null,\"destinationName\":null},{\"sourceFile\":\"/b\",\"seriesId\":\"s\",\"upgradeBookId\":\"u\",\"destinationName\":null}],\"copyMode\":\"MOVE\"}",
  "BookImportBatchDto.default": "{\"books\":[],\"copyMode\":\"COPY\"}",
  "BookImportBatchDto.badEnum": "ERR InvalidFormatException",
  "ClientSettingGlobalUpdateDto": "{\"value\":\"v\",\"allowUnauthorized\":true}",
  "ClientSettingGlobalUpdateDto.nullPrimitive": "ERR MismatchedInputException",
  "ClientSettingUserUpdateDto": "{\"value\":\"v\"}",
  "CollectionCreationDto": "{\"name\":\"n\",\"ordered\":false,\"seriesIds\":[\"a\",\"a\"]}",
  "CollectionUpdateDto": "{\"name\":\"n\",\"ordered\":null,\"seriesIds\":null}",
  "CollectionUpdateDto.empty": "{\"name\":null,\"ordered\":null,\"seriesIds\":null}",
  "GithubReleaseDto": "{\"html_url\":\"https://github.com/gotson/komga/releases/tag/1.0.0\",\"tag_name\":\"1.0.0\",\"published_at\":\"2024-03-05T05:08:09Z\",\"body\":\"b\",\"prerelease\":false}",
  "JsonFeedDto": "{\"version\":\"https://jsonfeed.org/version/1\",\"title\":\"Announcements\",\"home_page_url\":\"https://komga.org/blog\",\"description\":\"d\",\"items\":[{\"id\":\"i\",\"url\":\"u\",\"title\":\"t\",\"summary\":\"s\",\"content_html\":\"<p>x</p>\",\"date_modified\":\"2023-12-14T23:00:00Z\",\"author\":{\"name\":\"gotson\",\"url\":\"https://github.com/gotson\"},\"tags\":[\"upgrade\",\"komga\"],\"_komga\":{\"read\":true}},{\"id\":\"i2\",\"url\":null,\"title\":null,\"summary\":null,\"content_html\":null,\"date_modified\":null,\"author\":null,\"tags\":[],\"_komga\":null}]}",
  "JsonFeedDto.minimal": "{\"version\":\"v\",\"title\":\"t\",\"home_page_url\":null,\"description\":null,\"items\":[]}",
  "LibraryCreationDto": "{\"name\":\"n\",\"root\":\"/r\",\"importComicInfoBook\":true,\"importComicInfoSeries\":true,\"importComicInfoCollection\":true,\"importComicInfoReadList\":true,\"importComicInfoSeriesAppendVolume\":true,\"importEpubBook\":true,\"importEpubSeries\":true,\"importMylarSeries\":true,\"importLocalArtwork\":true,\"importBarcodeIsbn\":true,\"scanForceModifiedTime\":false,\"scanInterval\":\"EVERY_6H\",\"scanOnStartup\":false,\"scanCbx\":true,\"scanPdf\":true,\"scanEpub\":true,\"scanDirectoryExclusions\":[],\"repairExtensions\":false,\"convertToCbz\":false,\"emptyTrashAfterScan\":false,\"seriesCover\":\"FIRST\",\"hashFiles\":true,\"hashPages\":false,\"hashKoreader\":false,\"analyzeDimensions\":true,\"oneshotsDirectory\":null}",
  "LibraryCreationDto.full": "ERR InvalidFormatException",
  "LibraryCreationDto.full.enumCase": "{\"name\":\"n\",\"root\":\"/r\",\"importComicInfoBook\":false,\"importComicInfoSeries\":true,\"importComicInfoCollection\":true,\"importComicInfoReadList\":true,\"importComicInfoSeriesAppendVolume\":true,\"importEpubBook\":true,\"importEpubSeries\":true,\"importMylarSeries\":true,\"importLocalArtwork\":true,\"importBarcodeIsbn\":true,\"scanForceModifiedTime\":false,\"scanInterval\":\"WEEKLY\",\"scanOnStartup\":false,\"scanCbx\":true,\"scanPdf\":true,\"scanEpub\":true,\"scanDirectoryExclusions\":[\"a\"],\"repairExtensions\":false,\"convertToCbz\":false,\"emptyTrashAfterScan\":false,\"seriesCover\":\"FIRST_UNREAD_OR_FIRST\",\"hashFiles\":true,\"hashPages\":false,\"hashKoreader\":true,\"analyzeDimensions\":true,\"oneshotsDirectory\":\"o\"}",
  "LibraryCreationDto.missing": "ERR KotlinInvalidNullException",
  "PageHashCreationDto": "{\"hash\":\"h\",\"size\":null,\"action\":\"DELETE_MANUAL\"}",
  "PageHashCreationDto.size": "{\"hash\":\"h\",\"size\":5000000000,\"action\":\"IGNORE\"}",
  "PasswordUpdateDto": "{\"password\":\"p\"}",
  "ReadListCreationDto": "{\"name\":\"n\",\"summary\":\"\",\"ordered\":true,\"bookIds\":[\"a\"]}",
  "ReadListUpdateDto": "{\"name\":null,\"summary\":\"s\",\"bookIds\":null,\"ordered\":false}",
  "ReadProgressUpdateDto": "{\"page\":3,\"completed\":null}",
  "ReadProgressUpdateDto.completed": "{\"page\":null,\"completed\":true}",
  "TachiyomiReadProgressUpdateDto": "{\"lastBookRead\":4}",
  "TachiyomiReadProgressUpdateV2Dto": "{\"lastBookNumberSortRead\":0.3}",
  "TachiyomiReadProgressUpdateV2Dto.int": "{\"lastBookNumberSortRead\":3.0}",
  "UserCreationDto": "{\"email\":\"a@b.c\",\"password\":\"p\",\"roles\":[],\"ageRestriction\":null,\"labelsAllow\":null,\"labelsExclude\":null,\"sharedLibraries\":null}",
  "UserCreationDto.full": "{\"email\":\"a@b.c\",\"password\":\"p\",\"roles\":[\"ADMIN\"],\"ageRestriction\":{\"age\":12,\"restriction\":\"ALLOW_ONLY\"},\"labelsAllow\":[\"a\"],\"labelsExclude\":[],\"sharedLibraries\":{\"all\":false,\"libraryIds\":[\"l\"]}}",
  "ReadingStateStateUpdateDto": "{\"ReadingStates\":[{\"Created\":null,\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:09Z\",\"ProgressPercent\":33.3,\"ContentSourceProgressPercent\":0.0,\"Location\":{\"Value\":\"kobo.1.1\",\"Type\":\"KoboSpan\",\"Source\":\"c.xhtml\"}},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T05:08:09.123Z\",\"PriorityTimestamp\":\"2024-03-05T07:08:09Z\",\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:09Z\",\"RemainingTimeMinutes\":1,\"SpentReadingMinutes\":5},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:09Z\",\"Status\":\"Reading\",\"TimesStartedReading\":1,\"LastTimeStartedReading\":\"2024-03-05T07:08:09Z\"}}]}",
  "ReadingStateStateUpdateDto.lowercase": "ERR InvalidFormatException",
  "ReadingStateStateUpdateDto.lowercaseProps": "{\"ReadingStates\":[{\"Created\":null,\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:09Z\"},\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:09Z\",\"PriorityTimestamp\":null,\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:09Z\"},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:09Z\",\"Status\":\"Finished\"}}]}",
  "ReadingStateStateUpdateDto.badStatus": "ERR InvalidFormatException",
  "ReadingStateStateUpdateDto.empty": "{\"ReadingStates\":[]}",
  "TagDto": "{\"Id\":\"t\",\"Created\":\"2024-03-05T07:08:09Z\",\"LastModified\":\"2024-03-05T07:08:09Z\",\"Name\":\"n\",\"Type\":\"UserTag\",\"Items\":[{\"RevisionId\":\"r\",\"Type\":\"ProductRevisionTagItem\"}]}",
  "WrappedResultDto": "ERR InvalidFormatException",
  "WrappedResultDto.exact": "{\"Result\":\"Success\"}",
  "AuthDto": "{\"AccessToken\":\"a\",\"RefreshToken\":\"r\",\"TokenType\":\"Bearer\",\"TrackingId\":\"t\",\"UserKey\":\"u\"}"
}

export const BEANS: Record<string, [string, string]> = {
  "AlternateTitleUpdateDto": [
    "{\"label\":\"l\",\"title\":null}",
    ""
  ],
  "BookMetadataUpdateDto.empty": [
    "{\"title\":null,\"titleLock\":null,\"summaryLock\":null,\"number\":null,\"numberLock\":null,\"numberSort\":null,\"numberSortLock\":null,\"releaseDateLock\":null,\"authorsLock\":null,\"tagsLock\":null,\"isbnLock\":null,\"linksLock\":null,\"summary\":null,\"releaseDate\":null,\"authors\":null,\"tags\":null,\"isbn\":null,\"links\":null}",
    "summary=false,releaseDate=false,authors=false,tags=false,isbn=false,links=false,"
  ],
  "BookMetadataUpdateDto.nulls": [
    "{\"title\":null,\"titleLock\":null,\"summaryLock\":null,\"number\":null,\"numberLock\":null,\"numberSort\":null,\"numberSortLock\":null,\"releaseDateLock\":null,\"authorsLock\":null,\"tagsLock\":null,\"isbnLock\":null,\"linksLock\":null,\"summary\":null,\"releaseDate\":null,\"authors\":null,\"tags\":null,\"isbn\":null,\"links\":null}",
    "summary=true,releaseDate=true,authors=true,tags=true,isbn=true,links=true,"
  ],
  "BookMetadataUpdateDto.full": [
    "{\"title\":\"t\",\"titleLock\":true,\"summaryLock\":false,\"number\":\"1\",\"numberLock\":true,\"numberSort\":0.1,\"numberSortLock\":true,\"releaseDateLock\":true,\"authorsLock\":true,\"tagsLock\":false,\"isbnLock\":true,\"linksLock\":false,\"summary\":\"s\",\"releaseDate\":\"2024-03-05\",\"authors\":[{\"name\":\"n\",\"role\":\"r\"}],\"tags\":[\"a\",\"b\"],\"isbn\":\"978-1\",\"links\":[{\"label\":\"l\",\"url\":\"https://u\"}]}",
    "summary=true,releaseDate=true,authors=true,tags=true,isbn=true,links=true,"
  ],
  "LibraryUpdateDto": [
    "ERR InvalidFormatException",
    ""
  ],
  "LibraryUpdateDto.enumCase": [
    "{\"name\":\"n\",\"root\":null,\"importComicInfoBook\":null,\"importComicInfoSeries\":null,\"importComicInfoCollection\":null,\"importComicInfoReadList\":null,\"importComicInfoSeriesAppendVolume\":null,\"importEpubBook\":null,\"importEpubSeries\":null,\"importMylarSeries\":null,\"importLocalArtwork\":null,\"importBarcodeIsbn\":null,\"scanForceModifiedTime\":null,\"scanInterval\":\"HOURLY\",\"scanOnStartup\":null,\"scanCbx\":null,\"scanPdf\":null,\"scanEpub\":null,\"repairExtensions\":null,\"convertToCbz\":null,\"emptyTrashAfterScan\":null,\"seriesCover\":null,\"hashFiles\":false,\"hashPages\":null,\"hashKoreader\":null,\"analyzeDimensions\":null,\"scanDirectoryExclusions\":null,\"oneshotsDirectory\":null}",
    "scanDirectoryExclusions=false,oneshotsDirectory=true,"
  ],
  "LibraryUpdateDto.set": [
    "{\"name\":null,\"root\":null,\"importComicInfoBook\":null,\"importComicInfoSeries\":null,\"importComicInfoCollection\":null,\"importComicInfoReadList\":null,\"importComicInfoSeriesAppendVolume\":null,\"importEpubBook\":null,\"importEpubSeries\":null,\"importMylarSeries\":null,\"importLocalArtwork\":null,\"importBarcodeIsbn\":null,\"scanForceModifiedTime\":null,\"scanInterval\":null,\"scanOnStartup\":null,\"scanCbx\":null,\"scanPdf\":null,\"scanEpub\":null,\"repairExtensions\":null,\"convertToCbz\":null,\"emptyTrashAfterScan\":null,\"seriesCover\":\"LAST\",\"hashFiles\":null,\"hashPages\":null,\"hashKoreader\":null,\"analyzeDimensions\":null,\"scanDirectoryExclusions\":[\"x\"],\"oneshotsDirectory\":null}",
    "scanDirectoryExclusions=true,oneshotsDirectory=false,"
  ],
  "SeriesMetadataUpdateDto": [
    "{\"status\":\"HIATUS\",\"statusLock\":null,\"title\":\"t\",\"titleLock\":null,\"titleSort\":null,\"titleSortLock\":null,\"summary\":\"s\",\"summaryLock\":null,\"publisher\":null,\"publisherLock\":null,\"readingDirectionLock\":null,\"ageRatingLock\":null,\"language\":\"fr\",\"languageLock\":null,\"genresLock\":null,\"tagsLock\":null,\"totalBookCountLock\":null,\"sharingLabelsLock\":null,\"linksLock\":null,\"alternateTitlesLock\":null,\"readingDirection\":null,\"ageRating\":12,\"genres\":[\"g\"],\"totalBookCount\":null,\"sharingLabels\":null,\"alternateTitles\":[{\"label\":\"a\",\"title\":\"b\"}],\"tags\":null,\"links\":[{\"label\":\"l\",\"url\":\"u\"}]}",
    "readingDirection=true,ageRating=true,genres=true,tags=false,totalBookCount=true,sharingLabels=false,links=true,alternateTitles=true,"
  ],
  "SeriesMetadataUpdateDto.empty": [
    "{\"status\":null,\"statusLock\":null,\"title\":null,\"titleLock\":null,\"titleSort\":null,\"titleSortLock\":null,\"summary\":null,\"summaryLock\":null,\"publisher\":null,\"publisherLock\":null,\"readingDirectionLock\":null,\"ageRatingLock\":null,\"language\":null,\"languageLock\":null,\"genresLock\":null,\"tagsLock\":null,\"totalBookCountLock\":null,\"sharingLabelsLock\":null,\"linksLock\":null,\"alternateTitlesLock\":null,\"readingDirection\":null,\"ageRating\":null,\"genres\":null,\"totalBookCount\":null,\"sharingLabels\":null,\"alternateTitles\":null,\"tags\":null,\"links\":null}",
    "readingDirection=false,ageRating=false,genres=false,tags=false,totalBookCount=false,sharingLabels=false,links=false,alternateTitles=false,"
  ],
  "SettingsUpdateDto": [
    "ERR InvalidFormatException",
    ""
  ],
  "SettingsUpdateDto.enumCase": [
    "{\"deleteEmptyCollections\":true,\"deleteEmptyReadLists\":null,\"rememberMeDurationDays\":5000000000,\"renewRememberMeKey\":null,\"thumbnailSize\":\"XLARGE\",\"taskPoolSize\":null,\"koboProxy\":null,\"serverPort\":null,\"serverContextPath\":\"/k\",\"koboPort\":null,\"kepubifyPath\":\"k\"}",
    "serverPort=true,serverContextPath=true,koboPort=false,kepubifyPath=true,"
  ],
  "UserUpdateDto": [
    "{\"roles\":[\"ADMIN\"],\"labelsAllow\":null,\"labelsExclude\":null,\"sharedLibraries\":{\"all\":true,\"libraryIds\":[]},\"ageRestriction\":null}",
    "ageRestriction=true,labelsAllow=false,labelsExclude=false,roles=true,sharedLibraries=true,"
  ],
  "UserUpdateDto.age": [
    "{\"roles\":null,\"labelsAllow\":[\"x\"],\"labelsExclude\":null,\"sharedLibraries\":null,\"ageRestriction\":{\"age\":10,\"restriction\":\"EXCLUDE\"}}",
    "ageRestriction=true,labelsAllow=true,labelsExclude=false,roles=false,sharedLibraries=false,"
  ]
}

export const BYTE_UNITS: Record<string, [string, string]> = {
  "0": [
    "0 B",
    "0 B"
  ],
  "1": [
    "1 B",
    "1 B"
  ],
  "1000": [
    "1,000 B",
    "1 000 B"
  ],
  "1023": [
    "1,023 B",
    "1 023 B"
  ],
  "1024": [
    "1 KiB",
    "1 KiB"
  ],
  "1536": [
    "1.5 KiB",
    "1,5 KiB"
  ],
  "1075": [
    "1 KiB",
    "1 KiB"
  ],
  "1126": [
    "1.1 KiB",
    "1,1 KiB"
  ],
  "1177": [
    "1.1 KiB",
    "1,1 KiB"
  ],
  "1048575": [
    "1,024 KiB",
    "1 024 KiB"
  ],
  "1048576": [
    "1 MiB",
    "1 MiB"
  ],
  "5000000000": [
    "4.7 GiB",
    "4,7 GiB"
  ],
  "1234567890123": [
    "1.1 TiB",
    "1,1 TiB"
  ],
  "1125899906842624": [
    "1 PiB",
    "1 PiB"
  ],
  "1152921504606846976": [
    "1,024 PiB",
    "1 024 PiB"
  ],
  "1280": [
    "1.2 KiB",
    "1,2 KiB"
  ],
  "1792": [
    "1.8 KiB",
    "1,8 KiB"
  ],
  "2304": [
    "2.2 KiB",
    "2,2 KiB"
  ],
  "1049600": [
    "1 MiB",
    "1 MiB"
  ]
}

export const READ_INPUTS: Record<string, [string, string]> = {
  "AlternateTitleDto": [
    "{\"label\":\"l\",\"title\":\"t\"}",
    "AlternateTitleDto"
  ],
  "ApiKeyRequestDto": [
    "{\"comment\":\"c\"}",
    "ApiKeyRequestDto"
  ],
  "ApiKeyRequestDto.missing": [
    "{}",
    "ApiKeyRequestDto"
  ],
  "ApiKeyRequestDto.null": [
    "{\"comment\":null}",
    "ApiKeyRequestDto"
  ],
  "BookImportBatchDto": [
    "{\"books\":[{\"sourceFile\":\"/a\",\"seriesId\":\"s\"},{\"sourceFile\":\"/b\",\"seriesId\":\"s\",\"upgradeBookId\":\"u\",\"destinationName\":null}],\"copyMode\":\"move\"}",
    "BookImportBatchDto"
  ],
  "BookImportBatchDto.enumCase": [
    "{\"books\":[{\"sourceFile\":\"/a\",\"seriesId\":\"s\"},{\"sourceFile\":\"/b\",\"seriesId\":\"s\",\"upgradeBookId\":\"u\",\"destinationName\":null}],\"copyMode\":\"MOVE\"}",
    "BookImportBatchDto"
  ],
  "BookImportBatchDto.default": [
    "{\"copyMode\":\"COPY\",\"extra\":1}",
    "BookImportBatchDto"
  ],
  "BookImportBatchDto.badEnum": [
    "{\"copyMode\":\"XX\"}",
    "BookImportBatchDto"
  ],
  "ClientSettingGlobalUpdateDto": [
    "{\"value\":\"v\",\"allowUnauthorized\":true}",
    "ClientSettingGlobalUpdateDto"
  ],
  "ClientSettingGlobalUpdateDto.nullPrimitive": [
    "{\"value\":\"v\",\"allowUnauthorized\":null}",
    "ClientSettingGlobalUpdateDto"
  ],
  "ClientSettingUserUpdateDto": [
    "{\"VALUE\":\"v\"}",
    "ClientSettingUserUpdateDto"
  ],
  "CollectionCreationDto": [
    "{\"name\":\"n\",\"ordered\":false,\"seriesIds\":[\"a\",\"a\"]}",
    "CollectionCreationDto"
  ],
  "CollectionUpdateDto": [
    "{\"name\":\"n\"}",
    "CollectionUpdateDto"
  ],
  "CollectionUpdateDto.empty": [
    "{}",
    "CollectionUpdateDto"
  ],
  "GithubReleaseDto": [
    "{\"url\":\"x\",\"html_url\":\"https://github.com/gotson/komga/releases/tag/1.0.0\",\"tag_name\":\"1.0.0\",\"published_at\":\"2024-03-05T07:08:09+02:00\",\"body\":\"b\",\"prerelease\":false,\"assets\":[]}",
    "GithubReleaseDto"
  ],
  "JsonFeedDto": [
    "{\"version\":\"https://jsonfeed.org/version/1\",\"title\":\"Announcements\",\"home_page_url\":\"https://komga.org/blog\",\"description\":\"d\",\"items\":[{\"id\":\"i\",\"url\":\"u\",\"title\":\"t\",\"summary\":\"s\",\"content_html\":\"<p>x</p>\",\"date_modified\":\"2023-12-15T00:00:00+01:00\",\"author\":{\"name\":\"gotson\",\"url\":\"https://github.com/gotson\"},\"tags\":[\"upgrade\",\"komga\"],\"_komga\":{\"read\":true}},{\"id\":\"i2\"}]}",
    "JsonFeedDto"
  ],
  "JsonFeedDto.minimal": [
    "{\"version\":\"v\",\"title\":\"t\"}",
    "JsonFeedDto"
  ],
  "LibraryCreationDto": [
    "{\"name\":\"n\",\"root\":\"/r\"}",
    "LibraryCreationDto"
  ],
  "LibraryCreationDto.full": [
    "{\"name\":\"n\",\"root\":\"/r\",\"importComicInfoBook\":false,\"scanInterval\":\"weekly\",\"scanDirectoryExclusions\":[\"a\"],\"seriesCover\":\"FIRST_UNREAD_OR_FIRST\",\"oneshotsDirectory\":\"o\",\"hashKoreader\":true}",
    "LibraryCreationDto"
  ],
  "LibraryCreationDto.full.enumCase": [
    "{\"name\":\"n\",\"root\":\"/r\",\"importComicInfoBook\":false,\"scanInterval\":\"WEEKLY\",\"scanDirectoryExclusions\":[\"a\"],\"seriesCover\":\"FIRST_UNREAD_OR_FIRST\",\"oneshotsDirectory\":\"o\",\"hashKoreader\":true}",
    "LibraryCreationDto"
  ],
  "LibraryCreationDto.missing": [
    "{\"name\":\"n\"}",
    "LibraryCreationDto"
  ],
  "PageHashCreationDto": [
    "{\"hash\":\"h\",\"action\":\"DELETE_MANUAL\"}",
    "PageHashCreationDto"
  ],
  "PageHashCreationDto.size": [
    "{\"hash\":\"h\",\"size\":5000000000,\"action\":\"IGNORE\"}",
    "PageHashCreationDto"
  ],
  "PasswordUpdateDto": [
    "{\"password\":\"p\"}",
    "PasswordUpdateDto"
  ],
  "ReadListCreationDto": [
    "{\"name\":\"n\",\"bookIds\":[\"a\"]}",
    "ReadListCreationDto"
  ],
  "ReadListUpdateDto": [
    "{\"summary\":\"s\",\"ordered\":false}",
    "ReadListUpdateDto"
  ],
  "ReadProgressUpdateDto": [
    "{\"page\":3}",
    "ReadProgressUpdateDto"
  ],
  "ReadProgressUpdateDto.completed": [
    "{\"completed\":true}",
    "ReadProgressUpdateDto"
  ],
  "TachiyomiReadProgressUpdateDto": [
    "{\"lastBookRead\":4}",
    "TachiyomiReadProgressUpdateDto"
  ],
  "TachiyomiReadProgressUpdateV2Dto": [
    "{\"lastBookNumberSortRead\":0.3}",
    "TachiyomiReadProgressUpdateV2Dto"
  ],
  "TachiyomiReadProgressUpdateV2Dto.int": [
    "{\"lastBookNumberSortRead\":3}",
    "TachiyomiReadProgressUpdateV2Dto"
  ],
  "UserCreationDto": [
    "{\"email\":\"a@b.c\",\"password\":\"p\"}",
    "UserCreationDto"
  ],
  "UserCreationDto.full": [
    "{\"email\":\"a@b.c\",\"password\":\"p\",\"roles\":[\"ADMIN\"],\"ageRestriction\":{\"age\":12,\"restriction\":\"ALLOW_ONLY\"},\"labelsAllow\":[\"a\"],\"labelsExclude\":[],\"sharedLibraries\":{\"all\":false,\"libraryIds\":[\"l\"]}}",
    "UserCreationDto"
  ],
  "ReadingStateStateUpdateDto": [
    "{\"ReadingStates\":[{\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:09.123+02:00\",\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:09Z\",\"ProgressPercent\":33.3,\"ContentSourceProgressPercent\":0,\"Location\":{\"Value\":\"kobo.1.1\",\"Type\":\"KoboSpan\",\"Source\":\"c.xhtml\"}},\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:09Z\",\"SpentReadingMinutes\":5,\"RemainingTimeMinutes\":1},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:09Z\",\"Status\":\"Reading\",\"TimesStartedReading\":1,\"LastTimeStartedReading\":\"2024-03-05T07:08:09Z\"},\"PriorityTimestamp\":\"2024-03-05T07:08:09Z\"}]}",
    "ReadingStateStateUpdateDto"
  ],
  "ReadingStateStateUpdateDto.lowercase": [
    "{\"readingStates\":[{\"entitlementId\":\"e\",\"lastModified\":\"2024-03-05T07:08:09Z\",\"currentBookmark\":{\"lastModified\":\"2024-03-05T07:08:09Z\"},\"statistics\":{\"lastModified\":\"2024-03-05T07:08:09Z\"},\"statusInfo\":{\"lastModified\":\"2024-03-05T07:08:09Z\",\"status\":\"finished\"}}]}",
    "ReadingStateStateUpdateDto"
  ],
  "ReadingStateStateUpdateDto.lowercaseProps": [
    "{\"readingStates\":[{\"entitlementId\":\"e\",\"lastModified\":\"2024-03-05T07:08:09Z\",\"currentBookmark\":{\"lastModified\":\"2024-03-05T07:08:09Z\"},\"statistics\":{\"lastModified\":\"2024-03-05T07:08:09Z\"},\"statusInfo\":{\"lastModified\":\"2024-03-05T07:08:09Z\",\"status\":\"Finished\"}}]}",
    "ReadingStateStateUpdateDto"
  ],
  "ReadingStateStateUpdateDto.badStatus": [
    "{\"ReadingStates\":[{\"EntitlementId\":\"e\",\"LastModified\":\"2024-03-05T07:08:09Z\",\"CurrentBookmark\":{\"LastModified\":\"2024-03-05T07:08:09Z\"},\"Statistics\":{\"LastModified\":\"2024-03-05T07:08:09Z\"},\"StatusInfo\":{\"LastModified\":\"2024-03-05T07:08:09Z\",\"Status\":\"READING\"}}]}",
    "ReadingStateStateUpdateDto"
  ],
  "ReadingStateStateUpdateDto.empty": [
    "{}",
    "ReadingStateStateUpdateDto"
  ],
  "TagDto": [
    "{\"Id\":\"t\",\"Created\":\"2024-03-05T07:08:09Z\",\"LastModified\":\"2024-03-05T07:08:09Z\",\"Name\":\"n\",\"Type\":\"UserTag\",\"Items\":[{\"RevisionId\":\"r\"}]}",
    "TagDto"
  ],
  "WrappedResultDto": [
    "{\"Result\":\"success\"}",
    "WrappedResultDto"
  ],
  "WrappedResultDto.exact": [
    "{\"Result\":\"Success\"}",
    "WrappedResultDto"
  ],
  "AuthDto": [
    "{\"AccessToken\":\"a\",\"RefreshToken\":\"r\",\"TrackingId\":\"t\",\"UserKey\":\"u\"}",
    "AuthDto"
  ]
}

export const BEAN_INPUTS: Record<string, [string, string, string[]]> = {
  "AlternateTitleUpdateDto": [
    "{\"label\":\"l\"}",
    "AlternateTitleUpdateDto",
    []
  ],
  "BookMetadataUpdateDto.empty": [
    "{}",
    "BookMetadataUpdateDto",
    [
      "summary",
      "releaseDate",
      "authors",
      "tags",
      "isbn",
      "links"
    ]
  ],
  "BookMetadataUpdateDto.nulls": [
    "{\"summary\":null,\"releaseDate\":null,\"authors\":null,\"tags\":null,\"isbn\":null,\"links\":null,\"title\":null}",
    "BookMetadataUpdateDto",
    [
      "summary",
      "releaseDate",
      "authors",
      "tags",
      "isbn",
      "links"
    ]
  ],
  "BookMetadataUpdateDto.full": [
    "{\"title\":\"t\",\"titleLock\":true,\"summary\":\"s\",\"summaryLock\":false,\"number\":\"1\",\"numberLock\":true,\"numberSort\":0.1,\"numberSortLock\":true,\"releaseDate\":\"2024-03-05\",\"releaseDateLock\":true,\"authors\":[{\"name\":\"n\",\"role\":\"r\"}],\"authorsLock\":true,\"tags\":[\"a\",\"b\"],\"tagsLock\":false,\"isbn\":\"978-1\",\"isbnLock\":true,\"links\":[{\"label\":\"l\",\"url\":\"https://u\"}],\"linksLock\":false}",
    "BookMetadataUpdateDto",
    [
      "summary",
      "releaseDate",
      "authors",
      "tags",
      "isbn",
      "links"
    ]
  ],
  "LibraryUpdateDto": [
    "{\"name\":\"n\",\"scanInterval\":\"hourly\",\"oneshotsDirectory\":null,\"hashFiles\":false}",
    "LibraryUpdateDto",
    [
      "scanDirectoryExclusions",
      "oneshotsDirectory"
    ]
  ],
  "LibraryUpdateDto.enumCase": [
    "{\"name\":\"n\",\"scanInterval\":\"HOURLY\",\"oneshotsDirectory\":null,\"hashFiles\":false}",
    "LibraryUpdateDto",
    [
      "scanDirectoryExclusions",
      "oneshotsDirectory"
    ]
  ],
  "LibraryUpdateDto.set": [
    "{\"scanDirectoryExclusions\":[\"x\"],\"seriesCover\":\"LAST\"}",
    "LibraryUpdateDto",
    [
      "scanDirectoryExclusions",
      "oneshotsDirectory"
    ]
  ],
  "SeriesMetadataUpdateDto": [
    "{\"status\":\"HIATUS\",\"title\":\"t\",\"summary\":\"s\",\"readingDirection\":null,\"ageRating\":12,\"genres\":[\"g\"],\"totalBookCount\":null,\"links\":[{\"label\":\"l\",\"url\":\"u\"}],\"alternateTitles\":[{\"label\":\"a\",\"title\":\"b\"}],\"language\":\"fr\"}",
    "SeriesMetadataUpdateDto",
    [
      "readingDirection",
      "ageRating",
      "genres",
      "tags",
      "totalBookCount",
      "sharingLabels",
      "links",
      "alternateTitles"
    ]
  ],
  "SeriesMetadataUpdateDto.empty": [
    "{}",
    "SeriesMetadataUpdateDto",
    [
      "readingDirection",
      "ageRating",
      "genres",
      "tags",
      "totalBookCount",
      "sharingLabels",
      "links",
      "alternateTitles"
    ]
  ],
  "SettingsUpdateDto": [
    "{\"deleteEmptyCollections\":true,\"rememberMeDurationDays\":5000000000,\"thumbnailSize\":\"xlarge\",\"serverPort\":null,\"serverContextPath\":\"/k\",\"kepubifyPath\":\"k\"}",
    "SettingsUpdateDto",
    [
      "serverPort",
      "serverContextPath",
      "koboPort",
      "kepubifyPath"
    ]
  ],
  "SettingsUpdateDto.enumCase": [
    "{\"deleteEmptyCollections\":true,\"rememberMeDurationDays\":5000000000,\"thumbnailSize\":\"XLARGE\",\"serverPort\":null,\"serverContextPath\":\"/k\",\"kepubifyPath\":\"k\"}",
    "SettingsUpdateDto",
    [
      "serverPort",
      "serverContextPath",
      "koboPort",
      "kepubifyPath"
    ]
  ],
  "UserUpdateDto": [
    "{\"ageRestriction\":null,\"roles\":[\"ADMIN\"],\"sharedLibraries\":{\"all\":true,\"libraryIds\":[]}}",
    "UserUpdateDto",
    [
      "ageRestriction",
      "labelsAllow",
      "labelsExclude",
      "roles",
      "sharedLibraries"
    ]
  ],
  "UserUpdateDto.age": [
    "{\"ageRestriction\":{\"age\":10,\"restriction\":\"EXCLUDE\"},\"labelsAllow\":[\"x\"]}",
    "UserUpdateDto",
    [
      "ageRestriction",
      "labelsAllow",
      "labelsExclude",
      "roles",
      "sharedLibraries"
    ]
  ]
}

export const FUNCTIONS: Record<string, string> = {
  "AlternateTitle.toDto": "{\"label\":\"l\",\"title\":\"Été – 日本語 😀 \\\"q\\\" \\\\ \\n\\t/\"}",
  "Author.toDto": "{\"name\":\"N é\",\"role\":\"writer\"}",
  "WebLink.toDto": "{\"label\":\"l\",\"url\":\"https://a/b%20c?x=1#f\"}",
  "ThumbnailBook.toDto": "{\"id\":\"tid\",\"bookId\":\"bid\",\"type\":\"SIDECAR\",\"selected\":true,\"mediaType\":\"image/png\",\"fileSize\":10,\"width\":3,\"height\":4}",
  "PageHashUnknown.toDto": "{\"hash\":\"h\",\"size\":5,\"matchCount\":3}",
  "ApiKeyDto.redacted": "{\"id\":\"id1\",\"userId\":\"user1\",\"key\":\"******\",\"comment\":\"c\",\"createdDate\":\"2024-03-05T07:08:09.12+02:00\",\"lastModifiedDate\":\"2024-03-05T07:08:00Z\"}",
  "KomgaUser.toDto": "{\"id\":\"uid\",\"email\":\"a@b.c\",\"roles\":[\"ADMIN\",\"FILE_DOWNLOAD\",\"USER\"],\"sharedAllLibraries\":false,\"sharedLibrariesIds\":[\"l1\"],\"labelsAllow\":[\"a\"],\"labelsExclude\":[],\"ageRestriction\":{\"age\":12,\"restriction\":\"ALLOW_ONLY\"}}",
  "KomgaUser.toDto.noRestriction": "{\"id\":\"uid\",\"email\":\"a@b.c\",\"roles\":[\"USER\"],\"sharedAllLibraries\":true,\"sharedLibrariesIds\":[],\"labelsAllow\":[],\"labelsExclude\":[]}",
  "ReadListRequestMatch.toDto": "{\"readListMatch\":{\"name\":\"rl\",\"errorCode\":\"E\"},\"requests\":[{\"request\":{\"series\":[\"x\",\"y\"],\"number\":\"1\"},\"matches\":[{\"series\":{\"seriesId\":\"s1\",\"title\":\"S1\",\"releaseDate\":\"2024-03-05\"},\"books\":[{\"bookId\":\"b1\",\"number\":\"1\",\"title\":\"B1\"},{\"bookId\":\"b2\",\"number\":\"2\",\"title\":\"B2\"}]},{\"series\":{\"seriesId\":\"s2\",\"title\":\"S2\",\"releaseDate\":null},\"books\":[]}]}],\"errorCode\":\"\"}",
  "SyncPoint.ReadList.toWrappedTagDto": "{\"Tag\":{\"Id\":\"rl\",\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"Name\":\"name\",\"Type\":\"UserTag\",\"Items\":[{\"RevisionId\":\"b1\",\"Type\":\"ProductRevisionTagItem\"}]}}",
  "SyncPoint.ReadList.toWrappedTagDto.noItems": "{\"Tag\":{\"Id\":\"rl\",\"Created\":\"2024-03-05T07:08:09.12+02:00\",\"LastModified\":\"2024-03-05T07:08:00Z\",\"Name\":\"name\",\"Type\":\"UserTag\",\"Items\":null}}",
  "ZonedDateTime.toPeriodDto": "{\"From\":\"2024-03-05T07:08:09.12+02:00\"}",
  "ReadProgress.toDto.true.h.loc": "33.329998|12.3|{\"Value\":\"kobo.2.3\",\"Type\":\"KoboSpan\",\"Source\":\"h\"}|FINISHED|1|b",
  "ReadProgress.toDto.false.null": "null|null|null|READING|1|b",
  "ReadProgress.toDto.false.h": "null|null|{\"Value\":null,\"Type\":\"KoboSpan\",\"Source\":\"h\"}|READING|1|b",
  "BookMetadata.patch {}": "Title|Summary|1|1.0|2024-03-05|[a:writer]|[t1, t2]|9781234567897|[l=https://l]|falsefalsefalsefalsefalsefalsefalsefalsefalse",
  "BookMetadata.patch {\"summary\":null,\"releaseDate\":null,\"authors\":null,\"tags\":null,\"isbn\":null,\"links\":null}": "Title||1|1.0|null|[]|[]||[]|falsefalsefalsefalsefalsefalsefalsefalsefalse",
  "BookMetadata.patch {\"title\":\"T2\",\"titleLock\":true,\"summary\":\"S2\",\"number\":\"2\",\"numberSort\":2.5,\"numberSortLock\":true,\"releaseDate\":\"2020-01-02\",\"authors\":[{\"name\":\" x \",\"role\":\"PENCILLER\"},{}],\"tags\":[\"New\"],\"isbn\":\"978-1-2٣\",\"links\":[{\"label\":\"k\",\"url\":\"https://k/a%20b\"}],\"linksLock\":true}": "T2|S2|2|2.5|2020-01-02|[x:penciller, :]|[new]|97812٣|[k=https://k/a%20b]|truefalsefalsetruefalsefalsefalsefalsetrue"
}
