'use strict';

// 宿主注入的 SongloftPlugin 提供带鉴权的 apiGet/apiPost/apiPut/apiDelete + 主题。
var SP = window.SongloftPlugin || {};
function hasApi() { return typeof SP.apiGet === 'function'; }

function apiGet(path) {
  if (!hasApi()) return Promise.reject(new Error('SongloftPlugin 不可用（请在 Songloft 内打开本页）'));
  return SP.apiGet(path);
}
function apiPost(path, body) {
  if (!hasApi()) return Promise.reject(new Error('SongloftPlugin 不可用'));
  return SP.apiPost(path, body);
}
function apiPut(path, body) { return SP.apiPut(path, body); }
function apiDelete(path) { return SP.apiDelete(path); }

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

// ===== 主题（跟随宿主）=====
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
}
try {
  if (typeof SP.getTheme === 'function') applyTheme(SP.getTheme());
  if (typeof SP.onThemeChange === 'function') SP.onThemeChange(applyTheme);
} catch (e) {}

// ===== Tabs =====
document.querySelectorAll('.tab').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'sources') loadSources();
  });
});

// ===== 搜索 =====
var lastResults = [];

$('btnSearch').addEventListener('click', doSearch);
$('kw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });

function doSearch() {
  var kw = $('kw').value.trim();
  if (!kw) return;
  $('results').innerHTML = '<div class="empty">搜索中…</div>';
  $('searchToolbar').classList.add('hidden');
  apiPost('/api/search', { keyword: kw, page: 1, page_size: 30 }).then(function (j) {
    lastResults = (j && j.results) || [];
    renderResults();
  }).catch(function (e) {
    $('results').innerHTML = '<div class="empty">搜索失败：' + esc(e.message) + '</div>';
  });
}

function renderResults() {
  if (!lastResults.length) { $('results').innerHTML = '<div class="empty">无结果</div>'; return; }
  $('searchToolbar').classList.remove('hidden');
  $('results').innerHTML = lastResults.map(function (it, i) {
    var plat = (it.source_data && it.source_data.platform) || '';
    return '<div class="card">' +
      '<input type="checkbox" class="selitem" data-i="' + i + '" />' +
      '<img class="cover" src="' + esc(it.cover_url || '') + '" onerror="this.style.visibility=\'hidden\'" />' +
      '<div class="meta"><div class="title">' + esc(it.title) + '</div>' +
      '<div class="sub">' + esc(it.artist) + (it.album ? ' · ' + esc(it.album) : '') + '</div></div>' +
      '<span class="badge">' + esc(plat) + '</span>' +
      '</div>';
  }).join('');
}

$('selAll').addEventListener('change', function () {
  document.querySelectorAll('.selitem').forEach(function (c) { c.checked = $('selAll').checked; });
});

$('btnImport').addEventListener('click', function () {
  var picked = [];
  document.querySelectorAll('.selitem:checked').forEach(function (c) { picked.push(lastResults[parseInt(c.dataset.i, 10)]); });
  if (!picked.length) { setMsg('importMsg', '请先选择歌曲', 'err'); return; }
  setMsg('importMsg', '导入中…');
  apiPost('/api/songs/import', { songs: picked }).then(function (j) {
    var n = (j && j.data && j.data.imported) || 0;
    setMsg('importMsg', '已导入 ' + n + ' 首', 'ok');
  }).catch(function (e) { setMsg('importMsg', '导入失败：' + e.message, 'err'); });
});

// ===== 音源管理 =====
var batchTimer = null;

function loadSources() {
  apiGet('/api/sources').then(function (j) {
    var d = (j && j.data) || {};
    renderSources(d);
    updateBanner(d);
    if (d.loading) {
      if (!batchTimer) batchTimer = setInterval(loadSources, 1500);
    } else if (batchTimer) { clearInterval(batchTimer); batchTimer = null; }
  }).catch(function (e) { $('sourceList').innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>'; });
}

function updateBanner(d) {
  var hasReady = d.supported_platforms && d.supported_platforms.length > 0;
  $('noSourceBanner').classList.toggle('hidden', !!hasReady);
  $('platformInfo').textContent = hasReady ? ('已就绪：' + d.supported_platforms.join(', ')) : '未导入可用音源';
}

function renderSources(d) {
  var list = d.sources || [];
  if (!list.length) { $('sourceList').innerHTML = '<div class="empty">尚无音源，导入 lx-music 自定义源脚本开始。</div>'; return; }
  $('sourceList').innerHTML = list.map(function (s) {
    var status = s.loading ? '加载中…' : (s.error ? ('错误：' + esc(s.error)) : (s.enabled ? '已启用' : '已禁用'));
    var plats = s.platforms ? Object.keys(s.platforms).join(', ') : '';
    return '<div class="card">' +
      '<div class="meta"><div class="title">' + esc(s.name) + ' <span class="badge">' + esc(s.version || '') + '</span></div>' +
      '<div class="sub">' + status + (plats ? ' · ' + esc(plats) : '') + '</div></div>' +
      '<div class="actions">' +
      '<label class="switch"><input type="checkbox" ' + (s.enabled ? 'checked' : '') + ' onchange="toggleSrc(\'' + esc(s.id) + '\', this.checked)"><span class="slider"></span></label>' +
      '<button onclick="delSrc(\'' + esc(s.id) + '\')">删除</button>' +
      '</div></div>';
  }).join('');
}

window.toggleSrc = function (id, enabled) {
  apiPut('/api/sources/toggle', { id: id, enabled: enabled }).then(loadSources).catch(function (e) { setMsg('sourceMsg', e.message, 'err'); });
};

window.delSrc = function (id) {
  if (!confirm('删除音源 ' + id + '？')) return;
  apiDelete('/api/sources?id=' + encodeURIComponent(id)).then(loadSources).catch(function (e) { setMsg('sourceMsg', e.message, 'err'); });
};

// 读文件为 base64（去掉 dataURL 前缀）
function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () {
      var s = String(r.result);
      var i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = function () { reject(new Error('读取失败')); };
    r.readAsDataURL(file);
  });
}

$('fileInput').addEventListener('change', function () {
  var files = this.files;
  if (!files || !files.length) return;
  setMsg('sourceMsg', '读取中…');
  var tasks = [];
  for (var i = 0; i < files.length; i++) {
    (function (f) { tasks.push(fileToBase64(f).then(function (b64) { return { filename: f.name, base64: b64 }; })); })(files[i]);
  }
  this.value = '';
  Promise.all(tasks).then(function (payload) {
    setMsg('sourceMsg', '导入中…');
    return apiPost('/api/sources/import', { files: payload });
  }).then(function (j) {
    var imp = (j && j.data && j.data.imported) || [];
    setMsg('sourceMsg', '已提交 ' + imp.length + ' 个脚本' + (j && j.warning ? '（' + j.warning + '）' : ''), 'ok');
    loadSources();
  }).catch(function (e) { setMsg('sourceMsg', '导入失败：' + e.message, 'err'); });
});

$('btnImportUrl').addEventListener('click', function () {
  var url = $('urlInput').value.trim();
  if (!url) return;
  setMsg('sourceMsg', '拉取中…');
  apiPost('/api/sources/import-url', { url: url }).then(function () {
    setMsg('sourceMsg', '导入完成', 'ok');
    $('urlInput').value = '';
    loadSources();
  }).catch(function (e) { setMsg('sourceMsg', '导入失败：' + e.message, 'err'); });
});

function setMsg(id, text, kind) {
  var el = $(id);
  el.textContent = text;
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

// 初次加载（若在宿主外打开则提示）
if (hasApi()) loadSources();
else $('sourceList').innerHTML = '<div class="empty">请在 Songloft 内打开本插件页面。</div>';
