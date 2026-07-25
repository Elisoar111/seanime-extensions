/// <reference path="./online-streaming-provider.d.ts" />

class Provider {
    constructor() {
        this.base = "https://www.vtt6.com"
    }

    getSettings() {
        return { episodeServers: ["\u9AD8\u6E05", "ikun", "\u975E\u51E1", "\u91CF\u5B50"], supportsDub: false }
    }

    async search(opts) {
        try {
            var q = opts && opts.query || ""
            if (!q) return []
            console.log("[VTT6] search:", q)

            var results = [], seen = {}, page = 1, maxPages = 10
            while (page <= maxPages) {
                var url = this.base + "/search/?wd=" + encodeURIComponent(q) + (page > 1 ? "&pageno=" + page : "")
                var res = await fetch(url, { headers: this._headers() })
                if (!res || !res.ok) break
                var html = await res.text()
                var found = 0
                var re = /<a[^>]*href="\/detail\/(\d+)\/"[^>]*>([^<]+)<\/a>/g, m
                while ((m = re.exec(html)) !== null) {
                    var title = m[2].trim()
                    if (!title || seen[m[1]] || title === "\u67E5\u770B\u8BE6\u60C5" || title.indexOf("\u67E5\u770B") >= 0) continue
                    seen[m[1]] = true
                    results.push({ id: m[1], title: title, url: this.base + "/detail/" + m[1] + "/", subOrDub: "sub" })
                    found++
                    if (results.length >= 30) break
                }
                if (found === 0 || results.length >= 30) break
                page++
            }
            // Sort by relevance: exact match > starts with > contains > partial
            results.sort(function(a, b) {
                var ql = q.toLowerCase()
                var at = a.title.toLowerCase(), bt = b.title.toLowerCase()
                var sa = this._score(at, ql), sb = this._score(bt, ql)
                return sb - sa
            }.bind(this))
            console.log("[VTT6] found " + results.length + " results (" + page + " pages)")
            return results
        } catch (e) { console.error("[VTT6] search error:", e); return [] }
    }

    _score(title, query) {
        if (title === query) return 100
        if (title.indexOf(query) === 0) return 80
        if (title.indexOf(query) > 0) return 60
        // Check if all query words appear in the title
        var words = query.split(/[\s:：、，,]+/)
        if (words.length > 1) {
            var matched = 0
            for (var i = 0; i < words.length; i++) {
                if (title.indexOf(words[i]) >= 0) matched++
            }
            if (matched === words.length) return 50
            if (matched > 0) return 30 + (matched / words.length) * 20
        }
        return 10
    }

    async findEpisodes(id) {
        try {
            if (!id) return []
            console.log("[VTT6] findEpisodes:", id)
            var res = await fetch(this.base + "/detail/" + id + "/", { headers: this._headers() })
            if (!res || !res.ok) return []
            var html = await res.text()
            var re = new RegExp("/play/" + id + "-(\\d+)-(\\d+)/", "g"), m, seen = {}, eps = []
            while ((m = re.exec(html)) !== null) {
                var epNum = parseInt(m[2], 10)
                if (isNaN(epNum) || seen[epNum]) continue
                seen[epNum] = true
                eps.push({ id: id + "|" + m[1] + "|" + epNum, number: epNum, url: this.base + "/play/" + id + "-1-" + epNum + "/", title: "\u7B2C" + epNum + "\u96C6" })
            }
            console.log("[VTT6] found " + eps.length + " episodes")
            return eps
        } catch (e) { console.error("[VTT6] findEpisodes error:", e); return [] }
    }

    _serverId(name) {
        var map = {"\u9AD8\u6E05":"1","ikun":"2","\u975E\u51E1":"3","\u91CF\u5B50":"4"}
        return map[name] || "1"
    }

    async findEpisodeServer(episode, server) {
        try {
            var epId = episode && episode.id || ""
            if (!epId) return { server: "Auto", headers: {}, videoSources: [] }
            var parts = epId.split("|"), epNum = parts[2] || "1"
            var sid = this._serverId(server)
            var playUrl = this.base + "/play/" + parts[0] + "-" + sid + "-" + epNum + "/"
            console.log("[VTT6] fetching:", playUrl)

            var res = await fetch(playUrl, { headers: this._headers() })
            if (!res || !res.ok) return { server: "Auto", headers: {}, videoSources: [] }
            var html = await res.text()

            // Extract m3u8 URL from JavaScript (directly embedded)
            var m3 = html.match(/https?:[^"']+\.m3u8[^"']*/)
            var videoUrl = m3 ? m3[0] : ""

            if (!videoUrl) {
                // Try video tag src
                var vs = html.match(/<video[^>]*src="([^"]+)"/)
                if (vs) videoUrl = vs[1]
            }

            if (!videoUrl) return { server: "Auto", headers: {}, videoSources: [] }

            console.log("[VTT6] m3u8:", videoUrl)
            return {
                server: "Auto",
                headers: { "Referer": this.base + "/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                videoSources: [{ url: videoUrl, type: "m3u8", quality: "auto" }]
            }
        } catch (e) { console.error("[VTT6] findEpisodeServer error:", e); return { server: "Auto", headers: {}, videoSources: [] } }
    }

    _headers() {
        return { "Referer": this.base + "/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    }
}