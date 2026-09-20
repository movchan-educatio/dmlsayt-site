#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Патчує admin.js:
1. Всередині renderFeedback замінює синхронну перевірку auth.currentUser
   на async onAuthStateChanged — вже зроблено у рядках 757-783.
2. Вставляє відступ та обгортає весь блок db.collection...} (рядки 784-922)
   всередину callback onAuthStateChanged.
3. Закриває callback  });  і функцію  }  правильно.
"""
import sys, re, os
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

path = os.path.join(os.path.dirname(__file__), '..', '..', 'admin', 'admin.js')
path = os.path.abspath(path)

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# Знаходимо початок блоку, який треба загорнути:
# від "    var db = firebase.firestore();" до закриваючого "  }" функції renderFeedback.
# Після нашої першої правки onAuthStateChanged відкрито але не закрито.

# Перевіряємо чи вже є onAuthStateChanged
if 'onAuthStateChanged' not in src:
    print('ERROR: onAuthStateChanged not found in admin.js')
    sys.exit(1)

# Знаходимо точку, де onAuthStateChanged callback відкритий але db.collection іде без додаткового відступу
# Шукаємо патерн: після "return;\n      }\n\n    var db = firebase.firestore();"
old_block = '''        return;
      }

    var db = firebase.firestore();
    db.collection('feedback').orderBy('createdAt', 'desc').get()
      .then(function (snapshot) {'''

new_block = '''        return;
      }

      pBody.appendChild(h('p', { class: 'boot' }, 'Завантаження звернень\u2026'));

      var db = firebase.firestore();
      db.collection('feedback').orderBy('createdAt', 'desc').get()
        .then(function (snapshot) {'''

if old_block not in src:
    print('ERROR: target block not found. Showing context around db.collection:')
    idx = src.find("var db = firebase.firestore();")
    print(repr(src[max(0,idx-100):idx+100]))
    sys.exit(1)

src = src.replace(old_block, new_block, 1)
print('Step 1 OK: replaced db.collection header')

# Тепер виправляємо відступи у всьому блоці .then(function (snapshot) { до .catch(...)
# і закриваємо onAuthStateChanged callback + функцію renderFeedback

# Замінюємо старе закриття функції renderFeedback:
# "      });\n  }" (2-space indent close of renderFeedback)
# на:
# "      });\n    }); // onAuthStateChanged\n  }" 

old_close = "      .catch(function (err) {\n        pBody.innerHTML = '';\n        pBody.appendChild(h('div', { class: 'notice error' }, 'Не вдалося завантажити звернення: ' + err.message));\n      });\n  }"
new_close = "        .catch(function (err) {\n          pBody.innerHTML = '';\n          pBody.appendChild(h('div', { class: 'notice error' }, 'Не вдалося завантажити звернення: ' + err.message));\n        });\n    }); // кінець onAuthStateChanged\n  } // кінець renderFeedback"

if old_close not in src:
    print('ERROR: close block not found. Showing context around catch:')
    idx = src.find("Не вдалося завантажити звернення")
    print(repr(src[max(0,idx-200):idx+200]))
    sys.exit(1)

src = src.replace(old_close, new_close, 1)
print('Step 2 OK: added closing }); for onAuthStateChanged')

# Тепер виправляємо відступи у середині .then блоку
# .then(function (snapshot) { → тіло зараз на 8 пробілів (індент 2+6)
# треба 10 (indent 2+8 = всередині onAuthStateChanged callback)
# Знаходимо блок від .then до .catch і збільшуємо відступ на 2

# Знаходимо межі .then блоку
then_start = src.find("        .then(function (snapshot) {")
catch_start = src.find("        .catch(function (err) {")

if then_start == -1 or catch_start == -1:
    print('WARNING: then/catch block boundaries not precisely found, skipping indent fix')
else:
    # Витягуємо блок між .then і .catch  
    inner = src[then_start:catch_start]
    # Рядки всередині .then (починаючи з другого рядка)
    lines = inner.split('\n')
    # Перший рядок вже правильний: "        .then(function (snapshot) {"
    # Всі наступні рядки треба збільшити на 2 пробіли, якщо вони вже мають 8+ пробілів відступу
    new_lines = [lines[0]]
    for line in lines[1:]:
        if line and not line.startswith('//'):
            # Додаємо 2 пробіли до рядків з відступом 8+ (тіло .then)
            stripped = line.lstrip(' ')
            current_indent = len(line) - len(stripped)
            if current_indent >= 8:
                new_lines.append('  ' + line)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
    new_inner = '\n'.join(new_lines)
    src = src[:then_start] + new_inner + src[catch_start:]
    print('Step 3 OK: adjusted indentation inside .then block')

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print('DONE: admin.js patched successfully.')
print(f'File size: {len(src)} bytes')
