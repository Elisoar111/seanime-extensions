/// <reference path="./plugin.d.ts" />

/**
 * Bangumi Metadata Plugin v3.0
 *
 * - Floating button on anime entry pages -> jumps to a full Bangumi info page (Webview screen)
 * - Multi-endpoint failover for users whose network blocks api.bgm.tv
 * - Rich info page: rating + rank + distribution chart, tags, infobox, summary,
 *   characters, episodes, related subjects, personal collection status (token),
 *   manual search / direct-ID binding, AniList score comparison
 * - Hook: injects Chinese titles into collection synonyms
 */
function init(): void {

    $ui.register((ctx: UIContext): void => {
        console.log("[bangumi-ui] 插件已加载 v3.2.5")

        // =================================================================
        //  Constants
        // =================================================================
        const CNS = "bangumi.data."
        const XNS = "bangumi.extra."
        const MNS = "bangumi.match."
        const TTL = 86400000 * 3
        const DEFAULT_ENDPOINTS = "https://api.bgm.tv"
        const MIRROR_ENDPOINT = "https://api.bangumi.lol"

        // =================================================================
        //  View Model (single state synced to the webview)
        // =================================================================
        interface EntryMeta {
            titles: string[]
            cover: string
            banner: string
            score: number
            year: number
        }
        interface VM {
            status: string            // idle | loading | ready | error | not-found
            errorMsg: string
            mediaId: number
            subjectId: number
            endpoint: string
            bound: boolean
            entry: EntryMeta | null
            subject: BgmSubject | null
            chars: BgmCharacter[] | null
            rels: BgmRelation[] | null
            eps: BgmEpisode[] | null
            collection: BgmUserCollection | null
            searchResults: BgmSubjectLite[]
            searching: boolean
            hasToken: boolean
            tokenInvalid: boolean
        }

        const emptyVM: VM = {
            status: "idle", errorMsg: "", mediaId: 0, subjectId: 0,
            endpoint: "", bound: false, entry: null, subject: null,
            chars: null, rels: null, eps: null, collection: null,
            searchResults: [], searching: false, hasToken: false, tokenInvalid: false
        }

        const mediaIdState = ctx.state<number>(0)
        const vm = ctx.state<VM>(emptyVM)

        function patchVm(patch: any): void {
            const cur = vm.get() as any
            const next: any = {}
            for (const k in cur) {
                if (Object.prototype.hasOwnProperty.call(cur, k)) next[k] = cur[k]
            }
            for (const k in patch) {
                if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k]
            }
            vm.set(next)
        }

        // =================================================================
        //  Settings — 读取 manifest userConfig（Extensions 页面可视化编辑）
        // =================================================================
        function pref(name: string, fallback: string): string {
            try {
                const v = $getUserPreference(name)
                if (v === undefined || v === null || v === "") return fallback
                return String(v)
            } catch (_) { return fallback }
        }
        function prefBool(name: string, fallback: boolean): boolean {
            return pref(name, fallback ? "true" : "false") === "true"
        }

        // =================================================================
        //  Network layer — endpoint failover
        // =================================================================
        let lastGoodEndpoint = ""

        function endpoints(): string[] {
            const raw = pref("apiEndpoints", DEFAULT_ENDPOINTS) || DEFAULT_ENDPOINTS
            const parts = raw.split(",")
            const out: string[] = []
            for (let i = 0; i < parts.length; i++) {
                let e = parts[i].replace(/\s+/g, "")
                if (!e) continue
                if (e.charAt(e.length - 1) === "/") e = e.substring(0, e.length - 1)
                if (out.indexOf(e) === -1) out.push(e)
            }
            if (!out.length) out.push(DEFAULT_ENDPOINTS)
            // 默认配置（仅官方 API）时自动追加公共镜像兜底；用户自定义端点则尊重其配置
            if (raw.replace(/\s+/g, "") === DEFAULT_ENDPOINTS && out.indexOf(MIRROR_ENDPOINT) === -1) {
                out.push(MIRROR_ENDPOINT)
            }
            // Sticky: try last known-good endpoint first
            if (lastGoodEndpoint && out.indexOf(lastGoodEndpoint) > 0) {
                out.splice(out.indexOf(lastGoodEndpoint), 1)
                out.unshift(lastGoodEndpoint)
            }
            return out
        }

        function hdrs(): Record<string, string> {
            const h: Record<string, string> = {
                "User-Agent": "Seanime-Bangumi/3.0",
                "Accept": "application/json"
            }
            const t = pref("accessToken", "").replace(/^\s+|\s+$/g, "")
            if (t) h["Authorization"] = "Bearer " + t
            return h
        }
        function hdrsNoAuth(): Record<string, string> {
            return { "User-Agent": "Seanime-Bangumi/3.0", "Accept": "application/json" }
        }

        // GET with failover across endpoints; resolves with the raw response
        function apiGet(path: string): Promise<FetchResponse> {
            const eps = endpoints()
            return tryGet(eps, 0, path)
        }

        function tryGet(eps: string[], i: number, path: string, retries?: number): Promise<FetchResponse> {
            if (i >= eps.length) return Promise.reject(new Error("所有 Bangumi 端点均无法连接"))
            const url = eps[i] + path
            const left = retries === undefined ? 2 : retries
            return ctx.fetch(url, { headers: hdrs() }).then(
                (r) => {
                    // Token 无效时去掉 Authorization 重试一次（仅限公开路径；
                    // 用户私有路径必须保留 401，否则 tokenInvalid 检测会被掩盖）
                    const isPrivate = path.indexOf("/v0/me") === 0 || path.indexOf("/v0/users/-") === 0
                    if (r && r.status === 401 && !isPrivate && pref("accessToken", "")) {
                        console.log("[bangumi-ui] 401 (token 无效), 去掉 token 重试")
                        return ctx.fetch(url, { headers: hdrsNoAuth() }).then(
                            (r2) => handleGetResp(r2, eps, i, path, left),
                            () => tryGet(eps, i + 1, path))
                    }
                    return handleGetResp(r, eps, i, path, left)
                },
                () => tryGet(eps, i + 1, path)
            )
        }

        // 429 限流 → 等待重试当前端点；5xx / 403 / 无响应 → 切换端点；2xx 与 404 视为正常响应
        function handleGetResp(r: FetchResponse | null, eps: string[], i: number, path: string, retries: number): Promise<FetchResponse> {
            if (r && r.status === 429 && retries > 0) {
                console.log("[bangumi-ui] 429 限流，2s 后重试 " + eps[i])
                $sleep(2000)
                return tryGet(eps, i, path, retries - 1)
            }
            if (!r || !r.status || r.status >= 500 || r.status === 429 || r.status === 403) {
                return tryGet(eps, i + 1, path)
            }
            lastGoodEndpoint = eps[i]
            return Promise.resolve(r)
        }

        // POST search with failover
        function apiSearch(kw: string, limit: number): Promise<BgmSearchResponse> {
            const eps = endpoints()
            const body = JSON.stringify({
                keyword: kw, sort: "match",
                filter: { type: [2] },
                limit: limit || 10
            })
            return trySearch(eps, 0, body)
        }

        function trySearch(eps: string[], i: number, body: string, retries?: number): Promise<BgmSearchResponse> {
            if (i >= eps.length) return Promise.reject(new Error("所有 Bangumi 端点均无法连接"))
            const url = eps[i] + "/v0/search/subjects"
            const left = retries === undefined ? 2 : retries
            const h = hdrs()
            h["Content-Type"] = "application/json"
            return ctx.fetch(url, { method: "POST", headers: h, body: body }).then(
                (r) => {
                    // Token 无效时去掉 Authorization 重试一次
                    if (r && r.status === 401 && pref("accessToken", "")) {
                        const h2 = hdrsNoAuth()
                        h2["Content-Type"] = "application/json"
                        return ctx.fetch(url, { method: "POST", headers: h2, body: body }).then((r2) => {
                            return handleSearchResp(r2, eps, i, body, left)
                        }, () => trySearch(eps, i + 1, body))
                    }
                    return handleSearchResp(r, eps, i, body, left)
                },
                () => trySearch(eps, i + 1, body)
            )
        }

        // 429 限流 → 等待重试当前端点；其余非 2xx / 解析失败 → 切换端点
        function handleSearchResp(r: FetchResponse | null, eps: string[], i: number, body: string, retries: number): Promise<BgmSearchResponse> {
            if (r && r.status === 429 && retries > 0) {
                console.log("[bangumi-ui] 429 限流，2s 后重试 " + eps[i])
                $sleep(2000)
                return trySearch(eps, i, body, retries - 1)
            }
            if (!r || !r.status || r.status < 200 || r.status >= 300) {
                return trySearch(eps, i + 1, body)
            }
            lastGoodEndpoint = eps[i]
            let d: BgmSearchResponse | null = null
            try { d = r.json<BgmSearchResponse>() } catch (_) { d = null }
            if (!d) return trySearch(eps, i + 1, body)
            return Promise.resolve(d)
        }

        // POST / PATCH 写请求（收藏状态、进度），同样支持故障转移与 429 退避
        function apiWrite(method: string, path: string, obj: any): Promise<FetchResponse> {
            const eps = endpoints()
            const body = JSON.stringify(obj || {})
            return tryWrite(eps, 0, method, path, body)
        }

        function tryWrite(eps: string[], i: number, method: string, path: string, body: string, retries?: number): Promise<FetchResponse> {
            if (i >= eps.length) return Promise.reject(new Error("所有 Bangumi 端点均无法连接"))
            const url = eps[i] + path
            const left = retries === undefined ? 2 : retries
            const h = hdrs()
            h["Content-Type"] = "application/json"
            return ctx.fetch(url, { method: method, headers: h, body: body }).then(
                (r) => {
                    if (r && r.status === 429 && left > 0) {
                        console.log("[bangumi-ui] 429 限流，2s 后重试 " + eps[i])
                        $sleep(2000)
                        return tryWrite(eps, i, method, path, body, left - 1)
                    }
                    if (!r || !r.status || r.status >= 500 || r.status === 429 || r.status === 403) {
                        return tryWrite(eps, i + 1, method, path, body)
                    }
                    lastGoodEndpoint = eps[i]
                    return Promise.resolve(r)
                },
                () => tryWrite(eps, i + 1, method, path, body)
            )
        }

        // =================================================================
        //  Storage cache
        // =================================================================
        function cGet(mid: number): BgmSubject | null {
            try {
                const raw = $storage.get(CNS + mid)
                if (!raw) return null
                const d = JSON.parse(String(raw)) as any
                return (d._ts && Date.now() - d._ts < TTL) ? d : null
            } catch (_) { return null }
        }
        function cSet(mid: number, d: BgmSubject): void {
            try {
                (d as any)._ts = Date.now()
                $storage.set(CNS + mid, JSON.stringify(d))
            } catch (_) { /* ignore */ }
        }
        function cDel(mid: number): void {
            try { $storage.remove(CNS + mid) } catch (_) { /* ignore */ }
        }
        function xGet(sid: number): any {
            try {
                const raw = $storage.get(XNS + sid)
                if (!raw) return null
                const d = JSON.parse(String(raw))
                return (d._ts && Date.now() - d._ts < TTL) ? d : null
            } catch (_) { return null }
        }
        function xSet(sid: number, d: any): void {
            try {
                d._ts = Date.now()
                $storage.set(XNS + sid, JSON.stringify(d))
            } catch (_) { /* ignore */ }
        }
        function mGet(mid: number): string | null {
            const v = $storage.get(MNS + mid)
            return v ? String(v) : null
        }
        function mSet(mid: number, sid: number): void {
            try { $storage.set(MNS + mid, String(sid)) } catch (_) { /* ignore */ }
        }
        function mDel(mid: number): void {
            try { $storage.remove(MNS + mid) } catch (_) { /* ignore */ }
        }

        // =================================================================
        //  Title matching helpers
        // =================================================================
        function cleanTitle(t: string): string {
            if (!t) return ""
            return t.replace(/: .*$/, "")
                .replace(/ Season \d+/i, "")
                .replace(/ \d+(st|nd|rd|th) Season/i, "")
                .replace(/ Part \d+/i, "")
                .replace(/ \([^)]*\)$/, "")
                .replace(/\（[^）]*\）$/, "")
                .trim()
        }

        function similarity(a: string, b: string): number {
            if (!a || !b) return 0
            a = a.toLowerCase()
            b = b.toLowerCase()
            if (a === b) return 1
            if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return 0.85
            const sa: Record<string, number> = {}
            const sb: Record<string, number> = {}
            let m = 0
            for (let i = 0; i < a.length; i++) {
                sa[a[i]] = (sa[a[i]] || 0) + 1
            }
            for (let j = 0; j < b.length; j++) {
                sb[b[j]] = (sb[b[j]] || 0) + 1
            }
            for (const k in sa) {
                if (Object.prototype.hasOwnProperty.call(sa, k) && sb[k]) {
                    m += Math.min(sa[k], sb[k])
                }
            }
            return (2 * m) / (a.length + b.length)
        }

        function wordScore(query: string, target: string): number {
            const words = query.toLowerCase().split(/[\s\-–—:·]+/)
            const t = target.toLowerCase()
            let matched = 0
            let total = 0
            for (let k = 0; k < words.length; k++) {
                const w = words[k]
                if (w.length < 1) continue
                total++
                if (t.indexOf(w) !== -1) matched++
            }
            return total > 0 ? (matched / total) * 0.9 : 0
        }

        function mScore(result: BgmSubjectLite, titles: string[], year: number): number {
            let best = 0
            const names: string[] = []
            if (result.name_cn) names.push(result.name_cn)
            if (result.name) names.push(result.name)
            for (let i = 0; i < titles.length; i++) {
                for (let j = 0; j < names.length; j++) {
                    const cs = similarity(titles[i], names[j])
                    const ws = wordScore(titles[i], names[j])
                    best = Math.max(best, cs, ws)
                }
            }
            // Year match bonus
            if (year && result.date && String(result.date).substring(0, 4) === String(year)) {
                best += 0.2
            }
            // Small bonus for having both Chinese and Japanese names
            if (result.name_cn && result.name && result.name_cn !== result.name) {
                best += 0.05
            }
            return Math.min(best, 1)
        }

        // =================================================================
        //  Matching engine (with race guard)
        // =================================================================
        let reqSeq = 0

        function loadForEntry(id: number, force: boolean): void {
            const seq = ++reqSeq
            const stale = (): boolean => seq !== reqSeq

            patchVm({
                status: "loading", errorMsg: "", mediaId: id, subjectId: 0,
                bound: false, subject: null, chars: null, rels: null, eps: null,
                collection: null, searchResults: [], searching: false,
                hasToken: !!pref("accessToken", ""), tokenInvalid: false
            })

            if (force) cDel(id)

            // Entry meta (title candidates, cover, score, year) — non-blocking
            getEntryMeta(id).then((meta) => {
                if (stale()) return
                patchVm({ entry: meta })

                // 1. Manual / auto-persisted binding
                const boundId = mGet(id)
                if (boundId) {
                    const sid = parseInt(boundId, 10)
                    if (sid) {
                        fetchSubject(id, sid, seq, true)
                        return
                    }
                }

                // 2. Subject cache
                const cached = cGet(id)
                if (cached) {
                    if (stale()) return
                    patchVm({
                        status: "ready", subject: cached,
                        subjectId: cached.id, endpoint: lastGoodEndpoint
                    })
                    loadExtras(cached.id, seq)
                    loadCollection(cached.id, seq)
                    return
                }

                // 3. Auto search
                if (!prefBool("autoMatch", true)) {
                    patchVm({ status: "not-found", errorMsg: "自动匹配已关闭，请手动搜索" })
                    return
                }
                autoSearch(id, meta, seq)
            })
        }

        function getEntryMeta(id: number): Promise<EntryMeta> {
            const fallback: EntryMeta = { titles: [], cover: "", banner: "", score: 0, year: 0 }
            let p: Promise<AnimeEntry>
            try {
                const r = ctx.anime.getAnimeEntry(id)
                p = (r && typeof (r as any).then === "function")
                    ? (r as Promise<AnimeEntry>)
                    : Promise.resolve(r as AnimeEntry)
            } catch (_) {
                return Promise.resolve(fallback)
            }
            return p.then((en) => {
                if (!en || !en.media) return fallback
                const ti = en.media.title || {}
                let year = 0
                if (en.media.startDate && en.media.startDate.year) year = en.media.startDate.year
                else if (en.media.seasonYear) year = en.media.seasonYear
                const ci = en.media.coverImage || {}
                // 日语标题优先：Bangumi 主名称字段就是日文原名
                const raw: string[] = []
                if (ti.native) raw.push(ti.native)
                if (ti.romaji && raw.indexOf(ti.romaji) === -1) raw.push(ti.romaji)
                if (ti.userPreferred && raw.indexOf(ti.userPreferred) === -1) raw.push(ti.userPreferred)
                if (ti.english && raw.indexOf(ti.english) === -1) raw.push(ti.english)
                return {
                    titles: raw,
                    cover: ci.extraLarge || ci.large || ci.medium || "",
                    banner: en.media.bannerImage || "",
                    score: en.media.averageScore || 0,
                    year: year
                }
            }, () => fallback)
        }

        function titleCandidates(meta: EntryMeta | null): string[] {
            if (!meta || !meta.titles || !meta.titles.length) return []
            const seen: Record<string, boolean> = {}
            const out: string[] = []
            const add = (t: string): void => {
                if (!t || seen[t]) return
                seen[t] = true
                out.push(t)
            }
            for (let i = 0; i < meta.titles.length; i++) {
                const t = meta.titles[i]
                add(t)
                const c = cleanTitle(t)
                if (c !== t) add(c)
                // Also try just the main title before a colon
                const ci = t.indexOf(": ")
                if (ci > 2) add(t.slice(0, ci).trim())
            }
            console.log("[bangumi-ui] titleCandidates: " + out.join(" | "))
            return out
        }

        function autoSearch(id: number, meta: EntryMeta, seq: number): void {
            const stale = (): boolean => seq !== reqSeq
            const cands = titleCandidates(meta)
            if (!cands.length) {
                patchVm({ status: "error", errorMsg: "未能识别番剧标题，请手动搜索" })
                return
            }
            const year = meta.year || 0
            let globalBest: BgmSubjectLite | null = null
            let globalScore = 0
            let netFail = 0

            function tryCandidate(idx: number): void {
                if (stale()) return
                if (idx >= cands.length) {
                    if (globalBest && globalScore >= 0.25) {
                        if (globalScore >= 0.92) mSet(id, globalBest.id)
                        fetchSubject(id, globalBest.id, seq, globalScore >= 0.92)
                        return
                    }
                    if (netFail >= cands.length) {
                        patchVm({ status: "error", errorMsg: "无法连接 Bangumi（可在插件设置中配置镜像端点 https://api.bangumi.lol）" })
                        return
                    }
                    patchVm({ status: "not-found", errorMsg: "未找到 Bangumi 条目，请手动搜索" })
                    return
                }
                console.log("[bangumi-ui] searching: " + cands[idx])
                apiSearch(cands[idx], 10).then((d) => {
                    if (stale()) return
                    if (!d || !d.data || !d.data.length) {
                        tryCandidate(idx + 1)
                        return
                    }
                    for (let i = 0; i < d.data.length; i++) {
                        const sc = mScore(d.data[i], cands, year)
                        if (sc > globalScore) {
                            globalScore = sc
                            globalBest = d.data[i]
                        }
                    }
                    if (globalScore >= 0.82) {
                        // High confidence — stop searching
                        if (globalScore >= 0.92) mSet(id, globalBest!.id)
                        fetchSubject(id, globalBest!.id, seq, globalScore >= 0.92)
                        return
                    }
                    // Keep trying more candidates to find the best match
                    tryCandidate(idx + 1)
                }, () => {
                    if (stale()) return
                    netFail++
                    tryCandidate(idx + 1)
                })
            }
            tryCandidate(0)
        }

        function fetchSubject(mediaId: number, sid: number, seq: number, bound: boolean): void {
            const stale = (): boolean => seq !== reqSeq
            // Cached subject for this mediaId?
            const cached = cGet(mediaId)
            if (cached && cached.id === sid) {
                if (stale()) return
                patchVm({
                    status: "ready", subject: cached, subjectId: sid,
                    bound: bound, endpoint: lastGoodEndpoint
                })
                loadExtras(sid, seq)
                loadCollection(sid, seq)
                return
            }
            apiGet("/v0/subjects/" + sid).then((r) => {
                if (stale()) return
                if (!r) { patchVm({ status: "error", errorMsg: "获取条目详情失败：响应为空" }); return }
                let d: BgmSubject | null = null
                try { d = r.json<BgmSubject>() } catch (_) { d = null }
                if (!d || !d.id) {
                    patchVm({ status: "error", errorMsg: "获取条目详情失败" })
                    return
                }
                cSet(mediaId, d)
                patchVm({
                    status: "ready", subject: d, subjectId: d.id,
                    bound: bound, endpoint: lastGoodEndpoint
                })
                loadExtras(d.id, seq)
                loadCollection(d.id, seq)
            }, () => {
                if (stale()) return
                patchVm({ status: "error", errorMsg: "无法连接 Bangumi（可在插件设置中配置镜像端点）" })
            })
        }

        function normalizeEps(data: any): BgmEpisode[] | null {
            if (!data) return null
            if (Array.isArray(data)) return data as BgmEpisode[]
            // 兼容旧版缓存格式 {data: [...]}
            if (data.data && Array.isArray(data.data)) return data.data as BgmEpisode[]
            return null
        }

        // ---- Extras: characters / episodes / relations (fault-tolerant) ----
        function fetchAllEpisodes(sid: number, offset: number, collected: BgmEpisode[]): Promise<BgmEpisode[]> {
            return apiGet("/v0/episodes?subject_id=" + sid + "&type=0&limit=100&offset=" + offset).then((r) => {
                if (!r) return collected
                let page: any = null
                try { page = r.json() } catch (_) { page = null }
                if (!page || !page.data || !page.data.length) return collected
                const merged = collected.concat(page.data as BgmEpisode[])
                if (page.data.length < 100 || merged.length >= 2000) return merged
                return fetchAllEpisodes(sid, offset + 100, merged)
            }, () => collected)
        }

        function loadExtras(sid: number, seq: number): void {
            const stale = (): boolean => seq !== reqSeq
            const cachedX = xGet(sid)
            if (cachedX) {
                patchVm({
                    chars: cachedX.chars || null,
                    eps: normalizeEps(cachedX.eps),
                    rels: cachedX.rels || null
                })
                return
            }
            const wantChars = prefBool("loadCharacters", true)
            const wantEps = prefBool("loadEpisodes", true)
            const wantRels = prefBool("loadRelations", true)

            const pChars: Promise<any> = wantChars
                ? apiGet("/v0/subjects/" + sid + "/characters").then((r) => r ? r.json() : null, () => null)
                : Promise.resolve(null)
            const pEps: Promise<any> = wantEps
                ? fetchAllEpisodes(sid, 0, [])
                : Promise.resolve(null)
            const pRels: Promise<any> = wantRels
                ? apiGet("/v0/subjects/" + sid + "/subjects").then((r) => r ? r.json() : null, () => null)
                : Promise.resolve(null)

            Promise.all([pChars, pEps, pRels]).then((arr) => {
                if (stale()) return
                const chars = arr[0] && arr[0].length ? (arr[0] as BgmCharacter[]) : null
                const epsData = normalizeEps(arr[1])
                const rels = arr[2] && arr[2].length ? (arr[2] as BgmRelation[]) : null
                xSet(sid, { chars: chars, eps: epsData, rels: rels })
                patchVm({ chars: chars, eps: epsData, rels: rels })
            })
        }

        // ---- Personal collection status (requires access token) ----
        function loadCollection(sid: number, seq: number): void {
            const token = pref("accessToken", "")
            if (!token) return
            const stale = (): boolean => seq !== reqSeq
            const cachedUser = $storage.get("bangumi.me")
            let meCached: BgmMe | null = null
            if (cachedUser) {
                try { meCached = JSON.parse(String(cachedUser)) as BgmMe } catch (_) { meCached = null }
            }
            const pUser: Promise<BgmMe | null> = meCached
                ? Promise.resolve(meCached)
                : apiGet("/v0/me").then((r) => {
                    if (r && r.status === 401) {
                        patchVm({ tokenInvalid: true })
                        return null
                    }
                    const me = r ? r.json<BgmMe>() : null
                    if (me && me.username) {
                        try { $storage.set("bangumi.me", JSON.stringify(me)) } catch (_) { /* ignore */ }
                    }
                    return me
                }, () => null)

            pUser.then((me) => {
                if (stale() || !me || !me.username) return
                apiGet("/v0/users/" + encodeURIComponent(me.username) + "/collections/" + sid).then((r) => {
                    if (stale()) return
                    if (r && r.status === 401) { patchVm({ tokenInvalid: true }); return }
                    if (!r || (r.status && r.status === 404)) return
                    const col = r ? r.json<BgmUserCollection>() : null
                    if (col) patchVm({ collection: col })
                }, () => { /* not collected or offline */ })
            })
        }

        // ---- Manual search / bind ----
        function doManualSearch(q: string): void {
            q = (q || "").replace(/^\s+|\s+$/g, "")
            if (!q) { ctx.toast.error("请输入关键词"); return }
            patchVm({ searching: true, searchResults: [] })
            apiSearch(q, 12).then((d) => {
                patchVm({
                    searching: false,
                    searchResults: (d && d.data) ? d.data.slice(0, 12) : []
                })
            }, () => {
                patchVm({ searching: false, searchResults: [] })
                ctx.toast.error("搜索失败：Bangumi 端点均无法连接")
            })
        }

        function bindSubject(input: string): void {
            const id = vm.get().mediaId
            if (!id) { ctx.toast.error("请先打开一个番剧条目页"); return }
            let sid = 0
            const urlMatch = String(input).match(/subject\/(\d+)/)
            if (urlMatch) sid = parseInt(urlMatch[1], 10)
            else if (/^\d+$/.test(String(input).replace(/\s+/g, ""))) {
                sid = parseInt(String(input).replace(/\s+/g, ""), 10)
            }
            if (!sid) { ctx.toast.error("无法识别 Bangumi ID 或链接"); return }
            mSet(id, sid)
            cDel(id)
            ctx.toast.success("已绑定 Bangumi ID: " + sid)
            loadForEntry(id, false)
        }

        function pickSearchResult(sidStr: string): void {
            const sid = parseInt(sidStr, 10)
            const id = vm.get().mediaId
            if (!sid || !id) return
            mSet(id, sid)
            cDel(id)
            loadForEntry(id, false)
        }

        // =================================================================
        //  Navigation tracking
        // =================================================================
        ctx.screen.onNavigate((e: NavigateEvent): void => {
            let newMid = 0
            if (e && e.pathname === "/entry" && e.searchParams && e.searchParams.id) {
                newMid = parseInt(e.searchParams.id, 10) || 0
            }
            if (newMid > 0) {
                mediaIdState.set(newMid)
            } else if (e && e.pathname !== "/entry" && e.pathname.indexOf("/webview") !== 0) {
                // Keep mediaId when jumping INTO the webview page
                mediaIdState.set(0)
            }
        })
        ctx.screen.loadCurrent()

        // Load data when mediaId changes
        ctx.effect((): void => {
            const id = mediaIdState.get()
            if (!id) {
                reqSeq++
                patchVm({ status: "idle", errorMsg: "", mediaId: 0, subject: null, searchResults: [] })
                return
            }
            loadForEntry(id, false)
        }, [mediaIdState])

        // =================================================================
        //  Webview screen page（通过左侧边栏 Bangumi 入口访问）
        // =================================================================
        const wv = ctx.newWebview({
            slot: "screen",
            fullWidth: true,
            autoHeight: true,
            sidebar: {
                label: "Bangumi",
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="m17 2-5 5-5-5"/></svg>'
            }
        })

        wv.channel.sync("vm", vm)

        wv.onLoad((): void => {
            patchVm({})
        })

        wv.channel.on("refresh", () => {
            const id = vm.get().mediaId
            if (!id) { ctx.toast.info("请先打开一个番剧条目页"); return }
            loadForEntry(id, true)
        })

        wv.channel.on("search", (q?: any) => {
            doManualSearch(String(q || ""))
        })

        wv.channel.on("bind-id", (v?: any) => {
            bindSubject(String(v || ""))
        })

        wv.channel.on("bind-pick", (v?: any) => {
            pickSearchResult(String(v || ""))
        })

        wv.channel.on("clear-cache", () => {
            const id = vm.get().mediaId
            if (!id) return
            cDel(id)
            mDel(id)
            ctx.toast.success("已清除该条目的缓存与绑定")
            loadForEntry(id, false)
        })

        // ---- 收藏状态与观看进度管理（需要 access token）----
        wv.channel.on("set-status", (v?: any) => {
            const sid = vm.get().subjectId
            const t = parseInt(String(v || ""), 10)
            if (!sid || !t || t < 1 || t > 5) return
            if (!pref("accessToken", "")) { ctx.toast.error("请先在插件设置中配置 Bangumi Access Token"); return }
            apiWrite("POST", "/v0/users/-/collections/" + sid, { type: t }).then((r) => {
                if (r && r.status && r.status >= 200 && r.status < 300) {
                    ctx.toast.success("已更新收藏状态")
                    loadCollection(sid, reqSeq)
                } else if (r && r.status === 401) {
                    patchVm({ tokenInvalid: true })
                    ctx.toast.error("Token 无效或已过期，请到 bgm.tv → 设置 → 开发者 重新创建")
                } else {
                    ctx.toast.error("状态更新失败 (HTTP " + (r ? r.status : "无响应") + ")")
                }
            }, () => ctx.toast.error("状态更新失败：无法连接 Bangumi"))
        })

        wv.channel.on("set-progress", (v?: any) => {
            const sid = vm.get().subjectId
            const n = parseInt(String(v || ""), 10)
            if (!sid || isNaN(n) || n < 0) return
            if (!pref("accessToken", "")) { ctx.toast.error("请先在插件设置中配置 Bangumi Access Token"); return }
            apiWrite("PATCH", "/v0/users/-/collections/" + sid, { ep_status: n }).then((r) => {
                if (r && r.status && r.status >= 200 && r.status < 300) {
                    ctx.toast.success("进度已更新到第 " + n + " 话")
                    loadCollection(sid, reqSeq)
                } else if (r && r.status === 401) {
                    patchVm({ tokenInvalid: true })
                    ctx.toast.error("Token 无效或已过期，请到 bgm.tv → 设置 → 开发者 重新创建")
                } else if (r && r.status === 404) {
                    ctx.toast.error("请先设置收藏状态，再更新进度")
                } else {
                    ctx.toast.error("进度更新失败 (HTTP " + (r ? r.status : "无响应") + ")")
                }
            }, () => ctx.toast.error("进度更新失败：无法连接 Bangumi"))
        })

        wv.channel.on("open-bgm", (v?: any) => {
            const sid = parseInt(String(v || ""), 10) || vm.get().subjectId
            if (!sid) return
            try {
                $app.openURL("https://bgm.tv/subject/" + sid)
            } catch (_) {
                ctx.toast.info("https://bgm.tv/subject/" + sid)
            }
        })

        wv.setContent(buildHTML)

        // =================================================================
        //  Webview HTML
        // =================================================================
        function buildHTML(): string {
            return "<!DOCTYPE html>\n" +
"<html lang=\"zh\">\n" +
"<head>\n" +
"<meta charset=\"UTF-8\">\n" +
"<style>\n" +
"html{color-scheme:dark;}\n" +
"*{box-sizing:border-box;}\n" +
"body{background:transparent;color:#e2e8f0;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;margin:0;padding:24px;font-size:14px;line-height:1.6;}\n" +
"a{color:#8b5cf6;text-decoration:none;}\n" +
".wrap{max-width:1080px;margin:0 auto;}\n" +
".fade{animation:fadein .25s ease;}\n" +
"@keyframes fadein{from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:none;}}\n" +
".topbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:20px;}\n" +
".brand{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;letter-spacing:.3px;}\n" +
".brand .dot{width:10px;height:10px;border-radius:50%;background:#f09199;box-shadow:0 0 12px rgba(240,145,153,.6);}\n" +
".chips{display:flex;gap:8px;flex-wrap:wrap;}\n" +
".chip{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:999px;font-size:12px;background:#1e293b;color:#94a3b8;border:1px solid #334155;}\n" +
".chip.pink{background:rgba(240,145,153,.12);color:#f09199;border-color:rgba(240,145,153,.35);}\n" +
".chip.green{background:rgba(16,185,129,.12);color:#34d399;border-color:rgba(16,185,129,.35);}\n" +
".chip.gold{background:rgba(245,158,11,.12);color:#fbbf24;border-color:rgba(245,158,11,.35);}\n" +
".chip.nsfw{background:rgba(239,68,68,.15);color:#f87171;border-color:rgba(239,68,68,.4);font-size:11px;}\n" +
".btn{padding:7px 14px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:13px;cursor:pointer;transition:.15s;font-family:inherit;}\n" +
".btn:hover{background:#334155;transform:translateY(-1px);}\n" +
".btn.primary{background:#6366f1;border-color:#6366f1;}\n" +
".btn.primary:hover{background:#4f46e5;}\n" +
".btn.danger:hover{background:#7f1d1d;border-color:#ef4444;}\n" +
".btn.ghost{background:transparent;}\n" +
".btnrow{display:flex;gap:8px;flex-wrap:wrap;}\n" +
".card{background:#10161f;border:1px solid #1e293b;border-radius:14px;padding:20px;}\n" +
".hero{position:relative;overflow:hidden;border:1px solid #1e293b;border-radius:16px;margin-bottom:20px;background:#0d131c;}\n" +
".hero-bg{position:absolute;inset:-24px;background-size:cover;background-position:center 25%;filter:blur(30px) brightness(.42) saturate(1.25);transform:scale(1.12);}\n" +
".hero-fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(9,13,20,.15) 0%,rgba(9,13,20,.78) 65%,rgba(9,13,20,.95) 100%);}\n" +
".hero-in{position:relative;display:flex;gap:22px;padding:26px;align-items:flex-end;min-height:210px;}\n" +
".hero-cover{width:168px;aspect-ratio:3/4;object-fit:cover;border-radius:12px;background:#1e293b;box-shadow:0 10px 34px rgba(0,0,0,.55);flex-shrink:0;cursor:zoom-in;}\n" +
".hero-txt{min-width:0;padding-bottom:4px;}\n" +
".hero-txt h1{font-size:26px;margin:0 0 6px;line-height:1.3;text-shadow:0 2px 12px rgba(0,0,0,.6);}\n" +
".hero-jp{font-size:15px;color:#c3cbd8;font-weight:500;}\n" +
".hero-al{font-size:12px;color:#8b96a8;margin-top:3px;}\n" +
".nextep{display:inline-block;margin-top:10px;padding:3px 12px;border-radius:999px;font-size:12px;background:rgba(99,102,241,.16);color:#a5b4fc;border:1px solid rgba(99,102,241,.4);}\n" +
"@media(max-width:680px){.hero-in{flex-direction:column;align-items:flex-start;min-height:0;}.hero-cover{width:120px;}}\n" +
".grid{display:grid;grid-template-columns:260px 1fr;gap:24px;}\n" +
"@media(max-width:760px){.grid{grid-template-columns:1fr;}}\n" +
".scorebox{padding:16px;background:#0b0f16;border-radius:12px;border:1px solid #1e293b;}\n" +
".scorerow{display:flex;align-items:center;gap:16px;justify-content:center;}\n" +
".score-num{font-size:42px;font-weight:800;line-height:1.05;}\n" +
".score-max{font-size:14px;color:#64748b;font-weight:500;}\n" +
".scoresub{display:flex;flex-direction:column;align-items:flex-start;}\n" +
".muted{color:#94a3b8;}\n" +
".small{font-size:12px;}\n" +
"h3{font-size:15px;margin:22px 0 10px;padding-left:10px;border-left:3px solid #f09199;}\n" +
".meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 16px;margin:4px 0 14px;}\n" +
".meta .k{font-size:12px;color:#64748b;}\n" +
".meta .v{font-weight:600;}\n" +
".tagrow{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;}\n" +
".summary{color:#cbd5e1;white-space:pre-wrap;}\n" +
".dist-row{display:flex;align-items:center;gap:8px;margin:3px 0;font-size:11px;}\n" +
".dist-row .n{width:14px;text-align:right;color:#64748b;}\n" +
".dist-bar{height:8px;border-radius:4px;background:linear-gradient(90deg,#f09199,#f43f5e);min-width:2px;transition:width .4s ease;}\n" +
".dist-row .c{width:36px;color:#64748b;}\n" +
".tabs{display:flex;gap:4px;border-bottom:1px solid #1e293b;margin-top:24px;position:sticky;top:0;background:rgba(9,13,20,.82);backdrop-filter:blur(10px);z-index:20;border-radius:10px 10px 0 0;}\n" +
".tab{padding:10px 18px;cursor:pointer;border:none;background:none;color:#94a3b8;font-size:14px;border-bottom:2px solid transparent;font-family:inherit;transition:.15s;}\n" +
".tab:hover{color:#e2e8f0;}\n" +
".tab.active{color:#f09199;border-bottom-color:#f09199;font-weight:600;}\n" +
".cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:12px;margin-top:14px;}\n" +
".citem{background:#0b0f16;border:1px solid #1e293b;border-radius:10px;overflow:hidden;text-align:center;cursor:zoom-in;transition:transform .15s,border-color .15s;}\n" +
".citem:hover{transform:translateY(-3px);border-color:rgba(240,145,153,.4);}\n" +
".cimg{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:#1e293b;}\n" +
".cname{padding:6px 6px 2px;font-size:12px;font-weight:600;line-height:1.3;}\n" +
".crel{padding:0 6px 6px;font-size:11px;color:#f09199;}\n" +
".ccv{padding:0 6px 8px;font-size:11px;color:#64748b;}\n" +
".eptable{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px;}\n" +
".eptable td{padding:7px 10px;border-bottom:1px solid #1e293b;}\n" +
".eptable tr:nth-child(even) td{background:rgba(148,163,184,.03);}\n" +
".eptable tr:hover td{background:#141b26;}\n" +
".epnum{width:50px;color:#f09199;font-weight:700;}\n" +
".epdate{width:110px;color:#64748b;font-size:12px;text-align:right;}\n" +
".relgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-top:14px;}\n" +
".relitem{background:#0b0f16;border:1px solid #1e293b;border-radius:10px;padding:10px;transition:border-color .15s;}\n" +
".relitem:hover{border-color:rgba(240,145,153,.35);}\n" +
".relname{font-size:13px;font-weight:600;line-height:1.35;margin-top:4px;}\n" +
".reltype{font-size:11px;color:#f09199;}\n" +
".relbtns{display:flex;gap:6px;margin-top:8px;}\n" +
".center{text-align:center;padding:60px 20px;}\n" +
".spinner{width:36px;height:36px;border:3px solid #1e293b;border-top-color:#f09199;border-radius:50%;margin:0 auto 16px;animation:spin 1s linear infinite;}\n" +
"@keyframes spin{to{transform:rotate(360deg);}}\n" +
".panel{margin-top:20px;border:1px dashed #334155;border-radius:12px;padding:16px;background:#0b0f16;}\n" +
".input{flex:1;min-width:180px;padding:8px 12px;border-radius:8px;border:1px solid #334155;background:#10161f;color:#e2e8f0;font-size:13px;font-family:inherit;}\n" +
".input:focus{outline:none;border-color:#6366f1;}\n" +
".srow{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;}\n" +
".sresult{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid #1e293b;border-radius:8px;margin-top:6px;background:#10161f;}\n" +
".sresult:hover{border-color:#f09199;}\n" +
".sthumb{width:40px;height:54px;object-fit:cover;border-radius:6px;background:#1e293b;flex-shrink:0;}\n" +
".sinfo{flex:1;min-width:0;}\n" +
".ibox{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px;}\n" +
".ibox td{padding:4px 8px;border-bottom:1px solid #1e293b;vertical-align:top;}\n" +
".ibox td:first-child{color:#64748b;width:90px;white-space:nowrap;}\n" +
".warnbox{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:12px 16px;margin-top:12px;font-size:13px;color:#fbbf24;}\n" +
".zoombg{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:pointer;animation:fadein .15s ease;}\n" +
".zoombg img{max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 0 60px rgba(0,0,0,.6);cursor:default;display:block;object-fit:contain;}\n" +
".collbox{margin-top:14px;padding:12px;background:#0b0f16;border:1px solid #1e293b;border-radius:12px;}\n" +
".colltitle{font-size:12px;color:#64748b;text-align:center;margin-bottom:8px;}\n" +
".statusrow{display:flex;gap:4px;justify-content:center;flex-wrap:wrap;}\n" +
".stbtn{padding:5px 10px;font-size:12px;border-radius:7px;border:1px solid #334155;background:#1e293b;color:#94a3b8;cursor:pointer;transition:.15s;font-family:inherit;}\n" +
".stbtn:hover{background:#334155;color:#e2e8f0;}\n" +
".stbtn.active{font-weight:600;}\n" +
".stbtn.active.s1{background:rgba(96,165,250,.15);color:#60a5fa;border-color:rgba(96,165,250,.5);}\n" +
".stbtn.active.s2{background:rgba(52,211,153,.15);color:#34d399;border-color:rgba(52,211,153,.5);}\n" +
".stbtn.active.s3{background:rgba(240,145,153,.15);color:#f09199;border-color:rgba(240,145,153,.5);}\n" +
".stbtn.active.s4{background:rgba(251,191,36,.15);color:#fbbf24;border-color:rgba(251,191,36,.5);}\n" +
".stbtn.active.s5{background:rgba(148,163,184,.15);color:#94a3b8;border-color:rgba(148,163,184,.5);}\n" +
".progrow{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px;}\n" +
".pbtn{width:26px;height:26px;border-radius:7px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:15px;cursor:pointer;line-height:1;font-family:inherit;}\n" +
".pbtn:hover{background:#334155;}\n" +
".progtxt{font-size:12px;color:#cbd5e1;min-width:110px;text-align:center;}\n" +
".pgnrow{display:flex;gap:4px;justify-content:center;margin-top:16px;flex-wrap:wrap;}\n" +
".pgnbtn{width:32px;height:32px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#94a3b8;font-size:13px;cursor:pointer;font-family:inherit;}\n" +
".pgnbtn:hover{background:#334155;color:#e2e8f0;}\n" +
".pgnbtn.active{background:#6366f1;border-color:#6366f1;color:#fff;}\n" +
"</style>\n" +
"</head>\n" +
"<body>\n" +
"<div class=\"wrap\" id=\"app\"></div>\n" +
"<script>\n" +
"(function(){\n" +
"  var app0=document.getElementById('app');\n" +
"  app0.innerHTML='<div class=\"card center\"><div class=\"spinner\"></div><div class=\"muted\">页面脚本已启动，等待数据…</div></div>';\n" +
"  if(!window.webview){\n" +
"    app0.innerHTML='<div class=\"card center\"><div style=\"font-size:16px;font-weight:600;\">webview 桥不可用</div><div class=\"muted\" style=\"margin-top:6px;\">window.webview 未注入，请更新 Seanime 版本</div></div>';\n" +
"    return;\n" +
"  }\n" +
"  var vm=null;\n" +
"  var gotFirst=false;\n" +
"  var lastSid=0;\n" +
"  var searchVal='',idVal='',panelOpen=false,activeTab='chars',pendingEp=null,pendingStatus=null,epsPage=1;\n" +
"  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}\n" +
"  function num(x){var n=Number(x);return isNaN(n)?0:n;}\n" +
"  window.webview.on('vm',function(v){\n" +
"    gotFirst=true;\n" +
"    pendingEp=null;\n" +
"    pendingStatus=null;\n" +
"    var sid=(v&&v.subjectId)||0;\n" +
"    if(sid!==lastSid){lastSid=sid;epsPage=1;}\n" +
"    var si=document.getElementById('bgm-q');if(si)searchVal=si.value;\n" +
"    var ii=document.getElementById('bgm-id');if(ii)idVal=ii.value;\n" +
"    var y=window.scrollY||0;\n" +
"    vm=v;render();\n" +
"    window.scrollTo(0,y);\n" +
"  });\n" +
"  setTimeout(function(){\n" +
"    if(!gotFirst){\n" +
"      var ap=document.getElementById('app');\n" +
"      ap.innerHTML='<div class=\"card center\"><div style=\"font-size:16px;font-weight:600;\">未接收到插件数据</div><div class=\"muted\" style=\"margin-top:6px;\">请先打开一个番剧条目页，再从侧栏进入本页</div></div>';\n" +
"    }\n" +
"  },3000);\n" +
"  function showZoom(src){\n" +
"    var zb=document.getElementById('bgm-zoombg');\n" +
"    if(!zb){\n" +
"      zb=document.createElement('div');zb.id='bgm-zoombg';zb.className='zoombg';\n" +
"      zb.addEventListener('click',function(){closeZoom();});\n" +
"      var zi=document.createElement('img');zi.className='bgm-zoomimg';\n" +
"      zi.addEventListener('click',function(e){e.stopPropagation();});\n" +
"      zb.appendChild(zi);\n" +
"      document.body.appendChild(zb);\n" +
"    }\n" +
"    zb.querySelector('img').src=src;\n" +
"    zb.style.display='flex';\n" +
"  }\n" +
"  function closeZoom(){\n" +
"    var zb=document.getElementById('bgm-zoombg');\n" +
"    if(zb)zb.style.display='none';\n" +
"  }\n" +
"  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeZoom();});\n" +
"  function chip(t,cls){return '<span class=\"chip '+cls+'\">'+esc(t)+'</span>';}\n" +
"  function scoreColor(s){return s>=8?'#f43f5e':s>=7?'#34d399':s>=6?'#fbbf24':'#94a3b8';}\n" +
"  function render(){\n" +
"    var app=document.getElementById('app');\n" +
"    if(!vm){app.innerHTML='';return;}\n" +
"    var h='';\n" +
"    h+=renderTopbar();\n" +
"    if(vm.status==='idle'){h+=renderIdle();}\n" +
"    else if(vm.status==='loading'){h+=renderLoading();}\n" +
"    else if(vm.status==='error'){h+=renderError();}\n" +
"    else if(vm.status==='not-found'){h+=renderNotFound();}\n" +
"    else if(vm.status==='ready'&&vm.subject){h+=renderReady();}\n" +
"    if(panelOpen||vm.status==='not-found'||vm.status==='error'||vm.status==='idle'){h+=renderPanel();}\n" +
"    app.innerHTML=h;\n" +
"    var si=document.getElementById('bgm-q');if(si)si.value=searchVal;\n" +
"    var ii=document.getElementById('bgm-id');if(ii)ii.value=idVal;\n" +
"  }\n" +
"  function renderTopbar(){\n" +
"    var h='<div class=\"topbar\"><div class=\"brand\"><span class=\"dot\"></span>Bangumi 番组计划';\n" +
"    if(vm.subjectId)h+=chip('ID '+vm.subjectId,'');\n" +
"    if(vm.endpoint)h+=chip(vm.endpoint.replace(/^https?:\\/\\//,''),'green');\n" +
"    if(vm.bound)h+=chip('已绑定','pink');\n" +
"    h+='</div><div class=\"btnrow\">';\n" +
"    h+='<button class=\"btn\" data-action=\"refresh\" title=\"Refresh\">刷新</button>';\n" +
"    if(vm.subjectId){\n" +
"      h+='<button class=\"btn\" data-action=\"copy-link\" data-payload=\"'+vm.subjectId+'\" title=\"Copy Link\">复制链接</button>';\n" +
"      h+='<button class=\"btn\" data-action=\"open-bgm\" data-payload=\"'+vm.subjectId+'\" title=\"Open in Bangumi\">在 Bangumi 打开</button>';\n" +
"    }\n" +
"    h+='<button class=\"btn\" data-action=\"toggle-panel\" title=\"Manual Match\">手动匹配</button>';\n" +
"    if(vm.subjectId)h+='<button class=\"btn danger\" data-action=\"clear-cache\" title=\"Clear Cache\">清除缓存</button>';\n" +
"    h+='</div></div>';\n" +
"    return h;\n" +
"  }\n" +
"  function renderIdle(){\n" +
"    return '<div class=\"card center\"><div style=\"font-size:40px;margin-bottom:10px;\">📺</div>'+\n" +
"      '<div style=\"font-size:16px;font-weight:600;\">尚未选择番剧</div>'+\n" +
"      '<div class=\"muted\" style=\"margin-top:6px;\">先打开一个番剧条目页，或直接在下方搜索条目</div></div>';\n" +
"  }\n" +
"  function renderLoading(){\n" +
"    return '<div class=\"card center\"><div class=\"spinner\"></div><div class=\"muted\">正在连接 Bangumi 匹配数据…</div></div>';\n" +
"  }\n" +
"  function renderError(){\n" +
"    return '<div class=\"card center\"><div style=\"font-size:34px;\">⚠️</div>'+\n" +
"      '<div style=\"font-size:16px;font-weight:600;margin:8px 0;\">加载失败</div>'+\n" +
"      '<div class=\"muted\">'+esc(vm.errorMsg||'未知错误')+'</div>'+\n" +
"      '<div class=\"warnbox\">如果 Bangumi 服务器在你的网络下无法访问，请在 Seanime 插件设置中为 <b>bangumi.apiEndpoints</b> 配置镜像或代理地址（英文逗号分隔多个地址），也可以在下方面板中直接输入 Bangumi ID 绑定。</div>'+\n" +
"      '<div style=\"margin-top:14px;\"><button class=\"btn primary\" data-action=\"refresh\">重试</button></div></div>';\n" +
"  }\n" +
"  function renderNotFound(){\n" +
"    var t=(vm.entry&&vm.entry.titles&&vm.entry.titles.length)?vm.entry.titles[0]:'';\n" +
"    return '<div class=\"card center\"><div style=\"font-size:34px;\">🔍</div>'+\n" +
"      '<div style=\"font-size:16px;font-weight:600;margin:8px 0;\">未找到匹配条目</div>'+\n" +
"      (t?'<div class=\"muted\">当前番剧：'+esc(t)+'</div>':'')+\n" +
"      '<div class=\"muted small\" style=\"margin-top:4px;\">请在下方手动搜索，或直接输入 Bangumi ID / 链接绑定</div></div>';\n" +
"  }\n" +
"  function renderReady(){\n" +
"    var s=vm.subject,e=vm.entry||{titles:[],cover:'',banner:'',score:0,year:0};\n" +
"    var h='<div class=\"fade\">';\n" +
"    h+=renderHero(s,e);\n" +
"    h+='<div class=\"card\"><div class=\"grid\">';\n" +
"    h+='<div>'+renderScoreBox(s,e)+renderStats(s)+renderCollection()+'</div>';\n" +
"    h+='<div>'+renderMeta(s)+renderTags(s)+renderSummary(s)+renderInfobox(s)+'</div>';\n" +
"    h+='</div></div>';\n" +
"    h+=renderTabs();\n" +
"    return h+'</div>';\n" +
"  }\n" +
"  function renderHero(s,e){\n" +
"    var cov=(s.images&&(s.images.large||s.images.common||s.images.medium))||e.cover||'';\n" +
"    var bg=e.banner||cov;\n" +
"    var h='<div class=\"hero\">';\n" +
"    if(bg)h+='<div class=\"hero-bg\" style=\"background-image:url(\\''+esc(bg)+'\\');\"></div>';\n" +
"    h+='<div class=\"hero-fade\"></div>';\n" +
"    h+='<div class=\"hero-in\">';\n" +
"    if(cov)h+='<img class=\"hero-cover\" src=\"'+esc(cov)+'\" data-action=\"zoom-img\" data-fullsrc=\"'+esc(cov)+'\" onerror=\"this.style.display=\\'none\\';\" referrerpolicy=\"no-referrer\">';\n" +
"    h+='<div class=\"hero-txt\">';\n" +
"    h+='<h1>'+esc(s.name_cn||s.name||'未知标题');\n" +
"    if(s.nsfw)h+=' <span class=\"chip nsfw\">NSFW</span>';\n" +
"    h+='</h1>';\n" +
"    if(s.name&&s.name!==(s.name_cn||''))h+='<div class=\"hero-jp\">'+esc(s.name)+'</div>';\n" +
"    if(e.titles&&e.titles.length&&e.titles[0]!==(s.name||''))h+='<div class=\"hero-al\">AniList: '+esc(e.titles[0])+'</div>';\n" +
"    h+=nextEpLine();\n" +
"    h+='</div></div></div>';\n" +
"    return h;\n" +
"  }\n" +
"  function nextEpLine(){\n" +
"    if(!vm.eps||!vm.eps.length)return '';\n" +
"    var d=new Date();\n" +
"    var p=function(n){return (n<10?'0':'')+n;};\n" +
"    var today=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());\n" +
"    var nx=null;\n" +
"    for(var i=0;i<vm.eps.length;i++){\n" +
"      var ad=vm.eps[i].air_date;\n" +
"      if(ad&&ad>=today&&(!nx||ad<(nx.air_date||'')))nx=vm.eps[i];\n" +
"    }\n" +
"    if(!nx)return '';\n" +
"    var nlabel=(nx.air_date===today?'今天播出':'下一话')+' 第'+(nx.sort!=null?nx.sort:'?')+'话';\n" +
"    if(nx.air_date!==today)nlabel+=' · '+nx.air_date;\n" +
"    return '<div class=\"nextep\">'+esc(nlabel)+'</div>';\n" +
"  }\n" +
"  function renderScoreBox(s,e){\n" +
"    var r=s.rating||{};\n" +
"    var sc=num(r.score);\n" +
"    var h='<div class=\"scorebox\">';\n" +
"    h+='<div class=\"scorerow\">';\n" +
"    if(sc>0){\n" +
"      h+='<div class=\"score-num\" style=\"color:'+scoreColor(sc)+'\">'+sc.toFixed(1)+'<span class=\"score-max\"> /10</span></div>';\n" +
"      h+='<div class=\"scoresub\">';\n" +
"      if(r.rank)h+='<div class=\"chip gold\">Rank #'+r.rank+'</div>';\n" +
"      if(r.total)h+='<div class=\"muted small\" style=\"margin-top:6px;\">'+r.total+' 人评分</div>';\n" +
"      h+='</div>';\n" +
"    }else{h+='<div class=\"muted\">暂无评分</div>';}\n" +
"    h+='</div>';\n" +
"    if(e.score){h+='<div class=\"muted small\" style=\"margin-top:8px;text-align:center;\">AniList '+(e.score/10).toFixed(1)+' /10</div>';}\n" +
"    h+=renderDist(r.count);\n" +
"    h+='</div>';\n" +
"    return h;\n" +
"  }\n" +
"  function renderDist(count){\n" +
"    if(!count)return '';\n" +
"    var max=0,i;\n" +
"    for(i=1;i<=10;i++){max=Math.max(max,num(count[String(i)]));}\n" +
"    if(!max)return '';\n" +
"    var h='<div style=\"margin-top:12px;text-align:left;\">';\n" +
"    for(i=10;i>=1;i--){\n" +
"      var c=num(count[String(i)]);\n" +
"      var w=Math.max(2,Math.round(c/max*100));\n" +
"      h+='<div class=\"dist-row\"><span class=\"n\">'+i+'</span><div style=\"flex:1;background:#1e293b;border-radius:4px;\"><div class=\"dist-bar\" style=\"width:'+w+'%;\"></div></div><span class=\"c\">'+c+'</span></div>';\n" +
"    }\n" +
"    return h+'</div>';\n" +
"  }\n" +
"  function renderStats(s){\n" +
"    var c=s.collection;\n" +
"    if(!c)return '';\n" +
"    var parts=[];\n" +
"    if(c.wish)parts.push('想看 '+c.wish);\n" +
"    if(c.doing)parts.push('在看 '+c.doing);\n" +
"    if(c.collect)parts.push('看过 '+c.collect);\n" +
"    if(c.on_hold)parts.push('搁置 '+c.on_hold);\n" +
"    if(c.dropped)parts.push('抛弃 '+c.dropped);\n" +
"    if(!parts.length)return '';\n" +
"    return '<div class=\"muted small\" style=\"margin-top:10px;text-align:center;\">'+esc(parts.join(' · '))+'</div>';\n" +
"  }\n" +
"  function renderCollection(){\n" +
"    var s=vm.subject||{};\n" +
"    var col=vm.collection;\n" +
"    if(!vm.hasToken)return '<div class=\"muted small\" style=\"margin-top:10px;text-align:center;\">配置 Token 可管理我的收藏与进度</div>';\n" +
"    if(vm.tokenInvalid)return '<div class=\"warnbox\" style=\"margin-top:10px;\">Access Token 无效或已过期。请到 bgm.tv → 设置 → 开发者 重新创建令牌，并在 Seanime 插件设置中更新，然后点上方「刷新」。</div>';\n" +
"    var map=[[1,'想看'],[2,'看过'],[3,'在看'],[4,'搁置'],[5,'抛弃']];\n" +
"    var cur=0;\n" +
"    if(col){\n" +
"      if(typeof col.type==='number')cur=col.type;\n" +
"      else if(col.type&&col.type.id)cur=col.type.id;\n" +
"      else if(col.status&&col.status.id)cur=col.status.id;\n" +
"    }\n" +
"    if(pendingStatus)cur=pendingStatus;\n" +
"    var h='<div class=\"collbox\">';\n" +
"    h+='<div class=\"colltitle\">我的收藏</div>';\n" +
"    h+='<div class=\"statusrow\">';\n" +
"    for(var i=0;i<map.length;i++){\n" +
"      var k=map[i][0];\n" +
"      h+='<button class=\"stbtn'+(cur===k?' active s'+k:'')+'\" data-action=\"set-status\" data-payload=\"'+k+'\">'+map[i][1]+'</button>';\n" +
"    }\n" +
"    h+='</div>';\n" +
"    if(cur){\n" +
"      var ep=(pendingEp!==null)?pendingEp:((col&&col.ep_status)||0);\n" +
"      var total=(s.eps||s.eps_count||s.total_episodes)||0;\n" +
"      h+='<div class=\"progrow\">';\n" +
"      h+='<button class=\"pbtn\" data-action=\"prog-dec\" title=\"Decrease Progress\">−</button>';\n" +
"      h+='<span class=\"progtxt\">看到第 '+ep+' 话'+(total?' / 共 '+total+' 话':'')+'</span>';\n" +
"      h+='<button class=\"pbtn\" data-action=\"prog-inc\" title=\"Increase Progress\">+</button>';\n" +
"      h+='</div>';\n" +
"    }\n" +
"    if(col&&col.rate)h+='<div style=\"margin-top:8px;text-align:center;\">'+chip('我的评分 '+col.rate,'gold')+'</div>';\n" +
"    h+='</div>';\n" +
"    return h;\n" +
"  }\n" +
"  function renderMeta(s){\n" +
"    var rows=[];\n" +
"    if(s.date)rows.push(['放送日期',s.date]);\n" +
"    if(s.air_weekday)rows.push(['放送星期',s.air_weekday]);\n" +
"    var eps=s.eps||s.eps_count||s.total_episodes;\n" +
"    if(eps)rows.push(['话数',String(eps)]);\n" +
"    if(s.platform)rows.push(['平台',s.platform]);\n" +
"    rows.push(['类型','动画']);\n" +
"    var h='<div class=\"meta\">';\n" +
"    for(var i=0;i<rows.length;i++){h+='<div><div class=\"k\">'+esc(rows[i][0])+'</div><div class=\"v\">'+esc(rows[i][1])+'</div></div>';}\n" +
"    return h+'</div>';\n" +
"  }\n" +
"  function renderTags(s){\n" +
"    if(!s.tags||!s.tags.length)return '';\n" +
"    var h='<div class=\"tagrow\">';\n" +
"    var n=0;\n" +
"    for(var i=0;i<s.tags.length&&n<12;i++){\n" +
"      var t=s.tags[i];\n" +
"      if(t.count!==undefined&&t.count<3)continue;\n" +
"      h+=chip(t.name+(t.count?' '+t.count:''),'');n++;\n" +
"    }\n" +
"    return h+'</div>';\n" +
"  }\n" +
"  function renderSummary(s){\n" +
"    if(!s.summary)return '';\n" +
"    return '<h3>简介</h3><div class=\"summary\">'+esc(s.summary)+'</div>';\n" +
"  }\n" +
"  function renderInfobox(s){\n" +
"    if(!s.infobox||!s.infobox.length)return '';\n" +
"    var h='<h3>制作信息</h3><table class=\"ibox\">';\n" +
"    var shown=0;\n" +
"    for(var i=0;i<s.infobox.length&&shown<14;i++){\n" +
"      var it=s.infobox[i];\n" +
"      var v=it.value;\n" +
"      if(v==null)continue;\n" +
"      if(Object.prototype.toString.call(v)==='[object Array]'){\n" +
"        var parts=[];\n" +
"        for(var j=0;j<v.length;j++){\n" +
"          var item=v[j];\n" +
"          if(item==null)continue;\n" +
"          if(typeof item==='object'){parts.push(item.k?(item.k+' '+item.v):String(item.v||''));}\n" +
"          else parts.push(String(item));\n" +
"        }\n" +
"        v=parts.join('、');\n" +
"      }else if(typeof v==='object'){v=JSON.stringify(v);}\n" +
"      v=String(v);\n" +
"      if(!v)continue;\n" +
"      h+='<tr><td>'+esc(it.key)+'</td><td>'+esc(v)+'</td></tr>';\n" +
"      shown++;\n" +
"    }\n" +
"    return shown?h+'</table>':'';\n" +
"  }\n" +
"  function renderTabs(){\n" +
"    var tabs=[['chars','角色'],['eps','章节'],['rels','关联条目']];\n" +
"    var h='<div class=\"tabs\">';\n" +
"    for(var i=0;i<tabs.length;i++){\n" +
"      h+='<button class=\"tab'+(activeTab===tabs[i][0]?' active':'')+'\" data-action=\"tab\" data-payload=\"'+tabs[i][0]+'\">'+tabs[i][1]+'</button>';\n" +
"    }\n" +
"    h+='</div>';\n" +
"    if(activeTab==='chars')h+=renderChars();\n" +
"    else if(activeTab==='eps')h+=renderEps();\n" +
"    else h+=renderRels();\n" +
"    return h;\n" +
"  }\n" +
"  function renderChars(){\n" +
"    if(!vm.chars||!vm.chars.length)return '<div class=\"muted center\" style=\"padding:30px;\">'+(vm.chars===null?'加载中…':'暂无角色数据')+'</div>';\n" +
"    var h='<div class=\"cgrid\">';\n" +
"    for(var i=0;i<vm.chars.length&&i<24;i++){\n" +
"      var c=vm.chars[i];\n" +
"      var img=(c.images&&(c.images.medium||c.images.small||c.images.grid))||'';\n" +
"      var full=(c.images&&c.images.large)||img;\n" +
"      h+='<div class=\"citem\">';\n" +
"      if(img)h+=\"<img class='cimg' src='\"+esc(img)+\"' data-action='zoom-img' data-fullsrc='\"+esc(full)+\"' onerror=\\\"this.style.display='none';\\\" referrerpolicy='no-referrer'>\";\n" +
"      h+='<div class=\"cname\">'+esc(c.name)+'</div>';\n" +
"      if(c.relation)h+='<div class=\"crel\">'+esc(c.relation)+'</div>';\n" +
"      if(c.actors&&c.actors.length){\n" +
"        var an=[];\n" +
"        for(var a=0;a<c.actors.length&&a<2;a++){if(c.actors[a]&&c.actors[a].name)an.push(c.actors[a].name);}\n" +
"        if(an.length)h+='<div class=\"ccv\">CV: '+esc(an.join(' / '))+'</div>';\n" +
"      }\n" +
"      h+='</div>';\n" +
"    }\n" +
"    return h+'</div>';\n" +
"  }\n" +
"  function renderEps(){\n" +
"    if(!vm.eps||!vm.eps.length)return '<div class=\"muted center\" style=\"padding:30px;\">'+(vm.eps===null?'加载中…':'暂无章节数据')+'</div>';\n" +
"    var total=Math.ceil(vm.eps.length/100);\n" +
"    if(epsPage<1)epsPage=1;\n" +
"    if(epsPage>total)epsPage=total;\n" +
"    var start=(epsPage-1)*100;\n" +
"    var slice=vm.eps.slice(start,start+100);\n" +
"    var h='<table class=\"eptable\">';\n" +
"    for(var i=0;i<slice.length;i++){\n" +
"      var ep=slice[i];\n" +
"      var nm=ep.name_cn||ep.name||'';\n" +
"      var sub=(ep.name_cn&&ep.name&&ep.name!==ep.name_cn)?ep.name:'';\n" +
"      h+='<tr><td class=\"epnum\">'+(ep.sort!=null?ep.sort:(start+i+1))+'</td><td>'+esc(nm);\n" +
"      if(sub)h+='<div class=\"muted small\">'+esc(sub)+'</div>';\n" +
"      h+='</td><td class=\"epdate\">'+esc(ep.air_date||'')+'</td></tr>';\n" +
"    }\n" +
"    h+='</table>';\n" +
"    if(total>1){\n" +
"      h+='<div class=\"pgnrow\">';\n" +
"      for(var p=1;p<=total;p++){\n" +
"        h+='<button class=\"pgnbtn'+(p===epsPage?' active':'')+'\" data-action=\"eps-page\" data-payload=\"'+p+'\">'+p+'</button>';\n" +
"      }\n" +
"      h+='</div>';\n" +
"    }\n" +
"    return h;\n" +
"  }\n" +
"  function renderRels(){\n" +
"    if(!vm.rels||!vm.rels.length)return '<div class=\"muted center\" style=\"padding:30px;\">'+(vm.rels===null?'加载中…':'暂无关联条目')+'</div>';\n" +
"    var h='<div class=\"relgrid\">';\n" +
"    for(var i=0;i<vm.rels.length&&i<24;i++){\n" +
"      var r=vm.rels[i];\n" +
"      var img=(r.images&&(r.images.small||r.images.grid))||'';\n" +
"      h+='<div class=\"relitem\">';\n" +
"      if(r.relation)h+='<div class=\"reltype\">'+esc(r.relation)+'</div>';\n" +
"      h+='<div style=\"display:flex;gap:8px;margin-top:4px;\">';\n" +
"      if(img)h+=\"<img src='\"+esc(img)+\"' style='width:34px;height:46px;object-fit:cover;border-radius:4px;background:#1e293b;flex-shrink:0;' onerror=\\\"this.style.display='none';\\\" referrerpolicy='no-referrer'>\";\n" +
"      h+='<div class=\"relname\">'+esc(r.name_cn||r.name);\n" +
"      if(r.name_cn&&r.name&&r.name!==r.name_cn)h+='<div class=\"muted small\">'+esc(r.name)+'</div>';\n" +
"      h+='</div></div>';\n" +
"      h+='<div class=\"relbtns\"><button class=\"btn small\" data-action=\"bind-pick\" data-payload=\"'+r.id+'\" title=\"Bind This Entry\">绑定此项</button>';\n" +
"      h+='<button class=\"btn small ghost\" data-action=\"open-bgm\" data-payload=\"'+r.id+'\" title=\"Open in Bangumi\">打开</button></div>';\n" +
"      h+='</div>';\n" +
"    }\n" +
"    return h+'</div>';\n" +
"  }\n" +
"  function renderPanel(){\n" +
"    var h='<div class=\"panel\"><div style=\"font-weight:700;margin-bottom:6px;\">手动匹配</div>';\n" +
"    h+='<div class=\"muted small\">搜索 Bangumi 条目，或直接粘贴 Bangumi 链接 / ID 进行绑定</div>';\n" +
"    h+='<div class=\"srow\"><input class=\"input\" id=\"bgm-q\" placeholder=\"日文 / 中文 / 英文标题…\"><button class=\"btn primary\" data-action=\"do-search\">搜索</button></div>';\n" +
"    h+='<div class=\"srow\"><input class=\"input\" id=\"bgm-id\" placeholder=\"Bangumi ID 或链接，如 8 或 https://bgm.tv/subject/8\"><button class=\"btn\" data-action=\"bind-id-btn\">直接绑定</button></div>';\n" +
"    if(vm.searching){h+='<div class=\"muted\" style=\"margin-top:10px;\"><div class=\"spinner\" style=\"width:20px;height:20px;border-width:2px;\"></div></div>';}\n" +
"    else if(vm.searchResults&&vm.searchResults.length){\n" +
"      h+='<div style=\"margin-top:8px;\">';\n" +
"      for(var i=0;i<vm.searchResults.length;i++){\n" +
"        var r=vm.searchResults[i];\n" +
"        var lbl=(r.name_cn||r.name||'未知');\n" +
"        if(r.date)lbl+=' · '+String(r.date).substring(0,4);\n" +
"        if(r.rating&&r.rating.score){var rs=num(r.rating.score);if(rs>0)lbl+=' · '+rs.toFixed(1)+'分';}\n" +
"        var simg=(r.images&&(r.images.grid||r.images.small))||'';\n" +
"        h+='<div class=\"sresult\">';\n" +
"        if(simg)h+=\"<img class='sthumb' src='\"+esc(simg)+\"' onerror=\\\"this.style.display='none';\\\" referrerpolicy='no-referrer'>\";\n" +
"        h+='<span class=\"sinfo\">'+esc(lbl)+(r.name_cn&&r.name&&r.name!==r.name_cn?'<div class=\"muted small\">'+esc(r.name)+'</div>':'')+'</span>';\n" +
"        h+='<button class=\"btn primary\" data-action=\"bind-pick\" data-payload=\"'+r.id+'\">绑定</button></div>';\n" +
"      }\n" +
"      h+='</div>';\n" +
"    }\n" +
"    return h+'</div>';\n" +
"  }\n" +
"  document.addEventListener('click',function(ev){\n" +
"    var t=ev.target;\n" +
"    while(t&&t!==document){\n" +
"      if(t.getAttribute&&t.getAttribute('data-action')){\n" +
"        var a=t.getAttribute('data-action');\n" +
"        var p=t.getAttribute('data-payload')||'';\n" +
"        if(a==='do-search'){var q=document.getElementById('bgm-q');window.webview.send('search',q?q.value:'');}\n" +
"        else if(a==='bind-id-btn'){var b=document.getElementById('bgm-id');window.webview.send('bind-id',b?b.value:'');}\n" +
"        else if(a==='toggle-panel'){panelOpen=!panelOpen;render();}\n" +
"        else if(a==='tab'){activeTab=p;render();}\n" +
"        else if(a==='copy-link'){\n" +
"          var url='https://bgm.tv/subject/'+p;\n" +
"          var ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();\n" +
"          try{document.execCommand('copy');}catch(e){}\n" +
"          document.body.removeChild(ta);\n" +
"          t.textContent='已复制';setTimeout(function(){t.textContent='复制链接';},1200);\n" +
"        }\n" +
"        else if(a==='zoom-img'){\n" +
"          var fs=t.getAttribute('data-fullsrc')||t.src;if(fs)showZoom(fs);\n" +
"        }\n" +
"        else if(a==='set-status'){\n" +
"          pendingStatus=parseInt(p,10)||null;\n" +
"          pendingEp=null;\n" +
"          render();\n" +
"          window.webview.send('set-status',p);\n" +
"        }\n" +
"        else if(a==='eps-page'){\n" +
"          epsPage=parseInt(p,10)||1;\n" +
"          render();\n" +
"        }\n" +
"        else if(a==='prog-inc'||a==='prog-dec'){\n" +
"          var col0=vm&&vm.collection;\n" +
"          var base=(pendingEp!==null)?pendingEp:((col0&&col0.ep_status)||0);\n" +
"          var nv=base+(a==='prog-inc'?1:-1);\n" +
"          if(nv<0)nv=0;\n" +
"          pendingEp=nv;\n" +
"          render();\n" +
"          window.webview.send('set-progress',String(nv));\n" +
"        }\n" +
"        else{window.webview.send(a,p);}\n" +
"        ev.preventDefault();\n" +
"        return;\n" +
"      }\n" +
"      t=t.parentNode;\n" +
"    }\n" +
"  });\n" +
"  document.addEventListener('keydown',function(ev){\n" +
"    if(ev.target&&ev.target.id==='bgm-q'&&ev.key==='Enter'){window.webview.send('search',ev.target.value);}\n" +
"    if(ev.target&&ev.target.id==='bgm-id'&&ev.key==='Enter'){window.webview.send('bind-id',ev.target.value);}\n" +
"  });\n" +
"})();\n" +
"</script>\n" +
"</body>\n" +
"</html>"
        }
    })

    // =====================================================================
    //  Hooks — inject Chinese synonyms into collection
    // =====================================================================
    const CNS_HOOK = "bangumi.data."
    const TTL_HOOK = 86400000 * 3

    function injectSynonyms(e: HookEvent): void {
        try {
            const lists = e.animeCollection
                && e.animeCollection.mediaListCollection
                && e.animeCollection.mediaListCollection.lists
            if (!lists) {
                e.next()
                return
            }
            for (let i = 0; i < lists.length; i++) {
                const ents = lists[i].entries || []
                if (!ents.length) continue
                for (let j = 0; j < ents.length; j++) {
                    const m = ents[j].media
                    if (!m) continue
                    try {
                        const raw = $storage.get(CNS_HOOK + m.id)
                        if (!raw) continue
                        const d = JSON.parse(String(raw)) as any
                        if (!d._ts || Date.now() - d._ts >= TTL_HOOK) continue
                        if (!d.name_cn) continue
                        if (!m.synonyms) m.synonyms = []
                        if (m.synonyms.indexOf(d.name_cn) === -1) {
                            m.synonyms.push(d.name_cn)
                        }
                    } catch (_) { /* skip malformed entry */ }
                }
            }
        } catch (_) { /* ignore top-level errors */ }
        e.next()
    }
    $app.onGetAnimeCollection(injectSynonyms)
    $app.onGetRawAnimeCollection(injectSynonyms)
}
