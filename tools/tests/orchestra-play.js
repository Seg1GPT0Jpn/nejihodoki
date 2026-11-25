#!/usr/bin/env node
// 指揮者ゲームの通しプレイ（Playwright。バトンはマウスと CDP のタッチ、キューはクリック・タップ・スワイプ・キー、拍はキーも。
// ?debug の window.__orch は「結果を見るために終わり近くへ飛ぶ」「音を測る」ためだけで、操作は本物の入力）
//   node tools/tests/orchestra-play.js [first,audio,conduct,cues,finish,keyboard,touch,pause,english,themes,saves,layouts]
// 1. 初回：遊び方 → タイトル（8曲）・クレジット表（Mutopia 番号とパブリックドメイン）・設定
// 2. 音：本物のブラウザで mp3 をデコード → 本物のエンジンで OfflineAudioContext に書き出して、無音でない・純音でない・強弱で大きさと明るさが変わる、を数字で
// 3. 指揮：本物のマウスで2拍→曲がはじまる・テンポに追従・振りの大きさで強弱・止めるとオーケストラが待つ（ふつう）／そのまま続く（たのしむ）
// 4. キュー：光った楽器へ、ボタン・数字キー・座席のクリック・スワイプで入りを出す→採点
// 5. 終わりまで：終わり近くへ飛んで指揮 → 結果・ベスト・保存 → もう一度／次の曲
// 6. キーボードだけ  7. タッチ（CDP）  8. 一時停止  9. 英語  10. ライト／ダーク  11. 古い／こわれた保存  12. 全画面サイズ × ja/en（320px）
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'orchestra-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 700)}`); };
const note = (s) => console.log('       ' + s);
const SAVE = 'kusoge.orchestra.save', HOWTO = 'kusoge.orchestra.howto';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const audioNumbers = {};

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'land'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch, timeout: 20000 });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/orchestra/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__orch);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 20000 });
async function startReal(p, id, diff) {
  await p.evaluate(d => { if (d) document.querySelector(`.dfb[data-diff="${d}"]`).click(); }, diff || null);
  if (!(await p.locator(`.rc[data-piece="${id}"]`).isVisible())) { await p.click('#filters summary'); await p.click('#expandAll'); await p.click('#filters summary'); }
  await p.click(`.rc[data-piece="${id}"]`);
  if (await p.locator('#partBox button[data-part="all"]').count()) await p.click('#partBox button[data-part="all"]'); // a long movement asks: whole or a part
  await wait(p, () => __kb.state().playing, null, 90000);
}
const stageBox = p => p.evaluate(() => { const r = document.getElementById('board').getBoundingClientRect(); const a = __orch.art; return { x: r.x, y: r.y, w: r.width, h: r.height, scale: a.scale, stageH: a.stageH }; });

// one bounce of the baton lasting I seconds, driven by the wall clock so the tempo is right whatever the mouse call costs
async function bounce(p, c, I, amp) {
  const t0 = Date.now(); const cx = c.x + c.w * 0.5, cy = c.y + c.stageH * 0.55;
  for (;;) {
    const f = (Date.now() - t0) / 1000 / I; if (f >= 1) break;
    await p.mouse.move(cx + amp * 0.18 * Math.sin(2 * Math.PI * f), cy - amp / 2 + amp * (0.5 - 0.5 * Math.cos(2 * Math.PI * f)));
    await sleep(7);
  }
}
async function conductBeats(p, c, n, bpm, amp, each) { for (let k = 0; k < n; k++) { await bounce(p, c, 60 / bpm, amp); if (each) await each(k); } }

// ---- touch via CDP: a finger drawing the same bounce -------------------------------------------------------------------------------------------
async function touchBounce(cdp, c, I, amp, o) {
  o = o || {}; const t0 = Date.now(); const cx = c.x + c.w * 0.5, cy = c.y + c.stageH * 0.55; let started = false;
  const pt = f => ({ x: cx + amp * 0.18 * Math.sin(2 * Math.PI * f), y: cy - amp / 2 + amp * (0.5 - 0.5 * Math.cos(2 * Math.PI * f)) });
  for (;;) {
    const f = (Date.now() - t0) / 1000 / I; if (f >= 1) break; const q = pt(f);
    await cdp.send('Input.dispatchTouchEvent', { type: started ? 'touchMove' : 'touchStart', touchPoints: [{ x: q.x, y: q.y, id: 1 }] }); started = true; await sleep(8);
  }
  if (o.end) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function first(env) {
  console.log('1. first visit: the rules, then the title with the pieces, credits and settings');
  const s = await open(env, { seed: {} }); const p = s.page;
  check('rules show on the first visit', (await st(p)).howto, await st(p));
  await shot(p, '01-howto'); await p.click('#howtoAlt');
  let a = await st(p); check('title after "just the rules"', a.title && a.pieces.length >= 16, a);
  await p.evaluate(() => document.getElementById('expandAll').click()); // with 40+ pieces the groups start folded
  check('one piece card per piece with composer and stars', (await p.locator('.rc').count()) === (await st(p)).pieces.length && /ベートーヴェン/.test(await p.locator('.rc').first().innerText()), await p.locator('.rc').first().innerText());
  check('three difficulty buttons, normal selected', (await p.locator('.dfb').count()) === 3 && (await p.locator('.dfb.sel').innerText()) === 'ふつう', null);
  await shot(p, '01-title');
  await p.click('#tCred'); a = await st(p); check('credits open', a.credits, a);
  const rows = await p.locator('table.cr tbody tr').count(); const txt = await p.locator('#cBody').innerText(); const tabTxt = await p.locator('table.cr tbody').innerText();
  const idxj = await p.evaluate(async () => (await (await fetch('scores/index.json')).json()).pieces); const nPD = idxj.filter(x => x.src.licence === 'Public Domain').length, nMu = idxj.filter(x => x.src.mutopia).length;
  check('credits table: one row per piece (' + idxj.length + '), each with its source and licence ("パブリックドメイン" x' + nPD + ')', rows === idxj.length && rows >= 15 && (tabTxt.match(/パブリックドメイン/g) || []).length === nPD && /Mutopia #941/.test(txt) && /Mutopia #1901/.test(txt) && /Mutopia #1793/.test(txt) && /CC BY-SA 3\.0/.test(txt), { rows, txt: txt.slice(0, 200) });
  check('credits name VSCO 2 CE and CC0', /VSCO 2 Community Edition/.test(txt) && /CC0/.test(txt), txt.slice(0, 200));
  const hrefs = await p.locator('#cBody a').evaluateAll(as => as.map(a => a.href)); check('credit links point at mutopiaproject.org, the licence page of share-alike pieces and the VSCO repo', hrefs.filter(h => /^https:\/\/www\.mutopiaproject\.org\/cgibin\/piece-info\.cgi\?id=\d+$/.test(h)).length === nMu && hrefs.some(h => /creativecommons\.org\/licenses\/by-sa\/3\.0/.test(h)) && hrefs.some(h => /github\.com\/sgossner\/VSCO-2-CE/.test(h)), hrefs);
  await shot(p, '01-credits'); await p.click('#cClose');
  await p.click('#tSet'); await p.selectOption('#qualSel', 'lo'); a = await st(p); check('settings open; quality saved', a.settings && (await p.evaluate(() => JSON.parse(localStorage.getItem('kusoge.orchestra.prefs')).quality)) === 'lo', a);
  await p.click('#sClose'); a = await st(p); check('back at the title', a.title, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function audio(env) {
  console.log('2. sound: real mp3 decoding in the browser, then the real engine rendered offline and measured');
  const s = await open(env); const p = s.page;
  await startReal(p, 'nachtmusik', 'normal'); let a = await st(p);
  check('the piece loads through a real tap: ' + a.files + ' files decoded (' + (a.bytes / 1048576).toFixed(0) + ' MB of audio), tier ' + a.tier, a.files > 150 && a.bytes > 30e6 && a.ctxState === 'running' && a.tier === 'hi', a);
  const dec = await p.evaluate(async () => { const r = await fetch('samples/vln-sus-069-l.mp3'); const ab = await r.arrayBuffer(); const ctx = new OfflineAudioContext(1, 44100, 44100); const b = await ctx.decodeAudioData(ab); const d = b.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); return { dur: +b.duration.toFixed(2), sr: b.sampleRate, ch: b.numberOfChannels, pk: +pk.toFixed(2), first: __orch.S.onsetOf(b) }; });
  check('an mp3 sample decodes: ' + JSON.stringify(dec), dec.dur > 2.5 && dec.dur < 3.2 && dec.pk > 0.05 && dec.first < 0.06, dec);
  // the contrast: a pure sine of the same loudness
  const sine = await p.evaluate(() => { const sr = 44100, x = new Float32Array(sr * 6); for (let i = 0; i < x.length; i++) x[i] = 0.1 * Math.sin(2 * Math.PI * 440 * i / sr); return __orch.analyse([x, x], sr); });
  audioNumbers.sine440 = sine; note('reference, a 440 Hz sine: ' + JSON.stringify({ rmsDb: sine.rmsDb, flatness: sine.flatness, dominantPeakFrac: sine.dominantPeakFrac, peaks30dB: sine.peaks30dB }));
  await p.evaluate(() => __orch.showTitle()); await p.waitForFunction(() => __kb.state().title);
  for (const [id, secs, lv] of [['nachtmusik', 24, 0.7], ['beethoven5', 24, 0.8], ['dvorak7', 30, 0.7], ['zauberflote', 30, 0.7], ['dvorak9-4', 30, 0.7], ['dvorak7-1', 30, 0.6], ['dvorak8-1', 40, 0.7], ['coriolan', 30, 0.7], ['dvorak8-3', 40, 0.7], ['mahler5-2', 30, 0.7], ['mahler5-4', 40, 0.7]]) {
    const r = await p.evaluate(([id, secs, lv]) => __orch.renderOffline(id, secs, { level: lv }), [id, secs, lv]); audioNumbers[id] = r;
    note(`${id} (${secs}s at level ${lv}): ` + JSON.stringify({ rmsDb: r.rmsDb, peakDb: r.peakDb, centroidHz: r.centroidHz, flatness: r.flatness, dominantPeakFrac: r.dominantPeakFrac, peaks30dB: r.peaks30dB, bands: r.bands, notes: r.notes, peakVoices: r.peakVoices, renderX: r.renderX, stolen: r.voicesStolen, MB: +(r.bytes / 1048576).toFixed(0) }));
    check(`${id}: not silent and not clipping (RMS ${r.rmsDb} dBFS, peak ${r.peakDb} dBFS)`, r.rmsDb > -32 && r.rmsDb < -9 && r.peakDb < -0.05 && r.frames > 5, r);
    check(`${id}: not a pure tone (strongest peak holds ${(r.dominantPeakFrac * 100).toFixed(0)} % of the energy; sine: ${(sine.dominantPeakFrac * 100).toFixed(0)} %), ${r.peaks30dB} spectral peaks`, r.dominantPeakFrac < 0.6 && r.peaks30dB >= 15 && sine.dominantPeakFrac > 0.9 && sine.peaks30dB < 6, { r, sine });
    check(`${id}: a full-band orchestral spectrum (centroid ${r.centroidHz} Hz; low/mid/high ${r.bands.low}/${r.bands.mid}/${r.bands.high})`, r.centroidHz > 450 && r.centroidHz < 3500 && r.bands.low > 0.01 && r.bands.mid > 0.3 && r.bands.high > 0.02 && r.flatness > 0.0003, r);
    check(`${id}: no voices stolen in a normal stretch`, r.voicesStolen === 0, r);
  }
  const soft = await p.evaluate(() => __orch.renderOffline('beethoven5', 14, { level: 0.12 })), loud = await p.evaluate(() => __orch.renderOffline('beethoven5', 14, { level: 1 }));
  note(`dynamics: pp ${soft.rmsDb} dB / centroid ${soft.centroidHz} Hz; ff ${loud.rmsDb} dB / centroid ${loud.centroidHz} Hz`); audioNumbers.dynamics = { pp: soft, ff: loud };
  check('crescendo: ff is much louder than pp (' + (loud.rmsDb - soft.rmsDb).toFixed(1) + ' dB) and brighter (' + soft.centroidHz + ' -> ' + loud.centroidHz + ' Hz)', loud.rmsDb - soft.rmsDb > 14 && loud.centroidHz > soft.centroidHz * 1.12, { soft, loud });
  const lo = await p.evaluate(() => __orch.renderOffline('nachtmusik', 12, { level: 0.6, tier: 'lo' })); note('light tier: ' + JSON.stringify({ rmsDb: lo.rmsDb, MB: +(lo.bytes / 1048576).toFixed(0), dom: lo.dominantPeakFrac }));
  check('the light tier (one layer) is about half the memory and still sounds like the orchestra', lo.bytes < audioNumbers.nachtmusik.bytes * 0.62 && lo.dominantPeakFrac < 0.6 && lo.rmsDb > -34, { lo, hi: audioNumbers.nachtmusik });
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'audio-numbers.json'), JSON.stringify(audioNumbers, null, 1));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function conduct(env) {
  console.log('3. conducting with the real mouse: start, follow the tempo, volume from the size of the stroke, waiting when the baton stops');
  const s = await open(env); const p = s.page; await startReal(p, 'nachtmusik', 'normal'); const c = await stageBox(p);
  let a = await st(p); check('before the first stroke: nothing plays, the page waits', a.state === 'idle' && a.voices === 0, a);
  await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.3); await conductBeats(p, c, 2, 66, 0.24 * c.scale);
  await wait(p, () => __kb.state().state === 'playing', null, 5000); a = await st(p); check('two strokes start the piece', a.state === 'playing', a);
  await conductBeats(p, c, 10, 66, 0.24 * c.scale); a = await st(p);
  check(`the tempo follows the baton: ${Math.round(a.bpm)} bpm for 66`, Math.abs(a.bpm - 66) < 8, a); check('the position advances with the beats: ' + a.pos.toFixed(1), a.pos > 8 && a.pos < 13, a); check('voices are sounding (' + a.voices + ')', a.voices > 3, a);
  const live = await p.evaluate(() => __orch.liveStats(900)); audioNumbers.live = live; note('live output while conducting: ' + JSON.stringify(live));
  check('the live output is audible and not a pure tone', live && live.rmsDb > -50 && live.dominantPeakFrac < 0.7, live);
  await shot(p, '03-conducting');
  // volume
  const med = async (bpm, amp) => { await conductBeats(p, c, 2, bpm, amp * c.scale); const ls = []; await conductBeats(p, c, 6, bpm, amp * c.scale, async () => { ls.push((await st(p)).level); }); ls.sort((x, y) => x - y); return ls[ls.length >> 1]; }; // the median of six beats: a loaded machine can spike one stroke
  const levels = {}; levels.small = await med(66, 0.07); levels.ordinary = await med(66, 0.2); levels.moderate = await med(66, 0.4); levels.huge = await med(110, 0.7);
  check(`soft is easy: a small stroke is pp/p (${levels.small.toFixed(2)}), an ordinary one p..mp (${levels.ordinary.toFixed(2)})`, levels.small < 0.28 && levels.ordinary > 0.15 && levels.ordinary < 0.42, levels);
  check(`a medium stroke is still p/mp (${levels.moderate.toFixed(2)}), only a very big fast swing gets near f/ff (${levels.huge.toFixed(2)})`, levels.moderate > 0.2 && levels.moderate < 0.55 && levels.huge > 0.5 && levels.huge > levels.moderate + 0.12, levels);
  const dm = await p.evaluate(() => ({ mark: __orch.E.Dynamics.mark(__kb.state().level), sens: JSON.parse(localStorage.getItem('kusoge.orchestra.prefs') || '{}').sens })); note('meter mark after the big swing: ' + JSON.stringify(dm));
  check('the meter names the level reached (mf, f or ff after a huge swing)', ['mf', 'f', 'ff'].includes(dm.mark), dm);
  await shot(p, '03-dynamics-meter');
  // sensitivity: high makes the same stroke louder than low
  const sensLv = async v => { await p.evaluate(v => { const e = document.getElementById('sensSel'); e.value = v; e.dispatchEvent(new Event('change')); }, v); await conductBeats(p, c, 2, 66, 0.4 * c.scale); const ls = []; await conductBeats(p, c, 6, 66, 0.4 * c.scale, async () => { ls.push((await st(p)).level); }); return ls.reduce((x, y) => x + y, 0) / ls.length; };
  const lowL = await sensLv('low'), highL = await sensLv('high'); await sensLv('mid');
  check(`the sensitivity setting works (low ${lowL.toFixed(2)} < high ${highL.toFixed(2)}) and is saved`, lowL + 0.04 < highL && (await p.evaluate(() => JSON.parse(localStorage.getItem('kusoge.orchestra.prefs')).sens)) === 'mid', { lowL, highL });
  // faster
  await conductBeats(p, c, 8, 90, 0.24 * c.scale); a = await st(p); check(`conducting faster speeds the orchestra up: ${Math.round(a.bpm)} bpm for 90`, Math.abs(a.bpm - 90) < 12, a);
  // stopping
  await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.45); await sleep(3200); a = await st(p);
  check('normal: the orchestra waits when the baton stops (held)', a.held, a); const posHeld = a.pos; await sleep(800); a = await st(p); check('...and does not creep on', Math.abs(a.pos - posHeld) < 0.05, { posHeld, a: a.pos });
  await conductBeats(p, c, 3, 90, 0.24 * c.scale); a = await st(p); check('conducting again goes on from the same place', !a.held && a.pos > posHeld + 1.5, a);
  const res = await p.evaluate(() => __orch.G.session.result()); check('the score so far is a number between 0 and 100', res.total >= 0 && res.total <= 100 && res.coverage > 0.05 && res.steady > 60, res);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  // enjoy
  const e = await open(env); const q = e.page; await startReal(q, 'nachtmusik', 'enjoy'); const c2 = await stageBox(q);
  await q.mouse.move(c2.x + c2.w * 0.5, c2.y + c2.stageH * 0.3); await conductBeats(q, c2, 8, 66, 0.2 * c2.scale); const p1 = (await st(q)).pos; await q.mouse.move(c2.x + c2.w * 0.5, c2.y + c2.stageH * 0.45); await sleep(3000); const a2 = await st(q);
  check('enjoy: the orchestra does NOT play on by itself: it holds at the next beat when the baton stops (' + p1.toFixed(1) + ' -> ' + a2.pos.toFixed(1) + ')', a2.pos < p1 + 1.9 && a2.held, { p1, a2 });
  const hintTxt = await q.evaluate(() => { const h = document.getElementById('hint'); return h.hidden ? '' : h.textContent; }); check('the prompt "タクトを振って！" is shown while it waits: ' + hintTxt, /タクトを振って/.test(hintTxt), hintTxt);
  await q.waitForTimeout(1500); const a3 = await st(q); check('still holding after 4.5 s (position unchanged)', Math.abs(a3.pos - a2.pos) < 0.02, { a2: a2.pos, a3: a3.pos });
  await conductBeats(q, c2, 3, 66, 0.2 * c2.scale); const a4 = await st(q); check('the next strokes resume it', !a4.held && a4.pos > a3.pos + 1.5, a4);
  // robust tempo: a burst of fast strokes cannot push the tempo past 1.4x the marked tempo (66)
  await conductBeats(q, c2, 14, 200, 0.2 * c2.scale); const a5 = await st(q); check('a burst of very fast strokes stays inside the 1.4x clamp (' + Math.round(a5.bpm) + ' bpm, marked 66)', a5.bpm <= 66 * 1.4 + 1, a5);
  await conductBeats(q, c2, 8, 66, 0.2 * c2.scale); const a6 = await st(q); check('and recovers when conducting steadily again (' + Math.round(a6.bpm) + ' bpm)', Math.abs(a6.bpm - 66) < 14, a6);
  const fb = await q.evaluate(() => ({ chip: document.getElementById('tempoChip').textContent })); note('tempo readout: ' + JSON.stringify(fb));
  check('the tempo readout shows the BPM', /♩ \d+/.test(fb.chip), fb);
  const guideOn = await q.evaluate(() => JSON.parse(localStorage.getItem('kusoge.orchestra.prefs') || '{}').guide !== false); check('the baton-path guide is on by default', guideOn);
  await shot(q, '03-enjoy-guide'); check('no page errors', e.log.pageErrors.length === 0, e.log.pageErrors.slice(0, 3)); await e.close();
}

async function practiceCheck(env) {
  console.log('3b. practice mode and the how-to demo');
  const s = await open(env, { seed: {} }); const p = s.page; await wait(p, () => __kb.state().howto, null, 8000);
  const demo = await p.evaluate(() => { const c = document.getElementById('howDemo'); const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < x.length; i += 4) if (x[i] > 0) n++; return { w: c.width, tabs: document.querySelectorAll('#howTabs button').length, drawn: n }; });
  check('the first-launch how-to has an animated baton-path demo (2/3/4 beats)', demo.tabs === 3 && demo.drawn > 500, demo); await shot(p, '03b-howto');
  await p.click('#howtoAlt'); await wait(p, () => __kb.state().title, null, 5000);
  await p.click('#tPrac'); await p.waitForTimeout(300); const c = await stageBox(p);
  const msg0 = await p.evaluate(() => document.getElementById('practiceMsg').textContent); check('practice starts with a prompt: ' + msg0, /4/.test(msg0), msg0);
  await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.3); await conductBeats(p, c, 5, 80, 0.24 * c.scale);
  const msg1 = await p.evaluate(() => document.getElementById('practiceMsg').textContent); check('practice counts the beats and reads out the tempo: ' + msg1, /♩=\d+/.test(msg1) || /いいね/.test(msg1), msg1);
  await shot(p, '03b-practice'); await p.click('#pracGo'); await wait(p, () => __kb.state().title, null, 5000); check('"曲をえらぶ" returns to the pieces', true);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function cues(env) {
  console.log('4. cues: the glowing section is brought in with a button, a number key, a click on its seat and a swipe');
  const s = await open(env); const p = s.page; await startReal(p, 'dvorak7', 'normal'); const c = await stageBox(p);
  const info = await p.evaluate(() => __orch.G.score.cues.map((q, i) => ({ i, b: q.b, secs: q.secs })).filter(q => q.secs.length <= 2));
  check('Dvořák has cue events with 1-2 sections (' + info.length + ')', info.length >= 8, info.length);
  await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.3); await conductBeats(p, c, 2, 80, 0.22 * c.scale); await wait(p, () => __kb.state().state === 'playing');
  const results = {};
  for (const [k, method] of [[0, 'button'], [1, 'key'], [2, 'seat'], [3, 'swipe']]) {
    const cue = info[k]; await p.evaluate(b => __orch.seekTo(b - 5.2), cue.b);
    const sec = cue.secs[0]; let given = false, glow = false;
    for (let beat = 0; beat < 6 && !given; beat++) {
      await bounce(p, c, 60 / 80, 0.22 * c.scale);
      const up = await p.evaluate(() => __orch.G.session.upcoming(__orch.G.ctx.currentTime, 6.5).filter(u => !u.done).map(u => ({ rel: u.rel, secs: u.secs })));
      const mine = up.find(u => u.secs.includes(sec)); if (mine && !glow) { glow = await p.evaluate(sec => document.querySelector(`.cuebtn[data-sec="${sec}"]`).classList.contains('cue'), sec); }
      if (mine && mine.rel < 2.3 && mine.rel > 0.9) {
        if (method === 'button') await p.click(`.cuebtn[data-sec="${sec}"]`);
        else if (method === 'key') { const key = await p.evaluate(sec => document.querySelector(`.cuebtn[data-sec="${sec}"]`).firstChild.textContent.toLowerCase(), sec); await p.keyboard.press(key); }
        else if (method === 'seat') { const seat = await p.evaluate(sec => { const s = __orch.art.seats[sec]; return { x: s.x, y: s.y }; }, sec); await p.mouse.click(c.x + seat.x, c.y + seat.y); }
        else { const seat = await p.evaluate(sec => { const s = __orch.art.seats[sec], pd = __orch.art.podium; return { x: s.x, y: s.y, px: pd.x, py: pd.y }; }, sec);
          const dx = seat.x - seat.px, dy = seat.y - seat.py, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L; const sx = c.x + seat.px, sy = c.y + seat.py - 20; await p.mouse.move(sx, sy); await p.mouse.down();
          for (let i = 1; i <= 8; i++) { await p.mouse.move(sx + ux * 0.045 * c.scale * i * 1.0 * 1.0 + 0, sy + uy * 0.045 * c.scale * i); await sleep(14); } await p.mouse.up(); }
        given = true;
      }
    }
    await sleep(150); const a = await st(p); results[method] = { given, glow, cues: a.cues };
    check(`${method}: ${sec} glowed before its entrance, the cue was given and judged (${JSON.stringify(a.cues)})`, given && glow && a.cues.cues >= k + 1 && a.cues.wrong === 0, results[method]);
  }
  await shot(p, '04-cues'); const r = await p.evaluate(() => __orch.G.session.result()); check('cue score counts them: ' + r.stats.cues + ' given, ' + r.stats.perfect + ' perfect', r.stats.cues >= 4 && r.stats.perfect >= 3, r.stats);
  const wrongBefore = (await st(p)).cues.wrong; await p.click('.cuebtn[data-sec="cb"]'); const wrong = (await st(p)).cues; check('a cue to a section that is not coming in counts as wrong', wrong.wrong === wrongBefore + 1, wrong);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  // a missed entrance and the quiet entrance
  const m = await open(env); const q = m.page; await startReal(q, 'dvorak7', 'normal'); const c2 = await stageBox(q); const cue = info[0];
  await q.mouse.move(c2.x + c2.w * 0.5, c2.y + c2.stageH * 0.3); await conductBeats(q, c2, 2, 80, 0.22 * c2.scale); await wait(q, () => __kb.state().state === 'playing');
  await q.evaluate(b => __orch.seekTo(b - 4), cue.b); let toastSeen = false, gain = 1;
  for (let k = 0; k < 9 && !toastSeen; k++) { await bounce(q, c2, 60 / 80, 0.22 * c2.scale); toastSeen = await q.evaluate(() => /入りそこねた/.test(document.getElementById('toast').textContent) && !document.getElementById('toast').hidden); }
  gain = await q.evaluate(c => { const g = __orch.G; return g.session.entranceGain(g.score.secIndex[c.secs[0]], c.b); }, cue);
  check('an entrance nobody cued is flagged ("入りそこねた"), and that section comes in quietly (gain ' + gain + ')', toastSeen && gain < 0.5, { toastSeen, gain }); await m.close();
}

async function finish(env) {
  console.log('5. to the end: results, best score, saving, again and next');
  const s = await open(env); const p = s.page; await startReal(p, 'nachtmusik', 'normal'); const c = await stageBox(p);
  await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.3); await conductBeats(p, c, 4, 66, 0.22 * c.scale); await wait(p, () => __kb.state().state === 'playing');
  await p.evaluate(() => __orch.seekNearEnd(7)); let guard = 0;
  while (!(await st(p)).result && guard++ < 40) { await bounce(p, c, 60 / 66, 0.22 * c.scale); }
  await wait(p, () => __kb.state().result, null, 20000); const a = await st(p);
  check('the finale shows the result overlay', a.result && a.res && a.res.total >= 0, a.res); await shot(p, '05-result');
  const txt = await p.locator('#ovResult').innerText(); check('result shows the score, the three rows and stars', /テンポの安定/.test(txt) && /強弱/.test(txt) && /入り/.test(txt) && (await p.locator('#rStars i.on').count()) >= 1, txt.slice(0, 200));
  const sv = await stored(p, SAVE); check('saved: best score and stars for this piece and difficulty (normal)', sv && sv.p.nachtmusik && sv.p.nachtmusik.b1 === a.res.total && sv.p.nachtmusik.s1 === a.res.stars && sv.p.nachtmusik.n === 1 && sv.stats.finishes === 1 && sv.v === 1, sv);
  check('a new best is announced the first time', !(await p.locator('#rNew').isHidden()), null);
  await p.click('#rAgain'); await wait(p, () => __kb.state().playing, null, 90000); await p.evaluate(() => __orch.showTitle());
  const sv2 = await stored(p, SAVE); check('a second start counts a play but the best stays', sv2.p.nachtmusik.n === 2 && sv2.p.nachtmusik.b1 === a.res.total, sv2.p.nachtmusik);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready()); const stars = await p.locator('.rc[data-piece="nachtmusik"] .st').innerText();
  check('the piece card shows the stars after a reload: ' + stars, /★/.test(stars) && stars.replace(/[^★]/g, '').length === sv.p.nachtmusik.s1, stars);
  await p.click('.dfb[data-diff="enjoy"]'); const stars2 = await p.locator('.rc[data-piece="nachtmusik"] .st').innerText(); check('stars are kept per difficulty (enjoy has none yet)', !/★/.test(stars2), stars2);
  check('the total counts the best of each piece', (await stored(p, SAVE)).total === sv.p.nachtmusik.b1, await stored(p, SAVE));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

const NEW_PIECES = ['mahler5-4', 'mahler5-1', 'mahler5-2', 'mahler5-3', 'mahler5-5', 'dvorak8-3', 'mozart387-1', 'mozart387-3', 'beethoven-q59-3', 'haydn76-1-2', 'beethoven-q4-1', 'beethoven-q4-3', 'schubert-qs', 'grieg-aase', 'beethoven-marsch', 'haydn76-1-1', 'coriolan', 'fidelio', 'mozart25-1', 'mozart25-2', 'beethoven5-2', 'beethoven7-1', 'dvorak8-1', 'dvorak8-4', 'dvorak7-1', 'dvorak7-2', 'dvorak7', 'dvorak7-4', 'dvorak9-1', 'dvorak9-2', 'dvorak9-3', 'dvorak9-4'];
async function newPieces(env) {
  console.log('5b. the Dvořák 7 and 9 movements: each starts, runs and finishes; parts; the beat filter; licence credits');
  const only = process.env.ORCH_PIECES ? process.env.ORCH_PIECES.split(',') : NEW_PIECES;
  const s = await open(env, { query: '' }); const p = s.page;
  const ids = await p.evaluate(() => __kb.state().pieces); check('the new movements are in the index: ' + ids.length + ' pieces', NEW_PIECES.every(x => ids.includes(x)) && ids.length >= 44, ids);
  await p.evaluate(() => { document.querySelector('.dfb[data-diff="enjoy"]').click(); document.getElementById('expandAll').click(); });
  const grp = await p.evaluate(() => [...document.querySelectorAll('#pList .grp')].map(g => g.textContent)); check('the list is grouped by symphony', grp.some(g => /Dvořák|ドヴォルザーク/.test(g)) && grp.length >= 2, grp);
  await p.click('#filters summary'); await p.click('#patFilter button[data-n="4"]'); const n4 = await p.evaluate(() => [...document.querySelectorAll('#pList .rc')].map(b => [b.dataset.piece, b.querySelector('.pat').textContent])); check('the 4-beat filter shows only 4-beat pieces: ' + n4.map(x => x[0]).join(','), n4.length >= 2 && n4.every(x => /4|四|four/i.test(x[1])), n4);
  await p.click('#patFilter button[data-n="3"]'); const n3 = await p.evaluate(() => [...document.querySelectorAll('#pList .rc')].map(b => b.dataset.piece)); check('the 3-beat filter now shows 3-beat pieces: ' + n3.join(','), n3.includes('beethoven5-2'), n3);
  const pats = await p.evaluate(() => { const r = {}; document.querySelectorAll('#pList .rc').forEach(b => { r[b.dataset.piece] = b.querySelector('.pat').textContent; }); return r; }); check('every listed piece is tagged with its beat pattern', Object.values(pats).every(t => /[234]/.test(t) || /beat|拍/.test(t)), pats);
  await p.click('#patFilter button[data-n="0"]');
  // search, composer, era, favourites, collapsible groups
  await p.fill('#pSearch', 'haydn'); let vis = await p.evaluate(() => [...document.querySelectorAll('#pList .rc')].map(b => b.dataset.piece)); check('search finds the Haydn quartet movements: ' + vis.join(','), vis.length >= 2 && vis.every(x => /haydn/.test(x)), vis);
  await p.fill('#pSearch', ''); await p.selectOption('#pComp', 'Schubert'); vis = await p.evaluate(() => [...document.querySelectorAll('#pList .rc')].map(b => b.dataset.piece)); check('the composer filter: ' + vis.join(','), vis.length === 1 && vis[0] === 'schubert-qs', vis);
  await p.selectOption('#pComp', ''); await p.click('#eraFilter button[data-era="romantic"]'); vis = await p.evaluate(() => [...document.querySelectorAll('#pList .rc')].map(b => b.dataset.piece)); check('the era filter (romantic) keeps Dvořák, Schubert, Grieg and drops Haydn: ' + vis.length, vis.includes('schubert-qs') && vis.includes('dvorak9-1') && !vis.some(x => /haydn|mozart/.test(x)), vis);
  await p.click('#eraFilter button[data-era=""]');
  await p.evaluate(() => document.querySelector('.rrow:has(.rc[data-piece="grieg-aase"]) .fav').click()); await p.click('#favOnly'); vis = await p.evaluate(() => [...document.querySelectorAll('#pList .rc')].map(b => b.dataset.piece)); check('a favourite can be starred and filtered: ' + vis.join(','), vis.length === 1 && vis[0] === 'grieg-aase' && (await p.evaluate(() => JSON.parse(localStorage.getItem('kusoge.orchestra.prefs')).fav)).includes('grieg-aase'), vis);
  await p.click('#favOnly'); const before = await p.locator('#pList .rc').count(); await p.evaluate(() => document.querySelector('#pList .grp').click()); const after = await p.locator('#pList .rc').count(); check('a group header collapses and reopens its pieces (' + before + ' -> ' + after + ')', after < before, { before, after }); await p.evaluate(() => document.querySelector('#pList .grp').click()); await p.click('#filters summary');
  for (const id of only) {
    await p.evaluate(id => __orch.start(id, 'enjoy'), id); await wait(p, () => __kb.state().playing, null, 120000); const c = await stageBox(p);
    await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.3); const g = await p.evaluate(() => ({ g: __orch.G.score.bpmAt(0) })); const bpm = Math.min(120, Math.max(50, g.g));
    await conductBeats(p, c, 4, bpm, 0.22 * c.scale); await wait(p, () => __kb.state().state === 'playing', null, 5000); let a = await st(p);
    check(id + ' starts and runs (' + Math.round(a.bpm) + ' bpm, pos ' + a.pos.toFixed(1) + ', voices ' + a.voices + ')', a.state === 'playing' && (a.voices >= 1 || /mahler/.test(id)) && a.bpm > 20, a);
    await p.evaluate(() => __orch.seekNearEnd(6)); let guard = 0; while (!(await st(p)).result && guard++ < 60) await bounce(p, c, 60 / bpm, 0.22 * c.scale);
    await wait(p, () => __kb.state().result, null, 30000); a = await st(p); const sv = await stored(p, SAVE);
    check(id + ' finishes: result ' + (a.res && a.res.total) + ', saved under the piece id', a.res && sv.p[id] && sv.p[id].b0 === a.res.total && sv.p[id].n >= 1, sv && sv.p[id]);
    await p.evaluate(() => __orch.showTitle());
  }
  // parts: dvorak7-1 offers whole / two parts; a part plays only its beats and is saved under id~part, outside the stars total
  await p.click('.rc[data-piece="dvorak7-1"]'); await p.waitForSelector('#partBox button'); const opts = await p.evaluate(() => [...document.querySelectorAll('#partBox button')].map(b => b.dataset.part || b.textContent)); check('a long movement offers whole / part 1 / part 2: ' + opts.join(','), opts.length >= 3 && opts.includes('a') && opts.includes('b'), opts);
  await p.click('#partBox button[data-part="b"]'); await wait(p, () => __kb.state().playing, null, 120000);
  const nb = await p.evaluate(() => ({ n: __orch.G.score.nBeats, key: __orch.G.key })); check('part 2 plays only its half (' + nb.n + ' beats) under its own save key ' + nb.key, nb.n > 250 && nb.n < 340 && nb.key === 'dvorak7-1~b', nb);
  const c = await stageBox(p); await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.3); await conductBeats(p, c, 4, 66, 0.22 * c.scale); await wait(p, () => __kb.state().state === 'playing', null, 5000);
  await p.evaluate(() => __orch.seekNearEnd(5)); let gd = 0; while (!(await st(p)).result && gd++ < 60) await bounce(p, c, 60 / 66, 0.22 * c.scale); await wait(p, () => __kb.state().result, null, 30000);
  const sv2 = await stored(p, SAVE); check('the part result is saved separately and does not add to the star total', sv2.p['dvorak7-1~b'] && sv2.p['dvorak7-1~b'].n >= 1 && sv2.stars <= NEW_PIECES.length * 3, { keys: Object.keys(sv2.p), stars: sv2.stars });
  await p.evaluate(() => __orch.showTitle()); await p.evaluate(() => __orch.showCredits()); const cr = await p.locator('#cBody').innerText();
  check('the credits table lists Dvořák 9 with CC BY-SA 3.0 and the Mutopia credit, and Dvořák 7 as Public Domain', /CC BY-SA 3\.0/.test(cr) && /1793/.test(cr) && /1901/.test(cr) && /Keith OHara/.test(cr), cr.slice(0, 200));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function modelDemo(env) {
  console.log('5c. お手本: the model baton, listening to a piece conducted by the model (no scoring, saves unchanged)');
  const s = await open(env); const p = s.page; const before = JSON.stringify(await stored(p, SAVE));
  await p.click('#tSet'); const gOpts = await p.evaluate(() => [...document.querySelectorAll('#ghostSel option')].map(o => o.value)); check('settings offer the model baton: off / soft / bold', gOpts.join() === 'off,soft,bold', gOpts);
  await p.selectOption('#ghostSel', 'bold'); check('the choice is saved', (await p.evaluate(() => JSON.parse(localStorage.getItem('kusoge.orchestra.prefs')).ghost)) === 'bold'); await p.click('#sClose');
  await p.evaluate(() => document.querySelector('.rrow:has(.rc[data-piece="nachtmusik"]) .demo').click()); await p.click('#partBox button[data-act="listen"]'); await wait(p, () => __kb.state().playing, null, 120000);
  const a = await wait(p, () => __kb.state().state === 'playing' && __kb.state().pos > 3, null, 40000).then(() => st(p));
  check('the model conducts by itself: it plays with no player input (pos ' + a.pos.toFixed(1) + ', ' + Math.round(a.bpm) + ' bpm, voices ' + a.voices + ')', a.state === 'playing' && a.voices > 2 && a.bpm > 40, a);
  const gh = await p.evaluate(() => { const c = document.getElementById('board'); return { demo: __orch.G.demo, key: __orch.G.key }; }); check('it is flagged as a demonstration', gh.demo === true, gh); await shot(p, '05c-model');
  await p.evaluate(() => __orch.seekNearEnd(6)); await wait(p, () => __kb.state().title, null, 60000);
  const after = JSON.stringify(await stored(p, SAVE)); check('no scoring in the demonstration: no result screen, the save is unchanged', before === after && !(await st(p)).result, { before, after });
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function holdPieces(env) {
  console.log('5d. staged (hold) pieces, loaded only with ?debug&hold: Mahler 5 starts, runs and finishes on the light tier; the normal page does not list them');
  const s0 = await open(env); const ids0 = await s0.page.evaluate(() => __kb.state().pieces); check('the normal page does NOT list the staged pieces', !ids0.some(x => /mahler/.test(x)), ids0); await s0.close();
  const s = await open(env, { query: '&hold' }); const p = s.page; const ids = await p.evaluate(() => __kb.state().pieces); check('with ?debug&hold the staged Mahler 5 movements are listed', ['mahler5-1', 'mahler5-2', 'mahler5-3', 'mahler5-4', 'mahler5-5'].every(x => ids.includes(x)), ids);
  for (const id of (process.env.ORCH_HOLD || 'mahler5-4,mahler5-2').split(',')) {
    await p.evaluate(id => __orch.start(id, 'enjoy'), id); await wait(p, () => __kb.state().playing, null, 180000); const c = await stageBox(p);
    const g = await p.evaluate(() => ({ bpm: __orch.G.score.bpmAt(0), tier: __orch.G.tier, pat: __orch.G.score.patternOfBeat[0] })); const bpm = Math.min(110, Math.max(40, g.bpm));
    check(id + ' loads on the light tier (' + g.tier + ')', g.tier === 'lo', g);
    await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.3); await conductBeats(p, c, 4, bpm, 0.22 * c.scale); await wait(p, () => __kb.state().state === 'playing', null, 5000); let a = await st(p);
    check(id + ' starts and runs (' + Math.round(a.bpm) + ' bpm, voices ' + a.voices + ', ' + (a.bytes / 1048576).toFixed(0) + ' MB decoded)', a.state === 'playing' && a.bpm > 20 && a.bytes < 120e6, a);
    await p.evaluate(() => __orch.seekNearEnd(6)); let guard = 0; while (!(await st(p)).result && guard++ < 80) await bounce(p, c, 60 / bpm, 0.22 * c.scale);
    await wait(p, () => __kb.state().result, null, 40000); a = await st(p); check(id + ' finishes with a result (' + (a.res && a.res.total) + ')', a.res && a.res.total >= 0, a.res); await p.evaluate(() => __orch.showTitle());
  }
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function keyboard(env) {
  console.log('6. the keyboard alone: Space for beats, arrows for volume, number keys for cues, P to pause');
  const s = await open(env); const p = s.page; await startReal(p, 'dvorak7', 'normal');
  const tap = async (k, n, bpm) => { for (let i = 0; i < n; i++) { const t0 = Date.now(); await p.keyboard.press(k); await sleep(Math.max(0, 60000 / bpm - (Date.now() - t0))); } };
  await tap('Space', 2, 80); await wait(p, () => __kb.state().state === 'playing', null, 4000); await tap('Space', 6, 80); let a = await st(p);
  check(`Space taps conduct: ${Math.round(a.bpm)} bpm for 80, ${a.pos.toFixed(1)} beats in`, Math.abs(a.bpm - 80) < 10 && a.pos > 5, a);
  const l0 = a.level; await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); a = await st(p); check('ArrowUp raises the volume (' + l0.toFixed(2) + ' -> ' + a.level.toFixed(2) + ')', a.level > l0 + 0.1, a);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); const a2 = await st(p); check('ArrowDown lowers it', a2.level < a.level - 0.08, a2);
  await tap('ArrowRight', 2, 80); await tap('Enter', 2, 80); a = await st(p); check('ArrowRight and Enter are beats too', a.pos > 9, a);
  const keyBefore = (await st(p)).cues; await p.keyboard.press('2'); const keyAfter = (await st(p)).cues; check('a number key is a cue (wrong section now, so it counts as wrong, not a crash)', keyAfter.wrong === keyBefore.wrong + 1, { keyBefore, keyAfter });
  await p.keyboard.press('p'); await wait(p, () => __kb.state().menuOpen, null, 3000); a = await st(p); check('P opens the pause menu and pauses', a.menuOpen && a.paused, a);
  const posP = a.pos; await sleep(900); a = await st(p); check('paused: the music does not move', Math.abs(a.pos - posP) < 0.01, { posP, a: a.pos });
  await p.keyboard.press('Escape'); await wait(p, () => !__kb.state().menuOpen, null, 3000); a = await st(p); check('Escape (the "continue" button) resumes', !a.paused, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function touch(env) {
  console.log('7. a finger (CDP touch events) on a 320 px phone: conduct, tap a section button, tap the stage');
  const s = await open(env, { vp: 'se1', touch: true }); const p = s.page; const cdp = await s.ctx.newCDPSession(p);
  await p.tap('.rc[data-piece="midsummer"]'); await wait(p, () => __kb.state().playing, null, 90000); const c = await stageBox(p);
  let a = await st(p); check('the piece started from a tap (memory tier ' + a.tier + ')', a.playing, a);
  for (let k = 0; k < 3; k++) await touchBounce(cdp, c, 60 / 100, 0.25 * c.scale, { end: false });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  for (let k = 0; k < 8; k++) { await touchBounce(cdp, c, 60 / 100, 0.25 * c.scale, { end: false }); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); a = await st(p);
  check(`finger strokes start the piece and set the tempo: ${a.state}, ${Math.round(a.bpm)} bpm for 100`, a.state === 'playing' && Math.abs(a.bpm - 100) < 14, a);
  await shot(p, '07-touch-se1');
  const cb = await p.locator('.cuebtn').first().boundingBox(); check('section buttons are at least 40 px for a finger (' + Math.round(cb.width) + 'x' + Math.round(cb.height) + ')', cb.width >= 40 && cb.height >= 40, cb);
  const wrong0 = (await st(p)).cues.wrong; await p.tap('.cuebtn[data-sec="cb"]'); check('tapping a section button gives a cue', (await st(p)).cues.wrong > wrong0 || (await st(p)).cues.cues > 0, await st(p));
  const before = (await st(p)).beats; await p.touchscreen.tap(c.x + c.w * 0.5, c.y + c.stageH * 0.6); check('a tap on the empty stage is a beat', (await st(p)).beats >= before, await st(p));
  const r = await p.evaluate(`(${layoutProbe})()`); check(`320 px while playing: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function phoneMotion(env) {
  console.log('7b. swing the phone: injected DeviceMotionEvents (real Android/iPhone sensors are not available in the test browser)');
  // a swinging phone: vertical acceleration -H w^2 cos(w t) on top of gravity, at 60 Hz, dispatched as real DeviceMotionEvents (gravity along z, or y for another way round)
  const swing = (p, bpm, peak, g) => p.evaluate(([bpm, peak, g]) => { clearInterval(window.__sw); const T = 60 / bpm, w = 2 * Math.PI / T, t0 = performance.now(); window.__sw = setInterval(() => { const t = (performance.now() - t0) / 1000, a = -peak * Math.cos(w * t), v = { x: g === 'y' ? a : 0, y: g === 'y' ? 9.8 : 0, z: g === 'y' ? 0 : 9.8 + a }; if (g === 'y') { v.y = 9.8 + a; v.x = 0; } window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: v, interval: 16 })); }, 16); }, [bpm, peak, g]);
  const stopSwing = p => p.evaluate(() => clearInterval(window.__sw));
  // 1. out of the box on a touch phone: the toggle is visible on the title, on by default, and the swing starts and conducts the piece
  let s = await open(env, { touch: true, vp: 'ip12' }); let p = s.page; await p.addInitScript(() => { try { delete DeviceMotionEvent.requestPermission; } catch (e) {} }); await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready()); // Android Chrome: no requestPermission
  const row = await p.evaluate(() => ({ vis: !document.getElementById('motionRow').hidden, state: document.getElementById('tMotion').dataset.state, txt: document.getElementById('tMotion').innerText }));
  check('the title has a visible swing-the-phone toggle: ' + row.txt.replace(/\n/g, ' '), row.vis, row);
  await p.click('#tMotion'); await p.waitForTimeout(300); check('tapping it turns the sensor on (waiting for data)', (await p.evaluate(() => document.getElementById('tMotion').dataset.state)) === 'waiting', await p.evaluate(() => document.getElementById('tMotion').dataset.state));
  await swing(p, 66, 12, 'z'); await p.waitForTimeout(800); check('data arrives: the state shows the sensor works', (await p.evaluate(() => document.getElementById('tMotion').dataset.state)) === 'on', await p.evaluate(() => document.getElementById('tMotion').dataset.state));
  await stopSwing(p);
  await p.click('#tSet'); await p.click('#tSensor'); await p.waitForSelector('#ovMotion:not([hidden])'); await swing(p, 80, 14, 'y'); await p.waitForTimeout(3500);
  const info = await p.evaluate(() => ({ txt: document.getElementById('smInfo').textContent, st: document.getElementById('smState').textContent, px: (() => { const c = document.getElementById('smCv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; })() }));
  check('the sensor test shows live data and detected beats (' + info.txt + ')', /拍 [3-9]|拍 \d\d/.test(info.txt) && info.px > 300, info); await shot(p, '07b-sensor-test'); await stopSwing(p); await p.click('#smClose'); await wait(p, () => __kb.state().title, null, 5000);
  await p.evaluate(() => document.querySelector('.dfb[data-diff="normal"]').click()); await p.evaluate(() => __orch.start('nachtmusik', 'normal')); await wait(p, () => __kb.state().playing, null, 90000);
  await swing(p, 66, 12, 'z'); await wait(p, () => __kb.state().state === 'playing', null, 9000).catch(() => {}); await p.waitForTimeout(5000); let a = await st(p);
  check('swinging the phone starts the piece and sets the tempo (' + a.state + ', ' + Math.round(a.bpm) + ' bpm for 66, pos ' + a.pos.toFixed(1) + ')', a.state === 'playing' && Math.abs(a.bpm - 66) < 16 && a.pos > 3, a);
  const chip = await p.evaluate(() => ({ vis: !document.getElementById('motionChip').hidden, st: document.getElementById('motionChip').dataset.state })); check('a live indicator is in the play screen: ' + chip.st, chip.vis && chip.st === 'on', chip);
  await stopSwing(p); await s.close();
  // 2. no sensor data at all: after 1.5 s the page says so and tells how to fix it (Android)
  s = await open(env, { touch: true, vp: 'ip12' }); p = s.page; await p.addInitScript(() => { try { delete DeviceMotionEvent.requestPermission; } catch (e) {} }); await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready()); await p.click('#tMotion'); await p.waitForTimeout(2200);
  const un = await p.evaluate(() => ({ st: document.getElementById('tMotion').dataset.state, help: document.getElementById('motionHelp').textContent })); check('no readings: "sensor not responding" with the Android fix: ' + un.st, ['unavailable', 'nodata'].includes(un.st) && /モーションセンサー/.test(un.help), un); await s.close();
  // 3. iPhone: requestPermission, denied then granted (only inside a tap)
  s = await open(env, { touch: true, vp: 'ip12' }); p = s.page;
  await p.addInitScript(() => { window.__perm = 'denied'; window.__asked = 0; DeviceMotionEvent.requestPermission = () => { window.__asked++; return Promise.resolve(window.__perm); }; });
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  await p.click('#tMotion'); await p.waitForTimeout(300); const dn = await p.evaluate(() => ({ st: document.getElementById('tMotion').dataset.state, asked: window.__asked, help: document.getElementById('motionHelp').textContent })); check('iPhone permission denied: the page says so and shows the Settings > Safari fix', dn.st === 'denied' && dn.asked === 1 && /Safari/.test(dn.help), dn);
  await p.evaluate(() => { window.__perm = 'granted'; }); await p.click('#tMotion'); await p.waitForTimeout(300); check('granted on the next tap: listening', ['waiting', 'on'].includes(await p.evaluate(() => document.getElementById('tMotion').dataset.state)), await p.evaluate(() => document.getElementById('tMotion').dataset.state));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function joycon(env) {
  console.log('7c. Joy-Con over WebHID with a fake HID device (no real controller was available)');
  let s = await open(env); let p = s.page;
  await p.addInitScript(() => {
    const dev = { vendorId: 0x057e, productId: 0x2007, productName: 'Joy-Con (R)', opened: false, sent: [], ls: [], async open() { dev.opened = true; }, async close() { dev.opened = false; }, async sendReport(id, data) { dev.sent.push([id, Array.from(data)]); },
      addEventListener(t, f) { dev.ls.push([t, f]); }, removeEventListener(t, f) { dev.ls = dev.ls.filter(x => x[1] !== f); } };
    window.__dev = dev; const hl = []; Object.defineProperty(navigator, 'hid', { configurable: true, value: { async requestDevice(o) { window.__reqFilters = o.filters; return [dev]; }, async getDevices() { return [dev]; }, addEventListener(t, f) { hl.push([t, f]); } } });
    window.__hidEvents = hl;
    window.__sendReport = (samples, buttons) => { const b = new Uint8Array(48); const put = (i, v) => { v = Math.max(-32768, Math.min(32767, Math.round(v))); b[i] = v & 255; b[i + 1] = (v >> 8) & 255; }; if (buttons && buttons.A) b[2] |= 0x08;
      samples.forEach((x, n) => { put(12 + n * 12, x[0]); put(14 + n * 12, x[1]); put(16 + n * 12, x[2]); }); dev.ls.filter(x => x[0] === 'inputreport').forEach(x => x[1]({ reportId: 0x30, data: new DataView(b.buffer) })); };
    window.__swingJc = (bpm, peak) => { clearInterval(window.__sj); const T = 60 / bpm, w = 2 * Math.PI / T, t0 = performance.now(), lsb = v => v / (9.80665 / 4096); window.__sj = setInterval(() => { const t = (performance.now() - t0) / 1000, smp = []; for (let n = 0; n < 3; n++) { const a = -peak * Math.cos(w * (t + n * 0.005)); smp.push([0, 0, lsb(9.8 + a)]); } window.__sendReport(smp); }, 15); };
  });
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  await p.click('#tSet'); const before = await p.evaluate(() => ({ dis: document.getElementById('jcBtn').disabled, txt: document.getElementById('jcState').textContent })); check('the Joy-Con button is enabled in a browser with WebHID', before.dis === false, before);
  await p.click('#jcBtn'); await p.waitForTimeout(600);
  const c = await p.evaluate(() => ({ filters: window.__reqFilters, sent: window.__dev.sent, opened: window.__dev.opened, txt: document.getElementById('jcState').textContent }));
  check('it asks for Nintendo devices (0x057e: Joy-Con L / R, Pro), opens the device, enables the IMU (0x40) and full mode (0x30)', c.opened && c.filters.every(f => f.vendorId === 0x057e) && c.sent.length === 2 && c.sent[0][1][9] === 0x40 && c.sent[1][1][9] === 0x03 && c.sent[1][1][10] === 0x30, c);
  check('the status says connected: ' + c.txt, /つながりました/.test(c.txt), c);
  await p.click('#sClose'); await p.evaluate(() => document.querySelector('.dfb[data-diff="normal"]').click()); await p.evaluate(() => __orch.start('nachtmusik', 'normal')); await wait(p, () => __kb.state().playing, null, 90000);
  await p.evaluate(() => window.__swingJc(66, 15)); await p.waitForTimeout(5500); const a = await st(p);
  check('swinging the Joy-Con starts the piece and sets the tempo (' + a.state + ', ' + Math.round(a.bpm) + ' bpm for 66, pos ' + a.pos.toFixed(1) + ')', a.state === 'playing' && Math.abs(a.bpm - 66) < 16 && a.pos > 3, a);
  const cues0 = (await st(p)).cues; await p.evaluate(() => window.__sendReport([[0, 0, 4096], [0, 0, 4096], [0, 0, 4096]], { A: true })); await p.evaluate(() => window.__sendReport([[0, 0, 4096], [0, 0, 4096], [0, 0, 4096]], {})); const cues1 = (await st(p)).cues;
  note('A button: cues ' + JSON.stringify(cues0) + ' -> ' + JSON.stringify(cues1)); check('the A button gives a cue (counted as wrong when nothing is due, no crash)', cues1.wrong + cues1.perfect + cues1.late >= cues0.wrong + cues0.perfect + cues0.late, { cues0, cues1 });
  await p.evaluate(() => { clearInterval(window.__sj); window.__hidEvents.filter(x => x[0] === 'disconnect').forEach(x => x[1]({ device: window.__dev })); }); await p.waitForTimeout(200); await p.click('#tSet').catch(() => {});
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  s = await open(env); p = s.page; await p.addInitScript(() => { Object.defineProperty(navigator, 'hid', { configurable: true, value: undefined }); }); await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  await p.click('#tSet'); const un = await p.evaluate(() => ({ dis: document.getElementById('jcBtn').disabled, txt: document.getElementById('jcState').textContent })); check('Safari / Firefox / iOS: "not available in this browser" and the button is disabled', un.dis === true && /このブラウザでは使えません/.test(un.txt), un);
  await s.close();
}

async function lessonMode(env) {
  console.log('5e. ついてこい: the model conducts a phrase, then you repeat it; graded against the model; no effect on the piece scores');
  const s = await open(env); const p = s.page; const before = JSON.stringify((await stored(p, SAVE)));
  await p.evaluate(() => document.querySelector('.rrow:has(.rc[data-piece="nachtmusik"]) .demo').click());
  const acts = await p.evaluate(() => [...document.querySelectorAll('#partBox button')].map(b => b.dataset.act || b.textContent)); check('the ♪ menu offers listen / follow me with 2, 4 and 8 bars: ' + acts.join(','), ['listen', 'lesson2', 'lesson4', 'lesson8'].every(x => acts.includes(x)), acts);
  await p.click('#partBox button[data-act="lesson2"]'); await wait(p, () => __kb.state().playing, null, 120000);
  const ph0 = await p.evaluate(() => ({ phase: __orch.G.lesson.phase, n: __orch.G.lesson.phrases.length, demo: __orch.G.demo })); check('it starts with the model conducting the first phrase (' + ph0.n + ' phrases)', ph0.phase === 'model' && ph0.demo && ph0.n > 10, ph0);
  await wait(p, () => __orch.G && __orch.G.lesson.phase === 'you', null, 40000); const ph1 = await p.evaluate(() => ({ phase: __orch.G.lesson.phase, demo: __orch.G.demo, beats: __orch.G.score.nBeats, hint: document.getElementById('hint').textContent })); check('then it is your turn on the same phrase (' + ph1.beats + ' beats): ' + ph1.hint, ph1.phase === 'you' && !ph1.demo && ph1.beats <= 10, ph1);
  const c = await stageBox(p); await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.3); await conductBeats(p, c, 12, 66, 0.24 * c.scale);
  await wait(p, () => !document.getElementById('ovLesson').hidden, null, 30000).catch(() => {}); const res = await p.evaluate(() => ({ shown: !document.getElementById('ovLesson').hidden, stars: document.querySelectorAll('#lsStars i.on').length, rows: document.getElementById('lsRows').innerText, next: !document.getElementById('lsNext').hidden }));
  if (!res.shown) { await p.evaluate(() => __orch.seekNearEnd(1)); await conductBeats(p, c, 3, 66, 0.24 * c.scale); await wait(p, () => !document.getElementById('ovLesson').hidden, null, 20000); }
  const r2 = await p.evaluate(() => ({ shown: !document.getElementById('ovLesson').hidden, rows: document.getElementById('lsRows').innerText.replace(/\n/g, ' '), next: !document.getElementById('lsNext').hidden })); check('a short result: tempo and dynamics against the model, stars (' + r2.rows + ')', r2.shown && /\d+/.test(r2.rows) && r2.next, r2); await shot(p, '05e-lesson-result');
  const pr = await p.evaluate(() => JSON.parse(localStorage.getItem('kusoge.orchestra.prefs')).lessons.nachtmusik); check('the lesson is recorded on this device (prefs.lessons): ' + JSON.stringify(pr), pr && pr.n === 1, pr);
  await p.click('#lsNext'); await wait(p, () => __orch.G && __orch.G.lesson.idx === 1 && __orch.G.lesson.phase === 'model', null, 10000); check('the next phrase starts with the model again', true);
  const after = JSON.stringify(await stored(p, SAVE)); check('the piece scores, stars and totals are unchanged by the lesson', before === after, { before, after });
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function pause(env) {
  console.log('8. pause: the menu stops the clock and the sound, resuming re-enters, leaving goes back to the pieces');
  const s = await open(env); const p = s.page; await startReal(p, 'nachtmusik', 'enjoy'); const c = await stageBox(p);
  await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.3); await conductBeats(p, c, 6, 66, 0.22 * c.scale); let a = await st(p);
  await p.click('#pauseBtn'); await wait(p, () => __kb.state().menuOpen); a = await st(p); const pos = a.pos; check('the pause button opens the menu and pauses', a.menuOpen && a.paused, a);
  await sleep(1200); a = await st(p); check('enjoy mode does not run on while paused', Math.abs(a.pos - pos) < 0.01, { pos, a: a.pos });
  const txt = await p.locator('.kb-layer').first().innerText(); check('the menu offers leaving the piece', /この曲をやめる/.test(txt), txt.slice(0, 120));
  await p.getByText('つづける').first().click(); await wait(p, () => !__kb.state().menuOpen); await sleep(900); a = await st(p); check('continuing resumes the music', a.pos > pos + 0.5, { pos, a: a.pos });
  // hiding the page pauses by itself (needs the registry entry: KoboGame.register only works for registered ids)
  const registered = await p.evaluate(() => !!(window.KoboGame && KoboGame.info() && KoboGame.info().def));
  if (registered) {
    const pos2 = (await st(p)).pos; await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await wait(p, () => __kb.state().paused, null, 3000); a = await st(p); check('hiding the page pauses the piece', a.paused, a);
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await wait(p, () => __kb.state().menuOpen, null, 3000); a = await st(p); check('coming back shows the pause menu instead of running on by itself', a.menuOpen && a.paused && Math.abs(a.pos - pos2) < 0.5, a); await p.getByText('つづける').first().click(); await wait(p, () => !__kb.state().menuOpen);
  } else note('(not registered in common/games.js yet: the visibility pause is skipped)');
  await p.click('#pauseBtn'); await wait(p, () => __kb.state().menuOpen); await p.getByText('この曲をやめる').first().click(); await wait(p, () => __kb.state().title, null, 5000); a = await st(p);
  check('leaving goes back to the piece list and stops the audio', a.title && a.voices === 0, a); check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function english(env) {
  console.log('9. English: no Japanese on any screen (title, credits, rules, loading, play, result)');
  const s = await open(env, { lang: 'en', seed: {} }); const p = s.page;
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${what}: no Japanese`, jp.length === 0, jp.slice(0, 6)); };
  await miss('rules'); await p.click('#howtoAlt'); await miss('title'); await shot(p, '09-en-title');
  check('titles are English', /Symphony No\. 5/.test(await p.locator('#pList').innerText()) && /Eine kleine/.test(await p.locator('#pList').innerText()), await p.locator('.rc').first().innerText());
  await p.click('#tCred'); await miss('credits'); await p.click('#cClose'); await p.click('#tSet'); await miss('settings'); await p.click('#sClose');
  await p.evaluate(() => __orch.start('nachtmusik', 'normal')); await wait(p, () => __kb.state().playing, null, 90000); await p.waitForTimeout(300); await miss('play (waiting for the first stroke)');
  const c = await stageBox(p); await p.mouse.move(c.x + c.w * 0.5, c.y + c.stageH * 0.3); await conductBeats(p, c, 4, 66, 0.22 * c.scale); await miss('play'); await shot(p, '09-en-play');
  const chips = await p.locator('.cuebtn').allInnerTexts(); check('section buttons are English abbreviations: ' + chips.join(' | ').replace(/\n/g, ' '), chips.some(t => /Vn1/.test(t)) && chips.some(t => /Cb/.test(t)), chips);
  await p.evaluate(() => __orch.seekNearEnd(5)); let g = 0; while (!(await st(p)).result && g++ < 30) await bounce(p, c, 60 / 66, 0.22 * c.scale); await wait(p, () => __kb.state().result, null, 20000); await miss('result'); await shot(p, '09-en-result');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function themes(env) {
  console.log('10. light and dark: both drawn, the canvas and the cards follow the theme');
  const out = {};
  for (const scheme of ['light', 'dark']) {
    const s = await open(env, { scheme }); const p = s.page; await p.waitForTimeout(300);
    out[scheme] = { bg: await p.evaluate(() => getComputedStyle(document.body).backgroundColor), canvas: await p.evaluate(() => { const c = document.getElementById('board'); const d = c.getContext('2d').getImageData(4, 4, 1, 1).data; return [d[0], d[1], d[2]]; }), card: await p.evaluate(() => getComputedStyle(document.querySelector('.card')).backgroundImage.slice(0, 40)) };
    await shot(p, '10-title-' + scheme); await startReal(p, 'nachtmusik', 'normal'); await p.waitForTimeout(400); await shot(p, '10-play-' + scheme);
    out[scheme].play = await p.evaluate(() => { const c = document.getElementById('board'); const d = c.getContext('2d').getImageData(c.width / 2, c.height * 0.2, 1, 1).data; return [d[0], d[1], d[2]]; });
    check(`${scheme}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  check('the canvas hall is dark in dark mode and light in light mode (' + lum(out.dark.canvas).toFixed(0) + ' vs ' + lum(out.light.canvas).toFixed(0) + ')', lum(out.dark.canvas) < 80 && lum(out.light.canvas) > 160, out);
  check('the stage while playing follows too', lum(out.dark.play) < 120 && lum(out.light.play) > 140, out);
}

async function saves(env) {
  console.log('11. old, broken and odd saves');
  const cases = { 'not json': '{{{', 'array': '[1,2]', 'wrong types': JSON.stringify({ v: 1, total: 'x', stars: null, p: { nachtmusik: { b1: 'abc', s1: 9, n: -4 }, ghost: 5 }, stats: 3, set: { diff: 'nightmare' } }), 'good': JSON.stringify({ v: 1, total: 88, stars: 3, p: { nachtmusik: { b1: 88, s1: 3, n: 4, b0: 0, s0: 0, b2: 0, s2: 0 } }, stats: { plays: 4, finishes: 4 }, set: { diff: 'maestro', piece: 'rossini' } }) };
  for (const [name, val] of Object.entries(cases)) {
    const s = await open(env, { seed: { [HOWTO]: '1', [SAVE]: val } }); const p = s.page; const a = await st(p);
    check(`${name}: the page starts with sane values`, a.title && a.save.v === 1 && ['enjoy', 'normal', 'maestro'].includes(a.save.set.diff) && Object.values(a.save.p).every(x => x.s1 >= 0 && x.s1 <= 3 && x.n >= 0), a.save);
    if (name === 'good') check('good: the stored difficulty and total are restored', a.diff === 'maestro' && a.save.total === 88 && a.save.p.nachtmusik.b1 === 88, a);
    check(`${name}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
  const s = await open(env); const p = s.page; await p.evaluate(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
  await p.evaluate(() => __orch.showTitle()); check('the page survives a throwing localStorage', (await st(p)).title, await st(p)); await s.close();
}

async function layouts(env) {
  console.log('12. every screen size x ja/en: nothing off screen, no sideways scroll (320 px included)');
  for (const vp of (process.env.OR_VPS || 'se1,ip12,land').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, touch: true }); const p = s.page; const tag = `${vp}/${lang}`;
    const probe = async what => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} ${what}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0 && (!r.primary.length || r.primary.every(x => x.visible !== false)), r); };
    await probe('title'); if (lang === 'ja') await shot(p, `12-${vp}-title`);
    await p.click('#tCred'); await probe('credits'); await p.click('#cClose'); await p.click('#tHow'); await probe('rules'); await p.click('#howtoGo');
    await p.evaluate(() => __orch.start('beethoven5', 'normal')); await wait(p, () => __kb.state().playing, null, 90000); await p.waitForTimeout(400); await probe('play (waiting)'); if (lang === 'ja') await shot(p, `12-${vp}-play`);
    const c = await stageBox(p); const cdp = await s.ctx.newCDPSession(p); for (let k = 0; k < 5; k++) await touchBounce(cdp, c, 60 / 96, 0.24 * c.scale, {}); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await probe('play (conducting)'); if (lang === 'ja') await shot(p, `12-${vp}-conducting`);
    const sc = await p.evaluate(() => ({ w: document.documentElement.clientWidth, chipsH: document.getElementById('chips').getBoundingClientRect().height, stageH: document.getElementById('stageWrap').getBoundingClientRect().height })); check(`${tag}: the stage keeps room (${Math.round(sc.stageH)} px) next to the cue buttons (${Math.round(sc.chipsH)} px)`, sc.stageH > 230 || vp === 'land' && sc.stageH > 150, sc);
    await p.evaluate(() => __orch.seekNearEnd(5)); await p.waitForTimeout(100); let g = 0; while (!(await st(p)).result && g++ < 24) await touchBounce(cdp, c, 60 / 96, 0.24 * c.scale, {}); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(p, () => __kb.state().result, null, 20000); await probe('result'); if (lang === 'ja') await shot(p, `12-${vp}-result`);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} result: no Japanese`, jp.length === 0, jp.slice(0, 5)); }
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, audio, conduct, practiceCheck, cues, finish, newPieces, modelDemo, keyboard, touch, phoneMotion, joycon, lessonMode, pause, english, themes, saves, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 900)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
