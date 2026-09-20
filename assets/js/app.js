/* Публічний сайт: маршрутизація за хешем (#/адреса), меню, головна, пошук.
   Увесь вміст читається з content/site.json та content/pages/*.md — тож
   будь-яка зміна цих файлів у GitHub одразу з'являється на сайті. */
(function () {
  'use strict';

  var R = window.SiteRender;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = R.esc;

  var S = { site: null, nav: [], home: 'golovna', bySlug: {}, md: {}, index: null, token: 0 };

  var ICONS = {
    telegram: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 3.3 2.7 10.6c-1 .4-1 1.1-.2 1.3l4.8 1.5 1.9 5.7c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.4-2.3 4.8 3.5c.9.5 1.5.2 1.7-.8L22.9 4.9c.3-1.2-.4-1.8-1.3-1.6ZM9 13.6l9.4-5.9c.4-.3.8-.1.5.2l-7.8 7-.3 3.4L9 13.6Z"/></svg>',
    facebook: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 9V7.4c0-.7.2-1.2 1.2-1.2H17V3h-2.7C11.6 3 10.5 4.6 10.5 7v2H8v3.2h2.5V21H14v-8.8h2.6l.4-3.2H14Z"/></svg>',
    instagram: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
    youtube: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z"/></svg>',
    link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></svg>'
  };
  var CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  function safeUrl(u) {
    u = String(u || '').trim();
    if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u) || /^tel:/i.test(u)) return u;
    if (R.isRelative(u)) return u;
    return '#';
  }

  /* ---------- дані ---------- */
  function fetchText(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → ' + r.status);
      return r.text();
    });
  }
  function getMd(slug) {
    if (S.md[slug] !== undefined) return Promise.resolve(S.md[slug]);
    return fetchText('content/pages/' + encodeURIComponent(slug) + '.md').then(function (t) { S.md[slug] = t; return t; });
  }
  function walk(list, parent) {
    list.forEach(function (n) {
      n._parent = parent || null;
      if (n.slug) S.bySlug[n.slug] = n;
      if (n.children) walk(n.children, n);
    });
  }
  function visible(list) { return (list || []).filter(function (n) { return !n.hidden; }); }
  function ancestors(node) { var a = []; while (node && node._parent) { a.unshift(node._parent); node = node._parent; } return a; }
  function isStub(md) { return /ще переносяться зі старого сайту/.test(md || ''); }
  function hrefFor(n) { return n.url ? safeUrl(n.url) : '#/' + encodeURIComponent(n.slug); }
  function countPages(n) {
    var c = 0; (n.children || []).forEach(function (k) { c += 1 + countPages(k); }); return c;
  }

  /* ---------- шапка, меню, підвал ---------- */
  function renderChrome() {
    var s = S.site;
    $('#brandTitle').textContent = s.title || '';
    $('#brandSub').textContent = s.subtitle || '';
    if (s.logo) { $('#brandLogo').src = s.logo; $('#brandLogo').alt = ''; } else { $('#brandLogo').remove(); }
    $('#stripAddress').textContent = s.address || '';
    $('#stripSocial').innerHTML = (s.social || []).map(function (l) {
      return '<a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(l.title) + '">' +
        (ICONS[l.icon] || ICONS.link) + '<span>' + esc(l.title) + '</span></a>';
    }).join('');
    $('#footer').innerHTML = (s.footer ? '<div>' + esc(s.footer) + '</div>' : '') + (s.address ? '<div>' + esc(s.address) + '</div>' : '');
  }

  function navItems(list, activeSet, current) {
    return visible(list).map(function (n) {
      var kids = visible(n.children);
      var open = activeSet.has(n.slug);
      var isCur = n.slug && n.slug === current;
      var a;
      if (n.url) a = '<a class="item ext" href="' + esc(safeUrl(n.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(n.title) + '</a>';
      else a = '<a class="item" href="' + (n.slug === S.home ? '#/' : '#/' + encodeURIComponent(n.slug)) + '"' + (isCur ? ' aria-current="page"' : '') + '>' + esc(n.title) + '</a>';
      var toggle = kids.length ? '<button type="button" class="toggle" aria-expanded="' + open + '" aria-label="Розгорнути розділ «' + esc(n.title) + '»">' + CHEVRON + '</button>' : '';
      var sub = kids.length ? '<ul>' + navItems(kids, activeSet, current) + '</ul>' : '';
      return '<li class="' + (kids.length && !open ? 'collapsed' : '') + '"><div class="row">' + a + toggle + '</div>' + sub + '</li>';
    }).join('');
  }
  function renderNav(current) {
    var set = new Set();
    var node = S.bySlug[current];
    if (node) { set.add(node.slug); ancestors(node).forEach(function (a) { set.add(a.slug); }); }
    $('#nav').innerHTML = '<ul class="tree">' + navItems(S.nav, set, current) + '</ul>';
  }

  function setDrawer(open) {
    $('#side').classList.toggle('open', open);
    $('#scrim').classList.toggle('on', open);
    $('#scrim').hidden = !open;
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  }

  /* ---------- сторінки ---------- */
  function crumbs(node) {
    var items = ['<li><a href="#/">Головна</a></li>'];
    ancestors(node).forEach(function (a) {
      items.push('<li><a href="' + hrefFor(a) + '">' + esc(a.title) + '</a></li>');
    });
    items.push('<li aria-current="page">' + esc(node.title) + '</li>');
    return '<nav class="crumbs" aria-label="Ви тут"><ol>' + items.join('') + '</ol></nav>';
  }

  function childrenList(node) {
    var kids = visible(node.children);
    if (!kids.length) return '';
    return '<section class="children" aria-label="Підрозділи"><h2>У цьому розділі</h2><ul>' + kids.map(function (k) {
      if (k.url) {
        return '<li class="child"><div><a class="t" href="' + esc(safeUrl(k.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(k.title) + ' ↗</a><span class="sub">Зовнішнє посилання</span></div></li>';
      }
      var more = countPages(k);
      return '<li class="child" data-slug="' + esc(k.slug) + '"><div><a class="t" href="#/' + encodeURIComponent(k.slug) + '">' + esc(k.title) + '</a>' +
        '<p hidden></p>' + (more ? '<span class="sub">Підрозділів: ' + more + '</span>' : '') + '</div></li>';
    }).join('') + '</ul></section>';
  }

  function fillChildren(root, token) {
    root.querySelectorAll('.child[data-slug]').forEach(function (li) {
      var slug = li.getAttribute('data-slug');
      getMd(slug).then(function (md) {
        if (token !== S.token || isStub(md)) return;
        var ex = R.excerpt(md, 170);
        var p = $('p', li);
        if (ex && p) { p.textContent = ex; p.hidden = false; }
        var img = R.firstImage(md);
        if (img) {
          var el = document.createElement('img');
          el.className = 'thumb'; el.alt = ''; el.loading = 'lazy';
          el.src = R.isRelative(img) ? img : img;
          li.appendChild(el);
        }
      }).catch(function () {});
    });
  }

  function renderInner(node, md, token) {
    var main = $('#content');
    var hasBody = R.plainText(md).length > 0;
    main.innerHTML = crumbs(node) + '<article class="paper"><h1>' + esc(node.title) + '</h1>' +
      (hasBody ? '<div class="prose"></div>' : '') + childrenList(node) + '</article>';
    if (hasBody) {
      var prose = $('.prose', main);
      prose.innerHTML = R.mdToHtml(md);
      R.enhance(prose);
    }
    fillChildren(main, token);
  }

  function renderHome(node, md, token) {
    var s = S.site, main = $('#content');
    var actions = (s.heroActions || []).map(function (a, i) {
      var target = a.slug ? '#/' + encodeURIComponent(a.slug) : safeUrl(a.url);
      return '<a class="btn' + (i === 0 ? ' primary' : '') + '" href="' + esc(target) + '">' + esc(a.title) + '</a>';
    }).join('');
    var html = '<section class="hero"><div><h1>' + esc(s.title) + '</h1>' +
      (s.lead ? '<p class="lead">' + esc(s.lead) + '</p>' : '') +
      (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>' +
      (s.hero ? '<figure class="hero-photo"><img src="' + esc(s.hero) + '" alt="Будівля ' + esc(s.title) + '"></figure>' : '') + '</section>';

    if (R.plainText(md)) html += '<article class="paper home-body"><div class="prose"></div></article>';

    var quick = (s.quick || []).map(function (slug) { return S.bySlug[slug]; }).filter(Boolean);
    if (quick.length) {
      html += '<section class="home-block"><h2>Швидкий доступ</h2><ul class="quick">' + quick.map(function (n) {
        var c = visible(n.children).length;
        return '<li><a href="#/' + encodeURIComponent(n.slug) + '">' + esc(n.title) + (c ? '<small>Розділів: ' + c + '</small>' : '') + '</a></li>';
      }).join('') + '</ul></section>';
    }

    if ((s.banners || []).length) {
      html += '<div class="banners">' + s.banners.map(function (b) {
        return '<a href="' + esc(safeUrl(b.url)) + '" target="_blank" rel="noopener noreferrer" title="' + esc(b.title) + '"><img src="' + esc(b.image) + '" alt="' + esc(b.title) + '"></a>';
      }).join('') + '</div>';
    }

    var vid = s.video && R.youtubeId(s.video.youtube);
    var fb = s.facebookPage && safeUrl(s.facebookPage);
    if (vid || (fb && fb !== '#')) {
      html += '<section class="home-block widgets">';
      html += vid ? '<div class="widget-card"><h3>' + esc(s.video.title || 'Відео') + '</h3><div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/' + vid + '" title="' + esc(s.video.title || 'Відео') + '" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></div>' : '<div></div>';
      if (fb && fb !== '#') {
        html += '<div class="widget-card fb-wrap"><h3>Ліцей у Facebook</h3><iframe class="fb-frame" title="Стрічка Facebook" loading="lazy" src="https://www.facebook.com/plugins/page.php?href=' + encodeURIComponent(fb) + '&tabs=timeline&width=300&height=500&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false"></iframe></div>';
      }
      html += '</section>';
    }

    (s.linkGroups || []).forEach(function (g) {
      if (!(g.items || []).length) return;
      html += '<section class="home-block"><h2>' + esc(g.title) + '</h2><ul class="linkgrid">' + g.items.map(function (it) {
        return '<li><a href="' + esc(safeUrl(it.url)) + '" target="_blank" rel="noopener noreferrer" title="' + esc(it.title) + '">' +
          (it.image ? '<img src="' + esc(it.image) + '" alt="' + esc(it.title) + '" loading="lazy">' : '<span class="noimg">' + esc(it.title) + '</span>') + '</a></li>';
      }).join('') + '</ul></section>';
    });

    main.innerHTML = html;
    var prose = $('.home-body .prose', main);
    if (prose) { prose.innerHTML = R.mdToHtml(md); R.enhance(prose); }
  }

  function renderNotFound(slug) {
    $('#content').innerHTML = '<article class="paper"><h1>Сторінку не знайдено</h1><div class="prose"><p>Такої сторінки немає або її було видалено. Скористайтеся меню або пошуком.</p><p><a href="#/">Перейти на головну</a></p></div></article>';
    document.title = 'Сторінку не знайдено — ' + S.site.title;
  }
  function renderError() {
    $('#content').innerHTML = '<article class="paper"><h1>Не вдалося завантажити сторінку</h1><div class="prose"><p>Перевірте підключення до інтернету й спробуйте ще раз. Якщо помилка повторюється, зверніться до адміністратора сайту.</p></div></article>';
  }

  /* ---------- пошук ---------- */
  function buildIndex() {
    if (S.index) return S.index;
    var nodes = Object.keys(S.bySlug).map(function (k) { return S.bySlug[k]; });
    S.index = Promise.all(nodes.map(function (n) {
      return getMd(n.slug).then(function (md) {
        return { node: n, title: n.title, text: isStub(md) ? '' : R.plainText(md) };
      }).catch(function () { return { node: n, title: n.title, text: '' }; });
    }));
    return S.index;
  }
  function highlight(text, terms) {
    var t = esc(text);
    terms.forEach(function (w) {
      if (!w) return;
      var re = new RegExp('(' + esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      t = t.replace(re, '<mark>$1</mark>');
    });
    return t;
  }
  function renderSearch(q, token) {
    var main = $('#content');
    $('#q').value = q;
    main.innerHTML = '<article class="paper"><h1>Пошук</h1><p class="loading">Шукаємо…</p></article>';
    document.title = 'Пошук — ' + S.site.title;
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) { main.innerHTML = '<article class="paper"><h1>Пошук</h1><p class="empty">Введіть слово або фразу в полі пошуку.</p></article>'; return; }
    buildIndex().then(function (idx) {
      if (token !== S.token) return;
      var res = [];
      idx.forEach(function (it) {
        var hay = (it.title + ' ' + it.text).toLowerCase();
        if (!terms.every(function (w) { return hay.indexOf(w) !== -1; })) return;
        var score = 0, tl = it.title.toLowerCase();
        terms.forEach(function (w) { if (tl.indexOf(w) !== -1) score += 5; });
        score += Math.min(5, terms.reduce(function (a, w) { return a + (it.text.toLowerCase().split(w).length - 1); }, 0));
        var snippet = '';
        var pos = it.text.toLowerCase().indexOf(terms[0]);
        if (pos !== -1) {
          var from = Math.max(0, pos - 60);
          snippet = (from > 0 ? '…' : '') + it.text.slice(from, from + 180) + (from + 180 < it.text.length ? '…' : '');
        }
        res.push({ it: it, score: score, snippet: snippet });
      });
      res.sort(function (a, b) { return b.score - a.score; });
      var list = res.slice(0, 40).map(function (r) {
        var path = ancestors(r.it.node).map(function (a) { return a.title; });
        return '<li><span class="path">' + esc(path.join(' / ')) + '</span><a href="#/' + encodeURIComponent(r.it.node.slug) + '">' + highlight(r.it.title, terms) + '</a>' +
          (r.snippet ? '<p>' + highlight(r.snippet, terms) + '</p>' : '') + '</li>';
      }).join('');
      main.innerHTML = '<article class="paper"><h1>Пошук</h1>' +
        (res.length ? '<p class="empty" style="padding:0 0 18px">Знайдено: ' + res.length + '</p><ul class="results">' + list + '</ul>'
          : '<p class="empty">За запитом «' + esc(q) + '» нічого не знайдено. Спробуйте інше слово.</p>') + '</article>';
    });
  }

  /* ---------- маршрутизація ---------- */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var m = h.match(/^search\/(.*)$/);
    if (m) return { type: 'search', q: decodeURIComponent(m[1]) };
    var slug = decodeURIComponent(h.split('?')[0]).replace(/\/+$/, '');
    return { type: 'page', slug: slug || S.home };
  }

  function route() {
    var r = parseHash();
    var token = ++S.token;
    setDrawer(false);
    if (r.type === 'search') {
      renderNav('');
      renderSearch(r.q, token);
      window.scrollTo(0, 0);
      return;
    }
    var node = S.bySlug[r.slug];
    renderNav(r.slug);
    if (!node) { renderNotFound(r.slug); window.scrollTo(0, 0); return; }
    if (r.slug !== S.home) $('#q').value = '';
    getMd(node.slug).then(function (md) {
      if (token !== S.token) return;
      if (node.slug === S.home) renderHome(node, md, token); else renderInner(node, md, token);
      document.title = node.slug === S.home ? S.site.title : node.title + ' — ' + S.site.title;
      window.scrollTo(0, 0);
    }).catch(function () { if (token === S.token) renderError(); });
  }

  /* ---------- запуск ---------- */
  function boot() {
    fetchText('content/site.json').then(function (t) {
      var data = JSON.parse(t);
      S.site = data.site || {};
      S.nav = data.nav || [];
      S.home = S.site.home || 'golovna';
      walk(S.nav, null);
      renderChrome();
      route();
    }).catch(function () { renderError(); });

    window.addEventListener('hashchange', route);
    $('#nav').addEventListener('click', function (e) {
      var t = e.target.closest('.toggle');
      if (!t) return;
      var li = t.closest('li');
      var open = li.classList.toggle('collapsed') === false;
      t.setAttribute('aria-expanded', String(open));
    });
    $('#menuBtn').addEventListener('click', function () { setDrawer(!$('#side').classList.contains('open')); });
    $('#scrim').addEventListener('click', function () { setDrawer(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setDrawer(false); });
    var mq = window.matchMedia('(max-width: 960px)');
    function placeSearch() {
      var f = $('#searchForm');
      if (mq.matches) $('#side').insertBefore(f, $('#nav')); else $('.head-in').appendChild(f);
    }
    if (mq.addEventListener) mq.addEventListener('change', placeSearch); else mq.addListener(placeSearch);
    placeSearch();
    $('#searchForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('#q').value.trim();
      location.hash = q ? '#/search/' + encodeURIComponent(q) : '#/';
    });
  }
  boot();
})();
