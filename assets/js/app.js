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

  var QUICK_ICONS = {
    'novyny': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>',
    'prozorist-ta-informatsiina-vidkrytist-zakladu': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    'uchniam-ta-batkam': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'osvitnii-protses': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    'pro-nas': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    'zvorotnii-zviazok': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>'
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
  function pageHref(slug) { return slug === S.home ? './' : '?page=' + encodeURIComponent(slug); }
  function hrefFor(n) { return n.url ? safeUrl(n.url) : pageHref(n.slug); }
  function countPages(n) {
    var c = 0; (n.children || []).forEach(function (k) { c += 1 + countPages(k); }); return c;
  }

  /* ---------- шапка, меню, підвал ---------- */
  function renderChrome() {
    var s = S.site;
    var bTitle = $('#brandTitle');
    var bSub = $('#brandSub');
    var bLogo = $('#brandLogo');
    var sAddr = $('#stripAddress');
    var sSoc = $('#stripSocial');
    var foot = $('#footer');

    if (bTitle) bTitle.textContent = s.title || 'Дмитрушківський ліцей';
    if (bSub) bSub.textContent = s.subtitle || 'Дмитрушківська сільська рада, Уманський район, Черкаська область';
    if (bLogo) {
      if (s.logo) { bLogo.src = s.logo; bLogo.alt = 'Логотип ліцею'; }
      else { bLogo.remove(); }
    }
    if (sAddr) sAddr.textContent = s.address || '20332, Черкаська обл., Уманський р-н., с. Дмитрушки, вул. Петропавлівська, 15';
    if (sSoc) {
      sSoc.innerHTML = (s.social || []).map(function (l) {
        return '<a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(l.title) + '">' +
          (ICONS[l.icon] || ICONS.link) + '<span>' + esc(l.title) + '</span></a>';
      }).join('');
    }

    if (foot) {
      var logoHtml = s.logo ? '<img src="' + esc(s.logo) + '" alt="Логотип" class="footer-logo" width="56" height="46">' : '';
      var socialHtml = (s.social || []).map(function (l) {
        return '<a class="footer-social-link" href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(l.title) + '">' +
          (ICONS[l.icon] || ICONS.link) + '<span>' + esc(l.title) + '</span></a>';
      }).join('');

      foot.innerHTML = 
        '<div class="footer-grid">' +
          '<div class="footer-col footer-brand">' +
            '<div class="footer-brand-header">' +
              logoHtml +
              '<div>' +
                '<h3 class="footer-brand-title">' + esc(s.title || 'Дмитрушківський ліцей') + '</h3>' +
                '<p class="footer-brand-sub">' + esc(s.subtitle || 'Дмитрушківська сільська рада, Уманський район, Черкаська область') + '</p>' +
              '</div>' +
            '</div>' +
            '<p class="footer-desc">' + esc(s.lead || 'Навчання в одну зміну, укриття на 300 осіб, інклюзивні класи.') + '</p>' +
          '</div>' +
          '<div class="footer-col footer-contacts">' +
            '<h4 class="footer-h">Контакти та адреса</h4>' +
            '<p class="footer-address">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>' +
              '<span>' + esc(s.address || '20332, Черкаська обл., Уманський р-н., с. Дмитрушки, вул. Петропавлівська, 15') + '</span>' +
            '</p>' +
            '<div class="footer-social">' + socialHtml + '</div>' +
          '</div>' +
          '<div class="footer-col footer-nav-col">' +
            '<h4 class="footer-h">Швидка навігація</h4>' +
            '<ul class="footer-nav">' +
              '<li><a href="' + esc(pageHref(S.home)) + '">Головна сторінка</a></li>' +
              '<li><a href="' + esc(pageHref('pro-nas')) + '">Про ліцей</a></li>' +
              '<li><a href="' + esc(pageHref('prozorist-ta-informatsiina-vidkrytist-zakladu')) + '">Прозорість та відкритість</a></li>' +
              '<li><a href="' + esc(pageHref('novyny')) + '">Новини ліцею</a></li>' +
              '<li><a href="' + esc(pageHref('zvorotnii-zviazok')) + '">Зворотний зв’язок</a></li>' +
              '<li><a href="admin/" class="footer-admin-link">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
                '<span>Панель керування</span>' +
              '</a></li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
        '<div class="footer-bottom">' +
          '<div class="footer-bottom-in">' +
            '<p class="copyright">© 2026 Дмитрушківський ліцей. Всі права захищені.</p>' +
            '<p class="footer-note">Дмитрушківська сільська рада · Уманський район · Черкаська область</p>' +
          '</div>' +
        '</div>';
    }
  }

  function renderTopNav(current) {
    var topNavEl = $('#topNav');
    if (!topNavEl) return;

    var primarySlugs = [
      'golovna',
      'novyny',
      'pro-nas',
      'prozorist-ta-informatsiina-vidkrytist-zakladu',
      'osvitnii-protses',
      'uchniam-ta-batkam',
      'zvorotnii-zviazok'
    ];

    var primaryNodes = [];
    var otherNodes = [];

    visible(S.nav).forEach(function (n) {
      if (primarySlugs.indexOf(n.slug) !== -1) {
        primaryNodes.push(n);
      } else {
        otherNodes.push(n);
      }
    });

    primaryNodes.sort(function (a, b) {
      return primarySlugs.indexOf(a.slug) - primarySlugs.indexOf(b.slug);
    });

    var itemsHtml = primaryNodes.map(function (n) {
      var kids = visible(n.children);
      var isCur = n.slug && (n.slug === current || (n.slug === S.home && (!current || current === S.home)));
      var hasKids = kids.length > 0;
      var href = pageHref(n.slug);

      var dropHtml = '';
      if (hasKids) {
        var isMega = kids.length > 7;
        dropHtml = '<div class="dropdown-menu' + (isMega ? ' mega-menu' : '') + '"><ul>' +
          kids.map(function (k) {
            var kHref = hrefFor(k);
            var isExt = !!k.url;
            var isKidCur = k.slug && k.slug === current;
            return '<li><a href="' + esc(kHref) + '"' + (isExt ? ' target="_blank" rel="noopener noreferrer"' : '') + (isKidCur ? ' class="active"' : '') + '>' +
              esc(k.title) + (isExt ? ' ↗' : '') + '</a></li>';
          }).join('') +
          '</ul></div>';
      }

      return '<li class="top-nav-item' + (hasKids ? ' has-dropdown' : '') + (isCur ? ' active' : '') + '">' +
        '<a class="top-nav-link" href="' + esc(href) + '"' + (isCur ? ' aria-current="page"' : '') + '>' +
          esc(n.title) + (hasKids ? ' <span class="drop-arrow">▾</span>' : '') +
        '</a>' + dropHtml + '</li>';
    }).join('');

    if (otherNodes.length) {
      var moreDropHtml = '<div class="dropdown-menu mega-menu"><ul>' +
        otherNodes.map(function (k) {
          var kHref = hrefFor(k);
          var isExt = !!k.url;
          var isOtherCur = k.slug && k.slug === current;
          return '<li><a href="' + esc(kHref) + '"' + (isExt ? ' target="_blank" rel="noopener noreferrer"' : '') + (isOtherCur ? ' class="active"' : '') + '>' +
            esc(k.title) + (isExt ? ' ↗' : '') + '</a></li>';
        }).join('') +
        '</ul></div>';

      itemsHtml += '<li class="top-nav-item has-dropdown more-item">' +
        '<button type="button" class="top-nav-link more-btn">Всі розділи <span class="drop-arrow">▾</span></button>' +
        moreDropHtml + '</li>';
    }

    topNavEl.innerHTML = '<ul class="top-nav-list">' + itemsHtml + '</ul>';
  }

  function navItems(list, activeSet, current) {
    return visible(list).map(function (n) {
      var kids = visible(n.children);
      var open = activeSet.has(n.slug);
      var isCur = n.slug && n.slug === current;
      var a;
      if (n.url) a = '<a class="item ext" href="' + esc(safeUrl(n.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(n.title) + '</a>';
      else a = '<a class="item" href="' + esc(pageHref(n.slug)) + '"' + (isCur ? ' aria-current="page"' : '') + '>' + esc(n.title) + '</a>';
      var toggle = kids.length ? '<button type="button" class="toggle" aria-expanded="' + open + '" aria-label="Розгорнути розділ «' + esc(n.title) + '»">' + CHEVRON + '</button>' : '';
      var sub = kids.length ? '<ul>' + navItems(kids, activeSet, current) + '</ul>' : '';
      return '<li class="' + (kids.length && !open ? 'collapsed' : '') + '"><div class="row">' + a + toggle + '</div>' + sub + '</li>';
    }).join('');
  }
  function renderNav(current) {
    var set = new Set();
    var node = S.bySlug[current];
    if (node) { set.add(node.slug); ancestors(node).forEach(function (a) { set.add(a.slug); }); }
    var navEl = $('#nav');
    if (navEl) {
      navEl.innerHTML = '<ul class="tree">' + navItems(S.nav, set, current) + '</ul>';
    }
  }

  function setDrawer(open) {
    var side = $('#side');
    var scrim = $('#scrim');
    var btn = $('#menuBtn');
    var wasOpen = side && side.classList.contains('open');
    if (side) side.classList.toggle('open', open);
    if (scrim) {
      scrim.classList.toggle('on', open);
      scrim.hidden = !open;
    }
    if (btn) btn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('drawer-open', open);
    if (open && side) {
      side.setAttribute('aria-modal', 'true');
      setTimeout(function () {
        var first = $('#drawerClose') || side.querySelector('a, button, input, [tabindex]:not([tabindex="-1"])');
        if (first) first.focus();
      }, 120);
    } else if (side) {
      side.removeAttribute('aria-modal');
      if (wasOpen && btn && window.matchMedia('(max-width: 960px)').matches) btn.focus();
    }
  }

  function trapDrawerFocus(e) {
    var side = $('#side');
    if (e.key !== 'Tab' || !side || !side.classList.contains('open')) return;
    var focusable = Array.prototype.filter.call(
      side.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (el) { return el.offsetParent !== null; }
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------- сторінки ---------- */
  function crumbs(node) {
    var items = ['<li><a href="' + esc(pageHref(S.home)) + '">Головна</a></li>'];
    ancestors(node).forEach(function (a) {
      items.push('<li><a href="' + hrefFor(a) + '">' + esc(a.title) + '</a></li>');
    });
    items.push('<li aria-current="page">' + esc(node.title) + '</li>');
    return '<nav class="crumbs" aria-label="Ви тут"><ol>' + items.join('') + '</ol></nav>';
  }

  function childrenList(node) {
    var kids = visible(node.children);
    if (!kids.length) return '';
    return '<section class="children" aria-label="Підрозділи">' +
      '<div class="section-head"><h2 class="children-title">У цьому розділі</h2><span class="gold-line"></span></div>' +
      '<ul class="children-grid">' + kids.map(function (k) {
      if (k.url) {
        return '<li class="child child-card"><div><a class="t" href="' + esc(safeUrl(k.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(k.title) + ' ↗</a><span class="sub">Зовнішнє посилання</span></div></li>';
      }
      var more = countPages(k);
      return '<li class="child child-card" data-slug="' + esc(k.slug) + '"><div><a class="t" href="' + esc(pageHref(k.slug)) + '">' + esc(k.title) + '</a>' +
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

  function imagesFromMarkdown(md) {
    var found = [];
    var seen = new Set();
    function add(src) {
      src = String(src || '').trim().replace(/^<|>$/g, '');
      if (!/^uploads\/pages\//i.test(src) || !/\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(src) || seen.has(src)) return;
      seen.add(src);
      found.push(src);
    }
    String(md || '').replace(/!\[[^\]]*\]\((?:<)?([^)>\s]+)(?:>)?(?:\s+["'][^"']*["'])?\)/g, function (_, src) { add(src); return _; });
    String(md || '').replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, function (_, src) { add(src); return _; });
    return found;
  }

  function populateCampusLife(root, token, seedPhotos) {
    if (!root) return;
    var seen = new Set((seedPhotos || []).map(function (photo) { return photo.src; }));
    var nodes = Object.keys(S.bySlug).map(function (slug) { return S.bySlug[slug]; });
    var work = function () {
      Promise.all(nodes.map(function (node) {
        return getMd(node.slug).then(function (pageMd) {
          return imagesFromMarkdown(pageMd).map(function (src) {
            return { src: src, slug: node.slug, title: node.title };
          });
        }).catch(function () { return []; });
      })).then(function (groups) {
        if (token !== S.token || !root.isConnected) return;
        var fragment = document.createDocumentFragment();
        groups.forEach(function (photos) {
          photos.forEach(function (photo) {
            if (seen.has(photo.src)) return;
            seen.add(photo.src);
            var link = document.createElement('a');
            link.className = 'campus-photo';
            link.href = pageHref(photo.slug);
            link.innerHTML = '<img src="' + esc(photo.src) + '" alt="' + esc(photo.title) + '" loading="lazy" decoding="async">' +
              '<span>' + esc(photo.title) + '</span>';
            fragment.appendChild(link);
          });
        });
        root.appendChild(fragment);
        root.setAttribute('aria-label', 'Фотографії з життя ліцею: ' + seen.size);
      });
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(work, { timeout: 1200 });
    else setTimeout(work, 250);
  }

  function enhanceNews(prose) {
    var items = Array.prototype.slice.call(prose.children);
    if (!items.length) return;

    var feed = document.createElement('div');
    feed.className = 'news-feed';
    prose.insertBefore(feed, items[0]);
    var card = null;

    function startCard(extraClass) {
      card = document.createElement('section');
      card.className = 'news-card' + (extraClass ? ' ' + extraClass : '');
      feed.appendChild(card);
      return card;
    }

    items.forEach(function (item) {
      if (item.classList && item.classList.contains('doc-card')) {
        card = null;
        item.classList.add('news-document-card');
        feed.appendChild(item);
        return;
      }

      if (item.tagName === 'H2') {
        var onlyHeadings = card && !card.querySelector(':scope > :not(h2)');
        if (!onlyHeadings) startCard('news-titled-card');
      } else if (!card) {
        startCard('news-article-card');
      }
      card.appendChild(item);
    });
  }

  function calendarMarkup() {
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    var weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
    var firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var cells = '';
    var i;

    for (i = 0; i < firstDay; i += 1) cells += '<span class="page-calendar-empty" aria-hidden="true"></span>';
    for (i = 1; i <= daysInMonth; i += 1) {
      cells += '<span class="page-calendar-day' + (i === now.getDate() ? ' is-today' : '') + '"' +
        (i === now.getDate() ? ' aria-current="date"' : '') + '>' + i + '</span>';
    }

    return '<aside class="page-calendar" aria-label="Календар на ' + monthNames[month].toLowerCase() + ' ' + year + ' року">' +
      '<div class="page-calendar-head"><span>Календар</span><strong>' + monthNames[month] + ' ' + year + '</strong></div>' +
      '<div class="page-calendar-grid page-calendar-weekdays">' + weekdays.map(function (day) { return '<span>' + day + '</span>'; }).join('') + '</div>' +
      '<div class="page-calendar-grid">' + cells + '</div>' +
    '</aside>';
  }

  function renderInner(node, md, token) {
    var main = $('#content');
    var hasMedia = /!\[[^\]]*\]\([^)]+\)|<(?:img|iframe)\b/i.test(md || '');
    var hasBody = R.plainText(md).length > 0 || hasMedia || (md && md.indexOf('feedback-root') !== -1);
    var imageCount = ((md || '').match(/!\[[^\]]*\]\([^)]+\)|<img\b/gi) || []).length;
    var iframeCount = ((md || '').match(/<iframe\b/gi) || []).length;
    var fileCount = ((md || '').match(/\.(?:pdf|docx?|xlsx?|pptx?|odt|ods|rtf)(?:[)#?\s"']|$)/gi) || []).length;
    var layoutType = node.slug === 'novyny' || node.slug === 'arkhiv' ? 'layout-news' :
      iframeCount ? 'layout-embed' : fileCount > 1 ? 'layout-documents' : imageCount > 2 ? 'layout-gallery' : 'layout-editorial';
    main.innerHTML = crumbs(node) + '<article class="paper ' + layoutType + '" data-page="' + esc(node.slug) + '">' +
      '<header class="paper-header">' +
        '<h1>' + esc(node.title) + '</h1>' +
        '<div class="paper-gold-bar"></div>' +
      '</header>' +
      (hasBody ? '<div class="prose"></div>' : '') +
      childrenList(node) + '</article>';
    if (hasBody) {
      var prose = $('.prose', main);
      prose.innerHTML = R.mdToHtml(md);
      R.enhance(prose);
      if (node.slug === 'novyny') enhanceNews(prose);
      if (node.slug === 'blohy-vchyteliv') {
        var blogItems = Array.prototype.filter.call(prose.children, function (el) {
          return el.tagName === 'P' && el.querySelector(':scope > a > img');
        });
        if (blogItems.length) {
          var blogGrid = document.createElement('div');
          blogGrid.className = 'teacher-blog-links';
          blogItems[0].parentNode.insertBefore(blogGrid, blogItems[0]);
          blogItems.forEach(function (item) { blogGrid.appendChild(item); });
        }
        var portalLink = prose.querySelector('a[href="https://history-geography-portal.vercel.app/index.html"]');
        if (portalLink) {
          portalLink.classList.add('education-portal-link');
          portalLink.insertAdjacentHTML('afterbegin', '<span class="education-portal-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H11a2 2 0 0 1 2 2v15a2.5 2.5 0 0 0-2.5-2.5H3Z"/><path d="M21 5.5A2.5 2.5 0 0 0 18.5 3H13v17a2.5 2.5 0 0 1 2.5-2.5H21Z"/><circle cx="17" cy="8" r="2.25"/><path d="M14.9 8h4.2M17 5.75c.7.65 1.05 1.4 1.05 2.25S17.7 9.6 17 10.25M17 5.75c-.7.65-1.05 1.4-1.05 2.25S16.3 9.6 17 10.25"/></svg></span>');
        }
      }
      if (node.slug === 'zvorotnii-zviazok' || prose.querySelector('#feedback-root')) {
        var fbRoot = prose.querySelector('#feedback-root') || prose;
        if (window.FeedbackModule && window.FeedbackModule.mount) {
          window.FeedbackModule.mount(fbRoot);
        }
        var socialItems = Array.prototype.filter.call(prose.children, function (el) {
          return el.tagName === 'P' && el.querySelector(':scope > a > img');
        });
        if (socialItems.length) {
          var socialRow = document.createElement('div');
          socialRow.className = 'feedback-social-links';
          socialItems[0].parentNode.insertBefore(socialRow, socialItems[0]);
          socialItems.forEach(function (item) { socialRow.appendChild(item); });
        }
      }
    }
    fillChildren(main, token);
  }

  function renderHome(node, md, token) {
    var s = S.site, main = $('#content');
    var actions = (s.heroActions || []).map(function (a, i) {
      var target = a.slug ? pageHref(a.slug) : safeUrl(a.url);
      return '<a class="btn' + (i === 0 ? ' primary' : ' outline') + '" href="' + esc(target) + '">' +
        '<span>' + esc(a.title) + '</span>' + (i === 0 ? ' <span class="arrow">→</span>' : '') + '</a>';
    }).join('');

    var html = '<section class="hero editorial-hero reveal-on-scroll">' +
      '<div class="hero-left">' +
        '<span class="hero-kicker">Освіта · розвиток · безпека</span>' +
        '<h1 class="hero-title">' + esc(s.title) + '</h1>' +
        (s.lead ? '<p class="hero-lead">' + esc(s.lead) + '</p>' : '') +
        (actions ? '<div class="hero-actions">' + actions + '</div>' : '') +
      '</div>' +
      (s.hero ? 
        '<figure class="hero-photo">' +
          '<div class="hero-photo-frame">' +
            '<img src="' + esc(s.hero) + '" alt="Будівля ' + esc(s.title) + '" loading="eager" fetchpriority="high" decoding="async">' +
            '<figcaption class="hero-photo-caption">' +
              '<span class="caption-dot"></span>' +
              '<span>Сучасний та безпечний освітній простір</span>' +
            '</figcaption>' +
          '</div>' +
        '</figure>' : '') +
    '</section>';

    var quick = (s.quick || []).map(function (slug) { return S.bySlug[slug]; }).filter(Boolean);
    if (quick.length) {
      html += '<div class="home-dashboard"><section class="home-block quick-block reveal-on-scroll">' +
        '<div class="block-header">' +
          '<h2 class="block-title">Швидкий доступ</h2>' +
        '</div>' +
        '<ul class="quick-grid">' + quick.map(function (n) {
          var icon = QUICK_ICONS[n.slug] || '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m10 8 4 4-4 4"/></svg>';
          return '<li class="quick-item">' +
            '<a href="' + esc(pageHref(n.slug)) + '" class="quick-card">' +
              '<div class="quick-card-top">' +
                '<div class="quick-icon-wrap">' + icon + '</div>' +
                '<span class="quick-arrow-circle" aria-hidden="true">' +
                  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
                '</span>' +
              '</div>' +
              '<div class="quick-card-body">' +
                '<h3 class="quick-card-title">' + esc(n.title) + '</h3>' +
              '</div>' +
              '<div class="quick-card-bar"></div>' +
            '</a>' +
          '</li>';
        }).join('') + '</ul></section>';

      var newsNode = S.bySlug.novyny;
      var latestNews = newsNode ? visible(newsNode.children).slice(0, 4) : [];
      if (latestNews.length) {
        html += '<section class="home-block news-digest reveal-on-scroll" aria-labelledby="newsDigestTitle">' +
          '<div class="block-header"><h2 class="block-title" id="newsDigestTitle">Актуальне</h2></div>' +
          '<div class="news-digest-list">' + latestNews.map(function (n, i) {
            return '<a class="news-digest-item" href="' + esc(pageHref(n.slug)) + '">' +
              '<span>' + esc(n.title) + '</span><span class="news-digest-arrow" aria-hidden="true">↗</span>' +
            '</a>';
          }).join('') + '</div>' +
          '<a class="text-link" href="' + esc(pageHref('novyny')) + '">Усі новини <span aria-hidden="true">→</span></a>' +
        '</section>';
      }
      html += '</div>';
    }

    if (R.plainText(md)) {
      var lifePhotos = [
        { src: 'uploads/pages/osvitnii-protses/image-1.jpg', slug: 'osvitnii-protses', title: 'Освітній процес' },
        { src: 'uploads/pages/osvitnii-protses/image-7.jpg', slug: 'osvitnii-protses', title: 'Освітній процес' },
        { src: 'uploads/pages/hurtkova-robota/image-2.jpg', slug: 'hurtkova-robota', title: 'Гурткова робота' },
        { src: 'uploads/pages/novyny/image-1.jpg', slug: 'novyny', title: 'Новини ліцею' },
        { src: 'uploads/pages/osvitnii-protses/image-12.jpg', slug: 'osvitnii-protses', title: 'Освітній процес' },
        { src: 'uploads/pages/hurtkova-robota/image-6.jpg', slug: 'hurtkova-robota', title: 'Гурткова робота' }
      ];
      html += '<section class="home-block about-block reveal-on-scroll">' +
        '<aside class="about-aside">' +
          '<div class="block-header">' +
            '<h2 class="block-title">Про ліцей</h2>' +
          '</div>' +
          '<div class="campus-life-head"><span>Життя ліцею</span><span aria-hidden="true">↕</span></div>' +
          '<div class="campus-life" role="region" aria-label="Фотографії з життя ліцею" aria-live="polite" tabindex="0">' +
            lifePhotos.map(function (photo, i) {
              return '<a class="campus-photo" href="' + esc(pageHref(photo.slug)) + '">' +
                '<img src="' + esc(photo.src) + '" alt="' + esc(photo.title) + ' — фото ' + (i + 1) + '" loading="lazy" decoding="async">' +
                '<span>' + esc(photo.title) + '</span>' +
              '</a>';
            }).join('') +
          '</div>' +
          calendarMarkup() +
        '</aside>' +
        '<article class="paper home-body"><div class="prose"></div></article>' +
      '</section>';
    }

    if ((s.banners || []).length) {
      html += '<section class="home-block banners-block reveal-on-scroll">' +
        '<div class="banners">' + s.banners.map(function (b) {
          return '<a href="' + esc(safeUrl(b.url)) + '" target="_blank" rel="noopener noreferrer" title="' + esc(b.title) + '" class="banner-card">' +
            '<img src="' + esc(b.image) + '" alt="' + esc(b.title) + '" loading="lazy" decoding="async">' +
            '<span class="banner-title">' + esc(b.title) + ' ↗</span>' +
          '</a>';
        }).join('') + '</div></section>';
    }

    var vid = s.video && R.youtubeId(s.video.youtube);
    var fb = s.facebookPage && safeUrl(s.facebookPage);
    if (vid || (fb && fb !== '#')) {
      html += '<section class="home-block widgets-block reveal-on-scroll">' +
        '<div class="block-header">' +
          '<h2 class="block-title">Медіа та соціальні мережі</h2>' +
        '</div>' +
        '<div class="widgets">';
      html += vid ? '<div class="widget-card video-card"><h3 class="widget-title">' + esc(s.video.title || 'Відео про ліцей') + '</h3><div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/' + vid + '" title="' + esc(s.video.title || 'Відео') + '" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></div>' : '';
      if (fb && fb !== '#') {
        html += '<div class="widget-card fb-wrap"><h3 class="widget-title">Офіційна сторінка у Facebook</h3><iframe class="fb-frame" title="Стрічка Facebook" loading="lazy" src="https://www.facebook.com/plugins/page.php?href=' + encodeURIComponent(fb) + '&tabs=timeline&width=500&height=420&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false"></iframe></div>';
      }
      html += '</div></section>';
    }

    (s.linkGroups || []).forEach(function (g) {
      if (!(g.items || []).length) return;
      html += '<section class="home-block links-block reveal-on-scroll">' +
        '<div class="block-header">' +
          '<h2 class="block-title">' + esc(g.title) + '</h2>' +
        '</div>' +
        '<ul class="linkgrid">' + g.items.map(function (it) {
          return '<li><a href="' + esc(safeUrl(it.url)) + '" target="_blank" rel="noopener noreferrer" title="' + esc(it.title) + '" class="partner-card">' +
            (it.image ? '<img src="' + esc(it.image) + '" alt="' + esc(it.title) + '" loading="lazy" decoding="async">' : '<span class="noimg">' + esc(it.title) + '</span>') +
          '</a></li>';
        }).join('') + '</ul></section>';
    });

    main.innerHTML = html;
    var prose = $('.home-body .prose', main);
    if (prose) { prose.innerHTML = R.mdToHtml(md); R.enhance(prose); }
    populateCampusLife($('.campus-life', main), token, lifePhotos || []);
  }

  function renderNotFound(slug) {
    $('#content').innerHTML = '<article class="paper"><h1>Сторінку не знайдено</h1><div class="prose"><p>Такої сторінки немає або її було видалено. Скористайтеся меню або пошуком.</p><p><a href="./">Перейти на головну</a></p></div></article>';
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
        return '<li><span class="path">' + esc(path.join(' / ')) + '</span><a href="' + esc(pageHref(r.it.node.slug)) + '">' + highlight(r.it.title, terms) + '</a>' +
          (r.snippet ? '<p>' + highlight(r.snippet, terms) + '</p>' : '') + '</li>';
      }).join('');
      main.innerHTML = '<article class="paper"><h1>Пошук</h1>' +
        (res.length ? '<p class="empty" style="padding:0 0 18px">Знайдено: ' + res.length + '</p><ul class="results">' + list + '</ul>'
          : '<p class="empty">За запитом «' + esc(q) + '» нічого не знайдено. Спробуйте інше слово.</p>') + '</article>';
    });
  }

  /* ---------- маршрутизація ---------- */
  function parseRoute() {
    var raw = location.hash;
    if (!raw) {
      var params = new URLSearchParams(location.search);
      var query = params.get('search');
      if (query) return { type: 'search', q: query };
      return { type: 'page', slug: params.get('page') || S.home, anchor: params.get('anchor') || '' };
    }
    var h = raw.replace(/^#\/?/, '');
    var m = h.match(/^search\/(.*)$/);
    if (m) return { type: 'search', q: decodeURIComponent(m[1]) };

    var anchor = '';
    var hashParts = h.split('#');
    if (hashParts.length > 1) {
      h = hashParts[0];
      anchor = hashParts[1];
    }
    var slug = decodeURIComponent(h.split('?')[0]).replace(/\/+$/, '');

    // Якщо хеш без префіксу #/ веде на внутрішній якір (наприклад #h.vnlaleksf2b1)
    if (raw.indexOf('#/') !== 0 && slug.indexOf('h.') === 0) {
      if (!S.bySlug[slug]) {
        return { type: 'anchor', anchor: slug, slug: S.currentSlug || S.home };
      }
    }

    return { type: 'page', slug: slug || S.home, anchor: anchor };
  }

  function setMeta(selector, attr, value) {
    var el = document.head.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  }

  function updatePageMeta(node, md) {
    var isHome = node.slug === S.home;
    var title = isHome ? S.site.title + ' — офіційний сайт' : node.title + ' — ' + S.site.title;
    var description = isHome
      ? 'Офіційний сайт Дмитрушківського ліцею: новини, документи, освітній процес, інформація для учнів і батьків.'
      : (R.excerpt(md, 158) || S.site.lead || 'Офіційний сайт Дмитрушківського ліцею.');
    var root = new URL('./', location.href);
    root.hash = '';
    root.search = '';
    var canonical = isHome ? root.href : root.href + '?page=' + encodeURIComponent(node.slug);
    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:url"]', 'content', canonical);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('link[rel="canonical"]', 'href', canonical);
  }

  /* ---------- Scroll Reveal Micro-Animation ---------- */
  function setupScrollReveal() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal-on-scroll').forEach(function (el) {
        el.classList.add('is-revealed');
      });
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.reveal-on-scroll').forEach(function (el) {
        el.classList.add('is-revealed');
      });
      return;
    }
    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target);
        }
      });
    // A percentage threshold can never be reached for very tall articles on
    // small screens (for example, 8% of the news archive is taller than the
    // viewport). Reveal as soon as the element actually enters the viewport.
    }, { threshold: 0, rootMargin: '0px 0px -30px 0px' });

    document.querySelectorAll('.reveal-on-scroll:not(.is-revealed)').forEach(function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add('is-revealed');
      } else {
        observer.observe(el);
      }
    });
  }

  function route() {
    var r = parseRoute();
    var token = ++S.token;
    setDrawer(false);
    if (r.type === 'search') {
      renderNav('');
      renderTopNav('');
      renderSearch(r.q, token);
      setupScrollReveal();
      window.scrollTo(0, 0);
      return;
    }
    if (r.type === 'anchor') {
      var aTarget = document.getElementById(r.anchor) || document.querySelector('[name="' + CSS.escape(r.anchor) + '"]');
      if (aTarget) {
        aTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    var node = S.bySlug[r.slug];
    renderNav(r.slug);
    renderTopNav(r.slug);
    var isHome = !r.slug || r.slug === S.home;
    var layoutEl = $('.layout');
    if (layoutEl) {
      layoutEl.classList.toggle('is-home', isHome);
      layoutEl.classList.toggle('is-inner', !isHome);
    }
    if (!node) { renderNotFound(r.slug); window.scrollTo(0, 0); return; }
    if (r.slug !== S.home) $('#q').value = '';
    S.currentSlug = node.slug;
    getMd(node.slug).then(function (md) {
      if (token !== S.token) return;
      if (node.slug === S.home) renderHome(node, md, token); else renderInner(node, md, token);
      updatePageMeta(node, md);
      setupScrollReveal();
      if (r.anchor) {
        setTimeout(function () {
          var target = document.getElementById(r.anchor) || document.querySelector('[name="' + CSS.escape(r.anchor) + '"]');
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      } else {
        window.scrollTo(0, 0);
      }
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
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (href && !href.startsWith('#/')) {
        var targetId = href.replace(/^#/, '');
        var targetEl = document.getElementById(targetId) || document.querySelector('[name="' + CSS.escape(targetId) + '"]');
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
    $('#nav').addEventListener('click', function (e) {
      var t = e.target.closest('.toggle');
      if (!t) return;
      var li = t.closest('li');
      var open = li.classList.toggle('collapsed') === false;
      t.setAttribute('aria-expanded', String(open));
    });
    $('#menuBtn').addEventListener('click', function () { setDrawer(!$('#side').classList.contains('open')); });
    var closeBtn = $('#drawerClose');
    if (closeBtn) closeBtn.addEventListener('click', function () { setDrawer(false); });
    $('#scrim').addEventListener('click', function () { setDrawer(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setDrawer(false);
      else trapDrawerFocus(e);
    });
    var mq = window.matchMedia('(max-width: 960px)');
    function placeSearch() {
      var f = $('#searchForm');
      if (mq.matches) $('#side').insertBefore(f, $('#nav')); else {
        var headSearchWrap = $('.head-search-wrap') || $('.head-in');
        headSearchWrap.appendChild(f);
      }
    }
    if (mq.addEventListener) mq.addEventListener('change', placeSearch); else mq.addListener(placeSearch);
    placeSearch();
    var lastScroll = window.scrollY;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      document.body.classList.toggle('has-scrolled', y > 18);
      document.body.classList.toggle('header-hidden', y > lastScroll && y > 180 && !document.body.classList.contains('drawer-open'));
      lastScroll = y;
    }, { passive: true });
    $('#searchForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = $('#q').value.trim();
      location.href = q ? '?search=' + encodeURIComponent(q) : './';
    });
  }
  boot();
})();
