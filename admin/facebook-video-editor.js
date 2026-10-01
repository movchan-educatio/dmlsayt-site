/* Facebook + YouTube video workflow for the visual admin editor.
   Loaded after visual-editor.js. Keeps the core editor untouched and can be removed safely. */
(function (global) {
  'use strict';

  var R = global.SiteRender;
  var V = global.VisualPageEditor;
  if (!R || !V || !V.mount || global.__dmFacebookVideoEditorReady) return;
  global.__dmFacebookVideoEditorReady = true;

  function esc(s) { return R.esc(String(s == null ? '' : s)); }
  function uid() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function videoData(input) {
    var url = String(input || '').trim();
    if (!/^https:\/\//i.test(url)) return null;

    var yt = R.youtubeId && R.youtubeId(url);
    if (yt) {
      return {
        provider: 'youtube',
        url: url,
        preview: 'https://www.youtube-nocookie.com/embed/' + yt,
        title: 'Відео YouTube'
      };
    }

    var fb = R.facebookVideoUrl && R.facebookVideoUrl(url);
    if (fb) {
      return {
        provider: 'facebook',
        url: url,
        preview: fb,
        title: 'Відео Facebook'
      };
    }
    return null;
  }

  function videoRaw(data) {
    var allow = data.provider === 'facebook'
      ? 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share'
      : 'accelerometer; encrypted-media; picture-in-picture';
    var cls = data.provider === 'facebook' ? ' class="facebook-video-frame"' : '';
    return '<iframe' + cls + ' src="' + esc(data.preview) + '" title="' + esc(data.title) + '" allow="' + allow + '" allowfullscreen loading="lazy"></iframe>';
  }

  function improveVideoChoice(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.ve-add-grid button').forEach(function (b) {
      if (b.textContent.trim() === 'Відео') {
        b.textContent = 'Відео Facebook / YouTube';
        b.title = 'Вставити звичайне посилання на Facebook Video, Facebook Reel або YouTube';
      }
    });
  }

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes || [], function (n) {
        if (n.nodeType === 1) improveVideoChoice(n);
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  var originalMount = V.mount;
  V.mount = function (host, opts) {
    var editor = originalMount(host, opts);
    if (!editor || editor.__facebookVideoPatched) return editor;
    editor.__facebookVideoPatched = true;

    editor.addSmartUrl = function (kind, parentModal) {
      var self = this;
      if (kind !== 'video') {
        var u = prompt('Посилання');
        var data = V.smartUrlData(u);
        if (!data) return self.o.toast('Не вдалося розпізнати безпечне посилання', true);
        self.remember();
        self.blocks.push({ id:uid(), type:data.type === 'video' ? 'embed' : data.type === 'google' ? 'document' : 'text', raw:V.smartRaw(data) });
        self.sync(); self.renderBlocks();
        if (parentModal) parentModal.close();
        return;
      }

      var box = document.createElement('div');
      box.className = 've-smart-settings ve-video-settings';
      box.innerHTML =
        '<label class="f"><span>Посилання на відео Facebook або YouTube</span>' +
        '<input id="ve-video-url" type="url" inputmode="url" placeholder="https://www.facebook.com/... або https://youtu.be/..."></label>' +
        '<p class="hint">Підтримуються Facebook Video, Facebook Reels, fb.watch та YouTube. Вставте звичайне посилання на відео.</p>' +
        '<div id="ve-video-check" class="hint">Після вставлення тут з’явиться попередній перегляд.</div>' +
        '<div id="ve-video-preview" class="embed video-embed" hidden></div>';

      var input = box.querySelector('#ve-video-url');
      var check = box.querySelector('#ve-video-check');
      var preview = box.querySelector('#ve-video-preview');
      var current = null;

      function refresh() {
        current = videoData(input.value);
        preview.innerHTML = '';
        preview.hidden = true;
        if (!input.value.trim()) {
          check.textContent = 'Після вставлення тут з’явиться попередній перегляд.';
          return;
        }
        if (!current) {
          check.textContent = 'Це посилання не схоже на підтримуване відео Facebook або YouTube.';
          return;
        }
        check.textContent = '✓ Розпізнано: ' + (current.provider === 'facebook' ? 'Facebook' : 'YouTube');
        var frame = document.createElement('iframe');
        frame.src = current.preview;
        frame.title = current.title;
        frame.loading = 'lazy';
        frame.allow = current.provider === 'facebook'
          ? 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share'
          : 'accelerometer; encrypted-media; picture-in-picture';
        frame.setAttribute('allowfullscreen', '');
        preview.appendChild(frame);
        preview.hidden = false;
      }
      input.addEventListener('input', refresh);
      input.addEventListener('paste', function () { setTimeout(refresh, 0); });

      var m = self.o.modal({
        title: 'Додати відео Facebook / YouTube',
        wide: true,
        build: function (modal) {
          modal.body.appendChild(box);
          var add = document.createElement('button');
          add.type = 'button'; add.className = 'btn primary'; add.textContent = 'Додати відео';
          add.onclick = function () {
            refresh();
            if (!current) return self.o.toast('Вставте коректне посилання на відео Facebook або YouTube', true);
            self.remember();
            self.blocks.push({ id:uid(), type:'embed', raw:videoRaw(current) });
            self.sync(); self.renderBlocks();
            modal.close();
            if (parentModal) parentModal.close();
          };
          modal.foot.appendChild(add);
          setTimeout(function () { input.focus(); }, 50);
        }
      });
      return m;
    };

    return editor;
  };
})(window);
