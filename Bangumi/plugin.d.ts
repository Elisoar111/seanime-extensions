/**
 * Seanime Plugin API Type Declarations
 * Covers: $ui / $app / $storage / $anilist, Webview, Screen, DOM, Hooks
 * Bangumi API response types included at the bottom.
 */

declare function init(): void

// ---- Global $ui ----
interface SeanimeUI {
    register(cb: (ctx: UIContext) => void): void
}
declare var $ui: SeanimeUI

// ---- Global $app ----
interface SeanimeApp {
    openURL(url: string): void
    onGetAnimeCollection(cb: (e: HookEvent) => void): void
    onGetRawAnimeCollection(cb: (e: HookEvent) => void): void
}
declare var $app: SeanimeApp

// ---- Global $anilist ----
interface SeanimeAnilist {
    refreshAnimeCollection(): void
}
declare var $anilist: SeanimeAnilist

// ---- Global $storage ----
interface SeanimeStorage {
    get<T = string>(key: string): T | null | undefined
    set(key: string, value: any): void
    remove(key: string): void
}
declare var $storage: SeanimeStorage

// ---- Global console (goja) ----
interface Console {
    log(...args: any[]): void
    error(...args: any[]): void
    warn(...args: any[]): void
}
declare var console: Console

// ---- Global $getUserPreference (reads manifest userConfig values) ----
declare function $getUserPreference(name: string): any

// ---- Global $sleep (blocking sleep, goja runtime) ----
declare function $sleep(milliseconds: number): void

// ---- Action API (anime page buttons) ----
interface ActionButtonEvent {
    media?: any   // $app.AL_Media of the currently open anime entry
}
interface ActionButton {
    mount(): void
    unmount(): void
    onClick(cb: (event: ActionButtonEvent) => void): void
}
interface ActionManager {
    newAnimePageButton(opts: { label: string; intent?: string }): ActionButton
}

// ---- UIContext ----
interface UIContext {
    action: ActionManager
    state<T>(initial: T): State<T>
    computed<T>(fn: () => T, deps: State<any>[]): State<T>
    settings: SettingsManager
    fieldRef(): FieldRef
    fetch(url: string, init?: FetchInit): Promise<FetchResponse>
    screen: ScreenManager
    effect(fn: () => void, deps: State<any>[]): void
    dom: DOMManager
    registerEventHandler(name: string, handler: () => void): void
    newTray(opts: TrayOptions): Tray
    newWebview(opts: WebviewOptions): Webview
    toast: ToastManager
    anime: AnimeManager
    cache: CacheManager
    setInterval(fn: () => void, ms: number): void
}

// ---- State ----
interface State<T> {
    get(): T
    set(value: T | ((prev: T) => T)): void
}

// ---- FieldRef ----
interface FieldRef {
    current: string
    setValue(v: string): void
    onValueChange(cb: (v: string) => void): void
}

// ---- Settings ----
interface SettingsManager {
    define(namespace: string, defaults: Record<string, any>): SettingsInstance
}
interface SettingsInstance {
    get<T = any>(key: string, fallback?: T): T
    set(key: string, value: any): void
    fieldRef(key: string): FieldRef
    watch(cb: (next: Record<string, any>) => void): () => void
}

// ---- Fetch ----
interface FetchInit {
    method?: string
    headers?: Record<string, string>
    body?: string
}
interface FetchResponse {
    json<T = any>(): T
    text(): string
    ok: boolean
    status: number
}

// ---- Screen ----
interface ScreenManager {
    onNavigate(cb: (e: NavigateEvent) => void): void
    loadCurrent(): void
    navigateTo(path: string, params?: Record<string, string>): void
    reload(): void
    getState(): State<ScreenState>
}
interface ScreenState {
    current: string
    prev: string
}
interface NavigateEvent {
    pathname: string
    searchParams: { id?: string } & Record<string, string | undefined>
}

// ---- DOM ----
interface DOMQueryOptions {
    withInnerHTML?: boolean
    identifyChildren?: boolean
}
interface DOMManager {
    onReady(cb: () => void): void
    onMainTabReady(cb: () => void): void
    query(selector: string, opts?: DOMQueryOptions): Promise<DOMElement[]>
    queryOne(selector: string, opts?: DOMQueryOptions): Promise<DOMElement | null>
    observe(selector: string, cb: (els: DOMElement[]) => void, opts?: DOMQueryOptions): [() => void, () => void]
    createElement(tag: string): Promise<DOMElement>
    asElement(id: string): DOMElement
}
interface DOMElement {
    innerHTML: string
    getText(): Promise<string>
    setText(text: string): void
    getAttribute(name: string): Promise<string>
    getAttributes(): Promise<Record<string, string>>
    setAttribute(name: string, value: string): void
    removeAttribute(name: string): void
    hasAttribute(name: string): Promise<boolean>
    setStyle(property: string, value: string): void
    getStyle(property?: string): Promise<any>
    removeStyle(property: string): void
    hasStyle(property: string): Promise<boolean>
    getComputedStyle(property: string): Promise<string>
    addClass(className: string): void
    hasClass(className: string): Promise<boolean>
    append(child: DOMElement): void
    before(sibling: DOMElement): void
    after(sibling: DOMElement): void
    remove(): void
    getParent(opts?: DOMQueryOptions): Promise<DOMElement | null>
    getChildren(opts?: DOMQueryOptions): Promise<DOMElement[]>
    query(selector: string): Promise<DOMElement[]>
    queryOne(selector: string): Promise<DOMElement | null>
    addEventListener(event: string, handler: (ev?: any) => void): () => void
}

// ---- Tray ----
interface TrayOptions {
    tooltipText: string
    iconUrl?: string
    withContent?: boolean
}
interface Tray {
    updateBadge(opts: { number: number; intent?: string }): void
    onOpen(cb: () => void): void
    render(cb: () => TrayElement): void
    open(): void
    text(label: string, opts?: { fontWeight?: string }): TrayElement
    stack(elements: TrayElement[]): TrayElement
    button(opts: { label: string; onClick: string }): TrayElement
    input(opts: { fieldRef: FieldRef; placeholder?: string }): TrayElement
    div(elements: TrayElement[]): TrayElement
    separator(): TrayElement
}
interface TrayElement {}

// ---- Webview ----
interface WebviewOptions {
    slot: "screen" | "fixed" | "after-home-screen-toolbar" | "home-screen-bottom"
        | "schedule-screen-top" | "schedule-screen-bottom" | "anime-screen-bottom"
        | "after-anime-entry-episode-list" | "after-anime-episode-list"
        | "before-anime-entry-episode-list" | "manga-screen-bottom"
        | "manga-entry-screen-bottom" | "after-manga-entry-chapter-list"
        | "after-discover-screen-header" | "after-media-entry-details"
        | "after-media-entry-form"
    className?: string
    style?: string
    width?: string
    height?: string
    maxWidth?: string
    maxHeight?: string
    zIndex?: number
    autoHeight?: boolean
    fullWidth?: boolean
    hidden?: boolean
    sidebar?: { label: string; icon: string }
    window?: {
        draggable?: boolean
        defaultX?: number
        defaultY?: number
        defaultPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right"
        frameless?: boolean
    }
}
interface WebviewChannel {
    sync(name: string, state: State<any>): void
    on(event: string, cb: (payload?: any) => void): void
}
interface Webview {
    channel: WebviewChannel
    setContent(cb: () => string): void
    getScreenPath(): string
    show(): void
    hide(): void
    update(): void
    onMount(cb: () => void): void
    onUnmount(cb: () => void): void
    onLoad(cb: () => void): void
}

// ---- Toast ----
interface ToastManager {
    info(msg: string): void
    success(msg: string): void
    error(msg: string): void
}

// ---- Anime ----
interface AnimeManager {
    getAnimeEntry(id: number): Promise<AnimeEntry> | AnimeEntry
}
interface AnimeEntry {
    media?: {
        id: number
        title?: {
            romaji?: string
            english?: string
            native?: string
            userPreferred?: string
        }
        startDate?: { year: number; month: number; day: number }
        seasonYear?: number
        coverImage?: {
            extraLarge?: string
            large?: string
            medium?: string
        }
        bannerImage?: string
        averageScore?: number
        episodes?: number
        format?: string
    }
}

// ---- Cache helper ----
interface CacheManager {
    getOrSet<T>(key: string, producer: () => Promise<T> | T, opts?: { ttl: number }): Promise<T>
    set(key: string, value: any, ttl: number): void
    get<T = any>(key: string): T | undefined
    remove(key: string): void
    size(): number
}

// ---- Hooks ----
interface HookEvent {
    animeCollection?: {
        mediaListCollection?: {
            lists?: MediaList[]
        }
    }
    next(): void
}
interface MediaList {
    entries?: MediaListEntry[]
}
interface MediaListEntry {
    media?: MediaItem
}
interface MediaItem {
    id: number
    synonyms?: string[]
    bannerImage?: string
}

// =====================================================================
//  Bangumi API Types
// =====================================================================
interface BgmSearchResponse {
    data?: BgmSubjectLite[]
    total?: number
}
interface BgmImages {
    large?: string
    common?: string
    medium?: string
    small?: string
    grid?: string
}
interface BgmRatingCount {
    [score: string]: number
}
interface BgmRating {
    rank?: number
    total?: number
    count?: BgmRatingCount
    score?: number
}
interface BgmCollectionStats {
    wish?: number
    collect?: number
    doing?: number
    on_hold?: number
    dropped?: number
}
interface BgmTag {
    name: string
    count: number
}
interface BgmInfoboxItem {
    key: string
    value: any
}
interface BgmSubjectLite {
    id: number
    type?: number
    name: string
    name_cn?: string
    date?: string
    images?: BgmImages
    rating?: BgmRating
    score?: number
    rank?: number
}
interface BgmSubject extends BgmSubjectLite {
    summary?: string
    nsfw?: boolean
    eps?: number
    eps_count?: number
    volumes?: number
    platform?: string
    air_day?: number
    air_weekday?: string
    series?: boolean
    locked?: boolean
    rating?: BgmRating
    collection?: BgmCollectionStats
    tags?: BgmTag[]
    infobox?: BgmInfoboxItem[]
    total_episodes?: number
}
interface BgmCharacter {
    id: number
    name: string
    type?: number
    relation?: string
    images?: BgmImages
    actors?: { id: number; name: string; images?: BgmImages }[]
}
interface BgmRelation {
    id: number
    type?: number
    name: string
    name_cn?: string
    relation?: string
    images?: BgmImages
}
interface BgmEpisode {
    id: number
    type?: number
    sort?: number
    ep?: number
    name: string
    name_cn?: string
    air_date?: string
    comment?: number
    desc?: string
    duration?: string
}
interface BgmEpisodeResponse {
    data?: BgmEpisode[]
    total?: number
    limit?: number
    offset?: number
}
interface BgmMe {
    id: number
    username: string
    nickname?: string
}
interface BgmUserCollection {
    subject_id?: number
    rate?: number
    type?: number
    comment?: string
    ep_status?: number
    vol_status?: number
    updated_at?: string
    status?: { id: number; type: number; name: string }
}
