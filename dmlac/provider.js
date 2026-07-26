/// <reference path="./online-streaming-provider.d.ts" />
class Provider {
    constructor() {
        this.base = "https://www.dmlac.com"
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
            console.log("[DMLAC] search:", q)

            var url = this.base + "/search/-------------/?wd=" + encodeURIComponent(q)
            var res = await fetch(url, { headers: this._headers() })
            if (!res || !res.ok) return []
            var html = await res.text()
            console.log("[DMLAC] search:", html.length, "bytes")

            // Check if response has actual results or rate-limited
            if (html.length < 2000 || html.indexOf('v_list') === -1) {
                var isRateLimited = html.indexOf('\u7CFB\u7EDF\u63D0\u793A') >= 0 || html.indexOf('\u8BF7\u4E0D\u8981\u9891\u7E41\u64CD\u4F5C') >= 0
                if (isRateLimited) {
                    console.log("[DMLAC] rate limited, waiting 4s...")
                    try { $sleep(4000) } catch (_) {}
                } else {
                    console.log("[DMLAC] retry search...")
                    try { $sleep(2000) } catch (_) {}
                }
                res = await fetch(url, { headers: this._headers() })
                if (res && res.ok) html = await res.text()
            }

            if (!html || html.length < 2000 || html.indexOf('v_list') === -1) return []

            var results = [], seen = {}
            // Extract results by finding all detail links in the search page
            var searchStart = '<ul class="v_list">'
            var searchEnd = '</ul>'
            var listStart = html.indexOf(searchStart)
            if (listStart >= 0) {
                var listEnd = html.indexOf(searchEnd, listStart)
                var listHtml = listStart >= 0 && listEnd > listStart ? html.slice(listStart, listEnd + searchEnd.length) : html
                // Extract each item block
                var itemParts = listHtml.split('<li>')
                for (var pi = 1; pi < itemParts.length && results.length < 30; pi++) {
                    var part = itemParts[pi]
                    // Extract ID from href="/detail/ID/"
                    var idMatch = part.match(/href="\/detail\/(\d+)\/"/)
                    if (!idMatch) continue
                    var id = idMatch[1]
                    if (seen[id]) continue
                    // Extract title from class="title" link
                    var titleMatch = part.match(/class="title"[^>]*title="([^"]+)"/)
                    if (!titleMatch) continue
                    var title = titleMatch[1].trim()
                    if (!title) continue
                    if (title.indexOf("\u5728\u7EBF\u89C2\u770B") >= 0) continue
                    seen[id] = true
                    results.push({
                        id: id,
                        title: title,
                        url: this.base + "/detail/" + id + "/",
                        subOrDub: "sub"
                    })
                }
            }

            console.log("[DMLAC] found " + results.length + " results")
            return results
        } catch (e) {
            console.error("[DMLAC] search error:", e.message)
            return []
        }
    }

    async findEpisodes(id) {
        try {
            if (!id) return []
            console.log("[DMLAC] findEpisodes:", id)
            var html = await this._fetch(this.base + "/detail/" + id + "/")
            if (!html) return []

            // Match: /play/ID-SERVER-EPISODE/
            var linkRe = new RegExp('href="/play/' + id + '-(\\d+)-(\\d+)/"', 'g')
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

            // Use the server with most episodes
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
                    url: this.base + "/play/" + id + "-" + bestSid + "-" + epNum + "/",
                    title: "\u7B2C" + epNum + "\u96C6"
                })
            }

            console.log("[DMLAC] found " + eps.length + " episodes (sid=" + bestSid + ")")
            return eps
        } catch (e) {
            console.error("[DMLAC] findEpisodes error:", e)
            return []
        }
    }

    async findEpisodeServer(episode, server) {
        try {
            var epId = episode && episode.id || ""
            if (!epId) return { server: "Auto", headers: {}, videoSources: [] }

            var parts = epId.split("|")
            var animeId = parts[0] || ""
            var sid = parts[1] || "1"
            var nid = parts[2] || "1"

            if (!animeId) return { server: "Auto", headers: {}, videoSources: [] }

            var playUrl = this.base + "/play/" + animeId + "-" + sid + "-" + nid + "/"
            console.log("[DMLAC] play:", playUrl)

            var html = await this._fetch(playUrl)
            if (!html) return { server: "Auto", headers: {}, videoSources: [] }

            // Extract player_aaaa JSON
            var ps = html.indexOf("player_aaaa")
            if (ps === -1) {
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

            console.log("[DMLAC] m3u8:", videoUrl.slice(0, 80))
            return {
                server: server || "Auto",
                headers: { "Referer": this.base + "/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                videoSources: [{ url: videoUrl, type: "m3u8", quality: "auto", subtitles: [] }]
            }
        } catch (e) {
            console.error("[DMLAC] findEpisodeServer error:", e)
            return { server: server || "Auto", headers: {}, videoSources: [] }
        }
    }

    async _fetch(url) {
        try {
            var res = await fetch(url, { headers: this._headers() })
            if (!res || !res.ok) return ""
            return await res.text()
        } catch (e) {
            console.error("[DMLAC] fetch error:", url.slice(0, 60), e)
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
