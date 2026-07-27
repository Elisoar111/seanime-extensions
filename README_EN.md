# seanime-extensions

> **English | [中文](./README.md)**

**Seanime Extensions** — Online streaming providers, anime torrent providers, manga sources, and plugins for [Seanime](https://seanime.app).

---

## Extensions

| Extension | Type | Version | Description |
|-----------|------|---------|-------------|
| **[Bangumi](./Bangumi)** | Plugin | v1.2.0 | View full Bangumi metadata in the Seanime sidebar with collection management |
| **[AniBT](./anibt)** | Anime Torrent | v1.3.0 | Search anime torrent magnet links via AniBT |
| **[Anime Garden](./Anime-Garden)** | Anime Torrent | v1.0.1 | Real-time, accurate Chinese-subtitled anime torrents |
| **[Mikan Project](./mikan-project)** | Anime Torrent | v1.1.0 | Search anime torrents via Mikan Project RSS |
| **[60ti Manga](./60ti)** | Manga | v1.0.1 | Chinese manga source from 60ti |
| **[Baozi Manga (baozimh)](./baozimh)** | Manga | v1.0.0 | Chinese manga source from Baozi |
| **[VTT6](./vtt6)** | Online Stream | v1.0.0 | Online anime streaming from VTT6 |
| **[Jibi](./jibi.cc)** | Online Stream | v1.0.0 | Online anime streaming from Jibi.cc |
| **[FQDM (Tomato Anime)](./fqdm)** | Online Stream | v1.0.0 | Online anime streaming with 5 server auto-select |
| **[DMLAC (Windmill Anime)](./dmlac)** | Online Stream | v1.0.0 | Online anime streaming from DMLAC |
| **[FZDM (Wind Anime)](./dongmanzj)** | Online Stream | v1.0.0 | Online anime streaming from FZDM |
---

## Installation

In Seanime → **Extensions** → Click **+** at the top right → **Install from URL**, then paste the manifest URL:

```bash
# Bangumi
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/Bangumi/manifest.json

# AniBT
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/anibt/manifest.json

# Anime Garden
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/Anime-Garden/manifest.json

# Mikan Project
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/mikan-project/manifest.json

# 60ti Manga
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/60ti/manifest.json

# Baozi Manga
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/baozimh/manifest.json

# VTT6
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/vtt6/manifest.json

# Jibi
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/jibi.cc/manifest.json

# FQDM (Tomato Anime)
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/fqdm/manifest.json

# DMLAC (Windmill Anime)
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/dmlac/manifest.json

# FZDM - 风之动漫
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/dongmanzj/manifest.json
```

You can also manually download `manifest.json` and `provider.js` from the extension directory and place them in Seanime's `extensions/` folder, then click **Reload**.

---

## Details

### Bangumi

View full Bangumi metadata from the Seanime sidebar. Supports collection management and watch progress sync.

- **Auto Match** — Japanese-first search, multi-title candidates with year-based priority
- **Rating System** — Bangumi score + rank + distribution chart, compared with AniList score
- **Full Info** — Chinese/Japanese titles, air date, episode count, platforms, tags, synopsis, infobox
- **Characters** — Character list with up to 2 voice actors; click image to zoom
- **Episodes** — Full episode table; auto-calculates next airing episode
- **Related Entries** — Sequel/prequel/spin-off cards with bind and open links
- **Collection Management** — Set wish/watching/watched/on-hold/dropped; +/- episode progress (requires Access Token)
- **Failover** — Multi-endpoint auto-switch; 429 backoff retry; mirror auto-appended
- **Local Cache** — 3-day cache to reduce redundant requests

### AniBT

Search anime torrent magnet links via the AniBT public API. No API key required.

- Chinese / English / Japanese / Romaji title search
- Direct Bangumi ID lookup
- Episode / Resolution / Batch smart filters

### Anime Garden

Fetch real-time, accurate Chinese-subtitled anime torrents via Anime Garden.

- Configurable API endpoint, default `https://api.animes.garden`

### Mikan Project

Search anime torrents via Mikan Project RSS, supports mirror addresses.

- Configurable site domain, default `https://mikanani.kas.pub`

### 60ti Manga

Chinese manga source from 60ti.

- Configurable site address, default `https://www.60ti.com`

### Baozi Manga (baozimh)

Chinese manga source from Baozi.

- Configurable site address, default `https://cn.bzmanga.com`

### VTT6

Online anime streaming from VTT6, supports Chinese search only.

- 4 streaming servers (HD / ikun / Extraordinary / Quantum)
- m3u8 HLS streaming

### Jibi

Online anime streaming from Jibi.cc, based on Apple CMS.

- Automatically adapts to available streaming sources per anime
- Multi-server auto-select best source
- m3u8 HLS streaming

### FQDM (Tomato Anime)

Online anime streaming from Tomato Anime (fqdm.cc), with 5 servers and auto best-match.

- 5 servers (Sina Resource 2 / Tomato Line 2 / Tomato Line 1 / Fast Stream 1 / Endless ③)
- Automatically selects the server with the most episodes
- m3u8 HLS streaming

### DMLAC (Windmill Anime)

Online anime streaming from Windmill Anime (dmlac.com).

- Clean interface with direct playback
- m3u8 HLS streaming

### FZDM (Wind Anime)

Online anime streaming from Windmill Anime (dmlac.com).

- m3u8 HLS streaming

-  Automatically selects the server with the most episodes

---

## License

[MIT](LICENSE) © Elisoar
