// 注入每个子 QuickJS env 的 initCode。
// 在子 env 全局作用域运行，构造洛雪音源脚本期望的全局 `lx`
// （遵循 lx-music-desktop 自定义源 API）。
//
// 子 env 可用：fetch(真异步) / setTimeout / Buffer / crypto / zlib / __go_send。
// 无 songloft.*、无 timer goroutine（setTimeout 仅在 executeWait polling loop 内驱动）。
//
// 注意：本字符串整体作为 initCode 传给 jsenv.create，内部不得使用反引号。

export const LX_PRELUDE_JS: string = String.raw`
(function () {
  globalThis.window = globalThis;
  globalThis.global = globalThis;

  var EVENT_NAMES = { request: 'request', inited: 'inited', updateAlert: 'updateAlert' };

  // 已注册的事件处理器（脚本通过 lx.on 注册）
  var handlers = {};

  function hasHeader(headers, name) {
    name = name.toLowerCase();
    for (var k in headers) { if (k.toLowerCase() === name) return true; }
    return false;
  }

  function urlencode(obj) {
    var parts = [];
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
    }
    return parts.join('&');
  }

  // 回调风格 HTTP，内部包 fetch。
  // callback(err, { statusCode, statusMessage, headers, body, raw }, body)
  function request(url, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    options = options || {};
    if (typeof callback !== 'function') callback = function () {};

    var method = (options.method || 'GET').toUpperCase();
    var headers = {};
    if (options.headers) { for (var hk in options.headers) headers[hk] = options.headers[hk]; }

    var body;
    if (options.form != null) {
      body = urlencode(options.form);
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (options.formData != null) {
      body = urlencode(options.formData);
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (options.body != null) {
      if (typeof options.body === 'object') {
        body = JSON.stringify(options.body);
        if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json';
      } else {
        body = options.body;
      }
    }

    var init = { method: method, headers: headers };
    if (body != null && method !== 'GET' && method !== 'HEAD') init.body = body;

    var aborted = false;
    fetch(url, init).then(function (resp) {
      return resp.text().then(function (text) {
        if (aborted) return;
        var respHeaders = {};
        try { resp.headers.forEach(function (v, k) { respHeaders[k] = v; }); } catch (e) {}
        var ct = respHeaders['content-type'] || respHeaders['Content-Type'] || '';
        var parsed = text;
        var looksJson = false;
        var t = text ? text.replace(/^\s+/, '') : '';
        if (/(application\/json|text\/json)/i.test(ct)) looksJson = true;
        else if (t && (t.charAt(0) === '{' || t.charAt(0) === '[')) looksJson = true;
        if (looksJson) { try { parsed = JSON.parse(text); } catch (e) {} }
        var respObj = {
          statusCode: resp.status,
          statusMessage: resp.statusText || '',
          headers: respHeaders,
          body: parsed,
          raw: text
        };
        callback(null, respObj, parsed);
      });
    }).catch(function (err) {
      if (aborted) return;
      callback(err || new Error('request failed'), null);
    });

    return { cancelHttp: function () { aborted = true; } };
  }

  function on(eventName, handler) { handlers[eventName] = handler; }

  function send(eventName, data) {
    if (eventName === EVENT_NAMES.inited) { globalThis.__lx_inited = data; }
    var payload;
    try { payload = JSON.stringify(data == null ? null : data); } catch (e) { payload = 'null'; }
    try { __go_send(eventName, payload); } catch (e) {}
  }

  // 父侧触发脚本处理请求。settle 后回传结果；带 18s 看门狗。
  function _dispatch(reqId, eventName, dataJSON) {
    var data;
    try { data = JSON.parse(dataJSON); } catch (e) { data = null; }
    var handler = handlers[eventName];
    if (!handler) {
      __go_send('dispatchError', JSON.stringify({ id: reqId, error: 'no handler for ' + eventName }));
      return;
    }
    var settled = false;
    var wd = setTimeout(function () {
      if (settled) return;
      settled = true;
      __go_send('dispatchError', JSON.stringify({ id: reqId, error: 'dispatch timeout' }));
    }, 18000);
    var finish = function (ok, val) {
      if (settled) return;
      settled = true;
      try { clearTimeout(wd); } catch (e) {}
      if (ok) __go_send('dispatchResult', JSON.stringify({ id: reqId, result: val }));
      else __go_send('dispatchError', JSON.stringify({ id: reqId, error: errStr(val) }));
    };
    try {
      var ret = handler(data);
      Promise.resolve(ret).then(function (res) { finish(true, res); }, function (err) { finish(false, err); });
    } catch (err) {
      finish(false, err);
    }
  }

  function errStr(e) {
    if (e == null) return 'unknown error';
    if (typeof e === 'string') return e;
    if (e.message) return String(e.message);
    try { return JSON.stringify(e); } catch (x) { return String(e); }
  }

  // lx.utils —— 包装宿主 polyfill（crypto/Buffer/zlib 在子 env 直接可用）
  var utils = {
    crypto: {
      md5: function (str) { return crypto.md5(String(str)); },
      randomBytes: function (size) { return crypto.randomBytes(size); },
      aesEncrypt: function (buffer, mode, key, iv) { return crypto.aesEncrypt(buffer, mode, key, iv); },
      aesDecrypt: function (buffer, mode, key, iv) { return crypto.aesDecrypt(buffer, mode, key, iv); },
      rsaEncrypt: function (buffer, key) { return crypto.rsaEncrypt(buffer, key); }
    },
    buffer: {
      from: function (data, enc) { return Buffer.from(data, enc); },
      bufToString: function (buf, enc) { return buf.toString(enc || 'utf8'); }
    },
    zlib: {
      inflate: function (data, cb) { try { cb(null, zlib.inflateSync(data)); } catch (e) { cb(e); } },
      deflate: function (data, cb) { try { cb(null, zlib.deflateSync(data)); } catch (e) { cb(e); } },
      gzip: function (data, cb) { try { cb(null, zlib.gzipSync(data)); } catch (e) { cb(e); } },
      gunzip: function (data, cb) { try { cb(null, zlib.gunzipSync(data)); } catch (e) { cb(e); } }
    }
  };

  globalThis.lx = {
    EVENT_NAMES: EVENT_NAMES,
    request: request,
    on: on,
    send: send,
    _dispatch: _dispatch,
    utils: utils,
    env: 'nodejs',
    version: '2.0.0',
    currentScriptInfo: {}
  };
})();
`;
