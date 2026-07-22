// 必须最先 eval：部分移植/混淆脚本在模块加载期引用浏览器/Node 全局
// （如 kg vendors/infSign.min.js 顶层 `navigator.userAgent.match(...)`）。
// QuickJS 无这些全局 → ReferenceError → 整包加载失败 → 插件启动失败。
// 在此补齐无害占位，务必作为 main.ts 的第一个 import。

const g = globalThis as any;
if (typeof g.window === 'undefined') g.window = g;
if (typeof g.self === 'undefined') g.self = g;
if (typeof g.global === 'undefined') g.global = g;
if (typeof g.navigator === 'undefined') g.navigator = { userAgent: 'lx-music', platform: '', language: 'zh-CN' };
if (typeof g.document === 'undefined') g.document = { cookie: '', createElement: () => ({}), getElementsByTagName: () => [] };
if (typeof g.location === 'undefined') g.location = { href: '', protocol: 'https:', host: '' };

export {};
