#!/usr/bin/env python3
"""Wrap login/register emojis in <span class="emoji"> so they always render
in full colour and are never faux-bolded by a parent font-weight class."""
import io, sys

EDITS = [
    # (file, old, new)
    (
        "src/components/auth/RegistrationClosed.tsx",
        "Account creation is now off \U0001F512</h2>",
        'Account creation is now off <span className="emoji" aria-hidden="true">\U0001F512</span></h2>',
    ),
    (
        "src/components/auth/BannedScreen.tsx",
        "Your request was approved \U0001F389</p>",
        'Your request was approved <span className="emoji" aria-hidden="true">\U0001F389</span></p>',
    ),
    (
        "src/views/auth/AdminLoginView.tsx",
        "\u26A0\uFE0F All administrative actions are logged and auditable.",
        '<span className="emoji" aria-hidden="true">\u26A0\uFE0F</span> All administrative actions are logged and auditable.',
    ),
]

ok = True
for path, old, new in EDITS:
    with io.open(path, "r", encoding="utf-8") as f:
        src = f.read()
    if new in src:
        print(f"SKIP (already applied): {path}")
        continue
    if old not in src:
        print(f"!! NOT FOUND in {path}: {old!r}")
        ok = False
        continue
    src = src.replace(old, new, 1)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"OK: {path}")

sys.exit(0 if ok else 1)
