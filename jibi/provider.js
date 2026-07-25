class Provider {
    constructor() {
        this.base = "https://www.jibi.cc"
    }

    getSettings() {
        return {
            episodeServers: ["\u5429\u54D41\u7EBF", "\u5429\u54D42\u7EBF", "\u5429\u54D43\u7EBF", "\u5429\u54D44\u7EBF", "\u5429\u54D45\u7EBF"],
            supportsDub: false,
        }
    }

    async search(opts) {
        try {
            var q = opts && opts.query || ""
            if (!q) return []
            console.log("[Jibi] search:", q)

            // Strategy 1: Suggest API
            var url = this.base + "/index.php/ajax/suggest?mid=1&wd=" + encodeURIComponent(q) + "&limit=10"
            var res = await fetch(url, { headers: this._headers() })
            if (res && res.ok) {
                var raw = await res.text()
                console.log("[Jibi] suggest raw:", raw.slice(0, 150))
                var data = JSON.parse(raw)
                if (data && data.code === 1 && data.list && data.list.length) {
                    var results = []
                    for (var i = 0; i < data.list.length; i++) {
                        results.push({
                            id: String(data.list[i].id),
                            title: data.list[i].name,
                            url: this.base + "/index.php/vod/detail/id/" + data.list[i].id + ".html",
                            subOrDub: "sub"
                        })
                    }
                    console.log("[Jibi] found " + results.length + " results")
                    return results
                }
            }

            // Strategy 2: Try HTML search page (fallback)
            console.log("[Jibi] suggest failed, trying search page")
            var html = await this._fetch(this.base + "/index.php/vod/search.html?wd=" + encodeURIComponent(q))
            if (html) {
                // Look for detail links with numeric IDs
                var linkRe = /href="\/index\.php\/vod\/detail\/id\/(\d+)\.html"[^>]*>.*?<\/a>/g
                var results2 = [], seen2 = {}, m
                while ((m = linkRe.exec(html)) !== null) {
                    if (seen2[m[1]]) continue
                    seen2[m[1]] = true
                    // Try to extract title from the link context
                    var ctx = html.slice(Math.max(0, m.index - 200), m.index + 200)
                    var titleMatch = ctx.match(/alt="([^"]+)"/) || ctx.match(/title="([^"]+)"/)
                    var title = titleMatch ? titleMatch[1] : "Anime " + m[1]
                    if (title.indexOf("\u67E5\u770B") >= 0 || title.indexOf("\u8BE6\u60C5") >= 0) continue
                    results2.push({
                        id: m[1],
                        title: title,
                        url: this.base + "/index.php/vod/detail/id/" + m[1] + ".html",
                        subOrDub: "sub"
                    })
                    if (results2.length >= 30) break
                }
                if (results2.length) {
                    console.log("[Jibi] found " + results2.length + " results (page)")
                    return results2
                }
            }

            console.log("[Jibi] no results")
            return []
        } catch (e) {
            console.error("[Jibi] search error:", e.message)
            return []
        }
    }

    async findEpisodes(id) {
        try {
            if (!id) return []
            console.log("[Jibi] findEpisodes:", id)
            var html = await this._fetch(this.base + "/index.php/vod/detail/id/" + id + ".html")
            if (!html) return []

            // Extract all play links and group by SID
            var linkRe = new RegExp('\\/play\\/id\\/' + id + '\\/sid\\/(\\d+)\\/nid\\/(\\d+)\\.html', 'g')
            var epMap = {}, sidOrder = [], m
            while ((m = linkRe.exec(html)) !== null) {
                var sid = m[1]
                var nid = parseInt(m[2], 10)
                if (isNaN(nid)) continue
                if (!epMap[sid]) {
                    epMap[sid] = {}
                    sidOrder.push(sid)
                }
                epMap[sid][nid] = true
            }

            if (!sidOrder.length) return []

            // Use the server with most episodes as default
            var bestSid = sidOrder[0], bestCount = 0
            for (var si = 0; si < sidOrder.length; si++) {
                var keys = Object.keys(epMap[sidOrder[si]])
                if (keys.length > bestCount) {
                    bestCount = keys.length
                    bestSid = sidOrder[si]
                }
            }

            var eps = []
            var nidList = Object.keys(epMap[bestSid])
            nidList.sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10) })
            for (var ei = 0; ei < nidList.length; ei++) {
                var epNum = parseInt(nidList[ei], 10)
                eps.push({
                    id: id + "|" + bestSid + "|" + epNum,
                    number: epNum,
                    url: this.base + "/index.php/vod/play/id/" + id + "/sid/" + bestSid + "/nid/" + epNum + ".html",
                    title: "\u7B2C" + epNum + "\u96C6"
                })
            }

            console.log("[Jibi] found " + eps.length + " episodes (sid=" + bestSid + ", " + sidOrder.length + " servers)")
            return eps
        } catch (e) {
            console.error("[Jibi] findEpisodes error:", e)
            return []
        }
    }

    async findEpisodeServer(episode, server) {
        try {
            var epId = episode && episode.id || ""
            if (!epId) return { server: "Auto", headers: {}, videoSources: [] }

            var parts = epId.split("|")
            var animeId = parts[0] || ""
            var sid = parts[1] || ""
            var nid = parts[2] || "1"

            if (!animeId || !sid) return { server: "Auto", headers: {}, videoSources: [] }

            var playUrl = this.base + "/index.php/vod/play/id/" + animeId + "/sid/" + sid + "/nid/" + nid + ".html"
            console.log("[Jibi] play:", playUrl)

            var html = await this._fetch(playUrl)
            if (!html) return { server: "Auto", headers: {}, videoSources: [] }

            // Extract player_aaaa JSON with nested brace parsing
            var ps = html.indexOf("player_aaaa")
            if (ps === -1) {
                // Fallback: direct m3u8 regex
                var m3 = html.match(/https?:[^"'\s]+\.m3u8[^"'\s]*/)
                if (m3) {
                    return {
                        server: server || "Auto",
                        headers: { "Referer": this.base + "/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                        videoSources: [{ url: m3[0], type: "m3u8", quality: "auto", subtitles: [] }]
                    }
                }
                return { server: "Auto", headers: {}, videoSources: [] }
            }

            var bs = html.indexOf("{", ps)
            if (bs === -1) return { server: "Auto", headers: {}, videoSources: [] }

            var depth = 0, objStr = ""
            for (var pi = bs; pi < html.length; pi++) {
                var ch = html[pi]
                if (ch === "{") depth++
                if (ch === "}") depth--
                if (depth === 0) { objStr = html.slice(bs, pi + 1); break }
            }

            if (!objStr) return { server: "Auto", headers: {}, videoSources: [] }

            var pd
            try { pd = JSON.parse(objStr) } catch (_) { return { server: "Auto", headers: {}, videoSources: [] } }

            var videoUrl = pd.url || ""
            if (!videoUrl) return { server: "Auto", headers: {}, videoSources: [] }

            if (videoUrl.indexOf("%u") !== -1) {
                videoUrl = videoUrl.replace(/%u([a-fA-F0-9]{4})/g, function(_, c) {
                    return String.fromCharCode(parseInt(c, 16))
                })
            }
            if (videoUrl.indexOf("%") !== -1) {
                try { videoUrl = decodeURIComponent(videoUrl) } catch (_) {}
            }

            console.log("[Jibi] m3u8:", videoUrl.slice(0, 80))
            return {
                server: server || "Auto",
                headers: { "Referer": this.base + "/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                videoSources: [{ url: videoUrl, type: "m3u8", quality: "auto", subtitles: [] }]
            }
        } catch (e) {
            console.error("[Jibi] findEpisodeServer error:", e)
            return { server: server || "Auto", headers: {}, videoSources: [] }
        }
    }

    async _fetch(url) {
        try {
            var res = await fetch(url, { headers: this._headers() })
            if (!res || !res.ok) return ""
            return await res.text()
        } catch (e) {
            console.error("[Jibi] fetch error:", url.slice(0, 60), e)
            return ""
        }
    }

    _headers() {
        return {
            "Referer": this.base + "/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }
    }
}
