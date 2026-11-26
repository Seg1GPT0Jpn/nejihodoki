// The scores (orchestra/scores/*.json built from Mutopia MIDI by tools/build-orchestra-scores.js): licences recorded and shown, schema, rebuild determinism,
// plus the page wiring (every script exists, English for every Japanese string, no third-party code).
// 実行：node tools/tests/unit/orchestra-scores.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const index = JSON.parse(rd('orchestra/scores/index.json'));

test('every piece has a recorded licence (Public Domain, or CC BY-SA 3.0 with licence URL and credit), a Mutopia id, a source MIDI in the repo, and a row in CREDITS.md', () => {
  ok(index.pieces.length >= 47, 'pieces: ' + index.pieces.length); const credits = rd('orchestra/CREDITS.md'), ids = new Set();
  for (const p of index.pieces) {
    ids.add(p.id); ok(['Public Domain', 'CC BY-SA 3.0', 'CC0 1.0', 'CC BY 4.0'].includes(p.src.licence) || (p.src.author === 'Ben Boot' && /copyright-free/.test(p.src.licence)) || /^(as stated by the project owner|owner's own work|arrangement by the owner)/.test(p.src.licence), p.id + ' licence ' + p.src.licence); if (p.src.licence === 'CC BY-SA 3.0') { ok(/creativecommons\.org\/licenses\/by-sa\/3\.0/.test(p.src.licenceUrl) && /CC BY-SA 3\.0/.test(p.src.credit) && /Mutopia/.test(p.src.credit), p.id + ' share-alike credit'); const sj = JSON.parse(rd('orchestra/scores/' + p.id + '.json')); eq(sj.src.licence, 'CC BY-SA 3.0'); eq(sj.src.credit, p.src.credit, 'the derived score JSON carries the licence and the credit'); }
    if (p.src.author === 'Ben Boot') { ok(/Ben Boot/.test(p.src.credit) && /owner/i.test(p.src.credit), p.id + ' credit says the licence evidence is the owner\'s statement'); eq(JSON.parse(rd('orchestra/scores/' + p.id + '.json')).src.credit, p.src.credit); }
    if (p.sketch) { ok(/Sketch/.test(p.src.credit) && /approximate/.test(p.src.credit) && /スケッチ/.test(p.mvt.ja + p.blurb.ja) && /SKETCH/i.test(p.mvt.en) && /approximate/.test(p.blurb.en), p.id + ' is labelled as a sketch everywhere'); eq(JSON.parse(rd('orchestra/scores/' + p.id + '.json')).src.credit, p.src.credit); }
    if (p.src.licence === 'CC BY 4.0') { ok(/Paul De Bra/.test(p.src.credit) && /licenses\/by\/4\.0/.test(p.src.licenceUrl) && p.simplified, p.id + ' attribution credit'); const sj = JSON.parse(rd('orchestra/scores/' + p.id + '.json')); eq(sj.src.credit, p.src.credit); }
    if (p.src.licence === 'CC0 1.0') { ok(p.src.musescore && /CC0/.test(p.src.credit) && /creativecommons\.org\/publicdomain\/zero/.test(p.src.licenceUrl), p.id + ' CC0 credit'); } ok((Number.isInteger(p.src.mutopia) && p.src.mutopia > 0) || (p.src.musescore && p.src.musescore.user > 0) || (p.src.imslp && /imslp\.org/.test(p.src.imslp)) || p.src.author, p.id + ' source id');
    ok(credits.includes('| ' + p.id + ' |') && (!p.src.mutopia || credits.includes('piece-info.cgi?id=' + p.src.mutopia + ')')), p.id + ' in CREDITS.md');
    p.src.midi.forEach(f => { ok(fs.existsSync(path.join(ROOT, 'tools/orchestra-midi')) && JSON.stringify(fs.readdirSync(path.join(ROOT, 'tools/orchestra-midi'), { recursive: true })).includes(f), p.id + ' source midi ' + f); });
    ok(p.title.ja && p.title.en && p.composer.ja && p.composer.en && p.mvt.ja && p.mvt.en && p.blurb.ja && p.blurb.en, p.id + ' texts'); ok(p.minutes > (p.id === 'finlandia' ? 0.5 : 1) && p.minutes < 20, p.id + ' minutes ' + p.minutes);
    ok(p.level >= 1 && p.level <= 3 && [1, 2, 3, 4].includes(p.pattern), p.id + ' level/pattern');
  }
  eq(ids.size, index.pieces.length); ok(/Public Domain/.test(credits) && /CC BY-SA 3\.0/.test(credits) && /ShareAlike|share-alike/i.test(credits), 'credits list the share-alike pieces with the licence');
  const lic = rd('orchestra/samples/LICENSES.txt'); ok(/CC0 1\.0/.test(lic) && /440300901dfe9275fd84e0b7763af1f8443ae62e/.test(lic) && /Sam Gossner/.test(lic), 'sample licence + commit recorded');
  ok(/CC0/.test(JSON.parse(rd('orchestra/samples/bank.json')).source.licence));
});

test('score JSON: schema, ordered notes inside the piece, one dynamics digit per beat, cues sorted and inside the piece, compact', () => {
  for (const p of index.pieces) {
    const raw = rd('orchestra/scores/' + p.id + '.json'), j = JSON.parse(raw); ok(raw.length < 400 * 1024, p.id + ' size ' + raw.length);
    eq(j.v, 1); eq(j.ppq, 96); eq(j.id, p.id); eq(j.dyn.length, j.nBeats); let beats = 0; j.grid.forEach(g => { eq(g.length, 4); beats += g[1] * g[2]; ok(g[2] >= 1 && g[2] <= 5 && g[3] >= 24, p.id + ' grid'); }); eq(beats, j.nBeats);
    const last = j.grid[j.grid.length - 1], endTick = last[0] + last[1] * last[2] * last[3];
    j.sec.forEach(s => { eq(s.n.length % 4, 0); let t = 0, count = 0; for (let i = 0; i < s.n.length; i += 4) { ok(s.n[i] >= 0, 'sorted'); t += s.n[i]; ok(t < endTick, p.id + ' ' + s.id + ' note inside'); ok(s.n[i + 1] >= 21 && s.n[i + 1] <= 108, 'pitch'); ok(Math.abs(s.n[i + 2]) >= 1 && t + Math.abs(s.n[i + 2]) <= endTick + 1, 'duration'); ok(s.n[i + 3] >= 1 && s.n[i + 3] <= 127, 'vel'); count++; } ok(count > 30 || (['timp', 'perc', 'cym', 'harp'].includes(s.id) && count >= 5), p.id + ' ' + s.id + ' notes'); });
    let prev = -1; j.cues.forEach(c => { ok(c[0] >= prev && c[0] < j.nBeats && c[1].length >= 1, p.id + ' cue'); prev = c[0]; c[1].forEach(id => ok(j.sec.some(s => s.id === id), 'cue section')); });
    j.bpm.forEach(r => ok(r[1] >= 24 && r[1] <= 180)); eq(j.bpm[0][0], 0);
    for (const inst of Object.keys(j.needs)) ok(j.sec.some(s => s.inst === inst), p.id + ' needs only what it uses');
  }
});

test('the score builder is deterministic: rebuilding from tools/orchestra-midi gives the same bytes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-scores-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build-orchestra-scores.js'), '--out', tmp], { stdio: 'pipe' });
    for (const f of fs.readdirSync(path.join(ROOT, 'orchestra/scores'))) eq(fs.readFileSync(path.join(tmp, f), 'utf8'), rd('orchestra/scores/' + f), f);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('no third-party code: the orchestra/ scripts are self-contained, only Google Fonts is fetched from outside, and page scripts all exist', () => {
  const html = rd('orchestra/index.html');
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) { const src = m[1]; ok(!/^https?:/.test(src), 'no CDN script ' + src); ok(fs.existsSync(path.join(ROOT, 'orchestra', src)), 'script exists ' + src); }
  for (const f of ['midi.js', 'engine.js', 'sampler.js', 'art.js']) { const t = rd('orchestra/' + f); ok(!/\brequire\(\s*['"][^.'"][^'"]*['"]\)/.test(t.replace(/typeof module[^\n]*/, '')), f + ' has no third-party require'); ok(!/GPL|WebAudioFont|Tone\.js/i.test(t), f); }
  ok(!/(api[_-]?key|AIza|secret)/i.test(html + rd('tools/build-orchestra-samples.js')), 'no keys');
});

test('English for every Japanese string the page shows (T(...) literals, data-i18n texts and labels) and for every section name in engine.js', () => {
  const html = rd('orchestra/index.html'); const dict = html + rd('orchestra/concert.js') + rd('orchestra/contest.js'); // the English tables live in the first KoboI18n.add block, in the concert-mode block and in the contest-mode block (and in concert.js / contest.js EN)
  const keys = new Set([...dict.matchAll(/'((?:[^'\\]|\\.)*)'\s*:\s*'(?:[^'\\]|\\.)*'/g)].map(m => m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'")));
  const body = html.slice(html.indexOf("const T = KoboI18n.t;"));
  const used = new Set([...body.matchAll(/\bT\(\s*'((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'")));
  const html2 = html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
  for (const m of html2.matchAll(/data-i18n(?:-attr="[^"]*")?[^>]*>([^<]+)</g)) used.add(m[1].trim());
  for (const m of html2.matchAll(/(?:aria-label|title)="([^"]*[ぁ-んァ-ン一-龥][^"]*)"/g)) used.add(m[1]);
  // strings passed in arrays / ternaries
  for (const m of body.matchAll(/'([^'\n]*[ぁ-んァ-ン一-龥][^'\n]*)'/g)) { const s = m[1].replace(/\\n/g, '\n'); if (keys.has(s)) used.add(s); }
  const missing = [...used].filter(s => /[ぁ-んァ-ン一-龥]/.test(s) && !keys.has(s) && !/^[\x00-\x7f]*$/.test(s) && !['指揮者ゲーム'].includes(s));
  ok(missing.length === 0, 'missing English: ' + JSON.stringify(missing.slice(0, 8)));
  // the "how to" and credits sentences live in arrays
  for (const s of ['タクトを振らないと音楽は止まります（どのむずかしさでも）。もう一度振ると続きから。まず「練習」で4拍振ってみよう。', 'オーケストラの音は VSCO 2 Community Edition（Sam Gossner / Versilian Studios、CC0 1.0）の録音を切り出して使っています。']) ok(keys.has(s), 'dictionary: ' + s.slice(0, 20));
  const E = require(path.join(ROOT, 'orchestra/engine.js')); for (const id in E.SECTIONS) { const d = E.SECTIONS[id]; ok(d.ja && d.en && d.ab.ja && d.ab.en, id + ' names'); }
});

run('orchestra-scores');
