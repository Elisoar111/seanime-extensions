/// <reference path="./manga-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {
    constructor() {
        this.baseUrl = "https://60ti.com";

        // Caches
        this._textCache = new Map();

        // Pre-compiled regex patterns
        this._chapterLinkRe = /<a href="\/chapter_(\d+)_(\d+)\.html"[^>]*>([^<]+)<\/a>/g;
        this._comicIdRe = /data-id="(\d+)"/;
        this._imgRe = /<img[^>]+src="([^"]+\.webp)"[^>]*>/g;
    }

    getSettings() {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        };
    }

    async search(opts) {
        console.log("[60ti] search:", opts.query);
        try {
            const html = await this._fetchText(
                this.baseUrl + "/search?key=" + encodeURIComponent(opts.query)
            );
            return this._parseSearchResults(html);
        } catch (e) {
            console.error("[60ti] search error:", e.message);
            return [];
        }
    }

    async findChapters(mangaId) {
        console.log("[60ti] findChapters:", mangaId);
        try {
            const html = await this._fetchText(
                this.baseUrl + "/comic_" + mangaId + ".html"
            );
            return this._parseChapters(html, mangaId);
        } catch (e) {
            console.error("[60ti] findChapters error:", e.message);
            return [];
        }
    }

    async findChapterPages(chapterId) {
        console.log("[60ti] findChapterPages:", chapterId);
        try {
            // chapterId format: comicDbId|chapterDbId|slug
            const parts = chapterId.split("|");
            if (parts.length < 3) {
                console.error("[60ti] invalid chapterId:", chapterId);
                return [];
            }
            const comicDbId = parts[0];
            const chapterDbId = parts[1];
            const slug = parts[2];

            const url = this.baseUrl + "/chapter_" + comicDbId + "_" + chapterDbId + ".html";
            const html = await this._fetchText(url);

            return this._parseChapterPages(html, slug);
        } catch (e) {
            console.error("[60ti] findChapterPages error:", e.message);
            return [];
        }
    }

    // ── Private ─────────────────────────────────────────────────────

    async _fetchText(url) {
        const cached = this._textCache.get(url);
        if (cached !== undefined) return cached;

        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": this.baseUrl + "/",
            },
            timeout: 30,
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const text = await res.text();
        this._textCache.set(url, text);
        return text;
    }

    _parseSearchResults(html) {
        const results = [];

        // Split by comic-item blocks
        const parts = html.split('<div class="comic-item">');
        // Skip first element (before the first comic-item)
        for (let i = 1; i < parts.length; i++) {
            const block = parts[i];
            const endIdx = block.indexOf("</div>");
            if (endIdx === -1) continue;
            const itemHtml = block.substring(0, endIdx);

            // Extract slug from href="/comic_SLUG.html"
            const linkMatch = itemHtml.match(/href="\/comic_([^"]+)\.html"/);
            if (!linkMatch) continue;
            const slug = linkMatch[1];

            // Extract title from title="TITLE"
            const titleMatch = itemHtml.match(/title="([^"]+)"/);
            const title = titleMatch ? titleMatch[1] : slug;

            // Extract cover image
            const imgMatch = itemHtml.match(/src="([^"]+)"/);
            let image = imgMatch ? imgMatch[1] : "";
            if (image && image.indexOf("http") !== 0) {
                image = "https:" + image;
            }

            results.push({
                id: slug,
                title: title,
                image: image || undefined,
            });
        }

        return results;
    }

    _parseChapters(html, slug) {
        const chapters = [];

        // Extract comic database ID from data-id attribute
        const idMatch = html.match(this._comicIdRe);
        const comicDbId = idMatch ? idMatch[1] : "";
        if (!comicDbId) {
            console.error("[60ti] could not find comic ID for slug:", slug);
            return [];
        }

        // Find all chapter links: <a href="/chapter_{comicId}_{chapterId}.html">TITLE</a>
        // Reset regex lastIndex before using
        this._chapterLinkRe.lastIndex = 0;
        let match;

        while ((match = this._chapterLinkRe.exec(html)) !== null) {
            const cComicDbId = match[1];
            const cChapterDbId = match[2];
            const title = match[3].trim();

            // Extract chapter number from title like "第1话" or "第158话"
            const numMatch = title.match(/第(\d+)话/);
            const chapterNum = numMatch ? numMatch[1] : "0";

            chapters.push({
                id: cComicDbId + "|" + cChapterDbId + "|" + slug,
                url: this.baseUrl + "/chapter_" + cComicDbId + "_" + cChapterDbId + ".html",
                title: title,
                chapter: chapterNum,
                index: chapters.length, // 0-based ascending
            });
        }

        return chapters;
    }

    _parseChapterPages(html, slug) {
        const pages = [];
        const seen = new Set();
        let index = 0;

        // Reset regex
        this._imgRe.lastIndex = 0;
        let match;

        while ((match = this._imgRe.exec(html)) !== null) {
            let imgUrl = match[1];

            // Only collect images from the manga CDN
            if (imgUrl.indexOf("manhua.5um.net") === -1 &&
                imgUrl.indexOf("comic.5um.net") === -1 &&
                imgUrl.indexOf("5um.net/colatj") === -1) {
                continue;
            }

            // Deduplicate
            if (seen.has(imgUrl)) continue;
            seen.add(imgUrl);

            // Ensure full URL
            if (imgUrl.indexOf("http") !== 0) {
                if (imgUrl.indexOf("//") === 0) {
                    imgUrl = "https:" + imgUrl;
                } else {
                    imgUrl = "https://" + imgUrl;
                }
            }

            pages.push({
                url: imgUrl,
                index: index++,
                headers: {
                    "Referer": this.baseUrl + "/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
            });
        }

        return pages;
    }
}
