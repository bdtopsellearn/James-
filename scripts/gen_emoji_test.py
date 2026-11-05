#!/usr/bin/env python3
"""Generate an emoji before/after test page using the real font stacks."""
import io

OLD = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
NEW = ("'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, "
       "'Helvetica Neue', Arial, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', "
       "'Noto Color Emoji', 'Android Emoji', sans-serif")
EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', 'Android Emoji', 'EmojiOne Color', 'Twemoji Mozilla', 'EmojiSymbols', sans-serif"

html = f"""<!doctype html><html><head><meta charset="utf-8">
<style>
  body {{ margin:0; padding:24px; background:#0a0e1a; color:#f8fafc; }}
  h1 {{ font-size:15px; margin:0 0 6px; color:#5eead4; font-family: sans-serif; }}
  .row {{ display:flex; gap:28px; margin-bottom:26px; flex-wrap:wrap; }}
  .card {{ background:#0f172a; border:1px solid #1e293b; border-radius:14px; padding:16px 20px; min-width:250px; }}
  .lbl {{ font-size:11px; color:#64748b; margin-bottom:10px; font-family:sans-serif; text-transform:uppercase; letter-spacing:.08em; }}
  .old {{ font-family: {OLD}; font-weight:800; font-size:20px; }}
  .new {{ font-family: {NEW}; font-weight:800; font-size:20px; }}
  .new-emoji {{ font-family: {EMOJI}; font-weight:400; font-size:20px; display:inline-block; }}
  .big {{ font-size:34px; }}
</style></head><body>
  <h1>Emoji render test — old vs fixed font stack</h1>
  <div class="row">
    <div class="card"><div class="lbl">OLD stack (font-extrabold)</div>
      <div class="old">Account creation is now off &#x1F512;</div>
      <div class="old">Your request was approved &#x1F389;</div>
      <div class="old">&#x26A0;&#xFE0F; Admin actions logged</div>
    </div>
    <div class="card"><div class="lbl">NEW stack (font-extrabold)</div>
      <div class="new">Account creation is now off &#x1F512;</div>
      <div class="new">Your request was approved &#x1F389;</div>
      <div class="new">&#x26A0;&#xFE0F; Admin actions logged</div>
    </div>
    <div class="card"><div class="lbl">NEW + .emoji span (weight 400)</div>
      <div class="new">Account creation is now off <span class="new-emoji">&#x1F512;</span></div>
      <div class="new">Your request was approved <span class="new-emoji">&#x1F389;</span></div>
      <div class="new"><span class="new-emoji">&#x26A0;&#xFE0F;</span> Admin actions logged</div>
    </div>
  </div>
  <div class="row">
    <div class="card"><div class="lbl">NEW stack — large emoji set</div>
      <div class="new big">&#x1F512; &#x1F389; &#x26A0;&#xFE0F; &#x1F680; &#x2705; &#x1F4E7; &#x1F4CA; &#x1F4B0; &#x1F3AF; &#x1F6E1;&#xFE0F; &#x1F451; &#x1F50D; &#x2728; &#x2699;&#xFE0F;</div>
    </div>
  </div>
</body></html>"""

with io.open("emoji_fix_test.html", "w", encoding="utf-8") as f:
    f.write(html)
print("wrote emoji_fix_test.html")
