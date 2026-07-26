# seanime-extensions

> **[English](./README_EN.md) | 中文**

**Seanime Extensions** — 为 [Seanime](https://seanime.app) 提供在线动漫播放、动画种子搜索和功能插件等扩展。

---

## 扩展列表

| 扩展 | 类型 | 版本 | 说明 |
|------|------|------|------|
| **[Bangumi 番组计划](./Bangumi)** | Plugin | v1.1.3 | 在 Seanime 侧栏展示 Bangumi 完整元数据，支持收藏管理 |
| **[AniBT](./anibt)** | Anime Torrent | v1.3.0 | 番组字幕发布平台磁力搜索 |
| **[Anime Garden](./Anime-Garden)** | Anime Torrent | v1.0.1 | 实时准确的动漫字幕种子搜索 |
| **[Mikan Project](./mikan-project)** | Anime Torrent | v1.1.0 | 通过蜜柑计划 RSS 搜索番剧种子 |
| **[60ti 漫画](./60ti)** | Manga | v1.0.1 | 60ti 中文漫画源 |
| **[Baozi Manga (baozimh)](./baozimh)** | Manga | v1.0.0 | 包子漫画中文漫画源 |
| **[VTT6](./vtt6)** | Online Stream | v1.0.0 | VTT6 在线动漫播放 |
| **[Jibi](./jibi.cc)** | Online Stream | v1.0.0 | 叽哔动漫在线播放 |
| **[FQDM (番茄动漫)](./fqdm)** | Online Stream | v1.0.0 | 番茄动漫在线播放，5条线路自动最佳匹配 |
| **[DMLAC (风车动漫)](./dmlac)** | Online Stream | v1.0.0 | 风车动漫在线播放 |

---

## 安装方式

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

# VTT6
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/vtt6/manifest.json

# Jibi - 叽哔动漫
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/jibi.cc/manifest.json

# FQDM - 番茄动漫
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/fqdm/manifest.json

# DMLAC - 风车动漫
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/dmlac/manifest.json

# FZDM - 风之动漫
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/dongmanzj/manifest.json
```

也可手动下载对应目录的 `manifest.json` + `provider.js` 放入 Seanime `extensions/` 目录后重载。

---

## 扩展详情

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

### AniBT (番组字幕发布)

通过 AniBT 公开 API 搜索番剧磁力链接，无需 API Key，支持流式播放。

- 中文 / 英文 / 日文 / Romaji 标题搜索
- Bangumi ID 直查
- 集数 / 分辨率 / Batch 智能过滤（Auto Select）
- 本季最新发布浏览
- 多字幕组结果聚合

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

### VTT6

来自 VTT6 的在线动漫播放源，支持中文搜索。

- 4 条播放线路（高清 / ikun / 非凡 / 量子）
- m3u8 流式播放

### Jibi (叽哔动漫)

叽哔动漫在线观看，基于 Apple CMS。

- 自动适配每个动漫的可用播放源数量
- 多线路自动选择最佳源
- m3u8 流式播放

### FQDM (番茄动漫)

番茄动漫在线观看，5 条播放线路自动匹配最佳源。

- 5 条线路（新浪资源2 / 番茄2线 / 番茄1线 / 速播资源1 / 无尽③）
- 自动选择集数最多的线路作为默认
- m3u8 流式播放

### DMLAC (风车动漫)

风车动漫在线观看。

- 简洁界面，直接播放
- m3u8 流式播放

---

## 许可

[MIT](LICENSE) © Elisoar
