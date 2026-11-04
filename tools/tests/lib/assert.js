// 小さな assert と、結果の記録（JSON と、人が読める表）
'use strict';
const fs = require('fs');
const path = require('path');

class Recorder {
  constructor() { this.results = []; }
  // 1つのタスク（ページ×サイズ×言語など）に結び付いた記録係
  scope(base) {
    const rec = this;
    const mine = [];
    const push = r => { rec.results.push(r); mine.push(r); };
    return {
      base, mine,
      check(name, ok, detail, o = {}) {
        const status = ok ? 'pass' : (o.severity === 'warn' ? 'warn' : 'fail');
        push(Object.assign({}, base, { check: name, status, detail: ok ? (o.passDetail || '') : fmt(detail), known: o.known || '' }));
        return ok;
      },
      skip(name, why) { push(Object.assign({}, base, { check: name, status: 'skip', detail: why || '', known: '' })); },
      eq(name, actual, expected, o) { return this.check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, o); },
    };
  }
  counts() {
    const c = { pass: 0, fail: 0, warn: 0, skip: 0 };
    for (const r of this.results) c[r.status]++;
    return c;
  }
}
function fmt(d) {
  if (d == null) return '';
  if (typeof d === 'string') return d;
  try { return JSON.stringify(d); } catch (e) { return String(d); }
}

function pad(s, n) { s = String(s); const w = [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0); return s + ' '.repeat(Math.max(0, n - w)); }
function table(rows, head) {
  const all = [head, ...rows];
  const w = head.map((_, i) => Math.max(...all.map(r => [...String(r[i])].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0))));
  const line = r => r.map((c, i) => pad(c, w[i])).join('  ');
  return [line(head), w.map(n => '-'.repeat(n)).join('  '), ...rows.map(line)].join('\n');
}

// スイート × ページ ごとの集計
function summarize(results) {
  const key = r => r.suite + '\u0000' + r.page;
  const m = new Map();
  for (const r of results) {
    if (!m.has(key(r))) m.set(key(r), { suite: r.suite, page: r.page, pass: 0, fail: 0, warn: 0, skip: 0 });
    m.get(key(r))[r.status]++;
  }
  return [...m.values()];
}
const where = r => [r.page, r.vp, r.lang].filter(Boolean).join(' ');

function writeReports(outDir, results, meta) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ meta, results }, null, 1));
  const sum = summarize(results);
  const fails = results.filter(r => r.status === 'fail');
  const warns = results.filter(r => r.status === 'warn');
  const md = [];
  md.push('# テスト結果', '', `- 実行：${meta.started}（${meta.seconds}秒）`, `- 引数：\`${meta.argv}\``, `- 合計：合格 ${meta.counts.pass} / 不合格 ${meta.counts.fail} / 注意 ${meta.counts.warn} / 省略 ${meta.counts.skip}`, '');
  md.push('## スイートごと', '', '| スイート | ページ | 合格 | 不合格 | 注意 | 省略 |', '| --- | --- | --- | --- | --- | --- |');
  for (const s of sum) md.push(`| ${s.suite} | ${s.page} | ${s.pass} | ${s.fail} | ${s.warn} | ${s.skip} |`);
  md.push('', '## 不合格', '');
  if (!fails.length) md.push('なし');
  for (const r of fails) md.push(`- **${r.suite}** ${where(r)} — \`${r.check}\`${r.known ? `（既知：${r.known}）` : ''}：${String(r.detail).replace(/\|/g, '\\|').slice(0, 600)}`);
  md.push('', '## 注意（失敗にはしない）', '');
  if (!warns.length) md.push('なし');
  for (const r of warns) md.push(`- ${r.suite} ${where(r)} — \`${r.check}\`：${String(r.detail).slice(0, 300)}`);
  if (meta.shots) md.push('', `スクリーンショット：\`${meta.shots}\``);
  fs.writeFileSync(path.join(outDir, 'report.md'), md.join('\n') + '\n');
}

module.exports = { Recorder, table, summarize, writeReports, where };
