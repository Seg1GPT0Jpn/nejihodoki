// 囲碁工房：CPU の呼び出し口。Web Worker があれば裏で考え、なければ（または失敗したら）メインスレッドで少しずつ考える。
//   const cpu = IgoCPU.create({ workerUrl: 'worker.js' });  cpu.kind → 'worker' | 'main'
//   cpu.choose(st, level, opts) → Promise<{cell, rate, why, iters}>     cpu.dead(st, opts) → Promise<{dead, own, sims}>
//   cpu.cancel()  いまの計算の返事を捨てる（もどす・やめる）
(function (root) {
  'use strict';
  const AI = () => root.IgoAI || (typeof require === 'function' ? require('./ai.js') : null);
  function create(o) {
    o = o || {}; let w = null, seq = 0; const waits = new Map(); let failed = false;
    const self = { kind: 'main', busy: false, cancel() { for (const [id, f] of waits) f.cancelled = true; seq++; self.busy = false; }, terminate() { if (w) { try { w.terminate(); } catch (e) {} w = null; } } };
    function boot() {
      if (w || failed || o.noWorker || typeof Worker === 'undefined') return;
      try {
        w = new Worker(o.workerUrl || 'worker.js');
        w.onmessage = e => { const m = e.data || {}, f = waits.get(m.id); if (!f) return; waits.delete(m.id); if (f.cancelled) return; if (m.error) f.fallback(); else f.resolve(m.res); };
        w.onerror = () => { failed = true; self.kind = 'main'; try { w.terminate(); } catch (e) {} w = null; for (const [, f] of waits) f.fallback(); waits.clear(); };
        self.kind = 'worker';
      } catch (e) { failed = true; w = null; self.kind = 'main'; }
    }
    function ask(cmd, st, level, opts, fb) {
      boot();
      return new Promise(resolve => {
        const id = ++seq; self.busy = true;
        const done = v => { self.busy = false; resolve(v); };
        const f = { resolve: done, cancelled: false, fallback: () => { if (f.cancelled) return; fb().then(done); } };
        if (!w) { fb().then(v => { if (!f.cancelled) done(v); }); waits.set(id, f); return; }
        waits.set(id, f);
        try { w.postMessage({ id, cmd, st, level, opts }); } catch (e) { waits.delete(id); fb().then(done); }
      });
    }
    self.choose = (st, level, opts) => ask('choose', st, level, opts, () => AI().chooseAsync(st, level, opts));
    self.dead = (st, opts) => ask('dead', st, 0, opts, () => new Promise(res => setTimeout(() => { const r = AI().suggestDead(st, Object.assign({ time: 350 }, opts || {})); res({ dead: r.dead, own: Array.from(r.own), sims: r.sims }); }, 0)));
    // 起動の確認（Worker が本当に動くか）
    self.probe = () => new Promise(res => { boot(); if (!w) { res(false); return; } const id = ++seq; const t = setTimeout(() => { failed = true; self.kind = 'main'; res(false); }, 1500); waits.set(id, { resolve: () => { clearTimeout(t); res(true); }, fallback: () => { clearTimeout(t); res(false); } }); try { w.postMessage({ id, cmd: 'ping' }); } catch (e) { clearTimeout(t); res(false); } });
    return self;
  }
  const API = { create };
  root.IgoCPU = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
