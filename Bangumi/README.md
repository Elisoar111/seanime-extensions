# Bangumi 番组计划 — Seanime 插件

在 [Seanime](https://seanime.app) 侧栏查看 [Bangumi 番组计划](https://bgm.tv) 的完整元数据，支持收藏管理与观看进度同步。

---

## 功能

### 条目展示
- **自动匹配** — 日文优先，多标题候选 + 年份加权
- **评分系统** — 评分 + Rank + 分布图，与 AniList 评分对比，评分人数千分位
- **条目信息** — 中/日文标题、播出日期、话数、平台、标签、简介、Infobox
- **角色列表** — 网格卡片，点击图片放大，hover 显示声优
- **章节列表** — 表格分页，已看集数绿色标记
- **关联条目** — 关系卡片，可绑定

### 日志与讨论
- **条目日志** — 读取条目的评论日志，显示完整内容，复制链接
- **条目讨论** — 独立标签展示讨论话题，复制链接到浏览器查看

### 每日放送
- 按星期筛选本周放送番剧

### 收藏管理
- 状态设置：想看 / 看过 / 在看 / 搁置 / 抛弃
- 观看进度：+/- 按钮 + 手动输入 + Enter 提交 + 进度条
- 评分：1-10 评分按钮，点击已评分可取消

### 交互
- 顶栏：品牌标签、ID 徽章（点击复制 ID）、已绑定状态、端点信息
- 复制 Bangumi 链接、复制 ID、复制日志链接
- 手动匹配面板位于顶栏下方，绑定后自动关闭
- 所有外部链接复制到剪贴板，提示到浏览器查看
- 加载失败显示重试按钮

### 底层
- 多端点故障转移，429 退避重试
- 3 天本地缓存

---

## 安装

### 方式一：从 GitHub 安装

```
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/Bangumi/manifest.json
```

在 Seanime → Extensions → 右上角 + → **Install from URL** 粘贴。

### 方式二：手动安装

下载 `bangumi.plugin.js` + `manifest.json` 放入 Seanime `extensions/` 目录后重载。

---

## 配置

| 设置 | 说明 |
|------|------|
| **Access Token** | 可选，用于管理收藏。创建：`https://next.bgm.tv/demo/access-token` |
| **API 端点** | 默认 `https://api.bgm.tv`，国内可加镜像 `https://api.bangumi.lol` |
| **自动匹配** | 关闭后需手动搜索/ID 绑定 |
| **加载角色/章节/关联** | 开关对应数据板块 |

---

## 常见问题

**无法连接？** — 添加镜像端点 `https://api.bangumi.lol`

**Token 无效（401）？** — 到 `https://next.bgm.tv/demo/access-token` 重新创建

**绑定后没更新？** — 点「刷新」按钮

---
