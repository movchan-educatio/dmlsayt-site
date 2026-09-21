/* Адмін-панель: вхід, сторінки, файли, налаштування, публікація. */
(function () {
  'use strict';
  var X = window.Admin, h = X.h, $ = X.$, A = X.A, R = X.R, GH = X.GH;
  var toast = X.toast, modal = X.modal, askText = X.askText, confirmBox = X.confirmBox;
  var app = document.getElementById('app');

  /* ---------- сховище (лише не секретні дані + токен за бажанням) ---------- */
  function sGet(store, k) { try { return store.getItem(k); } catch (e) { return null; } }
  function sSet(store, k, v) { try { store.setItem(k, v); } catch (e) {} }
  function sDel(store, k) { try { store.removeItem(k); } catch (e) {} }

  function detectRepo() {
    var host = location.hostname, parts = location.pathname.split('/').filter(Boolean);
    if (/\.github\.io$/i.test(host)) {
      var owner = host.split('.')[0];
      var repo = parts.length && parts[0].toLowerCase() !== 'admin' ? parts[0] : host;
      return owner + '/' + repo;
    }
    return '';
  }
  function siteUrl() { return new URL('../', location.href).href; }

  /* ---------- вхід ---------- */
  function showLogin(errorMsg) {
    var saved = sGet(localStorage, 'dm_repo') || detectRepo();
    var repoIn = h('input', { type: 'text', id: 'repo', value: saved, placeholder: 'ваш-логін/назва-репозиторію', autocomplete: 'off' });
    var branchIn = h('input', { type: 'text', id: 'branch', value: sGet(localStorage, 'dm_branch') || '', placeholder: 'авто' });
    var tokenIn = h('input', { type: 'password', id: 'token', autocomplete: 'off', placeholder: 'github_pat_…' });
    var savedFbEmail = sGet(localStorage, 'dm_fb_email') || '';
    var fbEmailIn = h('input', { type: 'email', id: 'fb_email', value: savedFbEmail, placeholder: 'admin@example.com', autocomplete: 'username' });
    var fbPassIn = h('input', { type: 'password', id: 'fb_pass', placeholder: '••••••••', autocomplete: 'current-password' });
    var remember = h('input', { type: 'checkbox', id: 'remember', checked: Boolean(sGet(localStorage, 'dm_token') || savedFbEmail) });
    var msg = h('div');
    if (errorMsg) msg.appendChild(h('div', { class: 'notice error', role: 'alert' }, errorMsg));
    var btn = h('button', { class: 'btn primary', type: 'submit' }, 'Увійти в адмін-панель');

    var form = h('form', { class: 'login', onsubmit: function (e) {
      e.preventDefault();
      var repo = repoIn.value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/$/, '');
      var m = repo.match(/^([\w.-]+)\/([\w.-]+)$/);
      if (!m) { msg.innerHTML = ''; msg.appendChild(h('div', { class: 'notice error' }, 'Вкажіть репозиторій у форматі «логін/назва».')); return; }
      if (!tokenIn.value.trim()) { tokenIn.focus(); return; }
      btn.disabled = true; btn.textContent = 'Перевірка…';
      A.cfg = { owner: m[1], repo: m[2], branch: branchIn.value.trim(), token: tokenIn.value.trim() };

      var fbEmail = fbEmailIn.value.trim();
      var fbPass = fbPassIn.value;

      loadAll().then(function () {
        sSet(localStorage, 'dm_repo', m[1] + '/' + m[2]); sSet(localStorage, 'dm_branch', branchIn.value.trim());
        sDel(sessionStorage, 'dm_token'); sDel(localStorage, 'dm_token');
        sSet(remember.checked ? localStorage : sessionStorage, 'dm_token', A.cfg.token);

        if (remember.checked && fbEmail) {
          sSet(localStorage, 'dm_fb_email', fbEmail);
        } else if (!remember.checked) {
          sDel(localStorage, 'dm_fb_email');
        }

        // Єдиний вхід до Firebase Auth (якщо налаштовано конфіг і введено логін/пароль)
        var cfg = window.FIREBASE_CONFIG;
        var hasValidCfg = cfg && cfg.apiKey && cfg.apiKey.indexOf('apiKey') === -1;
        if (hasValidCfg && window.firebase && fbEmail && fbPass) {
          if (!firebase.apps.length) firebase.initializeApp(cfg);
          var auth = firebase.auth();
          var persistence = remember.checked ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
          return auth.setPersistence(persistence).then(function () {
            return auth.signInWithEmailAndPassword(fbEmail, fbPass);
          }).catch(function (fbErr) {
            console.warn('Firebase login warning:', fbErr.message);
          }).then(function () {
            showShell();
          });
        }

        showShell();
      }).catch(function (err) {
        A.cfg = null; btn.disabled = false; btn.textContent = 'Увійти в адмін-панель';
        msg.innerHTML = ''; msg.appendChild(h('div', { class: 'notice error', role: 'alert' }, X.ghError(err)));
      });
    } },
      h('h1', null, 'Керування сайтом'),
      h('p', { class: 'lead' }, 'Єдиний вхід для редагування сайту та перегляду звернень громадян.'),
      msg,
      h('div', { class: 'row2' },
        h('label', { class: 'f' }, h('span', null, 'Репозиторій'), repoIn),
        h('label', { class: 'f' }, h('span', null, 'Гілка'), branchIn)),
      h('label', { class: 'f' }, h('span', null, 'Ключ доступу GitHub (токен)'), tokenIn,
        h('small', null, 'Токен зберігається лише в цьому браузері й ніде не публікується.')),
      h('div', { class: 'fb-login-block', style: 'border-top: 1px solid var(--line); margin-top: 16px; padding-top: 14px;' },
        h('h3', { style: 'margin: 0 0 6px; font-size: 1rem; color: var(--ink);' }, 'База звернень (Firebase)'),
        h('small', { style: 'display:block; margin-bottom: 10px; color: var(--muted);' }, 'Заповніть для доступу до вкладки «📨 Звернення».'),
        h('div', { class: 'row2' },
          h('label', { class: 'f' }, h('span', null, 'E-mail адміністратора'), fbEmailIn),
          h('label', { class: 'f' }, h('span', null, 'Пароль до звернень'), fbPassIn)
        )
      ),
      h('label', { class: 'check' }, remember, h('span', null, 'Запам’ятати на цьому пристрої (не вмикайте на чужих комп’ютерах)')),
      btn,
      h('p', { class: 'help' }, 'Ще немає токена? Інструкція — у розділі «Допомога» після входу або в файлі README.md.',
        ' ', h('a', { href: '#help', onclick: function (e) { e.preventDefault(); showHelpModal(); } }, 'Показати інструкцію')));
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'login-wrap' }, form));
  }

  function loadAll() {
    return GH.repo().then(function (repo) {
      if (repo.permissions && repo.permissions.push === false) {
        var e = new Error('Цей токен має доступ лише для читання. Потрібне право «Contents: Read and write».'); e.status = 0; throw e;
      }
      if (!A.cfg.branch) A.cfg.branch = repo.default_branch || 'main';
      return GH.head();
    }).then(function (sha) {
      A.headSha = sha; return GH.tree(sha);
    }).then(function (t) {
      A.tree = t.map;
      var s = A.tree.get('content/site.json');
      if (!s) { var e = new Error('У цьому репозиторії немає файлу content/site.json — це не сайт ліцею.'); e.status = 0; throw e; }
      return GH.blobText(s.sha);
    }).then(function (txt) {
      A.site = JSON.parse(txt);
      A.site.site = A.site.site || {}; A.site.nav = A.site.nav || [];
      A.origNav = JSON.stringify(A.site.nav); A.origSettings = JSON.stringify(A.site.site);
      A.bodies = {}; A.removed.clear(); A.staged.clear(); A.stagedDel.clear(); A.sel = null;
    });
  }

  /* ---------- каркас ---------- */
  var pubBtn, pubCount, pendingBar, mainEl;
  function showShell() {
    pubCount = h('span', { class: 'badge-count' }, '0');
    pubBtn = h('button', { class: 'btn sun', type: 'button', disabled: true, onclick: openPublish }, 'Опублікувати зміни ', pubCount);
    pendingBar = h('div', { class: 'pending', hidden: true }, h('span', null, 'Є зміни, які ще не опубліковані. Натисніть «Опублікувати зміни», щоб вони з’явилися на сайті.'));
    mainEl = h('div', { class: 'main' });
    var tabs = [
      ['pages', 'Сторінки та меню'],
      ['files', 'Файли'],
      ['settings', 'Налаштування сайту'],
      ['feedback', '📨 Звернення'],
      ['help', 'Допомога']
    ];
    var tabBar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) {
      return h('button', { role: 'tab', type: 'button', 'data-tab': t[0], 'aria-selected': String(A.view === t[0]), onclick: function () { A.view = t[0]; renderView(); } }, t[1]);
    }));
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'shell' },
      h('header', { class: 'top' },
        h('div', { class: 'top-in' },
          h('h1', null, 'Керування сайтом'),
          h('span', { class: 'repo' }, A.cfg.owner + '/' + A.cfg.repo + ' · ' + A.cfg.branch),
          h('span', { class: 'spacer' }),
          h('a', { class: 'btn small', href: siteUrl(), target: '_blank', rel: 'noopener' }, 'Переглянути сайт ↗'),
          pubBtn,
          h('button', { class: 'btn small', type: 'button', onclick: logout }, 'Вийти')),
        tabBar),
      pendingBar, mainEl));
    renderView();
  }

  function logout() {
    var go = function () {
      sDel(sessionStorage, 'dm_token');
      sDel(localStorage, 'dm_token');
      if (window.firebase && firebase.apps && firebase.apps.length && firebase.auth) {
        try { firebase.auth().signOut(); } catch (e) {}
      }
      A.cfg = null;
      showLogin();
    };
    if (X.collectChanges().count) confirmBox({ title: 'Вийти без публікації?', text: 'Неопубліковані зміни буде втрачено.', okLabel: 'Вийти', danger: true }).then(function (ok) { if (ok) go(); });
    else go();
  }

  function renderView() {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === A.view)); });
    mainEl.innerHTML = '';
    if (A.view === 'pages') renderPages();
    else if (A.view === 'files') renderFiles();
    else if (A.view === 'settings') renderSettings();
    else if (A.view === 'feedback') renderFeedback();
    else mainEl.appendChild(helpContent());
    refreshBadge();
  }

  var badgeTimer;
  function refreshBadge() {
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(function () {
      if (!pubBtn) return;
      var n = X.collectChanges().count;
      pubCount.textContent = String(n); pubBtn.disabled = n === 0; pendingBar.hidden = n === 0;
    }, 60);
  }
  window.addEventListener('beforeunload', function (e) {
    if (A.cfg && A.site && X.collectChanges().count) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- дерево ---------- */
  function locate(list, node, parent) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === node) return { list: list, i: i, parent: parent || null };
      if (list[i].children) { var r = locate(list[i].children, node, list[i]); if (r) return r; }
    }
    return null;
  }
  function descendants(node, out) {
    out = out || []; (node.children || []).forEach(function (c) { out.push(c); descendants(c, out); }); return out;
  }
  function uniqueSlug(base) {
    var used = new Set(X.allSlugs(A.site.nav)); Object.keys(A.bodies).forEach(function (s) { used.add(s); });
    A.tree.forEach(function (v, p) { var m = p.match(/^content\/pages\/(.+)\.md$/); if (m) used.add(m[1]); });
    var s = base, i = 2; while (used.has(s)) { s = base + '-' + i; i++; } return s;
  }
  function cleanRefs(slugs) {
    var S = A.site.site, gone = new Set(slugs);
    if (S.quick) S.quick = S.quick.filter(function (s) { return !gone.has(s); });
    if (S.heroActions) S.heroActions = S.heroActions.filter(function (a) { return !a.slug || !gone.has(a.slug); });
  }
  function isHome(n) { return n && n.slug && n.slug === (A.site.site.home || 'golovna'); }

  var treeScroll, treeBtns = {};
  function renderTree() {
    if (!treeScroll) return;
    treeScroll.innerHTML = '';
    function build(list) {
      var ul = h('ul', { class: 'atree' });
      list.forEach(function (n) {
        var isSel = A.sel === n;
        var tags = [];
        if (n.url && !n.slug) tags.push(h('span', { class: 'tag link' }, 'посилання'));
        if (n.todo) tags.push(h('span', { class: 'tag todo' }, 'не заповнено'));
        if (n.slug && A.bodies[n.slug] && A.bodies[n.slug].isNew) tags.push(h('span', { class: 'tag new' }, 'нова'));
        if (n.hidden) tags.push(h('span', { class: 'tag hid' }, 'приховано'));
        var li = h('li', null,
          h('button', { class: 'node', type: 'button', 'aria-current': isSel ? 'true' : null, onclick: function () { selectNode(n); } },
            h('span', { class: 't' }, n.title || '(без назви)'), tags));
        if (n.children && n.children.length) li.appendChild(build(n.children));
        ul.appendChild(li);
      });
      return ul;
    }
    treeScroll.appendChild(A.site.nav.length ? build(A.site.nav) : h('p', { class: 'empty-note' }, 'Меню порожнє. Додайте першу сторінку.'));
    var loc = A.sel ? locate(A.site.nav, A.sel) : null;
    var can = {
      up: loc && loc.i > 0,
      down: loc && loc.i < loc.list.length - 1,
      out: loc && !!loc.parent,
      inn: loc && loc.i > 0 && !!loc.list[loc.i - 1].slug,
      del: loc && !isHome(A.sel)
    };
    Object.keys(treeBtns).forEach(function (k) { treeBtns[k].disabled = !can[k]; });
  }

  function moveNode(kind) {
    var loc = locate(A.site.nav, A.sel); if (!loc) return;
    var list = loc.list, i = loc.i, n = A.sel;
    if (kind === 'up' && i > 0) { list.splice(i, 1); list.splice(i - 1, 0, n); }
    else if (kind === 'down' && i < list.length - 1) { list.splice(i, 1); list.splice(i + 1, 0, n); }
    else if (kind === 'out' && loc.parent) {
      list.splice(i, 1); if (!list.length) delete loc.parent.children;
      var g = locate(A.site.nav, loc.parent); g.list.splice(g.i + 1, 0, n);
    } else if (kind === 'inn' && i > 0 && list[i - 1].slug) {
      var prev = list[i - 1]; list.splice(i, 1); prev.children = prev.children || []; prev.children.push(n);
    }
    renderTree(); refreshBadge();
  }

  function addPage() {
    askText({ title: 'Нова сторінка', label: 'Назва сторінки', okLabel: 'Створити', hint: 'Сторінка з’явиться в меню після вибраної. Щоб зробити її підпунктом, натисніть «→».' }).then(function (title) {
      if (!title) return;
      var slug = uniqueSlug(R.slugify(title));
      var node = { title: title, slug: slug };
      insertAfterSelected(node);
      A.bodies[slug] = { text: '', orig: '', isNew: true };
      selectNode(node);
    });
  }
  function addLink() {
    askText({ title: 'Нове посилання в меню', label: 'Назва пункту меню', okLabel: 'Далі' }).then(function (title) {
      if (!title) return;
      return askText({ title: 'Адреса посилання', label: 'Куди веде пункт меню', placeholder: 'https://…', okLabel: 'Додати', type: 'url' }).then(function (url) {
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        var node = { title: title, url: url };
        insertAfterSelected(node); selectNode(node);
      });
    });
  }
  function insertAfterSelected(node) {
    var loc = A.sel ? locate(A.site.nav, A.sel) : null;
    if (loc) loc.list.splice(loc.i + 1, 0, node); else A.site.nav.push(node);
  }
  function deleteNode() {
    var n = A.sel; if (!n || isHome(n)) return;
    var all = [n].concat(descendants(n));
    var pages = all.filter(function (x) { return x.slug; });
    confirmBox({
      title: 'Видалити з сайту?',
      text: 'Буде видалено «' + n.title + '»' + (all.length > 1 ? ' і ще ' + (all.length - 1) + ' підпунктів' : '') + '. Тексти цих сторінок зникнуть після публікації (їх можна відновити з історії GitHub).',
      okLabel: 'Видалити', danger: true
    }).then(function (ok) {
      if (!ok) return;
      var loc = locate(A.site.nav, n);
      loc.list.splice(loc.i, 1); if (loc.parent && !loc.list.length) delete loc.parent.children;
      pages.forEach(function (p) { A.removed.add(p.slug); delete A.bodies[p.slug]; });
      cleanRefs(pages.map(function (p) { return p.slug; }));
      A.sel = null; renderTree(); renderEditor(); refreshBadge();
    });
  }
  function selectNode(n) { A.sel = n; renderTree(); renderEditor(); }

  /* ---------- сторінки: розмітка ---------- */
  var editorBox;
  function renderPages() {
    treeBtns = {};
    var splitEl, treePanel;
    function setTree(open) {
      if (!splitEl) return;
      splitEl.classList.toggle('tree-collapsed', !open);
      splitEl.classList.toggle('tree-open', open);
    }
    function tb(key, label, title, fn, cls) {
      treeBtns[key] = h('button', { class: 'btn small ' + (cls || ''), type: 'button', title: title, 'aria-label': title, onclick: fn }, label);
      return treeBtns[key];
    }
    treeScroll = h('div', { class: 'tree-scroll' });
    editorBox = h('div', { class: 'panel-b', id: 'editor' });
    var reopenTree = h('button', { class: 'btn small pages-reopen', type: 'button', title: 'Показати список сторінок', onclick: function () { setTree(true); } }, '☰ Сторінки');
    treePanel = h('section', { class: 'panel treebox', 'aria-label': 'Структура сайту' },
        h('div', { class: 'panel-h' }, h('h2', null, 'Меню сайту'),
          h('div', { style: 'display:flex;gap:6px' },
            h('button', { class: 'btn small primary', type: 'button', onclick: addPage }, '+ Сторінка'),
            h('button', { class: 'btn small', type: 'button', onclick: addLink }, '+ Посилання'),
            h('button', { class: 'btn small ghost tree-hide', type: 'button', title: 'Сховати список сторінок', onclick: function () { setTree(false); } }, '×'))),
        h('div', { class: 'tree-actions' },
          tb('up', '↑', 'Пересунути вище', function () { moveNode('up'); }),
          tb('down', '↓', 'Пересунути нижче', function () { moveNode('down'); }),
          tb('out', '←', 'Винести на рівень вище', function () { moveNode('out'); }),
          tb('inn', '→', 'Вкласти в попередній пункт', function () { moveNode('inn'); }),
          h('span', { class: 'sep' }),
          tb('del', 'Видалити', 'Видалити вибраний пункт', deleteNode, 'danger')),
        treeScroll);
    splitEl = h('div', { class: 'split' }, treePanel,
      h('section', { class: 'panel editor-panel', 'aria-label': 'Редактор' }, reopenTree, editorBox));
    mainEl.appendChild(splitEl);
    renderTree(); renderEditor();
  }

  function loadBody(slug) {
    if (A.bodies[slug]) return Promise.resolve(A.bodies[slug]);
    var e = A.tree.get(X.pagePath(slug));
    if (!e) { A.bodies[slug] = { text: '', orig: '', isNew: true }; return Promise.resolve(A.bodies[slug]); }
    return GH.blobText(e.sha).then(function (t) { A.bodies[slug] = { text: t, orig: t }; return A.bodies[slug]; });
  }

  function pageOptions(sel, allowEmpty) {
    var s = h('select');
    if (allowEmpty) s.appendChild(h('option', { value: '' }, '— не вибрано —'));
    (function walk(list, d) {
      list.forEach(function (n) {
        if (n.slug) { var o = h('option', { value: n.slug }, new Array(d + 1).join('— ') + n.title); if (n.slug === sel) o.selected = true; s.appendChild(o); }
        walk(n.children || [], d + 1);
      });
    })(A.site.nav, 0);
    return s;
  }

  var previewTimer;
  function renderEditor() {
    if (!editorBox) return;
    var n = A.sel;
    editorBox.innerHTML = '';
    if (!n) {
      editorBox.appendChild(h('p', { class: 'empty-note' }, 'Виберіть сторінку в меню ліворуч, щоб змінити її текст, назву чи місце в меню.'));
      return;
    }
    var titleIn = h('input', { type: 'text', value: n.title || '', id: 'ttl' });
    titleIn.addEventListener('input', function () { n.title = titleIn.value; renderTreeLabelOnly(); refreshBadge(); });
    var hidden = h('input', { type: 'checkbox' }); hidden.checked = !!n.hidden;
    hidden.addEventListener('change', function () { if (hidden.checked) n.hidden = true; else delete n.hidden; renderTree(); refreshBadge(); });

    if (!n.slug) {
      var urlIn = h('input', { type: 'url', value: n.url || '' });
      urlIn.addEventListener('input', function () { n.url = urlIn.value.trim(); refreshBadge(); });
      editorBox.appendChild(h('div', { class: 'editor-h' }, h('h2', null, 'Зовнішнє посилання')));
      editorBox.appendChild(h('label', { class: 'f' }, h('span', null, 'Назва в меню'), titleIn));
      editorBox.appendChild(h('label', { class: 'f' }, h('span', null, 'Адреса'), urlIn, h('small', null, 'Пункт відкриватиме цю адресу в новій вкладці.')));
      editorBox.appendChild(h('label', { class: 'check' }, hidden, h('span', null, 'Приховати з меню')));
      return;
    }

    var slug = n.slug;
    editorBox.appendChild(h('p', { class: 'empty-note' }, 'Завантаження…'));
    loadBody(slug).then(function (body) {
      if (A.sel !== n) return;
      editorBox.innerHTML = '';
      var link = siteUrl() + '?page=' + encodeURIComponent(slug);
      editorBox.appendChild(h('div', { class: 'editor-h' }, h('h2', null, 'Редагування сторінки'),
        h('a', { class: 'btn small', href: link, target: '_blank', rel: 'noopener' }, 'Відкрити на сайті ↗')));
      editorBox.appendChild(h('label', { class: 'f' }, h('span', null, 'Назва сторінки'), titleIn));
      editorBox.appendChild(h('div', { class: 'slugline' }, 'Адреса:', h('code', null, '?page=' + slug),
        h('button', { class: 'btn small', type: 'button', onclick: function () {
          (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('Посилання скопійовано'); }, function () { askText({ title: 'Посилання на сторінку', label: 'Скопіюйте вручну', value: link }); });
        } }, 'Копіювати посилання')));
      editorBox.appendChild(h('label', { class: 'check' }, hidden, h('span', null, 'Приховати з меню (сторінка відкриватиметься лише за прямим посиланням)')));

      if (window.VisualPageEditor) {
        var visualHost = h('div');
        editorBox.appendChild(visualHost);
        window.VisualPageEditor.mount(visualHost, {
          slug: slug,
          body: body,
          node: n,
          modal: modal,
          confirmBox: confirmBox,
          toast: toast,
          pickMedia: pickMedia,
          resolvePath: resolvePath,
          onChange: function (text) {
            body.text = text;
            if (n.todo && !/ще переносяться зі старого сайту/.test(text)) { delete n.todo; renderTree(); }
            refreshBadge();
          }
        });
        return;
      }

      var ta = h('textarea', { id: 'body', rows: '20', spellcheck: 'true', lang: 'uk' });
      ta.value = body.text;
      var prev = h('div', { class: 'preview-box' });
      var prose = h('div', { class: 'prose' });
      prev.appendChild(h('div', { class: 'lbl' }, 'Так сторінка виглядатиме на сайті'));
      prev.appendChild(prose);
      function updatePreview() {
        prose.innerHTML = R.mdToHtml(ta.value);
        R.enhance(prose, { resolve: resolvePath });
        if (!ta.value.trim()) prose.appendChild(h('p', { style: 'color:#58607A' }, 'Тут з’явиться перегляд тексту.'));
      }
      ta.addEventListener('input', function () {
        body.text = ta.value;
        if (n.todo && !/ще переносяться зі старого сайту/.test(ta.value)) { delete n.todo; renderTree(); }
        clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 200);
        refreshBadge();
      });
      ta.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); surround('**', '**', 'жирний текст'); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); surround('*', '*', 'курсив'); }
      });
      function fire() { ta.focus(); ta.dispatchEvent(new Event('input')); }
      function surround(b, a, ph) {
        var s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph;
        ta.setRangeText(b + sel + a, s, e, 'end'); ta.setSelectionRange(s + b.length, s + b.length + sel.length); fire();
      }
      function prefixLines(fn) {
        var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
        var ls = v.lastIndexOf('\n', s - 1) + 1, le = v.indexOf('\n', e); if (le < 0) le = v.length;
        var out = v.slice(ls, le).split('\n').map(fn).join('\n');
        ta.setRangeText(out, ls, le, 'select'); fire();
      }
      function insert(text) {
        var s = ta.selectionStart, v = ta.value;
        var pre = s > 0 && v[s - 1] !== '\n' ? '\n\n' : (s > 1 && v[s - 2] !== '\n' ? '\n' : '');
        ta.setRangeText(pre + text + '\n\n', s, ta.selectionEnd, 'end'); fire();
      }
      function btn(label, title, fn) { return h('button', { type: 'button', title: title, 'aria-label': title, onclick: fn }, label); }
      var toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Форматування' },
        btn('Ж', 'Жирний (Ctrl+B)', function () { surround('**', '**', 'жирний текст'); }),
        btn('К', 'Курсив (Ctrl+I)', function () { surround('*', '*', 'курсив'); }),
        h('span', { class: 'sep' }),
        btn('Заголовок', 'Заголовок розділу', function () { prefixLines(function (l) { return '## ' + l.replace(/^#+\s*/, ''); }); }),
        btn('Підзаголовок', 'Підзаголовок', function () { prefixLines(function (l) { return '### ' + l.replace(/^#+\s*/, ''); }); }),
        h('span', { class: 'sep' }),
        btn('• Список', 'Маркований список', function () { prefixLines(function (l) { return '- ' + l.replace(/^[-*]\s+/, ''); }); }),
        btn('1. Список', 'Нумерований список', function () { var i = 0; prefixLines(function (l) { i++; return i + '. ' + l.replace(/^\d+\.\s+/, ''); }); }),
        btn('Цитата', 'Виділений блок', function () { prefixLines(function (l) { return '> ' + l.replace(/^>\s?/, ''); }); }),
        h('span', { class: 'sep' }),
        btn('Посилання', 'Вставити посилання', function () {
          askText({ title: 'Посилання', label: 'Адреса (https://…)', okLabel: 'Вставити', type: 'url' }).then(function (u) {
            if (!u) return; if (!/^(https?:|mailto:|tel:|#)/i.test(u)) u = 'https://' + u;
            var s = ta.selectionStart, e = ta.selectionEnd, txt = ta.value.slice(s, e) || 'текст посилання';
            ta.setRangeText('[' + txt + '](' + u + ')', s, e, 'end'); fire();
          });
        }),
        btn('Зображення', 'Вставити зображення', function () {
          pickMedia({ mode: 'image' }).then(function (r) { if (r) insert('![' + (r.alt || '') + '](' + r.path + ')'); });
        }),
        btn('Файл', 'Прикріпити файл (PDF, Word, Excel…)', function () {
          pickMedia({ mode: 'file' }).then(function (r) { if (r) insert('[' + r.path.split('/').pop() + '](' + r.path + ')'); });
        }),
        btn('Відео', 'Вставити відео YouTube', function () {
          askText({ title: 'Відео YouTube', label: 'Посилання на відео', okLabel: 'Вставити' }).then(function (u) {
            if (!u) return; var id = R.youtubeId(u);
            if (!id) return toast('Не вдалося розпізнати посилання YouTube', true);
            insert('<iframe src="https://www.youtube-nocookie.com/embed/' + id + '" title="Відео" allowfullscreen></iframe>');
          });
        }),
        btn('Документ Google', 'Вставити документ, таблицю чи форму з Google Диску', function () {
          askText({ title: 'Документ із Google Диску', label: 'Посилання на файл', hint: 'Файл має бути відкритий для всіх, хто має посилання.', okLabel: 'Вставити' }).then(function (u) {
            if (!u) return; var id = R.driveId(u);
            var src, dl = null;
            if (/docs\.google\.com\/forms/.test(u)) src = u.split('?')[0].replace(/\/(edit|viewform)$/, '') + '/viewform?embedded=true';
            else if (/docs\.google\.com\/(document|spreadsheets|presentation)/.test(u) && id) {
              var kind = u.match(/docs\.google\.com\/(document|spreadsheets|presentation)/)[1];
              src = 'https://docs.google.com/' + kind + '/d/' + id + (kind === 'presentation' ? '/embed' : '/preview');
            } else if (id) { src = 'https://drive.google.com/file/d/' + id + '/preview'; dl = 'https://drive.google.com/uc?export=download&id=' + id; }
            if (!src) return toast('Не вдалося розпізнати посилання Google', true);
            insert('<iframe src="' + src + '" title="Документ"></iframe>' + (dl ? '\n\n[Завантажити файл](' + dl + ')' : ''));
          });
        }),
        btn('Таблиця', 'Вставити таблицю', function () { insert('| Назва | Опис |\n| --- | --- |\n| … | … |\n| … | … |'); }),
        btn('Лінія', 'Розділювач', function () { insert('---'); }));

      var wrapTa = h('div', { class: 'ta-wrap' }, toolbar, ta);
      var mdTabs = h('div', { class: 'md-tabs' },
        h('button', { class: 'btn small primary', type: 'button', onclick: function () { wrapTa.classList.remove('off'); prev.classList.add('off'); } }, 'Редагування'),
        h('button', { class: 'btn small', type: 'button', onclick: function () { wrapTa.classList.add('off'); prev.classList.remove('off'); updatePreview(); } }, 'Перегляд'));
      prev.classList.add('off');
      editorBox.appendChild(mdTabs);
      editorBox.appendChild(h('div', { class: 'md-grid' }, wrapTa, prev));
      if (window.matchMedia('(min-width: 1001px)').matches) prev.classList.remove('off');
      editorBox.appendChild(h('p', { style: 'color:var(--muted);font-size:.86rem;margin:10px 0 0' },
        'Зміни зберігаються в браузері до натискання «Опублікувати зміни» угорі.'));
      updatePreview();
    }).catch(function (err) {
      editorBox.innerHTML = '';
      editorBox.appendChild(h('div', { class: 'notice error' }, 'Не вдалося завантажити сторінку: ' + X.ghError(err)));
    });
  }
  function renderTreeLabelOnly() {
    var cur = document.querySelector('.node[aria-current="true"] .t');
    if (cur && A.sel) cur.textContent = A.sel.title || '(без назви)';
  }

  /* ---------- файли ---------- */
  function resolvePath(p) {
    var s = A.staged.get(p);
    return s && s.url ? s.url : '../' + p;
  }
  function isImage(p) { return /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(p); }
  function fmtSize(b) {
    if (b < 1024) return b + ' Б'; if (b < 1048576) return Math.round(b / 1024) + ' КБ'; return (b / 1048576).toFixed(1).replace('.', ',') + ' МБ';
  }
  function allFiles() {
    var out = [];
    A.tree.forEach(function (v, p) { if (p.indexOf('uploads/') === 0 && !/\.gitkeep$/.test(p)) out.push({ path: p, size: v.size, staged: false, del: A.stagedDel.has(p) }); });
    A.staged.forEach(function (v, p) { out.push({ path: p, size: v.size, staged: true, del: false }); });
    return out.sort(function (a, b) { return a.path.localeCompare(b.path); });
  }
  function stageFiles(fileList) {
    var paths = [], d = new Date(), yy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0');
    Array.prototype.forEach.call(fileList, function (f) {
      if (f.size > 90 * 1024 * 1024) { toast('«' + f.name + '» завелике (понад 90 МБ) — GitHub не прийме такий файл.', true); return; }
      if (f.size > 25 * 1024 * 1024) toast('«' + f.name + '» доволі великий (' + fmtSize(f.size) + ') — публікація може тривати довше.');
      var name = R.safeFileName(f.name), path = 'uploads/' + yy + '/' + mm + '/' + name, i = 2;
      var stem = name.replace(/(\.[^.]+)?$/, ''), ext = (name.match(/\.[^.]+$/) || [''])[0];
      while (A.tree.has(path) || A.staged.has(path)) { path = 'uploads/' + yy + '/' + mm + '/' + stem + '-' + i + ext; i++; }
      A.staged.set(path, { file: f, size: f.size, url: isImage(path) ? URL.createObjectURL(f) : null });
      paths.push(path);
    });
    refreshBadge();
    return paths;
  }
  function dropzone(onFiles) {
    var input = h('input', { type: 'file', multiple: true, hidden: true, onchange: function () { onFiles(input.files); input.value = ''; } });
    var dz = h('div', { class: 'dropzone' },
      h('p', { style: 'margin:0 0 10px' }, 'Перетягніть файли сюди або'), 
      h('button', { class: 'btn primary', type: 'button', onclick: function () { input.click(); } }, 'Вибрати файли на комп’ютері'), input);
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
    return dz;
  }

  function renderFiles() {
    var filter = h('input', { type: 'search', placeholder: 'Пошук серед файлів', 'aria-label': 'Пошук серед файлів' });
    var box = h('div', { class: 'table-scroll' });
    function draw() {
      var q = filter.value.trim().toLowerCase();
      var list = allFiles().filter(function (f) { return !q || f.path.toLowerCase().indexOf(q) !== -1; });
      box.innerHTML = '';
      if (!list.length) { box.appendChild(h('p', { class: 'empty-note' }, 'Файлів не знайдено.')); return; }
      box.appendChild(h('table', { class: 'files' },
        h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Файл'), h('th', null, 'Розмір'), h('th', null, ''))),
        h('tbody', null, list.map(function (f) {
          var thumb = isImage(f.path) ? h('img', { class: 'thumb', src: resolvePath(f.path), alt: '', loading: 'lazy' }) : h('span', { class: 'ext' }, (f.path.match(/\.([^.]+)$/) || ['', 'file'])[1].slice(0, 4));
          return h('tr', { class: f.del ? 'del' : '' },
            h('td', null, thumb),
            h('td', { class: 'p' }, f.path, f.staged ? h('span', { class: 'tag new', style: 'margin-left:8px' }, 'нове') : null, f.del ? h('span', { class: 'tag todo', style: 'margin-left:8px' }, 'буде видалено') : null),
            h('td', null, fmtSize(f.size)),
            h('td', { class: 'act' },
              h('button', { class: 'btn small', type: 'button', onclick: function () {
                var md = isImage(f.path) ? '![](' + f.path + ')' : '[' + f.path.split('/').pop() + '](' + f.path + ')';
                (navigator.clipboard ? navigator.clipboard.writeText(md) : Promise.reject()).then(function () { toast('Скопійовано: ' + md); }, function () { askText({ title: 'Код для вставки', label: 'Скопіюйте вручну', value: md }); });
              } }, 'Копіювати код'), ' ',
              f.del ? h('button', { class: 'btn small', type: 'button', onclick: function () { A.stagedDel.delete(f.path); draw(); refreshBadge(); } }, 'Скасувати')
                : h('button', { class: 'btn small danger', type: 'button', onclick: function () {
                  confirmBox({ title: 'Видалити файл?', text: f.path + '\n\nЯкщо цей файл використовується на сторінках чи в налаштуваннях, там він перестане відображатися.', okLabel: 'Видалити', danger: true }).then(function (ok) {
                    if (!ok) return;
                    if (f.staged) { var s = A.staged.get(f.path); if (s && s.url) URL.revokeObjectURL(s.url); A.staged.delete(f.path); } else A.stagedDel.add(f.path);
                    draw(); refreshBadge();
                  });
                } }, 'Видалити')));
        }))));
    }
    filter.addEventListener('input', draw);
    mainEl.appendChild(h('div', { class: 'panel' },
      h('div', { class: 'panel-h' }, h('h2', null, 'Файли та зображення'), h('div', { style: 'min-width:240px;flex:1;max-width:360px' }, filter)),
      h('div', { class: 'panel-b' },
        dropzone(function (files) { stageFiles(files); draw(); toast('Файли додано. Не забудьте натиснути «Опублікувати зміни».'); }),
        h('p', { style: 'color:var(--muted);font-size:.9rem' }, 'Файли зберігаються в папці uploads. Щоб додати файл на сторінку, скористайтеся кнопками «Зображення» чи «Файл» у редакторі сторінки.'),
        box)));
    draw();
  }

  function pickMedia(opts) {
    return new Promise(function (resolve) {
      var mode = opts.mode || 'any';
      var alt = h('input', { type: 'text', placeholder: 'Опис зображення (для незрячих відвідувачів)' });
      var filter = h('input', { type: 'search', placeholder: 'Пошук', 'aria-label': 'Пошук' });
      var grid = h('div', { class: 'media-grid' });
      var m;
      function draw() {
        var q = filter.value.trim().toLowerCase();
        var list = allFiles().filter(function (f) { return !f.del && (mode !== 'image' || isImage(f.path)) && (!q || f.path.toLowerCase().indexOf(q) !== -1); });
        grid.innerHTML = '';
        if (!list.length) grid.appendChild(h('p', { class: 'empty-note', style: 'grid-column:1/-1' }, mode === 'image' ? 'Зображень ще немає. Завантажте перше вище.' : 'Файлів ще немає. Завантажте перший вище.'));
        list.forEach(function (f) {
          grid.appendChild(h('button', { class: 'media-item', type: 'button', onclick: function () { m.close({ path: f.path, alt: alt.value.trim() }); } },
            h('div', { class: 'im' }, isImage(f.path) ? h('img', { src: resolvePath(f.path), alt: '', loading: 'lazy' }) : (f.path.match(/\.([^.]+)$/) || ['', 'file'])[1].slice(0, 4)),
            h('div', { class: 'nm' }, f.path.split('/').pop())));
        });
      }
      filter.addEventListener('input', draw);
      m = modal({
        title: mode === 'image' ? 'Вибір зображення' : 'Вибір файлу', wide: true, onClose: function (r) { resolve(r || null); },
        build: function (m) {
          m.body.appendChild(dropzone(function (files) {
            var paths = stageFiles(files); draw();
            if (paths.length === 1) m.close({ path: paths[0], alt: alt.value.trim() });
          }));
          if (mode === 'image') m.body.appendChild(h('label', { class: 'f', style: 'margin-top:14px' }, h('span', null, 'Опис зображення'), alt));
          m.body.appendChild(h('div', { style: 'margin-top:14px' }, filter));
          m.body.appendChild(grid);
          m.foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { m.close(null); } }, 'Закрити'));
        }
      });
      draw();
    });
  }

  /* ---------- налаштування ---------- */
  function textField(label, obj, key, o) {
    o = o || {};
    var el = o.multiline ? h('textarea', { rows: '3' }) : h('input', { type: o.type || 'text', placeholder: o.placeholder || '' });
    el.value = obj[key] || '';
    el.addEventListener('input', function () { obj[key] = el.value; refreshBadge(); });
    return h('label', { class: 'f' }, h('span', null, label), el, o.hint ? h('small', null, o.hint) : null);
  }
  function imageField(label, obj, key) {
    var input = h('input', { type: 'text', placeholder: 'uploads/…' });
    input.value = obj[key] || '';
    input.addEventListener('input', function () { obj[key] = input.value.trim(); refreshBadge(); });
    return h('label', { class: 'f' }, h('span', null, label), h('div', { class: 'pathrow' }, input,
      h('button', { class: 'btn small', type: 'button', onclick: function (e) {
        e.preventDefault(); pickMedia({ mode: 'image' }).then(function (r) { if (r) { obj[key] = r.path; input.value = r.path; refreshBadge(); } });
      } }, 'Обрати…')));
  }
  function listEditor(o) {
    var box = h('div');
    function draw() {
      box.innerHTML = '';
      o.items().forEach(function (item, i, arr) {
        var row = h('div', { class: 'listrow' });
        o.fields(item, row, draw);
        row.appendChild(h('div', { class: 'rowtools' },
          h('button', { class: 'btn small', type: 'button', disabled: i === 0, 'aria-label': 'Вище', onclick: function () { arr.splice(i, 1); arr.splice(i - 1, 0, item); draw(); refreshBadge(); } }, '↑'),
          h('button', { class: 'btn small', type: 'button', disabled: i === arr.length - 1, 'aria-label': 'Нижче', onclick: function () { arr.splice(i, 1); arr.splice(i + 1, 0, item); draw(); refreshBadge(); } }, '↓'),
          h('button', { class: 'btn small danger', type: 'button', onclick: function () { arr.splice(i, 1); draw(); refreshBadge(); } }, 'Видалити')));
        box.appendChild(row);
      });
      box.appendChild(h('button', { class: 'btn small', type: 'button', onclick: function () { o.items().push(o.make()); draw(); refreshBadge(); } }, '+ ' + o.addLabel));
    }
    draw(); return box;
  }

  function renderSettings() {
    var S = A.site.site;
    ['heroActions', 'quick', 'social', 'banners', 'linkGroups'].forEach(function (k) { S[k] = S[k] || []; });
    S.video = S.video || { title: '', youtube: '' };
    var cards = h('div', { class: 'cards' });
    function card(title, kids) { var p = h('section', { class: 'panel' }, h('div', { class: 'panel-b' }, h('h3', { class: 'section-title' }, title), kids)); cards.appendChild(p); }

    card('Загальне', [
      textField('Назва закладу', S, 'title'),
      textField('Підзаголовок у шапці', S, 'subtitle'),
      textField('Короткий опис на головній', S, 'lead', { multiline: true }),
      textField('Адреса', S, 'address'),
      textField('Текст у нижній частині сайту', S, 'footer', { multiline: true }),
      imageField('Логотип', S, 'logo'),
      imageField('Фото на головній сторінці', S, 'hero')]);

    card('Кнопки на головній', [listEditor({
      addLabel: 'Додати кнопку', items: function () { return S.heroActions; }, make: function () { return { title: '', slug: (A.site.nav[0] && A.site.nav[0].slug) || '' }; },
      fields: function (it, row) {
        row.appendChild(textField('Текст кнопки', it, 'title'));
        var sel = pageOptions(it.slug, false); sel.addEventListener('change', function () { it.slug = sel.value; refreshBadge(); });
        row.appendChild(h('label', { class: 'f' }, h('span', null, 'Сторінка'), sel));
      } })]);

    card('Швидкий доступ на головній', [h('p', { style: 'margin-top:0;color:var(--muted)' }, 'Сторінки, на які найчастіше заходять відвідувачі.'),
      listEditor({ addLabel: 'Додати сторінку', items: function () { return S.quick; }, make: function () { return (A.site.nav[0] && A.site.nav[0].slug) || ''; },
        fields: function (it, row, redraw) {
          var idx = S.quick.indexOf(it);
          var sel = pageOptions(it, false); sel.addEventListener('change', function () { S.quick[idx] = sel.value; refreshBadge(); });
          row.appendChild(h('label', { class: 'f', style: 'margin:0' }, h('span', null, 'Сторінка'), sel));
        } })]);

    card('Соціальні мережі', [listEditor({
      addLabel: 'Додати мережу', items: function () { return S.social; }, make: function () { return { title: '', url: '', icon: 'link' }; },
      fields: function (it, row) {
        row.appendChild(h('div', { class: 'two' }, textField('Назва', it, 'title'), textField('Адреса', it, 'url', { type: 'url' })));
        var sel = h('select', null, [['telegram', 'Telegram'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['youtube', 'YouTube'], ['link', 'Інше']].map(function (o) { var op = h('option', { value: o[0] }, o[1]); if (it.icon === o[0]) op.selected = true; return op; }));
        sel.addEventListener('change', function () { it.icon = sel.value; refreshBadge(); });
        row.appendChild(h('label', { class: 'f', style: 'margin:0' }, h('span', null, 'Значок'), sel));
      } })]);

    var vid = S.video;
    var vidIn = h('input', { type: 'text', placeholder: 'https://www.youtube.com/watch?v=…' });
    vidIn.value = vid.youtube ? 'https://www.youtube.com/watch?v=' + vid.youtube : '';
    vidIn.addEventListener('input', function () { var id = R.youtubeId(vidIn.value); vid.youtube = id || (vidIn.value.trim() ? vid.youtube : ''); if (!vidIn.value.trim()) vid.youtube = ''; refreshBadge(); });
    card('Відео та Facebook на головній', [
      textField('Заголовок відео', vid, 'title'),
      h('label', { class: 'f' }, h('span', null, 'Посилання на відео YouTube'), vidIn, h('small', null, 'Залиште порожнім, щоб не показувати відео.')),
      textField('Сторінка Facebook', S, 'facebookPage', { type: 'url', hint: 'Стрічка новин з цієї сторінки показується на головній. Порожньо — не показувати.' })]);

    card('Кнопки-банери (наприклад, електронні щоденники)', [listEditor({
      addLabel: 'Додати банер', items: function () { return S.banners; }, make: function () { return { title: '', url: '', image: '' }; },
      fields: function (it, row) { row.appendChild(textField('Назва', it, 'title')); row.appendChild(textField('Адреса', it, 'url', { type: 'url' })); row.appendChild(imageField('Зображення', it, 'image')); } })]);

    card('Групи посилань (партнери, корисні сайти)', [listEditor({
      addLabel: 'Додати групу', items: function () { return S.linkGroups; }, make: function () { return { title: 'Нова група', items: [] }; },
      fields: function (g, row) {
        row.appendChild(textField('Назва групи', g, 'title'));
        g.items = g.items || [];
        row.appendChild(listEditor({ addLabel: 'Додати посилання', items: function () { return g.items; }, make: function () { return { title: '', url: '', image: '' }; },
          fields: function (it, r2) { r2.appendChild(textField('Назва', it, 'title')); r2.appendChild(textField('Адреса', it, 'url', { type: 'url' })); r2.appendChild(imageField('Логотип чи банер', it, 'image')); } }));
      } })]);

    mainEl.appendChild(cards);
  }

  /* ---------- модуль «Звернення» (Firebase Feedback) ---------- */
  function renderFeedback() {
    var wrap = h('div', { class: 'panel' });
    var pHead = h('div', { class: 'panel-h' },
      h('h2', null, '📨 Звернення з форми сайту'),
      h('div', { class: 'spacer' })
    );
    var pBody = h('div', { class: 'panel-b' });
    wrap.appendChild(pHead);
    wrap.appendChild(pBody);
    mainEl.appendChild(wrap);

    var cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || cfg.apiKey.indexOf('apiKey') !== -1) {
      pBody.appendChild(h('div', { class: 'notice warn' },
        h('strong', null, 'Firebase ще не налаштовано.'),
        h('p', { style: 'margin: 6px 0 0;' },
          'Щоб переглядати звернення громадян, додайте конфігурацію Firebase у файл ',
          h('code', null, 'assets/js/firebase-config.js'),
          ' та налаштуйте Cloud Firestore у Firebase Console.'
        )
      ));
      return;
    }

    if (!window.firebase) {
      pBody.appendChild(h('p', { class: 'boot' }, 'Завантаження Firebase SDK…'));
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(cfg);
    }

    // Чекаємо асинхронного відновлення сесії Firebase Auth з IndexedDB.
    // auth.currentUser синхронно == null до завершення hydration — це нормально.
    // onAuthStateChanged гарантовано викликається після відновлення сесії.
    var auth = firebase.auth();
    pBody.appendChild(h('p', { class: 'boot' }, 'Перевірка авторизації…'));

    auth.onAuthStateChanged(function (user) {
      pBody.innerHTML = '';

      if (!user) {
        // Сесії немає. Пропонуємо перейти до форми входу (де є поля fb_email + fb_pass).
        pBody.appendChild(h('div', { class: 'notice', style: 'max-width: 560px; margin: 24px auto; padding: 24px;' },
          h('h3', { style: 'margin-top: 0;' }, '🔐 Доступ до звернень'),
          h('p', { style: 'color: var(--muted); font-size: .92rem; line-height: 1.5;' },
            'Вкладку «Звернення» захищено Firebase Auth. Вийдіть з адмін-панелі та увійдіть знову, заповнивши поля «E-mail адміністратора» та «Пароль до звернень» у формі входу.',
            h('br'), h('br'),
            'Якщо ви вже входили з позначкою «Запам\u2019ятати» — сесія відновиться автоматично при наступному відкритті цієї сторінки.'
          ),
          h('button', {
            class: 'btn primary small',
            type: 'button',
            style: 'margin-top: 10px;',
            onclick: function () { logout(); }
          }, 'Перейти до форми входу')
        ));
        return;
      }

      pBody.appendChild(h('p', { class: 'boot' }, 'Завантаження звернень…'));

      var db = firebase.firestore();
      db.collection('feedback').orderBy('createdAt', 'desc').get()
        .then(function (snapshot) {
          pBody.innerHTML = '';
          var docs = [];
          snapshot.forEach(function (doc) {
            docs.push({ id: doc.id, data: doc.data() });
          });

          var newCount = docs.filter(function (d) { return d.data.status === 'new'; }).length;

          var summaryBar = h('div', {
            style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px;'
          },
            h('div', { style: 'font-weight:600;font-size:1.05rem;' },
              'Всього звернень: ', h('strong', null, String(docs.length)),
              ' · Нових звернень: ', h('span', { class: 'tag ' + (newCount > 0 ? 'todo' : 'new') }, String(newCount))
            )
          );
          pBody.appendChild(summaryBar);

          if (!docs.length) {
            pBody.appendChild(h('p', { class: 'empty-note' }, 'Звернень поки немає.'));
            return;
          }

          var tableWrap = h('div', { class: 'feedback-list', style: 'display:grid;gap:14px;' });
          docs.forEach(function (item) {
            var d = item.data;
            var isNew = d.status === 'new';

            var dateStr = 'Невідомо';
            if (d.createdAt && d.createdAt.toDate) {
              var dt = d.createdAt.toDate();
              dateStr = dt.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }

            var card = h('div', {
              style: 'border:1px solid var(--line);border-radius:10px;padding:16px 20px;background:' + (isNew ? '#FCFDFE' : '#FAFAFA') + ';box-shadow:0 2px 6px rgba(0,0,0,.03);'
            });

            var cardTop = h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;' },
              h('div', null,
                h('span', { style: 'font-weight:700;font-size:1.05rem;color:var(--ink);' }, d.name || 'Без імені'),
                h('span', { style: 'color:var(--muted);font-size:.85rem;margin-left:12px;' }, dateStr)
              ),
              h('span', { class: 'tag ' + (isNew ? 'todo' : 'new') }, isNew ? 'Нове' : 'Опрацьовано')
            );

            var contactRow = h('div', { style: 'display:flex;gap:16px;font-size:.9rem;margin-bottom:10px;flex-wrap:wrap;' },
              h('div', null,
                h('strong', null, 'E-mail: '),
                h('span', null, d.email || '—'),
                d.email ? h('button', {
                  class: 'btn small ghost',
                  style: 'padding:2px 6px;margin-left:6px;',
                  title: 'Скопіювати e-mail',
                  onclick: function () {
                    navigator.clipboard.writeText(d.email);
                    toast('E-mail скопійовано: ' + d.email);
                  }
                }, '📋') : null
              ),
              d.phone ? h('div', null,
                h('strong', null, 'Телефон: '),
                h('span', null, d.phone),
                h('button', {
                  class: 'btn small ghost',
                  style: 'padding:2px 6px;margin-left:6px;',
                  title: 'Скопіювати телефон',
                  onclick: function () {
                    navigator.clipboard.writeText(d.phone);
                    toast('Телефон скопійовано: ' + d.phone);
                  }
                }, '📋')
              ) : null
            );

            // Безпечне виведення тексту повідомлення без innerHTML для захисту від XSS
            var msgBox = h('div', {
              style: 'background:var(--bg);border-radius:6px;padding:10px 14px;margin-bottom:12px;white-space:pre-wrap;font-size:.95rem;line-height:1.5;overflow-wrap:anywhere;'
            }, d.message || '');

            var actions = h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;' },
              h('button', {
                class: 'btn small ' + (isNew ? 'primary' : ''),
                type: 'button',
                onclick: function () {
                  var nextStatus = isNew ? 'processed' : 'new';
                  db.collection('feedback').doc(item.id).update({ status: nextStatus })
                    .then(function () {
                      toast(isNew ? 'Позначено як опрацьовано' : 'Повернуто статус «Нове»');
                      renderView();
                    })
                    .catch(function (err) {
                    toast('Помилка: ' + err.message, true);
                  });
              }
            }, isNew ? 'Позначити «Опрацьовано»' : 'Повернути «Нове»'),

            h('button', {
              class: 'btn small danger',
              type: 'button',
              onclick: function () {
                confirmBox({
                  title: 'Видалити звернення?',
                  text: 'Звернення від ' + (d.name || 'користувача') + ' буде безповоротно видалено з бази.',
                  okLabel: 'Видалити',
                  danger: true
                }).then(function (ok) {
                  if (!ok) return;
                  db.collection('feedback').doc(item.id).delete()
                    .then(function () {
                      toast('Звернення видалено');
                      renderView();
                    })
                    .catch(function (err) {
                      toast('Помилка видалення: ' + err.message, true);
                    });
                });
              }
            }, 'Видалити')
          );

          card.appendChild(cardTop);
          card.appendChild(contactRow);
          card.appendChild(msgBox);
          card.appendChild(actions);
          tableWrap.appendChild(card);
        });

        pBody.appendChild(tableWrap);
      })
        .catch(function (err) {
          pBody.innerHTML = '';
          pBody.appendChild(h('div', { class: 'notice error' }, 'Не вдалося завантажити звернення: ' + err.message));
        });
    }); // кінець onAuthStateChanged
  } // кінець renderFeedback

  /* ---------- допомога ---------- */
  function helpContent() {
    return h('div', { class: 'panel help-body' }, h('div', { class: 'panel-b' },
      h('h2', { class: 'section-title' }, 'Довідка з керування сайтом'),
      h('p', { class: 'help-intro' }, 'Ця панель дозволяє самостійно змінювати текст, створювати сторінки й пункти меню, додавати новини, фотографії, документи, відео та корисні посилання.'),
      h('div', { class: 'notice warn' }, 'Важливо: зміни не з’являться на сайті, доки ви не натиснете «Опублікувати зміни».'),

      h('h3', null, 'Безпечний порядок роботи'),
      h('ol', { class: 'steps' },
        h('li', null, 'Відкрийте потрібну вкладку та внесіть зміни.'),
        h('li', null, 'Скористайтеся кнопкою «Перегляд» у редакторі й перевірте текст, фото та посилання.'),
        h('li', null, 'Перегляньте перелік змін у верхній частині панелі.'),
        h('li', null, 'Натисніть «Опублікувати зміни» та підтвердьте публікацію.'),
        h('li', null, 'Зачекайте 1–2 хвилини, відкрийте сайт кнопкою «Переглянути сайт» і оновіть сторінку.')),

      h('h3', null, 'Редагування наявної сторінки'),
      h('ol', { class: 'steps' },
        h('li', null, 'Відкрийте «Сторінки та меню» та виберіть сторінку зліва.'),
        h('li', null, 'Змініть назву або текст. Для оформлення використовуйте кнопки над редактором: «Ж», «К», «Заголовок», списки, цитату, посилання чи таблицю.'),
        h('li', null, 'Не видаляйте службові позначки, iframe або посилання, якщо не впевнені, для чого вони потрібні.'),
        h('li', null, 'Натисніть «Перегляд», а після перевірки — «Опублікувати зміни».')),

      h('h3', null, 'Створення нової сторінки'),
      h('ol', { class: 'steps' },
        h('li', null, 'У «Сторінки та меню» виберіть пункт, після якого має з’явитися нова сторінка.'),
        h('li', null, 'Натисніть «+ Сторінка», введіть коротку зрозумілу назву та натисніть «Створити».'),
        h('li', null, 'Заповніть сторінку текстом, фото, документами або посиланнями.'),
        h('li', null, 'За потреби змініть її місце кнопками ↑, ↓, → і ←, потім опублікуйте зміни.')),

      h('h3', null, 'Меню та зовнішні посилання'),
      h('ul', { class: 'help-list' },
        h('li', null, '↑ і ↓ змінюють порядок пунктів.'),
        h('li', null, '→ робить вибраний пункт підпунктом попереднього.'),
        h('li', null, '← повертає підпункт на рівень вище.'),
        h('li', null, '«+ Посилання» додає до меню адресу іншого сайту або сервісу.'),
        h('li', null, 'Позначка «Приховати в меню» залишає сторінку доступною за прямим посиланням, але прибирає її з меню.'),
        h('li', null, 'Перед видаленням сторінки переконайтеся, що її матеріали більше не потрібні.')),

      h('h3', null, 'Додавання новини'),
      h('ol', { class: 'steps' },
        h('li', null, 'Виберіть сторінку «Новини» та поставте курсор на початок тексту, щоб нова публікація була першою.'),
        h('li', null, 'Додайте заголовок кнопкою «Заголовок», нижче напишіть текст новини.'),
        h('li', null, 'Додайте фотографію кнопкою «Зображення». У полі опису коротко вкажіть, що зображено.'),
        h('li', null, 'За потреби вставте посилання, документ або відео, перегляньте результат і опублікуйте.')),

      h('h3', null, 'Фото та інші зображення'),
      h('ol', { class: 'steps' },
        h('li', null, 'Поставте курсор у потрібне місце тексту й натисніть «Зображення».'),
        h('li', null, 'Виберіть уже завантажене фото або завантажте нове з комп’ютера.'),
        h('li', null, 'Введіть короткий опис зображення — він потрібний для доступності сайту.'),
        h('li', null, 'Не завантажуйте однаковий файл повторно та не використовуйте надмірно великі фото без потреби.')),

      h('h3', null, 'PDF, Word, Excel та інші файли'),
      h('ol', { class: 'steps' },
        h('li', null, 'Поставте курсор у потрібне місце та натисніть «Файл».'),
        h('li', null, 'Виберіть файл на комп’ютері або один із раніше завантажених.'),
        h('li', null, 'Після вставлення замініть технічну назву посилання зрозумілим текстом, наприклад «Наказ про зарахування».'),
        h('li', null, 'Не видаляйте файл у вкладці «Файли», доки він використовується хоча б на одній сторінці.')),

      h('h3', null, 'YouTube та документи Google'),
      h('ul', { class: 'help-list' },
        h('li', null, 'Для відео натисніть «Відео» та вставте повне посилання YouTube.'),
        h('li', null, 'Для документа, таблиці або форми натисніть «Документ Google» та вставте посилання з Google Диска.'),
        h('li', null, 'У Google Диску заздалегідь увімкніть доступ «Усі, хто має посилання — читач», інакше відвідувачі не побачать документ.'),
        h('li', null, 'Не вставляйте паролі, приватні документи або матеріали з персональними даними.')),

      h('h3', null, 'Налаштування головної сторінки'),
      h('p', null, 'У вкладці «Налаштування сайту» можна змінити назву й опис ліцею, логотип, головне фото, кнопки, швидкий доступ, соціальні мережі, відео, банери та групи корисних посилань. Після кожної зміни перевіряйте головну сторінку на комп’ютері й телефоні.'),

      h('h3', null, 'Вкладка «Файли»'),
      h('p', null, 'Тут зберігаються завантажені фотографії та документи. Можна завантажити кілька файлів, знайти потрібний через пошук, скопіювати код для вставлення або позначити непотрібний файл для видалення. Видалення застосовується лише після публікації.'),

      h('h3', null, 'Звернення громадян'),
      h('p', null, 'У вкладці «📨 Звернення» можна прочитати отримані повідомлення, позначити їх опрацьованими або видалити. Дані цієї вкладки не публікуються на сайті. Не копіюйте персональні дані заявників у відкриті сторінки.'),

      h('h3', null, 'Як скасувати помилку'),
      h('ul', { class: 'help-list' },
        h('li', null, 'До публікації: перезавантажте сторінку або вийдіть без публікації — неопубліковані зміни буде втрачено.'),
        h('li', null, 'Після публікації: виправте помилку в редакторі й опублікуйте ще раз.'),
        h('li', null, 'Якщо сторінку або важливий файл уже видалено, не робіть додаткових змін і зверніться до відповідального за GitHub — попередню версію можна відновити з історії.')),

      h('h3', null, 'Якщо зміни не видно'),
      h('ol', { class: 'steps' },
        h('li', null, 'Переконайтеся, що публікація завершилася без повідомлення про помилку.'),
        h('li', null, 'Зачекайте до 2 хвилин і оновіть сторінку комбінацією Ctrl+F5.'),
        h('li', null, 'Перевірте, чи редагували правильну сторінку та чи файл не був позначений для видалення.'),
        h('li', null, 'Якщо проблема залишилась, запишіть назву сторінки та зробіть скриншот повідомлення про помилку.')),

      h('h3', null, 'Як отримати ключ доступу (токен)'),
      tokenSteps(),
      h('h3', null, 'Безпека'),
      h('ul', { class: 'help-list' },
        h('li', null, 'Кожен адміністратор повинен мати власний обліковий запис GitHub і власний токен.'),
        h('li', null, 'Не надсилайте токен у месенджерах, не вставляйте його в текст сторінок і не показуйте на скриншотах.'),
        h('li', null, 'Не вмикайте «Запам’ятати на цьому пристрої» на чужому або спільному комп’ютері.'),
        h('li', null, 'Якщо токен став відомий іншій людині, негайно видаліть його в GitHub: Settings → Developer settings → Fine-grained tokens.'))));
  }
  function tokenSteps() {
    return h('ol', { class: 'steps' },
      h('li', null, 'Увійдіть на github.com та відкрийте ', h('code', null, 'Settings → Developer settings → Personal access tokens → Fine-grained tokens'), '.'),
      h('li', null, 'Натисніть «Generate new token». Вкажіть назву (наприклад, «Сайт ліцею») і строк дії (наприклад, 1 рік).'),
      h('li', null, 'У «Repository access» оберіть «Only select repositories» і виберіть репозиторій із сайтом.'),
      h('li', null, 'У «Repository permissions» знайдіть ', h('code', null, 'Contents'), ' та поставте ', h('code', null, 'Read and write'), '.'),
      h('li', null, 'Натисніть «Generate token», скопіюйте значення (починається з ', h('code', null, 'github_pat_'), ') і вставте на сторінці входу.'));
  }
  function showHelpModal() {
    modal({ title: 'Як отримати токен', build: function (m) { m.body.appendChild(tokenSteps()); m.foot.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { m.close(null); } }, 'Зрозуміло')); } });
  }

  /* ---------- публікація ---------- */
  function openPublish() {
    var ch = X.collectChanges(), s = ch.summary;
    if (!ch.count) return;
    var items = [];
    if (s.menu) items.push('Змінено структуру меню');
    if (s.settings) items.push('Змінено налаштування сайту');
    s.pages.forEach(function (p) { items.push((p.isNew ? 'Нова сторінка: ' : 'Змінено сторінку: ') + titleOf(p.slug)); });
    s.removed.forEach(function (slug) { items.push('Видалено сторінку: ' + slug); });
    s.files.forEach(function (f) { items.push('Новий файл: ' + f); });
    s.deletedFiles.forEach(function (f) { items.push('Видалено файл: ' + f); });
    var msgIn = h('input', { type: 'text', value: 'Оновлення сайту через адмін-панель (' + ch.count + ')' });
    var bar = h('div', { class: 'progress', hidden: true }, h('i')), status = h('p', { style: 'color:var(--muted);margin:0' });
    var errBox = h('div');
    var go = h('button', { class: 'btn primary', type: 'button' }, 'Опублікувати');
    var cancel = h('button', { class: 'btn', type: 'button' }, 'Скасувати');
    var m = modal({ title: 'Опублікувати зміни', build: function (m) {
      m.body.appendChild(h('p', { style: 'margin-top:0' }, 'Буде опубліковано:'));
      m.body.appendChild(h('ul', { class: 'changes' }, items.slice(0, 40).map(function (t) { return h('li', null, t); }), items.length > 40 ? h('li', null, '…і ще ' + (items.length - 40)) : null));
      m.body.appendChild(h('label', { class: 'f' }, h('span', null, 'Короткий опис змін'), msgIn));
      m.body.appendChild(errBox); m.body.appendChild(bar); m.body.appendChild(status);
      m.foot.appendChild(cancel); m.foot.appendChild(go);
    } });
    cancel.addEventListener('click', function () { m.close(null); });
    go.addEventListener('click', function () {
      go.disabled = cancel.disabled = msgIn.disabled = true; bar.hidden = false; errBox.innerHTML = '';
      X.commitAll(msgIn.value.trim() || 'Оновлення сайту', function (p, txt) { bar.firstChild.style.width = Math.round(p * 100) + '%'; status.textContent = txt; })
        .then(function () {
          m.body.innerHTML = '';
          m.body.appendChild(h('div', { class: 'notice ok' }, 'Готово! Зміни збережено. Сайт оновиться приблизно за 1–2 хвилини (GitHub Pages збирає його автоматично).'));
          m.foot.innerHTML = ''; m.foot.appendChild(h('a', { class: 'btn', href: siteUrl(), target: '_blank', rel: 'noopener' }, 'Відкрити сайт ↗'));
          m.foot.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { m.close(null); } }, 'Закрити'));
          refreshBadge(); renderTree(); if (A.view === 'files') renderView();
        }).catch(function (err) {
          go.disabled = cancel.disabled = msgIn.disabled = false; bar.hidden = true; status.textContent = '';
          errBox.appendChild(h('div', { class: 'notice error', role: 'alert' }, X.ghError(err)));
        });
    });
  }
  function titleOf(slug) {
    var t = slug;
    (function w(l) { l.forEach(function (n) { if (n.slug === slug) t = n.title; w(n.children || []); }); })(A.site.nav);
    return t;
  }

  /* ---------- запуск ---------- */
  function boot() {
    var tok = sGet(sessionStorage, 'dm_token') || sGet(localStorage, 'dm_token');
    var repo = sGet(localStorage, 'dm_repo') || detectRepo();
    var m = repo.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (tok && m) {
      A.cfg = { owner: m[1], repo: m[2], branch: sGet(localStorage, 'dm_branch') || '', token: tok };
      loadAll().then(showShell).catch(function (e) { A.cfg = null; showLogin(X.ghError(e)); });
    } else showLogin();
  }
  boot();
})();
