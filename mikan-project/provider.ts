// ========== 内置全部类型定义 ==========
type AnimeProviderSmartSearchFilter = "batch" | "episodeNumber" | "resolution" | "query" | "bestReleases";
type AnimeProviderType = "main" | "special";

interface AnimeProviderSettings {
    canSmartSearch: boolean;
    smartSearchFilters: AnimeProviderSmartSearchFilter[];
    supportsAdult: boolean;
    type: AnimeProviderType;
}

interface FuzzyDate {
    year: number;
    month?: number;
    day?: number;
}

interface Media {
    id: number;
    idMal?: number;
    status?: string;
    format?: string;
    englishTitle?: string;
    romajiTitle?: string;
    episodeCount?: number;
    absoluteSeasonOffset?: number;
    synonyms: string[];
    isAdult: boolean;
    startDate?: FuzzyDate;
}

interface AnimeSearchOptions {
    media?: Media;
    query: string;
}

interface AnimeSmartSearchOptions {
    media: Media;
    query: string;
    batch: boolean;
    episodeNumber: number;
    resolution: string;
    anidbAID: number;
    anidbEID: number;
    bestReleases: boolean;
}

interface AnimeTorrent {
    name: string;
    date: string;
    size: number;
    formattedSize: string;
    seeders: number;
    leechers: number;
    downloadCount: number;
    link: string;
    downloadUrl?: string;
    magnetLink?: string;
    infoHash?: string;
    resolution?: string;
    isBatch?: boolean;
    episodeNumber: number;
    releaseGroup?: string;
    isBestRelease: boolean;
    confirmed: boolean;
}

type UserConfig = {
    baseUrl?: string;
};

type RssItem = {
    title: string;
    pageLink: string;
    torrentUrl: string;
    size: string;
    pubDate: string;
};
// =====================================

class Provider {
    private readonly baseUrl: string;
    private readonly searchEndpoint: string;
    private readonly latestEndpoint: string;
    private readonly headers: Record<string, string>;

    constructor(config: UserConfig) {
        this.baseUrl = config?.baseUrl || "https://mikanime.tv";
        this.searchEndpoint = "/RSS/Search?searchstr=";
        this.latestEndpoint = "/RSS/Classic";
        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64) Chrome 128",
            "Accept": "application/xml,text/xml,*/*",
            "Accept-Language": "zh-CN,zh;q=0.9"
        };
    }

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query"],
            supportsAdult: false,
            type: "main"
        };
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const query = encodeURIComponent(opts.query);
        const url = this.baseUrl + this.searchEndpoint + query;
        const items = await this.fetchRSS(url);
        return items.map(item => this.parseTorrent(item));
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        const queries = this.buildSmartSearchQueries(opts);
        const promises = queries.map(q => this.searchByWord(q));
        const resultsArr = await Promise.all(promises);

        let allTorrents: AnimeTorrent[] = [];
        resultsArr.forEach(arr => allTorrents = allTorrents.concat(arr));

        const seen = new Set<string>();
        const unique: AnimeTorrent[] = [];
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

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        if (torrent.infoHash) return torrent.infoHash;
        const magnet = await this.getTorrentMagnetLink(torrent);
        const match = magnet.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]+)/);
        return match ? match[1].toLowerCase() : "";
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
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

    async getLatest(): Promise<AnimeTorrent[]> {
        const url = this.baseUrl + this.latestEndpoint;
        const items = await this.fetchRSS(url);
        return items.map(item => this.parseTorrent(item));
    }

    private async searchByWord(word: string): Promise<AnimeTorrent[]> {
        if (!word.trim()) return [];
        const url = this.baseUrl + this.searchEndpoint + encodeURIComponent(word);
        const items = await this.fetchRSS(url);
        return items.map(item => this.parseTorrent(item));
    }

    private buildSmartSearchQueries(opts: AnimeSmartSearchOptions): string[] {
        const queries: string[] = [];
        const media = opts.media;
        if (opts.query) queries.push(opts.query.trim());

        const titles: string[] = [];
        if (media.romajiTitle) titles.push(media.romajiTitle);
        if (media.englishTitle) titles.push(media.englishTitle);
        if (media.synonyms?.length) titles.push(...media.synonyms);

        titles.forEach(t => {
            const clean = this.sanitizeTitle(t);
            queries.push(clean);
            if (opts.batch) queries.push(clean + " 合集");
        });

        const seen = new Set<string>();
        const unique: string[] = [];
        for (const q of queries) {
            const trimQ = q.trim();
            if (!seen.has(trimQ)) {
                seen.add(trimQ);
                unique.push(trimQ);
            }
        }
        return unique.slice(0, 5);
    }

    private sanitizeTitle(text: string): string {
        if (!text) return "";
        return text.replace(/[-_.!@#$%^&*()]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    private isBatchTorrent(torrent: AnimeTorrent): boolean {
        const name = torrent.name;
        return /合集|全集|Batch|Complete|Season|\d+[-~]\d+/.test(name);
    }

    private matchEpisodeNumber(title: string, targetEp: number): boolean {
        const padded = targetEp < 10 ? "0" + targetEp : String(targetEp);
        const regs = [
            new RegExp(`E${padded}\\b`),
            new RegExp(`EP${padded}\\b`),
            new RegExp(`第${targetEp}集`),
            new RegExp(`\\[${targetEp}\\]`)
        ];
        return regs.some(r => r.test(title));
    }

    private async fetchRSS(url: string): RssItem[] {
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

    private parseRSSItems(xml: string): RssItem[] {
        const items: RssItem[] = [];
        const itemReg = /<item>([\s\S]*?)<\/item>/gi;
        let match: RegExpExecArray | null;
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

    private getXmlText(xmlStr: string, tag: string): string {
        const reg = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
        const m = xmlStr.match(reg);
        return m ? this.stripCData(m[1]).trim() : "";
    }

    private stripCData(str: string): string {
        return str.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
    }

    private parseTorrent(item: RssItem): AnimeTorrent {
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
            isBatch: this.isBatchTorrent({ name } as AnimeTorrent),
            episodeNumber: epNum,
            releaseGroup,
            isBestRelease: false,
            confirmed: false
        };
    }

    private extractMagnet(rawTorrent: string): string {
        const magnetReg = /magnet:\?xt=urn:btih:[0-9a-zA-Z]+/;
        const m = rawTorrent.match(magnetReg);
        return m ? m[0] : "";
    }
}

export default Provider;