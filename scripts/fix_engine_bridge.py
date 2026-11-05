#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""V36: bridge the admin engine UI's click/CTR fields to the bot's
`auto_impression_settings` doc (the bot does not read `engine_settings`)."""
import io, sys, os

PATH = os.path.join(os.path.dirname(__file__), '..', 'api-server.cjs')
with io.open(PATH, 'r', encoding='utf-8', newline='') as f:
    raw = f.read()
NL = '\r\n' if '\r\n' in raw else '\n'
src = raw.replace('\r\n', '\n')

edits = []

edits.append((
  'num-list',
  """  const NUM = ['typingCpmMin', 'typingCpmMax', 'readingPauseChance', 'competitorVisitChance', 'safariRatio',
    'dwellMinSeconds', 'dwellMaxSeconds', 'tickIntervalSeconds'];""",
  """  const NUM = ['typingCpmMin', 'typingCpmMax', 'readingPauseChance', 'competitorVisitChance', 'safariRatio',
    'dwellMinSeconds', 'dwellMaxSeconds', 'tickIntervalSeconds',
    'clickProbability', 'ctrSafetyCap', 'maxClicksPerSession', 'minClickDelayMs'];""",
))

edits.append((
  'bridge',
  """  await writeRoot('engine_settings', next);
  try {
    const actor = await getUserById(req.auth.uid);
    await addAuditLog({
      actor: { name: actor?.name, role: 'admin' },
      action: 'ENGINE_SETTINGS_SAVED', targetType: 'system',
      details: `Engine settings updated (mode: ${next.mode || 'n/a'}).`,
    });
  } catch (_) { /* audit must not block the save */ }
  res.json({ ok: true, settings: next });""",
  """  await writeRoot('engine_settings', next);

  // V36: bridge the click / CTR-safety fields to the bot's settings doc
  // (`auto_impression_settings`). The traffic bot does NOT read `engine_settings`,
  // so without this the admin engine UI would have no effect on the bot. Values
  // are clamped server-side so a mis-typed rate can never endanger the account.
  const botPatch = {};
  if (Number.isFinite(Number(body.clickProbability))) botPatch.h4ck_click_probability = Math.max(0, Math.min(0.05, Number(body.clickProbability)));
  if (Number.isFinite(Number(body.ctrSafetyCap))) botPatch.h4ck_ctr_safety_cap = Math.max(0, Math.min(0.05, Number(body.ctrSafetyCap)));
  if (Number.isFinite(Number(body.maxClicksPerSession))) botPatch.h4ck_max_clicks_per_session = Math.max(0, Math.min(3, Math.round(Number(body.maxClicksPerSession))));
  if (Number.isFinite(Number(body.minClickDelayMs))) botPatch.h4ck_min_click_delay_ms = Math.max(5000, Math.min(600000, Math.round(Number(body.minClickDelayMs))));
  if (Object.keys(botPatch).length) {
    const curBot = (await readRoot('auto_impression_settings')) || {};
    await writeRoot('auto_impression_settings', { ...curBot, ...botPatch });
  }

  try {
    const actor = await getUserById(req.auth.uid);
    await addAuditLog({
      actor: { name: actor?.name, role: 'admin' },
      action: 'ENGINE_SETTINGS_SAVED', targetType: 'system',
      details: `Engine settings updated (mode: ${next.mode || 'n/a'}).`,
    });
  } catch (_) { /* audit must not block the save */ }
  res.json({ ok: true, settings: next });""",
))

for name, old, new in edits:
    if old not in src:
        print(f'[FAIL] anchor not found: {name}')
        sys.exit(1)
    src = src.replace(old, new, 1)
    print(f'[OK] {name}')

with io.open(PATH, 'w', encoding='utf-8', newline='') as f:
    f.write(src.replace('\n', NL))
print('DONE')
