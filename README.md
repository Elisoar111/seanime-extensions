# seanime-extensions

[![GitHub stars](https://img.shields.io/github/stars/Elisoar111/seanime-extensions)](https://github.com/Elisoar111/seanime-extensions/stargazers)
[![GitHub license](https://img.shields.io/github/license/Elisoar111/seanime-extensions)](https://github.com/Elisoar111/seanime-extensions/blob/main/LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-56.7%25-yellow)](https://github.com/Elisoar111/seanime-extensions/search?l=javascript)
[![TypeScript](https://img.shields.io/badge/TypeScript-43.3%25-blue)](https://github.com/Elisoar111/seanime-extensions/search?l=typescript)

**Seanime 扩展集合** —— 为 [Seanime](https://seanime.app) 提供漫画源、动画种子源和功能插件。

---

## 📦 扩展列表

| 扩展 | 类型 | 说明 |
|------|------|------|
| **[Bangumi 番组计划](./Bangumi)** | 插件 (Plugin) | 在 Seanime 侧栏查看 Bangumi 完整元数据，支持评分、角色、章节、关联条目及收藏管理 |
| **[Anime Garden](./Anime-Garden)** | 动画种子源 (anime-torrent-provider) | 提供实时精准的中文字幕番剧种子 |
| **[Mikan Project](./mikan-project)** | 动画种子源 (anime-torrent-provider) | 蜜柑计划 —— 实时精准的中文字幕番剧种子 |
| **[60ti 漫画](./60ti)** | 漫画源 (manga-provider) | 60ti 中文漫画源 |
| **[包子漫画 (baozimh)](./baozimh)** | 漫画源 (manga-provider) | 包子漫画中文源 |

---

## 🚀 安装

### 方式一：从 GitHub 安装（推荐）

1. 打开 Seanime → **Extensions**
2. 点击右上角 **+** → **Install from URL**
3. 粘贴对应扩展的 manifest 链接：

```bash
# Bangumi 番组计划
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/Bangumi/manifest.json

# Anime Garden
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/Anime-Garden/manifest.json

# Mikan Project
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/mikan-project/manifest.json

# 60ti 漫画
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/60ti/manifest.json

# 包子漫画
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/baozimh/manifest.json

方式二：手动安装
下载扩展目录中的 manifest.json 和 provider.js / provider.ts 文件

放入 Seanime/extensions/ 目录

打开 Seanime → Extensions → 点击 重载 (Reload)

📖 各扩展详情
Bangumi 番组计划
在 Seanime 侧栏查看 Bangumi 番组计划 的完整元数据。

功能特性：

自动匹配 — 日文优先搜索，多标题候选 + 年份加成

评分系统 — Bangumi 分数 + 排名 + 分布图，与 AniList 分数对比

完整信息 — 中/日标题、播出日期、剧集数、平台、标签、简介、信息框

角色列表 — 最多 2 名声优，点击图片可放大

章节列表 — 完整章节表格，自动计算下一集播出时间

关联条目 — 续作/前传/外传卡片，支持跳转

收藏管理 — 设置想看/在看/看过/搁置/抛弃，± 剧集进度（需 Access Token）

Token 验证 — Token 无效或过期时 UI 提示

容灾机制 — 多端点自动切换，429 退避重试，自动追加镜像

本地缓存 — 3 天缓存，减少重复请求

配置说明：

配置项	说明
Access Token	Bangumi 个人令牌（可选），用于收藏管理。创建地址：https://next.bgm.tv/demo/access-token
API 端点	默认 https://api.bgm.tv，国内用户可添加镜像 https://api.bangumi.lol
自动匹配	关闭后需手动搜索或按 ID 绑定
加载角色/章节/关联	开关对应数据板块，关闭可减少请求
Anime Garden
动画种子源扩展，通过 Anime Garden API 提供实时精准的中文字幕番剧种子。

配置：可自定义 API 地址，默认 https://api.animes.garden，遇访问问题时替换为镜像地址。

Mikan Project（蜜柑计划）
动画种子源扩展，通过蜜柑计划提供实时精准的中文字幕番剧种子。

配置：可自定义蜜柑站点地址，默认 https://mikanime.tv，站点无法访问时替换镜像域名。

60ti 漫画
中文漫画源扩展。

配置：可自定义站点地址，默认 https://www.60ti.com，失效时可更换镜像。

包子漫画 (baozimh)
中文漫画源扩展。

配置：可自定义站点地址，默认 https://cn.bzmanga.com，失效时可更换镜像。

🛠️ 开发
扩展结构
每个扩展包含以下文件：

text
扩展名称/
├── manifest.json    # 扩展清单（必选）
├── provider.js      # 提供者逻辑（JavaScript）
├── provider.ts      # 提供者逻辑（TypeScript）
└── Cover.png        # 封面图标（可选）
Manifest 字段说明
json
{
  "id": "扩展唯一标识",
  "name": "扩展显示名称",
  "version": "版本号",
  "author": "作者",
  "type": "扩展类型（plugin / anime-torrent-provider / manga-provider）",
  "language": "javascript 或 typescript",
  "lang": "zh",
  "description": "扩展描述",
  "payloadURI": "provider 脚本的 raw 链接",
  "manifestURI": "manifest.json 的 raw 链接",
  "userConfig": {
    "fields": []  // 用户可配置的字段
  }
}
📄 许可证
MIT

🙏 致谢
Seanime — 强大的动漫管理桌面应用

Bangumi 番组计划 — 动漫数据库

Anime Garden — 番剧种子聚合

Mikan Project — 蜜柑计划

🤝 贡献
欢迎提交 Issue 和 Pull Request！

Fork 本仓库

创建你的功能分支 (git checkout -b feature/amazing-feature)

提交你的更改 (git commit -m 'Add some amazing feature')

推送到分支 (git push origin feature/amazing-feature)

打开 Pull Request
