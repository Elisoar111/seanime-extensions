# seanime-extensions

[![GitHub stars](https://img.shields.io/github/stars/Elisoar111/seanime-extensions)](https://github.com/Elisoar111/seanime-extensions/stargazers)
[![JavaScript](https://img.shields.io/badge/JavaScript-56.7%25-yellow)](https://github.com/Elisoar111/seanime-extensions/search?l=javascript)
[![TypeScript](https://img.shields.io/badge/TypeScript-43.3%25-blue)](https://github.com/Elisoar111/seanime-extensions/search?l=typescript)

**Seanime Extensions Collection** —— 提供漫画源、动画种子源和功能插件，为 [Seanime](https://seanime.app) 扩展功能。

---

##  Extension List

| Extension | Type | Description |
|-----------|------|-------------|
| **[Bangumi 番组计划](./Bangumi)** | Plugin | View complete metadata from **Bangumi** in Seanime sidebar, including ratings, characters, episodes, related entries, and collection management |
| **[Anime Garden](./Anime-Garden)** | Anime Torrent Provider | Provide real-time, accurate Chinese subtitles anime torrents |
| **[Mikan Project](./mikan-project)** | Anime Torrent Provider | Mikan Project — real-time, accurate Chinese subtitles anime torrents |
| **[60ti 漫画](./60ti)** | Manga Provider | Chinese manga source from 60ti |
| **[Baozi Manga (baozimh)](./baozimh)** | Manga Provider | Chinese manga source from Baozi |

---

##  Installation

### Method 1: Install from GitHub (Recommended)

1. Open Seanime → **Extensions**
2. Click the **+** button at the top right → **Install from URL**
3. Paste the `manifest` link for the extension:

```bash
# Bangumi
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/Bangumi/manifest.json

# Anime Garden
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/Anime-Garden/manifest.json

# Mikan Project
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/mikan-project/manifest.json

# 60ti Manga
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/60ti/manifest.json

# Baozi Manga
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/baozimh/manifest.json
```

---

### Method 2: Manual Installation

1. Download the `manifest.json` and `provider.js`/`provider.ts` files from the extension directory
2. Place them in Seanime's `extensions/` folder
3. Open Seanime → **Extensions** → Click **Reload**

---

##  Extension Details

### Bangumi 番组计划（Bangumi）

This extension allows you to view **complete metadata** from **Bangumi** in the Seanime sidebar. It integrates with **AniList** and supports **rating systems**, **character lists**, **episode lists**, and **collection management**.

#### Features:

- **Auto Match** — Japanese-first search, multiple title candidates + year-based priority
- **Rating System** — Bangumi score + ranking + distribution graph, can be compared with AniList ratings
- **Full Information** — Chinese/Japanese title, broadcast date, episode count, platforms, tags, synopsis, info panel
- **Character List** — Up to 2 voice actors, image click to enlarge
- **Episode List** — Full episode table, automatically calculate next episode airing time
- **Related Entries** — Cards for sequel/prequel/parallel series, supports navigation
- **Collection Management** — Set status as "Want to Watch", "Watching", "Watched", "On Hold", or "Dropped", with ± episode progress (requires Access Token)
- **Token Validation** — UI prompt when token is invalid or expired
- **Fault Tolerance** — Auto-switch between endpoints, 429 retry delay, mirror auto-adding
- **Local Cache** — 3-day cache to reduce repeated requests

#### Configuration:

| Configuration Item | Description |
|--------------------|-------------|
| **Access Token** | Bangumi personal token (optional), required for collection management. Create at: [https://next.bgm.tv/demo/access-token](https://next.bgm.tv/demo/access-token) |
| **API Endpoint** | Default is `https://api.bgm.tv`, domestic users can add a mirror `https://api.bangumi.lol` |
| **Auto Match** | Disable to manually search or bind by ID |
| **Load Characters/Episodes/Related** | Toggle data sections to reduce requests |

---

### Anime Garden

An **anime torrent provider** extension that uses the Anime Garden API to fetch real-time and accurate Chinese subtitles anime torrents.

#### Configuration:

- Customizable API endpoint; default is `https://api.animes.garden`
- Replace with a mirror if default endpoint is unavailable

---

### Mikan Project（Mikan Plan）

An **anime torrent provider** extension that uses **Mikan Project** API to fetch real-time and accurate Chinese subtitles anime torrents.

#### Configuration:

- Customizable Mikan site domain; default is `https://mikanime.tv`
- Replace with a mirror if the site is unreachable

---

### 60ti 漫画

A **manga provider** extension for **Chinese manga sources** from 60ti.

#### Configuration:

- Customizable site address; default is `https://www.60ti.com`
- Use a mirror if site is down

---

### Baozi Manga (baozimh)

A **manga provider** extension for **Chinese manga sources** from Baozi.

#### Configuration:

- Customizable site address; default is `https://cn.bzmanga.com`
- Use a mirror if site is down

---

##  License

MIT License

---

##  Acknowledgements

- **Seanime** — Powerful anime management desktop app ([https://seanime.app](https://seanime.app))
- **Bangumi** — Comprehensive anime database
- **Anime Garden** — Anime torrent seed aggregator
- **Mikan Project** — Great anime torrent source

---

##  Contributions

We welcome **Issues** and **Pull Requests** from the community! Please feel free to contribute and help improve this project.
