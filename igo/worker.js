// 囲碁工房：CPU の考える係（Web Worker）。engine.js と ai.js を読みこんで、メッセージで頼まれた計算をする。
'use strict';
importScripts('engine.js', 'ai.js');
self.onmessage = e => {
  const m = e.data || {}; let res = null, error = null;
  try {
    if (m.cmd === 'choose') res = IgoAI.choose(m.st, m.level, m.opts || {});
    else if (m.cmd === 'dead') { const r = IgoAI.suggestDead(m.st, m.opts || {}); res = { dead: r.dead, own: Array.from(r.own), sims: r.sims }; }
    else if (m.cmd === 'ping') res = { ok: 1 };
  } catch (err) { error = String(err && err.message || err); }
  self.postMessage({ id: m.id, res, error });
};
