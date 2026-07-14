class Provider {
    constructor() {
        this.baseUrl = ($config && $config.baseUrl ? $config.baseUrl : 'https://cn.bzmanga.com').replace(/\/$/, '');
    }
    getSettings() {
        return { supportsMultiScanlator: false, supportsMultiLanguage: false };
    }
    async fetchHtml(url, retries = 2) {
        for (let i = 0; i <= retries; i++) {
            try {
                const resp = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': this.baseUrl + '/',
                        'Accept': 'text/html',
                        'Accept-Language': 'zh-CN,zh'
                    }
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return await resp.text();
            } catch (e) {
                if (i === retries) {
                    console.error('baozimh: request failed after ' + (retries + 1) + ' attempts', url);
                    throw new Error('请求失败：' + e.message);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        throw new Error('不可达');
    }
    decodeHtml(s) {
        if (!s) return '';
        const txt = document.createElement('textarea');
        txt.innerHTML = s;
        return txt.value.trim();
    }
    async search(opts) {
        const ret = [];
        const seen = {};
        const query = encodeURIComponent(opts.query.trim());
        if (!query) return [];
        const url = this.baseUrl + '/search?q=' + query;
        console.debug('baozimh: search', { query: opts.query, url: url });
        const html = await this.fetchHtml(url);
        const re = /href="\/comic\/([^"]+)"/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            const slug = m[1];
            if (!slug || seen[slug]) continue;
            if (!/^[a-z0-9_-]+$/i.test(slug)) continue;
            seen[slug] = true;
            const start = Math.max(0, m.index - 200);
            const end = Math.min(html.length, m.index + 500);
            const frag = html.substring(start, end);
            let title = '';
            const hm = frag.match(/<h[1-4][^>]*>([^<]+)<\/h/);
            const am = frag.match(/alt="([^"]+)"/);
            if (hm && hm[1]) title = this.decodeHtml(hm[1]);
            else if (am && am[1]) title = this.decodeHtml(am[1]);
            if (!title) continue;
            let image = '';
            const im = frag.match(/amp-img src="([^"]+)"/);
            const im2 = frag.match(/<img[^>]+src="([^"]+)"/);
            if (im && im[1]) image = im[1];
            else if (im2 && im2[1]) image = im2[1];
            if (image && image.startsWith('//')) image = 'https:' + image;
            ret.push({ id: slug, title: title, synonyms: [], year: 0, image: image });
        }
        console.debug('baozimh: found', ret.length);
        return ret.slice(0, 30);
    }
    async findChapters(id) {
        const ret = [];
        const seen = {};
        const html = await this.fetchHtml(this.baseUrl + '/comic/' + id);
        const re = /chapter_slot=(\d+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g;
        let m;
        let idx = 0;
        while ((m = re.exec(html)) !== null) {
            const slot = m[1];
            const title = this.decodeHtml(m[2]);
            if (!slot || !title || seen[slot]) continue;
            seen[slot] = true;
            ret.push({
                id: id + '::' + slot,
                url: this.baseUrl + '/comic/chapter/' + id + '/0_' + slot + '.html',
                title: title,
                chapter: String(idx + 1),
                index: idx,
                language: 'zh'
            });
            idx++;
        }
        console.debug('baozimh: chapters found', ret.length);
        return ret;
    }
    async findChapterPages(chapterId) {
        const ret = [];
        const seen = {};
        const parts = chapterId.split('::');
        const mangaId = parts[0];
        const slot = parts[1];
        const html = await this.fetchHtml(this.baseUrl + '/comic/chapter/' + mangaId + '/0_' + slot + '.html');
        const re = /<(?:amp-img|img)[^>]+src="([^"]+)"/g;
        let m;
        let idx = 0;
        while ((m = re.exec(html)) !== null) {
            const src = m[1];
            if (!src || seen[src]) continue;
            if (!src.includes('/scomic/') && !src.includes('bzcdn.net')) continue;
            if (src.includes('logo') || src.includes('avatar') || src.includes('icon')) continue;
            seen[src] = true;
            let fullUrl = src;
            if (fullUrl.startsWith('//')) fullUrl = 'https:' + fullUrl;
            ret.push({ url: fullUrl, index: idx, headers: { Referer: this.baseUrl + '/' } });
            idx++;
        }
        console.debug('baozimh: pages found', ret.length);
        return ret;
    }
}