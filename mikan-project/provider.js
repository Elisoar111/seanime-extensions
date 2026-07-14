var Provider = (function () {
    function Provider(config) {
        var raw = config?.baseUrl || "https://mikanime.tv";
        if (raw.endsWith("/")) raw = raw.slice(0, -1);
        this.baseUrl = raw;
        this.searchEndpoint = "/RSS/Search?searchstr=";
        this.latestEndpoint = "/RSS/Classic";
        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64) Chrome 128",
            "Accept": "application/xml,text/xml,*/*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": this.baseUrl + "/"
        };
    }

    Provider.prototype.getSettings = function () {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query", "bestReleases"],
            supportsAdult: false,
            type: "main"
        };
    };

    Provider.prototype.search = async function (opts) {
        var q = encodeURIComponent(opts.query).replace(/\+/g, "%20");
        var url = this.baseUrl + this.searchEndpoint + q;
        var items = await this.fetchRSS(url);
        return items.map(function (i) { return this.toTorrent(i); }.bind(this));
    };

    Provider.prototype.smartSearch = async function (opts) {
        var queries = this.buildQueries(opts);
        var promiseList = queries.map(function (w) { return this.singleSearch(w); }.bind(this));
        var resArr = await Promise.all(promiseList);
        var all = [];
        resArr.forEach(function (r) { all = all.concat(r); });
        var seen = new Set();
        var unique = [];
        for (var t of all) {
            var key = t.downloadUrl || t.name;
            if (!seen.has(key)) { seen.add(key); unique.push(t); }
        }
        var list = [...unique];
        if (opts.bestReleases) list.sort(function (a, b) { return (b.seeders || 0) - (a.seeders || 0); });
        if (opts.batch) list = list.filter(function (t) { return this.isBatch(t); }.bind(this));
        if (opts.episodeNumber > 0 && !opts.batch) {
            list = list.filter(function (t) { return this.matchEp(t.name, opts.episodeNumber); }.bind(this));
        }
        if (opts.resolution && opts.resolution !== "Any") {
            list = list.filter(function (t) { return t.resolution?.includes(opts.resolution); });
        }
        return list;
    };

    Provider.prototype.getTorrentInfoHash = async function (torrent) {
        if (torrent.infoHash) return torrent.infoHash;
        if (!torrent.downloadUrl) return "";
        var res = await fetch(torrent.downloadUrl, { headers: this.headers });
        var buf = await res.text();
        var magnet = $torrentUtils.getMagnetLinkFromTorrentData(buf);
        var m = magnet.match(/magnet:\?xt=urn:btih:([0-9a-zA-Z]+)/);
        return m ? m[1].toLowerCase() : "";
    };

    Provider.prototype.getTorrentMagnetLink = async function (torrent) {
        if (torrent.magnetLink) return torrent.magnetLink;
        if (!torrent.downloadUrl) return "";
        var res = await fetch(torrent.downloadUrl, { headers: this.headers });
        var buf = await res.text();
        return $torrentUtils.getMagnetLinkFromTorrentData(buf);
    };

    Provider.prototype.getLatest = async function () {
        var items = await this.fetchRSS(this.baseUrl + this.latestEndpoint);
        return items.map(function (i) { return this.toTorrent(i); }.bind(this));
    };

    Provider.prototype.singleSearch = async function (word) {
        var q = encodeURIComponent(word).replace(/\+/g, "%20");
        var url = this.baseUrl + this.searchEndpoint + q;
        var items = await this.fetchRSS(url);
        return items.map(function (i) { return this.toTorrent(i); }.bind(this));
    };

    Provider.prototype.buildQueries = function (opts) {
        var queries = [];
        if (opts.query) queries.push(this.clean(opts.query));
        var titles = [];
        if (opts.media.romajiTitle) titles.push(opts.media.romajiTitle);
        if (opts.media.englishTitle) titles.push(opts.media.englishTitle);
        if (opts.media.synonyms) titles.push(...opts.media.synonyms);
        if (opts.batch) {
            var _this = this;
            titles.forEach(function (t) {
                queries.push(_this.clean(t) + " 合集");
                queries.push(_this.clean(t) + " 全集");
            });
        }
        var _this2 = this;
        titles.forEach(function (t) {
            var c = _this2.clean(t);
            queries.push(c);
            var words = c.split(" ").filter(function (w) { return w.length > 2; });
            if (words.length > 3) queries.push(words.slice(0, 3).join(" "));
        });
        var s = new Set();
        queries.forEach(function (q) { s.add(q.trim()); });
        return Array.from(s).slice(0, 5);
    };

    Provider.prototype.clean = function (t) {
        return t.replace(/-/g, " ").replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, "").replace(/\s+/g, " ").trim();
    };

    Provider.prototype.isBatch = function (t) {
        return /合集|全集|Batch|Complete|\d+[-~]\d+/.test(t.name);
    };

    Provider.prototype.matchEp = function (title, ep) {
        var pad = ep < 10 ? "0" + ep : "" + ep;
        var regs = [
            new RegExp(`E${pad}(?!\\d)`, "i"),
            new RegExp(`EP${pad}(?!\\d)`, "i"),
            new RegExp("第" + ep + "集"),
            new RegExp("\\[" + pad + "\\]")
        ];
        return regs.some(function (r) { return r.test(title); });
    };

    Provider.prototype.fetchRSS = async function (url) {
        try {
            var res = await fetch(url, { headers: this.headers });
            if (!res.ok) throw new Error("HTTP" + res.status);
            var xml = await res.text();
            if (!xml.trim()) return [];
            return this.parseXml(xml);
        } catch (e) {
            console.error("RSS请求失败", e);
            return [];
        }
    };

    Provider.prototype.parseXml = function (xml) {
        var list = [];
        var reg = /<item>([\s\S]*?)<\/item>/gi;
        var match;
        while ((match = reg.exec(xml))) {
            var chunk = match[1];
            var get = function (tag) {
                var r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
                var m = chunk.match(r);
                return m ? this.strip(m[1]) : "";
            }.bind(this);
            list.push({
                title: get("title"),
                link: get("link"),
                enclosureUrl: chunk.match(/enclosure url=["']([^"']+)/)?.[1] || "",
                size: chunk.match(/length=["']([^"']+)/)?.[1] || "0",
                pubDate: get("pubDate")
            });
        }
        return list;
    };

    Provider.prototype.strip = function (s) {
        return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
    };

    Provider.prototype.toTorrent = function (item) {
        var name = item.title;
        var resolution = "";
        if (/1080[pP]/.test(name)) resolution = "1080";
        if (/720[pP]/.test(name)) resolution = "720";
        var epNum = -1;
        var epMatch = name.match(/EP?(\d+)|第(\d+)集/);
        if (epMatch) epNum = Number(epMatch[1] || epMatch[2]);
        var group = name.match(/【([^】]+)/)?.[1] || "";
        var date = "";
        try { date = new Date(item.pubDate).toISOString(); } catch {}
        return {
            name, date, size: parseInt(item.size, 10) || 0, formattedSize: "",
            seeders: -1, leechers: -1, downloadCount: 0, link: item.link,
            downloadUrl: item.enclosureUrl, magnetLink: "", infoHash: "",
            resolution, isBatch: this.isBatch({ name }), episodeNumber: epNum,
            releaseGroup: group, isBestRelease: false, confirmed: false
        };
    };
    return Provider;
})();
