# Bangumi UI — Seanime 插件 / Plugin

在 [Seanime](https://seanime.app) 侧栏查看 [Bangumi 番组计划](https://bgm.tv) 的完整元数据，支持收藏管理与观看进度同步。

View full [Bangumi](https://bgm.tv) metadata — ratings, characters, episodes, relations, and more — from the Seanime sidebar. Manage your Bangumi collection and watch progress.

---

## 功能 / Features

- **Matching** — Auto-search Bangumi entries (Japanese-first, multi-title candidates with year bonus)
- **Ratings** — Bangumi score + rank + distribution chart, compared with AniList score
- **Info** — Chinese/Japanese titles, air date, episodes, platform, tags, summary, infobox
- **Characters** — Character list with up to 2 voice actors; click image to zoom
- **Episodes** — Full episode table; auto-calculates next airing episode
- **Relations** — Sequel/prequel/spin-off cards with bind and open links
- **Collection Management** — Set wish/watching/watched/on-hold/dropped; +/- episode progress (requires Access Token)
- **Token Validation** — UI warning when token is invalid or expired
- **Failover** — Multi-endpoint auto-switch; 429 backoff retry; mirror appended automatically
- **Cache** — 3-day local cache to reduce redundant requests

---

## 安装 / Installation

### 方式一：从 GitHub 安装 / Install from GitHub (Recommended)

复制以下链接，在 Seanime → Extensions → 右上角 + → **Install from URL** 粘贴 / Copy the manifest URL and paste in Seanime → Extensions → Install from URL:

```
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/Bangumi/manifest.json
```

### 方式二：手动安装 / Manual Install

下载 [`bangumi-ui.json`](bangumi-ui.json) → 放入 `Seanime/extensions/` 目录 → 打开 Seanime → Extensions → 点 **重载** (Reload)。

---

## 使用 / Usage

1. 打开任意番剧条目页，插件自动匹配 Bangumi 条目 / Open any anime entry page; the plugin auto-matches the Bangumi subject
2. 点击左侧栏 **Bangumi** 图标进入详情页 / Click the **Bangumi** sidebar icon to view details
3. 顶部按钮：刷新、复制链接、在 Bangumi 打开、手动匹配、清除缓存 / Top bar: Refresh, Copy Link, Open in Bangumi, Manual Match, Clear Cache

---

## 配置 / Configuration

在 Seanime → Extensions → bangumi-ui 设置 / Configure in Seanime → Extensions → bangumi-ui:

| 设置项 / Setting | 说明 / Description |
|--------|------|
| **Access Token** | Bangumi 个人令牌（可选）。创建地址：`https://next.bgm.tv/demo/access-token`（需在新站登录）。用于查看/管理我的收藏状态 / Personal access token (optional). Create at `https://next.bgm.tv/demo/access-token`. Required for collection management |
| **API 端点 / Endpoints** | 默认官方 API `https://api.bgm.tv`，国内用户可添加镜像 / Default is the official API. Users in China can add mirror: `https://api.bangumi.lol` (comma-separated). Mirror is auto-appended when using defaults |
| **自动匹配 / Auto Match** | 关闭后需手动搜索/搜索 ID 绑定 / Disable to search or bind by ID manually |
| **加载角色/章节/关联 / Characters / Episodes / Relations** | 开关对应数据板块，关闭可减少请求 / Toggle sections on/off to reduce requests |

### 配置示例 / Examples

```
# 仅官方 / Official only
https://api.bgm.tv

# 官方 + 镜像 / Official + mirror (same as default)
https://api.bgm.tv,https://api.bangumi.lol

# 仅镜像 / Mirror only
https://api.bangumi.lol
```

---

## 常见问题 / FAQ

**搜索失败/无法连接？ / Search fails / Can't connect?**  
检查 API 端点设置。如果官方 API 被屏蔽，请添加镜像 `https://api.bangumi.lol` / Check the endpoint configuration. If the official API is blocked, add the mirror.

**Token 无效（401）？ / Token invalid (401)?**  
Access Token 有有效期，过期后需到 `https://next.bgm.tv/demo/access-token` 重新创建 / Access tokens expire. Recreate one at the token management page.

**手动匹配后提示"已绑定"但页面没变化？ / Bound but page didn't update?**  
点「刷新」按钮 / Click the **Refresh** button.

---

## 开发 / Development

```bash
cd Bangumi
npm install
node build.js
```

编译产物 / Build output: `bangumi.plugin.js` (payload), `bangumi-ui.json` (manifest).
