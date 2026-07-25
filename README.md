# seanime-extensions

[![GitHub stars](https://img.shields.io/github/stars/Elisoar111/seanime-extensions)](https://github.com/Elisoar111/seanime-extensions/stargazers)
[![License](https://img.shields.io/github/license/Elisoar111/seanime-extensions)](LICENSE)

**Seanime Extensions** — 为 [Seanime](https://seanime.app) 提供漫画源、动画种子源和功能插件。

---

##  Extensions

| Extension | Type | Version | Description |
|-----------|------|---------|-------------|
| **[Bangumi 番组计划](./Bangumi)** | Plugin | v1.1.3 | 在 Seanime 侧栏展示 Bangumi 完整元数据，支持收藏管理 |
| **[AniBT](./anibt)** | Anime Torrent Provider | v1.0.0 | 通过 AniBT 搜索番剧磁力链接，支持流式播放 |
| **[Anime Garden](./Anime-Garden)** | Anime Torrent Provider | v1.0.1 | 实时准确的动漫字幕种子搜索 |
| **[Mikan Project](./mikan-project)** | Anime Torrent Provider | v1.1.0 | 通过蜜柑计划 RSS 订阅搜索番剧种子 |
| **[60ti 漫画](./60ti)** | Manga Provider | v1.0.1 | 60ti 中文漫画源 |
| **[Baozi Manga (baozimh)](./baozimh)** | Manga Provider | v1.0.0 | 包子漫画中文漫画源 |

---

##  Installation

在 Seanime → **Extensions** → 右上角 **+** → **Install from URL**，粘贴对应扩展的 manifest 地址：

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

也可手动下载对应目录的 `manifest.json` + `provider.js` 放入 Seanime `extensions/` 目录后重载。

---

##  Details

### Bangumi 番组计划

在 Seanime 侧栏查看 Bangumi 番组计划的完整元数据，支持收藏管理与观看进度同步。

- **自动匹配** — 日文优先，多标题候选 + 年份加权
- **评分系统** — Bangumi 评分 + Rank + 分布图，与 AniList 评分对比
- **完整信息** — 中/日文标题、播出日期、话数、平台、标签、简介、Infobox
- **角色列表** — 最多 2 名声优，点击图片放大
- **章节列表** — 完整章节表格，自动计算下一集播出时间
- **关联条目** — 续集/前传/衍生作品卡片，支持跳转绑定
- **收藏管理** — 想看/看过/在看/搁置/抛弃，+/- 观看进度（需 Access Token）
- **故障转移** — 多端点自动切换，429 退避重试，镜像自动追加
- **本地缓存** — 3 天缓存减少重复请求

### AniBT

通过 AniBT 公开 API 搜索番剧磁力链接，无需 API Key。

- 中文 / 英文 / 日文 / Romaji 标题搜索
- Bangumi ID 直查
- 集数 / 分辨率 / Batch 智能过滤

### Anime Garden

使用 Anime Garden 实时获取准确的动漫字幕种子。

- 可配置 API 端点，默认 `https://api.animes.garden`

### Mikan Project

通过蜜柑计划 RSS 搜索番剧种子，支持多镜像地址。

- 可配置站点域名，默认 `https://mikanani.kas.pub`

### 60ti 漫画

60ti 中文漫画源。

- 可配置站点地址，默认 `https://www.60ti.com`

### Baozi Manga (baozimh)

包子漫画中文漫画源。

- 可配置站点地址，默认 `https://cn.bzmanga.com`

---

##  License

[MIT](LICENSE) © Elisoar
