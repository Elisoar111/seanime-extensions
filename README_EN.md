# seanime-extensions

[![GitHub stars](https://img.shields.io/github/stars/Elisoar111/seanime-extensions)](https://github.com/Elisoar111/seanime-extensions/stargazers)
[![License](https://img.shields.io/github/license/Elisoar111/seanime-extensions)](LICENSE)

> **[English](./README_EN.md) | [中文](./README.md)**

**Seanime Extensions** — Manga sources, anime torrent providers, and plugins for [Seanime](https://seanime.app).

---

##  Extensions

| Extension | Type | Version | Description |
|-----------|------|---------|-------------|
| **[Bangumi](./Bangumi)** | Plugin | v1.1.3 | View full Bangumi metadata in the Seanime sidebar with collection management |
| **[AniBT](./anibt)** | Anime Torrent Provider | v1.0.0 | Search anime torrent magnet links via AniBT, supports streaming |
| **[Anime Garden](./Anime-Garden)** | Anime Torrent Provider | v1.0.1 | Real-time, accurate Chinese-subtitled anime torrents |
| **[Mikan Project](./mikan-project)** | Anime Torrent Provider | v1.1.0 | Search anime torrents via Mikan Project RSS |
| **[60ti Manga](./60ti)** | Manga Provider | v1.0.1 | Chinese manga source from 60ti |
| **[Baozi Manga (baozimh)](./baozimh)** | Manga Provider | v1.0.0 | Chinese manga source from Baozi |

---

##  Installation

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
```

You can also manually download `manifest.json` and `provider.js` from the extension directory and place them in Seanime's `extensions/` folder, then click **Reload**.

---

##  Details

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

---

##  License

[MIT](LICENSE) © Elisoar
