#!/usr/bin/env python3
import io
OLD = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
NEW = ("'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, "
       "'Helvetica Neue', Arial, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', "
       "'Noto Color Emoji', 'Android Emoji', sans-serif")
html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
body{{margin:0;padding:20px;background:#111;color:#fff;font-family:sans-serif}}
.t{{font-size:13px;color:#888;margin:4px 0 2px}}
.o{{font-family:{OLD};font-size:64px;line-height:1.2}}
.n{{font-family:{NEW};font-size:64px;line-height:1.2}}
</style></head><body>
<div class="t">OLD stack:</div><div class="o">&#x1F512;&#x1F389;&#x26A0;&#xFE0F;&#x1F680;&#x2705;</div>
<div class="t">NEW stack:</div><div class="n">&#x1F512;&#x1F389;&#x26A0;&#xFE0F;&#x1F680;&#x2705;</div>
</body></html>"""
io.open("emoji_zoom.html","w",encoding="utf-8").write(html)
print("ok")
