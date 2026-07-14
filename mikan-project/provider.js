class Provider {
    constructor(config) {
        this.baseUrl = config?.baseUrl || "https://mikanime.tv";
        this.searchEndpoint = "/RSS/Search?searchstr=";
        this.latestEndpoint = "/RSS/Classic";
        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64) Chrome 128",
            "Accept": "application/xml,text/xml,*/*",
            "Accept-Language": "zh-CN,zh;q=0.9"
        };
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
        const query = encodeURIComponent(opts.query);
        const url = this.baseUrl + this.searchEndpoint + query;
        const items = await this.fetchRSS(url);
        return items.map(item => this.parseTorrent(item));
    }

    async smartSearch(opts) {
        const queries = this.buildSmartSearchQueries(opts);
        const promises = queries.map(q => this.searchByWord(q));
        const resultsArr = await Promise.all(promises);

        let allTorrents = [];
        resultsArr.forEach(arr => allTorrents = allTorrents.concat(arr));

        const seen = new Set();
        const unique = [];
        for (const t of allTorrents) {
            const key = t.downloadUrl || t.infoHash || t.name;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(t);
            }
        }

        let filtered = [...unique];
        if (opts.batch) filtered = filtered.filter(t => this.isBatchTorrent(t));
        if (opts.episodeNumber > 0 && !opts.batch) {
            filtered = filtered.filter(t => this.matchEpisodeNumber(t.name, opts.episodeNumber));
        }
        if (opts.resolution && opts.resolution !== "Any") {
            filtered = filtered.filter(t => t.resolution?.includes(opts.resolution));
        }
        return filtered;
    }

    async getTorrentInfoHash(torrent) {
        if (torrent.infoHash) return torrent.infoHash;
        const magnet = await this.getTorrentMagnetLink(torrent);
        const match = magnet.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]+)/);
        return match ? match[1].toLowerCase() : "";
    }

    async getTorrentMagnetLink(torrent) {
        if (torrent.magnetLink) return torrent.magnetLink;
        if (!torrent.downloadUrl) return "";
        try {
            const res = await fetch(torrent.downloadUrl);
            if (!res.ok) throw new Error("Download failed");
            const raw = await res.text();
            return this.extractMagnet(raw);
        } catch {
            return "";
        }
    }

    async getLatest() {
        const url = this.baseUrl + this.latestEndpoint;
        const items = await this.fetchRSS(url);
        return items.map(item => this.parseTorrent(item));
    }

    async searchByWord(word) {
        if (!word.trim()) return [];
        const url = this.baseUrl + this.searchEndpoint + encodeURIComponent(word);
        const items = await this.fetchRSS(url);
        return items.map(item => this.parseTorrent(item));
    }

    buildSmartSearchQueries(opts) {
        const queries = [];
        const media = opts.media;
        if (opts.query) queries.push(opts.query.trim());

        const titles = [];
        if (media.romajiTitle) titles.push(media.romajiTitle);
        if (media.englishTitle) titles.push(media.englishTitle);
        if (media.synonyms?.length) titles.push(...media.synonyms);

        titles.forEach(t => {
            const clean = this.sanitizeTitle(t);
            queries.push(clean);
            if (opts.batch) queries.push(clean + " 合集");
        });

        const seen = new Set();
        const unique = [];
        for (const q of queries) {
            const trimQ = q.trim();
            if (!seen.has(trimQ)) {
                seen.add(trimQ);
                unique.push(trimQ);
            }
        }
        return unique.slice(0, 5);
    }

    sanitizeTitle(text) {
        if (!text) return "";
        return text.replace(/[-_.!@#$%^&*()]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    isBatchTorrent(torrent) {
        const name = torrent.name;
        return /合集|全集|Batch|Complete|Season|\d+[-~]\d+/.test(name);
    }

    matchEpisodeNumber(title, targetEp) {
        const padded = targetEp < 10 ? "0" + targetEp : String(targetEp);
        const regs = [
            new RegExp(`E${padded}\\b`),
            new RegExp(`EP${padded}\\b`),
            new RegExp(`第${targetEp}集`),
            new RegExp(`\\[${targetEp}\\]`)
        ];
        return regs.some(r => r.test(title));
    }

    async fetchRSS(url) {
        try {
            const res = await fetch(url, { headers: this.headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const xml = await res.text();
            return this.parseRSSItems(xml);
        } catch (err) {
            console.error("[Mikan RSS Error]", err);
            return [];
        }
    }

    parseRSSItems(xml) {
        const items = [];
        const itemReg = /<item>([\s\S]*?)<\/item>/gi;
        let match;
        while ((match = itemReg.exec(xml)) !== null) {
            const chunk = match[1];
            const title = this.getXmlText(chunk, "title");
            const pageLink = this.getXmlText(chunk, "link");
            const pubDate = this.getXmlText(chunk, "pubDate");
            const encMatch = chunk.match(/enclosure url=["']([^"']+)["']/);
            const lenMatch = chunk.match(/length=["']([^"']+)["']/);
            items.push({
                title,
                pageLink,
                torrentUrl: encMatch ? encMatch[1] : "",
                size: lenMatch ? lenMatch[1] : "0",
                pubDate
            });
        }
        return items;
    }

    getXmlText(xmlStr, tag) {
        const reg = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
        const m = xmlStr.match(reg);
        return m ? this.stripCData(m[1]).trim() : "";
    }

    stripCData(str) {
        return str.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
    }

    parseTorrent(item) {
        const name = item.title;
        let resolution = "";
        if (/1080/.test(name)) resolution = "1080";
        else if (/720/.test(name)) resolution = "720";

        let epNum = -1;
        const epMatch = name.match(/E(\d+)|EP(\d+)|第(\d+)集/);
        if (epMatch) epNum = Number(epMatch[1] || epMatch[2] || epMatch[3]);

        let date = "";
        try {
            date = new Date(item.pubDate).toISOString();
        } catch {}

        const groupMatch = name.match(/【([^】]+)】/);
        const releaseGroup = group ? group[1] : "";

        return {
            name,
            date,
            size: parseInt(item.size, 10) || 0,
            formattedSize: "",
            seeders: -1,
            leechers: -1,
            downloadCount: 0,
            link: item.pageLink,
            downloadUrl: item.torrentUrl,
            magnetLink: "",
            infoHash: "",
            resolution,
            isBatch: this.isBatchTorrent({ name }),
            episodeNumber: epNum,
            releaseGroup,
            isBestRelease: false,
            confirmed: false
        };
    }

    extractMagnet(rawTorrent) {
        const magnetReg = /magnet:\?xt=urn:btih:[0-9a-zA-Z]+/;
        const m = rawTorrent.match(magnetReg);
        return m ? m[0] : "";
    }
}

export default Provider;
