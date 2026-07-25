# AniBT — Seanime Torrent Provider

在 [Seanime](https://seanime.app) 中通过 [AniBT](https://anibt.net) 搜索番剧磁力链接，支持流式播放。

Search anime torrent releases from AniBT and stream them directly in Seanime.

---

## Features

- **Title search** — Chinese / English / Japanese / Romaji
- **Bangumi ID lookup** — Enter a numeric ID directly
- **Subtitle group results** — All groups with releases for the anime
- **Episode / Resolution / Batch filters** — Used in auto-select
- **Latest releases** — Browse seasonal anime with available torrents
- **No API key required** — Public API, free to use

## Install

```
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/anibt/manifest.json
```

Or download `manifest.json` and place it in your Seanime `extensions/` directory.

## Usage

1. Open any anime entry page in Seanime
2. Go to **Torrent Search** tab
3. Select **AniBT** as provider
4. Search by anime title or Bangumi ID
5. Select a magnet to start streaming

In auto-select mode, AniBT supports filtering by episode number, resolution, batch, and best release selection.

## API

AniBT uses these public endpoints:
- `GET /api/bgm/search?q={title}&limit=5` — Resolve Bangumi ID
- `GET /api/anime/groups?bgmId={id}` — Fetch subtitle group releases with magnet links
- `GET /api/seasons/anime` — Current season anime list



