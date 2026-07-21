# Bangumi UI for Seanime

在番剧详情页展示 Bangumi 元数据卡片。

## 功能

- 🎴 详情页注入 Bangumi 信息卡片
- 📋 中文标题一键复制
- ⚖️ AniList vs Bangumi 评分对比
- 📊 收藏统计（想看/在看/看过）
- 🏷️ Bangumi 中文标签
- 📝 中文简介
- 🔍 手动搜索匹配
- 💾 24小时缓存

## 安装

### 方法一：通过 URL 安装（推荐）

1. 打开 Seanime → **Extensions** → **Development**
2. 点击 **Install from URL**
3. 粘贴以下链接：

\`\`\`
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/Bangumi/bangumi-ui.json
\`\`\`

4. 点击安装，授权 `api.bgm.tv` 和 `bgm.tv` 的网络权限

### 方法二：手动安装

1. 下载 `bangumi-ui.json` 到 Seanime 数据目录的 `extensions` 文件夹
2. 重启 Seanime

## 使用

1. 打开任意番剧详情页
2. 自动匹配 Bangumi 数据并显示卡片
3. 点击中文标题输入框 → Ctrl+C 复制
4. 匹配失败时，点击 Tray 图标 → 重新匹配 → 手动搜索

## 设置

在代码 `settings.define` 中可配置：
- `accessToken`: Bangumi Access Token（用于 NSFW 内容）
- `showSummary`: 显示简介
- `showTags`: 显示标签
- `showScoreCompare`: 显示评分对比
- `autoMatch`: 自动匹配开关

## License

MIT
