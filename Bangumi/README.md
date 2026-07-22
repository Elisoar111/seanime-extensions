# Bangumi UI — Seanime 插件

在 [Seanime](https://seanime.app) 侧栏查看 [Bangumi 番组计划](https://bgm.tv) 的完整元数据，支持收藏管理与观看进度同步。

## 功能

- **匹配**：自动搜索 Bangumi 条目（日语优先，支持多标题候选 + 年份加成）
- **评分**：Bangumi 评分 + 排名 + 评分分布图，对比 AniList 评分
- **信息**：中文/日文标题、放送日期、话数、平台、标签、简介、维基信息
- **角色**：角色列表 + 声优（最多 2 位），点击角色图片放大
- **章节**：完整章节表，自动计算下一话（今天播出/下一话）
- **关联条目**：续集/前传/番外关联卡片，支持绑定及跳转
- **收藏管理**：设置想看/在看/看过/搁置/抛弃，+/- 集数进度（需 Access Token）
- **Token 检测**：Token 无效或过期时 UI 直接警告
- **故障转移**：多端点自动切换，429 限流退避重试，默认自动追加公共镜像
- **缓存**：3 天本地缓存，减少重复请求

## 安装

### 方式一：从 GitHub 安装（推荐）

复制 manifest 链接，在 Seanime → Extensions → 右上角 + → **Install from URL** 粘贴：

```
https://raw.githubusercontent.com/Elisoar111/seanime-extensions/master/Bangumi/manifest.json
```

### 方式二：手动安装

下载 [`bangumi-ui.json`](bangumi-ui.json) → 放入 `Seanime/extensions/` 目录 → 打开 Seanime → Extensions → 点 **重载**。

## 使用

1. 打开任意番剧条目页，插件自动匹配 Bangumi 条目
2. 点击左侧栏 **Bangumi** 图标进入详情页
3. 顶部按钮：刷新、复制链接、在 Bangumi 打开、手动匹配、清除缓存

## 配置

在 Seanime → Extensions → bangumi-ui 设置：

| 设置项 | 说明 |
|--------|------|
| **Access Token** | Bangumi 个人令牌（可选）。创建地址：`https://next.bgm.tv/demo/access-token`（需在新站登录）。用于查看/管理我的收藏状态 |
| **API 端点** | 默认官方 API `https://api.bgm.tv`，国内用户可在后面添加镜像 `https://api.bangumi.lol`（英文逗号分隔）。不修改则默认自动追加镜像兜底 |
| **自动匹配** | 关闭后需手动搜索/输入 ID 绑定 |
| **加载角色/章节/关联** | 开关对应数据板块，关闭可减少请求 |

### 配置示例

```
# 仅官方
https://api.bgm.tv

# 官方 + 镜像（默认效果等同）
https://api.bgm.tv,https://api.bangumi.lol

# 自定义镜像
https://api.bangumi.lol
```

## 常见问题

**搜索失败/无法连接？**  
检查插件设置中 API 端点是否可以访问。如果官方 API 被屏蔽，请添加镜像 `https://api.bangumi.lol`。

**Token 无效（401）？**  
Access Token 有有效期，过期后需到 `https://next.bgm.tv/demo/access-token` 重新创建。

**手动匹配后提示"已绑定"但页面没变化？** 点「刷新」按钮。

## 开发

```bash
cd Bangumi
npm install
node build.js
```

编译产物：`bangumi.plugin.js`（payload）、`bangumi-ui.json`（manifest）。
