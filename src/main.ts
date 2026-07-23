/// <reference types="@songloft/plugin-sdk" />
import './polyfills'; // 必须最先 import：补齐 navigator/window 等，避免移植脚本加载期崩溃
import { createRouter, jsonResponse } from '@songloft/plugin-sdk';
import type { Router } from '@songloft/plugin-sdk';
import { RuntimeManager } from './engine';
import { SourceManager } from './source';
import { facade } from './musicSdk/facade';
import { registerRoutes } from './handlers';
import type { AppContext } from './handlers';

let router: Router | null = null;
let ctx: AppContext | null = null;

async function onInit(): Promise<void> {
  songloft.log.info('lxmusic initializing...');

  const runtimes = new RuntimeManager();
  const sources = new SourceManager(runtimes);
  ctx = { runtimes, sources, musicSdk: facade };

  router = createRouter();
  registerRoutes(router, ctx);

  // 加载持久化音源索引，再后台加载已启用音源（不阻塞 onInit 太久）
  await sources.init();
  sources.loadEnabled().catch((e) => {
    songloft.log.error('loadEnabled failed: ' + String(e?.message || e));
  });

  songloft.log.info('lxmusic ready. platforms=' + facade.sources.map((s) => s.id).join(','));

  registerToMiot();
}

function registerToMiot(): void {
  let attempts = 0;
  const tryRegister = async () => {
    attempts++;
    try {
      if (!songloft.comm || typeof songloft.comm.call !== 'function') return;
      await songloft.comm.call('miot', 'register-search-provider', {
        name: '洛雪音源',
        searchPath: '/api/search/topone',
      });
      songloft.log.info('registered as miot search provider');
    } catch (e) {
      if (attempts < 5) setTimeout(tryRegister, 3000);
    }
  };
  setTimeout(tryRegister, 2000);
}

async function onDeinit(): Promise<void> {
  songloft.log.info('lxmusic deinitializing...');
  if (ctx) {
    await ctx.runtimes.destroyAll().catch(() => {});
  }
  router = null;
  ctx = null;
}

async function onHTTPRequest(req: HTTPRequest): Promise<HTTPResponse> {
  // 踩坑 1：必须 try/catch 且永远返回合法 HTTPResponse。
  try {
    if (!router) {
      return jsonResponse({ code: 503, msg: 'plugin not initialized', data: null }, 503);
    }
    const res = await router.handle(req);
    if (!res) {
      return jsonResponse({ code: 404, msg: 'not found', data: null }, 404);
    }
    return res;
  } catch (e) {
    songloft.log.error('onHTTPRequest error: ' + String((e as Error)?.message || e));
    return jsonResponse({ code: 500, msg: String((e as Error)?.message || e), data: null }, 500);
  }
}

// 暴露为全局（QuickJS 需要显式声明）
globalThis.onInit = onInit;
globalThis.onDeinit = onDeinit;
globalThis.onHTTPRequest = onHTTPRequest;
