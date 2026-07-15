/// <reference path="./anime-torrent-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {
    constructor() {
        this.baseUrl = "https://mikanime.tv";
        this.searchEndpoint = "/RSS/Search?searchstr=";
        this.latestEndpoint = "/RSS/Classic";

        // Caches
        this._textCache = new Map();
        this._parseCache = new Map();

        // Pre-compiled regex patterns
        this._stripNonAlpha = /[^a-zA-Z0-9\u4e00-\u9fa5\s]/g;
        this._multiSpace = /\s+/g;
        this._batchRe = /合集|全集|Batch|Complete|\d+[-~～]\d+/;
        this._magnetRe = /magnet:\?xt=urn:btih:[a-fA-F0-9]+(?:&[a-zA-Z0-9%=$._*+\-:/]+)*/;
        this._torrentLinkRe = /href="([^"]+\.torrent[^"]*)"/;
        this._infoHashRe = /magnet:\?xt=urn:btih:([a-fA-F0-9]+)/;
        this._itemRe = /<item>([\s\S]*?)<\/item>/gi;
    }

    getSettings() {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query"],
            supportsAdult: false,
            type: "main"
        };
    }

    async search(opts) {
        const url = this.baseUrl + this.searchEndpoint + encodeURIComponent(opts.query);
        console.log("[Mikan] search:", opts.query);
        const items = await this._fetchRSS(url);
        const result = new Array(items.length);
        for (let i = 0; i < items.length; i++) {
            result[i] = this._toAnimeTorrent(items[i]);
        }
        return result;
    }

    async smartSearch(opts) {
        const queries = this._buildSmartSearchQueries(opts);
        console.log("[Mikan] smartSearch queries:", queries);

        // Fetch all queries in parallel then merge + deduplicate in single pass
        const resultsArr = await Promise.all(queries.map(q => this._searchByQuery(q)));
        const seen = {};
        const unique = [];
        for (let i = 0; i < resultsArr.length; i++) {
            const batch = resultsArr[i];
            for (let j = 0; j < batch.length; j++) {
                const t = batch[j];
                const key = t.downloadUrl || t.name;
                if (!seen[key]) {
                    seen[key] = true;
                    unique.push(t);
                }
            }
        }
        console.log("[Mikan] smartSearch total unique:", unique.length);

        const isMovie = opts.media.format === "MOVIE" || opts.media.episodeCount === 1;

        // Early return for movies
        if (isMovie) {
            return this._applyResolution(unique, opts.resolution);
        }

        // Batch filter
        if (opts.batch) {
            const batches = [];
            for (let i = 0; i < unique.length; i++) {
                if (this._batchRe.test(unique[i].name)) {
                    batches.push(unique[i]);
                }
            }
            if (batches.length > 0) return this._applyResolution(batches, opts.resolution);
        }

        // Episode number filter
        if (opts.episodeNumber > 0) {
            const filtered = [];
            for (let i = 0; i < unique.length; i++) {
                if (this._matchEpisodeNumber(unique[i].name, opts.episodeNumber)) {
                    filtered.push(unique[i]);
                }
            }
            if (filtered.length > 0) return this._applyResolution(filtered, opts.resolution);
        }

        // Resolution filter
        let result = this._applyResolution(unique, opts.resolution);

        // Best releases filter
        if (opts.bestReleases && result.length > 1) {
            const best = this._filterBestReleases(result);
            if (best.length > 0) return best;
        }

        return result;
    }

    async getTorrentMagnetLink(torrent) {
        if (torrent.magnetLink) return torrent.magnetLink;

        if (torrent.downloadUrl) {
            try {
                const data = await this._fetchText(torrent.downloadUrl);
                return $torrentUtils.getMagnetLinkFromTorrentData(data);
            } catch (e) {
                return this._magnetFromDetailPage(torrent);
            }
        }

        return this._magnetFromDetailPage(torrent);
    }

    async getTorrentInfoHash(torrent) {
        if (torrent.infoHash) return torrent.infoHash;
        const magnet = await this.getTorrentMagnetLink(torrent);
        if (!magnet) return "";
        const m = magnet.match(this._infoHashRe);
        return m ? m[1].toLowerCase() : "";
    }

    async getLatest() {
        const items = await this._fetchRSS(this.baseUrl + this.latestEndpoint);
        const result = new Array(items.length);
        for (let i = 0; i < items.length; i++) {
            result[i] = this._toAnimeTorrent(items[i]);
        }
        return result;
    }

    // ── Private helpers ──────────────────────────────────────────────

    async _fetchText(url) {
        const cached = this._textCache.get(url);
        if (cached !== undefined) return cached;

        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://mikanime.tv/",
                "Accept": "*/*"
            },
            timeout: 30
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const text = await res.text();
        this._textCache.set(url, text);
        return text;
    }

    async _searchByQuery(query) {
        if (!query || query.trim() === "") return [];
        try {
            const items = await this._fetchRSS(
                this.baseUrl + this.searchEndpoint + encodeURIComponent(query)
            );
            const result = new Array(items.length);
            for (let i = 0; i < items.length; i++) {
                result[i] = this._toAnimeTorrent(items[i]);
            }
            return result;
        } catch (e) {
            return [];
        }
    }

    _buildSmartSearchQueries(opts) {
        const queries = [];

        // User's custom query always takes priority
        if (opts.query && opts.query.trim()) {
            queries.push(opts.query.trim());
        }

        // Collect titles from media metadata
        const titles = [];
        if (opts.media.romajiTitle) titles.push(opts.media.romajiTitle);
        if (opts.media.englishTitle) titles.push(opts.media.englishTitle);
        if (opts.media.synonyms) {
            for (let i = 0; i < opts.media.synonyms.length; i++) {
                titles.push(opts.media.synonyms[i]);
            }
        }

        // Batch keywords: add Chinese batch query variants (cap at 4 total)
        if (opts.batch) {
            for (let i = 0; i < titles.length && queries.length < 4; i++) {
                const batchQuery = titles[i] + " 合集";
                if (queries.indexOf(batchQuery) === -1) queries.push(batchQuery);
                if (queries.length >= 4) break;
                const fullQuery = titles[i] + " 全集";
                if (queries.indexOf(fullQuery) === -1) queries.push(fullQuery);
            }
        }

        // Add one cleaned title variant
        for (let i = 0; i < Math.min(titles.length, 1); i++) {
            const clean = titles[i]
                .replace(this._stripNonAlpha, "")
                .replace(this._multiSpace, " ")
                .trim();
            if (clean && queries.indexOf(clean) === -1 && queries.length < 5) {
                queries.push(clean);
            }
        }

        return queries.slice(0, 5);
    }

    _matchEpisodeNumber(title, epNum) {
        try {
            const p = this._getParsed(title);
            if (p.episode_number && p.episode_number.length) {
                for (let i = 0; i < p.episode_number.length; i++) {
                    if (parseInt(p.episode_number[i]) === epNum) return true;
                }
                return false;
            }
        } catch (e) { /* fall through to regex */ }

        const padded = epNum < 10 ? "0" + epNum : String(epNum);
        return new RegExp(
            "\\[" + padded + "\\]|第" + epNum + "集|[Ee][Pp]?" + padded + "\\b"
        ).test(title);
    }

    _filterBestReleases(torrents) {
        if (torrents.length <= 1) return torrents;

        // Single pass: find max seeders
        let maxSeeders = 0;
        let hasSeeders = false;
        for (let i = 0; i < torrents.length; i++) {
            if (torrents[i].seeders > 0) {
                hasSeeders = true;
                if (torrents[i].seeders > maxSeeders) {
                    maxSeeders = torrents[i].seeders;
                }
            }
        }

        if (!hasSeeders) return torrents;

        const threshold = Math.max(maxSeeders * 0.5, 10);
        const result = [];
        for (let i = 0; i < torrents.length; i++) {
            if (torrents[i].seeders >= threshold) {
                result.push(torrents[i]);
            }
        }
        return result;
    }

    async _fetchRSS(url) {
        try {
            const xml = await this._fetchText(url);
            return this._parseRSS(xml);
        } catch (err) {
            console.error("[Mikan] RSS fetch error:", err);
            return [];
        }
    }

    _parseRSS(xml) {
        const items = [];
        let match;

        while ((match = this._itemRe.exec(xml)) !== null) {
            const xml2 = match[1];
            items.push({
                title: this._stripCDATA(
                    (xml2.match(/<title>([\s\S]*?)<\/title>/i) || ["", ""])[1]
                ),
                link: this._stripCDATA(
                    (xml2.match(/<link>([\s\S]*?)<\/link>/i) || ["", ""])[1]
                ),
                enclosureUrl:
                    (xml2.match(/<enclosure[^>]*url="([^"]+)"[^>]*>/i) || ["", ""])[1],
                size:
                    (xml2.match(/<enclosure[^>]*length="([^"]+)"[^>]*>/i) || ["", "0"])[1],
                pubDate: this._stripCDATA(
                    (xml2.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || ["", ""])[1]
                )
            });
        }
        return items;
    }

    _stripCDATA(s) {
        return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
    }

    _getParsed(title) {
        let p = this._parseCache.get(title);
        if (!p) {
            p = $habari.parse(title);
            this._parseCache.set(title, p);
        }
        return p;
    }

    _toAnimeTorrent(item) {
        const t = {
            name: item.title || "",
            date: "",
            size: parseInt(item.size, 10) || 0,
            formattedSize: "",
            seeders: -1,
            leechers: -1,
            downloadCount: 0,
            link: item.link || "",
            downloadUrl: item.enclosureUrl || "",
            magnetLink: "",
            infoHash: "",
            resolution: "",
            isBatch: false,
            episodeNumber: -1,
            releaseGroup: "",
            isBestRelease: false,
            confirmed: true
        };

        if (item.pubDate) {
            try {
                t.date = new Date(item.pubDate).toISOString();
            } catch (e) { /* ignore */ }
        }

        try {
            const parsed = this._getParsed(t.name);
            if (parsed.video_resolution) t.resolution = parsed.video_resolution;
            if (parsed.release_group) t.releaseGroup = parsed.release_group;
            if (parsed.episode_number && parsed.episode_number.length === 1) {
                const ep = parseInt(parsed.episode_number[0]);
                if (!isNaN(ep)) t.episodeNumber = ep;
            }

            // Extract subtitle/audio language info from parsed torrent name
            // $habari.parse extracts tags like "Multi-Sub", "CHS", "ENG" etc.
            const subtitleTerms = parsed.subtitle_terms || [];
            const audioTerms = parsed.audio_terms || [];
            if (subtitleTerms.length > 0) {
                t.subtitleTerms = subtitleTerms.join(", ");
            }
            if (audioTerms.length > 0) {
                t.audioTerms = audioTerms.join(", ");
            }
        } catch (e) { /* ignore */ }

        return t;
    }

    _applyResolution(torrents, resolution) {
        if (!resolution || resolution === "Any") return torrents;
        const result = [];
        for (let i = 0; i < torrents.length; i++) {
            if (torrents[i].resolution && torrents[i].resolution.indexOf(resolution) !== -1) {
                result.push(torrents[i]);
            }
        }
        return result.length > 0 ? result : torrents;
    }

    async _magnetFromDetailPage(torrent) {
        if (!torrent.link) return "";
        const detailUrl = this.baseUrl + torrent.link;

        try {
            const html = await this._fetchText(detailUrl);

            // Try direct magnet link
            const magnetMatch = html.match(this._magnetRe);
            if (magnetMatch) return magnetMatch[0];

            // Fallback: download .torrent file
            const torMatch = html.match(this._torrentLinkRe);
            if (torMatch) {
                let torUrl = torMatch[1];
                if (torUrl.indexOf("http") !== 0) torUrl = this.baseUrl + torUrl;
                const data = await this._fetchText(torUrl);
                return $torrentUtils.getMagnetLinkFromTorrentData(data);
            }

            return "";
        } catch (e) {
            return "";
        }
    }
}
