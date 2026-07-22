# CLAUDE.md — lxmusic 插件工作指南

Songloft 宿主的 JS 插件,把「洛雪音乐(lx-music)」生态第三方音源接入 Songloft。TS 编写,`@songloft/plugin-builder` 打包成 `dist/lxmusic.jsplugin.zip`,跑在宿主 **QuickJS 沙箱**里。

## 命令

```bash
npm install
npm run build      # esbuild bundle → jsc 字节码 → dist/lxmusic.jsplugin.zip；打印 entryHash/zipHash
npm run validate   # 校验 plugin.json 的 entryHash/zipHash
npm run dev        # 监听 + 自动上传本地 Songloft
```

**构建后必做**:build 打印的 `entryHash`/`zipHash` 要**手动回写到根 `plugin.json`**(builder 只写进 zip 内的 plugin.json,validate 读根),否则 validate 失败。改动源码/静态后重跑 build 再回写。

## 架构:双机制(彼此独立)

- **机制 A — `src/musicSdk/`(元数据)**:五平台 kw/kg/tx/wy/mg 的搜索/歌词/歌单/榜单。移植自 lxserver `src/modules/utils/musicSdk/`。**只做元数据,永不解析播放直链**。
- **机制 B — `src/engine/`(播放直链)**:用户导入的 lx-music 自定义源 `.js` 在 `songloft.jsenv` 子 VM 里跑,解析真实 CDN URL。多源并行竞速。

facade(`src/musicSdk/facade.ts`)是机制 A 入口;`RuntimeManager`(`src/engine/manager.ts`)是机制 B 入口。两者在 `src/main.ts` onInit 组装,经 `src/handlers/` 路由对外。

## 目录

```
src/
  polyfills.ts        # ★必须 main.ts 第一个 import(navigator/window 等)
  main.ts             # onInit/onDeinit/onHTTPRequest(兜底永返合法响应)
  globals.d.ts        # 宿主注入类型(__go_send/SDK 类型全局别名/Buffer)
  engine/             # 机制 B：lx_prelude / runtime(SourceRuntime) / manager(RuntimeManager)
  source/             # 音源导入/持久化：parser(JSDoc 元数据) / storage / manager
  musicSdk/           # 机制 A：facade + 适配层 + kw/kg/tx/wy/mg(移植的 .js)
    request.ts        # needle→fetch,保 httpFetch 签名 + kw bHh 签名
    shared.ts utils.ts message.ts options.ts api-source.ts  # 平台依赖的共享层
    wy/utils/crypto.ts  kw/aes.ts kw/util.ts kg/lyricUtils_kg.ts  # 重写的加密/解码
  handlers/           # 路由 + SDK 契约工厂(createSearchHandler/createMusicUrlHandler)
  utils/              # zip(手写解析) / multipart / encoding(latin1↔utf8) / http
static/               # 内置前端(index.html + css/ + js/)
```

## 沙箱铁律

- 只有 `fetch`(真异步)/`setTimeout`/`Buffer`/`crypto`/`zlib` + `songloft.*` 桥接。无 Node API、无 require、无 iconv。
- **所有 `songloft.*` 返回 Promise,必须 await**。
- 子 VM(jsenv)无 timer goroutine:`setTimeout`/`Promise` 仅在 `executeWait` polling loop 内被驱动。
- 宿主 `crypto`:md5/sha1/aesEncrypt/aesDecrypt(cbc/ecb+PKCS7)/rsaEncrypt(仅 PKCS1v15)/randomBytes。`Buffer` 编码仅 utf8/base64/hex/latin1。

## 关键踩坑(改代码前必读)

1. **加载期崩溃**:任何在**模块顶层**引用浏览器/Node 全局(`navigator`/`window`/`document`)的移植/混淆脚本会让整包加载失败 → 启动失败。已在 `polyfills.ts` 补齐,**它必须是 main.ts 第一个 import**(esbuild 按源顺序 DFS eval,须早于 facade 子树)。新增音源平台若引入类似依赖,先扩 polyfills。
2. **crypto-js 不能打包**:builder(esbuild + no-node-builtins)静态拒绝 `require('crypto')`,即使 runtime guard。用宿主 crypto 或纯 TS 实现。
3. **宿主 AES 的 key 语义**:`crypto.aesEncrypt(str,...)` 按 **utf8** 取字节 → ascii key(wy)可用;**二进制 key**(kw wbd,含非 ASCII 字节)会被 utf8 破坏 → 用 `kw/aes.ts` 纯 TS AES-128-ECB。
4. **textbook RSA**:宿主只有 PKCS1v15。wy weapi 的 NO_PADDING → `wy/utils/crypto.ts` 里 BigInt modpow + 硬编码网易模数。
5. **gb18030 不可用**:kw 歌词改走 UTF-8 JSON 端点 `m.kuwo.cn/newh5/singles/songinfoandlrc`,绕 GBK。
6. **平台 getLyric 返回 requestObj**(`{promise,cancelHttp}`)非 Promise → facade 已归一 await `.promise`。
7. **onHTTPRequest 必须 try/catch 永返合法 HTTPResponse**(返回 undefined 会被上游退化成 200 空 body,调用方报 "unexpected end of JSON input")。
8. **前端契约**:API 用 `SongloftPlugin.apiGet/apiPost/apiPut/apiDelete`(自动带 JWT,勿用裸 fetch);静态引用带 `static/` 前缀;上传走 base64 JSON(apiPost 无 multipart);主题用 `SongloftPlugin.getTheme/onThemeChange`。

## 移植新平台/更新平台的手法

1. 从 lxserver `src/modules/utils/musicSdk/<plat>/` copy `.js`,脚本重写 import 深度:`../../request`→`../request`、`../../index`→`../shared`、`../../message`→`../message`(减一层 `../`,`index`→`shared`);`../options`/`../utils` 不变。
2. `getMusicUrl`→`api-source` 那条链**删桩**(直链走机制 B);`api-source.ts` 的 `apis()` 抛错占位。
3. node crypto/crypto-js/iconv/zlib 依赖逐个换宿主 polyfill 或纯 JS。
4. 平台顶层若碰浏览器全局 → 扩 `polyfills.ts`。
5. 在 `facade.ts` 用 `realPlatform(id,name,mod)` 接线。

## 本地测试(无宿主时)

- **tsc + build**:`npx tsc --noEmit`、`npm run build`。
- **真 QuickJS 复现**(抓 node 抓不到的沙箱错):
  ```
  npm i --no-save quickjs-emscripten
  npx esbuild src/main.ts --bundle --format=iife --platform=neutral --outfile=/tmp/iife.js
  # 在 quickjs-emscripten VM 里 stub 宿主全局(songloft/crypto/Buffer/fetch/__go_*),
  # evalCode(bundle) 加载 + 调 globalThis.onInit()。
  ```
  dispose 时 `list_empty gc_obj_list` 断言是测试脚本未释放句柄的噪声,非插件问题。

## 参考

lxserver 源码在 `./lxserver/`(移植蓝本,勿改)。SDK 契约见 `node_modules/@songloft/plugin-sdk/dist/index.d.ts`。
