// Généré par tools/gen-jooq.mjs depuis le code jOOQ de Komga (65981e600edb24944ffaae4818ff2716a5fa08dd), catalogue "main". Ne pas modifier.
// Équivalent de org.gotson.komga.jooq.main.{Tables, Keys, tables.*, tables.records.*}
/* eslint-disable */
import type { LocalDate, LocalDateTime } from '@js-joda/core'
import { ForeignKey, Table, TableRecordImpl, UniqueKey, registerRecordClass } from '../../core.js'
import { SQLDataType } from '../../types.js'

export class AnnouncementsRead extends Table<AnnouncementsReadRecord> {
  readonly USER_ID = this.createField<string>('USER_ID', SQLDataType.VARCHAR)
  readonly ANNOUNCEMENT_ID = this.createField<string>('ANNOUNCEMENT_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('ANNOUNCEMENTS_READ', alias)
  }

  getPrimaryKey(): UniqueKey<AnnouncementsReadRecord> | null {
    return Keys.ANNOUNCEMENTS_READ__PK_ANNOUNCEMENTS_READ as UniqueKey<AnnouncementsReadRecord>
  }

  getReferences(): ForeignKey<AnnouncementsReadRecord, unknown>[] {
    return [Keys.ANNOUNCEMENTS_READ__FK_ANNOUNCEMENTS_READ_PK_USER] as ForeignKey<AnnouncementsReadRecord, unknown>[]
  }
}

export class AnnouncementsReadRecord extends TableRecordImpl<AnnouncementsReadRecord> {
  get userId(): string {
    return this.values[0] as string
  }
  set userId(v: string) {
    this.values[0] = v
  }
  get announcementId(): string {
    return this.values[1] as string
  }
  set announcementId(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(AnnouncementsRead, AnnouncementsReadRecord as never)

export class AuthenticationActivity extends Table<AuthenticationActivityRecord> {
  readonly USER_ID = this.createField<string>('USER_ID', SQLDataType.VARCHAR)
  readonly EMAIL = this.createField<string>('EMAIL', SQLDataType.VARCHAR)
  readonly IP = this.createField<string>('IP', SQLDataType.VARCHAR)
  readonly USER_AGENT = this.createField<string>('USER_AGENT', SQLDataType.VARCHAR)
  readonly SUCCESS = this.createField<boolean>('SUCCESS', SQLDataType.BOOLEAN)
  readonly ERROR = this.createField<string>('ERROR', SQLDataType.VARCHAR)
  readonly DATE_TIME = this.createField<LocalDateTime>('DATE_TIME', SQLDataType.LOCALDATETIME)
  readonly SOURCE = this.createField<string>('SOURCE', SQLDataType.VARCHAR)
  readonly API_KEY_ID = this.createField<string>('API_KEY_ID', SQLDataType.VARCHAR)
  readonly API_KEY_COMMENT = this.createField<string>('API_KEY_COMMENT', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('AUTHENTICATION_ACTIVITY', alias)
  }

  getReferences(): ForeignKey<AuthenticationActivityRecord, unknown>[] {
    return [Keys.AUTHENTICATION_ACTIVITY__FK_AUTHENTICATION_ACTIVITY_PK_USER] as ForeignKey<AuthenticationActivityRecord, unknown>[]
  }
}

export class AuthenticationActivityRecord extends TableRecordImpl<AuthenticationActivityRecord> {
  get userId(): string {
    return this.values[0] as string
  }
  set userId(v: string) {
    this.values[0] = v
  }
  get email(): string {
    return this.values[1] as string
  }
  set email(v: string) {
    this.values[1] = v
  }
  get ip(): string {
    return this.values[2] as string
  }
  set ip(v: string) {
    this.values[2] = v
  }
  get userAgent(): string {
    return this.values[3] as string
  }
  set userAgent(v: string) {
    this.values[3] = v
  }
  get success(): boolean {
    return this.values[4] as boolean
  }
  set success(v: boolean) {
    this.values[4] = v
  }
  get error(): string {
    return this.values[5] as string
  }
  set error(v: string) {
    this.values[5] = v
  }
  get dateTime(): LocalDateTime {
    return this.values[6] as LocalDateTime
  }
  set dateTime(v: LocalDateTime) {
    this.values[6] = v
  }
  get source(): string {
    return this.values[7] as string
  }
  set source(v: string) {
    this.values[7] = v
  }
  get apiKeyId(): string {
    return this.values[8] as string
  }
  set apiKeyId(v: string) {
    this.values[8] = v
  }
  get apiKeyComment(): string {
    return this.values[9] as string
  }
  set apiKeyComment(v: string) {
    this.values[9] = v
  }
}
registerRecordClass(AuthenticationActivity, AuthenticationActivityRecord as never)

export class Book extends Table<BookRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly FILE_LAST_MODIFIED = this.createField<LocalDateTime>('FILE_LAST_MODIFIED', SQLDataType.LOCALDATETIME)
  readonly NAME = this.createField<string>('NAME', SQLDataType.VARCHAR)
  readonly URL = this.createField<string>('URL', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)
  readonly FILE_SIZE = this.createField<number>('FILE_SIZE', SQLDataType.BIGINT)
  readonly NUMBER = this.createField<number>('NUMBER', SQLDataType.INTEGER)
  readonly LIBRARY_ID = this.createField<string>('LIBRARY_ID', SQLDataType.VARCHAR)
  readonly FILE_HASH = this.createField<string>('FILE_HASH', SQLDataType.VARCHAR)
  readonly DELETED_DATE = this.createField<LocalDateTime>('DELETED_DATE', SQLDataType.LOCALDATETIME)
  readonly ONESHOT = this.createField<boolean>('oneshot', SQLDataType.BOOLEAN)
  readonly FILE_HASH_KOREADER = this.createField<string>('FILE_HASH_KOREADER', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('BOOK', alias)
  }

  getPrimaryKey(): UniqueKey<BookRecord> | null {
    return Keys.BOOK__PK_BOOK as UniqueKey<BookRecord>
  }

  getReferences(): ForeignKey<BookRecord, unknown>[] {
    return [Keys.BOOK__FK_BOOK_PK_LIBRARY, Keys.BOOK__FK_BOOK_PK_SERIES] as ForeignKey<BookRecord, unknown>[]
  }
}

export class BookRecord extends TableRecordImpl<BookRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[1] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[1] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[2] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[2] = v
  }
  get fileLastModified(): LocalDateTime {
    return this.values[3] as LocalDateTime
  }
  set fileLastModified(v: LocalDateTime) {
    this.values[3] = v
  }
  get name(): string {
    return this.values[4] as string
  }
  set name(v: string) {
    this.values[4] = v
  }
  get url(): string {
    return this.values[5] as string
  }
  set url(v: string) {
    this.values[5] = v
  }
  get seriesId(): string {
    return this.values[6] as string
  }
  set seriesId(v: string) {
    this.values[6] = v
  }
  get fileSize(): number {
    return this.values[7] as number
  }
  set fileSize(v: number) {
    this.values[7] = v
  }
  get number(): number {
    return this.values[8] as number
  }
  set number(v: number) {
    this.values[8] = v
  }
  get libraryId(): string {
    return this.values[9] as string
  }
  set libraryId(v: string) {
    this.values[9] = v
  }
  get fileHash(): string {
    return this.values[10] as string
  }
  set fileHash(v: string) {
    this.values[10] = v
  }
  get deletedDate(): LocalDateTime {
    return this.values[11] as LocalDateTime
  }
  set deletedDate(v: LocalDateTime) {
    this.values[11] = v
  }
  get oneshot(): boolean {
    return this.values[12] as boolean
  }
  set oneshot(v: boolean) {
    this.values[12] = v
  }
  get fileHashKoreader(): string {
    return this.values[13] as string
  }
  set fileHashKoreader(v: string) {
    this.values[13] = v
  }
}
registerRecordClass(Book, BookRecord as never)

export class BookMetadata extends Table<BookMetadataRecord> {
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly NUMBER = this.createField<string>('NUMBER', SQLDataType.VARCHAR)
  readonly NUMBER_LOCK = this.createField<boolean>('NUMBER_LOCK', SQLDataType.BOOLEAN)
  readonly NUMBER_SORT = this.createField<number>('NUMBER_SORT', SQLDataType.REAL)
  readonly NUMBER_SORT_LOCK = this.createField<boolean>('NUMBER_SORT_LOCK', SQLDataType.BOOLEAN)
  readonly RELEASE_DATE = this.createField<LocalDate>('RELEASE_DATE', SQLDataType.LOCALDATE)
  readonly RELEASE_DATE_LOCK = this.createField<boolean>('RELEASE_DATE_LOCK', SQLDataType.BOOLEAN)
  readonly SUMMARY = this.createField<string>('SUMMARY', SQLDataType.VARCHAR)
  readonly SUMMARY_LOCK = this.createField<boolean>('SUMMARY_LOCK', SQLDataType.BOOLEAN)
  readonly TITLE = this.createField<string>('TITLE', SQLDataType.VARCHAR)
  readonly TITLE_LOCK = this.createField<boolean>('TITLE_LOCK', SQLDataType.BOOLEAN)
  readonly AUTHORS_LOCK = this.createField<boolean>('AUTHORS_LOCK', SQLDataType.BOOLEAN)
  readonly TAGS_LOCK = this.createField<boolean>('TAGS_LOCK', SQLDataType.BOOLEAN)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)
  readonly ISBN = this.createField<string>('ISBN', SQLDataType.VARCHAR)
  readonly ISBN_LOCK = this.createField<boolean>('ISBN_LOCK', SQLDataType.BOOLEAN)
  readonly LINKS_LOCK = this.createField<boolean>('LINKS_LOCK', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('BOOK_METADATA', alias)
  }

  getPrimaryKey(): UniqueKey<BookMetadataRecord> | null {
    return Keys.BOOK_METADATA__PK_BOOK_METADATA as UniqueKey<BookMetadataRecord>
  }

  getReferences(): ForeignKey<BookMetadataRecord, unknown>[] {
    return [Keys.BOOK_METADATA__FK_BOOK_METADATA_PK_BOOK] as ForeignKey<BookMetadataRecord, unknown>[]
  }
}

export class BookMetadataRecord extends TableRecordImpl<BookMetadataRecord> {
  get createdDate(): LocalDateTime {
    return this.values[0] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[0] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[1] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[1] = v
  }
  get number(): string {
    return this.values[2] as string
  }
  set number(v: string) {
    this.values[2] = v
  }
  get numberLock(): boolean {
    return this.values[3] as boolean
  }
  set numberLock(v: boolean) {
    this.values[3] = v
  }
  get numberSort(): number {
    return this.values[4] as number
  }
  set numberSort(v: number) {
    this.values[4] = v
  }
  get numberSortLock(): boolean {
    return this.values[5] as boolean
  }
  set numberSortLock(v: boolean) {
    this.values[5] = v
  }
  get releaseDate(): LocalDate {
    return this.values[6] as LocalDate
  }
  set releaseDate(v: LocalDate) {
    this.values[6] = v
  }
  get releaseDateLock(): boolean {
    return this.values[7] as boolean
  }
  set releaseDateLock(v: boolean) {
    this.values[7] = v
  }
  get summary(): string {
    return this.values[8] as string
  }
  set summary(v: string) {
    this.values[8] = v
  }
  get summaryLock(): boolean {
    return this.values[9] as boolean
  }
  set summaryLock(v: boolean) {
    this.values[9] = v
  }
  get title(): string {
    return this.values[10] as string
  }
  set title(v: string) {
    this.values[10] = v
  }
  get titleLock(): boolean {
    return this.values[11] as boolean
  }
  set titleLock(v: boolean) {
    this.values[11] = v
  }
  get authorsLock(): boolean {
    return this.values[12] as boolean
  }
  set authorsLock(v: boolean) {
    this.values[12] = v
  }
  get tagsLock(): boolean {
    return this.values[13] as boolean
  }
  set tagsLock(v: boolean) {
    this.values[13] = v
  }
  get bookId(): string {
    return this.values[14] as string
  }
  set bookId(v: string) {
    this.values[14] = v
  }
  get isbn(): string {
    return this.values[15] as string
  }
  set isbn(v: string) {
    this.values[15] = v
  }
  get isbnLock(): boolean {
    return this.values[16] as boolean
  }
  set isbnLock(v: boolean) {
    this.values[16] = v
  }
  get linksLock(): boolean {
    return this.values[17] as boolean
  }
  set linksLock(v: boolean) {
    this.values[17] = v
  }
}
registerRecordClass(BookMetadata, BookMetadataRecord as never)

export class BookMetadataAggregation extends Table<BookMetadataAggregationRecord> {
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly RELEASE_DATE = this.createField<LocalDate>('RELEASE_DATE', SQLDataType.LOCALDATE)
  readonly SUMMARY = this.createField<string>('SUMMARY', SQLDataType.VARCHAR)
  readonly SUMMARY_NUMBER = this.createField<string>('SUMMARY_NUMBER', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('BOOK_METADATA_AGGREGATION', alias)
  }

  getPrimaryKey(): UniqueKey<BookMetadataAggregationRecord> | null {
    return Keys.BOOK_METADATA_AGGREGATION__PK_BOOK_METADATA_AGGREGATION as UniqueKey<BookMetadataAggregationRecord>
  }

  getReferences(): ForeignKey<BookMetadataAggregationRecord, unknown>[] {
    return [Keys.BOOK_METADATA_AGGREGATION__FK_BOOK_METADATA_AGGREGATION_PK_SERIES] as ForeignKey<BookMetadataAggregationRecord, unknown>[]
  }
}

export class BookMetadataAggregationRecord extends TableRecordImpl<BookMetadataAggregationRecord> {
  get createdDate(): LocalDateTime {
    return this.values[0] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[0] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[1] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[1] = v
  }
  get releaseDate(): LocalDate {
    return this.values[2] as LocalDate
  }
  set releaseDate(v: LocalDate) {
    this.values[2] = v
  }
  get summary(): string {
    return this.values[3] as string
  }
  set summary(v: string) {
    this.values[3] = v
  }
  get summaryNumber(): string {
    return this.values[4] as string
  }
  set summaryNumber(v: string) {
    this.values[4] = v
  }
  get seriesId(): string {
    return this.values[5] as string
  }
  set seriesId(v: string) {
    this.values[5] = v
  }
}
registerRecordClass(BookMetadataAggregation, BookMetadataAggregationRecord as never)

export class BookMetadataAggregationAuthor extends Table<BookMetadataAggregationAuthorRecord> {
  readonly NAME = this.createField<string>('NAME', SQLDataType.VARCHAR)
  readonly ROLE = this.createField<string>('ROLE', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('BOOK_METADATA_AGGREGATION_AUTHOR', alias)
  }

  getReferences(): ForeignKey<BookMetadataAggregationAuthorRecord, unknown>[] {
    return [Keys.BOOK_METADATA_AGGREGATION_AUTHOR__FK_BOOK_METADATA_AGGREGATION_AUTHOR_PK_SERIES] as ForeignKey<BookMetadataAggregationAuthorRecord, unknown>[]
  }
}

export class BookMetadataAggregationAuthorRecord extends TableRecordImpl<BookMetadataAggregationAuthorRecord> {
  get name(): string {
    return this.values[0] as string
  }
  set name(v: string) {
    this.values[0] = v
  }
  get role(): string {
    return this.values[1] as string
  }
  set role(v: string) {
    this.values[1] = v
  }
  get seriesId(): string {
    return this.values[2] as string
  }
  set seriesId(v: string) {
    this.values[2] = v
  }
}
registerRecordClass(BookMetadataAggregationAuthor, BookMetadataAggregationAuthorRecord as never)

export class BookMetadataAggregationTag extends Table<BookMetadataAggregationTagRecord> {
  readonly TAG = this.createField<string>('TAG', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('BOOK_METADATA_AGGREGATION_TAG', alias)
  }

  getReferences(): ForeignKey<BookMetadataAggregationTagRecord, unknown>[] {
    return [Keys.BOOK_METADATA_AGGREGATION_TAG__FK_BOOK_METADATA_AGGREGATION_TAG_PK_SERIES] as ForeignKey<BookMetadataAggregationTagRecord, unknown>[]
  }
}

export class BookMetadataAggregationTagRecord extends TableRecordImpl<BookMetadataAggregationTagRecord> {
  get tag(): string {
    return this.values[0] as string
  }
  set tag(v: string) {
    this.values[0] = v
  }
  get seriesId(): string {
    return this.values[1] as string
  }
  set seriesId(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(BookMetadataAggregationTag, BookMetadataAggregationTagRecord as never)

export class BookMetadataAuthor extends Table<BookMetadataAuthorRecord> {
  readonly NAME = this.createField<string>('NAME', SQLDataType.VARCHAR)
  readonly ROLE = this.createField<string>('ROLE', SQLDataType.VARCHAR)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('BOOK_METADATA_AUTHOR', alias)
  }

  getReferences(): ForeignKey<BookMetadataAuthorRecord, unknown>[] {
    return [Keys.BOOK_METADATA_AUTHOR__FK_BOOK_METADATA_AUTHOR_PK_BOOK] as ForeignKey<BookMetadataAuthorRecord, unknown>[]
  }
}

export class BookMetadataAuthorRecord extends TableRecordImpl<BookMetadataAuthorRecord> {
  get name(): string {
    return this.values[0] as string
  }
  set name(v: string) {
    this.values[0] = v
  }
  get role(): string {
    return this.values[1] as string
  }
  set role(v: string) {
    this.values[1] = v
  }
  get bookId(): string {
    return this.values[2] as string
  }
  set bookId(v: string) {
    this.values[2] = v
  }
}
registerRecordClass(BookMetadataAuthor, BookMetadataAuthorRecord as never)

export class BookMetadataLink extends Table<BookMetadataLinkRecord> {
  readonly LABEL = this.createField<string>('LABEL', SQLDataType.VARCHAR)
  readonly URL = this.createField<string>('URL', SQLDataType.VARCHAR)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('BOOK_METADATA_LINK', alias)
  }

  getReferences(): ForeignKey<BookMetadataLinkRecord, unknown>[] {
    return [Keys.BOOK_METADATA_LINK__FK_BOOK_METADATA_LINK_PK_BOOK] as ForeignKey<BookMetadataLinkRecord, unknown>[]
  }
}

export class BookMetadataLinkRecord extends TableRecordImpl<BookMetadataLinkRecord> {
  get label(): string {
    return this.values[0] as string
  }
  set label(v: string) {
    this.values[0] = v
  }
  get url(): string {
    return this.values[1] as string
  }
  set url(v: string) {
    this.values[1] = v
  }
  get bookId(): string {
    return this.values[2] as string
  }
  set bookId(v: string) {
    this.values[2] = v
  }
}
registerRecordClass(BookMetadataLink, BookMetadataLinkRecord as never)

export class BookMetadataTag extends Table<BookMetadataTagRecord> {
  readonly TAG = this.createField<string>('TAG', SQLDataType.VARCHAR)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('BOOK_METADATA_TAG', alias)
  }

  getReferences(): ForeignKey<BookMetadataTagRecord, unknown>[] {
    return [Keys.BOOK_METADATA_TAG__FK_BOOK_METADATA_TAG_PK_BOOK] as ForeignKey<BookMetadataTagRecord, unknown>[]
  }
}

export class BookMetadataTagRecord extends TableRecordImpl<BookMetadataTagRecord> {
  get tag(): string {
    return this.values[0] as string
  }
  set tag(v: string) {
    this.values[0] = v
  }
  get bookId(): string {
    return this.values[1] as string
  }
  set bookId(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(BookMetadataTag, BookMetadataTagRecord as never)

export class BookProjection extends Table<BookProjectionRecord> {
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)
  readonly PROFILE = this.createField<string>('PROFILE', SQLDataType.VARCHAR)
  readonly FILE_SIZE = this.createField<number>('FILE_SIZE', SQLDataType.BIGINT)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)

  constructor(alias: string | null = null) {
    super('BOOK_PROJECTION', alias)
  }

  getPrimaryKey(): UniqueKey<BookProjectionRecord> | null {
    return Keys.BOOK_PROJECTION__PK_BOOK_PROJECTION as UniqueKey<BookProjectionRecord>
  }

  getReferences(): ForeignKey<BookProjectionRecord, unknown>[] {
    return [Keys.BOOK_PROJECTION__FK_BOOK_PROJECTION_PK_BOOK] as ForeignKey<BookProjectionRecord, unknown>[]
  }
}

export class BookProjectionRecord extends TableRecordImpl<BookProjectionRecord> {
  get bookId(): string {
    return this.values[0] as string
  }
  set bookId(v: string) {
    this.values[0] = v
  }
  get profile(): string {
    return this.values[1] as string
  }
  set profile(v: string) {
    this.values[1] = v
  }
  get fileSize(): number {
    return this.values[2] as number
  }
  set fileSize(v: number) {
    this.values[2] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[3] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[3] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[4] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[4] = v
  }
}
registerRecordClass(BookProjection, BookProjectionRecord as never)

export class ClientSettingsGlobal extends Table<ClientSettingsGlobalRecord> {
  readonly KEY = this.createField<string>('KEY', SQLDataType.VARCHAR)
  readonly VALUE = this.createField<string>('VALUE', SQLDataType.VARCHAR)
  readonly ALLOW_UNAUTHORIZED = this.createField<boolean>('ALLOW_UNAUTHORIZED', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('CLIENT_SETTINGS_GLOBAL', alias)
  }

  getPrimaryKey(): UniqueKey<ClientSettingsGlobalRecord> | null {
    return Keys.CLIENT_SETTINGS_GLOBAL__PK_CLIENT_SETTINGS_GLOBAL as UniqueKey<ClientSettingsGlobalRecord>
  }
}

export class ClientSettingsGlobalRecord extends TableRecordImpl<ClientSettingsGlobalRecord> {
  get key(): string {
    return this.values[0] as string
  }
  set key(v: string) {
    this.values[0] = v
  }
  get value(): string {
    return this.values[1] as string
  }
  set value(v: string) {
    this.values[1] = v
  }
  get allowUnauthorized(): boolean {
    return this.values[2] as boolean
  }
  set allowUnauthorized(v: boolean) {
    this.values[2] = v
  }
}
registerRecordClass(ClientSettingsGlobal, ClientSettingsGlobalRecord as never)

export class ClientSettingsUser extends Table<ClientSettingsUserRecord> {
  readonly USER_ID = this.createField<string>('USER_ID', SQLDataType.VARCHAR)
  readonly KEY = this.createField<string>('KEY', SQLDataType.VARCHAR)
  readonly VALUE = this.createField<string>('VALUE', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('CLIENT_SETTINGS_USER', alias)
  }

  getPrimaryKey(): UniqueKey<ClientSettingsUserRecord> | null {
    return Keys.CLIENT_SETTINGS_USER__PK_CLIENT_SETTINGS_USER as UniqueKey<ClientSettingsUserRecord>
  }

  getReferences(): ForeignKey<ClientSettingsUserRecord, unknown>[] {
    return [Keys.CLIENT_SETTINGS_USER__FK_CLIENT_SETTINGS_USER_PK_USER] as ForeignKey<ClientSettingsUserRecord, unknown>[]
  }
}

export class ClientSettingsUserRecord extends TableRecordImpl<ClientSettingsUserRecord> {
  get userId(): string {
    return this.values[0] as string
  }
  set userId(v: string) {
    this.values[0] = v
  }
  get key(): string {
    return this.values[1] as string
  }
  set key(v: string) {
    this.values[1] = v
  }
  get value(): string {
    return this.values[2] as string
  }
  set value(v: string) {
    this.values[2] = v
  }
}
registerRecordClass(ClientSettingsUser, ClientSettingsUserRecord as never)

export class Collection extends Table<CollectionRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly NAME = this.createField<string>('NAME', SQLDataType.VARCHAR)
  readonly ORDERED = this.createField<boolean>('ORDERED', SQLDataType.BOOLEAN)
  readonly SERIES_COUNT = this.createField<number>('SERIES_COUNT', SQLDataType.INTEGER)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)

  constructor(alias: string | null = null) {
    super('COLLECTION', alias)
  }

  getPrimaryKey(): UniqueKey<CollectionRecord> | null {
    return Keys.COLLECTION__PK_COLLECTION as UniqueKey<CollectionRecord>
  }
}

export class CollectionRecord extends TableRecordImpl<CollectionRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get name(): string {
    return this.values[1] as string
  }
  set name(v: string) {
    this.values[1] = v
  }
  get ordered(): boolean {
    return this.values[2] as boolean
  }
  set ordered(v: boolean) {
    this.values[2] = v
  }
  get seriesCount(): number {
    return this.values[3] as number
  }
  set seriesCount(v: number) {
    this.values[3] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[4] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[4] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[5] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[5] = v
  }
}
registerRecordClass(Collection, CollectionRecord as never)

export class CollectionSeries extends Table<CollectionSeriesRecord> {
  readonly COLLECTION_ID = this.createField<string>('COLLECTION_ID', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)
  readonly NUMBER = this.createField<number>('NUMBER', SQLDataType.INTEGER)

  constructor(alias: string | null = null) {
    super('COLLECTION_SERIES', alias)
  }

  getPrimaryKey(): UniqueKey<CollectionSeriesRecord> | null {
    return Keys.COLLECTION_SERIES__PK_COLLECTION_SERIES as UniqueKey<CollectionSeriesRecord>
  }

  getReferences(): ForeignKey<CollectionSeriesRecord, unknown>[] {
    return [Keys.COLLECTION_SERIES__FK_COLLECTION_SERIES_PK_COLLECTION, Keys.COLLECTION_SERIES__FK_COLLECTION_SERIES_PK_SERIES] as ForeignKey<CollectionSeriesRecord, unknown>[]
  }
}

export class CollectionSeriesRecord extends TableRecordImpl<CollectionSeriesRecord> {
  get collectionId(): string {
    return this.values[0] as string
  }
  set collectionId(v: string) {
    this.values[0] = v
  }
  get seriesId(): string {
    return this.values[1] as string
  }
  set seriesId(v: string) {
    this.values[1] = v
  }
  get number(): number {
    return this.values[2] as number
  }
  set number(v: number) {
    this.values[2] = v
  }
}
registerRecordClass(CollectionSeries, CollectionSeriesRecord as never)

export class FlywaySchemaHistory extends Table<FlywaySchemaHistoryRecord> {
  readonly INSTALLED_RANK = this.createField<number>('installed_rank', SQLDataType.INTEGER)
  readonly VERSION = this.createField<string>('version', SQLDataType.VARCHAR)
  readonly DESCRIPTION = this.createField<string>('description', SQLDataType.VARCHAR)
  readonly TYPE = this.createField<string>('type', SQLDataType.VARCHAR)
  readonly SCRIPT = this.createField<string>('script', SQLDataType.VARCHAR)
  readonly CHECKSUM = this.createField<number>('checksum', SQLDataType.INTEGER)
  readonly INSTALLED_BY = this.createField<string>('installed_by', SQLDataType.VARCHAR)
  readonly INSTALLED_ON = this.createField<string>('installed_on', SQLDataType.CLOB)
  readonly EXECUTION_TIME = this.createField<number>('execution_time', SQLDataType.INTEGER)
  readonly SUCCESS = this.createField<boolean>('success', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('flyway_schema_history', alias)
  }

  getPrimaryKey(): UniqueKey<FlywaySchemaHistoryRecord> | null {
    return Keys.FLYWAY_SCHEMA_HISTORY__PK_FLYWAY_SCHEMA_HISTORY as UniqueKey<FlywaySchemaHistoryRecord>
  }
}

export class FlywaySchemaHistoryRecord extends TableRecordImpl<FlywaySchemaHistoryRecord> {
  get installedRank(): number {
    return this.values[0] as number
  }
  set installedRank(v: number) {
    this.values[0] = v
  }
  get version(): string {
    return this.values[1] as string
  }
  set version(v: string) {
    this.values[1] = v
  }
  get description(): string {
    return this.values[2] as string
  }
  set description(v: string) {
    this.values[2] = v
  }
  get type(): string {
    return this.values[3] as string
  }
  set type(v: string) {
    this.values[3] = v
  }
  get script(): string {
    return this.values[4] as string
  }
  set script(v: string) {
    this.values[4] = v
  }
  get checksum(): number {
    return this.values[5] as number
  }
  set checksum(v: number) {
    this.values[5] = v
  }
  get installedBy(): string {
    return this.values[6] as string
  }
  set installedBy(v: string) {
    this.values[6] = v
  }
  get installedOn(): string {
    return this.values[7] as string
  }
  set installedOn(v: string) {
    this.values[7] = v
  }
  get executionTime(): number {
    return this.values[8] as number
  }
  set executionTime(v: number) {
    this.values[8] = v
  }
  get success(): boolean {
    return this.values[9] as boolean
  }
  set success(v: boolean) {
    this.values[9] = v
  }
}
registerRecordClass(FlywaySchemaHistory, FlywaySchemaHistoryRecord as never)

export class HistoricalEvent extends Table<HistoricalEventRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly TYPE = this.createField<string>('TYPE', SQLDataType.VARCHAR)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)
  readonly TIMESTAMP = this.createField<LocalDateTime>('TIMESTAMP', SQLDataType.LOCALDATETIME)

  constructor(alias: string | null = null) {
    super('HISTORICAL_EVENT', alias)
  }

  getPrimaryKey(): UniqueKey<HistoricalEventRecord> | null {
    return Keys.HISTORICAL_EVENT__PK_HISTORICAL_EVENT as UniqueKey<HistoricalEventRecord>
  }
}

export class HistoricalEventRecord extends TableRecordImpl<HistoricalEventRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get type(): string {
    return this.values[1] as string
  }
  set type(v: string) {
    this.values[1] = v
  }
  get bookId(): string {
    return this.values[2] as string
  }
  set bookId(v: string) {
    this.values[2] = v
  }
  get seriesId(): string {
    return this.values[3] as string
  }
  set seriesId(v: string) {
    this.values[3] = v
  }
  get timestamp(): LocalDateTime {
    return this.values[4] as LocalDateTime
  }
  set timestamp(v: LocalDateTime) {
    this.values[4] = v
  }
}
registerRecordClass(HistoricalEvent, HistoricalEventRecord as never)

export class HistoricalEventProperties extends Table<HistoricalEventPropertiesRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly KEY = this.createField<string>('KEY', SQLDataType.VARCHAR)
  readonly VALUE = this.createField<string>('VALUE', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('HISTORICAL_EVENT_PROPERTIES', alias)
  }

  getPrimaryKey(): UniqueKey<HistoricalEventPropertiesRecord> | null {
    return Keys.HISTORICAL_EVENT_PROPERTIES__PK_HISTORICAL_EVENT_PROPERTIES as UniqueKey<HistoricalEventPropertiesRecord>
  }

  getReferences(): ForeignKey<HistoricalEventPropertiesRecord, unknown>[] {
    return [Keys.HISTORICAL_EVENT_PROPERTIES__FK_HISTORICAL_EVENT_PROPERTIES_PK_HISTORICAL_EVENT] as ForeignKey<HistoricalEventPropertiesRecord, unknown>[]
  }
}

export class HistoricalEventPropertiesRecord extends TableRecordImpl<HistoricalEventPropertiesRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get key(): string {
    return this.values[1] as string
  }
  set key(v: string) {
    this.values[1] = v
  }
  get value(): string {
    return this.values[2] as string
  }
  set value(v: string) {
    this.values[2] = v
  }
}
registerRecordClass(HistoricalEventProperties, HistoricalEventPropertiesRecord as never)

export class Library extends Table<LibraryRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly NAME = this.createField<string>('NAME', SQLDataType.VARCHAR)
  readonly ROOT = this.createField<string>('ROOT', SQLDataType.VARCHAR)
  readonly IMPORT_COMICINFO_BOOK = this.createField<boolean>('IMPORT_COMICINFO_BOOK', SQLDataType.BOOLEAN)
  readonly IMPORT_COMICINFO_SERIES = this.createField<boolean>('IMPORT_COMICINFO_SERIES', SQLDataType.BOOLEAN)
  readonly IMPORT_COMICINFO_COLLECTION = this.createField<boolean>('IMPORT_COMICINFO_COLLECTION', SQLDataType.BOOLEAN)
  readonly IMPORT_EPUB_BOOK = this.createField<boolean>('IMPORT_EPUB_BOOK', SQLDataType.BOOLEAN)
  readonly IMPORT_EPUB_SERIES = this.createField<boolean>('IMPORT_EPUB_SERIES', SQLDataType.BOOLEAN)
  readonly SCAN_FORCE_MODIFIED_TIME = this.createField<boolean>('SCAN_FORCE_MODIFIED_TIME', SQLDataType.BOOLEAN)
  readonly SCAN_STARTUP = this.createField<boolean>('SCAN_STARTUP', SQLDataType.BOOLEAN)
  readonly IMPORT_LOCAL_ARTWORK = this.createField<boolean>('IMPORT_LOCAL_ARTWORK', SQLDataType.BOOLEAN)
  readonly IMPORT_COMICINFO_READLIST = this.createField<boolean>('IMPORT_COMICINFO_READLIST', SQLDataType.BOOLEAN)
  readonly IMPORT_BARCODE_ISBN = this.createField<boolean>('IMPORT_BARCODE_ISBN', SQLDataType.BOOLEAN)
  readonly CONVERT_TO_CBZ = this.createField<boolean>('CONVERT_TO_CBZ', SQLDataType.BOOLEAN)
  readonly REPAIR_EXTENSIONS = this.createField<boolean>('REPAIR_EXTENSIONS', SQLDataType.BOOLEAN)
  readonly EMPTY_TRASH_AFTER_SCAN = this.createField<boolean>('EMPTY_TRASH_AFTER_SCAN', SQLDataType.BOOLEAN)
  readonly IMPORT_MYLAR_SERIES = this.createField<boolean>('IMPORT_MYLAR_SERIES', SQLDataType.BOOLEAN)
  readonly SERIES_COVER = this.createField<string>('SERIES_COVER', SQLDataType.VARCHAR)
  readonly UNAVAILABLE_DATE = this.createField<LocalDateTime>('UNAVAILABLE_DATE', SQLDataType.LOCALDATETIME)
  readonly HASH_FILES = this.createField<boolean>('HASH_FILES', SQLDataType.BOOLEAN)
  readonly HASH_PAGES = this.createField<boolean>('HASH_PAGES', SQLDataType.BOOLEAN)
  readonly ANALYZE_DIMENSIONS = this.createField<boolean>('ANALYZE_DIMENSIONS', SQLDataType.BOOLEAN)
  readonly IMPORT_COMICINFO_SERIES_APPEND_VOLUME = this.createField<boolean>('IMPORT_COMICINFO_SERIES_APPEND_VOLUME', SQLDataType.BOOLEAN)
  readonly ONESHOTS_DIRECTORY = this.createField<string>('ONESHOTS_DIRECTORY', SQLDataType.VARCHAR)
  readonly SCAN_CBX = this.createField<boolean>('SCAN_CBX', SQLDataType.BOOLEAN)
  readonly SCAN_PDF = this.createField<boolean>('SCAN_PDF', SQLDataType.BOOLEAN)
  readonly SCAN_EPUB = this.createField<boolean>('SCAN_EPUB', SQLDataType.BOOLEAN)
  readonly SCAN_INTERVAL = this.createField<string>('SCAN_INTERVAL', SQLDataType.VARCHAR)
  readonly HASH_KOREADER = this.createField<boolean>('HASH_KOREADER', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('LIBRARY', alias)
  }

  getPrimaryKey(): UniqueKey<LibraryRecord> | null {
    return Keys.LIBRARY__PK_LIBRARY as UniqueKey<LibraryRecord>
  }
}

export class LibraryRecord extends TableRecordImpl<LibraryRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[1] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[1] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[2] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[2] = v
  }
  get name(): string {
    return this.values[3] as string
  }
  set name(v: string) {
    this.values[3] = v
  }
  get root(): string {
    return this.values[4] as string
  }
  set root(v: string) {
    this.values[4] = v
  }
  get importComicinfoBook(): boolean {
    return this.values[5] as boolean
  }
  set importComicinfoBook(v: boolean) {
    this.values[5] = v
  }
  get importComicinfoSeries(): boolean {
    return this.values[6] as boolean
  }
  set importComicinfoSeries(v: boolean) {
    this.values[6] = v
  }
  get importComicinfoCollection(): boolean {
    return this.values[7] as boolean
  }
  set importComicinfoCollection(v: boolean) {
    this.values[7] = v
  }
  get importEpubBook(): boolean {
    return this.values[8] as boolean
  }
  set importEpubBook(v: boolean) {
    this.values[8] = v
  }
  get importEpubSeries(): boolean {
    return this.values[9] as boolean
  }
  set importEpubSeries(v: boolean) {
    this.values[9] = v
  }
  get scanForceModifiedTime(): boolean {
    return this.values[10] as boolean
  }
  set scanForceModifiedTime(v: boolean) {
    this.values[10] = v
  }
  get scanStartup(): boolean {
    return this.values[11] as boolean
  }
  set scanStartup(v: boolean) {
    this.values[11] = v
  }
  get importLocalArtwork(): boolean {
    return this.values[12] as boolean
  }
  set importLocalArtwork(v: boolean) {
    this.values[12] = v
  }
  get importComicinfoReadlist(): boolean {
    return this.values[13] as boolean
  }
  set importComicinfoReadlist(v: boolean) {
    this.values[13] = v
  }
  get importBarcodeIsbn(): boolean {
    return this.values[14] as boolean
  }
  set importBarcodeIsbn(v: boolean) {
    this.values[14] = v
  }
  get convertToCbz(): boolean {
    return this.values[15] as boolean
  }
  set convertToCbz(v: boolean) {
    this.values[15] = v
  }
  get repairExtensions(): boolean {
    return this.values[16] as boolean
  }
  set repairExtensions(v: boolean) {
    this.values[16] = v
  }
  get emptyTrashAfterScan(): boolean {
    return this.values[17] as boolean
  }
  set emptyTrashAfterScan(v: boolean) {
    this.values[17] = v
  }
  get importMylarSeries(): boolean {
    return this.values[18] as boolean
  }
  set importMylarSeries(v: boolean) {
    this.values[18] = v
  }
  get seriesCover(): string {
    return this.values[19] as string
  }
  set seriesCover(v: string) {
    this.values[19] = v
  }
  get unavailableDate(): LocalDateTime {
    return this.values[20] as LocalDateTime
  }
  set unavailableDate(v: LocalDateTime) {
    this.values[20] = v
  }
  get hashFiles(): boolean {
    return this.values[21] as boolean
  }
  set hashFiles(v: boolean) {
    this.values[21] = v
  }
  get hashPages(): boolean {
    return this.values[22] as boolean
  }
  set hashPages(v: boolean) {
    this.values[22] = v
  }
  get analyzeDimensions(): boolean {
    return this.values[23] as boolean
  }
  set analyzeDimensions(v: boolean) {
    this.values[23] = v
  }
  get importComicinfoSeriesAppendVolume(): boolean {
    return this.values[24] as boolean
  }
  set importComicinfoSeriesAppendVolume(v: boolean) {
    this.values[24] = v
  }
  get oneshotsDirectory(): string {
    return this.values[25] as string
  }
  set oneshotsDirectory(v: string) {
    this.values[25] = v
  }
  get scanCbx(): boolean {
    return this.values[26] as boolean
  }
  set scanCbx(v: boolean) {
    this.values[26] = v
  }
  get scanPdf(): boolean {
    return this.values[27] as boolean
  }
  set scanPdf(v: boolean) {
    this.values[27] = v
  }
  get scanEpub(): boolean {
    return this.values[28] as boolean
  }
  set scanEpub(v: boolean) {
    this.values[28] = v
  }
  get scanInterval(): string {
    return this.values[29] as string
  }
  set scanInterval(v: string) {
    this.values[29] = v
  }
  get hashKoreader(): boolean {
    return this.values[30] as boolean
  }
  set hashKoreader(v: boolean) {
    this.values[30] = v
  }
}
registerRecordClass(Library, LibraryRecord as never)

export class LibraryExclusions extends Table<LibraryExclusionsRecord> {
  readonly LIBRARY_ID = this.createField<string>('LIBRARY_ID', SQLDataType.VARCHAR)
  readonly EXCLUSION = this.createField<string>('EXCLUSION', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('LIBRARY_EXCLUSIONS', alias)
  }

  getPrimaryKey(): UniqueKey<LibraryExclusionsRecord> | null {
    return Keys.LIBRARY_EXCLUSIONS__PK_LIBRARY_EXCLUSIONS as UniqueKey<LibraryExclusionsRecord>
  }

  getReferences(): ForeignKey<LibraryExclusionsRecord, unknown>[] {
    return [Keys.LIBRARY_EXCLUSIONS__FK_LIBRARY_EXCLUSIONS_PK_LIBRARY] as ForeignKey<LibraryExclusionsRecord, unknown>[]
  }
}

export class LibraryExclusionsRecord extends TableRecordImpl<LibraryExclusionsRecord> {
  get libraryId(): string {
    return this.values[0] as string
  }
  set libraryId(v: string) {
    this.values[0] = v
  }
  get exclusion(): string {
    return this.values[1] as string
  }
  set exclusion(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(LibraryExclusions, LibraryExclusionsRecord as never)

export class Media extends Table<MediaRecord> {
  readonly MEDIA_TYPE = this.createField<string>('MEDIA_TYPE', SQLDataType.VARCHAR)
  readonly STATUS = this.createField<string>('STATUS', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly COMMENT = this.createField<string>('COMMENT', SQLDataType.VARCHAR)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)
  readonly PAGE_COUNT = this.createField<number>('PAGE_COUNT', SQLDataType.INTEGER)
  readonly EXTENSION_CLASS = this.createField<string>('EXTENSION_CLASS', SQLDataType.VARCHAR)
  readonly _UNUSED = this.createField<string>('_UNUSED', SQLDataType.VARCHAR)
  readonly EXTENSION_VALUE_BLOB = this.createField<Uint8Array>('EXTENSION_VALUE_BLOB', SQLDataType.BLOB)
  readonly EPUB_DIVINA_COMPATIBLE = this.createField<boolean>('EPUB_DIVINA_COMPATIBLE', SQLDataType.BOOLEAN)
  readonly EPUB_IS_KEPUB = this.createField<boolean>('EPUB_IS_KEPUB', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('MEDIA', alias)
  }

  getPrimaryKey(): UniqueKey<MediaRecord> | null {
    return Keys.MEDIA__PK_MEDIA as UniqueKey<MediaRecord>
  }

  getReferences(): ForeignKey<MediaRecord, unknown>[] {
    return [Keys.MEDIA__FK_MEDIA_PK_BOOK] as ForeignKey<MediaRecord, unknown>[]
  }
}

export class MediaRecord extends TableRecordImpl<MediaRecord> {
  get mediaType(): string {
    return this.values[0] as string
  }
  set mediaType(v: string) {
    this.values[0] = v
  }
  get status(): string {
    return this.values[1] as string
  }
  set status(v: string) {
    this.values[1] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[2] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[2] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[3] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[3] = v
  }
  get comment(): string {
    return this.values[4] as string
  }
  set comment(v: string) {
    this.values[4] = v
  }
  get bookId(): string {
    return this.values[5] as string
  }
  set bookId(v: string) {
    this.values[5] = v
  }
  get pageCount(): number {
    return this.values[6] as number
  }
  set pageCount(v: number) {
    this.values[6] = v
  }
  get extensionClass(): string {
    return this.values[7] as string
  }
  set extensionClass(v: string) {
    this.values[7] = v
  }
  get _Unused(): string {
    return this.values[8] as string
  }
  set _Unused(v: string) {
    this.values[8] = v
  }
  get extensionValueBlob(): Uint8Array {
    return this.values[9] as Uint8Array
  }
  set extensionValueBlob(v: Uint8Array) {
    this.values[9] = v
  }
  get epubDivinaCompatible(): boolean {
    return this.values[10] as boolean
  }
  set epubDivinaCompatible(v: boolean) {
    this.values[10] = v
  }
  get epubIsKepub(): boolean {
    return this.values[11] as boolean
  }
  set epubIsKepub(v: boolean) {
    this.values[11] = v
  }
}
registerRecordClass(Media, MediaRecord as never)

export class MediaFile extends Table<MediaFileRecord> {
  readonly FILE_NAME = this.createField<string>('FILE_NAME', SQLDataType.VARCHAR)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)
  readonly MEDIA_TYPE = this.createField<string>('MEDIA_TYPE', SQLDataType.VARCHAR)
  readonly SUB_TYPE = this.createField<string>('SUB_TYPE', SQLDataType.VARCHAR)
  readonly FILE_SIZE = this.createField<number>('FILE_SIZE', SQLDataType.BIGINT)

  constructor(alias: string | null = null) {
    super('MEDIA_FILE', alias)
  }

  getReferences(): ForeignKey<MediaFileRecord, unknown>[] {
    return [Keys.MEDIA_FILE__FK_MEDIA_FILE_PK_BOOK] as ForeignKey<MediaFileRecord, unknown>[]
  }
}

export class MediaFileRecord extends TableRecordImpl<MediaFileRecord> {
  get fileName(): string {
    return this.values[0] as string
  }
  set fileName(v: string) {
    this.values[0] = v
  }
  get bookId(): string {
    return this.values[1] as string
  }
  set bookId(v: string) {
    this.values[1] = v
  }
  get mediaType(): string {
    return this.values[2] as string
  }
  set mediaType(v: string) {
    this.values[2] = v
  }
  get subType(): string {
    return this.values[3] as string
  }
  set subType(v: string) {
    this.values[3] = v
  }
  get fileSize(): number {
    return this.values[4] as number
  }
  set fileSize(v: number) {
    this.values[4] = v
  }
}
registerRecordClass(MediaFile, MediaFileRecord as never)

export class MediaPage extends Table<MediaPageRecord> {
  readonly FILE_NAME = this.createField<string>('FILE_NAME', SQLDataType.VARCHAR)
  readonly MEDIA_TYPE = this.createField<string>('MEDIA_TYPE', SQLDataType.VARCHAR)
  readonly NUMBER = this.createField<number>('NUMBER', SQLDataType.INTEGER)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)
  readonly WIDTH = this.createField<number>('width', SQLDataType.INTEGER)
  readonly HEIGHT = this.createField<number>('height', SQLDataType.INTEGER)
  readonly FILE_HASH = this.createField<string>('FILE_HASH', SQLDataType.VARCHAR)
  readonly FILE_SIZE = this.createField<number>('FILE_SIZE', SQLDataType.BIGINT)

  constructor(alias: string | null = null) {
    super('MEDIA_PAGE', alias)
  }

  getPrimaryKey(): UniqueKey<MediaPageRecord> | null {
    return Keys.MEDIA_PAGE__PK_MEDIA_PAGE as UniqueKey<MediaPageRecord>
  }

  getReferences(): ForeignKey<MediaPageRecord, unknown>[] {
    return [Keys.MEDIA_PAGE__FK_MEDIA_PAGE_PK_BOOK] as ForeignKey<MediaPageRecord, unknown>[]
  }
}

export class MediaPageRecord extends TableRecordImpl<MediaPageRecord> {
  get fileName(): string {
    return this.values[0] as string
  }
  set fileName(v: string) {
    this.values[0] = v
  }
  get mediaType(): string {
    return this.values[1] as string
  }
  set mediaType(v: string) {
    this.values[1] = v
  }
  get number(): number {
    return this.values[2] as number
  }
  set number(v: number) {
    this.values[2] = v
  }
  get bookId(): string {
    return this.values[3] as string
  }
  set bookId(v: string) {
    this.values[3] = v
  }
  get width(): number {
    return this.values[4] as number
  }
  set width(v: number) {
    this.values[4] = v
  }
  get height(): number {
    return this.values[5] as number
  }
  set height(v: number) {
    this.values[5] = v
  }
  get fileHash(): string {
    return this.values[6] as string
  }
  set fileHash(v: string) {
    this.values[6] = v
  }
  get fileSize(): number {
    return this.values[7] as number
  }
  set fileSize(v: number) {
    this.values[7] = v
  }
}
registerRecordClass(MediaPage, MediaPageRecord as never)

export class PageHash extends Table<PageHashRecord> {
  readonly HASH = this.createField<string>('HASH', SQLDataType.VARCHAR)
  readonly SIZE = this.createField<number>('SIZE', SQLDataType.BIGINT)
  readonly ACTION = this.createField<string>('ACTION', SQLDataType.VARCHAR)
  readonly DELETE_COUNT = this.createField<number>('DELETE_COUNT', SQLDataType.INTEGER)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)

  constructor(alias: string | null = null) {
    super('PAGE_HASH', alias)
  }

  getPrimaryKey(): UniqueKey<PageHashRecord> | null {
    return Keys.PAGE_HASH__PK_PAGE_HASH as UniqueKey<PageHashRecord>
  }
}

export class PageHashRecord extends TableRecordImpl<PageHashRecord> {
  get hash(): string {
    return this.values[0] as string
  }
  set hash(v: string) {
    this.values[0] = v
  }
  get size(): number {
    return this.values[1] as number
  }
  set size(v: number) {
    this.values[1] = v
  }
  get action(): string {
    return this.values[2] as string
  }
  set action(v: string) {
    this.values[2] = v
  }
  get deleteCount(): number {
    return this.values[3] as number
  }
  set deleteCount(v: number) {
    this.values[3] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[4] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[4] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[5] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[5] = v
  }
}
registerRecordClass(PageHash, PageHashRecord as never)

export class PageHashThumbnail extends Table<PageHashThumbnailRecord> {
  readonly HASH = this.createField<string>('HASH', SQLDataType.VARCHAR)
  readonly THUMBNAIL = this.createField<Uint8Array>('THUMBNAIL', SQLDataType.BLOB)

  constructor(alias: string | null = null) {
    super('PAGE_HASH_THUMBNAIL', alias)
  }

  getPrimaryKey(): UniqueKey<PageHashThumbnailRecord> | null {
    return Keys.PAGE_HASH_THUMBNAIL__PK_PAGE_HASH_THUMBNAIL as UniqueKey<PageHashThumbnailRecord>
  }
}

export class PageHashThumbnailRecord extends TableRecordImpl<PageHashThumbnailRecord> {
  get hash(): string {
    return this.values[0] as string
  }
  set hash(v: string) {
    this.values[0] = v
  }
  get thumbnail(): Uint8Array {
    return this.values[1] as Uint8Array
  }
  set thumbnail(v: Uint8Array) {
    this.values[1] = v
  }
}
registerRecordClass(PageHashThumbnail, PageHashThumbnailRecord as never)

export class ReadProgress extends Table<ReadProgressRecord> {
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)
  readonly USER_ID = this.createField<string>('USER_ID', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly PAGE = this.createField<number>('PAGE', SQLDataType.INTEGER)
  readonly COMPLETED = this.createField<boolean>('COMPLETED', SQLDataType.BOOLEAN)
  readonly READ_DATE = this.createField<LocalDateTime>('READ_DATE', SQLDataType.LOCALDATETIME)
  readonly DEVICE_ID = this.createField<string>('device_id', SQLDataType.VARCHAR)
  readonly DEVICE_NAME = this.createField<string>('device_name', SQLDataType.VARCHAR)
  readonly LOCATOR = this.createField<Uint8Array>('locator', SQLDataType.BLOB)

  constructor(alias: string | null = null) {
    super('READ_PROGRESS', alias)
  }

  getPrimaryKey(): UniqueKey<ReadProgressRecord> | null {
    return Keys.READ_PROGRESS__PK_READ_PROGRESS as UniqueKey<ReadProgressRecord>
  }

  getReferences(): ForeignKey<ReadProgressRecord, unknown>[] {
    return [Keys.READ_PROGRESS__FK_READ_PROGRESS_PK_BOOK, Keys.READ_PROGRESS__FK_READ_PROGRESS_PK_USER] as ForeignKey<ReadProgressRecord, unknown>[]
  }
}

export class ReadProgressRecord extends TableRecordImpl<ReadProgressRecord> {
  get bookId(): string {
    return this.values[0] as string
  }
  set bookId(v: string) {
    this.values[0] = v
  }
  get userId(): string {
    return this.values[1] as string
  }
  set userId(v: string) {
    this.values[1] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[2] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[2] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[3] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[3] = v
  }
  get page(): number {
    return this.values[4] as number
  }
  set page(v: number) {
    this.values[4] = v
  }
  get completed(): boolean {
    return this.values[5] as boolean
  }
  set completed(v: boolean) {
    this.values[5] = v
  }
  get readDate(): LocalDateTime {
    return this.values[6] as LocalDateTime
  }
  set readDate(v: LocalDateTime) {
    this.values[6] = v
  }
  get deviceId(): string {
    return this.values[7] as string
  }
  set deviceId(v: string) {
    this.values[7] = v
  }
  get deviceName(): string {
    return this.values[8] as string
  }
  set deviceName(v: string) {
    this.values[8] = v
  }
  get locator(): Uint8Array {
    return this.values[9] as Uint8Array
  }
  set locator(v: Uint8Array) {
    this.values[9] = v
  }
}
registerRecordClass(ReadProgress, ReadProgressRecord as never)

export class ReadProgressSeries extends Table<ReadProgressSeriesRecord> {
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)
  readonly USER_ID = this.createField<string>('USER_ID', SQLDataType.VARCHAR)
  readonly READ_COUNT = this.createField<number>('READ_COUNT', SQLDataType.INTEGER)
  readonly IN_PROGRESS_COUNT = this.createField<number>('IN_PROGRESS_COUNT', SQLDataType.INTEGER)
  readonly MOST_RECENT_READ_DATE = this.createField<LocalDateTime>('MOST_RECENT_READ_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)

  constructor(alias: string | null = null) {
    super('READ_PROGRESS_SERIES', alias)
  }

  getPrimaryKey(): UniqueKey<ReadProgressSeriesRecord> | null {
    return Keys.READ_PROGRESS_SERIES__PK_READ_PROGRESS_SERIES as UniqueKey<ReadProgressSeriesRecord>
  }

  getReferences(): ForeignKey<ReadProgressSeriesRecord, unknown>[] {
    return [Keys.READ_PROGRESS_SERIES__FK_READ_PROGRESS_SERIES_PK_SERIES, Keys.READ_PROGRESS_SERIES__FK_READ_PROGRESS_SERIES_PK_USER] as ForeignKey<ReadProgressSeriesRecord, unknown>[]
  }
}

export class ReadProgressSeriesRecord extends TableRecordImpl<ReadProgressSeriesRecord> {
  get seriesId(): string {
    return this.values[0] as string
  }
  set seriesId(v: string) {
    this.values[0] = v
  }
  get userId(): string {
    return this.values[1] as string
  }
  set userId(v: string) {
    this.values[1] = v
  }
  get readCount(): number {
    return this.values[2] as number
  }
  set readCount(v: number) {
    this.values[2] = v
  }
  get inProgressCount(): number {
    return this.values[3] as number
  }
  set inProgressCount(v: number) {
    this.values[3] = v
  }
  get mostRecentReadDate(): LocalDateTime {
    return this.values[4] as LocalDateTime
  }
  set mostRecentReadDate(v: LocalDateTime) {
    this.values[4] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[5] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[5] = v
  }
}
registerRecordClass(ReadProgressSeries, ReadProgressSeriesRecord as never)

export class Readlist extends Table<ReadlistRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly NAME = this.createField<string>('NAME', SQLDataType.VARCHAR)
  readonly BOOK_COUNT = this.createField<number>('BOOK_COUNT', SQLDataType.INTEGER)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly SUMMARY = this.createField<string>('SUMMARY', SQLDataType.VARCHAR)
  readonly ORDERED = this.createField<boolean>('ORDERED', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('READLIST', alias)
  }

  getPrimaryKey(): UniqueKey<ReadlistRecord> | null {
    return Keys.READLIST__PK_READLIST as UniqueKey<ReadlistRecord>
  }
}

export class ReadlistRecord extends TableRecordImpl<ReadlistRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get name(): string {
    return this.values[1] as string
  }
  set name(v: string) {
    this.values[1] = v
  }
  get bookCount(): number {
    return this.values[2] as number
  }
  set bookCount(v: number) {
    this.values[2] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[3] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[3] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[4] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[4] = v
  }
  get summary(): string {
    return this.values[5] as string
  }
  set summary(v: string) {
    this.values[5] = v
  }
  get ordered(): boolean {
    return this.values[6] as boolean
  }
  set ordered(v: boolean) {
    this.values[6] = v
  }
}
registerRecordClass(Readlist, ReadlistRecord as never)

export class ReadlistBook extends Table<ReadlistBookRecord> {
  readonly READLIST_ID = this.createField<string>('READLIST_ID', SQLDataType.VARCHAR)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)
  readonly NUMBER = this.createField<number>('NUMBER', SQLDataType.INTEGER)

  constructor(alias: string | null = null) {
    super('READLIST_BOOK', alias)
  }

  getPrimaryKey(): UniqueKey<ReadlistBookRecord> | null {
    return Keys.READLIST_BOOK__PK_READLIST_BOOK as UniqueKey<ReadlistBookRecord>
  }

  getReferences(): ForeignKey<ReadlistBookRecord, unknown>[] {
    return [Keys.READLIST_BOOK__FK_READLIST_BOOK_PK_BOOK, Keys.READLIST_BOOK__FK_READLIST_BOOK_PK_READLIST] as ForeignKey<ReadlistBookRecord, unknown>[]
  }
}

export class ReadlistBookRecord extends TableRecordImpl<ReadlistBookRecord> {
  get readlistId(): string {
    return this.values[0] as string
  }
  set readlistId(v: string) {
    this.values[0] = v
  }
  get bookId(): string {
    return this.values[1] as string
  }
  set bookId(v: string) {
    this.values[1] = v
  }
  get number(): number {
    return this.values[2] as number
  }
  set number(v: number) {
    this.values[2] = v
  }
}
registerRecordClass(ReadlistBook, ReadlistBookRecord as never)

export class Series extends Table<SeriesRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly FILE_LAST_MODIFIED = this.createField<LocalDateTime>('FILE_LAST_MODIFIED', SQLDataType.LOCALDATETIME)
  readonly NAME = this.createField<string>('NAME', SQLDataType.VARCHAR)
  readonly URL = this.createField<string>('URL', SQLDataType.VARCHAR)
  readonly LIBRARY_ID = this.createField<string>('LIBRARY_ID', SQLDataType.VARCHAR)
  readonly BOOK_COUNT = this.createField<number>('BOOK_COUNT', SQLDataType.INTEGER)
  readonly DELETED_DATE = this.createField<LocalDateTime>('DELETED_DATE', SQLDataType.LOCALDATETIME)
  readonly ONESHOT = this.createField<boolean>('oneshot', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('SERIES', alias)
  }

  getPrimaryKey(): UniqueKey<SeriesRecord> | null {
    return Keys.SERIES__PK_SERIES as UniqueKey<SeriesRecord>
  }

  getReferences(): ForeignKey<SeriesRecord, unknown>[] {
    return [Keys.SERIES__FK_SERIES_PK_LIBRARY] as ForeignKey<SeriesRecord, unknown>[]
  }
}

export class SeriesRecord extends TableRecordImpl<SeriesRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[1] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[1] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[2] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[2] = v
  }
  get fileLastModified(): LocalDateTime {
    return this.values[3] as LocalDateTime
  }
  set fileLastModified(v: LocalDateTime) {
    this.values[3] = v
  }
  get name(): string {
    return this.values[4] as string
  }
  set name(v: string) {
    this.values[4] = v
  }
  get url(): string {
    return this.values[5] as string
  }
  set url(v: string) {
    this.values[5] = v
  }
  get libraryId(): string {
    return this.values[6] as string
  }
  set libraryId(v: string) {
    this.values[6] = v
  }
  get bookCount(): number {
    return this.values[7] as number
  }
  set bookCount(v: number) {
    this.values[7] = v
  }
  get deletedDate(): LocalDateTime {
    return this.values[8] as LocalDateTime
  }
  set deletedDate(v: LocalDateTime) {
    this.values[8] = v
  }
  get oneshot(): boolean {
    return this.values[9] as boolean
  }
  set oneshot(v: boolean) {
    this.values[9] = v
  }
}
registerRecordClass(Series, SeriesRecord as never)

export class SeriesAndBookTag extends Table<SeriesAndBookTagRecord> {
  readonly TAG = this.createField<string>('TAG', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SERIES_AND_BOOK_TAG', alias)
  }
}

export class SeriesAndBookTagRecord extends TableRecordImpl<SeriesAndBookTagRecord> {
  get tag(): string {
    return this.values[0] as string
  }
  set tag(v: string) {
    this.values[0] = v
  }
  get seriesId(): string {
    return this.values[1] as string
  }
  set seriesId(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(SeriesAndBookTag, SeriesAndBookTagRecord as never)

export class SeriesMetadata extends Table<SeriesMetadataRecord> {
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly STATUS = this.createField<string>('STATUS', SQLDataType.VARCHAR)
  readonly STATUS_LOCK = this.createField<boolean>('STATUS_LOCK', SQLDataType.BOOLEAN)
  readonly TITLE = this.createField<string>('TITLE', SQLDataType.VARCHAR)
  readonly TITLE_LOCK = this.createField<boolean>('TITLE_LOCK', SQLDataType.BOOLEAN)
  readonly TITLE_SORT = this.createField<string>('TITLE_SORT', SQLDataType.VARCHAR)
  readonly TITLE_SORT_LOCK = this.createField<boolean>('TITLE_SORT_LOCK', SQLDataType.BOOLEAN)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)
  readonly PUBLISHER = this.createField<string>('PUBLISHER', SQLDataType.VARCHAR)
  readonly PUBLISHER_LOCK = this.createField<boolean>('PUBLISHER_LOCK', SQLDataType.BOOLEAN)
  readonly READING_DIRECTION = this.createField<string>('READING_DIRECTION', SQLDataType.VARCHAR)
  readonly READING_DIRECTION_LOCK = this.createField<boolean>('READING_DIRECTION_LOCK', SQLDataType.BOOLEAN)
  readonly AGE_RATING = this.createField<number>('AGE_RATING', SQLDataType.INTEGER)
  readonly AGE_RATING_LOCK = this.createField<boolean>('AGE_RATING_LOCK', SQLDataType.BOOLEAN)
  readonly SUMMARY = this.createField<string>('SUMMARY', SQLDataType.VARCHAR)
  readonly SUMMARY_LOCK = this.createField<boolean>('SUMMARY_LOCK', SQLDataType.BOOLEAN)
  readonly LANGUAGE = this.createField<string>('LANGUAGE', SQLDataType.VARCHAR)
  readonly LANGUAGE_LOCK = this.createField<boolean>('LANGUAGE_LOCK', SQLDataType.BOOLEAN)
  readonly GENRES_LOCK = this.createField<boolean>('GENRES_LOCK', SQLDataType.BOOLEAN)
  readonly TAGS_LOCK = this.createField<boolean>('TAGS_LOCK', SQLDataType.BOOLEAN)
  readonly TOTAL_BOOK_COUNT = this.createField<number>('TOTAL_BOOK_COUNT', SQLDataType.INTEGER)
  readonly TOTAL_BOOK_COUNT_LOCK = this.createField<boolean>('TOTAL_BOOK_COUNT_LOCK', SQLDataType.BOOLEAN)
  readonly SHARING_LABELS_LOCK = this.createField<boolean>('SHARING_LABELS_LOCK', SQLDataType.BOOLEAN)
  readonly LINKS_LOCK = this.createField<boolean>('LINKS_LOCK', SQLDataType.BOOLEAN)
  readonly ALTERNATE_TITLES_LOCK = this.createField<boolean>('ALTERNATE_TITLES_LOCK', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('SERIES_METADATA', alias)
  }

  getPrimaryKey(): UniqueKey<SeriesMetadataRecord> | null {
    return Keys.SERIES_METADATA__PK_SERIES_METADATA as UniqueKey<SeriesMetadataRecord>
  }

  getReferences(): ForeignKey<SeriesMetadataRecord, unknown>[] {
    return [Keys.SERIES_METADATA__FK_SERIES_METADATA_PK_SERIES] as ForeignKey<SeriesMetadataRecord, unknown>[]
  }
}

export class SeriesMetadataRecord extends TableRecordImpl<SeriesMetadataRecord> {
  get createdDate(): LocalDateTime {
    return this.values[0] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[0] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[1] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[1] = v
  }
  get status(): string {
    return this.values[2] as string
  }
  set status(v: string) {
    this.values[2] = v
  }
  get statusLock(): boolean {
    return this.values[3] as boolean
  }
  set statusLock(v: boolean) {
    this.values[3] = v
  }
  get title(): string {
    return this.values[4] as string
  }
  set title(v: string) {
    this.values[4] = v
  }
  get titleLock(): boolean {
    return this.values[5] as boolean
  }
  set titleLock(v: boolean) {
    this.values[5] = v
  }
  get titleSort(): string {
    return this.values[6] as string
  }
  set titleSort(v: string) {
    this.values[6] = v
  }
  get titleSortLock(): boolean {
    return this.values[7] as boolean
  }
  set titleSortLock(v: boolean) {
    this.values[7] = v
  }
  get seriesId(): string {
    return this.values[8] as string
  }
  set seriesId(v: string) {
    this.values[8] = v
  }
  get publisher(): string {
    return this.values[9] as string
  }
  set publisher(v: string) {
    this.values[9] = v
  }
  get publisherLock(): boolean {
    return this.values[10] as boolean
  }
  set publisherLock(v: boolean) {
    this.values[10] = v
  }
  get readingDirection(): string {
    return this.values[11] as string
  }
  set readingDirection(v: string) {
    this.values[11] = v
  }
  get readingDirectionLock(): boolean {
    return this.values[12] as boolean
  }
  set readingDirectionLock(v: boolean) {
    this.values[12] = v
  }
  get ageRating(): number {
    return this.values[13] as number
  }
  set ageRating(v: number) {
    this.values[13] = v
  }
  get ageRatingLock(): boolean {
    return this.values[14] as boolean
  }
  set ageRatingLock(v: boolean) {
    this.values[14] = v
  }
  get summary(): string {
    return this.values[15] as string
  }
  set summary(v: string) {
    this.values[15] = v
  }
  get summaryLock(): boolean {
    return this.values[16] as boolean
  }
  set summaryLock(v: boolean) {
    this.values[16] = v
  }
  get language(): string {
    return this.values[17] as string
  }
  set language(v: string) {
    this.values[17] = v
  }
  get languageLock(): boolean {
    return this.values[18] as boolean
  }
  set languageLock(v: boolean) {
    this.values[18] = v
  }
  get genresLock(): boolean {
    return this.values[19] as boolean
  }
  set genresLock(v: boolean) {
    this.values[19] = v
  }
  get tagsLock(): boolean {
    return this.values[20] as boolean
  }
  set tagsLock(v: boolean) {
    this.values[20] = v
  }
  get totalBookCount(): number {
    return this.values[21] as number
  }
  set totalBookCount(v: number) {
    this.values[21] = v
  }
  get totalBookCountLock(): boolean {
    return this.values[22] as boolean
  }
  set totalBookCountLock(v: boolean) {
    this.values[22] = v
  }
  get sharingLabelsLock(): boolean {
    return this.values[23] as boolean
  }
  set sharingLabelsLock(v: boolean) {
    this.values[23] = v
  }
  get linksLock(): boolean {
    return this.values[24] as boolean
  }
  set linksLock(v: boolean) {
    this.values[24] = v
  }
  get alternateTitlesLock(): boolean {
    return this.values[25] as boolean
  }
  set alternateTitlesLock(v: boolean) {
    this.values[25] = v
  }
}
registerRecordClass(SeriesMetadata, SeriesMetadataRecord as never)

export class SeriesMetadataAlternateTitle extends Table<SeriesMetadataAlternateTitleRecord> {
  readonly LABEL = this.createField<string>('LABEL', SQLDataType.VARCHAR)
  readonly TITLE = this.createField<string>('TITLE', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SERIES_METADATA_ALTERNATE_TITLE', alias)
  }

  getReferences(): ForeignKey<SeriesMetadataAlternateTitleRecord, unknown>[] {
    return [Keys.SERIES_METADATA_ALTERNATE_TITLE__FK_SERIES_METADATA_ALTERNATE_TITLE_PK_SERIES] as ForeignKey<SeriesMetadataAlternateTitleRecord, unknown>[]
  }
}

export class SeriesMetadataAlternateTitleRecord extends TableRecordImpl<SeriesMetadataAlternateTitleRecord> {
  get label(): string {
    return this.values[0] as string
  }
  set label(v: string) {
    this.values[0] = v
  }
  get title(): string {
    return this.values[1] as string
  }
  set title(v: string) {
    this.values[1] = v
  }
  get seriesId(): string {
    return this.values[2] as string
  }
  set seriesId(v: string) {
    this.values[2] = v
  }
}
registerRecordClass(SeriesMetadataAlternateTitle, SeriesMetadataAlternateTitleRecord as never)

export class SeriesMetadataGenre extends Table<SeriesMetadataGenreRecord> {
  readonly GENRE = this.createField<string>('GENRE', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SERIES_METADATA_GENRE', alias)
  }

  getReferences(): ForeignKey<SeriesMetadataGenreRecord, unknown>[] {
    return [Keys.SERIES_METADATA_GENRE__FK_SERIES_METADATA_GENRE_PK_SERIES] as ForeignKey<SeriesMetadataGenreRecord, unknown>[]
  }
}

export class SeriesMetadataGenreRecord extends TableRecordImpl<SeriesMetadataGenreRecord> {
  get genre(): string {
    return this.values[0] as string
  }
  set genre(v: string) {
    this.values[0] = v
  }
  get seriesId(): string {
    return this.values[1] as string
  }
  set seriesId(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(SeriesMetadataGenre, SeriesMetadataGenreRecord as never)

export class SeriesMetadataLink extends Table<SeriesMetadataLinkRecord> {
  readonly LABEL = this.createField<string>('LABEL', SQLDataType.VARCHAR)
  readonly URL = this.createField<string>('URL', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SERIES_METADATA_LINK', alias)
  }

  getReferences(): ForeignKey<SeriesMetadataLinkRecord, unknown>[] {
    return [Keys.SERIES_METADATA_LINK__FK_SERIES_METADATA_LINK_PK_SERIES] as ForeignKey<SeriesMetadataLinkRecord, unknown>[]
  }
}

export class SeriesMetadataLinkRecord extends TableRecordImpl<SeriesMetadataLinkRecord> {
  get label(): string {
    return this.values[0] as string
  }
  set label(v: string) {
    this.values[0] = v
  }
  get url(): string {
    return this.values[1] as string
  }
  set url(v: string) {
    this.values[1] = v
  }
  get seriesId(): string {
    return this.values[2] as string
  }
  set seriesId(v: string) {
    this.values[2] = v
  }
}
registerRecordClass(SeriesMetadataLink, SeriesMetadataLinkRecord as never)

export class SeriesMetadataSharing extends Table<SeriesMetadataSharingRecord> {
  readonly LABEL = this.createField<string>('LABEL', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SERIES_METADATA_SHARING', alias)
  }

  getReferences(): ForeignKey<SeriesMetadataSharingRecord, unknown>[] {
    return [Keys.SERIES_METADATA_SHARING__FK_SERIES_METADATA_SHARING_PK_SERIES] as ForeignKey<SeriesMetadataSharingRecord, unknown>[]
  }
}

export class SeriesMetadataSharingRecord extends TableRecordImpl<SeriesMetadataSharingRecord> {
  get label(): string {
    return this.values[0] as string
  }
  set label(v: string) {
    this.values[0] = v
  }
  get seriesId(): string {
    return this.values[1] as string
  }
  set seriesId(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(SeriesMetadataSharing, SeriesMetadataSharingRecord as never)

export class SeriesMetadataTag extends Table<SeriesMetadataTagRecord> {
  readonly TAG = this.createField<string>('TAG', SQLDataType.VARCHAR)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SERIES_METADATA_TAG', alias)
  }

  getReferences(): ForeignKey<SeriesMetadataTagRecord, unknown>[] {
    return [Keys.SERIES_METADATA_TAG__FK_SERIES_METADATA_TAG_PK_SERIES] as ForeignKey<SeriesMetadataTagRecord, unknown>[]
  }
}

export class SeriesMetadataTagRecord extends TableRecordImpl<SeriesMetadataTagRecord> {
  get tag(): string {
    return this.values[0] as string
  }
  set tag(v: string) {
    this.values[0] = v
  }
  get seriesId(): string {
    return this.values[1] as string
  }
  set seriesId(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(SeriesMetadataTag, SeriesMetadataTagRecord as never)

export class ServerSettings extends Table<ServerSettingsRecord> {
  readonly KEY = this.createField<string>('KEY', SQLDataType.VARCHAR)
  readonly VALUE = this.createField<string>('VALUE', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SERVER_SETTINGS', alias)
  }

  getPrimaryKey(): UniqueKey<ServerSettingsRecord> | null {
    return Keys.SERVER_SETTINGS__PK_SERVER_SETTINGS as UniqueKey<ServerSettingsRecord>
  }
}

export class ServerSettingsRecord extends TableRecordImpl<ServerSettingsRecord> {
  get key(): string {
    return this.values[0] as string
  }
  set key(v: string) {
    this.values[0] = v
  }
  get value(): string {
    return this.values[1] as string
  }
  set value(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(ServerSettings, ServerSettingsRecord as never)

export class Sidecar extends Table<SidecarRecord> {
  readonly URL = this.createField<string>('URL', SQLDataType.VARCHAR)
  readonly PARENT_URL = this.createField<string>('PARENT_URL', SQLDataType.VARCHAR)
  readonly LAST_MODIFIED_TIME = this.createField<LocalDateTime>('LAST_MODIFIED_TIME', SQLDataType.LOCALDATETIME)
  readonly LIBRARY_ID = this.createField<string>('LIBRARY_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SIDECAR', alias)
  }

  getPrimaryKey(): UniqueKey<SidecarRecord> | null {
    return Keys.SIDECAR__PK_SIDECAR as UniqueKey<SidecarRecord>
  }
}

export class SidecarRecord extends TableRecordImpl<SidecarRecord> {
  get url(): string {
    return this.values[0] as string
  }
  set url(v: string) {
    this.values[0] = v
  }
  get parentUrl(): string {
    return this.values[1] as string
  }
  set parentUrl(v: string) {
    this.values[1] = v
  }
  get lastModifiedTime(): LocalDateTime {
    return this.values[2] as LocalDateTime
  }
  set lastModifiedTime(v: LocalDateTime) {
    this.values[2] = v
  }
  get libraryId(): string {
    return this.values[3] as string
  }
  set libraryId(v: string) {
    this.values[3] = v
  }
}
registerRecordClass(Sidecar, SidecarRecord as never)

export class SyncPoint extends Table<SyncPointRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly USER_ID = this.createField<string>('USER_ID', SQLDataType.VARCHAR)
  readonly API_KEY_ID = this.createField<string>('API_KEY_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SYNC_POINT', alias)
  }

  getPrimaryKey(): UniqueKey<SyncPointRecord> | null {
    return Keys.SYNC_POINT__PK_SYNC_POINT as UniqueKey<SyncPointRecord>
  }

  getReferences(): ForeignKey<SyncPointRecord, unknown>[] {
    return [Keys.SYNC_POINT__FK_SYNC_POINT_PK_USER] as ForeignKey<SyncPointRecord, unknown>[]
  }
}

export class SyncPointRecord extends TableRecordImpl<SyncPointRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[1] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[1] = v
  }
  get userId(): string {
    return this.values[2] as string
  }
  set userId(v: string) {
    this.values[2] = v
  }
  get apiKeyId(): string {
    return this.values[3] as string
  }
  set apiKeyId(v: string) {
    this.values[3] = v
  }
}
registerRecordClass(SyncPoint, SyncPointRecord as never)

export class SyncPointBook extends Table<SyncPointBookRecord> {
  readonly SYNC_POINT_ID = this.createField<string>('SYNC_POINT_ID', SQLDataType.VARCHAR)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)
  readonly BOOK_CREATED_DATE = this.createField<LocalDateTime>('BOOK_CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly BOOK_LAST_MODIFIED_DATE = this.createField<LocalDateTime>('BOOK_LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly BOOK_FILE_LAST_MODIFIED = this.createField<LocalDateTime>('BOOK_FILE_LAST_MODIFIED', SQLDataType.LOCALDATETIME)
  readonly BOOK_FILE_SIZE = this.createField<number>('BOOK_FILE_SIZE', SQLDataType.BIGINT)
  readonly BOOK_FILE_HASH = this.createField<string>('BOOK_FILE_HASH', SQLDataType.VARCHAR)
  readonly BOOK_METADATA_LAST_MODIFIED_DATE = this.createField<LocalDateTime>('BOOK_METADATA_LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly BOOK_READ_PROGRESS_LAST_MODIFIED_DATE = this.createField<LocalDateTime>('BOOK_READ_PROGRESS_LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly SYNCED = this.createField<boolean>('SYNCED', SQLDataType.BOOLEAN)
  readonly BOOK_THUMBNAIL_ID = this.createField<string>('BOOK_THUMBNAIL_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SYNC_POINT_BOOK', alias)
  }

  getPrimaryKey(): UniqueKey<SyncPointBookRecord> | null {
    return Keys.SYNC_POINT_BOOK__PK_SYNC_POINT_BOOK as UniqueKey<SyncPointBookRecord>
  }

  getReferences(): ForeignKey<SyncPointBookRecord, unknown>[] {
    return [Keys.SYNC_POINT_BOOK__FK_SYNC_POINT_BOOK_PK_SYNC_POINT] as ForeignKey<SyncPointBookRecord, unknown>[]
  }
}

export class SyncPointBookRecord extends TableRecordImpl<SyncPointBookRecord> {
  get syncPointId(): string {
    return this.values[0] as string
  }
  set syncPointId(v: string) {
    this.values[0] = v
  }
  get bookId(): string {
    return this.values[1] as string
  }
  set bookId(v: string) {
    this.values[1] = v
  }
  get bookCreatedDate(): LocalDateTime {
    return this.values[2] as LocalDateTime
  }
  set bookCreatedDate(v: LocalDateTime) {
    this.values[2] = v
  }
  get bookLastModifiedDate(): LocalDateTime {
    return this.values[3] as LocalDateTime
  }
  set bookLastModifiedDate(v: LocalDateTime) {
    this.values[3] = v
  }
  get bookFileLastModified(): LocalDateTime {
    return this.values[4] as LocalDateTime
  }
  set bookFileLastModified(v: LocalDateTime) {
    this.values[4] = v
  }
  get bookFileSize(): number {
    return this.values[5] as number
  }
  set bookFileSize(v: number) {
    this.values[5] = v
  }
  get bookFileHash(): string {
    return this.values[6] as string
  }
  set bookFileHash(v: string) {
    this.values[6] = v
  }
  get bookMetadataLastModifiedDate(): LocalDateTime {
    return this.values[7] as LocalDateTime
  }
  set bookMetadataLastModifiedDate(v: LocalDateTime) {
    this.values[7] = v
  }
  get bookReadProgressLastModifiedDate(): LocalDateTime {
    return this.values[8] as LocalDateTime
  }
  set bookReadProgressLastModifiedDate(v: LocalDateTime) {
    this.values[8] = v
  }
  get synced(): boolean {
    return this.values[9] as boolean
  }
  set synced(v: boolean) {
    this.values[9] = v
  }
  get bookThumbnailId(): string {
    return this.values[10] as string
  }
  set bookThumbnailId(v: string) {
    this.values[10] = v
  }
}
registerRecordClass(SyncPointBook, SyncPointBookRecord as never)

export class SyncPointBookRemovedSynced extends Table<SyncPointBookRemovedSyncedRecord> {
  readonly SYNC_POINT_ID = this.createField<string>('SYNC_POINT_ID', SQLDataType.VARCHAR)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SYNC_POINT_BOOK_REMOVED_SYNCED', alias)
  }

  getPrimaryKey(): UniqueKey<SyncPointBookRemovedSyncedRecord> | null {
    return Keys.SYNC_POINT_BOOK_REMOVED_SYNCED__PK_SYNC_POINT_BOOK_REMOVED_SYNCED as UniqueKey<SyncPointBookRemovedSyncedRecord>
  }

  getReferences(): ForeignKey<SyncPointBookRemovedSyncedRecord, unknown>[] {
    return [Keys.SYNC_POINT_BOOK_REMOVED_SYNCED__FK_SYNC_POINT_BOOK_REMOVED_SYNCED_PK_SYNC_POINT] as ForeignKey<SyncPointBookRemovedSyncedRecord, unknown>[]
  }
}

export class SyncPointBookRemovedSyncedRecord extends TableRecordImpl<SyncPointBookRemovedSyncedRecord> {
  get syncPointId(): string {
    return this.values[0] as string
  }
  set syncPointId(v: string) {
    this.values[0] = v
  }
  get bookId(): string {
    return this.values[1] as string
  }
  set bookId(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(SyncPointBookRemovedSynced, SyncPointBookRemovedSyncedRecord as never)

export class SyncPointReadlist extends Table<SyncPointReadlistRecord> {
  readonly SYNC_POINT_ID = this.createField<string>('SYNC_POINT_ID', SQLDataType.VARCHAR)
  readonly READLIST_ID = this.createField<string>('READLIST_ID', SQLDataType.VARCHAR)
  readonly READLIST_NAME = this.createField<string>('READLIST_NAME', SQLDataType.VARCHAR)
  readonly READLIST_CREATED_DATE = this.createField<LocalDateTime>('READLIST_CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly READLIST_LAST_MODIFIED_DATE = this.createField<LocalDateTime>('READLIST_LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly SYNCED = this.createField<boolean>('SYNCED', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('SYNC_POINT_READLIST', alias)
  }

  getPrimaryKey(): UniqueKey<SyncPointReadlistRecord> | null {
    return Keys.SYNC_POINT_READLIST__PK_SYNC_POINT_READLIST as UniqueKey<SyncPointReadlistRecord>
  }

  getReferences(): ForeignKey<SyncPointReadlistRecord, unknown>[] {
    return [Keys.SYNC_POINT_READLIST__FK_SYNC_POINT_READLIST_PK_SYNC_POINT] as ForeignKey<SyncPointReadlistRecord, unknown>[]
  }
}

export class SyncPointReadlistRecord extends TableRecordImpl<SyncPointReadlistRecord> {
  get syncPointId(): string {
    return this.values[0] as string
  }
  set syncPointId(v: string) {
    this.values[0] = v
  }
  get readlistId(): string {
    return this.values[1] as string
  }
  set readlistId(v: string) {
    this.values[1] = v
  }
  get readlistName(): string {
    return this.values[2] as string
  }
  set readlistName(v: string) {
    this.values[2] = v
  }
  get readlistCreatedDate(): LocalDateTime {
    return this.values[3] as LocalDateTime
  }
  set readlistCreatedDate(v: LocalDateTime) {
    this.values[3] = v
  }
  get readlistLastModifiedDate(): LocalDateTime {
    return this.values[4] as LocalDateTime
  }
  set readlistLastModifiedDate(v: LocalDateTime) {
    this.values[4] = v
  }
  get synced(): boolean {
    return this.values[5] as boolean
  }
  set synced(v: boolean) {
    this.values[5] = v
  }
}
registerRecordClass(SyncPointReadlist, SyncPointReadlistRecord as never)

export class SyncPointReadlistBook extends Table<SyncPointReadlistBookRecord> {
  readonly SYNC_POINT_ID = this.createField<string>('SYNC_POINT_ID', SQLDataType.VARCHAR)
  readonly READLIST_ID = this.createField<string>('READLIST_ID', SQLDataType.VARCHAR)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SYNC_POINT_READLIST_BOOK', alias)
  }

  getPrimaryKey(): UniqueKey<SyncPointReadlistBookRecord> | null {
    return Keys.SYNC_POINT_READLIST_BOOK__PK_SYNC_POINT_READLIST_BOOK as UniqueKey<SyncPointReadlistBookRecord>
  }

  getReferences(): ForeignKey<SyncPointReadlistBookRecord, unknown>[] {
    return [Keys.SYNC_POINT_READLIST_BOOK__FK_SYNC_POINT_READLIST_BOOK_PK_SYNC_POINT] as ForeignKey<SyncPointReadlistBookRecord, unknown>[]
  }
}

export class SyncPointReadlistBookRecord extends TableRecordImpl<SyncPointReadlistBookRecord> {
  get syncPointId(): string {
    return this.values[0] as string
  }
  set syncPointId(v: string) {
    this.values[0] = v
  }
  get readlistId(): string {
    return this.values[1] as string
  }
  set readlistId(v: string) {
    this.values[1] = v
  }
  get bookId(): string {
    return this.values[2] as string
  }
  set bookId(v: string) {
    this.values[2] = v
  }
}
registerRecordClass(SyncPointReadlistBook, SyncPointReadlistBookRecord as never)

export class SyncPointReadlistRemovedSynced extends Table<SyncPointReadlistRemovedSyncedRecord> {
  readonly SYNC_POINT_ID = this.createField<string>('SYNC_POINT_ID', SQLDataType.VARCHAR)
  readonly READLIST_ID = this.createField<string>('READLIST_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('SYNC_POINT_READLIST_REMOVED_SYNCED', alias)
  }

  getPrimaryKey(): UniqueKey<SyncPointReadlistRemovedSyncedRecord> | null {
    return Keys.SYNC_POINT_READLIST_REMOVED_SYNCED__PK_SYNC_POINT_READLIST_REMOVED_SYNCED as UniqueKey<SyncPointReadlistRemovedSyncedRecord>
  }

  getReferences(): ForeignKey<SyncPointReadlistRemovedSyncedRecord, unknown>[] {
    return [Keys.SYNC_POINT_READLIST_REMOVED_SYNCED__FK_SYNC_POINT_READLIST_REMOVED_SYNCED_PK_SYNC_POINT] as ForeignKey<SyncPointReadlistRemovedSyncedRecord, unknown>[]
  }
}

export class SyncPointReadlistRemovedSyncedRecord extends TableRecordImpl<SyncPointReadlistRemovedSyncedRecord> {
  get syncPointId(): string {
    return this.values[0] as string
  }
  set syncPointId(v: string) {
    this.values[0] = v
  }
  get readlistId(): string {
    return this.values[1] as string
  }
  set readlistId(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(SyncPointReadlistRemovedSynced, SyncPointReadlistRemovedSyncedRecord as never)

export class ThumbnailBook extends Table<ThumbnailBookRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly THUMBNAIL = this.createField<Uint8Array>('THUMBNAIL', SQLDataType.BLOB)
  readonly URL = this.createField<string>('URL', SQLDataType.VARCHAR)
  readonly SELECTED = this.createField<boolean>('SELECTED', SQLDataType.BOOLEAN)
  readonly TYPE = this.createField<string>('TYPE', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly BOOK_ID = this.createField<string>('BOOK_ID', SQLDataType.VARCHAR)
  readonly WIDTH = this.createField<number>('WIDTH', SQLDataType.INTEGER)
  readonly HEIGHT = this.createField<number>('HEIGHT', SQLDataType.INTEGER)
  readonly MEDIA_TYPE = this.createField<string>('MEDIA_TYPE', SQLDataType.VARCHAR)
  readonly FILE_SIZE = this.createField<number>('FILE_SIZE', SQLDataType.BIGINT)

  constructor(alias: string | null = null) {
    super('THUMBNAIL_BOOK', alias)
  }

  getPrimaryKey(): UniqueKey<ThumbnailBookRecord> | null {
    return Keys.THUMBNAIL_BOOK__PK_THUMBNAIL_BOOK as UniqueKey<ThumbnailBookRecord>
  }

  getReferences(): ForeignKey<ThumbnailBookRecord, unknown>[] {
    return [Keys.THUMBNAIL_BOOK__FK_THUMBNAIL_BOOK_PK_BOOK] as ForeignKey<ThumbnailBookRecord, unknown>[]
  }
}

export class ThumbnailBookRecord extends TableRecordImpl<ThumbnailBookRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get thumbnail(): Uint8Array {
    return this.values[1] as Uint8Array
  }
  set thumbnail(v: Uint8Array) {
    this.values[1] = v
  }
  get url(): string {
    return this.values[2] as string
  }
  set url(v: string) {
    this.values[2] = v
  }
  get selected(): boolean {
    return this.values[3] as boolean
  }
  set selected(v: boolean) {
    this.values[3] = v
  }
  get type(): string {
    return this.values[4] as string
  }
  set type(v: string) {
    this.values[4] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[5] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[5] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[6] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[6] = v
  }
  get bookId(): string {
    return this.values[7] as string
  }
  set bookId(v: string) {
    this.values[7] = v
  }
  get width(): number {
    return this.values[8] as number
  }
  set width(v: number) {
    this.values[8] = v
  }
  get height(): number {
    return this.values[9] as number
  }
  set height(v: number) {
    this.values[9] = v
  }
  get mediaType(): string {
    return this.values[10] as string
  }
  set mediaType(v: string) {
    this.values[10] = v
  }
  get fileSize(): number {
    return this.values[11] as number
  }
  set fileSize(v: number) {
    this.values[11] = v
  }
}
registerRecordClass(ThumbnailBook, ThumbnailBookRecord as never)

export class ThumbnailCollection extends Table<ThumbnailCollectionRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly SELECTED = this.createField<boolean>('SELECTED', SQLDataType.BOOLEAN)
  readonly THUMBNAIL = this.createField<Uint8Array>('THUMBNAIL', SQLDataType.BLOB)
  readonly TYPE = this.createField<string>('TYPE', SQLDataType.VARCHAR)
  readonly COLLECTION_ID = this.createField<string>('COLLECTION_ID', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly WIDTH = this.createField<number>('WIDTH', SQLDataType.INTEGER)
  readonly HEIGHT = this.createField<number>('HEIGHT', SQLDataType.INTEGER)
  readonly MEDIA_TYPE = this.createField<string>('MEDIA_TYPE', SQLDataType.VARCHAR)
  readonly FILE_SIZE = this.createField<number>('FILE_SIZE', SQLDataType.BIGINT)

  constructor(alias: string | null = null) {
    super('THUMBNAIL_COLLECTION', alias)
  }

  getPrimaryKey(): UniqueKey<ThumbnailCollectionRecord> | null {
    return Keys.THUMBNAIL_COLLECTION__PK_THUMBNAIL_COLLECTION as UniqueKey<ThumbnailCollectionRecord>
  }

  getReferences(): ForeignKey<ThumbnailCollectionRecord, unknown>[] {
    return [Keys.THUMBNAIL_COLLECTION__FK_THUMBNAIL_COLLECTION_PK_COLLECTION] as ForeignKey<ThumbnailCollectionRecord, unknown>[]
  }
}

export class ThumbnailCollectionRecord extends TableRecordImpl<ThumbnailCollectionRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get selected(): boolean {
    return this.values[1] as boolean
  }
  set selected(v: boolean) {
    this.values[1] = v
  }
  get thumbnail(): Uint8Array {
    return this.values[2] as Uint8Array
  }
  set thumbnail(v: Uint8Array) {
    this.values[2] = v
  }
  get type(): string {
    return this.values[3] as string
  }
  set type(v: string) {
    this.values[3] = v
  }
  get collectionId(): string {
    return this.values[4] as string
  }
  set collectionId(v: string) {
    this.values[4] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[5] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[5] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[6] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[6] = v
  }
  get width(): number {
    return this.values[7] as number
  }
  set width(v: number) {
    this.values[7] = v
  }
  get height(): number {
    return this.values[8] as number
  }
  set height(v: number) {
    this.values[8] = v
  }
  get mediaType(): string {
    return this.values[9] as string
  }
  set mediaType(v: string) {
    this.values[9] = v
  }
  get fileSize(): number {
    return this.values[10] as number
  }
  set fileSize(v: number) {
    this.values[10] = v
  }
}
registerRecordClass(ThumbnailCollection, ThumbnailCollectionRecord as never)

export class ThumbnailReadlist extends Table<ThumbnailReadlistRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly SELECTED = this.createField<boolean>('SELECTED', SQLDataType.BOOLEAN)
  readonly THUMBNAIL = this.createField<Uint8Array>('THUMBNAIL', SQLDataType.BLOB)
  readonly TYPE = this.createField<string>('TYPE', SQLDataType.VARCHAR)
  readonly READLIST_ID = this.createField<string>('READLIST_ID', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly WIDTH = this.createField<number>('WIDTH', SQLDataType.INTEGER)
  readonly HEIGHT = this.createField<number>('HEIGHT', SQLDataType.INTEGER)
  readonly MEDIA_TYPE = this.createField<string>('MEDIA_TYPE', SQLDataType.VARCHAR)
  readonly FILE_SIZE = this.createField<number>('FILE_SIZE', SQLDataType.BIGINT)

  constructor(alias: string | null = null) {
    super('THUMBNAIL_READLIST', alias)
  }

  getPrimaryKey(): UniqueKey<ThumbnailReadlistRecord> | null {
    return Keys.THUMBNAIL_READLIST__PK_THUMBNAIL_READLIST as UniqueKey<ThumbnailReadlistRecord>
  }

  getReferences(): ForeignKey<ThumbnailReadlistRecord, unknown>[] {
    return [Keys.THUMBNAIL_READLIST__FK_THUMBNAIL_READLIST_PK_READLIST] as ForeignKey<ThumbnailReadlistRecord, unknown>[]
  }
}

export class ThumbnailReadlistRecord extends TableRecordImpl<ThumbnailReadlistRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get selected(): boolean {
    return this.values[1] as boolean
  }
  set selected(v: boolean) {
    this.values[1] = v
  }
  get thumbnail(): Uint8Array {
    return this.values[2] as Uint8Array
  }
  set thumbnail(v: Uint8Array) {
    this.values[2] = v
  }
  get type(): string {
    return this.values[3] as string
  }
  set type(v: string) {
    this.values[3] = v
  }
  get readlistId(): string {
    return this.values[4] as string
  }
  set readlistId(v: string) {
    this.values[4] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[5] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[5] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[6] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[6] = v
  }
  get width(): number {
    return this.values[7] as number
  }
  set width(v: number) {
    this.values[7] = v
  }
  get height(): number {
    return this.values[8] as number
  }
  set height(v: number) {
    this.values[8] = v
  }
  get mediaType(): string {
    return this.values[9] as string
  }
  set mediaType(v: string) {
    this.values[9] = v
  }
  get fileSize(): number {
    return this.values[10] as number
  }
  set fileSize(v: number) {
    this.values[10] = v
  }
}
registerRecordClass(ThumbnailReadlist, ThumbnailReadlistRecord as never)

export class ThumbnailSeries extends Table<ThumbnailSeriesRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly URL = this.createField<string>('URL', SQLDataType.VARCHAR)
  readonly SELECTED = this.createField<boolean>('SELECTED', SQLDataType.BOOLEAN)
  readonly THUMBNAIL = this.createField<Uint8Array>('THUMBNAIL', SQLDataType.BLOB)
  readonly TYPE = this.createField<string>('TYPE', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly SERIES_ID = this.createField<string>('SERIES_ID', SQLDataType.VARCHAR)
  readonly WIDTH = this.createField<number>('WIDTH', SQLDataType.INTEGER)
  readonly HEIGHT = this.createField<number>('HEIGHT', SQLDataType.INTEGER)
  readonly MEDIA_TYPE = this.createField<string>('MEDIA_TYPE', SQLDataType.VARCHAR)
  readonly FILE_SIZE = this.createField<number>('FILE_SIZE', SQLDataType.BIGINT)

  constructor(alias: string | null = null) {
    super('THUMBNAIL_SERIES', alias)
  }

  getPrimaryKey(): UniqueKey<ThumbnailSeriesRecord> | null {
    return Keys.THUMBNAIL_SERIES__PK_THUMBNAIL_SERIES as UniqueKey<ThumbnailSeriesRecord>
  }

  getReferences(): ForeignKey<ThumbnailSeriesRecord, unknown>[] {
    return [Keys.THUMBNAIL_SERIES__FK_THUMBNAIL_SERIES_PK_SERIES] as ForeignKey<ThumbnailSeriesRecord, unknown>[]
  }
}

export class ThumbnailSeriesRecord extends TableRecordImpl<ThumbnailSeriesRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get url(): string {
    return this.values[1] as string
  }
  set url(v: string) {
    this.values[1] = v
  }
  get selected(): boolean {
    return this.values[2] as boolean
  }
  set selected(v: boolean) {
    this.values[2] = v
  }
  get thumbnail(): Uint8Array {
    return this.values[3] as Uint8Array
  }
  set thumbnail(v: Uint8Array) {
    this.values[3] = v
  }
  get type(): string {
    return this.values[4] as string
  }
  set type(v: string) {
    this.values[4] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[5] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[5] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[6] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[6] = v
  }
  get seriesId(): string {
    return this.values[7] as string
  }
  set seriesId(v: string) {
    this.values[7] = v
  }
  get width(): number {
    return this.values[8] as number
  }
  set width(v: number) {
    this.values[8] = v
  }
  get height(): number {
    return this.values[9] as number
  }
  set height(v: number) {
    this.values[9] = v
  }
  get mediaType(): string {
    return this.values[10] as string
  }
  set mediaType(v: string) {
    this.values[10] = v
  }
  get fileSize(): number {
    return this.values[11] as number
  }
  set fileSize(v: number) {
    this.values[11] = v
  }
}
registerRecordClass(ThumbnailSeries, ThumbnailSeriesRecord as never)

export class User extends Table<UserRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly EMAIL = this.createField<string>('EMAIL', SQLDataType.VARCHAR)
  readonly PASSWORD = this.createField<string>('PASSWORD', SQLDataType.VARCHAR)
  readonly SHARED_ALL_LIBRARIES = this.createField<boolean>('SHARED_ALL_LIBRARIES', SQLDataType.BOOLEAN)
  readonly AGE_RESTRICTION = this.createField<number>('AGE_RESTRICTION', SQLDataType.INTEGER)
  readonly AGE_RESTRICTION_ALLOW_ONLY = this.createField<boolean>('AGE_RESTRICTION_ALLOW_ONLY', SQLDataType.BOOLEAN)

  constructor(alias: string | null = null) {
    super('USER', alias)
  }

  getPrimaryKey(): UniqueKey<UserRecord> | null {
    return Keys.USER__PK_USER as UniqueKey<UserRecord>
  }
}

export class UserRecord extends TableRecordImpl<UserRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[1] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[1] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[2] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[2] = v
  }
  get email(): string {
    return this.values[3] as string
  }
  set email(v: string) {
    this.values[3] = v
  }
  get password(): string {
    return this.values[4] as string
  }
  set password(v: string) {
    this.values[4] = v
  }
  get sharedAllLibraries(): boolean {
    return this.values[5] as boolean
  }
  set sharedAllLibraries(v: boolean) {
    this.values[5] = v
  }
  get ageRestriction(): number {
    return this.values[6] as number
  }
  set ageRestriction(v: number) {
    this.values[6] = v
  }
  get ageRestrictionAllowOnly(): boolean {
    return this.values[7] as boolean
  }
  set ageRestrictionAllowOnly(v: boolean) {
    this.values[7] = v
  }
}
registerRecordClass(User, UserRecord as never)

export class UserApiKey extends Table<UserApiKeyRecord> {
  readonly ID = this.createField<string>('ID', SQLDataType.VARCHAR)
  readonly USER_ID = this.createField<string>('USER_ID', SQLDataType.VARCHAR)
  readonly CREATED_DATE = this.createField<LocalDateTime>('CREATED_DATE', SQLDataType.LOCALDATETIME)
  readonly LAST_MODIFIED_DATE = this.createField<LocalDateTime>('LAST_MODIFIED_DATE', SQLDataType.LOCALDATETIME)
  readonly API_KEY = this.createField<string>('API_KEY', SQLDataType.VARCHAR)
  readonly COMMENT = this.createField<string>('COMMENT', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('USER_API_KEY', alias)
  }

  getPrimaryKey(): UniqueKey<UserApiKeyRecord> | null {
    return Keys.USER_API_KEY__PK_USER_API_KEY as UniqueKey<UserApiKeyRecord>
  }

  getReferences(): ForeignKey<UserApiKeyRecord, unknown>[] {
    return [Keys.USER_API_KEY__FK_USER_API_KEY_PK_USER] as ForeignKey<UserApiKeyRecord, unknown>[]
  }
}

export class UserApiKeyRecord extends TableRecordImpl<UserApiKeyRecord> {
  get id(): string {
    return this.values[0] as string
  }
  set id(v: string) {
    this.values[0] = v
  }
  get userId(): string {
    return this.values[1] as string
  }
  set userId(v: string) {
    this.values[1] = v
  }
  get createdDate(): LocalDateTime {
    return this.values[2] as LocalDateTime
  }
  set createdDate(v: LocalDateTime) {
    this.values[2] = v
  }
  get lastModifiedDate(): LocalDateTime {
    return this.values[3] as LocalDateTime
  }
  set lastModifiedDate(v: LocalDateTime) {
    this.values[3] = v
  }
  get apiKey(): string {
    return this.values[4] as string
  }
  set apiKey(v: string) {
    this.values[4] = v
  }
  get comment(): string {
    return this.values[5] as string
  }
  set comment(v: string) {
    this.values[5] = v
  }
}
registerRecordClass(UserApiKey, UserApiKeyRecord as never)

export class UserLibrarySharing extends Table<UserLibrarySharingRecord> {
  readonly USER_ID = this.createField<string>('USER_ID', SQLDataType.VARCHAR)
  readonly LIBRARY_ID = this.createField<string>('LIBRARY_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('USER_LIBRARY_SHARING', alias)
  }

  getPrimaryKey(): UniqueKey<UserLibrarySharingRecord> | null {
    return Keys.USER_LIBRARY_SHARING__PK_USER_LIBRARY_SHARING as UniqueKey<UserLibrarySharingRecord>
  }

  getReferences(): ForeignKey<UserLibrarySharingRecord, unknown>[] {
    return [Keys.USER_LIBRARY_SHARING__FK_USER_LIBRARY_SHARING_PK_LIBRARY, Keys.USER_LIBRARY_SHARING__FK_USER_LIBRARY_SHARING_PK_USER] as ForeignKey<UserLibrarySharingRecord, unknown>[]
  }
}

export class UserLibrarySharingRecord extends TableRecordImpl<UserLibrarySharingRecord> {
  get userId(): string {
    return this.values[0] as string
  }
  set userId(v: string) {
    this.values[0] = v
  }
  get libraryId(): string {
    return this.values[1] as string
  }
  set libraryId(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(UserLibrarySharing, UserLibrarySharingRecord as never)

export class UserRole extends Table<UserRoleRecord> {
  readonly USER_ID = this.createField<string>('USER_ID', SQLDataType.VARCHAR)
  readonly ROLE = this.createField<string>('ROLE', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('USER_ROLE', alias)
  }

  getPrimaryKey(): UniqueKey<UserRoleRecord> | null {
    return Keys.USER_ROLE__PK_USER_ROLE as UniqueKey<UserRoleRecord>
  }

  getReferences(): ForeignKey<UserRoleRecord, unknown>[] {
    return [Keys.USER_ROLE__FK_USER_ROLE_PK_USER] as ForeignKey<UserRoleRecord, unknown>[]
  }
}

export class UserRoleRecord extends TableRecordImpl<UserRoleRecord> {
  get userId(): string {
    return this.values[0] as string
  }
  set userId(v: string) {
    this.values[0] = v
  }
  get role(): string {
    return this.values[1] as string
  }
  set role(v: string) {
    this.values[1] = v
  }
}
registerRecordClass(UserRole, UserRoleRecord as never)

export class UserSharing extends Table<UserSharingRecord> {
  readonly LABEL = this.createField<string>('LABEL', SQLDataType.VARCHAR)
  readonly ALLOW = this.createField<boolean>('ALLOW', SQLDataType.BOOLEAN)
  readonly USER_ID = this.createField<string>('USER_ID', SQLDataType.VARCHAR)

  constructor(alias: string | null = null) {
    super('USER_SHARING', alias)
  }

  getPrimaryKey(): UniqueKey<UserSharingRecord> | null {
    return Keys.USER_SHARING__PK_USER_SHARING as UniqueKey<UserSharingRecord>
  }

  getReferences(): ForeignKey<UserSharingRecord, unknown>[] {
    return [Keys.USER_SHARING__FK_USER_SHARING_PK_USER] as ForeignKey<UserSharingRecord, unknown>[]
  }
}

export class UserSharingRecord extends TableRecordImpl<UserSharingRecord> {
  get label(): string {
    return this.values[0] as string
  }
  set label(v: string) {
    this.values[0] = v
  }
  get allow(): boolean {
    return this.values[1] as boolean
  }
  set allow(v: boolean) {
    this.values[1] = v
  }
  get userId(): string {
    return this.values[2] as string
  }
  set userId(v: string) {
    this.values[2] = v
  }
}
registerRecordClass(UserSharing, UserSharingRecord as never)

export const Tables = {
  ANNOUNCEMENTS_READ: new AnnouncementsRead(),
  AUTHENTICATION_ACTIVITY: new AuthenticationActivity(),
  BOOK: new Book(),
  BOOK_METADATA: new BookMetadata(),
  BOOK_METADATA_AGGREGATION: new BookMetadataAggregation(),
  BOOK_METADATA_AGGREGATION_AUTHOR: new BookMetadataAggregationAuthor(),
  BOOK_METADATA_AGGREGATION_TAG: new BookMetadataAggregationTag(),
  BOOK_METADATA_AUTHOR: new BookMetadataAuthor(),
  BOOK_METADATA_LINK: new BookMetadataLink(),
  BOOK_METADATA_TAG: new BookMetadataTag(),
  BOOK_PROJECTION: new BookProjection(),
  CLIENT_SETTINGS_GLOBAL: new ClientSettingsGlobal(),
  CLIENT_SETTINGS_USER: new ClientSettingsUser(),
  COLLECTION: new Collection(),
  COLLECTION_SERIES: new CollectionSeries(),
  FLYWAY_SCHEMA_HISTORY: new FlywaySchemaHistory(),
  HISTORICAL_EVENT: new HistoricalEvent(),
  HISTORICAL_EVENT_PROPERTIES: new HistoricalEventProperties(),
  LIBRARY: new Library(),
  LIBRARY_EXCLUSIONS: new LibraryExclusions(),
  MEDIA: new Media(),
  MEDIA_FILE: new MediaFile(),
  MEDIA_PAGE: new MediaPage(),
  PAGE_HASH: new PageHash(),
  PAGE_HASH_THUMBNAIL: new PageHashThumbnail(),
  READ_PROGRESS: new ReadProgress(),
  READ_PROGRESS_SERIES: new ReadProgressSeries(),
  READLIST: new Readlist(),
  READLIST_BOOK: new ReadlistBook(),
  SERIES: new Series(),
  SERIES_AND_BOOK_TAG: new SeriesAndBookTag(),
  SERIES_METADATA: new SeriesMetadata(),
  SERIES_METADATA_ALTERNATE_TITLE: new SeriesMetadataAlternateTitle(),
  SERIES_METADATA_GENRE: new SeriesMetadataGenre(),
  SERIES_METADATA_LINK: new SeriesMetadataLink(),
  SERIES_METADATA_SHARING: new SeriesMetadataSharing(),
  SERIES_METADATA_TAG: new SeriesMetadataTag(),
  SERVER_SETTINGS: new ServerSettings(),
  SIDECAR: new Sidecar(),
  SYNC_POINT: new SyncPoint(),
  SYNC_POINT_BOOK: new SyncPointBook(),
  SYNC_POINT_BOOK_REMOVED_SYNCED: new SyncPointBookRemovedSynced(),
  SYNC_POINT_READLIST: new SyncPointReadlist(),
  SYNC_POINT_READLIST_BOOK: new SyncPointReadlistBook(),
  SYNC_POINT_READLIST_REMOVED_SYNCED: new SyncPointReadlistRemovedSynced(),
  THUMBNAIL_BOOK: new ThumbnailBook(),
  THUMBNAIL_COLLECTION: new ThumbnailCollection(),
  THUMBNAIL_READLIST: new ThumbnailReadlist(),
  THUMBNAIL_SERIES: new ThumbnailSeries(),
  USER: new User(),
  USER_API_KEY: new UserApiKey(),
  USER_LIBRARY_SHARING: new UserLibrarySharing(),
  USER_ROLE: new UserRole(),
  USER_SHARING: new UserSharing(),
}

export const ANNOUNCEMENTS_READ = Tables.ANNOUNCEMENTS_READ
export const AUTHENTICATION_ACTIVITY = Tables.AUTHENTICATION_ACTIVITY
export const BOOK = Tables.BOOK
export const BOOK_METADATA = Tables.BOOK_METADATA
export const BOOK_METADATA_AGGREGATION = Tables.BOOK_METADATA_AGGREGATION
export const BOOK_METADATA_AGGREGATION_AUTHOR = Tables.BOOK_METADATA_AGGREGATION_AUTHOR
export const BOOK_METADATA_AGGREGATION_TAG = Tables.BOOK_METADATA_AGGREGATION_TAG
export const BOOK_METADATA_AUTHOR = Tables.BOOK_METADATA_AUTHOR
export const BOOK_METADATA_LINK = Tables.BOOK_METADATA_LINK
export const BOOK_METADATA_TAG = Tables.BOOK_METADATA_TAG
export const BOOK_PROJECTION = Tables.BOOK_PROJECTION
export const CLIENT_SETTINGS_GLOBAL = Tables.CLIENT_SETTINGS_GLOBAL
export const CLIENT_SETTINGS_USER = Tables.CLIENT_SETTINGS_USER
export const COLLECTION = Tables.COLLECTION
export const COLLECTION_SERIES = Tables.COLLECTION_SERIES
export const FLYWAY_SCHEMA_HISTORY = Tables.FLYWAY_SCHEMA_HISTORY
export const HISTORICAL_EVENT = Tables.HISTORICAL_EVENT
export const HISTORICAL_EVENT_PROPERTIES = Tables.HISTORICAL_EVENT_PROPERTIES
export const LIBRARY = Tables.LIBRARY
export const LIBRARY_EXCLUSIONS = Tables.LIBRARY_EXCLUSIONS
export const MEDIA = Tables.MEDIA
export const MEDIA_FILE = Tables.MEDIA_FILE
export const MEDIA_PAGE = Tables.MEDIA_PAGE
export const PAGE_HASH = Tables.PAGE_HASH
export const PAGE_HASH_THUMBNAIL = Tables.PAGE_HASH_THUMBNAIL
export const READ_PROGRESS = Tables.READ_PROGRESS
export const READ_PROGRESS_SERIES = Tables.READ_PROGRESS_SERIES
export const READLIST = Tables.READLIST
export const READLIST_BOOK = Tables.READLIST_BOOK
export const SERIES = Tables.SERIES
export const SERIES_AND_BOOK_TAG = Tables.SERIES_AND_BOOK_TAG
export const SERIES_METADATA = Tables.SERIES_METADATA
export const SERIES_METADATA_ALTERNATE_TITLE = Tables.SERIES_METADATA_ALTERNATE_TITLE
export const SERIES_METADATA_GENRE = Tables.SERIES_METADATA_GENRE
export const SERIES_METADATA_LINK = Tables.SERIES_METADATA_LINK
export const SERIES_METADATA_SHARING = Tables.SERIES_METADATA_SHARING
export const SERIES_METADATA_TAG = Tables.SERIES_METADATA_TAG
export const SERVER_SETTINGS = Tables.SERVER_SETTINGS
export const SIDECAR = Tables.SIDECAR
export const SYNC_POINT = Tables.SYNC_POINT
export const SYNC_POINT_BOOK = Tables.SYNC_POINT_BOOK
export const SYNC_POINT_BOOK_REMOVED_SYNCED = Tables.SYNC_POINT_BOOK_REMOVED_SYNCED
export const SYNC_POINT_READLIST = Tables.SYNC_POINT_READLIST
export const SYNC_POINT_READLIST_BOOK = Tables.SYNC_POINT_READLIST_BOOK
export const SYNC_POINT_READLIST_REMOVED_SYNCED = Tables.SYNC_POINT_READLIST_REMOVED_SYNCED
export const THUMBNAIL_BOOK = Tables.THUMBNAIL_BOOK
export const THUMBNAIL_COLLECTION = Tables.THUMBNAIL_COLLECTION
export const THUMBNAIL_READLIST = Tables.THUMBNAIL_READLIST
export const THUMBNAIL_SERIES = Tables.THUMBNAIL_SERIES
export const USER = Tables.USER
export const USER_API_KEY = Tables.USER_API_KEY
export const USER_LIBRARY_SHARING = Tables.USER_LIBRARY_SHARING
export const USER_ROLE = Tables.USER_ROLE
export const USER_SHARING = Tables.USER_SHARING

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Keys: { [k: string]: any } = {
  ANNOUNCEMENTS_READ__PK_ANNOUNCEMENTS_READ: new UniqueKey(Tables.ANNOUNCEMENTS_READ, 'pk_ANNOUNCEMENTS_READ', ["USER_ID","ANNOUNCEMENT_ID"]),
  BOOK__PK_BOOK: new UniqueKey(Tables.BOOK, 'pk_BOOK', ["ID"]),
  BOOK_METADATA__PK_BOOK_METADATA: new UniqueKey(Tables.BOOK_METADATA, 'pk_BOOK_METADATA', ["BOOK_ID"]),
  BOOK_METADATA_AGGREGATION__PK_BOOK_METADATA_AGGREGATION: new UniqueKey(Tables.BOOK_METADATA_AGGREGATION, 'pk_BOOK_METADATA_AGGREGATION', ["SERIES_ID"]),
  BOOK_PROJECTION__PK_BOOK_PROJECTION: new UniqueKey(Tables.BOOK_PROJECTION, 'pk_BOOK_PROJECTION', ["BOOK_ID","PROFILE"]),
  CLIENT_SETTINGS_GLOBAL__PK_CLIENT_SETTINGS_GLOBAL: new UniqueKey(Tables.CLIENT_SETTINGS_GLOBAL, 'pk_CLIENT_SETTINGS_GLOBAL', ["KEY"]),
  CLIENT_SETTINGS_USER__PK_CLIENT_SETTINGS_USER: new UniqueKey(Tables.CLIENT_SETTINGS_USER, 'pk_CLIENT_SETTINGS_USER', ["KEY","USER_ID"]),
  COLLECTION__PK_COLLECTION: new UniqueKey(Tables.COLLECTION, 'pk_COLLECTION', ["ID"]),
  COLLECTION_SERIES__PK_COLLECTION_SERIES: new UniqueKey(Tables.COLLECTION_SERIES, 'pk_COLLECTION_SERIES', ["COLLECTION_ID","SERIES_ID"]),
  FLYWAY_SCHEMA_HISTORY__PK_FLYWAY_SCHEMA_HISTORY: new UniqueKey(Tables.FLYWAY_SCHEMA_HISTORY, 'pk_flyway_schema_history', ["INSTALLED_RANK"]),
  HISTORICAL_EVENT__PK_HISTORICAL_EVENT: new UniqueKey(Tables.HISTORICAL_EVENT, 'pk_HISTORICAL_EVENT', ["ID"]),
  HISTORICAL_EVENT_PROPERTIES__PK_HISTORICAL_EVENT_PROPERTIES: new UniqueKey(Tables.HISTORICAL_EVENT_PROPERTIES, 'pk_HISTORICAL_EVENT_PROPERTIES', ["ID","KEY"]),
  LIBRARY__PK_LIBRARY: new UniqueKey(Tables.LIBRARY, 'pk_LIBRARY', ["ID"]),
  LIBRARY_EXCLUSIONS__PK_LIBRARY_EXCLUSIONS: new UniqueKey(Tables.LIBRARY_EXCLUSIONS, 'pk_LIBRARY_EXCLUSIONS', ["LIBRARY_ID","EXCLUSION"]),
  MEDIA__PK_MEDIA: new UniqueKey(Tables.MEDIA, 'pk_MEDIA', ["BOOK_ID"]),
  MEDIA_PAGE__PK_MEDIA_PAGE: new UniqueKey(Tables.MEDIA_PAGE, 'pk_MEDIA_PAGE', ["BOOK_ID","NUMBER"]),
  PAGE_HASH__PK_PAGE_HASH: new UniqueKey(Tables.PAGE_HASH, 'pk_PAGE_HASH', ["HASH"]),
  PAGE_HASH_THUMBNAIL__PK_PAGE_HASH_THUMBNAIL: new UniqueKey(Tables.PAGE_HASH_THUMBNAIL, 'pk_PAGE_HASH_THUMBNAIL', ["HASH"]),
  READ_PROGRESS__PK_READ_PROGRESS: new UniqueKey(Tables.READ_PROGRESS, 'pk_READ_PROGRESS', ["BOOK_ID","USER_ID"]),
  READ_PROGRESS_SERIES__PK_READ_PROGRESS_SERIES: new UniqueKey(Tables.READ_PROGRESS_SERIES, 'pk_READ_PROGRESS_SERIES', ["SERIES_ID","USER_ID"]),
  READLIST__PK_READLIST: new UniqueKey(Tables.READLIST, 'pk_READLIST', ["ID"]),
  READLIST_BOOK__PK_READLIST_BOOK: new UniqueKey(Tables.READLIST_BOOK, 'pk_READLIST_BOOK', ["READLIST_ID","BOOK_ID"]),
  SERIES__PK_SERIES: new UniqueKey(Tables.SERIES, 'pk_SERIES', ["ID"]),
  SERIES_METADATA__PK_SERIES_METADATA: new UniqueKey(Tables.SERIES_METADATA, 'pk_SERIES_METADATA', ["SERIES_ID"]),
  SERVER_SETTINGS__PK_SERVER_SETTINGS: new UniqueKey(Tables.SERVER_SETTINGS, 'pk_SERVER_SETTINGS', ["KEY"]),
  SIDECAR__PK_SIDECAR: new UniqueKey(Tables.SIDECAR, 'pk_SIDECAR', ["URL"]),
  SYNC_POINT__PK_SYNC_POINT: new UniqueKey(Tables.SYNC_POINT, 'pk_SYNC_POINT', ["ID"]),
  SYNC_POINT_BOOK__PK_SYNC_POINT_BOOK: new UniqueKey(Tables.SYNC_POINT_BOOK, 'pk_SYNC_POINT_BOOK', ["SYNC_POINT_ID","BOOK_ID"]),
  SYNC_POINT_BOOK_REMOVED_SYNCED__PK_SYNC_POINT_BOOK_REMOVED_SYNCED: new UniqueKey(Tables.SYNC_POINT_BOOK_REMOVED_SYNCED, 'pk_SYNC_POINT_BOOK_REMOVED_SYNCED', ["SYNC_POINT_ID","BOOK_ID"]),
  SYNC_POINT_READLIST__PK_SYNC_POINT_READLIST: new UniqueKey(Tables.SYNC_POINT_READLIST, 'pk_SYNC_POINT_READLIST', ["SYNC_POINT_ID","READLIST_ID"]),
  SYNC_POINT_READLIST_BOOK__PK_SYNC_POINT_READLIST_BOOK: new UniqueKey(Tables.SYNC_POINT_READLIST_BOOK, 'pk_SYNC_POINT_READLIST_BOOK', ["SYNC_POINT_ID","READLIST_ID","BOOK_ID"]),
  SYNC_POINT_READLIST_REMOVED_SYNCED__PK_SYNC_POINT_READLIST_REMOVED_SYNCED: new UniqueKey(Tables.SYNC_POINT_READLIST_REMOVED_SYNCED, 'pk_SYNC_POINT_READLIST_REMOVED_SYNCED', ["SYNC_POINT_ID","READLIST_ID"]),
  THUMBNAIL_BOOK__PK_THUMBNAIL_BOOK: new UniqueKey(Tables.THUMBNAIL_BOOK, 'pk_THUMBNAIL_BOOK', ["ID"]),
  THUMBNAIL_COLLECTION__PK_THUMBNAIL_COLLECTION: new UniqueKey(Tables.THUMBNAIL_COLLECTION, 'pk_THUMBNAIL_COLLECTION', ["ID"]),
  THUMBNAIL_READLIST__PK_THUMBNAIL_READLIST: new UniqueKey(Tables.THUMBNAIL_READLIST, 'pk_THUMBNAIL_READLIST', ["ID"]),
  THUMBNAIL_SERIES__PK_THUMBNAIL_SERIES: new UniqueKey(Tables.THUMBNAIL_SERIES, 'pk_THUMBNAIL_SERIES', ["ID"]),
  USER__PK_USER: new UniqueKey(Tables.USER, 'pk_USER', ["ID"]),
  USER__UK_USER_1_21495358: new UniqueKey(Tables.USER, 'uk_USER_1_21495358', ["EMAIL"]),
  USER_API_KEY__PK_USER_API_KEY: new UniqueKey(Tables.USER_API_KEY, 'pk_USER_API_KEY', ["ID"]),
  USER_API_KEY__UK_USER_API_KEY_1_98712751: new UniqueKey(Tables.USER_API_KEY, 'uk_USER_API_KEY_1_98712751', ["API_KEY"]),
  USER_LIBRARY_SHARING__PK_USER_LIBRARY_SHARING: new UniqueKey(Tables.USER_LIBRARY_SHARING, 'pk_USER_LIBRARY_SHARING', ["USER_ID","LIBRARY_ID"]),
  USER_ROLE__PK_USER_ROLE: new UniqueKey(Tables.USER_ROLE, 'pk_USER_ROLE', ["USER_ID","ROLE"]),
  USER_SHARING__PK_USER_SHARING: new UniqueKey(Tables.USER_SHARING, 'pk_USER_SHARING', ["LABEL","ALLOW","USER_ID"]),
}
const FKS = {
  ANNOUNCEMENTS_READ__FK_ANNOUNCEMENTS_READ_PK_USER: new ForeignKey(Tables.ANNOUNCEMENTS_READ, 'fk_ANNOUNCEMENTS_READ_pk_USER', ["USER_ID"], Keys.USER__PK_USER as UniqueKey<unknown>, ["ID"]),
  AUTHENTICATION_ACTIVITY__FK_AUTHENTICATION_ACTIVITY_PK_USER: new ForeignKey(Tables.AUTHENTICATION_ACTIVITY, 'fk_AUTHENTICATION_ACTIVITY_pk_USER', ["USER_ID"], Keys.USER__PK_USER as UniqueKey<unknown>, ["ID"]),
  BOOK__FK_BOOK_PK_LIBRARY: new ForeignKey(Tables.BOOK, 'fk_BOOK_pk_LIBRARY', ["LIBRARY_ID"], Keys.LIBRARY__PK_LIBRARY as UniqueKey<unknown>, ["ID"]),
  BOOK__FK_BOOK_PK_SERIES: new ForeignKey(Tables.BOOK, 'fk_BOOK_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  BOOK_METADATA__FK_BOOK_METADATA_PK_BOOK: new ForeignKey(Tables.BOOK_METADATA, 'fk_BOOK_METADATA_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  BOOK_METADATA_AGGREGATION__FK_BOOK_METADATA_AGGREGATION_PK_SERIES: new ForeignKey(Tables.BOOK_METADATA_AGGREGATION, 'fk_BOOK_METADATA_AGGREGATION_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  BOOK_METADATA_AGGREGATION_AUTHOR__FK_BOOK_METADATA_AGGREGATION_AUTHOR_PK_SERIES: new ForeignKey(Tables.BOOK_METADATA_AGGREGATION_AUTHOR, 'fk_BOOK_METADATA_AGGREGATION_AUTHOR_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  BOOK_METADATA_AGGREGATION_TAG__FK_BOOK_METADATA_AGGREGATION_TAG_PK_SERIES: new ForeignKey(Tables.BOOK_METADATA_AGGREGATION_TAG, 'fk_BOOK_METADATA_AGGREGATION_TAG_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  BOOK_METADATA_AUTHOR__FK_BOOK_METADATA_AUTHOR_PK_BOOK: new ForeignKey(Tables.BOOK_METADATA_AUTHOR, 'fk_BOOK_METADATA_AUTHOR_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  BOOK_METADATA_LINK__FK_BOOK_METADATA_LINK_PK_BOOK: new ForeignKey(Tables.BOOK_METADATA_LINK, 'fk_BOOK_METADATA_LINK_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  BOOK_METADATA_TAG__FK_BOOK_METADATA_TAG_PK_BOOK: new ForeignKey(Tables.BOOK_METADATA_TAG, 'fk_BOOK_METADATA_TAG_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  BOOK_PROJECTION__FK_BOOK_PROJECTION_PK_BOOK: new ForeignKey(Tables.BOOK_PROJECTION, 'fk_BOOK_PROJECTION_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  CLIENT_SETTINGS_USER__FK_CLIENT_SETTINGS_USER_PK_USER: new ForeignKey(Tables.CLIENT_SETTINGS_USER, 'fk_CLIENT_SETTINGS_USER_pk_USER', ["USER_ID"], Keys.USER__PK_USER as UniqueKey<unknown>, ["ID"]),
  COLLECTION_SERIES__FK_COLLECTION_SERIES_PK_COLLECTION: new ForeignKey(Tables.COLLECTION_SERIES, 'fk_COLLECTION_SERIES_pk_COLLECTION', ["COLLECTION_ID"], Keys.COLLECTION__PK_COLLECTION as UniqueKey<unknown>, ["ID"]),
  COLLECTION_SERIES__FK_COLLECTION_SERIES_PK_SERIES: new ForeignKey(Tables.COLLECTION_SERIES, 'fk_COLLECTION_SERIES_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  HISTORICAL_EVENT_PROPERTIES__FK_HISTORICAL_EVENT_PROPERTIES_PK_HISTORICAL_EVENT: new ForeignKey(Tables.HISTORICAL_EVENT_PROPERTIES, 'fk_HISTORICAL_EVENT_PROPERTIES_pk_HISTORICAL_EVENT', ["ID"], Keys.HISTORICAL_EVENT__PK_HISTORICAL_EVENT as UniqueKey<unknown>, ["ID"]),
  LIBRARY_EXCLUSIONS__FK_LIBRARY_EXCLUSIONS_PK_LIBRARY: new ForeignKey(Tables.LIBRARY_EXCLUSIONS, 'fk_LIBRARY_EXCLUSIONS_pk_LIBRARY', ["LIBRARY_ID"], Keys.LIBRARY__PK_LIBRARY as UniqueKey<unknown>, ["ID"]),
  MEDIA__FK_MEDIA_PK_BOOK: new ForeignKey(Tables.MEDIA, 'fk_MEDIA_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  MEDIA_FILE__FK_MEDIA_FILE_PK_BOOK: new ForeignKey(Tables.MEDIA_FILE, 'fk_MEDIA_FILE_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  MEDIA_PAGE__FK_MEDIA_PAGE_PK_BOOK: new ForeignKey(Tables.MEDIA_PAGE, 'fk_MEDIA_PAGE_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  READ_PROGRESS__FK_READ_PROGRESS_PK_BOOK: new ForeignKey(Tables.READ_PROGRESS, 'fk_READ_PROGRESS_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  READ_PROGRESS__FK_READ_PROGRESS_PK_USER: new ForeignKey(Tables.READ_PROGRESS, 'fk_READ_PROGRESS_pk_USER', ["USER_ID"], Keys.USER__PK_USER as UniqueKey<unknown>, ["ID"]),
  READ_PROGRESS_SERIES__FK_READ_PROGRESS_SERIES_PK_SERIES: new ForeignKey(Tables.READ_PROGRESS_SERIES, 'fk_READ_PROGRESS_SERIES_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  READ_PROGRESS_SERIES__FK_READ_PROGRESS_SERIES_PK_USER: new ForeignKey(Tables.READ_PROGRESS_SERIES, 'fk_READ_PROGRESS_SERIES_pk_USER', ["USER_ID"], Keys.USER__PK_USER as UniqueKey<unknown>, ["ID"]),
  READLIST_BOOK__FK_READLIST_BOOK_PK_BOOK: new ForeignKey(Tables.READLIST_BOOK, 'fk_READLIST_BOOK_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  READLIST_BOOK__FK_READLIST_BOOK_PK_READLIST: new ForeignKey(Tables.READLIST_BOOK, 'fk_READLIST_BOOK_pk_READLIST', ["READLIST_ID"], Keys.READLIST__PK_READLIST as UniqueKey<unknown>, ["ID"]),
  SERIES__FK_SERIES_PK_LIBRARY: new ForeignKey(Tables.SERIES, 'fk_SERIES_pk_LIBRARY', ["LIBRARY_ID"], Keys.LIBRARY__PK_LIBRARY as UniqueKey<unknown>, ["ID"]),
  SERIES_METADATA__FK_SERIES_METADATA_PK_SERIES: new ForeignKey(Tables.SERIES_METADATA, 'fk_SERIES_METADATA_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  SERIES_METADATA_ALTERNATE_TITLE__FK_SERIES_METADATA_ALTERNATE_TITLE_PK_SERIES: new ForeignKey(Tables.SERIES_METADATA_ALTERNATE_TITLE, 'fk_SERIES_METADATA_ALTERNATE_TITLE_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  SERIES_METADATA_GENRE__FK_SERIES_METADATA_GENRE_PK_SERIES: new ForeignKey(Tables.SERIES_METADATA_GENRE, 'fk_SERIES_METADATA_GENRE_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  SERIES_METADATA_LINK__FK_SERIES_METADATA_LINK_PK_SERIES: new ForeignKey(Tables.SERIES_METADATA_LINK, 'fk_SERIES_METADATA_LINK_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  SERIES_METADATA_SHARING__FK_SERIES_METADATA_SHARING_PK_SERIES: new ForeignKey(Tables.SERIES_METADATA_SHARING, 'fk_SERIES_METADATA_SHARING_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  SERIES_METADATA_TAG__FK_SERIES_METADATA_TAG_PK_SERIES: new ForeignKey(Tables.SERIES_METADATA_TAG, 'fk_SERIES_METADATA_TAG_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  SYNC_POINT__FK_SYNC_POINT_PK_USER: new ForeignKey(Tables.SYNC_POINT, 'fk_SYNC_POINT_pk_USER', ["USER_ID"], Keys.USER__PK_USER as UniqueKey<unknown>, ["ID"]),
  SYNC_POINT_BOOK__FK_SYNC_POINT_BOOK_PK_SYNC_POINT: new ForeignKey(Tables.SYNC_POINT_BOOK, 'fk_SYNC_POINT_BOOK_pk_SYNC_POINT', ["SYNC_POINT_ID"], Keys.SYNC_POINT__PK_SYNC_POINT as UniqueKey<unknown>, ["ID"]),
  SYNC_POINT_BOOK_REMOVED_SYNCED__FK_SYNC_POINT_BOOK_REMOVED_SYNCED_PK_SYNC_POINT: new ForeignKey(Tables.SYNC_POINT_BOOK_REMOVED_SYNCED, 'fk_SYNC_POINT_BOOK_REMOVED_SYNCED_pk_SYNC_POINT', ["SYNC_POINT_ID"], Keys.SYNC_POINT__PK_SYNC_POINT as UniqueKey<unknown>, ["ID"]),
  SYNC_POINT_READLIST__FK_SYNC_POINT_READLIST_PK_SYNC_POINT: new ForeignKey(Tables.SYNC_POINT_READLIST, 'fk_SYNC_POINT_READLIST_pk_SYNC_POINT', ["SYNC_POINT_ID"], Keys.SYNC_POINT__PK_SYNC_POINT as UniqueKey<unknown>, ["ID"]),
  SYNC_POINT_READLIST_BOOK__FK_SYNC_POINT_READLIST_BOOK_PK_SYNC_POINT: new ForeignKey(Tables.SYNC_POINT_READLIST_BOOK, 'fk_SYNC_POINT_READLIST_BOOK_pk_SYNC_POINT', ["SYNC_POINT_ID"], Keys.SYNC_POINT__PK_SYNC_POINT as UniqueKey<unknown>, ["ID"]),
  SYNC_POINT_READLIST_REMOVED_SYNCED__FK_SYNC_POINT_READLIST_REMOVED_SYNCED_PK_SYNC_POINT: new ForeignKey(Tables.SYNC_POINT_READLIST_REMOVED_SYNCED, 'fk_SYNC_POINT_READLIST_REMOVED_SYNCED_pk_SYNC_POINT', ["SYNC_POINT_ID"], Keys.SYNC_POINT__PK_SYNC_POINT as UniqueKey<unknown>, ["ID"]),
  THUMBNAIL_BOOK__FK_THUMBNAIL_BOOK_PK_BOOK: new ForeignKey(Tables.THUMBNAIL_BOOK, 'fk_THUMBNAIL_BOOK_pk_BOOK', ["BOOK_ID"], Keys.BOOK__PK_BOOK as UniqueKey<unknown>, ["ID"]),
  THUMBNAIL_COLLECTION__FK_THUMBNAIL_COLLECTION_PK_COLLECTION: new ForeignKey(Tables.THUMBNAIL_COLLECTION, 'fk_THUMBNAIL_COLLECTION_pk_COLLECTION', ["COLLECTION_ID"], Keys.COLLECTION__PK_COLLECTION as UniqueKey<unknown>, ["ID"]),
  THUMBNAIL_READLIST__FK_THUMBNAIL_READLIST_PK_READLIST: new ForeignKey(Tables.THUMBNAIL_READLIST, 'fk_THUMBNAIL_READLIST_pk_READLIST', ["READLIST_ID"], Keys.READLIST__PK_READLIST as UniqueKey<unknown>, ["ID"]),
  THUMBNAIL_SERIES__FK_THUMBNAIL_SERIES_PK_SERIES: new ForeignKey(Tables.THUMBNAIL_SERIES, 'fk_THUMBNAIL_SERIES_pk_SERIES', ["SERIES_ID"], Keys.SERIES__PK_SERIES as UniqueKey<unknown>, ["ID"]),
  USER_API_KEY__FK_USER_API_KEY_PK_USER: new ForeignKey(Tables.USER_API_KEY, 'fk_USER_API_KEY_pk_USER', ["USER_ID"], Keys.USER__PK_USER as UniqueKey<unknown>, ["ID"]),
  USER_LIBRARY_SHARING__FK_USER_LIBRARY_SHARING_PK_LIBRARY: new ForeignKey(Tables.USER_LIBRARY_SHARING, 'fk_USER_LIBRARY_SHARING_pk_LIBRARY', ["LIBRARY_ID"], Keys.LIBRARY__PK_LIBRARY as UniqueKey<unknown>, ["ID"]),
  USER_LIBRARY_SHARING__FK_USER_LIBRARY_SHARING_PK_USER: new ForeignKey(Tables.USER_LIBRARY_SHARING, 'fk_USER_LIBRARY_SHARING_pk_USER', ["USER_ID"], Keys.USER__PK_USER as UniqueKey<unknown>, ["ID"]),
  USER_ROLE__FK_USER_ROLE_PK_USER: new ForeignKey(Tables.USER_ROLE, 'fk_USER_ROLE_pk_USER', ["USER_ID"], Keys.USER__PK_USER as UniqueKey<unknown>, ["ID"]),
  USER_SHARING__FK_USER_SHARING_PK_USER: new ForeignKey(Tables.USER_SHARING, 'fk_USER_SHARING_pk_USER', ["USER_ID"], Keys.USER__PK_USER as UniqueKey<unknown>, ["ID"]),
}
Object.assign(Keys, FKS)
