/**
 * Власна нативна форма зворотного зв'язку сайту Дмитрушківського ліцею.
 * Інтегрована з Firebase Firestore (колекція 'feedback').
 */
(function (global) {
  'use strict';

  var FeedbackModule = {};
  var COOLDOWN_SEC = 30;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function ensureFirebase() {
    if (global.firebase && global.firebase.firestore) return Promise.resolve();
    return loadScript('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js')
      .then(function () {
        return loadScript('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js');
      });
  }

  FeedbackModule.mount = function (container) {
    if (!container) return;

    var mountTime = Date.now();

    var html = [
      '<div class="feedback-card">',
      '  <div class="feedback-head">',
      '    <h2 class="feedback-title">У ВАС Є ПИТАННЯ?</h2>',
      '    <p class="feedback-sub">НАПИШІТЬ НАМ</p>',
      '  </div>',
      '  <form id="feedbackForm" class="feedback-form" novalidate>',
      '    <div id="feedbackAlert" class="feedback-alert" hidden></div>',
      '    <div class="feedback-hp" aria-hidden="true" style="display:none!important;position:absolute;left:-9999px;">',
      '      <label for="fb_hp_email">Не заповнюйте це поле:</label>',
      '      <input type="text" id="fb_hp_email" name="fb_hp_email" tabindex="-1" autocomplete="off">',
      '    </div>',
      '    <div class="feedback-field">',
      '      <label for="fb_name">Ваше ім\'я <span class="req">*</span></label>',
      '      <input type="text" id="fb_name" name="name" required maxlength="100" placeholder="Олександр або Олена" autocomplete="name">',
      '      <small class="field-error" id="err_name" hidden></small>',
      '    </div>',
      '    <div class="feedback-field">',
      '      <label for="fb_email">E-mail адреса <span class="req">*</span></label>',
      '      <input type="email" id="fb_email" name="email" required maxlength="100" placeholder="name@example.com" autocomplete="email">',
      '      <small class="field-error" id="err_email" hidden></small>',
      '    </div>',
      '    <div class="feedback-field">',
      '      <label for="fb_phone">Телефон <span class="opt">(необов\'язково)</span></label>',
      '      <input type="tel" id="fb_phone" name="phone" maxlength="25" placeholder="+380..." autocomplete="tel">',
      '      <small class="field-error" id="err_phone" hidden></small>',
      '    </div>',
      '    <div class="feedback-field">',
      '      <label for="fb_message">Сформулюйте Ваше питання <span class="req">*</span></label>',
      '      <textarea id="fb_message" name="message" required minlength="10" maxlength="3000" rows="5" placeholder="Опишіть ваше питання або пропозицію..."></textarea>',
      '      <small class="field-error" id="err_message" hidden></small>',
      '    </div>',
      '    <div class="feedback-action">',
      '      <button type="submit" id="fb_submit_btn" class="btn primary feedback-btn">',
      '        <span>ВІДПРАВИТИ</span>',
      '      </button>',
      '    </div>',
      '    <p class="feedback-privacy">',
      '      Надсилаючи звернення, ви погоджуєтеся на обробку зазначених вами даних виключно з метою розгляду та надання відповіді на ваше звернення.',
      '    </p>',
      '  </form>',
      '</div>'
    ].join('\n');

    container.innerHTML = html;

    var form = container.querySelector('#feedbackForm');
    var alertEl = container.querySelector('#feedbackAlert');
    var btn = container.querySelector('#fb_submit_btn');
    var nameIn = container.querySelector('#fb_name');
    var emailIn = container.querySelector('#fb_email');
    var phoneIn = container.querySelector('#fb_phone');
    var messageIn = container.querySelector('#fb_message');
    var hpIn = container.querySelector('#fb_hp_email');

    function showAlert(type, text) {
      alertEl.className = 'feedback-alert ' + type;
      alertEl.textContent = text;
      alertEl.hidden = false;
      alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function clearErrors() {
      ['name', 'email', 'phone', 'message'].forEach(function (f) {
        var el = container.querySelector('#err_' + f);
        if (el) { el.textContent = ''; el.hidden = true; }
        var inp = container.querySelector('#fb_' + f);
        if (inp) inp.classList.remove('has-error');
      });
      alertEl.hidden = true;
    }

    function setError(field, text) {
      var el = container.querySelector('#err_' + field);
      if (el) { el.textContent = text; el.hidden = false; }
      var inp = container.querySelector('#fb_' + field);
      if (inp) inp.classList.add('has-error');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors();

      // 1. Honeypot перевірка (якщо поле заповнене спам-ботом)
      if (hpIn && hpIn.value.trim() !== '') {
        showAlert('success', 'Дякуємо! Ваше звернення успішно надіслано.');
        form.reset();
        return;
      }

      // 2. Перевірка занадто швидкого заповнення (< 2 сек)
      if (Date.now() - mountTime < 1800) {
        showAlert('error', 'Не вдалося надіслати звернення. Спробуйте ще раз.');
        return;
      }

      // 3. Перевірка Cooldown (не частіше ніж раз на 30 сек)
      var lastSent = parseInt(localStorage.getItem('fb_last_sent') || '0', 10);
      var now = Date.now();
      if (now - lastSent < COOLDOWN_SEC * 1000) {
        var waitSec = Math.ceil((COOLDOWN_SEC * 1000 - (now - lastSent)) / 1000);
        showAlert('error', 'Будь ласка, зачекайте ' + waitSec + ' сек. перед відправкою наступного звернення.');
        return;
      }

      // 4. Валідація полів
      var name = nameIn.value.trim();
      var email = emailIn.value.trim();
      var phone = phoneIn.value.trim();
      var message = messageIn.value.trim();

      var hasErr = false;
      if (!name || name.length < 2) {
        setError('name', 'Вкажіть ваше ім\'я (не менше 2 символів)');
        hasErr = true;
      } else if (name.length > 100) {
        setError('name', 'Ім\'я занадто довге (максимум 100 символів)');
        hasErr = true;
      }

      var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        setError('email', 'Введіть коректну e-mail адресу');
        hasErr = true;
      } else if (email.length > 100) {
        setError('email', 'E-mail адреса занадто довга');
        hasErr = true;
      }

      if (phone) {
        var phoneRegex = /^(\+?[0-9\s\-\(\)]{7,25})$/;
        if (!phoneRegex.test(phone)) {
          setError('phone', 'Вкажіть номер телефону у коректному форматі (+380...)');
          hasErr = true;
        }
      }

      if (!message || message.length < 10) {
        setError('message', 'Сформулюйте ваше питання (не менше 10 символів)');
        hasErr = true;
      } else if (message.length > 3000) {
        setError('message', 'Текст повідомлення перевищує 3000 символів');
        hasErr = true;
      }

      if (hasErr) return;

      // 5. Блокуємо кнопку під час надсилання
      btn.disabled = true;
      btn.innerHTML = '<span>ВІДПРАВЛЕННЯ…</span>';

      // 6. Перевіряємо Firebase конфігурацію
      var cfg = global.FIREBASE_CONFIG;
      if (!cfg || !cfg.apiKey || cfg.apiKey.indexOf('apiKey') !== -1) {
        setTimeout(function () {
          btn.disabled = false;
          btn.innerHTML = '<span>ВІДПРАВИТИ</span>';
          showAlert('error', 'Не вдалося надіслати звернення: Firebase ще не підключено у файлі assets/js/firebase-config.js. Зверніться до адміністратора.');
        }, 600);
        return;
      }

      // 7. Відправка до Firestore
      ensureFirebase().then(function () {
        if (!global.firebase.apps.length) {
          global.firebase.initializeApp(cfg);
        }
        var db = global.firebase.firestore();
        return db.collection('feedback').add({
          name: name,
          email: email,
          phone: phone || '',
          message: message,
          createdAt: global.firebase.firestore.FieldValue.serverTimestamp(),
          status: 'new'
        });
      }).then(function () {
        localStorage.setItem('fb_last_sent', Date.now().toString());
        showAlert('success', 'Дякуємо! Ваше звернення успішно надіслано.');
        form.reset();
        btn.disabled = false;
        btn.innerHTML = '<span>ВІДПРАВИТИ</span>';
      }).catch(function (err) {
        console.error('Firebase feedback error:', err);
        showAlert('error', 'Не вдалося надіслати звернення. Спробуйте ще раз.');
        btn.disabled = false;
        btn.innerHTML = '<span>ВІДПРАВИТИ</span>';
      });
    });
  };

  global.FeedbackModule = FeedbackModule;
})(window);
