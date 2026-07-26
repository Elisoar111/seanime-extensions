class Provider {
    constructor() {
        this.base = "https://www.freezeframez.com"
    }

    getSettings() {
        return {
            episodeServers: ["\u9ED8\u8BA4"],
            supportsDub: false,
        }
    }

    async search(opts) {
        try {
            var q = opts && opts.query || ""
            if (!q) return []
            console.log("[FFZ] search:", q)

            var res = await fetch(this.base + "/search.php?searchword=" + encodeURIComponent(q), {
                headers: this._headers()
            })
            if (!res || !res.ok) return []
            var html = await res.text()

            var results = [], seen = {}
            var re = /<a[^>]*href="\/dm\/(\d+)\.html"[^>]*title="([^"]+)"[^>]*>/g
            var m
            while ((m = re.exec(html)) !== null) {
                var id = m[1]
                var title = m[2].trim()
                if (!title || seen[id]) continue
                if (title.indexOf("\u5728\u7EBF\u89C2\u770B") >= 0) continue
                seen[id] = true
                results.push({
                    id: id,
                    title: title,
                    url: this.base + "/dm/" + id + ".html",
                    image: "",
                    subOrDub: "sub"
                })
                if (results.length >= 30) break
            }

            // Sort by relevance: keyword match priority
            var ql = q.toLowerCase()
            results.sort(function(a, b) {
                var at = a.title.toLowerCase(), bt = b.title.toLowerCase()
                var sa = this._score(at, ql), sb = this._score(bt, ql)
                return sb - sa
            }.bind(this))

            console.log("[FFZ] found " + results.length + " results")
            return results
        } catch (e) {
            console.error("[FFZ] search error:", e.message)
            return []
        }
    }

    _score(title, query) {
        if (title === query) return 100
        if (title.indexOf(query) === 0) return 80
        if (title.indexOf(query) > 0) return 60
        var words = query.split(/[\s:\u3001\u3000\uff0c,]+/)
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
            console.log("[FFZ] findEpisodes:", id)
            var html = await this._fetch(this.base + "/dm/" + id + ".html")
            if (!html) return []

            // Extract play links: /play/ID-SERVER-EPISODE.html
            var linkRe = new RegExp('href="/play/' + id + '-(\\d+)-(\\d+)\.html"', 'g')
            var epMap = {}, sidOrder = [], m
            while ((m = linkRe.exec(html)) !== null) {
                var sid = m[1]
                var nid = parseInt(m[2], 10)
                if (isNaN(nid)) continue
                if (nid === 0) continue  // skip index 0 (player placeholder)
                if (!epMap[sid]) {
                    epMap[sid] = {}
                    sidOrder.push(sid)
                }
                epMap[sid][nid] = true
            }

            if (!sidOrder.length) return []

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
                    url: this.base + "/play/" + id + "-" + bestSid + "-" + epNum + ".html",
                    title: "\u7B2C" + epNum + "\u96C6"
                })
            }

            console.log("[FFZ] found " + eps.length + " episodes (sid=" + bestSid + ")")
            return eps
        } catch (e) {
            console.error("[FFZ] findEpisodes error:", e)
            return []
        }
    }

    async findEpisodeServer(episode, server) {
        try {
            var epId = episode && episode.id || ""
            if (!epId) return { server: "Auto", headers: {}, videoSources: [] }

            var parts = epId.split("|")
            var animeId = parts[0] || ""
            var sid = parts[1] || "0"
            var nid = parts[2] || "1"

            if (!animeId) return { server: "Auto", headers: {}, videoSources: [] }

            var playUrl = this.base + "/play/" + animeId + "-" + sid + "-" + nid + ".html"
            console.log("[FFZ] play:", playUrl)

            var html = await this._fetch(playUrl)
            if (!html) return { server: "Auto", headers: {}, videoSources: [] }

            // Extract m3u8 URL from JavaScript: var next="URL"
            var m3 = html.match(/var\s+next\s*=\s*"([^"]+\.m3u8[^"]*)"/)
            if (!m3) {
                // Fallback: direct m3u8 regex
                var m3u = html.match(/https?:[^"'\s]+\.m3u8[^"'\s]*/)
                if (m3u) {
                    return {
                        server: server || "Auto",
                        headers: { "Referer": this.base + "/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                        videoSources: [{ url: m3u[0], type: "m3u8", quality: "auto", subtitles: [] }]
                    }
                }
                return { server: "Auto", headers: {}, videoSources: [] }
            }

            var videoUrl = m3[1]
            console.log("[FFZ] m3u8:", videoUrl.slice(0, 80))
            return {
                server: server || "Auto",
                headers: { "Referer": this.base + "/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                videoSources: [{ url: videoUrl, type: "m3u8", quality: "auto", subtitles: [] }]
            }
        } catch (e) {
            console.error("[FFZ] findEpisodeServer error:", e)
            return { server: server || "Auto", headers: {}, videoSources: [] }
        }
    }

    async _fetch(url) {
        try {
            var res = await fetch(url, { headers: this._headers() })
            if (!res || !res.ok) return ""
            return await res.text()
        } catch (e) {
            console.error("[FFZ] fetch error:", url.slice(0, 60), e)
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