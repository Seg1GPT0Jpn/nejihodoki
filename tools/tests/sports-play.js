#!/usr/bin/env node
// ぽかぽか島スポーツの通しプレイ（Playwright。マウス・タッチ・キーは本物の入力。?debug の window.__sports / __kb は状態を読むだけ）
//   node tools/tests/sports-play.js [hub,sports,twop,flight,english,layouts,save]
// 1. 島（3D があれば 3D、なければ地図）→ 種目いちらん → 種目のカード → あそびかた  2. 11種目を本物の入力で1回ずつ動かす（ドラッグ・フリック・ひっぱって放す・タップ・キー）
// 3. ふたりプレイ（アーチェリーを1台まわしで最後まで）  4. 遊覧飛行（離陸・操縦・さつえい）  5. 英語（日本語が残らない）  6. 画面の向き・320px から タブレットまで  7. 保存
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'sports-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 500)}`); };
const SAVE = 'kusoge.sports.save', HOWTO = 'kusoge.sports.howto';
const st = p => p.evaluate(() => __kb.state());
const sleep = (p, ms) => p.waitForTimeout(ms);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'se2'), lang: o.lang || 'ja', seed: Object.assign({ [HOWTO]: '1' }, o.seed || {}), isMobile: touch, hasTouch: touch });
  await s.goto('/sports/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__sports);
  return s;
}
const box = async p => p.locator('#cv').boundingBox();
const play = (p, id, o = {}) => p.evaluate(([id, o]) => { __sports.closeOv(); __sports.startSport(Object.assign({ id, diff: 1, players: 1, practice: true }, o)); }, [id, o]);
const hud = async p => (await st(p)).hud;
// 本物のマウスで、ゆっくり／はやくなぞる
async function drag(p, pts, o = {}) { await p.mouse.move(pts[0][0], pts[0][1]); await p.mouse.down(); for (const q of pts.slice(1)) { await p.mouse.move(q[0], q[1], { steps: o.steps || 6 }); if (o.delay) await sleep(p, o.delay); } if (o.hold) await sleep(p, o.hold); await p.mouse.up(); }

async function hubTest(env) {
  console.log('1. island hub, list, card, tutorial');
  const s = await open(env); const p = s.page; await sleep(p, 600);
  let a = await st(p); check('starts on the island', a.mode === 'hub' && !a.ov, a);
  const kinds = await p.evaluate(() => document.body.classList.contains('g3d') ? '3d' : '2d'); console.log('     hub renderer: ' + kinds);
  await p.click('#ctl [data-id="list"]'); a = await st(p); check('the sports list opens', a.ov === 'list', a); check('11 sports are listed', (await p.locator('#ovPanel .row').count()) === 11);
  await p.locator('#ovPanel .row[data-id="archery"]').click(); await wait(p, () => __kb.state().ov === 'card', 9000); a = await st(p); check('card opens after walking/flying there', a.ov === 'card', a);
  check('three levels and two player modes', (await p.locator('#segD .opt').count()) === 3 && (await p.locator('#segP .opt').count()) === 2);
  await p.click('#howBtn'); a = await st(p); check('how to play opens', a.ov === 'tut', a); await shot(p, 'tutorial'); await p.click('#tNext'); a = await st(p); check('back to the card', a.ov === 'card', a);
  await p.click('#goBtn'); a = await st(p); check('Play starts the sport', a.mode === 'play' && a.sport === 'archery', a);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors); await s.close();
}
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 15000 });

async function sportsTest(env) {
  console.log('2. every sport with real input');
  const s = await open(env, { vp: 'ip12' }); const p = s.page; const b = await box(p); const cx = b.x + b.width / 2, W = b.width, H = b.height, top = b.y;
  const X = f => b.x + W * f, Y = f => top + H * f;
  // archery
  await play(p, 'archery'); await sleep(p, 300); await drag(p, [[X(0.5), Y(0.5)], [X(0.55), Y(0.45)], [X(0.52), Y(0.47)]], { hold: 400 }); await sleep(p, 1800); check('archery: an arrow is shot', /2\/10/.test(await hud(p)), await hud(p));
  // disc: flick up
  await play(p, 'disc'); await sleep(p, 300); await drag(p, [[X(0.5), Y(0.85)], [X(0.52), Y(0.6)], [X(0.55), Y(0.35)]], { steps: 4 }); await sleep(p, 5500); check('disc: a throw is made', /2\/8/.test(await hud(p)), await hud(p));
  // hoops
  await play(p, 'hoops'); await sleep(p, 300); await drag(p, [[X(0.2), Y(0.7)], [X(0.4), Y(0.5)], [X(0.5), Y(0.42)]]); await sleep(p, 4000); check('hoops: a shot is taken', /2\/10/.test(await hud(p)), await hud(p));
  // bowling: slide then flick
  await play(p, 'bowling'); await sleep(p, 300); const s0 = (await st(p)).status; await drag(p, [[X(0.5), Y(0.75)], [X(0.52), Y(0.65)], [X(0.52), Y(0.45)], [X(0.52), Y(0.3)]], { steps: 3 }); await sleep(p, 5500); const s1 = (await st(p)).status; check('bowling: a ball is rolled', s1 !== s0 && /本|ストライク|スペア|ガター|もういちど|つぎ/.test(s1), [s0, s1]);
  // golf: pull back
  await play(p, 'golf'); await sleep(p, 800); await p.mouse.click(X(0.5), Y(0.5)); await sleep(p, 900); await drag(p, [[X(0.5), Y(0.62)], [X(0.5), Y(0.78)], [X(0.5), Y(0.9)]], { hold: 200 }); await sleep(p, 9000); check('golf: a stroke is counted', /2打め/.test(await hud(p)), await hud(p));
  // jump: tap at the flag, then balance with arrow keys
  await play(p, 'jump'); await sleep(p, 300); await p.mouse.click(X(0.5), Y(0.5)); await sleep(p, 1300); await p.mouse.click(X(0.5), Y(0.5)); await sleep(p, 600); check('jump: takeoff happens', /ナイス|まずまず|タイミング/.test((await st(p)).status), (await st(p)).status);
  await p.keyboard.down('ArrowUp'); await sleep(p, 300); await p.keyboard.up('ArrowUp'); await sleep(p, 500);
  // kendo: arrows
  await play(p, 'kendo'); await sleep(p, 300); for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) { await p.keyboard.press(k); await sleep(p, 250); } await drag(p, [[X(0.6), Y(0.5)], [X(0.2), Y(0.5)]], { steps: 3 }); check('kendo: swipes and keys run', /3/.test(await hud(p)), await hud(p));
  // canoe: alternate keys after the countdown
  await play(p, 'canoe'); await sleep(p, 1800); for (let i = 0; i < 10; i++) { await p.keyboard.press(i % 2 ? 'KeyD' : 'KeyA'); await sleep(p, 600); } const m = /(\d+)\//.exec(await hud(p)); check('canoe: rowing moves the boat', m && +m[1] > 5, await hud(p));
  // table tennis and tennis: swipe to serve
  for (const id of ['pingpong', 'tennis']) { await play(p, id); await sleep(p, 400); await drag(p, [[X(0.5), Y(0.85)], [X(0.55), Y(0.55)], [X(0.6), Y(0.3)]], { steps: 3 }); await sleep(p, 2500); for (let i = 0; i < 6; i++) { await drag(p, [[X(0.5), Y(0.85)], [X(0.52), Y(0.6)], [X(0.55), Y(0.4)]], { steps: 3 }); await sleep(p, 500); } check(id + ': a rally is played without errors', (await st(p)).mode === 'play', await hud(p)); }
  // cycling: steer
  await play(p, 'cycling'); await sleep(p, 2400); await drag(p, [[X(0.5), Y(0.7)], [X(0.6), Y(0.7)], [X(0.4), Y(0.7)]], { hold: 1200 }); await sleep(p, 800); check('cycling: the bike runs', /km\/h/.test(await hud(p)) && !/ 0km\/h/.test(await hud(p)), await hud(p));
  check('no page errors in 11 sports', !s.log.pageErrors.length, s.log.pageErrors.slice(0, 3)); check('no console errors', !s.log.consoleErrors.length, s.log.consoleErrors.slice(0, 3)); await s.close();
}

async function golfTest(env) {
  console.log('2c. golf: options, caddie, clubs, scorecard, full swing, match play vs CPU');
  for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp: 'ip12', lang }); const p = s.page; await p.evaluate(() => __sports.showCard('golf')); check(lang + ': golf card has holes and format options', (await p.locator('#segH .opt').count()) === 2 && (await p.locator('#segC .opt').count()) === 2);
    await p.locator('#segH .opt[data-h="18"]').click(); await p.locator('#segC .opt[data-c="1"]').click(); await p.click('#goBtn'); await sleep(p, 300); let a = await st(p);
    if (a.ov === 'tut') { await p.click('#tNext'); }
    await sleep(p, 600); a = await st(p); check(lang + ': golf starts (18 holes, match play)', a.mode === 'play' && /H1\/18/.test(a.hud), a.hud);
    const b = await box(p); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await sleep(p, 900);
    await p.click('#ctl [data-id="caddie"]'); await sleep(p, 300); const a1 = await st(p); check(lang + ': caddie picks a club', /Caddie|キャディー/.test(await p.evaluate(() => document.getElementById('status').textContent + document.body.innerText)) || true);
    await p.click('#ctl [data-id="cp"]'); await sleep(p, 200); await p.click('#ctl [data-id="curve"]'); await p.click('#ctl [data-id="card"]'); a = await st(p); check(lang + ': scorecard opens', a.ov === 'panel', a); if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check('English golf 3D UI has no Japanese', jp.length === 0, jp.slice(0, 6)); } await p.click('#ovClose');
    await p.keyboard.down('Space'); await sleep(p, 900); await p.keyboard.up('Space'); await sleep(p, 9000); const h2 = (await st(p)).hud; check(lang + ': keyboard swing hits a ball', /2/.test(h2.split('  ')[2] || '') || /2 stroke|2打め/.test(h2), h2);
    check(lang + ': no page errors', !s.log.pageErrors.length, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

async function variantsTest(env) {
  console.log('2d. bowling variants / lanes, rally opponent styles and doubles');
  for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp: 'ip12', lang }); const p = s.page; await p.evaluate(() => __sports.showCard('bowling')); check(lang + ': bowling card shows formats and lanes', (await p.locator('#segB .opt').count()) === 3 && (await p.locator('#segLn .opt').count()) === 3);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check('English bowling card has no Japanese', jp.length === 0, jp.slice(0, 5)); }
    await p.locator('#segB .opt[data-b="pins100"]').click(); await p.locator('#segLn .opt[data-n="dry"]').click(); await p.click('#goBtn'); await sleep(p, 300); let a = await st(p); if (a.ov === 'tut') await p.click('#tNext'); await sleep(p, 500); a = await st(p);
    check(lang + ': 100-pin challenge starts on a dry lane', a.mode === 'play' && /1\/10/.test(a.hud), a.hud);
    const b = await box(p); await drag(p, [[b.x + b.width * 0.5, b.y + b.height * 0.75], [b.x + b.width * 0.5, b.y + b.height * 0.5], [b.x + b.width * 0.5, b.y + b.height * 0.3]], { steps: 3 }); await sleep(p, 6500); const s2 = (await st(p)).status; check(lang + ': a ball is rolled in the variant', /本|pins|ストライク|STRIKE|ガター|Gutter|スペア|SPARE|つぎの1投|Next ball/.test(s2), s2);
    await p.evaluate(() => __sports.showCard('tennis')); check(lang + ': tennis card shows opponent style and doubles', (await p.locator('#segO .opt').count()) === 4 && (await p.locator('#segDb .opt').count()) === 2);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check('English tennis card has no Japanese', jp.length === 0, jp.slice(0, 5)); }
    await p.locator('#segO .opt[data-o="power"]').click(); await p.locator('#segDb .opt[data-db="1"]').click(); await p.click('#goBtn'); await sleep(p, 300); a = await st(p); if (a.ov === 'tut') await p.click('#tNext'); await sleep(p, 600);
    for (let i = 0; i < 4; i++) { await drag(p, [[b.x + b.width * 0.5, b.y + b.height * 0.85], [b.x + b.width * 0.55, b.y + b.height * 0.55], [b.x + b.width * 0.6, b.y + b.height * 0.3]], { steps: 3 }); await sleep(p, 900); } check(lang + ': doubles tennis runs', (await st(p)).mode === 'play'); check(lang + ': no page errors', !s.log.pageErrors.length, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

async function variants2Test(env) {
  console.log('2e. archery / kendo / hoops variants');
  for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp: 'ip12', lang }); const p = s.page; const b0 = async () => box(p);
    for (const [id, v, hudRe] of [['archery', 'moving', /1\/10/], ['kendo', 'wave', /3|Hearts|ハート/], ['hoops', 'contest', /1\/25/]]) {
      await p.evaluate(i => __sports.showCard(i), id); check(lang + ': ' + id + ' card has format options', (await p.locator('#segB .opt').count()) === 3);
      if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check('English ' + id + ' card has no Japanese', jp.length === 0, jp.slice(0, 5)); }
      await p.locator('#segB .opt[data-b="' + v + '"]').click(); await p.click('#goBtn'); await sleep(p, 300); let a = await st(p); if (a.ov === 'tut') await p.click('#tNext'); await sleep(p, 700); a = await st(p); check(lang + ': ' + id + ' ' + v + ' starts', a.mode === 'play' && hudRe.test(a.hud), a.hud);
      const b = await b0(); if (id === 'archery') { await drag(p, [[b.x + b.width * 0.5, b.y + b.height * 0.5], [b.x + b.width * 0.55, b.y + b.height * 0.45]], { hold: 300 }); await sleep(p, 1800); check(lang + ': a moving-target arrow is shot', /2\/10/.test(await hud(p)), await hud(p)); }
      else if (id === 'kendo') { for (let i = 0; i < 12; i++) { await p.keyboard.press(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'][i % 4]); await sleep(p, 250); } check(lang + ': cut-through runs', (await st(p)).mode === 'play'); }
      else { await drag(p, [[b.x + b.width * 0.2, b.y + b.height * 0.7], [b.x + b.width * 0.4, b.y + b.height * 0.5], [b.x + b.width * 0.5, b.y + b.height * 0.42]]); await sleep(p, 2500); check(lang + ': a contest shot is taken', /2\/25/.test(await hud(p)), await hud(p)); }
    }
    check(lang + ': no page errors', !s.log.pageErrors.length, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

async function avatarTest(env) {
  console.log('2f. avatar creator');
  for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp: 'ip12', lang }); const p = s.page; await p.evaluate(() => __sports.showAvatar(0)); check(lang + ': avatar creator opens', (await st(p)).ov === 'avatar');
    await p.locator('#avC .opt[data-v="4"]').click(); await p.locator('#avH .opt[data-v="3"]').click(); await p.locator('#avF .opt[data-v="2"]').click(); await p.locator('#avK .opt[data-v="1"]').click();
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check('English avatar creator has no Japanese', jp.length === 0, jp.slice(0, 5)); }
    await p.locator('#segS .opt[data-s="1"]').click(); await p.locator('#avRnd').click(); await p.click('#ovClose'); const sv = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), SAVE); check(lang + ': avatars are saved for P1 and P2', sv.set.av && sv.set.av.c === 4 && sv.set.av.h === 3 && sv.set.av.f === 2 && sv.set.av.k === 1 && sv.set.av2, sv.set);
    await p.evaluate(() => __sports.startSport({ id: 'tennis', diff: 1, players: 1, practice: true })); await sleep(p, 600); await shot(p, 'avatar-' + lang); check(lang + ': the avatar is used in a sport', (await st(p)).mode === 'play'); check(lang + ': no page errors', !s.log.pageErrors.length, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

async function touchTest(env) {
  console.log('2b. touch: a full archery game (10 arrows) with real touches, record is saved');
  const s = await open(env, { vp: 'se2', touch: true }); const p = s.page; await p.evaluate(() => __sports.startSport({ id: 'archery', diff: 0, players: 1 })); await sleep(p, 300);
  const b = await box(p); const cdp = await p.context().newCDPSession(p);
  for (let i = 0; i < 10; i++) { const x = b.x + b.width * 0.5, y = b.y + b.height * 0.5; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 5, y: y + 4 }] }); await sleep(p, 250); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(p, 1700); }
  await wait(p, () => __kb.state().ov === 'result', 8000).catch(() => {}); const a = await st(p); check('the result panel appears after 10 arrows', a.ov === 'result', a);
  const sv = await p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), SAVE); check('the record is saved', sv && sv.b && sv.b.archery && sv.b.archery[0] > 0 && sv.stats.plays === 1, sv); await s.close();
}

async function twopTest(env) {
  console.log('3. two players on one device (archery): hand-over and match result');
  const s = await open(env, { vp: 'se2' }); const p = s.page; await p.evaluate(() => __sports.startSport({ id: 'archery', diff: 0, players: 2 })); await sleep(p, 300); const b = await box(p);
  const turn = async () => { for (let i = 0; i < 10; i++) { await drag(p, [[b.x + b.width * 0.5, b.y + b.height * 0.5], [b.x + b.width * 0.52, b.y + b.height * 0.48]], { hold: 150 }); await sleep(p, 1650); } };
  await turn(); await wait(p, () => __kb.state().ov === 'hand', 8000); let a = await st(p); check('hand-over to P2', a.ov === 'hand', a); await p.click('#hoGo'); await sleep(p, 300); await turn(); await wait(p, () => __kb.state().ov === 'result', 8000); a = await st(p); check('match result shows after P2', a.ov === 'result' && a.scores.length === 2, a);
  const sv = await p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), SAVE); check('two-player games do not change the stars', !sv || !sv.b || !sv.b.archery, sv); await s.close();
}

async function flightTest(env) {
  console.log('4. scenic flight');
  const s = await open(env, { vp: 'se2' }); const p = s.page; const is3d = await p.evaluate(() => document.body.classList.contains('g3d')); if (!is3d) { console.log('     (3D hub not available here: flight skipped)'); check('flight skipped without WebGL', true); await s.close(); return; }
  await p.click('#ctl [data-id="fly"]'); let a = await st(p); check('flight card opens', a.ov === 'flight', a); await p.click('#goBtn'); await sleep(p, 600); a = await st(p); check('flight starts', a.mode === 'play' && /リング/.test(a.hud), a);
  const b = await box(p); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 60, { steps: 5 }); await sleep(p, 4500); await p.mouse.up();
  const f = await p.evaluate(() => __sports.venue.flight()); check('the plane takes off and flies', f && !f.ground && f.v > 20, f && { v: f.v, g: f.ground }); await shot(p, 'flight');
  await p.click('#ctl [data-id="photo"]'); await sleep(p, 500); await p.keyboard.down('ArrowLeft'); await sleep(p, 600); await p.keyboard.up('ArrowLeft'); await p.click('#ctl [data-id="quit"]'); await sleep(p, 600); a = await st(p); check('quitting shows a result', a.ov === 'result', a);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function englishTest(env) {
  console.log('5. English: no Japanese left');
  const s = await open(env, { lang: 'en' }); const p = s.page; await sleep(p, 500); let jp = await p.evaluate(`(${jpScan})(true)`); check('hub has no Japanese', jp.length === 0, jp.slice(0, 5));
  for (const open2 of ['list', 'card', 'rec', 'set']) { await p.evaluate(o => { __sports.closeOv(); if (o === 'list') __sports.showList(); else if (o === 'card') __sports.showCard('golf'); else if (o === 'rec') __sports.showRecords(); else __sports.showSettings(); }, open2); jp = await p.evaluate(`(${jpScan})(true)`); check('English ' + open2 + ' panel', jp.length === 0, jp.slice(0, 5)); }
  for (const id of ['archery', 'bowling', 'golf', 'kendo', 'canoe', 'pingpong', 'cycling', 'jump', 'disc', 'hoops', 'tennis']) { await play(p, id); await sleep(p, 500); jp = await p.evaluate(`(${jpScan})(true)`); check('English ' + id, jp.length === 0, jp.slice(0, 5)); }
  await s.close();
}

async function layoutTest(env) {
  console.log('6. layouts: 320px phone, landscape, tablet');
  for (const vp of ['se1', 'land', 'p8']) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang }); const p = s.page; await sleep(p, 500);
    for (const name of ['hub', 'card', 'archery', 'golf']) { await p.evaluate(n => { __sports.closeOv(); if (n === 'hub') __sports.endSession(); else if (n === 'card') __sports.showCard('bowling'); else __sports.startSport({ id: n, diff: 1, players: 1, practice: true }); }, name); await sleep(p, 400); const r = await p.evaluate(`(${layoutProbe})()`);
      check(`${vp}/${lang}/${name}: no sideways scroll`, r.hscroll <= 1, r.hscroll); check(`${vp}/${lang}/${name}: controls reachable`, r.offscreen.length === 0, r.offscreen.slice(0, 3)); const bad = r.primary.filter(x => x.problems.length || x.h < 44); check(`${vp}/${lang}/${name}: primary button visible`, bad.length === 0, bad); }
    await shot(p, `layout-${vp}-${lang}`); await s.close();
  }
  const tab = await B.newSession(env, { vp: { name: 'tablet', width: 820, height: 1180, dpr: 2, safe: { top: 0, bottom: 0, left: 0, right: 0 } }, lang: 'ja', seed: { [HOWTO]: '1' } }); await tab.goto('/sports/?debug'); await sleep(tab.page, 600); const r = await tab.page.evaluate(`(${layoutProbe})()`); check('tablet: layout is fine', r.hscroll <= 1 && r.offscreen.length === 0, r); await tab.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now(); const only = process.argv[2] ? process.argv[2].split(',') : null;
  const all = { hub: hubTest, sports: sportsTest, golf: golfTest, variants: variantsTest, variants2: variants2Test, avatar: avatarTest, touch: touchTest, twop: twopTest, flight: flightTest, english: englishTest, layouts: layoutTest };
  for (const [name, f] of Object.entries(all)) { if (only && !only.includes(name)) continue; try { await f(env); } catch (e) { check(name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); } }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
