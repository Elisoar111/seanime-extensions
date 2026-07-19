/// <reference path="./anime-torrent-provider.d.ts" />

class Provider {
  private api = "{{baseUrl}}"

  getSettings(): AnimeProviderSettings {
    return {
      canSmartSearch: true,
      smartSearchFilters: ["batch", "episodeNumber", "resolution", "query", "bestReleases"],
      supportsAdult: true,
      type: "main",
    }
  }

  async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
    const data = await this.fetchResources({ search: opts.query, type: "动画" })
    return (data.resources || []).map((r: any) => this.toAnimeTorrent(r))
  }

  async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
    const seen = new Map<string, any>()

    // Strategy 1: title + episode number (most targeted)
    const mainQuery = this.buildMainQuery(opts)
    if (mainQuery) {
      await this.searchAndCollect(mainQuery, opts, seen)
    }

    // Strategy 2: fallback via alternative titles
    if (seen.size < 5) {
      const altTitles = this.getAltTitles(opts)
      for (const alt of altTitles) {
        if (seen.size >= 20) break
        await this.searchAndCollect(alt, opts, seen)
      }
    }

    // Strategy 3: broad title-only search (catch-all)
    if (seen.size < 3) {
      const broadQuery = this.selectBestTitle(opts)
      if (broadQuery && broadQuery !== mainQuery) {
        await this.searchAndCollect(broadQuery, opts, seen, true)
      }
    }

    let torrents = Array.from(seen.values()).map((r: any) =>
      this.toAnimeTorrent(r)
    )

    // Parse metadata from titles
    for (const t of torrents) {
      const parsed = this.parseTitle(t.name)
      if (t.episodeNumber === -1) t.episodeNumber = parsed.episodeNumber
      if (!t.resolution) t.resolution = parsed.resolution
      if (!t.isBatch) t.isBatch = parsed.isBatch
      if (!t.isBestRelease) t.isBestRelease = parsed.isBestRelease
    }

    // Apply episode filter
    if (opts.episodeNumber > 0 && !opts.batch) {
      const exact = torrents.filter(
        (t) => t.episodeNumber === opts.episodeNumber && !t.isBatch
      )
      if (exact.length > 0) {
        torrents = exact
      } else {
        torrents = torrents.filter((t) => !t.isBatch)
      }
    }

    // Apply batch filter
    if (opts.batch) {
      torrents = torrents.filter((t) => t.isBatch)
    }

    // Apply resolution filter
    if (opts.resolution) {
      const resNorm = opts.resolution.toLowerCase().replace(/p$/, "")
      const matched = torrents.filter((t) => {
        const tres = (t.resolution || "").toLowerCase().replace(/p$/, "")
        return tres === resNorm
      })
      if (matched.length > 0) torrents = matched
    }

    // Apply best releases filter
    if (opts.bestReleases) {
      const best = torrents.filter((t) => t.isBestRelease)
      if (best.length > 0) torrents = best
    }

    // Sort: best releases first, then by date descending
    torrents.sort((a, b) => {
      if (a.isBestRelease !== b.isBestRelease) {
        return a.isBestRelease ? -1 : 1
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

    return torrents
  }

  async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
    return torrent.infoHash || ""
  }

  async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
    return torrent.magnetLink || ""
  }

  async getLatest(): Promise<AnimeTorrent[]> {
    const data = await this.fetchResources({}, 30)
    return (data.resources || [])
      .filter((r: any) => r.type === "动画")
      .slice(0, 50)
      .map((r: any) => this.toAnimeTorrent(r))
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Search strategies
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private buildMainQuery(opts: AnimeSmartSearchOptions): string | null {
    const title = this.selectBestTitle(opts)
    if (!title) return null

    let query = title

    if (!opts.batch && opts.episodeNumber > 0) {
      query += ` ${opts.episodeNumber}`
    }

    if (opts.resolution) {
      query += ` ${opts.resolution.replace(/p$/, "")}`
    }

    return query
  }

  private getAltTitles(opts: AnimeSmartSearchOptions): string[] {
    const titles: string[] = []
    const added = new Set<string>()
    const mainTitle = this.selectBestTitle(opts)

    const tryAdd = (t: string) => {
      if (t && !added.has(t)) {
        added.add(t)
        titles.push(t)
      }
    }

    if (opts.media.romajiTitle && opts.media.romajiTitle !== mainTitle)
      tryAdd(opts.media.romajiTitle)
    if (opts.media.englishTitle && opts.media.englishTitle !== mainTitle)
      tryAdd(opts.media.englishTitle)
    if (opts.query && opts.query !== mainTitle) tryAdd(opts.query)
    if (opts.media.synonyms?.length) {
      for (const s of opts.media.synonyms) {
        if (s !== mainTitle) tryAdd(s)
      }
    }

    return titles
  }

  private selectBestTitle(opts: AnimeSmartSearchOptions): string {
    if (opts.query) return opts.query
    if (opts.media.romajiTitle) return opts.media.romajiTitle
    if (opts.media.englishTitle) return opts.media.englishTitle
    if (opts.media.synonyms?.length) return opts.media.synonyms[0]
    return ""
  }

  private async searchAndCollect(
    query: string,
    opts: AnimeSmartSearchOptions,
    seen: Map<string, any>,
    broad: boolean = false
  ): Promise<void> {
    try {
      const params: Record<string, string | number> = {
        type: "动画",
        metadata: "true",
      }

      params.search = query

      const data = await this.fetchResources(params, 50)
      for (const r of data.resources || []) {
        const key = r.href || r.id
        if (!seen.has(key)) seen.set(key, r)
      }
    } catch (_) {
      /* skip failed queries */
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Title parsing
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private parseTitle(title: string): {
    episodeNumber: number
    resolution: string
    isBatch: boolean
    isBestRelease: boolean
  } {
    const isBatch = this.detectBatch(title)
    const resolution = this.parseResolution(title)
    const episodeNumber = isBatch ? -1 : this.parseEpisodeNumber(title)
    const isBestRelease = this.detectBestRelease(title)

    return { episodeNumber, resolution, isBatch, isBestRelease }
  }

  private detectBatch(title: string): boolean {
    const patterns = [
      /\b(?:batch|全集|合集|Complete|完整|全話)\b/i,
      /【\s*全\s*\d+\s*[話话]\s*】/,
      /全\s*\d+\s*[話话]\s*(?:合集|収録|收录)/,
      /[Vv]ol\.\d+-\d+/,
      /\d+[\-~]\d+\s*(?:END|end|Fin|最終)/,
      /\b(?:S\d+|[Ss]eason\s*\d+)\s*(?:Complete|全集|合集)/,
    ]
    return patterns.some((p) => p.test(title))
  }

  private parseResolution(title: string): string {
    if (/\b(?:4K|2160)\b/i.test(title)) return "2160p"
    const resMatch = title.match(/\b(\d{3,4})\s*[pP]/)
    if (resMatch) {
      const val = parseInt(resMatch[1], 10)
      if (val >= 360 && val <= 4320) return `${val}p`
    }
    if (/\b1080\b/.test(title)) return "1080p"
    if (/\b720\b/.test(title)) return "720p"
    if (/\b480\b/.test(title)) return "480p"
    return ""
  }

  private parseEpisodeNumber(title: string): number {
    // Japanese: 第05話, 第5話
    const jpMatch = title.match(/第\s*(\d{1,4})\s*[話话]/)
    if (jpMatch) {
      const n = parseInt(jpMatch[1], 10)
      if (n > 0 && n < 500) return n
    }

    // EP/Episode prefix: EP05, E05
    const epMatch = title.match(/\b(?:EP|Ep|ep|E|e)\s*0*(\d{1,3})\b/)
    if (epMatch) {
      const n = parseInt(epMatch[1], 10)
      if (n > 0 && n < 500) return n
    }

    // Dash-separated: " - 05", "– 05"
    const dashMatch = title.match(/[\-–—]\s*0*(\d{1,3})(?:\s|$|\]|\)|\[)/)
    if (dashMatch) {
      const n = parseInt(dashMatch[1], 10)
      if (n > 0 && n < 200) return n
    }

    // Number before bracket: "05 [1080p]"
    const bracketMatch = title.match(/\b0*(\d{1,3})(?=\s*[\[\(])/)
    if (bracketMatch) {
      const n = parseInt(bracketMatch[1], 10)
      if (n > 0 && n < 200) return n
    }

    // Multi-episode: "05-06"
    const rangeMatch = title.match(/0*(\d{1,2})\s*[\-~]\s*0*\d{1,2}/)
    if (rangeMatch) {
      const n = parseInt(rangeMatch[1], 10)
      if (n > 0 && n < 200) return n
    }

    return -1
  }

  private detectBestRelease(title: string): boolean {
    const highQuality =
      /\b(?:BDRip|BluRay|Blu-ray|BD|WebRip|WEB-DL|WEB|WEBRip|HDRip|H265|HEVC|x265|10bit|Hi10P)\b/i
    const lowQuality =
      /\b(?:CAM|TS|TC|HDTS|HDTC|DVDScr|SCR|VCD|TVRip|VHSRip)\b/i

    return highQuality.test(title) && !lowQuality.test(title)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  API helper
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async fetchResources(
    params: Record<string, string | number>,
    pageSize: number = 50
  ): Promise<any> {
    const sp = new URLSearchParams()
    sp.set("pageSize", String(pageSize))
    sp.set("page", "1")
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        sp.set(k, String(v))
      }
    }
    const url = `${this.api}/resources?${sp.toString()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`AnimeGarden API: ${res.status}`)
    return res.json()
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Data mapping
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private toAnimeTorrent(r: any): AnimeTorrent {
    let infoHash = ""
    if (r.magnet) {
      const m = r.magnet.match(/btih:([A-Fa-f0-9]+)/i)
      if (m) infoHash = m[1].toUpperCase()
    }

    // API stores size in KB, convert to bytes
    const sizeBytes = r.size * 1024

    return {
      name: r.title,
      date: new Date(r.createdAt).toISOString(),
      size: sizeBytes,
      formattedSize: this.formatSize(sizeBytes),
      seeders: 0,
      leechers: 0,
      downloadCount: 0,
      link: r.href,
      downloadUrl: "",
      magnetLink: r.magnet,
      infoHash,
      resolution: "",
      isBatch: false,
      episodeNumber: -1,
      isBestRelease: false,
      confirmed: true,
    }
  }

  private formatSize(bytes: number): string {
    if (bytes <= 0) return ""
    const units = ["B", "KB", "MB", "GB", "TB"]
    const k = 1024
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(k)),
      units.length - 1
    )
    const val = bytes / Math.pow(k, i)
    return `${val.toFixed(i <= 1 ? 0 : 1)} ${units[i]}`
  }
}
