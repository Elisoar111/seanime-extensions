/// <reference path="./anime-torrent-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {
    constructor() {
        this.baseUrl = "https://mikanime.tv";
        this.searchEndpoint = "/RSS/Search?searchstr=";
        this.latestEndpoint = "/RSS/Classic";

        this._magnetRe = /magnet:\?xt=urn:btih:[a-fA-F0-9]+(?:&[a-zA-Z0-9%=$._*+\-:/]+)*/;
        this._infoHashRe = /magnet:\?xt=urn:btih:([a-fA-F0-9]+)/;
        this._itemRe = /<item>([\s\S]*?)<\/item>/gi;
        this._linkRe = /<link>([\s\S]*?)<\/link>/i;
        this._guidRe = /<guid[^>]*>([\s\S]*?)<\/guid>/i;
        this._enclosureUrlRe = /<enclosure[^>]*url="([^"]+)"[^>]*>/i;
        this._enclosureLengthRe = /<enclosure[^>]*length="([^"]+)"[^>]*>/i;
        this._titleRe = /<title>([\s\S]*?)<\/title>/i;
        this._pubDateRe = /<pubDate>([\s\S]*?)<\/pubDate>/i;
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
        console.log("[Mikan] search:", opts.query);
        const items = await this._fetchRSS(this.baseUrl + this.searchEndpoint + encodeURIComponent(opts.query));
        const result = items.map(item => this._toAnimeTorrent(item));
        await this._populateMagnetLinks(result);
        return result;
    }

    async smartSearch(opts) {
        const queries = this._buildSmartSearchQueries(opts);
        console.log("[Mikan] smartSearch queries:", queries);

        const resultsArr = await Promise.all(queries.map(q => this._searchByQuery(q)));

        // Merge + deduplicate
        const seen = {};
        const unique = [];
        for (let i = 0; i < resultsArr.length; i++) {
            for (let j = 0; j < resultsArr[i].length; j++) {
                const t = resultsArr[i][j];
                const key = t.downloadUrl || t.name;
                if (!seen[key]) {
                    seen[key] = true;
                    unique.push(t);
                }
            }
        }
        console.log("[Mikan] smartSearch total unique:", unique.length);

        const isMovie = opts.media.format === "MOVIE" || opts.media.episodeCount === 1;

        let result;

        if (isMovie) {
            result = unique;
        } else if (opts.batch) {
            const batches = unique.filter(t => this._isBatchName(t.name));
            result = batches.length > 0 ? batches : unique;
        } else if (opts.episodeNumber > 0) {
            // Strict episode match: only keep torrents with matching episode number
            const matched = unique.filter(t =>
                t.episodeNumber === opts.episodeNumber ||
                this._matchEpisodeNumber(t.name, opts.episodeNumber)
            );
            result = matched.length > 0 ? matched : unique;
        } else {
            result = unique;
        }

        result = this._applyResolution(result, opts.resolution);

        if (opts.bestReleases && result.length > 1) {
            const best = this._filterBestReleases(result);
            if (best.length > 0) result = best;
        }

        await this._populateMagnetLinks(result);
        return result;
    }

    async getTorrentMagnetLink(torrent) {
        if (torrent.magnetLink) return torrent.magnetLink;

        if (torrent.downloadUrl) {
            try {
                const magnet = await this._resolveMagnetFromTorrent(torrent.downloadUrl);
                if (magnet && magnet.indexOf("magnet:") === 0) return magnet;
            } catch (e) { /* fall through */ }
        }

        if (torrent.link) {
            try {
                const magnet = await this._resolveMagnetFromDetailPage(torrent.link);
                if (magnet && magnet.indexOf("magnet:") === 0) return magnet;
            } catch (e) { /* fall through */ }
        }

        return "";
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
        const result = items.map(item => this._toAnimeTorrent(item));
        await this._populateMagnetLinks(result);
        return result;
    }

    // ── Magnet link resolution ───────────────────────────────────────

    async _populateMagnetLinks(torrents) {
        if (!torrents || torrents.length === 0) return;
        const batchSize = 5;
        for (let i = 0; i < torrents.length; i += batchSize) {
            const batch = torrents.slice(i, i + batchSize);
            await Promise.all(batch.map(async (t) => {
                if (t.magnetLink || !t.downloadUrl) return;
                try {
                    const magnet = await this._resolveMagnetFromTorrent(t.downloadUrl);
                    if (magnet && magnet.indexOf("magnet:") === 0) {
                        t.magnetLink = magnet;
                        const m = magnet.match(this._infoHashRe);
                        if (m) t.infoHash = m[1].toLowerCase();
                    }
                } catch (e) { /* silent */ }
            }));
        }
    }

    async _resolveMagnetFromTorrent(url) {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://mikanime.tv/"
            }
        });
        if (!res.ok) return "";
        const text = await res.text();
        const magnet = $torrentUtils.getMagnetLinkFromTorrentData(text);
        return magnet && typeof magnet === "string" ? magnet : "";
    }

    async _resolveMagnetFromDetailPage(link) {
        const detailUrl = link.indexOf("http") === 0
            ? link
            : this.baseUrl + (link.indexOf("/") === 0 ? "" : "/") + link;
        const res = await fetch(detailUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://mikanime.tv/"
            }
        });
        if (!res.ok) return "";
        const html = await res.text();
        const m = html.match(this._magnetRe);
        return m ? m[0] : "";
    }

    // ── RSS fetching & parsing ───────────────────────────────────────

    async _searchByQuery(query) {
        if (!query || query.trim() === "") return [];
        try {
            const items = await this._fetchRSS(
                this.baseUrl + this.searchEndpoint + encodeURIComponent(query)
            );
            return items.map(item => this._toAnimeTorrent(item));
        } catch (e) {
            return [];
        }
    }

    async _fetchRSS(url) {
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "https://mikanime.tv/"
                }
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const xml = await res.text();
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
            let link = this._extract(xml2, this._linkRe);
            if (!link) link = this._extract(xml2, this._guidRe);
            items.push({
                title: this._extract(xml2, this._titleRe),
                link: link,
                downloadUrl: this._extractAttr(xml2, this._enclosureUrlRe),
                size: this._extractAttr(xml2, this._enclosureLengthRe) || "0",
                pubDate: this._extract(xml2, this._pubDateRe),
            });
        }
        return items;
    }

    _extract(xml, re) {
        const m = xml.match(re);
        return m ? this._stripCDATA(m[1]) : "";
    }

    _extractAttr(xml, re) {
        const m = xml.match(re);
        return m ? m[1].trim() : "";
    }

    _stripCDATA(s) {
        return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
    }

    // ── Query building ───────────────────────────────────────────────

    _buildSmartSearchQueries(opts) {
        const queries = [];

        if (opts.query && opts.query.trim()) {
            queries.push(opts.query.trim());
        }

        const titles = [];
        if (opts.media.romajiTitle) titles.push(opts.media.romajiTitle);
        if (opts.media.englishTitle && titles.indexOf(opts.media.englishTitle) === -1) titles.push(opts.media.englishTitle);
        if (opts.media.synonyms) {
            for (let i = 0; i < opts.media.synonyms.length; i++) {
                const s = opts.media.synonyms[i];
                if (titles.indexOf(s) === -1) titles.push(s);
            }
        }

        if (opts.batch) {
            for (let i = 0; i < titles.length && queries.length < 5; i++) {
                const bq = titles[i] + " 合集";
                if (queries.indexOf(bq) === -1) queries.push(bq);
                if (queries.length >= 5) break;
                const fq = titles[i] + " 全集";
                if (queries.indexOf(fq) === -1) queries.push(fq);
            }
        }

        for (let i = 0; i < Math.min(titles.length, 1); i++) {
            const clean = titles[i]
                .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, "")
                .replace(/\s+/g, " ")
                .trim();
            if (clean && queries.indexOf(clean) === -1 && queries.length < 5) {
                queries.push(clean);
            }
        }

        return queries.slice(0, 5);
    }

    _sanitizeTitle(t) {
        return t
            .replace(/-/g, " ")
            .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    _zeropad(v) {
        const n = typeof v === "number" ? v : parseInt(v, 10);
        return !isNaN(n) ? String(n).padStart(2, "0") : String(v);
    }

    _isBatchName(name) {
        if (/合集|全集|Batch|Complete/i.test(name)) return true;
        if (/S\d{1,2}E\d{1,3}\s*(?:~|-|–|—)\s*E\d{1,3}/i.test(name)) return true;
        if (/\b(?:0\d|1\d|2[0-4])\s*(?:~|～)\s*(?:0\d|1\d|2[0-4])\b/i.test(name)) return true;
        if (/\bS\d{1,2}\b(?!\s*[Ex]?\d)/i.test(name)) return true;
        if (/Season\s+\d{1,2}/i.test(name)) return true;
        if (/第\d+季/.test(name)) return true;
        if (/\b(?:Box\s*Set|Boxset|Collection)\b/i.test(name)) return true;
        return false;
    }

    _matchEpisodeNumber(title, epNum) {
        const padded = epNum < 10 ? "0" + epNum : String(epNum);
        return new RegExp(
            "\\[" + padded + "\\]|第" + epNum + "集|[Ee][Pp]?" + padded + "\\b"
        ).test(title);
    }

    // ── Torrent object construction ──────────────────────────────────

    _toAnimeTorrent(item) {
        const t = {
            name: item.title || "",
            date: "",
            size: parseInt(item.size, 10) || 0,
            formattedSize: this._bytesToHuman(parseInt(item.size, 10) || 0),
            seeders: -1, leechers: -1, downloadCount: 0,
            link: item.link || "",
            downloadUrl: item.downloadUrl || "",
            magnetLink: undefined, infoHash: undefined,
            resolution: "", isBatch: false, episodeNumber: -1, releaseGroup: "",
            subtitleTerms: "", audioTerms: "",
            isBestRelease: false, confirmed: true
        };

        if (item.pubDate) {
            try {
                t.date = new Date(item.pubDate).toISOString();
            } catch (e) { /* ignore */ }
        }

        try {
            const p = $habari.parse(t.name);

            if (p.video_resolution) t.resolution = p.video_resolution;
            if (p.release_group) t.releaseGroup = p.release_group;

            if (p.episode_number && p.episode_number.length === 1) {
                const ep = parseInt(p.episode_number[0]);
                if (!isNaN(ep)) t.episodeNumber = ep;
            }

            if (p.subtitle_terms && p.subtitle_terms.length > 0) {
                t.subtitleTerms = p.subtitle_terms.join(", ");
            } else {
                t.subtitleTerms = this._detectSubtitles(t.name);
            }

            if (p.audio_terms && p.audio_terms.length > 0) {
                t.audioTerms = p.audio_terms.join(", ");
            } else {
                t.audioTerms = this._detectAudio(t.name);
            }
        } catch (e) {
            t.subtitleTerms = this._detectSubtitles(t.name);
            t.audioTerms = this._detectAudio(t.name);
        }

        return t;
    }

    // ── Subtitle / Audio detection ───────────────────────────────────

    _detectSubtitles(name) {
        const found = [];
        const subMap = {
            "简繁内封": "Chi (简繁)",
            "简体内封": "Chi (简)",
            "繁体内封": "Chi (繁)",
            "Multi-Sub": "Multi",
            "简日内封": "Chi+Jpn",
            "日英内封": "Jpn+Eng",
        };
        for (const [keyword, label] of Object.entries(subMap)) {
            if (name.indexOf(keyword) !== -1 && found.indexOf(label) === -1) found.push(label);
        }
        const subTags = name.match(/\b(CHS|CHT|BIG5|GB|JP|JPN|ENG|Multi-Sub|MultiSub)\b/g);
        if (subTags) {
            for (const tag of subTags) {
                if (found.indexOf(tag) === -1) found.push(tag);
            }
        }
        return found.join(", ");
    }

    _detectAudio(name) {
        const found = [];
        if (/\bDual-Audio\b|\bDual Audio\b|\b双语\b/i.test(name)) {
            found.push("Dual-Audio");
        }
        const audioTags = name.match(/\b(JP|JPN|ENG|CHN|CHI)\b/g);
        if (audioTags) {
            for (const tag of audioTags) {
                if (found.indexOf(tag) === -1) found.push(tag);
            }
        }
        return found.join(", ");
    }

    // ── Filtering ────────────────────────────────────────────────────

    _applyResolution(torrents, resolution) {
        if (!resolution || resolution === "Any") return torrents;
        const matched = [];
        for (let i = 0; i < torrents.length; i++) {
            if (torrents[i].resolution && torrents[i].resolution.indexOf(resolution) !== -1) {
                matched.push(torrents[i]);
            }
        }
        return matched.length > 0 ? matched : torrents;
    }

    _filterBestReleases(torrents) {
        if (torrents.length <= 1) return torrents;

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

    // ── Utilities ────────────────────────────────────────────────────

    _bytesToHuman(bytes) {
        if (!bytes || bytes === 0) return "";
        const k = 1024;
        const sizes = ["Bytes", "KiB", "MiB", "GiB", "TiB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
}
