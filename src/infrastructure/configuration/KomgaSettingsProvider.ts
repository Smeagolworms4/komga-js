// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/configuration/KomgaSettingsProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Duration } from '@js-joda/core'
import { randomInt } from 'node:crypto'
import { ThumbnailSize } from '../../domain/model/ThumbnailSize.js'
import { ServerSettingsDao } from '../jooq/main/ServerSettingsDao.js'
import { KEnum, isBlank } from '../../port/kotlin.js'
import { ApplicationEventPublisher, component } from '../../port/spring.js'
import { SettingChangedEvent } from './SettingChangedEvent.js'

// PORT: RandomStringUtils.secure().nextAlphanumeric(count) : caractères [A-Za-z0-9] tirés par un générateur sûr
const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function nextAlphanumeric(count: number): string {
  let s = ''
  for (let i = 0; i < count; i++) s += ALPHANUMERIC.charAt(randomInt(ALPHANUMERIC.length))
  return s
}

// PORT: propriétés Kotlin avec setter personnalisé -> champ privé `_x` + accesseurs get/set,
// initialisés dans le constructeur dans l'ordre de déclaration Kotlin.
// kotlin.time.Duration -> Duration de js-joda
export class KomgaSettingsProvider {
  private _deleteEmptyCollections: boolean
  private _deleteEmptyReadLists: boolean
  private _rememberMeKey!: string
  private _rememberMeDuration: Duration
  private _thumbnailSize: ThumbnailSize
  private _taskPoolSize: number
  private _serverPort: number | null
  private _serverContextPath: string | null
  private _koboProxy: boolean
  private _koboPort: number | null
  private _kepubifyPath: string | null

  constructor(
    private readonly serverSettingsDao: ServerSettingsDao,
    private readonly eventPublisher: ApplicationEventPublisher,
  ) {
    this._deleteEmptyCollections = this.serverSettingsDao.getSettingByKey<boolean>(Settings.DELETE_EMPTY_COLLECTIONS.name, Boolean) ?? false
    this._deleteEmptyReadLists = this.serverSettingsDao.getSettingByKey<boolean>(Settings.DELETE_EMPTY_READLISTS.name, Boolean) ?? false
    this._rememberMeKey =
      this.serverSettingsDao.getSettingByKey<string>(Settings.REMEMBER_ME_KEY.name, String) ??
      ((): string => {
        const it = this.getRandomRememberMeKey()
        this.rememberMeKey = it
        return it
      })()
    this._rememberMeDuration = Duration.ofDays(this.serverSettingsDao.getSettingByKey<number>(Settings.REMEMBER_ME_DURATION.name, Number) ?? 365)
    const thumbnailSize = this.serverSettingsDao.getSettingByKey<string>(Settings.THUMBNAIL_SIZE.name, String)
    this._thumbnailSize = (thumbnailSize !== null ? ThumbnailSize.valueOf(thumbnailSize) : null) ?? ThumbnailSize.DEFAULT
    this._taskPoolSize = this.serverSettingsDao.getSettingByKey<number>(Settings.TASK_POOL_SIZE.name, Number) ?? 1
    this._serverPort = this.serverSettingsDao.getSettingByKey<number>(Settings.SERVER_PORT.name, Number)
    this._serverContextPath = this.serverSettingsDao.getSettingByKey<string>(Settings.SERVER_CONTEXT_PATH.name, String)
    this._koboProxy = this.serverSettingsDao.getSettingByKey<boolean>(Settings.KOBO_PROXY.name, Boolean) ?? false
    this._koboPort = this.serverSettingsDao.getSettingByKey<number>(Settings.KOBO_PORT.name, Number)
    const kepubifyPath = this.serverSettingsDao.getSettingByKey<string>(Settings.KEPUBIFY_PATH.name, String)
    this._kepubifyPath = kepubifyPath !== null ? (isBlank(kepubifyPath) ? null : kepubifyPath) : null
  }

  get deleteEmptyCollections(): boolean {
    return this._deleteEmptyCollections
  }

  set deleteEmptyCollections(value: boolean) {
    this.serverSettingsDao.saveSetting(Settings.DELETE_EMPTY_COLLECTIONS.name, value)
    this._deleteEmptyCollections = value
  }

  get deleteEmptyReadLists(): boolean {
    return this._deleteEmptyReadLists
  }

  set deleteEmptyReadLists(value: boolean) {
    this.serverSettingsDao.saveSetting(Settings.DELETE_EMPTY_READLISTS.name, value)
    this._deleteEmptyReadLists = value
  }

  get rememberMeKey(): string {
    return this._rememberMeKey
  }

  set rememberMeKey(value: string) {
    this.serverSettingsDao.saveSetting(Settings.REMEMBER_ME_KEY.name, value)
    this._rememberMeKey = value
  }

  renewRememberMeKey(): void {
    this.rememberMeKey = this.getRandomRememberMeKey()
  }

  private getRandomRememberMeKey(): string {
    return nextAlphanumeric(32)
  }

  get rememberMeDuration(): Duration {
    return this._rememberMeDuration
  }

  set rememberMeDuration(value: Duration) {
    this.serverSettingsDao.saveSetting(Settings.REMEMBER_ME_DURATION.name, Math.trunc(value.toDays()))
    this._rememberMeDuration = value
  }

  get thumbnailSize(): ThumbnailSize {
    return this._thumbnailSize
  }

  set thumbnailSize(value: ThumbnailSize) {
    this.serverSettingsDao.saveSetting(Settings.THUMBNAIL_SIZE.name, value.name)
    this._thumbnailSize = value
  }

  get taskPoolSize(): number {
    return this._taskPoolSize
  }

  set taskPoolSize(value: number) {
    this.serverSettingsDao.saveSetting(Settings.TASK_POOL_SIZE.name, value)
    this._taskPoolSize = value
    this.eventPublisher.publishEvent(SettingChangedEvent.TaskPoolSize)
  }

  get serverPort(): number | null {
    return this._serverPort
  }

  set serverPort(value: number | null) {
    if (value !== null) this.serverSettingsDao.saveSetting(Settings.SERVER_PORT.name, value)
    else this.serverSettingsDao.deleteSetting(Settings.SERVER_PORT.name)
    this._serverPort = value
  }

  get serverContextPath(): string | null {
    return this._serverContextPath
  }

  set serverContextPath(value: string | null) {
    if (value !== null) this.serverSettingsDao.saveSetting(Settings.SERVER_CONTEXT_PATH.name, value)
    else this.serverSettingsDao.deleteSetting(Settings.SERVER_CONTEXT_PATH.name)
    this._serverContextPath = value
  }

  get koboProxy(): boolean {
    return this._koboProxy
  }

  set koboProxy(value: boolean) {
    this.serverSettingsDao.saveSetting(Settings.KOBO_PROXY.name, value)
    this._koboProxy = value
  }

  get koboPort(): number | null {
    return this._koboPort
  }

  set koboPort(value: number | null) {
    if (value !== null) this.serverSettingsDao.saveSetting(Settings.KOBO_PORT.name, value)
    else this.serverSettingsDao.deleteSetting(Settings.KOBO_PORT.name)
    this._koboPort = value
  }

  get kepubifyPath(): string | null {
    return this._kepubifyPath
  }

  set kepubifyPath(value: string | null) {
    if (value !== null) this.serverSettingsDao.saveSetting(Settings.KEPUBIFY_PATH.name, value)
    else this.serverSettingsDao.deleteSetting(Settings.KEPUBIFY_PATH.name)
    this._kepubifyPath = value
    this.eventPublisher.publishEvent(SettingChangedEvent.KepubifyPath)
  }
}

class Settings extends KEnum {
  static readonly DELETE_EMPTY_COLLECTIONS = new Settings('DELETE_EMPTY_COLLECTIONS')
  static readonly DELETE_EMPTY_READLISTS = new Settings('DELETE_EMPTY_READLISTS')
  static readonly REMEMBER_ME_KEY = new Settings('REMEMBER_ME_KEY')
  static readonly REMEMBER_ME_DURATION = new Settings('REMEMBER_ME_DURATION')
  static readonly THUMBNAIL_SIZE = new Settings('THUMBNAIL_SIZE')
  static readonly TASK_POOL_SIZE = new Settings('TASK_POOL_SIZE')
  static readonly SERVER_PORT = new Settings('SERVER_PORT')
  static readonly SERVER_CONTEXT_PATH = new Settings('SERVER_CONTEXT_PATH')
  static readonly KOBO_PROXY = new Settings('KOBO_PROXY')
  static readonly KOBO_PORT = new Settings('KOBO_PORT')
  static readonly KEPUBIFY_PATH = new Settings('KEPUBIFY_PATH')

  private constructor(name: string) {
    super(name)
  }
}

// @Service
component(KomgaSettingsProvider, { inject: [ServerSettingsDao, ApplicationEventPublisher] })
