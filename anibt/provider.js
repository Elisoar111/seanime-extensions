/**
 * AniBT (番组字幕发布) — Torrent Provider for Seanime
 *
 * Fetches anime torrent releases from https://anibt.net
 * Uses the public AniBT API to search by Bangumi ID and retrieve group releases.
 *
 * API Endpoints:
 *   GET /api/seasons/anime        — 本季动画列表 (for getLatest)
 *   GET /api/bgm/search?q=&limit= — 按标题搜索 Bangumi ID
 *   GET /api/anime/groups?bgmId= — 获取指定条目的字幕组发布
 *
 * Build: 编辑此文件后运行 `node build.js` 重新生成 manifest.json
 *
 * @version 1.3.0
 *
 * $habari API (per official Seanime AnimeTosho reference):
 *   episode_number  → string[] (array of episode numbers)
 *   video_resolution → string  (e.g. "1080p")
 *   release_group   → string  (fansub group name)
 *   title           → string  (cleaned title)
 */

class Provider {

    constructor() {
        this._MAX_SEASONAL_ANIME = 15
        this._MAX_LATEST_RESULTS = 30
        this._MAX_SEARCH_LIMIT = 5
    }

    // ================================================================
    //  Required: Provider settings
    // ================================================================
    getSettings() {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "bestReleases"],
            supportsAdult: false,
            type: "main",
        }
    }

    // ================================================================
    //  Required: Text search (from user query bar)
    // ================================================================
    async search(opts) {
        try {
            const bgmId = await this._resolveBgmId(opts)
            if (!bgmId) return []

            const items = await this._fetchReleases(bgmId)
            return items.map(r => this._toAnimeTorrent(r, opts.media)).filter(Boolean)
        } catch (e) {
            console.error("[AniBT] search error:", e)
            return []
        }
    }

    // ================================================================
    //  Required: Structured smart search (Auto Downloader)
    // ================================================================
    async smartSearch(opts) {
        try {
            const bgmId = await this._resolveBgmId(opts)
            if (!bgmId) return []

            // Fetch all releases for this BGM ID
            let all = await this._fetchReleases(bgmId)
            if (!all.length) return []

            // ── Apply pre-conversion filters (on raw API data) ──
            // episodeNumber: filter by exact episode number from API
            if (opts.episodeNumber && opts.episodeNumber > 0) {
                all = all.filter(r => parseInt(r.episodeKey, 10) === opts.episodeNumber)
            }
            // batch: keep only items whose episodeKey is missing or 0 (= batch marker)
            if (opts.batch) {
                all = all.filter(r => {
                    const ep = parseInt(r.episodeKey, 10)
                    return isNaN(ep) || ep === 0
                })
            }

            // ── Convert to AnimeTorrent format (resolves resolution via API + $habari) ──
            let out = all.map(r => this._toAnimeTorrent(r, opts.media)).filter(Boolean)

            // ── Apply post-conversion filters (on fully-resolved AnimeTorrent fields) ──
            // resolution: strict match against the resolved resolution
            if (opts.resolution) {
                out = out.filter(t => t.resolution === opts.resolution)
            }

            // bestReleases: return ONLY the highest-quality torrent (sorted by seeders)
            if (opts.bestReleases && out.length) {
                out.sort((a, b) => b.seeders - a.seeders)
                const best = out[0]
                best.isBestRelease = true
                return [best]
            }

            return out
        } catch (e) {
            console.error("[AniBT] smartSearch error:", e)
            return []
        }
    }

    // ================================================================
    //  Required: Torrent hash / magnet resolution
    // ================================================================
    async getTorrentInfoHash(torrent) {
        if (torrent.infoHash) return torrent.infoHash
        if (torrent.magnetLink) {
            const m = torrent.magnetLink.match(/btih:([a-fA-F0-9]{40})/i)
            if (m) return m[1].toLowerCase()
        }
        return ""
    }

    async getTorrentMagnetLink(torrent) {
        return torrent.magnetLink || ""
    }

    // ================================================================
    //  Required: Latest torrents (home page / discover)
    // ================================================================
    async getLatest() {
        try {
            const r = await fetch("https://anibt.net/api/seasons/anime")
            if (!r || !r.ok) return []
            const data = await r.json()
            if (!data || !data.data || !data.data.byWeekday) return []

            const bgmIds = []
            for (let w = 0; w < data.data.byWeekday.length; w++) {
                const animes = data.data.byWeekday[w].animes || []
                for (let a = 0; a < animes.length; a++) {
                    const s = animes[a]
                    if (s.hasRelease && s.bgmId) {
                        bgmIds.push(s.bgmId)
                        if (bgmIds.length >= this._MAX_SEASONAL_ANIME) break
                    }
                }
                if (bgmIds.length >= this._MAX_SEASONAL_ANIME) break
            }

            // ── Concurrently fetch releases for all seasonal anime ──
            // _fetchReleases handles its own errors (returns []), so Promise.all is safe
            const all = []
            const results = await Promise.all(
                bgmIds.map(id =>
                    this._fetchReleases(id).catch(() => [])
                )
            )
            for (let i = 0; i < results.length; i++) {
                const items = results[i]
                for (let j = 0; j < items.length; j++) {
                    all.push(items[j])
                }
            }

            // Sort by newest first, limit to _MAX_LATEST_RESULTS
            all.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
            const limit = Math.min(all.length, this._MAX_LATEST_RESULTS)
            const latest = []
            for (let l = 0; l < limit; l++) {
                latest.push(this._toAnimeTorrent(all[l], null))
            }
            return latest
        } catch (e) {
            console.error("[AniBT] getLatest error:", e)
            return []
        }
    }

    // ================================================================
    //  Private: BGM ID resolution (deduplicated from search/smartSearch)
    // ================================================================

    /** Build query candidates and find the first matching Bangumi ID */
    async _resolveBgmId(opts) {
        const queries = this._buildQueries(opts)
        if (!queries.length) return 0
        for (const q of queries) {
            const id = await this._searchBgmId(q)
            if (id) return id
        }
        return 0
    }

    // ================================================================
    //  Private: API helpers
    // ================================================================

    /** Search for Bangumi ID by anime title via AniBT search API */
    async _searchBgmId(query) {
        if (!query) return 0
        const url = "https://anibt.net/api/bgm/search?q=" + encodeURIComponent(query) +
                     "&limit=" + this._MAX_SEARCH_LIMIT
        try {
            const r = await fetch(url)
            if (!r || !r.ok) return 0
            const d = await r.json()
            const arr = d && d.data || d
            return (arr && arr.length && arr[0] && arr[0].bgmId) || 0
        } catch (e) {
            console.error("[AniBT] 搜索失败:", query, e)
            return 0
        }
    }

    /** Fetch all release items for a Bangumi ID from AniBT groups API */
    async _fetchReleases(bgmId) {
        if (!bgmId) return []
        const url = "https://anibt.net/api/anime/groups?bgmId=" + bgmId
        try {
            const r = await fetch(url)
            if (!r || !r.ok) return []
            const d = await r.json()
            if (!d || !d.ok || !d.data) return []

            const out = []
            const groups = d.data.groups || []
            for (let g = 0; g < groups.length; g++) {
                const group = groups[g]
                const items = group.items || []
                for (let i = 0; i < items.length; i++) {
                    const it = items[i]
                    it._groupName = group.name || ""
                    out.push(it)
                }
            }
            return out
        } catch (e) {
            console.error("[AniBT] 获取发布失败:", bgmId, e)
            return []
        }
    }

    // ================================================================
    //  Private: Query building
    // ================================================================

    /** Build search query candidates from search/smartSearch options */
    _buildQueries(opts) {
        const m = opts && opts.media
        if (!m) {
            const q = opts && opts.query
            return q ? [q.trim()] : []
        }

        const seen = {}
        const q = []
        const add = s => {
            if (s && !seen[s]) { seen[s] = true; q.push(s) }
        }

        // Priority: user query > romaji > english > synonyms
        if (opts.query) add(opts.query.trim())
        if (m.romajiTitle) add(m.romajiTitle)
        if (m.englishTitle) add(m.englishTitle)
        if (m.synonyms) {
            for (let i = 0; i < m.synonyms.length && q.length < 5; i++) {
                add(m.synonyms[i])
            }
        }

        return q
    }

    // ================================================================
    //  Private: Data transformation
    // ================================================================

    /** Convert a raw AniBT API item to AnimeTorrent format */
    _toAnimeTorrent(r, media) {
        if (!r) return null

        // Parse title with $habari for episode/resolution/group extraction
        let meta = null
        try { meta = $habari.parse(r.title) } catch (_) { /* ignore */ }

        // Episode number: prefer API's episodeKey, fall back to $habari
        let ep = -1
        if (r.episodeKey) {
            const n = parseInt(r.episodeKey, 10)
            if (!isNaN(n)) ep = n
        }
        if (ep === -1 && meta && meta.episode_number != null) {
            // episode_number 可能是字符串 "01" 或数组 ["1","2"]
            const raw = Array.isArray(meta.episode_number) ? meta.episode_number[0] : String(meta.episode_number)
            const n = parseInt(raw, 10)
            if (!isNaN(n)) ep = n
        }

        // Info hash from magnet link
        let hash = ""
        if (r.magnet) {
            const mh = r.magnet.match(/btih:([a-fA-F0-9]{40})/i)
            if (mh) hash = mh[1].toLowerCase()
        }

        // ISO date string
        let date = ""
        if (r.publishedAt) {
            try { date = new Date(r.publishedAt).toISOString() } catch (_) { /* ignore */ }
        }

        // Resolution: prefer API field, fall back to $habari (video_resolution)
        let resolution = r.resolution || ""
        if (!resolution && meta && meta.video_resolution) {
            resolution = meta.video_resolution
        }

        // Release group: prefer API group name, fall back to $habari (release_group)
        let releaseGroup = r._groupName || ""
        if (!releaseGroup && meta && meta.release_group) {
            releaseGroup = meta.release_group
        }

        // isBatch: API episodeKey gives 0 or falsy → batch
        // Per Seanime docs: set to true only when provider CAN confirm it's a batch.
        // Otherwise leave as false and let Seanime parse from name.
        const isBatch = ep === 0 || !r.episodeKey

        // Batch overrides episode: batch torrents span multiple episodes
        if (isBatch) {
            ep = -1
        }

        // Movie/single-episode special case: if no episode detected and media is MOVIE
        // or single-episode, default to episode 1 (per official reference implementation)
        if (!isBatch && ep === -1 && media && (media.episodeCount === 1 || media.format === "MOVIE")) {
            ep = 1
        }

        return {
            name: r.title || "",
            date: date,
            size: r.size || 0,
            formattedSize: "",
            seeders: r.seeders != null ? r.seeders : -1,
            leechers: r.leechers != null ? r.leechers : -1,
            downloadCount: r.downloads || 0,
            link: r.link || r.url || "",
            downloadUrl: r.downloadUrl || "",
            magnetLink: r.magnet || "",
            infoHash: hash,
            resolution: resolution,
            isBatch: isBatch,
            episodeNumber: ep,
            releaseGroup: releaseGroup,
            isBestRelease: false,
            confirmed: true,
        }
    }

    // ================================================================
    //  Private: Utilities
    // ================================================================

}