/* Facebook video/reel embeds for existing Markdown links.
   Additive only: does not change stored content or the editor data model. */
(function (global) {
  'use strict';

  var R = global.SiteRender;
  if (!R || R.__facebookEmbedReady) return;
  R.__facebookEmbedReady = true;

  function facebookVideoUrl(input) {
    var u;
    try { u = new URL(String(input || '').trim(), location.href); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    var host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'facebook.com' && host !== 'm.facebook.com' && host !== 'fb.watch') return null;

    var path = u.pathname || '';
    var looksLikeVideo = host === 'fb.watch' || /\/(?:reel|reels|videos|watch)(?:\/|$)/i.test(path) || u.searchParams.has('v');
    if (!looksLikeVideo) return null;

    return 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(u.href) + '&show_text=false&width=900';
  }

  function upgradeFacebookLinks(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('a[href]').forEach(function (a) {
      if (a.closest('.document-card, .google-document-viewer, .facebook-video-embed') || a.querySelector('img')) return;
      var src = facebookVideoUrl(a.getAttribute('href'));
      if (!src) return;

      var wrap = document.createElement('div');
      wrap.className = 'embed video-embed facebook-video-embed';
      var frame = document.createElement('iframe');
      frame.src = src;
      frame.title = (a.textContent || 'Відео Facebook').trim();
      frame.loading = 'lazy';
      frame.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share';
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('frameborder', '0');
      wrap.appendChild(frame);
      a.parentNode.replaceChild(wrap, a);
    });
  }

  var originalEnhance = R.enhance;
  R.enhance = function (root, opts) {
    if (originalEnhance) originalEnhance(root, opts);
    upgradeFacebookLinks(root);
  };

  var originalMdToHtml = R.mdToHtml;
  R.mdToHtml = function (md) {
    var html = originalMdToHtml ? originalMdToHtml(md) : String(md || '');
    if (typeof document === 'undefined') return html;
    var box = document.createElement('div');
    box.innerHTML = html;
    upgradeFacebookLinks(box);
    return box.innerHTML;
  };

  R.facebookVideoUrl = facebookVideoUrl;
  R.upgradeFacebookLinks = upgradeFacebookLinks;
})(window);
