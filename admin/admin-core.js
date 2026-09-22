/* Ядро адмін-панелі: допоміжні функції, вікна, клієнт GitHub, відстеження змін і публікація. */
(function (global) {
  'use strict';

  var R = global.SiteRender;

  /* ---------- DOM ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    var kids = Array.prototype.slice.call(arguments, 2);
    (function add(list) {
      list.forEach(function (kid) {
        if (kid == null || kid === false) return;
        if (Array.isArray(kid)) return add(kid);
        el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
      });
    })(kids);
    return el;
  }
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function toast(msg, isError) {
    var t = h('div', { class: 'toast' + (isError ? ' error' : ''), role: isError ? 'alert' : 'status' }, msg);
    $('#toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, isError ? 8000 : 3500);
  }

  /* ---------- модальні вікна ---------- */
  function modal(opts) {
    var prevFocus = document.activeElement;
    var overlay = h('div', { class: 'overlay' });
    var box = h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title });
    var body = h('div', { class: 'modal-b' });
    var foot = h('div', { class: 'modal-f' });
    function close(result) {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (opts.onClose) opts.onClose(result);
    }
    function onKey(e) { if (e.key === 'Escape' && !opts.locked) close(null); }
    document.addEventListener('keydown', onKey);
    box.appendChild(h('div', { class: 'modal-h' }, h('h2', null, opts.title),
      opts.locked ? null : h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Закрити', onclick: function () { close(null); } }, '✕')));
    box.appendChild(body);
    box.appendChild(foot);
    overlay.appendChild(box);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay && !opts.locked) close(null); });
    document.body.appendChild(overlay);
    var api = { el: box, body: body, foot: foot, close: close, overlay: overlay };
    if (opts.build) opts.build(api);
    var first = box.querySelector('input, textarea, select, button.primary');
    if (first) setTimeout(function () { first.focus(); }, 0);
    return api;
  }

  function askText(opts) {
    return new Promise(function (resolve) {
      var input = h('input', { type: opts.type || 'text', value: opts.value || '', placeholder: opts.placeholder || '' });
      var m = modal({
        title: opts.title, onClose: function (r) { resolve(r === undefined ? null : r); },
        build: function (m) {
          m.body.appendChild(h('label', { class: 'f' }, h('span', null, opts.label), input, opts.hint ? h('small', null, opts.hint) : null));
          function ok() { var v = input.value.trim(); if (!v && !opts.allowEmpty) { input.focus(); return; } m.close(v); }
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
          m.foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { m.close(null); } }, 'Скасувати'));
          m.foot.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: ok }, opts.okLabel || 'Гаразд'));
        }
      });
    });
  }

  function confirmBox(opts) {
    return new Promise(function (resolve) {
      modal({
        title: opts.title, onClose: function (r) { resolve(r === true); },
        build: function (m) {
          m.body.appendChild(h('p', { style: 'margin:0;white-space:pre-line' }, opts.text));
          m.foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { m.close(false); } }, 'Скасувати'));
          m.foot.appendChild(h('button', { class: 'btn ' + (opts.danger ? 'danger' : 'primary'), type: 'button', onclick: function () { m.close(true); } }, opts.okLabel || 'Гаразд'));
        }
      });
    });
  }

  /* ---------- стан ---------- */
  var A = {
    cfg: null,            // {owner, repo, branch, token}
    site: null,           // робоча копія content/site.json
    origNav: '', origSettings: '',
    bodies: {},           // slug → {text, orig, isNew}
    removed: new Set(),   // slug-и видалених сторінок
    tree: new Map(),      // path → {sha, size}
    headSha: null,
    staged: new Map(),    // path → {file, size, url}
    stagedDel: new Set(),
    sel: null, view: 'pages'
  };

  /* ---------- клієнт GitHub ---------- */
  function ghError(e) {
    var s = e.status;
    if (s === 401) return 'Токен недійсний або строк його дії закінчився. Створіть новий токен.';
    if (s === 403) return 'GitHub відмовив у доступі. Перевірте, що токен має право «Contents: Read and write» для цього репозиторію (або перевищено ліміт запитів — зачекайте кілька хвилин).';
    if (s === 404) return 'Репозиторій або гілку не знайдено — або токен не має до нього доступу. Перевірте назву репозиторію та налаштування токена.';
    if (s === 409 || s === 422) return 'Не вдалося записати зміни: ' + (e.message || 'конфлікт версій') + '. Оновіть сторінку й повторіть.';
    if (e.name === 'TypeError') return 'Немає зв’язку з GitHub. Перевірте інтернет-з’єднання.';
    return e.message || 'Невідома помилка';
  }

  function api(path, opts) {
    opts = opts || {};
    var cfg = A.cfg;
    var headers = {
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch('https://api.github.com' + path, {
      method: opts.method || 'GET', headers: headers, cache: 'no-store',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          var e = new Error(j.message || res.statusText); e.status = res.status; throw e;
        });
      }
      return opts.raw ? res.text() : res.json();
    });
  }
  function rp() { return '/repos/' + A.cfg.owner + '/' + A.cfg.repo; }
  function refPath(b) { return 'heads/' + b.split('/').map(encodeURIComponent).join('/'); }

  var GH = {
    repo: function () { return api(rp()); },
    head: function () { return api(rp() + '/git/ref/' + refPath(A.cfg.branch)).then(function (r) { return r.object.sha; }); },
    tree: function (commitSha) {
      return api(rp() + '/git/commits/' + commitSha).then(function (c) {
        return api(rp() + '/git/trees/' + c.tree.sha + '?recursive=1').then(function (t) {
          var m = new Map();
          t.tree.forEach(function (e) { if (e.type === 'blob') m.set(e.path, { sha: e.sha, size: e.size || 0 }); });
          return { map: m, truncated: !!t.truncated, treeSha: c.tree.sha };
        });
      });
    },
    blobText: function (sha) { return api(rp() + '/git/blobs/' + sha, { raw: true }); }
  };

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { reject(new Error('Не вдалося прочитати файл «' + file.name + '»')); };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- відстеження змін ---------- */
  function pagePath(slug) { return 'content/pages/' + slug + '.md'; }

  var SEO_BASE_URL = 'https://movchan-educatio.github.io/dmlsayt-site/';

  function xmlEscape(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function seoFiles() {
    var home = (A.site.site && A.site.site.home) || 'golovna';
    var slugs = Array.from(new Set(allSlugs(A.site.nav))).filter(function (slug) { return slug && slug !== home; });
    var urls = [SEO_BASE_URL].concat(slugs.map(function (slug) {
      return SEO_BASE_URL + '?page=' + encodeURIComponent(slug);
    }));
    var sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
    urls.forEach(function (url) {
      sitemap.push('  <url>', '    <loc>' + xmlEscape(url) + '</loc>', '  </url>');
    });
    sitemap.push('</urlset>');
    return {
      sitemap: sitemap.join('\n') + '\n',
      robots: 'User-agent: *\nAllow: /dmlsayt-site/\nDisallow: /dmlsayt-site/admin/\n\nSitemap: ' + SEO_BASE_URL + 'sitemap.xml\n'
    };
  }

  function allSlugs(list, out) {
    out = out || [];
    (list || []).forEach(function (n) { if (n.slug) out.push(n.slug); allSlugs(n.children, out); });
    return out;
  }

  function collectChanges() {
    var writes = [], deletes = [];
    var summary = { pages: [], removed: [], files: [], deletedFiles: [], menu: false, settings: false };
    var navStr = JSON.stringify(A.site.nav), setStr = JSON.stringify(A.site.site);
    summary.menu = navStr !== A.origNav;
    summary.settings = setStr !== A.origSettings;
    if (summary.menu || summary.settings) {
      writes.push({ path: 'content/site.json', text: JSON.stringify(A.site, null, 2) + '\n' });
    }
    // A newly added/removed public page changes the navigation tree. Publish
    // sitemap and robots in the same atomic Git commit so SEO never lags behind.
    if (summary.menu) {
      var seo = seoFiles();
      writes.push({ path: 'sitemap.xml', text: seo.sitemap });
      writes.push({ path: 'robots.txt', text: seo.robots });
    }
    var live = new Set(allSlugs(A.site.nav));
    Object.keys(A.bodies).forEach(function (slug) {
      var b = A.bodies[slug];
      if (!live.has(slug)) return;
      if (b.isNew || b.text !== b.orig) {
        var text = b.text && !/\n$/.test(b.text) ? b.text + '\n' : b.text;
        writes.push({ path: pagePath(slug), text: text });
        summary.pages.push({ slug: slug, isNew: !!b.isNew });
      }
    });
    A.removed.forEach(function (slug) {
      if (live.has(slug)) return;
      if (A.tree.has(pagePath(slug))) { deletes.push(pagePath(slug)); summary.removed.push(slug); }
    });
    A.staged.forEach(function (v, path) { writes.push({ path: path, file: v.file }); summary.files.push(path); });
    A.stagedDel.forEach(function (path) { if (A.tree.has(path)) { deletes.push(path); summary.deletedFiles.push(path); } });
    var wp = new Set(writes.map(function (w) { return w.path; }));
    deletes = deletes.filter(function (p) { return !wp.has(p); });
    var count = summary.pages.length + summary.removed.length + summary.files.length + summary.deletedFiles.length +
      (summary.menu ? 1 : 0) + (summary.settings ? 1 : 0);
    return { writes: writes, deletes: deletes, summary: summary, count: count };
  }

  function commitAll(message, onProgress) {
    var ch = collectChanges();
    var total = ch.writes.length + 4, done = 0;
    function step(txt) { done++; if (onProgress) onProgress(done / total, txt); }
    var newShas = {};
    var baseSha, treeSha;
    if (onProgress) onProgress(0, 'Перевірка змін…');
    return GH.head().then(function (cur) {
      baseSha = cur;
      if (cur === A.headSha) return null;
      return GH.tree(cur);
    }).then(function (upstream) {
      if (upstream) {
        var paths = ch.writes.map(function (w) { return w.path; }).concat(ch.deletes);
        var bad = paths.filter(function (p) {
          var up = upstream.map.get(p), mine = A.tree.get(p);
          return (up || mine) && (up && up.sha) !== (mine && mine.sha);
        });
        if (bad.length) {
          var e = new Error('Хтось інший вже змінив ці самі матеріали (' + bad.slice(0, 3).join(', ') + (bad.length > 3 ? '…' : '') + '). Щоб не втратити чужі зміни, оновіть сторінку та внесіть правки знову.');
          e.status = 409; throw e;
        }
      }
      step('Підготовка…');
      return api(rp() + '/git/commits/' + baseSha);
    }).then(function (baseCommit) {
      treeSha = baseCommit.tree.sha;
      var entries = [];
      var chain = Promise.resolve();
      ch.writes.forEach(function (w) {
        chain = chain.then(function () {
          var prep = w.file ? fileToBase64(w.file).then(function (b64) { return { content: b64, encoding: 'base64' }; })
            : Promise.resolve({ content: w.text, encoding: 'utf-8' });
          return prep.then(function (body) { return api(rp() + '/git/blobs', { method: 'POST', body: body }); })
            .then(function (blob) {
              newShas[w.path] = blob.sha;
              entries.push({ path: w.path, mode: '100644', type: 'blob', sha: blob.sha });
              step('Завантаження: ' + w.path.split('/').pop());
            });
        });
      });
      return chain.then(function () {
        ch.deletes.forEach(function (p) { entries.push({ path: p, mode: '100644', type: 'blob', sha: null }); });
        return api(rp() + '/git/trees', { method: 'POST', body: { base_tree: treeSha, tree: entries } });
      });
    }).then(function (tree) {
      step('Створення запису змін…');
      return api(rp() + '/git/commits', { method: 'POST', body: { message: message, tree: tree.sha, parents: [baseSha] } });
    }).then(function (commit) {
      return api(rp() + '/git/refs/' + refPath(A.cfg.branch), { method: 'PATCH', body: { sha: commit.sha } }).then(function () { return commit; });
    }).then(function (commit) {
      step('Готово');
      // оновлюємо локальний стан
      A.headSha = commit.sha;
      ch.writes.forEach(function (w) {
        var size = w.file ? w.file.size : new Blob([w.text]).size;
        A.tree.set(w.path, { sha: newShas[w.path], size: size });
      });
      ch.deletes.forEach(function (p) { A.tree.delete(p); });
      A.origNav = JSON.stringify(A.site.nav); A.origSettings = JSON.stringify(A.site.site);
      Object.keys(A.bodies).forEach(function (s) { A.bodies[s].orig = A.bodies[s].text; A.bodies[s].isNew = false; });
      A.staged.forEach(function (v) { if (v.url) URL.revokeObjectURL(v.url); });
      A.staged.clear(); A.stagedDel.clear(); A.removed.clear();
      return commit;
    });
  }

  global.Admin = {
    h: h, $: $, toast: toast, modal: modal, askText: askText, confirmBox: confirmBox,
    A: A, GH: GH, api: api, ghError: ghError, collectChanges: collectChanges, commitAll: commitAll,
    pagePath: pagePath, allSlugs: allSlugs, seoFiles: seoFiles, fileToBase64: fileToBase64, R: R
  };
})(window);
