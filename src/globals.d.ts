/// <reference types="@songloft/plugin-sdk" />

// plugin-sdk 的 HTTPRequest/HTTPResponse/jsenv 等类型是「模块内」声明（文件末尾有
// export），并非全局。宿主运行时把 onInit/onHTTPRequest 当全局函数调用，插件业务
// 代码又到处用这些类型，故在此把常用类型提升为全局别名，并补 Buffer 声明。

interface BufferLike {
  toString(encoding?: string): string;
  length: number;
  [index: number]: number;
}

declare global {
  // ——— SDK 模块类型 → 全局别名 ———
  type HTTPRequest = import('@songloft/plugin-sdk').HTTPRequest;
  type HTTPResponse = import('@songloft/plugin-sdk').HTTPResponse;
  type SongloftJSEnvEvent = import('@songloft/plugin-sdk').SongloftJSEnvEvent;
  type SongloftJSEnvCall = import('@songloft/plugin-sdk').SongloftJSEnvCall;
  type SongloftJSEnvResult = import('@songloft/plugin-sdk').SongloftJSEnvResult;
  type SongloftJSEnvParallelResult = import('@songloft/plugin-sdk').SongloftJSEnvParallelResult;

  /**
   * 子 env 内可用：向父插件抛事件。等价 lx.send 的底层通道。
   * 仅在 lx prelude（子 env 内运行的字符串代码）里使用。
   */
  function __go_send(name: string, dataJSON: string): void;

  // QuickJS 提供的 Buffer（Node 兼容子集）。plugin-sdk 未声明。
  const Buffer: {
    from(data: string | ArrayLike<number>, encoding?: string): BufferLike;
    alloc(size: number): BufferLike;
    concat(list: BufferLike[]): BufferLike;
    isBuffer(x: unknown): boolean;
  };

  // 混淆脚本依赖的全局别名（仅子 env 内，父 env 也无害）。
  // eslint-disable-next-line no-var
  var window: typeof globalThis;
  // eslint-disable-next-line no-var
  var global: typeof globalThis;
  // eslint-disable-next-line no-var
  var lx: any;
}

export {};
