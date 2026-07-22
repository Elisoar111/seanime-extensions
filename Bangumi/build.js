// build.js — 编译 TS、内嵌代码到 manifest、部署到 Seanime extensions
// 用法: node build.js
const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const SRC_DIR = __dirname
const EXT_DIR = "C:/Users/44516/AppData/Roaming/Seanime/extensions"
const TS_FILE = path.join(SRC_DIR, "bangumi.plugin.ts")
const JS_FILE = path.join(SRC_DIR, "bangumi.plugin.js")
const MANIFEST_NAME = "bangumi-ui.json"

// 1. 编译 TypeScript
console.log("[1/3] 编译 TypeScript...")
execSync("npx tsc", { cwd: SRC_DIR, stdio: "inherit" })

// 2. 读取编译产物，内嵌为 payload
console.log("[2/3] 生成 manifest（内嵌 payload）...")
const code = fs.readFileSync(JS_FILE, "utf8")
if (code.length < 1000) {
    console.error("编译产物异常小，可能编译失败")
    process.exit(1)
}

const manifest = {
    id: "bangumi-ui",
    name: "Bangumi 番组计划",
    version: "3.0.0",
    manifestURI: "",
    language: "typescript",
    type: "plugin",
    description: "Bangumi 番组计划信息页（侧栏入口）：评分、Rank、评分分布、标签、制作信息、角色、章节、关联条目、个人收藏状态。支持多端点故障转移与手动绑定。",
    author: "local",
    icon: "",
    website: "https://bgm.tv",
    readme: "",
    notes: "",
    lang: "multi",
    payload: code,
    plugin: {
        version: "1",
        permissions: {
            scopes: ["storage"],
            allow: {
                networkAccess: {
                    allowedDomains: ["api.bgm.tv", "bgm.tv", "*.bgm.tv", "api.bangumi.lol", "bangumi.lol", "*.bangumi.lol"],
                    reasoning: "需要访问 Bangumi API 获取番剧评分与元数据；如配置镜像端点，请将对应域名加入此列表"
                }
            }
        }
    },
    userConfig: {
        version: 1,
        requiresConfig: false,
        fields: [
            {
                type: "text",
                name: "accessToken",
                label: "Bangumi Access Token（可选，bgm.tv → 设置 → 开发者 创建；填了显示我的收藏状态）",
                default: ""
            },
            {
                type: "text",
                name: "apiEndpoints",
                label: "API 端点（英文逗号分隔多个；若无法访问可改用镜像 https://api.bangumi.lol）",
                default: "https://api.bgm.tv"
            },
            {
                type: "switch",
                name: "autoMatch",
                label: "自动匹配 Bangumi 条目",
                default: "true"
            },
            {
                type: "switch",
                name: "loadCharacters",
                label: "加载角色列表",
                default: "true"
            },
            {
                type: "switch",
                name: "loadEpisodes",
                label: "加载章节列表",
                default: "true"
            },
            {
                type: "switch",
                name: "loadRelations",
                label: "加载关联条目",
                default: "true"
            }
        ]
    },
    isDevelopment: true
}

const json = JSON.stringify(manifest, null, 2)
fs.writeFileSync(path.join(SRC_DIR, MANIFEST_NAME), json)

// 3. 部署到 extensions 目录
console.log("[3/3] 部署到 extensions...")
fs.copyFileSync(
    path.join(SRC_DIR, MANIFEST_NAME),
    path.join(EXT_DIR, MANIFEST_NAME)
)

console.log("完成! payload 大小: " + (code.length / 1024).toFixed(1) + " KB")
console.log("现在去 Seanime → Extensions → 重载 bangumi-ui")
