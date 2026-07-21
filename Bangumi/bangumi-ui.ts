/// <reference path="./plugin.d.ts" />
/// <reference path="./hooks.d.ts" />
/// <reference path="./app.d.ts" />
/// <reference path="./system.d.ts" />
/// <reference path="./core.d.ts" />

function init() {
    // ==================== 常量 ====================
    var BGM_API = "https://api.bgm.tv"
    var CACHE_PREFIX = "bangumi.data."
    var MATCH_PREFIX = "bangumi.match."
    var CACHE_TTL = 1000 * 60 * 60 * 24

    // ==================== 工具 ====================
    function escapeHtml(text) {
        if (!text) return ""
        return String(text)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    }

    function cleanTitle(title) {
        if (!title) return ""
        return title
            .replace(/: .*$/, "")
            .replace(/ Season \d+/i, "")
            .replace(/ \d+(nd|rd|th) Season/i, "")
            .replace(/ Part \d+/i, "")
            .replace(/ \(.*\)$/, "")
            .trim()
    }

    // ==================== Bangumi API ====================
    function bgmFetch(ctx, path, opts) {
        var options = opts || {}
        var headers = { "User-Agent": "Seanime-Bangumi-UI/2.0" }
        var token = ctx.settings.get("bangumi.accessToken", "")
        if (token) headers["Authorization"] = "Bearer " + token
        if (options.headers) {
            for (var k in options.headers) headers[k] = options.headers[k]
        }
        options.headers = headers
        return ctx.fetch(BGM_API + path, options)
    }

    function searchBangumi(ctx, keyword) {
        return bgmFetch(ctx, "/v0/search/subjects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                keyword: keyword, sort: "match",
                filter: { type: [2] }, limit: 10,
            }),
        })
    }

    function getSubject(ctx, subjectId) {
        return bgmFetch(ctx, "/v0/subjects/" + subjectId)
    }

    // ==================== 缓存 ====================
    function getCached(mediaId) {
        var raw = $storage.get(CACHE_PREFIX + mediaId)
        if (!raw) return null
        try {
            var d = JSON.parse(raw)
            if (d._cachedAt && (Date.now() - d._cachedAt) < CACHE_TTL) return d
        } catch (_) {}
        return null
    }

    function setCache(mediaId, data) {
        data._cachedAt = Date.now()
        $storage.set(CACHE_PREFIX + mediaId, JSON.stringify(data))
    }

    function getManualMatch(mediaId) {
        return $storage.get(MATCH_PREFIX + mediaId)
    }

    function setManualMatch(mediaId, subjectId) {
        $storage.set(MATCH_PREFIX + mediaId, String(subjectId))
    }

    // ==================== 主逻辑 ====================
    $ui.register(function (ctx) {
        // ---- 状态 ----
        var currentMediaId = ctx.state(0)
        var currentTitle = ctx.state("")
        var alScore = ctx.state(0)
        var bgmData = ctx.state(null)
        var isLoading = ctx.state(false)
        var errorMsg = ctx.state("")
        var isManualMode = ctx.state(false)
        var searchResults = ctx.state([])

        // ---- 设置 ----
        var settings = ctx.settings.define("bangumi", {
            accessToken: "",
            showSummary: true,
            showTags: true,
            showInfo: true,
            showScoreCompare: true,
            showCollection: true,
            tagLimit: 10,
            tagMinCount: 5,
            autoMatch: true,
        })

        // ---- 获取番剧信息（兼容同步/异步）----
        function resolveEntry(mediaId) {
            try {
                var res = ctx.anime.getAnimeEntry(mediaId)
                if (res && typeof res.then === "function") return res
                return Promise.resolve(res)
            } catch (e) {
                return Promise.reject(e)
            }
        }

        function getAnimeInfo(mediaId) {
            return resolveEntry(mediaId).then(function (entry) {
                var title = "", score = 0
                if (entry && entry.media) {
                    var m = entry.media
                    var t = m.title || {}
                    title = t.romaji || t.english || t.native || ""
                    score = m.meanScore || m.averageScore || 0
                }
                return { title: title, score: score }
            }).catch(function () {
                // DOM 回退
                var el = ctx.dom.querySelector("h1")
                return { title: el ? el.textContent.trim() : "", score: 0 }
            })
        }

        // ---- 事件处理器（顶层注册）----
        ctx.registerEventHandler("open-bangumi", function () {
            var d = bgmData.get()
            if (d && d.id) {
                try { $app.openURL("https://bgm.tv/subject/" + d.id) }
                catch (_) { ctx.toast.info("https://bgm.tv/subject/" + d.id) }
            }
        })

        ctx.registerEventHandler("refresh", function () {
            var id = currentMediaId.get()
            if (id) { bgmData.set(null); errorMsg.set(""); fetchBangumi(id) }
        })

        ctx.registerEventHandler("clear-cache", function () {
            var id = currentMediaId.get()
            if (id) {
                $storage.remove(CACHE_PREFIX + id)
                $storage.remove(MATCH_PREFIX + id)
                bgmData.set(null); errorMsg.set("")
                ctx.toast.success("缓存已清除")
                fetchBangumi(id)
            }
        })

        ctx.registerEventHandler("toggle-manual", function () {
            isManualMode.set(!isManualMode.get())
            searchResults.set([])
        })

        // 搜索结果选择（预注册 5 个）
        for (var _i = 0; _i < 5; _i++) {
            (function (idx) {
                ctx.registerEventHandler("select-match-" + idx, function () {
                    var results = searchResults.get()
                    if (!results[idx]) return
                    selectMatch(results[idx].id)
                })
            })(_i)
        }

        ctx.registerEventHandler("manual-search", function () {
            var ref = searchInputRef.current
            if (!ref || !ref.trim()) { ctx.toast.error("请输入关键词"); return }
            ctx.toast.info("搜索中...")
            searchBangumi(ctx, ref.trim())
                .then(function (res) {
                    var data = res.json()
                    if (data && data.data && data.data.length) {
                        searchResults.set(data.data)
                        ctx.toast.success("找到 " + data.data.length + " 个结果")
                    } else {
                        searchResults.set([])
                        ctx.toast.error("未找到结果")
                    }
                })
                .catch(function () { searchResults.set([]); ctx.toast.error("搜索失败") })
        })

        function selectMatch(subjectId) {
            var id = currentMediaId.get()
            if (!id) return
            setManualMatch(id, subjectId)
            isManualMode.set(false)
            searchResults.set([])
            getSubject(ctx, subjectId)
                .then(function (res) {
                    var d = res.json()
                    if (d) {
                        setCache(id, d)
                        bgmData.set(d)
                        ctx.toast.success("已匹配: " + (d.name_cn || d.name))
                    }
                })
                .catch(function () { ctx.toast.error("获取详情失败") })
        }

        // ---- 核心匹配 ----
        function fetchBangumi(mediaId) {
            if (!mediaId) return
            isLoading.set(true)
            errorMsg.set("")

            // 手动匹配优先
            var manualId = getManualMatch(mediaId)
            if (manualId) {
                var c = getCached(mediaId)
                if (c) { bgmData.set(c); isLoading.set(false); return }
                getSubject(ctx, parseInt(manualId, 10))
                    .then(function (res) {
                        var d = res.json()
                        if (d) { setCache(mediaId, d); bgmData.set(d) }
                    })
                    .catch(function () { errorMsg.set("获取详情失败") })
                    .finally(function () { isLoading.set(false) })
                return
            }

            // 缓存
            var cached = getCached(mediaId)
            if (cached) { bgmData.set(cached); isLoading.set(false); return }

            // 自动匹配
            if (!settings.get("autoMatch", true)) {
                isLoading.set(false)
                errorMsg.set("自动匹配已关闭")
                return
            }

            getAnimeInfo(mediaId).then(function (info) {
                currentTitle.set(info.title)
                alScore.set(info.score)
                if (!info.title) {
                    isLoading.set(false)
                    errorMsg.set("无法获取标题")
                    return
                }

                var kw = cleanTitle(info.title) || info.title
                return searchBangumi(ctx, kw)
                    .then(function (res) {
                        var data = res.json()
                        if (!data || !data.data || !data.data.length) throw new Error("not found")
                        return getSubject(ctx, data.data[0].id)
                    })
                    .then(function (res) {
                        var d = res.json()
                        if (!d) throw new Error("no detail")
                        setCache(mediaId, d)
                        bgmData.set(d)
                    })
            }).catch(function (e) {
                console.error("[Bangumi]", e)
                errorMsg.set("未找到 Bangumi 条目")
            }).finally(function () {
                isLoading.set(false)
            })
        }

        // ---- 页面卡片注入 ----
        function injectCard() {
            ctx.dom.onReady(function () {
                // 清理
                try {
                    var olds = ctx.dom.querySelectorAll("#bangumi-ui-card")
                    for (var i = 0; i < olds.length; i++) olds[i].remove()
                } catch (_) {}

                var data = bgmData.get()
                if (!data) return

                var showSummary = settings.get("showSummary", true)
                var showTags = settings.get("showTags", true)
                var showInfo = settings.get("showInfo", true)
                var showCompare = settings.get("showScoreCompare", true)
                var showColl = settings.get("showCollection", true)
                var tagLimit = settings.get("tagLimit", 10)
                var tagMin = settings.get("tagMinCount", 5)

                // 数据
                var score = data.rating ? data.rating.score.toFixed(1) : "N/A"
                var rank = data.rating && data.rating.rank ? "#" + data.rating.rank : ""
                var total = data.rating ? data.rating.total : 0
                var nameCn = data.name_cn || ""
                var name = data.name || ""
                var summary = data.summary || ""
                var eps = data.eps || data.total_episodes || 0
                var airDate = data.date || ""

                // 收藏统计
                var coll = data.collection || {}
                var wish = coll.wish || 0
                var doing = coll.doing || 0
                var collect = coll.collect || 0

                // 评分对比
                var compareHtml = ""
                var al = alScore.get()
                if (showCompare && al > 0) {
                    var al10 = (al / 10).toFixed(1)
                    var diff = (parseFloat(score) - al / 10).toFixed(1)
                    var dColor = parseFloat(diff) > 0 ? "#51cf66" : parseFloat(diff) < 0 ? "#ff6b6b" : "#888"
                    var dText = parseFloat(diff) > 0 ? "+" + diff : diff
                    compareHtml = '<div style="display:flex;gap:12px;margin-top:10px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:12px;">' +
                        '<span style="color:#888;">AniList <b style="color:#4dabf7;">' + al10 + '</b></span>' +
                        '<span style="color:#888;">Bangumi <b style="color:#ff6b6b;">' + score + '</b></span>' +
                        '<span style="color:' + dColor + ';margin-left:auto;">' + dText + '</span></div>'
                }

                // 收藏统计
                var collHtml = ""
                if (showColl && (wish || doing || collect)) {
                    collHtml = '<div style="display:flex;gap:12px;margin-top:10px;font-size:12px;color:#888;">' +
                        '<span>想看 <b style="color:#ffd43b;">' + wish + '</b></span>' +
                        '<span>在看 <b style="color:#4dabf7;">' + doing + '</b></span>' +
                        '<span>看过 <b style="color:#51cf66;">' + collect + '</b></span></div>'
                }

                // 标签
                var tagsHtml = ""
                if (showTags && data.tags && data.tags.length) {
                    var tags = data.tags.filter(function (t) { return t.count >= tagMin })
                        .sort(function (a, b) { return b.count - a.count }).slice(0, tagLimit)
                    tagsHtml = tags.map(function (t) {
                        return '<span style="display:inline-block;padding:3px 10px;margin:2px;background:rgba(120,120,120,0.15);border-radius:12px;font-size:12px;color:#ccc;user-select:text;">' + escapeHtml(t.name) + '</span>'
                    }).join("")
                }

                // 简介
                var summaryHtml = ""
                if (showSummary && summary) {
                    var tr = summary.length > 200 ? summary.substring(0, 200) + "..." : summary
                    summaryHtml = '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);font-size:13px;line-height:1.7;color:#aaa;user-select:text;">' + escapeHtml(tr) + '</div>'
                }

                // 信息行
                var infoHtml = ""
                if (showInfo && (eps || airDate)) {
                    var parts = []
                    if (eps) parts.push('<span style="color:#888;">共 <b style="color:#fff;">' + eps + '</b> 话</span>')
                    if (airDate) parts.push('<span style="color:#888;">放送 <b style="color:#fff;">' + escapeHtml(airDate) + '</b></span>')
                    infoHtml = '<div style="display:flex;gap:16px;margin-top:10px;font-size:12px;">' + parts.join("") + '</div>'
                }

                // 中文标题（可复制）
                var titleCnHtml = ""
                if (nameCn) {
                    titleCnHtml = '<div style="margin-top:14px;">' +
                        '<div style="font-size:11px;color:#666;margin-bottom:5px;">中文标题（点击后 Ctrl+C 复制）</div>' +
                        '<input type="text" readonly value="' + escapeHtml(nameCn) + '" style="' +
                        'width:100%;padding:10px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);' +
                        'border-radius:8px;color:#fff;font-size:17px;font-weight:700;cursor:text;user-select:all;' +
                        '" /></div>'
                }

                var cardHtml =
                    '<div id="bangumi-ui-card" style="' +
                    'margin-top:16px;padding:20px;background:linear-gradient(135deg,rgba(22,22,32,0.95),rgba(28,28,38,0.9));' +
                    'border:1px solid rgba(255,255,255,0.08);border-radius:16px;backdrop-filter:blur(10px);' +
                    'box-shadow:0 4px 24px rgba(0,0,0,0.35);font-family:inherit;">' +

                    // 头部
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
                    '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<div style="width:34px;height:34px;background:linear-gradient(135deg,#ff6b6b,#ee5a24);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:15px;">B</div>' +
                    '<div><div style="font-size:16px;font-weight:700;color:#fff;">Bangumi</div>' +
                    '<div style="font-size:11px;color:#555;">bgm.tv</div></div></div>' +
                    '<a href="https://bgm.tv/subject/' + data.id + '" target="_blank" style="' +
                    'padding:6px 14px;background:rgba(77,171,247,0.12);border:1px solid rgba(77,171,247,0.25);border-radius:6px;' +
                    'color:#4dabf7;text-decoration:none;font-size:12px;font-weight:500;">查看详情 →</a></div>' +

                    // 评分
                    '<div style="display:flex;align-items:baseline;gap:8px;">' +
                    '<span style="font-size:38px;font-weight:800;color:#ff6b6b;line-height:1;">' + score + '</span>' +
                    '<span style="font-size:14px;color:#555;">/ 10</span>' +
                    (rank ? '<span style="font-size:12px;color:#888;background:rgba(255,255,255,0.06);padding:2px 10px;border-radius:4px;">' + rank + '</span>' : "") +
                    '<span style="font-size:11px;color:#444;margin-left:auto;">' + total + ' 人评分</span></div>' +

                    compareHtml + collHtml + titleCnHtml +
                    (name && name !== nameCn ? '<div style="margin-top:8px;font-size:13px;color:#666;user-select:text;">' + escapeHtml(name) + '</div>' : "") +
                    infoHtml +
                    (tagsHtml ? '<div style="margin-top:12px;">' + tagsHtml + '</div>' : "") +
                    summaryHtml +
                    '</div>'

                // 注入
                var selectors = [
                    "[data-testid='anime-info-section']", ".anime-entry__info",
                    ".entry-details", "[class*='info']", "main > div > div",
                ]
                for (var i = 0; i < selectors.length; i++) {
                    try {
                        var c = ctx.dom.querySelector(selectors[i])
                        if (c) { c.insertAdjacentHTML("beforeend", cardHtml); break }
                    } catch (_) {}
                }
            })
        }

        // ---- 导航 ----
        ctx.screen.onNavigate(function (e) {
            if (e.pathname === "/entry" && e.searchParams.id) {
                currentMediaId.set(parseInt(e.searchParams.id, 10))
                isManualMode.set(false)
                searchResults.set([])
            } else {
                currentMediaId.set(0)
            }
        })
        ctx.screen.loadCurrent()

        // ---- Effects ----
        ctx.effect(function () {
            var id = currentMediaId.get()
            if (!id) { bgmData.set(null); errorMsg.set(""); return }
            fetchBangumi(id)
        }, [currentMediaId])

        ctx.effect(function () {
            if (bgmData.get()) injectCard()
        }, [bgmData])

        // ---- Tray ----
        var tray = ctx.newTray({
            tooltipText: "Bangumi UI",
            iconUrl: "https://bgm.tv/img/favicon.ico",
            withContent: true,
        })
        tray.updateBadge({ number: 0 })
        tray.onOpen(function () { ctx.screen.loadCurrent() })

        var searchInputRef = ctx.fieldRef()

        tray.render(function () {
            var id = currentMediaId.get()
            var data = bgmData.get()
            var loading = isLoading.get()
            var err = errorMsg.get()
            var manual = isManualMode.get()
            var results = searchResults.get()

            if (!id) return tray.text("打开一个番剧页面")

            var items = []
            items.push(tray.text("Bangumi UI", { fontWeight: "bold" }))
            items.push(tray.text(""))

            if (loading) {
                items.push(tray.text("搜索中..."))
            } else if (err) {
                items.push(tray.text("⚠️ " + err))
                items.push(tray.button({ label: "重试", onClick: "refresh" }))
                items.push(tray.button({ label: "手动搜索", onClick: "toggle-manual" }))
            } else if (data) {
                var sc = data.rating ? data.rating.score.toFixed(1) : "N/A"
                if (data.name_cn) items.push(tray.text("中文名: " + data.name_cn))
                items.push(tray.text("评分: " + sc + " / 10"))
                if (data.eps) items.push(tray.text("话数: " + data.eps))
                if (data.date) items.push(tray.text("放送: " + data.date))
                items.push(tray.text(""))
                items.push(tray.button({ label: "查看 Bangumi", onClick: "open-bangumi" }))
                items.push(tray.button({ label: "重新匹配", onClick: "toggle-manual" }))
                items.push(tray.button({ label: "清除缓存", onClick: "clear-cache" }))
            }

            if (manual) {
                items.push(tray.text(""))
                items.push(tray.text("手动搜索 Bangumi", { fontWeight: "bold" }))
                items.push(tray.input({ fieldRef: searchInputRef, placeholder: "输入番剧名称..." }))
                items.push(tray.button({ label: "搜索", onClick: "manual-search" }))

                if (results.length) {
                    items.push(tray.text("选择结果:"))
                    for (var i = 0; i < Math.min(results.length, 5); i++) {
                        var r = results[i]
                        var label = (r.name_cn || r.name) + " (" + (r.date || "N/A") + ")"
                        items.push(tray.button({ label: label, onClick: "select-match-" + i }))
                    }
                }
            }

            return tray.stack(items)
        })
    })

    // ==================== Hooks ====================
    function injectSynonyms(e) {
        try {
            var lists = e.animeCollection && e.animeCollection.mediaListCollection && e.animeCollection.mediaListCollection.lists
            if (!lists) { e.next(); return }
            for (var i = 0; i < lists.length; i++) {
                var entries = lists[i].entries || []
                for (var j = 0; j < entries.length; j++) {
                    var m = entries[j].media
                    if (!m) continue
                    var cached = $storage.get(CACHE_PREFIX + m.id)
                    if (cached) {
                        try {
                            var b = JSON.parse(cached)
                            if (b.name_cn && m.synonyms && m.synonyms.indexOf(b.name_cn) === -1) {
                                m.synonyms.push(b.name_cn)
                            }
                        } catch (_) {}
                    }
                }
            }
        } catch (_) {}
        e.next()
    }

    $app.onGetAnimeCollection(injectSynonyms)
    $app.onGetRawAnimeCollection(injectSynonyms)
}
