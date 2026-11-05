#!/usr/bin/env python3
"""Heuristic scan for <button> tags lacking onClick / type=submit / form action."""
import re, os, glob

root = "src"
pat = re.compile(r"<button\b[^>]*>", re.S | re.I)
issues = []
for path in glob.glob(os.path.join(root, "**", "*.tsx"), recursive=True):
    with open(path, encoding="utf-8") as f:
        src = f.read()
    # split into lines to report
    for m in pat.finditer(src):
        tag = m.group(0)
        low = tag.lower()
        if "onclick" in low:
            continue
        if 'type="submit"' in low or "type='submit'" in low:
            continue
        if "disabled" in low:
            continue
        # find line number
        ln = src[:m.start()].count("\n") + 1
        snippet = re.sub(r"\s+", " ", tag)[:120]
        issues.append((path, ln, snippet))

print(f"Total buttons without onClick/type=submit: {len(issues)}")
for p, ln, s in issues:
    print(f"{p}:{ln}  {s}")
