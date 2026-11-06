#!/usr/bin/env node
// ホームのカード用のサムネイルを作る（360×240 と 720×480 の webp）。
//   node tools/tests/shots.js                 … tools/tests/out/thumbs/ に書く（試し撮り。リポジトリは変えない）
//   node tools/tests/shots.js --write         … img/thumbs/ に書く（P1-7 などで、公開するものを作るとき）
//   node tools/tests/shots.js --game hole     … 1本だけ（カンマで複数）
//   node tools/tests/shots.js --out <dir>     … 書く場所を指定
// 画面は 480×320（DPR 1.5 → 720×480）で開き、RECIPES の操作で遊んでいる画面にしてから撮る。
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const browserLib = require('./lib/browser');
const pagesLib = require('./lib/pages');

// ゲームごとの「代表的な画面」にする操作（クリックする要素）。ないものは最初の画面のまま撮る
const RECIPES = {
  neji: ['#helpClose'],
  drop: ['#ovStart'],
  raft: ['#ovGo'],
  // { query, eval }: open the page with this query and run this (the ?debug hook draws a busy grill without the UI chrome)
  hitsumabushi: [{ query: '?debug', eval: 'window.__hitsu && __hitsu.thumbScene()' }],
  planet: [{ query: '?debug', eval: 'window.__planet && __planet.thumbScene()' }],
  hitblow: [{ query: '?debug', eval: 'window.__hitblow && __hitblow.thumbScene()' }],
  shogi: [{ query: '?debug', eval: 'window.__shogi && __shogi.thumbScene()' }],
};
const VP = { name: 'thumb', width: 480, height: 320, dpr: 1.5, safe: {} };

function args(argv) {
  const o = { write: false, game: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') o.write = true;
    else if (a === '--game' || a === '-g') o.game = argv[++i];
    else if (a === '--out') o.out = path.resolve(argv[++i]);
    else throw new Error('unknown argument: ' + a);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  const out = o.out || (o.write ? path.join(server.ROOT, 'img', 'thumbs') : path.join(__dirname, 'out', 'thumbs'));
  fs.mkdirSync(out, { recursive: true });
  browserLib.ensureCdn();
  const srv = await server.start();
  const browser = await browserLib.launch();
  const env = { server: srv, browser: () => browser, out };
  const list = pagesLib.filter(pagesLib.games(), o.game);
  let bad = 0;
  for (const g of list) {
    const s = await browserLib.newSession(env, { vp: VP, lang: 'ja', isMobile: false, hasTouch: false, seed: { 'kusoge.raft.seen3': '1', 'nejihodoki3d.seenHelp': true, 'kusoge.hitsumabushi.howto': '1', 'kusoge.planet.howto': '1', 'kusoge.hitblow.howto': '1', 'kusoge.shogi.howto': '1' } });
    try {
      const steps = RECIPES[g.id] || [];
      const q = steps.find(x => x && typeof x === 'object' && x.query);
      await s.goto(g.path + (q ? q.query : ''));
      for (const sel of steps) {
        if (sel && typeof sel === 'object') { if (sel.eval) { await s.page.evaluate(sel.eval); await browserLib.settle(s.page); } continue; }
        const el = s.page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) { await el.click({ timeout: 3000 }).catch(() => {}); await browserLib.settle(s.page); }
      }
      if (g.three) await s.page.waitForFunction(() => window.__kbt && window.__kbt.draws > 0, null, { timeout: 8000 }).catch(() => {});
      await browserLib.frames(s.page, 10);
      const png = await s.page.screenshot({ type: 'png' });
      // webp への変換はブラウザの canvas で行う（npm のパッケージを足さない）
      const conv = await browser.newPage();
      const webp = await conv.evaluate(async b64 => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const enc = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, w, h); return c.toDataURL('image/webp', 0.82).split(',')[1]; };
        return { big: enc(720, 480), small: enc(360, 240) };
      }, png.toString('base64'));
      await conv.close();
      fs.writeFileSync(path.join(out, g.id + '.webp'), Buffer.from(webp.small, 'base64'));
      fs.writeFileSync(path.join(out, g.id + '@2x.webp'), Buffer.from(webp.big, 'base64'));
      const errs = s.log.pageErrors.length ? '  (page errors: ' + s.log.pageErrors.length + ')' : '';
      console.log(`ok   ${g.id.padEnd(8)} → ${path.relative(process.cwd(), path.join(out, g.id + '.webp'))}, ${g.id}@2x.webp${errs}`);
    } catch (e) { bad++; console.log(`FAIL ${g.id}: ${e.message.split('\n')[0]}`); }
    finally { await s.close(); }
  }
  await browser.close(); await srv.close();
  console.log(o.write ? `wrote into ${out}` : `wrote into ${out} (use --write to write into img/thumbs/)`);
  return bad ? 1 : 0;
}
main().then(c => process.exit(c), e => { console.error(e); process.exit(2); });
