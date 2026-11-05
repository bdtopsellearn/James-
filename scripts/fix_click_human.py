#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
V36 — Fully-human ad click engine + Adsterra CTR safety caps + banner fixes.
Edits bot-source/bot.cjs in place while preserving CRLF line endings.
"""
import io, sys, os

PATH = os.path.join(os.path.dirname(__file__), '..', 'bot-source', 'bot.cjs')

with io.open(PATH, 'r', encoding='utf-8', newline='') as f:
    raw = f.read()

NL = '\r\n' if '\r\n' in raw else '\n'
src = raw.replace('\r\n', '\n')

edits = []  # (name, old, new)

# ── 1) New helper: humanClickElement ─────────────────────────────────────────
HELPER = '''// ═══════════════════════════════════════════════════════════════════════════
//  V36: FULLY-HUMAN CLICK  —  scroll → hover → curved mouse travel → click
//  Used for Normal-link ad clicks. Keeps CTR low & natural so the Adsterra
//  account never looks click-fraudulent.
// ═══════════════════════════════════════════════════════════════════════════
async function humanClickElement(page, el, cfg = {}) {
  if (!el) return false;
  const rnd = (a, b) => humanRand(a, b);
  try {
    // 1) Scroll the ad into view like a person scrolling to it.
    try { await el.scrollIntoViewIfNeeded({ timeout: 3000 }); } catch (e) {}
    await sleep(gaussianRandom(400, 1200));

    // 2) Resolve its on-screen box.
    let box = null;
    try { box = await el.boundingBox(); } catch (e) {}
    if (!box || box.width <= 0 || box.height <= 0) return false;

    const cx = box.x + box.width * (0.35 + Math.random() * 0.3);
    const cy = box.y + box.height * (0.35 + Math.random() * 0.3);

    // 3) Curved, human mouse travel from a random start point to the ad.
    const steps = rnd(cfg.h4ck_click_mouse_steps_min || 18, cfg.h4ck_click_mouse_steps_max || 45);
    const sx = Math.max(0, cx + rnd(-500, 500));
    const sy = Math.max(0, cy + rnd(-350, 350));
    const ctrlX = (sx + cx) / 2 + rnd(-120, 120);
    const ctrlY = (sy + cy) / 2 + rnd(-120, 120);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const px = mt * mt * sx + 2 * mt * t * ctrlX + t * t * cx + rnd(-3, 3);
      const py = mt * mt * sy + 2 * mt * t * ctrlY + t * t * cy + rnd(-3, 3);
      try { await page.mouse.move(px, py); } catch (e) {}
      await sleep(gaussianRandom(6, 22));
    }

    // 4) Hover + micro-movements (people never click dead-still).
    try { await el.hover({ timeout: 2000 }); } catch (e) {}
    await sleep(gaussianRandom(cfg.h4ck_click_hover_ms_min || 600, cfg.h4ck_click_hover_ms_max || 1800));
    for (let i = 0; i < rnd(1, 3); i++) {
      try { await page.mouse.move(cx + rnd(-8, 8), cy + rnd(-8, 8)); } catch (e) {}
      await sleep(gaussianRandom(60, 220));
    }

    // 5) Click with a natural down/up delay.
    try {
      await el.click({ delay: rnd(90, 260), timeout: 4000 });
      return true;
    } catch (e) {
      try { await page.mouse.click(cx, cy, { delay: rnd(90, 260) }); return true; } catch (_) { return false; }
    }
  } catch (e) {
    return false;
  }
}
'''

edits.append((
  'helper',
  '''        if (el) return sel;
      } catch (e) {}
    }
    await sleep(200);
  }
  return null;
}
''',
  '''        if (el) return sel;
      } catch (e) {}
    }
    await sleep(200);
  }
  return null;
}

''' + HELPER,
))

# ── 2) New safety defaults ───────────────────────────────────────────────────
edits.append((
  'defaults',
  '''  h4ck_click_probability: 0.015,   // V32: 1.5% \u0432\u0496\u201d Popunder-friendly (no manual click needed)
  h4ck_max_clicks_per_session: 1,
  h4ck_min_click_delay_ms: 30000,
''',
  '''  h4ck_click_probability: 0.015,   // V36: target CTR (1.5%) \u2014 always clamped by h4ck_ctr_safety_cap
  h4ck_max_clicks_per_session: 1,
  h4ck_min_click_delay_ms: 30000,
  // \U0001f6e1\ufe0f V36 CTR SAFETY \u2014 the account can never look click-fraudulent:
  //   effective CTR = min(h4ck_click_probability, h4ck_ctr_safety_cap)
  //   + max 1 click/session + >=30s between clicks + >=8s read before any click.
  h4ck_ctr_safety_cap: 0.02,            // hard ceiling \u2014 never exceed 2% CTR
  h4ck_click_min_dwell_ms: 8000,        // must read the page \u22658s before clicking
  h4ck_click_hover_ms_min: 600,         // hover the ad before clicking
  h4ck_click_hover_ms_max: 1800,
  h4ck_click_mouse_steps_min: 18,       // natural curved mouse travel
  h4ck_click_mouse_steps_max: 45,
''',
))

# ── 3) Track clicks across the whole visit ───────────────────────────────────
edits.append((
  'sessionvars',
  '''    const _h4Dr = resolveDwellRange(cfg, 'organic');
    const baseDwellMin = _h4Dr.lo;
    const baseDwellMax = _h4Dr.hi;
''',
  '''    const _h4Dr = resolveDwellRange(cfg, 'organic');
    const baseDwellMin = _h4Dr.lo;
    const baseDwellMax = _h4Dr.hi;

    // V36: track ad clicks across the WHOLE visit (not per funnel page) so the
    // per-session cap + min inter-click delay are actually enforced.
    let sessionClicks = 0;
    let lastClickAt = 0;
''',
))

# ── 4) Rewrite the click block (fully human + safety gated) ──────────────────
OLD_CLICK = '''      if (cfg.h4ck_enable_click && Math.random() < (cfg.h4ck_click_probability || 0.002)) {
        try {
          const clickableAds = await targetPage.$$('a[href*="click"], a[target="_blank"], [class*="sponsor"] a');
          if (clickableAds.length > 0) {
            const adLink = clickableAds[humanRand(0, Math.min(clickableAds.length - 1, 5))];
            const beforePages = context.pages();
            try {
              await adLink.click({ delay: humanRand(100, 300) });
              await sleep(gaussianRandom(5000, 12000));
              stats.adClicks++;
              const afterPages = context.pages();
              if (afterPages.length > beforePages.length) {
                const newTab = afterPages[afterPages.length - 1];
                pages.add(newTab);
                await sleep(gaussianRandom(3000, 8000));
                try { await Promise.race([newTab.close(), sleep(3000)]); } catch (e) {}
                pages.delete(newTab);
                const remaining = context.pages().filter((pg) => pg !== newTab && !pg.isClosed());
                if (remaining.length > 0) targetPage = remaining[remaining.length - 1];
              } else {
                try { await targetPage.goBack({ waitUntil: 'domcontentloaded' }); } catch (e) {}
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
'''

NEW_CLICK = '''      // \u2500\u2500\u2500 V36 FULLY-HUMAN AD CLICK (Normal links only) \u2500\u2500\u2500
      // A real person scrolls to the ad, hovers it, moves the mouse in a curve,
      // then clicks. Gated by a hard CTR safety cap + per-session cap + a minimum
      // gap between clicks, so the Adsterra account never looks click-fraudulent.
      const _effCtr = Math.min(
        Number(cfg.h4ck_click_probability) || 0,
        Number(cfg.h4ck_ctr_safety_cap) || 0.02,
      );
      const _canClick = cfg.h4ck_enable_click !== false
        && sessionClicks < (cfg.h4ck_max_clicks_per_session || 1)
        && (Date.now() - lastClickAt) >= (cfg.h4ck_min_click_delay_ms || 30000)
        && (Date.now() - started) >= (cfg.h4ck_click_min_dwell_ms || 8000);
      if (_canClick && _effCtr > 0 && Math.random() < _effCtr) {
        try {
          const adSel = [
            'a[href*="click"]', '[class*="sponsor"] a', '[class*="ad-"] a',
            '[class*="ads"] a', '[id*="ad-"] a', 'ins.adsbygoogle a',
            'div[data-ad] a', 'a[href*="adsterra"]', 'a[href*="highperformance"]',
          ].join(', ');
          const clickableAds = await targetPage.$$(adSel);
          if (clickableAds.length > 0) {
            const adLink = clickableAds[humanRand(0, Math.min(clickableAds.length - 1, 5))];
            const beforePages = context.pages();
            const clicked = await humanClickElement(targetPage, adLink, cfg);
            if (clicked) {
              lastClickAt = Date.now();
              sessionClicks++;
              await sleep(gaussianRandom(5000, 12000));
              stats.adClicks++;
              const afterPages = context.pages();
              if (afterPages.length > beforePages.length) {
                const newTab = afterPages[afterPages.length - 1];
                pages.add(newTab);
                await sleep(gaussianRandom(4000, 9000));
                try { await Promise.race([newTab.close(), sleep(3000)]); } catch (e) {}
                pages.delete(newTab);
                const remaining = context.pages().filter((pg) => pg !== newTab && !pg.isClosed());
                if (remaining.length > 0) targetPage = remaining[remaining.length - 1];
              } else {
                await sleep(gaussianRandom(1500, 3500));
                try { await targetPage.goBack({ waitUntil: 'domcontentloaded' }); } catch (e) {}
              }
            }
          }
        } catch (e) {}
      }
'''

edits.append(('clickblock', OLD_CLICK, NEW_CLICK))

# ── 5) Boot-time dynamic banner values ───────────────────────────────────────
edits.append((
  'bootvars',
  '''  const activeMode = getActiveMode();
  console.log('');
''',
  '''  const activeMode = getActiveMode();
  const _bootCfg = getAutoImpressionSettings();
  const _bootSlDr = resolveDwellRange(_bootCfg, 'smartlink');
  const _bootEffCtr = Math.min(Number(_bootCfg.h4ck_click_probability) || 0, Number(_bootCfg.h4ck_ctr_safety_cap) || 0.02);
  console.log('');
''',
))

# ── 6) Banner: SmartLink dwell (was hard-coded 60-180s) ──────────────────────
edits.append((
  'banner_dwell',
  "  console.log('  \u251c\u2500 SmartLink dwell 60-180s           : ACTIVE');",
  "  console.log(`  \u251c\u2500 SmartLink dwell ${Math.round(_bootSlDr.lo/1000)}-${Math.round(_bootSlDr.hi/1000)}s : ACTIVE`);",
))

# ── 7) Banner: Ad Click rate (was hard-coded 0.2%) ───────────────────────────
edits.append((
  'banner_click',
  "  console.log(`  \u251c\u2500 Ad Click 0.2% (normal)  : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);",
  "  console.log(`  \u251c\u2500 Ad Click ${(_bootEffCtr*100).toFixed(2)}% (normal) : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);",
))

# ── 8) Dead-code Telegram strings: align 60-180s with reality ────────────────
edits.append((
  'tg_dwell1',
  "H4CK ORGANIC \u2014 Adsterra-safe dwell 60-180s",
  "H4CK ORGANIC \u2014 Adsterra-safe dwell 9-12s",
))
edits.append((
  'tg_dwell2',
  "\U0001f6a8 Adsterra-safe: dwell 60-180s, no ad click",
  "\U0001f6a8 Adsterra-safe: dwell 9-12s, no ad click",
))
edits.append((
  'tg_dwell3',
  "\u2022 SmartLink dwell: <b>60-180s</b>",
  "\u2022 SmartLink dwell: <b>9-12s</b>",
))
edits.append((
  'comment_dwell',
  "// \u2b50 V32-FIX: 4 min \u2014 SmartLink dwell now 60-180s, need buffer",
  "// \u2b50 V32-FIX: 4 min \u2014 SmartLink dwell now 9-12s (fast-fire), need buffer",
))

# ── apply ────────────────────────────────────────────────────────────────────
for name, old, new in edits:
    if old not in src:
        print(f'[FAIL] anchor not found: {name}')
        sys.exit(1)
    cnt = src.count(old)
    if cnt != 1:
        print(f'[WARN] anchor {name} matched {cnt}x — replacing first only')
    src = src.replace(old, new, 1)
    print(f'[OK] {name}')

out = src.replace('\n', NL)
with io.open(PATH, 'w', encoding='utf-8', newline='') as f:
    f.write(out)
print('DONE — wrote', PATH)
