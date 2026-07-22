"use strict";
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
function init() {
    $ui.register(function (ctx) {
        console.log("[bangumi-ui] 插件已加载 v3.0.0");
        // =================================================================
        //  Constants
        // =================================================================
        var CNS = "bangumi.data.";
        var XNS = "bangumi.extra.";
        var MNS = "bangumi.match.";
        var TTL = 86400000 * 3;
        var DEFAULT_ENDPOINTS = "https://api.bgm.tv";
        var emptyVM = {
            status: "idle", errorMsg: "", mediaId: 0, subjectId: 0,
            endpoint: "", bound: false, entry: null, subject: null,
            chars: null, rels: null, eps: null, collection: null,
            searchResults: [], searching: false, hasToken: false
        };
        var mediaIdState = ctx.state(0);
        var vm = ctx.state(emptyVM);
        function patchVm(patch) {
            var cur = vm.get();
            var next = {};
            for (var k in cur) {
                if (Object.prototype.hasOwnProperty.call(cur, k))
                    next[k] = cur[k];
            }
            for (var k in patch) {
                if (Object.prototype.hasOwnProperty.call(patch, k))
                    next[k] = patch[k];
            }
            vm.set(next);
        }
        // =================================================================
        //  Settings — 读取 manifest userConfig（Extensions 页面可视化编辑）
        // =================================================================
        function pref(name, fallback) {
            try {
                var v = $getUserPreference(name);
                if (v === undefined || v === null || v === "")
                    return fallback;
                return String(v);
            }
            catch (_) {
                return fallback;
            }
        }
        function prefBool(name, fallback) {
            return pref(name, fallback ? "true" : "false") === "true";
        }
        // =================================================================
        //  Network layer — endpoint failover
        // =================================================================
        var lastGoodEndpoint = "";
        function endpoints() {
            var raw = pref("apiEndpoints", DEFAULT_ENDPOINTS) || DEFAULT_ENDPOINTS;
            var parts = raw.split(",");
            var out = [];
            for (var i = 0; i < parts.length; i++) {
                var e = parts[i].replace(/\s+/g, "");
                if (!e)
                    continue;
                if (e.charAt(e.length - 1) === "/")
                    e = e.substring(0, e.length - 1);
                if (out.indexOf(e) === -1)
                    out.push(e);
            }
            if (!out.length)
                out.push(DEFAULT_ENDPOINTS);
            // Sticky: try last known-good endpoint first
            if (lastGoodEndpoint && out.indexOf(lastGoodEndpoint) > 0) {
                out.splice(out.indexOf(lastGoodEndpoint), 1);
                out.unshift(lastGoodEndpoint);
            }
            return out;
        }
        function hdrs() {
            var h = {
                "User-Agent": "Seanime-Bangumi/3.0",
                "Accept": "application/json"
            };
            var t = pref("accessToken", "");
            if (t)
                h["Authorization"] = "Bearer " + t;
            return h;
        }
        function hdrsNoAuth() {
            return { "User-Agent": "Seanime-Bangumi/3.0", "Accept": "application/json" };
        }
        // GET with failover across endpoints; resolves with the raw response
        function apiGet(path) {
            var eps = endpoints();
            return tryGet(eps, 0, path);
        }
        function tryGet(eps, i, path) {
            if (i >= eps.length)
                return Promise.reject(new Error("所有 Bangumi 端点均无法连接"));
            var url = eps[i] + path;
            return ctx.fetch(url, { headers: hdrs() }).then(function (r) {
                // Token 无效时去掉 Authorization 重试一次
                if (r && r.status === 401 && pref("accessToken", "")) {
                    console.log("[bangumi-ui] 401 (token 无效), 去掉 token 重试");
                    return ctx.fetch(url, { headers: hdrsNoAuth() }).then(function (r2) {
                        if (r2 && r2.status && (r2.status >= 500 || r2.status === 429)) {
                            return tryGet(eps, i + 1, path);
                        }
                        lastGoodEndpoint = eps[i];
                        return r2;
                    }, function () { return tryGet(eps, i + 1, path); });
                }
                if (r && r.status && (r.status >= 500 || r.status === 429)) {
                    return tryGet(eps, i + 1, path);
                }
                lastGoodEndpoint = eps[i];
                return r;
            }, function () { return tryGet(eps, i + 1, path); });
        }
        // POST search with failover
        function apiSearch(kw, limit) {
            var eps = endpoints();
            var body = JSON.stringify({
                keyword: kw, sort: "match",
                filter: { type: [2] },
                limit: limit || 10
            });
            return trySearch(eps, 0, body);
        }
        function trySearch(eps, i, body) {
            if (i >= eps.length)
                return Promise.reject(new Error("所有 Bangumi 端点均无法连接"));
            var url = eps[i] + "/v0/search/subjects";
            var h = hdrs();
            h["Content-Type"] = "application/json";
            return ctx.fetch(url, { method: "POST", headers: h, body: body }).then(function (r) {
                // Token 无效时去掉 Authorization 重试一次
                if (r && r.status === 401 && pref("accessToken", "")) {
                    var h2 = hdrsNoAuth();
                    h2["Content-Type"] = "application/json";
                    return ctx.fetch(url, { method: "POST", headers: h2, body: body }).then(function (r2) {
                        if (r2 && r2.status && (r2.status >= 500 || r2.status === 429)) {
                            return trySearch(eps, i + 1, body);
                        }
                        lastGoodEndpoint = eps[i];
                        var d2 = r2 ? r2.json() : null;
                        return d2 || { data: [] };
                    }, function () { return trySearch(eps, i + 1, body); });
                }
                if (r && r.status && (r.status >= 500 || r.status === 429)) {
                    return trySearch(eps, i + 1, body);
                }
                lastGoodEndpoint = eps[i];
                var d = r ? r.json() : null;
                return d || { data: [] };
            }, function () { return trySearch(eps, i + 1, body); });
        }
        // =================================================================
        //  Storage cache
        // =================================================================
        function cGet(mid) {
            try {
                var raw = $storage.get(CNS + mid);
                if (!raw)
                    return null;
                var d = JSON.parse(String(raw));
                return (d._ts && Date.now() - d._ts < TTL) ? d : null;
            }
            catch (_) {
                return null;
            }
        }
        function cSet(mid, d) {
            try {
                d._ts = Date.now();
                $storage.set(CNS + mid, JSON.stringify(d));
            }
            catch (_) { /* ignore */ }
        }
        function cDel(mid) {
            try {
                $storage.remove(CNS + mid);
            }
            catch (_) { /* ignore */ }
        }
        function xGet(sid) {
            try {
                var raw = $storage.get(XNS + sid);
                if (!raw)
                    return null;
                var d = JSON.parse(String(raw));
                return (d._ts && Date.now() - d._ts < TTL) ? d : null;
            }
            catch (_) {
                return null;
            }
        }
        function xSet(sid, d) {
            try {
                d._ts = Date.now();
                $storage.set(XNS + sid, JSON.stringify(d));
            }
            catch (_) { /* ignore */ }
        }
        function mGet(mid) {
            var v = $storage.get(MNS + mid);
            return v ? String(v) : null;
        }
        function mSet(mid, sid) {
            try {
                $storage.set(MNS + mid, String(sid));
            }
            catch (_) { /* ignore */ }
        }
        function mDel(mid) {
            try {
                $storage.remove(MNS + mid);
            }
            catch (_) { /* ignore */ }
        }
        // =================================================================
        //  Title matching helpers
        // =================================================================
        function cleanTitle(t) {
            if (!t)
                return "";
            return t.replace(/: .*$/, "")
                .replace(/ Season \d+/i, "")
                .replace(/ \d+(st|nd|rd|th) Season/i, "")
                .replace(/ Part \d+/i, "")
                .replace(/ \([^)]*\)$/, "")
                .replace(/\（[^）]*\）$/, "")
                .trim();
        }
        function similarity(a, b) {
            if (!a || !b)
                return 0;
            a = a.toLowerCase();
            b = b.toLowerCase();
            if (a === b)
                return 1;
            if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1)
                return 0.85;
            var sa = {};
            var sb = {};
            var m = 0;
            for (var i = 0; i < a.length; i++) {
                sa[a[i]] = (sa[a[i]] || 0) + 1;
            }
            for (var j = 0; j < b.length; j++) {
                sb[b[j]] = (sb[b[j]] || 0) + 1;
            }
            for (var k in sa) {
                if (Object.prototype.hasOwnProperty.call(sa, k) && sb[k]) {
                    m += Math.min(sa[k], sb[k]);
                }
            }
            return (2 * m) / (a.length + b.length);
        }
        function wordScore(query, target) {
            var words = query.toLowerCase().split(/[\s\-–—:·]+/);
            var t = target.toLowerCase();
            var matched = 0;
            var total = 0;
            for (var k = 0; k < words.length; k++) {
                var w = words[k];
                if (w.length < 1)
                    continue;
                total++;
                if (t.indexOf(w) !== -1)
                    matched++;
            }
            return total > 0 ? (matched / total) * 0.9 : 0;
        }
        function mScore(result, titles, year) {
            var best = 0;
            var names = [];
            if (result.name_cn)
                names.push(result.name_cn);
            if (result.name)
                names.push(result.name);
            for (var i = 0; i < titles.length; i++) {
                for (var j = 0; j < names.length; j++) {
                    var cs = similarity(titles[i], names[j]);
                    var ws = wordScore(titles[i], names[j]);
                    best = Math.max(best, cs, ws);
                }
            }
            // Year match bonus
            if (year && result.date && String(result.date).substring(0, 4) === String(year)) {
                best += 0.2;
            }
            // Small bonus for having both Chinese and Japanese names
            if (result.name_cn && result.name && result.name_cn !== result.name) {
                best += 0.05;
            }
            return Math.min(best, 1);
        }
        // =================================================================
        //  Matching engine (with race guard)
        // =================================================================
        var reqSeq = 0;
        function loadForEntry(id, force) {
            var seq = ++reqSeq;
            var stale = function () { return seq !== reqSeq; };
            patchVm({
                status: "loading", errorMsg: "", mediaId: id, subjectId: 0,
                bound: false, subject: null, chars: null, rels: null, eps: null,
                collection: null, searchResults: [], searching: false,
                hasToken: !!pref("accessToken", "")
            });
            if (force)
                cDel(id);
            // Entry meta (title candidates, cover, score, year) — non-blocking
            getEntryMeta(id).then(function (meta) {
                if (stale())
                    return;
                patchVm({ entry: meta });
                // 1. Manual / auto-persisted binding
                var boundId = mGet(id);
                if (boundId) {
                    var sid = parseInt(boundId, 10);
                    if (sid) {
                        fetchSubject(id, sid, seq, true);
                        return;
                    }
                }
                // 2. Subject cache
                var cached = cGet(id);
                if (cached) {
                    if (stale())
                        return;
                    patchVm({
                        status: "ready", subject: cached,
                        subjectId: cached.id, endpoint: lastGoodEndpoint
                    });
                    loadExtras(cached.id, seq);
                    loadCollection(cached.id, seq);
                    return;
                }
                // 3. Auto search
                if (!prefBool("autoMatch", true)) {
                    patchVm({ status: "not-found", errorMsg: "自动匹配已关闭，请手动搜索" });
                    return;
                }
                autoSearch(id, meta, seq);
            });
        }
        function getEntryMeta(id) {
            var fallback = { titles: [], cover: "", score: 0, year: 0 };
            var p;
            try {
                var r = ctx.anime.getAnimeEntry(id);
                p = (r && typeof r.then === "function")
                    ? r
                    : Promise.resolve(r);
            }
            catch (_) {
                return Promise.resolve(fallback);
            }
            return p.then(function (en) {
                if (!en || !en.media)
                    return fallback;
                var ti = en.media.title || {};
                var year = 0;
                if (en.media.startDate && en.media.startDate.year)
                    year = en.media.startDate.year;
                else if (en.media.seasonYear)
                    year = en.media.seasonYear;
                var ci = en.media.coverImage || {};
                var raw = [];
                if (ti.userPreferred)
                    raw.push(ti.userPreferred);
                if (ti.romaji && raw.indexOf(ti.romaji) === -1)
                    raw.push(ti.romaji);
                if (ti.english && raw.indexOf(ti.english) === -1)
                    raw.push(ti.english);
                if (ti.native && raw.indexOf(ti.native) === -1)
                    raw.push(ti.native);
                return {
                    titles: raw,
                    cover: ci.extraLarge || ci.large || ci.medium || "",
                    score: en.media.averageScore || 0,
                    year: year
                };
            }, function () { return fallback; });
        }
        function titleCandidates(meta) {
            if (!meta || !meta.titles || !meta.titles.length)
                return [];
            var seen = {};
            var out = [];
            var add = function (t) {
                if (!t || seen[t])
                    return;
                seen[t] = true;
                out.push(t);
            };
            for (var i = 0; i < meta.titles.length; i++) {
                var t = meta.titles[i];
                add(t);
                var c = cleanTitle(t);
                if (c !== t)
                    add(c);
                // Also try just the main title before a colon
                var ci = t.indexOf(": ");
                if (ci > 2)
                    add(t.slice(0, ci).trim());
            }
            console.log("[bangumi-ui] titleCandidates: " + out.join(" | "));
            return out;
        }
        function autoSearch(id, meta, seq) {
            var stale = function () { return seq !== reqSeq; };
            var cands = titleCandidates(meta);
            if (!cands.length) {
                patchVm({ status: "error", errorMsg: "未能识别番剧标题，请手动搜索" });
                return;
            }
            var year = meta.year || 0;
            var globalBest = null;
            var globalScore = 0;
            function tryCandidate(idx) {
                if (stale())
                    return;
                if (idx >= cands.length) {
                    if (globalBest && globalScore >= 0.25) {
                        if (globalScore >= 0.92)
                            mSet(id, globalBest.id);
                        fetchSubject(id, globalBest.id, seq, globalScore >= 0.92);
                        return;
                    }
                    patchVm({ status: "not-found", errorMsg: "未找到 Bangumi 条目，请手动搜索" });
                    return;
                }
                console.log("[bangumi-ui] searching: " + cands[idx]);
                apiSearch(cands[idx], 10).then(function (d) {
                    if (stale())
                        return;
                    if (!d || !d.data || !d.data.length) {
                        tryCandidate(idx + 1);
                        return;
                    }
                    for (var i = 0; i < d.data.length; i++) {
                        var sc = mScore(d.data[i], cands, year);
                        if (sc > globalScore) {
                            globalScore = sc;
                            globalBest = d.data[i];
                        }
                    }
                    if (globalScore >= 0.82) {
                        // High confidence — stop searching
                        if (globalScore >= 0.92)
                            mSet(id, globalBest.id);
                        fetchSubject(id, globalBest.id, seq, globalScore >= 0.92);
                        return;
                    }
                    // Keep trying more candidates to find the best match
                    tryCandidate(idx + 1);
                }, function () {
                    if (stale())
                        return;
                    tryCandidate(idx + 1);
                });
            }
            tryCandidate(0);
        }
        function fetchSubject(mediaId, sid, seq, bound) {
            var stale = function () { return seq !== reqSeq; };
            // Cached subject for this mediaId?
            var cached = cGet(mediaId);
            if (cached && cached.id === sid) {
                if (stale())
                    return;
                patchVm({
                    status: "ready", subject: cached, subjectId: sid,
                    bound: bound, endpoint: lastGoodEndpoint
                });
                loadExtras(sid, seq);
                loadCollection(sid, seq);
                return;
            }
            apiGet("/v0/subjects/" + sid).then(function (r) {
                if (stale())
                    return;
                if (!r) {
                    patchVm({ status: "error", errorMsg: "获取条目详情失败：响应为空" });
                    return;
                }
                var d = r ? r.json() : null;
                if (!d || !d.id) {
                    patchVm({ status: "error", errorMsg: "获取条目详情失败" });
                    return;
                }
                cSet(mediaId, d);
                patchVm({
                    status: "ready", subject: d, subjectId: d.id,
                    bound: bound, endpoint: lastGoodEndpoint
                });
                loadExtras(d.id, seq);
                loadCollection(d.id, seq);
            }, function () {
                if (stale())
                    return;
                patchVm({ status: "error", errorMsg: "无法连接 Bangumi（可在插件设置中配置镜像端点）" });
            });
        }
        // ---- Extras: characters / episodes / relations (fault-tolerant) ----
        function loadExtras(sid, seq) {
            var stale = function () { return seq !== reqSeq; };
            var cachedX = xGet(sid);
            if (cachedX) {
                patchVm({
                    chars: cachedX.chars || null,
                    eps: cachedX.eps || null,
                    rels: cachedX.rels || null
                });
                return;
            }
            var wantChars = prefBool("loadCharacters", true);
            var wantEps = prefBool("loadEpisodes", true);
            var wantRels = prefBool("loadRelations", true);
            var pChars = wantChars
                ? apiGet("/v0/subjects/" + sid + "/characters").then(function (r) { return r ? r.json() : null; }, function () { return null; })
                : Promise.resolve(null);
            var pEps = wantEps
                ? apiGet("/v0/episodes?subject_id=" + sid + "&type=0&limit=100&offset=0").then(function (r) { return r ? r.json() : null; }, function () { return null; })
                : Promise.resolve(null);
            var pRels = wantRels
                ? apiGet("/v0/subjects/" + sid + "/subjects").then(function (r) { return r ? r.json() : null; }, function () { return null; })
                : Promise.resolve(null);
            Promise.all([pChars, pEps, pRels]).then(function (arr) {
                if (stale())
                    return;
                var chars = arr[0] && arr[0].length ? arr[0] : null;
                var epsData = arr[1] && arr[1].data && arr[1].data.length ? arr[1].data : null;
                var rels = arr[2] && arr[2].length ? arr[2] : null;
                xSet(sid, { chars: chars, eps: epsData, rels: rels });
                patchVm({ chars: chars, eps: epsData, rels: rels });
            });
        }
        // ---- Personal collection status (requires access token) ----
        function loadCollection(sid, seq) {
            var token = pref("accessToken", "");
            if (!token)
                return;
            var stale = function () { return seq !== reqSeq; };
            var cachedUser = $storage.get("bangumi.me");
            var pUser = cachedUser
                ? Promise.resolve(JSON.parse(String(cachedUser)))
                : apiGet("/v0/me").then(function (r) {
                    var me = r ? r.json() : null;
                    if (me && me.username) {
                        try {
                            $storage.set("bangumi.me", JSON.stringify(me));
                        }
                        catch (_) { /* ignore */ }
                    }
                    return me;
                }, function () { return null; });
            pUser.then(function (me) {
                if (stale() || !me || !me.username)
                    return;
                apiGet("/v0/users/" + encodeURIComponent(me.username) + "/collections/" + sid).then(function (r) {
                    if (stale())
                        return;
                    if (!r || (r.status && r.status === 404))
                        return;
                    var col = r ? r.json() : null;
                    if (col)
                        patchVm({ collection: col });
                }, function () { });
            });
        }
        // ---- Manual search / bind ----
        function doManualSearch(q) {
            q = (q || "").replace(/^\s+|\s+$/g, "");
            if (!q) {
                ctx.toast.error("请输入关键词");
                return;
            }
            patchVm({ searching: true, searchResults: [] });
            apiSearch(q, 12).then(function (d) {
                patchVm({
                    searching: false,
                    searchResults: (d && d.data) ? d.data.slice(0, 12) : []
                });
            }, function () {
                patchVm({ searching: false, searchResults: [] });
                ctx.toast.error("搜索失败：Bangumi 端点均无法连接");
            });
        }
        function bindSubject(input) {
            var id = vm.get().mediaId;
            if (!id) {
                ctx.toast.error("请先打开一个番剧条目页");
                return;
            }
            var sid = 0;
            var urlMatch = String(input).match(/subject\/(\d+)/);
            if (urlMatch)
                sid = parseInt(urlMatch[1], 10);
            else if (/^\d+$/.test(String(input).replace(/\s+/g, ""))) {
                sid = parseInt(String(input).replace(/\s+/g, ""), 10);
            }
            if (!sid) {
                ctx.toast.error("无法识别 Bangumi ID 或链接");
                return;
            }
            mSet(id, sid);
            cDel(id);
            ctx.toast.success("已绑定 Bangumi ID: " + sid);
            loadForEntry(id, false);
        }
        function pickSearchResult(sidStr) {
            var sid = parseInt(sidStr, 10);
            var id = vm.get().mediaId;
            if (!sid || !id)
                return;
            mSet(id, sid);
            cDel(id);
            loadForEntry(id, false);
        }
        // =================================================================
        //  Navigation tracking
        // =================================================================
        ctx.screen.onNavigate(function (e) {
            var newMid = 0;
            if (e && e.pathname === "/entry" && e.searchParams && e.searchParams.id) {
                newMid = parseInt(e.searchParams.id, 10) || 0;
            }
            if (newMid > 0) {
                mediaIdState.set(newMid);
            }
            else if (e && e.pathname !== "/entry" && e.pathname.indexOf("/webview") !== 0) {
                // Keep mediaId when jumping INTO the webview page
                mediaIdState.set(0);
            }
        });
        ctx.screen.loadCurrent();
        // Load data when mediaId changes
        ctx.effect(function () {
            var id = mediaIdState.get();
            if (!id) {
                reqSeq++;
                patchVm({ status: "idle", errorMsg: "", mediaId: 0, subject: null, searchResults: [] });
                return;
            }
            loadForEntry(id, false);
        }, [mediaIdState]);
        // =================================================================
        //  Webview screen page（通过左侧边栏 Bangumi 入口访问）
        // =================================================================
        var wv = ctx.newWebview({
            slot: "screen",
            fullWidth: true,
            autoHeight: true,
            sidebar: {
                label: "Bangumi",
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="m17 2-5 5-5-5"/></svg>'
            }
        });
        wv.channel.sync("vm", vm);
        wv.onLoad(function () {
            patchVm({});
        });
        wv.channel.on("refresh", function () {
            var id = vm.get().mediaId;
            if (!id) {
                ctx.toast.info("请先打开一个番剧条目页");
                return;
            }
            loadForEntry(id, true);
        });
        wv.channel.on("search", function (q) {
            doManualSearch(String(q || ""));
        });
        wv.channel.on("bind-id", function (v) {
            bindSubject(String(v || ""));
        });
        wv.channel.on("bind-pick", function (v) {
            pickSearchResult(String(v || ""));
        });
        wv.channel.on("clear-cache", function () {
            var id = vm.get().mediaId;
            if (!id)
                return;
            cDel(id);
            mDel(id);
            ctx.toast.success("已清除该条目的缓存与绑定");
            loadForEntry(id, false);
        });
        wv.channel.on("open-bgm", function (v) {
            var sid = parseInt(String(v || ""), 10) || vm.get().subjectId;
            if (!sid)
                return;
            try {
                $app.openURL("https://bgm.tv/subject/" + sid);
            }
            catch (_) {
                ctx.toast.info("https://bgm.tv/subject/" + sid);
            }
        });
        wv.setContent(buildHTML);
        // =================================================================
        //  Webview HTML
        // =================================================================
        function buildHTML() {
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
                ".topbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:20px;}\n" +
                ".brand{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;}\n" +
                ".brand .dot{width:10px;height:10px;border-radius:50%;background:#f09199;}\n" +
                ".chips{display:flex;gap:8px;flex-wrap:wrap;}\n" +
                ".chip{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:999px;font-size:12px;background:#1e293b;color:#94a3b8;border:1px solid #334155;}\n" +
                ".chip.pink{background:rgba(240,145,153,.12);color:#f09199;border-color:rgba(240,145,153,.35);}\n" +
                ".chip.green{background:rgba(16,185,129,.12);color:#34d399;border-color:rgba(16,185,129,.35);}\n" +
                ".chip.gold{background:rgba(245,158,11,.12);color:#fbbf24;border-color:rgba(245,158,11,.35);}\n" +
                ".btn{padding:7px 14px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:13px;cursor:pointer;transition:.15s;font-family:inherit;}\n" +
                ".btn:hover{background:#334155;}\n" +
                ".btn.primary{background:#6366f1;border-color:#6366f1;}\n" +
                ".btn.primary:hover{background:#4f46e5;}\n" +
                ".btn.danger:hover{background:#7f1d1d;border-color:#ef4444;}\n" +
                ".btnrow{display:flex;gap:8px;flex-wrap:wrap;}\n" +
                ".card{background:#10161f;border:1px solid #1e293b;border-radius:14px;padding:20px;}\n" +
                ".grid{display:grid;grid-template-columns:260px 1fr;gap:24px;}\n" +
                "@media(max-width:760px){.grid{grid-template-columns:1fr;}}\n" +
                ".cover{width:100%;border-radius:10px;background:#1e293b;aspect-ratio:3/4;object-fit:cover;display:block;}\n" +
                ".scorebox{text-align:center;margin-top:16px;padding:14px;background:#0b0f16;border-radius:12px;border:1px solid #1e293b;}\n" +
                ".score-num{font-size:40px;font-weight:800;line-height:1.1;}\n" +
                ".score-max{font-size:14px;color:#64748b;}\n" +
                ".muted{color:#94a3b8;}\n" +
                ".small{font-size:12px;}\n" +
                "h1{font-size:24px;margin:0 0 4px;line-height:1.3;}\n" +
                "h2{font-size:15px;color:#94a3b8;font-weight:500;margin:0 0 12px;}\n" +
                "h3{font-size:15px;margin:22px 0 10px;padding-left:10px;border-left:3px solid #f09199;}\n" +
                ".meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 16px;margin:14px 0;}\n" +
                ".meta .k{font-size:12px;color:#64748b;}\n" +
                ".meta .v{font-weight:600;}\n" +
                ".tagrow{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;}\n" +
                ".summary{color:#cbd5e1;white-space:pre-wrap;}\n" +
                ".dist-row{display:flex;align-items:center;gap:8px;margin:3px 0;font-size:11px;}\n" +
                ".dist-row .n{width:14px;text-align:right;color:#64748b;}\n" +
                ".dist-bar{height:8px;border-radius:4px;background:linear-gradient(90deg,#f09199,#f43f5e);min-width:2px;}\n" +
                ".dist-row .c{width:36px;color:#64748b;}\n" +
                ".tabs{display:flex;gap:4px;border-bottom:1px solid #1e293b;margin-top:24px;}\n" +
                ".tab{padding:8px 16px;cursor:pointer;border:none;background:none;color:#94a3b8;font-size:14px;border-bottom:2px solid transparent;font-family:inherit;}\n" +
                ".tab.active{color:#f09199;border-bottom-color:#f09199;font-weight:600;}\n" +
                ".cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:12px;margin-top:14px;}\n" +
                ".citem{background:#0b0f16;border:1px solid #1e293b;border-radius:10px;overflow:hidden;text-align:center;}\n" +
                ".cimg{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:#1e293b;}\n" +
                ".cname{padding:6px 6px 2px;font-size:12px;font-weight:600;line-height:1.3;}\n" +
                ".crel{padding:0 6px 6px;font-size:11px;color:#f09199;}\n" +
                ".ccv{padding:0 6px 8px;font-size:11px;color:#64748b;}\n" +
                ".eptable{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px;}\n" +
                ".eptable td{padding:6px 10px;border-bottom:1px solid #1e293b;}\n" +
                ".eptable tr:hover td{background:#0b0f16;}\n" +
                ".epnum{width:50px;color:#f09199;font-weight:700;}\n" +
                ".epdate{width:100px;color:#64748b;font-size:12px;}\n" +
                ".relgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:14px;}\n" +
                ".relitem{background:#0b0f16;border:1px solid #1e293b;border-radius:10px;padding:10px;}\n" +
                ".relname{font-size:13px;font-weight:600;line-height:1.35;margin-top:4px;}\n" +
                ".reltype{font-size:11px;color:#f09199;}\n" +
                ".center{text-align:center;padding:60px 20px;}\n" +
                ".spinner{width:36px;height:36px;border:3px solid #1e293b;border-top-color:#f09199;border-radius:50%;margin:0 auto 16px;animation:spin 1s linear infinite;}\n" +
                "@keyframes spin{to{transform:rotate(360deg);}}\n" +
                ".panel{margin-top:20px;border:1px dashed #334155;border-radius:12px;padding:16px;background:#0b0f16;}\n" +
                ".input{flex:1;min-width:180px;padding:8px 12px;border-radius:8px;border:1px solid #334155;background:#10161f;color:#e2e8f0;font-size:13px;font-family:inherit;}\n" +
                ".input:focus{outline:none;border-color:#6366f1;}\n" +
                ".srow{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;}\n" +
                ".sresult{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border:1px solid #1e293b;border-radius:8px;margin-top:6px;background:#10161f;}\n" +
                ".sresult:hover{border-color:#f09199;}\n" +
                ".ibox{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px;}\n" +
                ".ibox td{padding:4px 8px;border-bottom:1px solid #1e293b;vertical-align:top;}\n" +
                ".ibox td:first-child{color:#64748b;width:90px;white-space:nowrap;}\n" +
                ".warnbox{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:12px 16px;margin-top:12px;font-size:13px;color:#fbbf24;}\n" +
                ".zoombg{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:pointer;}\n" +
                ".zoombg img{max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 0 60px rgba(0,0,0,.6);cursor:default;display:block;object-fit:contain;}\n" +
                ".zoombg .zoomclose{position:absolute;top:16px;right:24px;color:#fff;font-size:32px;cursor:pointer;line-height:1;opacity:.7;}\n" +
                ".zoombg .zoomclose:hover{opacity:1;}\n" +
                ".citem{cursor:pointer;transition:transform .15s;}\n" +
                ".citem:hover{transform:translateY(-2px);}\n" +
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
                "  var searchVal='',idVal='',panelOpen=false,activeTab='chars';\n" +
                "  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}\n" +
                "  function num(x){var n=Number(x);return isNaN(n)?0:n;}\n" +
                "  window.webview.on('vm',function(v){\n" +
                "    gotFirst=true;\n" +
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
                "    var s=vm.subject,e=vm.entry||{title:'',cover:'',score:0,year:0};\n" +
                "    var h='<div class=\"card\"><div class=\"grid\">';\n" +
                "    h+='<div>'+renderCover(s,e)+renderScoreBox(s,e)+renderStats(s)+renderCollection()+'</div>';\n" +
                "    h+='<div>'+renderTitleBlock(s)+renderMeta(s)+renderTags(s)+renderSummary(s)+renderInfobox(s)+'</div>';\n" +
                "    h+='</div></div>';\n" +
                "    h+=renderTabs();\n" +
                "    return h;\n" +
                "  }\n" +
                "  function renderCover(s,e){\n" +
                "    var img=(s.images&&(s.images.large||s.images.common||s.images.medium))||'';\n" +
                "    var fb=e.cover||'';\n" +
                "    var onerr=fb?(\"this.onerror=function(){this.style.display='none';};this.src='\"+esc(fb)+\"';\"):\"this.style.display='none';\";\n" +
                "    if(!img&&fb){img=fb;onerr=\"this.style.display='none';\";}\n" +
                "    if(!img)return '<div class=\"cover\"></div>';\n" +
                "    return '<img class=\"cover\" src=\"'+esc(img)+'\" onerror=\"'+onerr+'\" referrerpolicy=\"no-referrer\">';\n" +
                "  }\n" +
                "  function renderScoreBox(s,e){\n" +
                "    var r=s.rating||{};\n" +
                "    var sc=num(r.score);\n" +
                "    var h='<div class=\"scorebox\">';\n" +
                "    if(sc>0){\n" +
                "      h+='<div class=\"score-num\" style=\"color:'+scoreColor(sc)+'\">'+sc.toFixed(1)+'<span class=\"score-max\"> /10</span></div>';\n" +
                "      if(r.rank)h+='<div class=\"chip gold\" style=\"margin-top:6px;\">Rank #'+r.rank+'</div>';\n" +
                "      if(r.total)h+='<div class=\"muted small\" style=\"margin-top:6px;\">'+r.total+' 人评分</div>';\n" +
                "    }else{h+='<div class=\"muted\">暂无评分</div>';}\n" +
                "    if(e.score){h+='<div class=\"muted small\" style=\"margin-top:8px;\">AniList '+(e.score/10).toFixed(1)+' /10</div>';}\n" +
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
                "    var col=vm.collection;\n" +
                "    if(!col)return vm.hasToken?'':'<div class=\"muted small\" style=\"margin-top:10px;text-align:center;\">配置 Token 可显示我的收藏状态</div>';\n" +
                "    var map={wish:'想看',doing:'在看',collect:'看过',on_hold:'搁置',dropped:'抛弃'};\n" +
                "    var st=(col.status&&col.status.name)||'';\n" +
                "    var label=map[st]||st;\n" +
                "    var h='<div style=\"margin-top:10px;text-align:center;\">'+chip('我: '+label,'pink');\n" +
                "    if(col.rate)h+=' '+chip('我的评分 '+col.rate,'gold');\n" +
                "    h+='</div>';\n" +
                "    return h;\n" +
                "  }\n" +
                "  function renderTitleBlock(s){\n" +
                "    var h='';\n" +
                "    h+='<h1>'+esc(s.name_cn||s.name||'未知标题');\n" +
                "    if(s.nsfw)h+=' <span class=\"chip\" style=\"background:rgba(239,68,68,.15);color:#f87171;border-color:rgba(239,68,68,.4);font-size:11px;\">NSFW</span>';\n" +
                "    h+='</h1>';\n" +
                "    if(s.name&&s.name!==(s.name_cn||''))h+='<h2>'+esc(s.name)+'</h2>';\n" +
                "    if(vm.entry&&vm.entry.titles&&vm.entry.titles.length)h+='<div class=\"muted small\">AniList: '+esc(vm.entry.titles[0])+'</div>';\n" +
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
                "    if(!vm.chars)return '<div class=\"muted center\" style=\"padding:30px;\">'+(vm.chars===null?'加载中或暂无数据':'')+'</div>';\n" +
                "    var h='<div class=\"cgrid\">';\n" +
                "    for(var i=0;i<vm.chars.length&&i<18;i++){\n" +
                "      var c=vm.chars[i];\n" +
                "      var img=(c.images&&(c.images.medium||c.images.small||c.images.grid))||'';\n" +
                "      var full=(c.images&&c.images.large)||img;\n" +
                "      h+='<div class=\"citem\">';\n" +
                "      if(img)h+=\"<img class='cimg' src='\"+esc(img)+\"' data-action='zoom-img' data-fullsrc='\"+esc(full)+\"' onerror=\\\"this.style.display='none';\\\" referrerpolicy='no-referrer'>\";\n" +
                "      h+='<div class=\"cname\">'+esc(c.name)+'</div>';\n" +
                "      if(c.relation)h+='<div class=\"crel\">'+esc(c.relation)+'</div>';\n" +
                "      if(c.actors&&c.actors.length&&c.actors[0].name)h+='<div class=\"ccv\">CV: '+esc(c.actors[0].name)+'</div>';\n" +
                "      h+='</div>';\n" +
                "    }\n" +
                "    return h+'</div>';\n" +
                "  }\n" +
                "  function renderEps(){\n" +
                "    if(!vm.eps)return '<div class=\"muted center\" style=\"padding:30px;\"></div>';\n" +
                "    var h='<table class=\"eptable\">';\n" +
                "    for(var i=0;i<vm.eps.length;i++){\n" +
                "      var ep=vm.eps[i];\n" +
                "      var nm=ep.name_cn||ep.name||'';\n" +
                "      var sub=(ep.name_cn&&ep.name&&ep.name!==ep.name_cn)?ep.name:'';\n" +
                "      h+='<tr><td class=\"epnum\">'+(ep.sort!=null?ep.sort:(i+1))+'</td><td>'+escnm(nm);\n" +
                "      if(sub)h+='<div class=\"muted small\">'+escnm(sub)+'</div>';\n" +
                "      h+='</td><td class=\"epdate\">'+esc(ep.air_date||'')+'</td></tr>';\n" +
                "    }\n" +
                "    return h+'</table>';\n" +
                "  }\n" +
                "  function escnm(s){return esc(s);}\n" +
                "  function renderRels(){\n" +
                "    if(!vm.rels)return '<div class=\"muted center\" style=\"padding:30px;\"></div>';\n" +
                "    var h='<div class=\"relgrid\">';\n" +
                "    for(var i=0;i<vm.rels.length&&i<18;i++){\n" +
                "      var r=vm.rels[i];\n" +
                "      var img=(r.images&&(r.images.small||r.images.grid))||'';\n" +
                "      h+='<div class=\"relitem\">';\n" +
                "      if(r.relation)h+='<div class=\"reltype\">'+esc(r.relation)+'</div>';\n" +
                "      h+='<div style=\"display:flex;gap:8px;margin-top:4px;\">';\n" +
                "      if(img)h+=\"<img src='\"+esc(img)+\"' style='width:34px;height:46px;object-fit:cover;border-radius:4px;background:#1e293b;' onerror=\\\"this.style.display='none';\\\" referrerpolicy='no-referrer'>\";\n" +
                "      h+='<div class=\"relname\">'+esc(r.name_cn||r.name);\n" +
                "      if(r.name_cn&&r.name&&r.name!==r.name_cn)h+='<div class=\"muted small\">'+esc(r.name)+'</div>';\n" +
                "      h+='</div></div>';\n" +
                "      h+='<div style=\"margin-top:6px;\"><button class=\"btn small\" data-action=\"bind-pick\" data-payload=\"'+r.id+'\">绑定此项</button></div>';\n" +
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
                "        h+='<div class=\"sresult\"><span>'+esc(lbl)+(r.name_cn&&r.name&&r.name!==r.name_cn?'<div class=\"muted small\">'+esc(r.name)+'</div>':'')+'</span>';\n" +
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
                "</html>";
        }
    });
    // =====================================================================
    //  Hooks — inject Chinese synonyms into collection
    // =====================================================================
    var CNS_HOOK = "bangumi.data.";
    var TTL_HOOK = 86400000 * 3;
    function injectSynonyms(e) {
        try {
            var lists = e.animeCollection
                && e.animeCollection.mediaListCollection
                && e.animeCollection.mediaListCollection.lists;
            if (!lists) {
                e.next();
                return;
            }
            for (var i = 0; i < lists.length; i++) {
                var ents = lists[i].entries || [];
                if (!ents.length)
                    continue;
                for (var j = 0; j < ents.length; j++) {
                    var m = ents[j].media;
                    if (!m)
                        continue;
                    try {
                        var raw = $storage.get(CNS_HOOK + m.id);
                        if (!raw)
                            continue;
                        var d = JSON.parse(String(raw));
                        if (!d._ts || Date.now() - d._ts >= TTL_HOOK)
                            continue;
                        if (!d.name_cn)
                            continue;
                        if (!m.synonyms)
                            m.synonyms = [];
                        if (m.synonyms.indexOf(d.name_cn) === -1) {
                            m.synonyms.push(d.name_cn);
                        }
                    }
                    catch (_) { /* skip malformed entry */ }
                }
            }
        }
        catch (_) { /* ignore top-level errors */ }
        e.next();
    }
    $app.onGetAnimeCollection(injectSynonyms);
    $app.onGetRawAnimeCollection(injectSynonyms);
}
