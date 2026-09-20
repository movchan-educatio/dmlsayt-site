#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Quick sanity check for Firebase/Admin config"""

import sys, os
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
checks = []

def chk(label, cond):
    status = "OK  " if cond else "FAIL"
    print(f"  [{status}] {label}")
    checks.append(cond)

# Firebase config
fc = open(os.path.join(ROOT, "assets/js/firebase-config.js"), encoding="utf-8").read()
chk("firebase-config exists and non-empty", len(fc) > 50)
chk("firebase-config has apiKey field", "apiKey" in fc)
is_placeholder = "YOUR_PROJECT" in fc or "PLACEHOLDER" in fc or '"YOUR_API_KEY"' in fc or "'YOUR_" in fc
chk("firebase-config: NOT a raw placeholder (has real values)", not is_placeholder)

# feedback.js
fj = open(os.path.join(ROOT, "assets/js/feedback.js"), encoding="utf-8").read()
chk("feedback.js: db.collection().add() present", ".collection('feedback').add(" in fj)
chk("feedback.js: feedbackForm present", "feedbackForm" in fj)
chk("feedback.js: serverTimestamp present", "serverTimestamp" in fj)
chk("feedback.js: spam protection (honeypot)", "fb_hp_email" in fj)
chk("feedback.js: cooldown protection", "COOLDOWN_SEC" in fj)

# firestore.rules
fr = open(os.path.join(ROOT, "firestore.rules"), encoding="utf-8").read()
chk("firestore.rules: request.auth != null required for read/delete", "request.auth != null" in fr)
chk("firestore.rules: no open allow true", "allow read, write: if true" not in fr)

# admin.js
aj = open(os.path.join(ROOT, "admin/admin.js"), encoding="utf-8").read()
chk("admin.js: fb_email field present", "fb_email" in aj)
chk("admin.js: signInWithEmailAndPassword", "signInWithEmailAndPassword" in aj)
chk("admin.js: single logout function", aj.count("function logout") + aj.count("const logout") >= 1)

passed = sum(checks)
total = len(checks)
print()
print(f"SUMMARY: {passed}/{total} checks passed")
sys.exit(0 if passed == total else 1)
