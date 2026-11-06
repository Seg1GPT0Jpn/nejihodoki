#!/usr/bin/env node
// ころころ工房「つくる」の通しプレイ（Playwright。?debug の window.__physics で「どこを押すか」だけを聞き、押す・引っぱるのは本物のマウス／タッチ）
//   node tools/tests/physics-editor-play.js [build,codes,mine,layouts,english]   … 全部で約1分半
// 1. build：タイトルの「つくる」→ あたらしく作る → パレットから板をドラッグ・持ち手で傾ける・長くする・歯車をタップで置いて動かす・
//    玉の種類（元に戻す）・木箱を置いて🗑・設定（部品と目標の数・名前）→「ためす」で本物のドラッグで解く → 確認ずみ → 共有（コードと URL）
//    → 新しいページで URL を開く → 「作った人がクリアを確かめた」→ あそぶ → 同じ答えをドラッグで置いて解く
// 2. codes：書きかえたコード・大きすぎるコード・でたらめ・空・HTML の名前 → 例外なしで「読めない」、名前は文字のまま
// 3. mine：自分のレベル（複製・削除・編集・作り直すと確認が外れる・再読み込みで残る・30個まで）
// 4. layouts：全画面サイズ × ja/en でエディタの道具・パレット・ボタンが画面内で44px以上、横スクロールなし、英語に日本語なし
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const C = require('../../physics/codec.js');

const OUT = path.join(__dirname, 'out', 'shots', 'physics-editor');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.physics.save', MINE = 'kusoge.physics.mine';
const SEEN = { 'kusoge.physics.howto': '1' };
const DONE = Object.assign({}, SEEN, { [SAVE]: JSON.stringify({ v: 1, lv: {}, stars: 0, done: 0, stats: {}, tut: 1 }), 'kobo.nick': 'ねこ<b>好き' });
// the level the test builds (and its answer, found with engine.js): a board at (6, 5) tilted −30° and 3.25 long, a gear on it
const BOARD = { x: 6, y: 5, a: -30, w: 3.25 }, GEAR = { x: 6.5, y: 5.25 }, ANSWER = { t: 'plank', x: 1.5, y: 8.75, a: -30 };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: !!o.touch, hasTouch: !!o.touch });
  await s.goto(o.url || '/physics/?debug');
  await s.page.waitForFunction(() => window.__kb && __kb.ready());
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const pt = (p, x, y) => p.evaluate(([x, y]) => __physics.boardPoint(x, y), [x, y]);
async function dragPath(p, a, b) { await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await p.mouse.move(b.x, b.y, { steps: 6 }); await p.mouse.up(); }
async function fromPalette(p, id, x, y) { const a = await p.evaluate(id => __physics.palettePoint(id), id); await dragPath(p, a, await pt(p, x, y)); }
async function fromTray(p, t, x, y) { const a = await p.evaluate(t => __physics.trayPoint(t), t); await dragPath(p, a, await pt(p, x, y)); }
// turn with the round handle to angle a (world degrees; the screen's y is down)
async function turnTo(p, h, c, a) { const R = Math.hypot(h.x - c.x, h.y - c.y), r = a * Math.PI / 180; await dragPath(p, h, { x: c.x + Math.cos(r) * R, y: c.y - Math.sin(r) * R }); }
async function solve(p) { // the answer through the real tray and handle, then Start
  await fromTray(p, ANSWER.t, ANSWER.x, ANSWER.y);
  const h = await p.evaluate(() => __physics.handlePoint(0)), c = await pt(p, ANSWER.x, ANSWER.y);
  await turnTo(p, h, c, ANSWER.a);
  const x = await st(p);
  await p.click('#goBtn'); await p.click('#ffBtn'); await p.click('#ffBtn');
  await p.waitForFunction(() => __kb.state().done !== 0, null, { timeout: 30000 });
  return x;
}

async function build(env) {
  console.log('1. build a level with the real editor, verify it, share it, open the URL in a new page and clear it');
  const s = await open(env, { seed: DONE });
  const p = s.page;
  let x = await st(p);
  check('the title has 「つくる」', x.title && !!(await p.$('#tMake:visible')), x.overlays);
  await p.click('#tMake');
  x = await st(p);
  check('「つくる」 opens my levels (empty)', x.overlays.includes('ovMine') && /まだ/.test(await p.textContent('#mineList')), x.overlays);
  await shot(p, '1-mine-empty');
  await p.click('#mineNew');
  x = await st(p);
  check('「あたらしく作る」 opens the editor with the floor, a ball and the basket', x.making && x.editor.items.map(i => i.k).join() === 'wall,ball,goal' && x.mine.list.length === 1, x.editor);
  // a board from the palette
  await fromPalette(p, 'board', BOARD.x, BOARD.y);
  x = await st(p);
  const bi = x.editor.items.length - 1;
  check('drag from the palette places a board where it was dropped (selected, tools shown)', x.editor.items.length === 4 && x.editor.sel === bi && x.editor.tools && x.editor.items[bi].x === BOARD.x && x.editor.items[bi].y === BOARD.y, x.editor);
  const h = await p.evaluate(i => __physics.edHandlePoint(i), bi), c = await pt(p, BOARD.x, BOARD.y);
  await turnTo(p, h, c, BOARD.a);
  x = await st(p);
  check('the round handle tilts it (snapped to 15°)', x.editor.items[bi].a === BOARD.a, x.editor.items[bi]);
  await p.click('#mWp');
  x = await st(p);
  check('↔+ makes it longer', x.editor.items[bi].w === BOARD.w, x.editor.items[bi]);
  await shot(p, '1-editor-board');
  // a gear: tap to place, then drag it
  await p.click('#mtray .tp[data-piece="gear"]');
  x = await st(p);
  const gi = x.editor.items.length - 1;
  check('a tap on the palette places a gear in the middle', x.editor.items[gi].k === 'gear' && x.editor.items[gi].x === 6 && x.editor.items[gi].y === 6.5, x.editor.items[gi]);
  await dragPath(p, await p.evaluate(i => __physics.itemPoint(i), gi), await pt(p, GEAR.x, GEAR.y));
  x = await st(p);
  check('dragging a piece moves it', x.editor.items[gi].x === GEAR.x && x.editor.items[gi].y === GEAR.y, x.editor.items[gi]);
  // the ball: change its type, undo
  const ball = await p.evaluate(() => __physics.itemPoint(__physics.find('ball')));
  await p.mouse.click(ball.x, ball.y);
  x = await st(p);
  check('a tap selects the ball (no 🗑 for the only ball, a type button)', x.editor.items[x.editor.sel].k === 'ball' && await p.isHidden('#mDel') && await p.isVisible('#mKind'), x.editor);
  await p.click('#mKind');
  x = await st(p);
  check('the type button makes it a bell ball', x.editor.items[x.editor.sel].b === 1, x.editor);
  await p.click('#mUndo');
  x = await st(p);
  check('undo → a yarn ball again', x.editor.items.find(i => i.k === 'ball').b === 0, x.editor.items);
  // a crate in, 🗑, undo, undo
  await p.click('#mtray .tp[data-piece="crate"]');
  x = await st(p); const n0 = x.editor.items.length;
  await p.click('#mDel');
  x = await st(p);
  check('🗑 removes the selected piece', x.editor.items.length === n0 - 1 && !x.editor.items.some(i => i.k === 'crate'), x.editor.items.length);
  await p.click('#mUndo'); x = await st(p);
  check('undo brings it back', x.editor.items.some(i => i.k === 'crate'), x.editor.items.length);
  await p.click('#mUndo'); x = await st(p);
  check('undo again: as before the crate', x.editor.items.length === 5 && !x.editor.items.some(i => i.k === 'crate'), x.editor.items.map(i => i.k));
  // the goal cannot be removed
  const goal = await p.evaluate(() => __physics.itemPoint(__physics.find('goal')));
  await p.mouse.click(goal.x, goal.y + 2);
  check('the basket has no 🗑', (await st(p)).editor.items[(await st(p)).editor.sel].k === 'goal' && await p.isHidden('#mDel'));
  // the settings: one plank, target 1, a name
  await p.click('#mSet');
  check('⚙ opens the level settings', (await st(p)).overlays.includes('ovMakeSet'));
  await p.fill('#msTitle', 'Ramp test');
  await p.click('.msRow[data-part="plank"] .msBtn[data-d="-1"]');
  await p.click('.msRow[data-part="spring"] .msBtn[data-d="1"]');
  await p.click('.msRow[data-part="spring"] .msBtn[data-d="-1"]');
  await shot(p, '1-settings');
  await p.click('#msOk');
  x = await st(p);
  check('settings: plank ×1, target 1, the name', JSON.stringify(x.editor.parts) === '{"plank":1}' && x.editor.par === 1 && x.editor.title === 'Ramp test', x.editor);
  await p.waitForTimeout(400);
  const stored = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), MINE);
  check('the level is saved in my levels as it is edited', stored && stored.list.length === 1 && stored.list[0].def.title === 'Ramp test' && stored.list[0].def.items.length === 5, stored);
  // test-play
  await p.click('#mTest');
  x = await st(p);
  check('「ためす」 plays it with the game\'s tray (one plank)', x.mode === 'edit' && x.custom && x.custom.kind === 'test' && !!(await p.$('#tray .tp[data-part="plank"]')) && (await p.$$('#tray .tp')).length === 1, x);
  await shot(p, '1-test');
  const placed = await solve(p);
  check('the answer was placed by drag and handle', JSON.stringify(placed.parts) === JSON.stringify([ANSWER]), placed.parts);
  x = await st(p);
  check('it clears', x.won, x);
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  x = await st(p);
  check('result: verified, 3 stars, 「共有する」', /確認/.test(await p.textContent('#rTitle')) && x.last && (await p.$$('#rStars i.on')).length === 3 && /共有/.test(await p.textContent('#rNext')), await p.textContent('#rTitle'));
  check('my level is verified, the proof kept, stats.made = 1', x.mine.list[0].proof.length === 1 && x.mine.list[0].vf && x.save.stats.made === 1, { m: x.mine.list[0], s: x.save.stats });
  check('no stage record or stars for a made level', x.save.stars === 0 && Object.keys(x.save.lv).length === 0, x.save);
  await shot(p, '1-verified');
  await p.click('#rNext');
  await p.waitForFunction(() => __kb.state().share && __kb.state().share.code, null, { timeout: 5000 });
  x = await st(p);
  check('share: the code and the URL', x.overlays.includes('ovShare') && x.share.code.length > 40 && x.share.url.includes('/physics/?code=' + x.share.code) && (await p.inputValue('#shCode')) === x.share.code, x.share);
  check('the creator name comes from the nickname, cleaned (no < >)', (await p.inputValue('#shNick')) === 'ねこb好き', await p.inputValue('#shNick'));
  await p.fill('#shNick', 'Kobo Cat');
  await p.waitForFunction(() => __kb.state().share && __kb.state().share.nick === 'Kobo Cat', null, { timeout: 3000 });
  check(`the code is compact (${(await st(p)).share.code.length} characters)`, (await st(p)).share.code.length < 400);
  await p.click('#shCopy');
  await p.waitForTimeout(200);
  x = await st(p);
  check('copying the code counts as sharing (stats.shared = 1)', x.save.stats.shared === 1 && x.mine.list[0].sh === 1, x.save.stats);
  const ach = await p.evaluate(() => window.KoboAchievements ? KoboAchievements.unlocked() : null);
  if (ach) check('achievements: made a level, shared a level', ach['physics.make1'] > 0 && ach['physics.share1'] > 0, Object.keys(ach));
  await shot(p, '1-share');
  const share = x.share;
  const dec = C.decode(share.code);
  check('node decodes the page\'s code: same level, verified by replaying the proof', dec.nick === 'Kobo Cat' && dec.def.title === 'Ramp test' && C.verify(dec.def, dec.proof).ok, dec);
  check('no page errors (creator)', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();

  // a stranger opens the URL
  const u = new URL(share.url);
  const s2 = await open(env, { seed: {}, url: u.pathname + u.search + '&debug' });
  const q = s2.page;
  x = await st(q);
  check('the URL opens the level card: title, creator, verified', x.code && x.code.ok && x.code.verified && x.code.title === 'Ramp test' && /Kobo Cat/.test(x.code.by) && /確かめた/.test(x.code.badge), x.code);
  check('the creator name is text, not HTML', (await q.$eval('#ccBy', e => e.children.length)) === 0);
  await shot(q, '1-card');
  await q.click('#ccPlay');
  x = await st(q);
  check('「あそぶ」 plays it', x.mode === 'edit' && x.custom && x.custom.kind === 'play' && x.custom.verified, x.custom);
  await solve(q);
  x = await st(q);
  check('the stranger clears it with the same answer', x.won, x);
  await q.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  await shot(q, '1-stranger-clear');
  check('no page errors (stranger)', s2.log.pageErrors.length === 0, s2.log.pageErrors.slice(0, 3));
  await s2.close();
}

async function codes(env) {
  console.log('2. bad codes: tampered, too big, garbage, empty, HTML in the names');
  const def = C.normalize({ title: '<img src=x onerror=alert(1)>', items: [{ k: 'wall', x: 6, y: 0.2, w: 12, h: 0.4, a: 0 }, { k: 'ball', x: 1.5, y: 10.5 }, { k: 'goal', x: 10.5, y: 0.4 }, Object.assign({ k: 'wall', h: 0.24 }, BOARD), Object.assign({ k: 'gear' }, GEAR)], parts: { plank: 1 }, par: 1 });
  const good = C.encodeSync(def, [ANSWER], '<b>x</b>');
  const mid = Math.floor(good.length / 2), flip = good.slice(0, mid) + (good[mid] === 'A' ? 'B' : 'A') + good.slice(mid + 1);
  const cases = [['tampered', flip, /壊れ/], ['too big', 'A'.repeat(5000), /大きすぎ/], ['garbage', '%%%<script>', /形|壊れ/], ['empty', '', /空/]];
  const s = await open(env, { seed: SEEN, url: '/physics/?code=' + encodeURIComponent(good) + '&debug' });
  const p = s.page;
  let x = await st(p);
  check('HTML in the title and the name is shown as text', x.code && x.code.ok && x.code.title === def.title && /^img src=x/.test(def.title) && /bx\/b/.test(x.code.by) && (await p.$$('#ovCode img')).length === 0, x.code);
  for (const [name, code, re] of cases) {
    await p.evaluate(c => __physics.openCode(c), code);
    x = await st(p);
    check(`${name} code: "can't read", no Play button`, x.code && !x.code.ok && re.test(x.code.by) && await p.isHidden('#ccPlay'), x.code);
  }
  await shot(p, '2-bad-code');
  // pasting into my levels: a whole URL works
  await p.evaluate(() => __physics.mine());
  await p.fill('#codeIn', 'https://example.com/physics/?code=' + good);
  await p.click('#codeGo');
  x = await st(p);
  check('a pasted URL opens the card', x.code && x.code.ok && x.code.verified, x.code);
  // a proof that does not clear: the card says it could not be verified
  const bad = C.encodeSync(def, [{ t: 'plank', x: 10, y: 10, a: 0 }], 'x');
  await p.evaluate(c => __physics.openCode(c), bad);
  x = await st(p);
  check('a proof that misses: playable, but "could not verify"', x.code && x.code.ok && !x.code.verified && /⚠/.test(x.code.badge), x.code);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function mine(env) {
  console.log('3. my levels: duplicate, delete, edit, edits drop the verification, reload, 30 at most');
  const def = C.normalize({ title: 'Mine', items: [{ k: 'wall', x: 6, y: 0.2, w: 12, h: 0.4, a: 0 }, { k: 'ball', x: 1.5, y: 10.5 }, { k: 'goal', x: 10.5, y: 0.4 }, Object.assign({ k: 'wall', h: 0.24 }, BOARD), Object.assign({ k: 'gear' }, GEAR)], parts: { plank: 1 }, par: 1 });
  const entry = { id: 'abc123', at: 1, def, proof: [ANSWER], vf: C.fingerprint(def), tp: [], sh: 0 };
  const s = await open(env, { seed: Object.assign({}, DONE, { [MINE]: JSON.stringify({ v: 1, nick: 'me', list: [entry, { id: 'junk', def: { items: [] } }, 'x'] }) }) });
  const p = s.page;
  await p.click('#tMake');
  let x = await st(p);
  check('a saved level is listed (broken entries dropped), verified, share enabled', x.mine.list.length === 1 && (await p.$$('.mi')).length === 1 && !(await p.$eval('.mi button[data-act="share"]', b => b.disabled)), x.mine);
  await p.click('.mi button[data-act="dup"]');
  x = await st(p);
  check('duplicate: a copy right after it, still verified', x.mine.list.length === 2 && /Mine/.test(x.mine.list[1].def.title) && x.mine.list[1].id !== 'abc123' && !(await p.$eval('.mi:nth-child(2) button[data-act="share"]', b => b.disabled)), x.mine.list.map(e => e.def.title));
  await p.click('.mi:nth-child(2) button[data-act="del"]');
  await p.click('.kb-layer:not([hidden]) .kb-btn--danger');
  await p.waitForTimeout(200);
  x = await st(p);
  check('delete (after the confirm)', x.mine.list.length === 1 && x.mine.list[0].id === 'abc123', x.mine.list.map(e => e.id));
  await p.click('.mi button[data-act="edit"]');
  x = await st(p);
  check('edit opens the editor with the same pieces', x.making && x.editor.items.length === 5 && x.editor.title === 'Mine', x.editor);
  const gi = x.editor.items.findIndex(i => i.k === 'gear');
  await dragPath(p, await p.evaluate(i => __physics.itemPoint(i), gi), await pt(p, 3, 3));
  await p.click('header .back');
  x = await st(p);
  check('changing it drops the verification (share disabled until cleared again)', x.overlays.includes('ovMine') && (await p.$eval('.mi button[data-act="share"]', b => b.disabled)) && /まだ/.test(await p.textContent('.mi small')), x.mine.list[0]);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  x = await st(p);
  check('after a reload my levels are still there', x.mine.list.length === 1 && x.mine.list[0].def.items.some(i => i.k === 'gear' && i.x === 3), x.mine.list);
  // 30 at most
  const many = Array.from({ length: 34 }, (_, i) => Object.assign({}, entry, { id: 'e' + i }));
  await p.evaluate(([k, v]) => localStorage.setItem(k, v), [MINE, JSON.stringify({ v: 1, list: many })]);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  await p.click('#tMake');
  x = await st(p);
  check('at most 30 levels: the list is cut and 「あたらしく作る」 is off', x.mine.list.length === 30 && await p.isDisabled('#mineNew'), x.mine.list.length);
  await shot(p, '3-mine');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function layouts(env) {
  console.log('4. every screen size × ja/en: the editor\'s tools, palette and buttons on screen and ≥44 px');
  for (const vp of Object.keys(V.VIEWPORTS)) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, seed: DONE });
    const p = s.page;
    await p.click('#tMake'); await p.click('#mineNew');
    await p.click('#mtray .tp[data-piece="glass"]');
    const box = () => p.evaluate(() => {
      const b = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
      const els = [...document.querySelectorAll('#mctrl button, header .icon, header .back, #mtools:not([hidden]) button:not([hidden])')].filter(e => e.getClientRects().length).map(e => [e.id || e.className, b(e)]);
      const tray = [...document.querySelectorAll('#mtray .tp')].map(e => b(e)), tb = b(document.getElementById('mtray'));
      return { els, tray, tb, cv: b(document.getElementById('board')), W: innerWidth, H: innerHeight };
    });
    const bad = m => m.els.filter(([id, b]) => b.x < -1 || b.y < -1 || b.x + b.w > m.W + 1 || b.y + b.h > m.H + 1 || b.w < 44 || b.h < 44).map(([id, b]) => id + ' ' + JSON.stringify(b));
    let worst = bad(await box());
    // a board near each corner: its tools stay on the board
    for (const [x, y] of [[1, 11.5], [11, 0.8]]) { await fromPalette(p, 'board', x, y); await p.waitForTimeout(100); worst = worst.concat(bad(await box())); }
    const m = await box();
    const trayOk = m.tray.every(t => t.w >= 44 && t.h >= 44) && m.tb.y + m.tb.h <= m.H + 1 && m.tb.x >= -1;
    const r = await p.evaluate(`(${layoutProbe})()`);
    check(`${vp} ${lang}: editor tools, palette and buttons on screen and ≥44 px`, !worst.length && trayOk && r.hscroll <= 1, { worst: worst.slice(0, 4), trayOk, h: r.hscroll });
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${vp} en: no Japanese in the editor`, jp.length === 0, jp.slice(0, 4)); }
    await shot(p, `4-${vp}-${lang}`);
    // the settings and my levels: the main button is visible
    await p.click('#mSet');
    await p.waitForTimeout(450); // after the card's rise animation
    const okBtn = await p.evaluate(() => { const r = document.getElementById('msOk').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.height >= 44; });
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${vp} en: no Japanese in the settings`, jp.length === 0, jp.slice(0, 4)); }
    if (vp === 'se1' || vp === 'land') await shot(p, `4-${vp}-${lang}-settings`);
    await p.click('#msOk');
    await p.click('header #menuBtn');
    await p.click('.kb-layer:not([hidden]) button:has-text("' + (lang === 'en' ? 'Create' : 'つくる') + '")');
    await p.waitForTimeout(450);
    const mineBtns = await p.evaluate(() => ['mineNew', 'mineBack'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.height >= 44; }));
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${vp} en: no Japanese in my levels`, jp.length === 0, jp.slice(0, 4)); }
    check(`${vp} ${lang}: settings OK and my levels buttons visible`, okBtn && mineBtns.every(Boolean), { okBtn, mineBtns });
    if (vp === 'se1' || vp === 'land') await shot(p, `4-${vp}-${lang}-mine`);
    check(`${vp} ${lang}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

async function touch(env) {
  console.log('5. touch: a piece dragged from the palette with a finger, two fingers turn it');
  const s = await open(env, { seed: DONE, touch: true });
  const p = s.page;
  await p.tap('#tMake'); await p.tap('#mineNew');
  const a = await p.evaluate(() => __physics.palettePoint('board')), b = await pt(p, 6, 6);
  const cdp = await p.context().newCDPSession(p);
  const tch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await tch('touchStart', [{ x: a.x, y: a.y, id: 1 }]);
  for (let k = 1; k <= 10; k++) await tch('touchMove', [{ x: a.x + (b.x - a.x) * k / 10, y: a.y + (b.y - a.y) * k / 10, id: 1 }]);
  await tch('touchEnd', []);
  let x = await st(p);
  const i = x.editor.items.length - 1;
  check('a finger drags a board from the palette (it floats above the finger)', x.editor.items.length === 4 && x.editor.items[i].x === 6 && x.editor.items[i].y > 6, x.editor.items[i]);
  const c = await p.evaluate(i => __physics.itemPoint(i), i), R = 50, ang = d => d * Math.PI / 180;
  const tp = (d, id) => ({ x: c.x + Math.cos(ang(d)) * R * (id ? 1 : -1), y: c.y + Math.sin(ang(d)) * R * (id ? 1 : -1), id });
  await tch('touchStart', [tp(0, 0)]);
  await tch('touchStart', [tp(0, 0), tp(0, 1)]);
  for (let d = 0; d >= -45; d -= 5) await tch('touchMove', [tp(d, 0), tp(d, 1)]);
  await tch('touchEnd', []);
  await p.waitForTimeout(100);
  x = await st(p);
  check('two fingers turn it by 45°', x.editor.items[i].a === 45, x.editor.items[i]);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [build, codes, mine, touch, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
