# lxmusic — Songloft 洛雪音源插件

把「洛雪音乐（lx-music）」生态的第三方音源接入自托管音乐服务器 **Songloft**：提供多平台搜索/歌单/排行榜元数据，并用用户导入的自定义源脚本把远程歌曲解析成可播放的 CDN URL 导入音乐库。

## 双机制架构

- **机制 A — 内置 musicSdk（元数据）**：五平台 `kw/kg/tx/wy/mg` 的搜索、歌词、歌单、排行榜逻辑内置于源码树（移植自 lxserver），仅访问各平台**公开接口**。永不解析播放直链。
- **机制 B — lxmusic 引擎（播放直链）**：用户导入的 lx-music 自定义源 `.js` 脚本在**独立子 QuickJS VM**（`songloft.jsenv`）内运行，插件调用它把歌曲解析成真实 CDN URL。多源并行竞速，按成功率排序。

> 未导入任何音源时，搜索/歌单可正常用，但歌曲**无法播放**。

## 构建

```bash
npm install
npm run build      # 产出 dist/lxmusic.jsplugin.zip
npm run validate   # 校验 plugin.json 与哈希
npm run dev        # 监听源码，自动构建并上传到本地 Songloft 实例
```

## 主要 HTTP 路由

前缀 `/api/v1/jsplugin/lxmusic/`。

| 端点 | 说明 |
|------|------|
| `POST /api/search` | 主程序契约：跨平台聚合搜索，返回 `{results}` |
| `POST /api/music/url` | 主程序契约：解析播放直链，返回 `{url, headers?}` |
| `POST /api/songs/import` | 批量导入选中歌曲到音乐库 |
| `GET /api/sources` | 音源列表 + 批量加载进度 |
| `POST /api/sources/import` | 导入脚本（multipart，.js/.zip） |
| `POST /api/sources/import-url` | 从 URL 导入脚本 |
| `DELETE /api/sources?id=` / `PUT /api/sources/toggle` | 删除 / 启停 |
| `GET /api/songlist/:action` · `GET /api/leaderboard/:action` | 歌单 / 榜单浏览 |
| `POST /api/direct/music/url` · `GET /api/direct/lyric` | 直链 / 歌词 |
| `POST /api/search/topone` | 搜索 + 匹配 + 解析，返回最佳可播放项 |

内置前端（`static/`）提供搜索、导入、音源管理三个 Tab，跟随宿主主题。

## 实现进度

- ✅ 机制 B：jsenv 引擎（SourceRuntime / RuntimeManager 并行竞速 / SourceManager 导入持久化）
- ✅ 机制 A：五平台 musicSdk 移植（kw/kg/tx/wy/mg 搜索+歌词+歌单+榜单）
  - 适配层 `request.ts`（needle→fetch，保 httpFetch 签名 + kw bHh 反盗链签名）
  - crypto：wy weapi/eapi/linuxapi 用宿主 AES + BigInt textbook RSA；kw wbdCrypto 用纯 TS AES-128-ECB
  - kg krc 歌词：base64→XOR→宿主 zlib inflate
  - kw 歌词改走 UTF-8 JSON 端点（QuickJS 无 iconv/gb18030）
- ✅ 主程序集成契约端点、音源管理、ZIP/multipart 解析
- ✅ 内置前端（`SongloftPlugin.apiGet/apiPost/...` 鉴权、`getTheme` 跟随主题、FileReader→base64 上传）

> 状态：安装启动正常、UI 与五平台元数据可用，**播放解析链路测试中**。

### 内置前端约定（重要）
- API 走宿主注入的全局 **`SongloftPlugin.apiGet/apiPost/apiPut/apiDelete`**（自动带 JWT）；**勿用裸 fetch**（会 401「缺少认证信息」）。
- 静态引用 CSS/JS 均带 `static/` 前缀（打包器只对 JS bundle 自动补前缀，CSS `<link>` 不补）。
- 文件上传：`apiPost` 只收 JSON → 前端读 base64，POST `{files:[{filename,base64}]}`；后端 `importSources` 有 JSON 分支。

### 沙箱适配注意
- 启动期全局 polyfill（`src/polyfills.ts`，须 `main.ts` 第一个 import）：补 `navigator/window/self/global/document`，否则 kg `infSign.min.js` 顶层 `navigator.userAgent` → 加载崩溃。
- kw/kg/wy 加密/解码为宿主 polyfill + 纯 JS，各平台 search/lyric **需实测**（尤其 wy weapi RSA、kw wbd AES、kg krc）。
- `/api/songlist/*`、`/api/leaderboard/*` HTTP 浏览端点当前为通用转发，方法名对齐可后续细化。
- 本地复现 QuickJS：`quickjs-emscripten` + esbuild IIFE bundle，evalCode 加载 + 调 onInit（详见 CLAUDE.md）。

## 合规免责声明

音源脚本与其数据均为第三方版权内容，**本插件不附带任何音源**，内置 musicSdk 仅访问各平台公开搜索/歌词接口。本项目仅供个人学习研究、**禁止商用**，用户须自行清除使用过程中产生的版权数据。
