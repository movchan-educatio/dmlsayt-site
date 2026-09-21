/* Спільна бібліотека: Markdown → безпечний HTML, транслітерація, допоміжні функції.
   Використовується і сайтом, і адмін-панеллю (перегляд). */
(function (global) {
  'use strict';

  // Дозволені джерела для вбудованих елементів (відео, документи, форми, карти).
  var IFRAME_HOSTS = [
    'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',
    'drive.google.com', 'docs.google.com', 'forms.gle',
    'www.google.com', 'maps.google.com',
    'www.facebook.com', 'player.vimeo.com'
  ];

  var hooksReady = false;
  function setupHooks() {
    if (hooksReady || !global.DOMPurify) return;
    hooksReady = true;
    global.DOMPurify.addHook('afterSanitizeAttributes', function (node) {
      if (node.tagName === 'IFRAME') {
        var ok = false;
        try {
          var u = new URL(node.getAttribute('src') || '', location.href);
          ok = u.protocol === 'https:' && IFRAME_HOSTS.indexOf(u.hostname) !== -1;
          if (u.hostname === 'www.google.com' && u.pathname.indexOf('/maps/embed') !== 0) ok = false;
        } catch (e) { ok = false; }
        if (!ok) { node.remove(); return; }
        node.setAttribute('loading', 'lazy');
        node.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      }
      if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  function mdToHtml(md) {
    setupHooks();
    var raw = global.marked.parse(md || '', { gfm: true, breaks: false });
    return global.DOMPurify.sanitize(raw, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'loading', 'target', 'referrerpolicy'],
      FORBID_TAGS: ['style', 'script', 'form', 'input', 'button', 'object', 'embed', 'link', 'meta']
    });
  }

  function isRelative(u) {
    return u && !/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(u);
  }

  var FILE_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|csv|zip|rar|7z|txt|rtf)(?:[?#].*)?$/i;

  /* Доопрацювання вже вставленого в DOM вмісту: шляхи, зовнішні посилання, файли, таблиці, зображення. */
  function enhance(root, opts) {
    opts = opts || {};
    var base = opts.base || '';
    var resolve = opts.resolve || function (p) { return base + p; };

    root.querySelectorAll('img').forEach(function (img) {
      var src = img.getAttribute('src');
      if (isRelative(src)) img.setAttribute('src', resolve(src));
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      if (!img.closest('a')) {
        var a = document.createElement('a');
        a.href = img.getAttribute('src');
        a.target = '_blank'; a.rel = 'noopener';
        a.className = 'zoom';
        img.parentNode.insertBefore(a, img);
        a.appendChild(img);
      }
    });

    root.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (isRelative(href)) { a.setAttribute('href', resolve(href)); href = a.getAttribute('href'); }
      var ext = href.match(FILE_EXT);
      if (ext && !a.querySelector('img')) a.setAttribute('data-ext', ext[1].toLowerCase());
      else if (/^https?:\/\/(drive|docs)\.google\.com\//.test(href) && !a.querySelector('img')) a.setAttribute('data-ext', 'google');
      if (/^https?:\/\//i.test(href) && href.indexOf(location.origin) !== 0) {
        a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer');
      }
    });

    root.querySelectorAll('table').forEach(function (t) {
      if (t.parentNode.classList.contains('table-wrap')) return;
      var w = document.createElement('div'); w.className = 'table-wrap';
      t.parentNode.insertBefore(w, t); w.appendChild(t);
    });

    root.querySelectorAll('iframe').forEach(function (f) {
      if (f.parentNode.classList.contains('embed')) return;
      var src = f.getAttribute('src') || '';
      var w = document.createElement('div');
      w.className = 'embed' + (/drive\.google\.com|docs\.google\.com\/(document|spreadsheets|presentation|viewer)/.test(src) ? ' embed-doc' : '');
      if (/docs\.google\.com\/forms/.test(src)) w.className = 'embed embed-form';
      f.removeAttribute('width'); f.removeAttribute('height');
      f.parentNode.insertBefore(w, f); w.appendChild(f);
    });
  }

  /* Текст без розмітки — для пошуку та коротких описів. */
  function plainText(md) {
    return String(md || '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^>\s?/gm, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[*_`~|]/g, '')
      .replace(/^\s*[-+]\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function excerpt(md, n) {
    var t = plainText(md);
    if (t.length <= n) return t;
    return t.slice(0, n).replace(/\s+\S*$/, '') + '…';
  }
  function firstImage(md) {
    var m = String(md || '').match(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/) || String(md || '').match(/<img[^>]+src="([^"]+)"/i);
    return m ? m[1] : null;
  }

  /* Українська транслітерація (за мотивами КМУ 2010) для адрес сторінок і імен файлів. */
  var TL = { 'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie','ж':'zh','з':'z','и':'y','і':'i','ї':'i','й':'i',
    'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch',
    'ш':'sh','щ':'shch','ь':'','ю':'iu','я':'ia','ъ':'','ы':'y','э':'e','ё':'io' };
  function slugify(text, maxlen) {
    maxlen = maxlen || 56;
    var t = String(text || '').toLowerCase().replace(/['’ʼ]/g, '');
    var out = '';
    for (var i = 0; i < t.length; i++) out += (TL.hasOwnProperty(t[i]) ? TL[t[i]] : t[i]);
    out = out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (out.length > maxlen) {
      out = out.slice(0, maxlen).replace(/-[^-]*$/, '');
      var parts = out.split('-');
      while (parts.length > 2 && parts[parts.length - 1].length <= 2) parts.pop();
      out = parts.join('-');
    }
    return out || 'storinka';
  }
  function safeFileName(name) {
    var m = String(name).match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/);
    var stem = slugify(m[1] || 'file', 60);
    return stem + (m[2] ? m[2].toLowerCase() : '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function youtubeId(input) {
    var s = String(input || '').trim();
    var m = s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null;
  }
  function driveId(input) {
    var m = String(input || '').match(/\/d\/([A-Za-z0-9_-]+)/) || String(input || '').match(/[?&]id=([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  global.SiteRender = {
    mdToHtml: mdToHtml, enhance: enhance, plainText: plainText, excerpt: excerpt, firstImage: firstImage,
    slugify: slugify, safeFileName: safeFileName, esc: esc, youtubeId: youtubeId, driveId: driveId,
    isRelative: isRelative, IFRAME_HOSTS: IFRAME_HOSTS
  };
})(window);
