/* Resilient loading for the site's own JSON/Markdown content.
   This does not change rendering, content, routes, admin or design. */
(function () {
  'use strict';
  if (!window.fetch) return;

  var nativeFetch = window.fetch.bind(window);

  function isSiteContent(input) {
    var raw = typeof input === 'string' ? input : (input && input.url) || '';
    try {
      var url = new URL(raw, location.href);
      if (url.origin !== location.origin) return false;
      return /\/dmlsayt-site\/content\/(?:site\.json|pages\/[^/?#]+\.md)$/.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  window.fetch = function (input, init) {
    if (!isSiteContent(input)) return nativeFetch(input, init);

    var attempts = 0;
    function run() {
      attempts += 1;
      var options = Object.assign({}, init || {});
      if (attempts > 1) options.cache = 'reload';
      return nativeFetch(input, options).then(function (response) {
        if (response.ok || attempts >= 3) return response;
        return new Promise(function (resolve) {
          setTimeout(resolve, attempts * 180);
        }).then(run);
      }).catch(function (error) {
        if (attempts >= 3) throw error;
        return new Promise(function (resolve) {
          setTimeout(resolve, attempts * 180);
        }).then(run);
      });
    }
    return run();
  };
}());
