#!/usr/bin/env node
// まなびの工房：問題データの変換（node。同じ入力から必ず同じ出力ができる：時刻・乱数・並びの揺れなし）
//
//   node tools/build-manabi.js --src <問題データのフォルダ> [--out manabi/data] [--check] [--quiet]
//
//   --src   かながわコネクト教材プロジェクトの問題データ（schemas/ と data/ を含むフォルダ。読むだけ）
//           環境変数 MANABI_SRC でも指定できる
//   --out   出力先（既定は manabi/data。中を全部作り直す）
//   --check 書かずに、変換の結果（数・理由・サイズ）だけ出す
//
// 出力：
//   index.json         コース（中学 JH／高校 HS）→ 教科 → 単元 → セット（件数・むずかしさ・学年・コース名）と、模試の一覧、クレジット
//   u/<unit>.json      単元ごとの練習セット：{ v, id, n, S:{ 共有の本文・資料 }, q:[ 問題… ] }（q は id の順。保存の「箱」はこの並びの位置で持つ）
//   x/<exam>.json      模試・共通テスト形式のセット（出題順・大問・制限時間つき）
//   report.json        変換の数え上げ（スキップの理由つき）
//
// 問題の形（アプリが使うものだけ）：
//   i 問題ID  t 型（mc 単一選択／ms 複数選択／or 並べ替え／nu 数値／sa 短答／de 記述／pr 証明）  q 問題文  c 選択肢 [[ラベル, 文], …]
//   a 正答（mc＝ラベル、ms・or＝ラベルの配列、ほか＝文字列）  x 別解の配列  d 表示用の正答  un 単位  e 解説  ea/es くわしい解説（考え方／手順の配列）
//   df むずかしさ 1〜5  sk 観点（skills の先頭）  st 共有の本文のキー  f 図 {s: svg, a: 説明, c: キャプション}  tb 表 {h, r, c}  p 配点（模試だけ）
//   n 問題番号・sec 大問（模試だけ）
// 落とすもの：verification・copyright・revision・scoring（配点以外）・calc_check・distractor_analysis・error_analysis・perspectives・variant_group など。
//   著作権者の表示は index.json の credit の1行だけ。
// 図：データには SVG が文字列で入っている（564問）。危ないもの（script・on*=・foreignObject・外部参照）は取り除いて、そのまま持つ。
// スキップするもの：答えや選択肢がこわれている問題、「右の図」「次の表」などと言いながら図も表も資料もない問題、同じ問題（同じ文・選択肢・答え）の2つめ以降。
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function cliOptions(argv) {
  const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : null; };
  return { src: opt('src') || process.env.MANABI_SRC || '', out: typeof opt('out') === 'string' ? opt('out') : 'manabi/data', check: !!opt('check'), quiet: !!opt('quiet') };
}

const CREDIT = '問題の著作権者：かながわコネクト教材プロジェクト（オリジナル作成。古典の原文はパブリックドメイン）';
const SUBJECTS = [
  { id: 'english', ja: '英語', en: 'English' }, { id: 'math', ja: '数学', en: 'Math' }, { id: 'japanese', ja: '国語', en: 'Japanese' },
  { id: 'science', ja: '理科', en: 'Science' }, { id: 'social', ja: '社会', en: 'Social studies' }, { id: 'information', ja: '情報', en: 'Information' },
  { id: 'integrated', ja: '教科横断', en: 'Cross-subject' },
];
const COURSES = [{ id: 'JH', ja: '中学', en: 'Junior high', stage: 'junior_high' }, { id: 'HS', ja: '高校', en: 'High school', stage: 'high_school' }];
const TYPE = { multiple_choice: 'mc', multiple_select: 'ms', ordering: 'or', numeric: 'nu', short_answer: 'sa', descriptive: 'de', proof: 'pr' };
const MAX_SET = 200; // これより多い単元は、いくつかのセットに分ける（今は超える単元はない）

// ---------------------------------------------------------------- 読み込み
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// 単元の名前：curriculum_map.json から（HS はコース名つき）
function loadUnits(cmap) {
  const m = {};
  const add = (u, extra) => { if (u && u.unit_id) m[u.unit_id] = Object.assign({ title: u.title, grade: u.grade, domain: u.domain || '', course: '' }, extra || {}); };
  for (const st of cmap.stages || []) for (const sub of st.subjects || []) for (const u of sub.units || []) add(u, { course: st.id === 'high_school' ? (sub.label || '') : '' });
  for (const t of cmap.exam_tracks || []) for (const u of t.units || []) add(u, { course: t.label || '' });
  return m;
}

// ---------------------------------------------------------------- 小さな道具
function cleanSvg(s) {
  if (typeof s !== 'string') return '';
  let t = s.trim();
  if (!/^<svg[\s>]/i.test(t) || !/<\/svg>\s*$/i.test(t)) return '';
  t = t.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/\s(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi, '');
  return t;
}
const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
const norm = s => str(s).replace(/\s+/g, ' ').trim();
const MISSING_FIG = /(右の図|左の図|上の図|下の図|次の図|この図|図[0-9０-９１-９]|図のよう|図のとお|図を見|図から|次の表(?!現)|右の表|下の表|この表|次のグラフ|下のグラフ|右のグラフ|このグラフ|次の写真|下の写真|右の写真|この写真|次の地図|下の地図|この地図)/;
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function compactTable(t) {
  if (!t || !Array.isArray(t.rows) || !t.rows.length) return null;
  const o = { r: t.rows.map(r => (Array.isArray(r) ? r.map(str) : [str(r)])) };
  if (Array.isArray(t.header) && t.header.length) o.h = t.header.map(str);
  if (t.caption) o.c = str(t.caption);
  return o;
}
function compactFigure(f) {
  if (!f) return null;
  const s = cleanSvg(f.svg);
  if (!s) return null;
  const o = { s, a: str(f.alt) };
  if (f.caption) o.c = str(f.caption);
  return o;
}
function compactStimulus(st) {
  const o = { t: st.type === 'listening_script' ? 'ls' : st.type === 'classical_text' ? 'cl' : st.type === 'passage' ? 'ps' : st.type === 'poem' ? 'po' : st.type === 'dialogue' ? 'dg' : st.type === 'data' ? 'da' : st.type === 'table' ? 'tb' : st.type === 'figure' ? 'fg' : 'ps' };
  if (st.title) o.ti = str(st.title);
  if (st.content) o.c = str(st.content);
  const tb = compactTable(st.table); if (tb) o.tb = tb;
  const fg = compactFigure(st.figure); if (fg) o.f = fg;
  if (st.vertical) o.v = 1;
  if (Array.isArray(st.glossary) && st.glossary.length) o.g = st.glossary.map(g => [str(g.term), str(g.meaning)]);
  return o;
}

// ---------------------------------------------------------------- 小単元（tools/manabi-subunits.json：variant_group → 小単元。コミットずみの対応表なので、ビルドはいつも同じ結果）
const bigrams = t => { const m = new Map(); const s = String(t).replace(/[\s$\\{}()]/g, ''); for (let i = 0; i + 1 < s.length; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
const cosine = (a, b) => { let d = 0, na = 0, nb = 0; a.forEach((v, k) => { na += v * v; if (b.has(k)) d += v * b.get(k); }); b.forEach(v => { nb += v * v; }); return na && nb ? d / Math.sqrt(na * nb) : 0; };
// u.qs（id 順）の各問題に r.su（小単元の番号）をつけて、[{ id, ti, goal, n }] を返す。variant_group のない問題は、近い文面の小単元へ
function assignSubs(qs, subs) {
  if (!subs || !subs.length) { qs.forEach(r => { r.su = 0; }); return [{ id: 'a', ti: '', goal: '', n: qs.length }]; }
  const g2s = {}; subs.forEach((s, i) => s.groups.forEach(g => { g2s[g] = i; }));
  const vec = subs.map(() => new Map()), cnt = subs.map(() => 0), pending = [];
  qs.forEach(r => { if (r.vg != null && g2s[r.vg] != null) { r.su = g2s[r.vg]; cnt[r.su]++; bigrams(r.q).forEach((v, k) => vec[r.su].set(k, (vec[r.su].get(k) || 0) + v)); } else pending.push(r); });
  for (const r of pending) { const b = bigrams(r.q); let best = 0, bs = -1; vec.forEach((v, i) => { const c = cosine(b, v) * (cnt[i] ? 1 : 0); if (c > bs + 1e-12) { bs = c; best = i; } }); r.su = best; }
  // 8 問に足りない小単元は、前（先頭なら次）にくっつける
  const order = subs.map((s, i) => i); let n = subs.map((_, i) => qs.filter(r => r.su === i).length);
  for (let guard = 0; guard < 20; guard++) {
    const i = order.findIndex(k => n[k] < 8); if (i < 0 || order.length <= 1) break;
    const to = order[i > 0 ? i - 1 : 1], from = order[i]; qs.forEach(r => { if (r.su === from) r.su = to; }); n[to] += n[from]; n[from] = 0; order.splice(i, 1);
  }
  const remap = {}; order.forEach((k, j) => { remap[k] = j; }); qs.forEach(r => { r.su = remap[r.su]; });
  return order.map((k, j) => ({ id: subs[k].id, ti: subs[k].ti, goal: subs[k].goal, n: n[k] }));
}

// ---------------------------------------------------------------- 1問の変換（だめなら理由の文字列を返す）
function convert(q, setStimuli, S, why) {
  const t = TYPE[q.question_type];
  if (!t) return 'type:' + q.question_type;
  const a = q.answer;
  if (!a || a.value == null || a.value === '' || (Array.isArray(a.value) && !a.value.length)) return 'no-answer';
  const o = { i: q.id, t, q: str(q.stem) };
  if (!o.q.trim()) return 'no-stem';
  const labels = [];
  if (t === 'mc' || t === 'ms' || t === 'or') {
    if (!Array.isArray(q.choices) || q.choices.length < 2) return 'no-choices';
    o.c = q.choices.map(c => { labels.push(str(c.label)); return [str(c.label), str(c.text)]; });
    if (new Set(labels).size !== labels.length) return 'dup-labels';
  }
  if (t === 'mc') {
    if (typeof a.value !== 'string' || !labels.includes(a.value)) return 'bad-answer-label';
    o.a = a.value;
  } else if (t === 'ms' || t === 'or') {
    if (!Array.isArray(a.value) || !a.value.every(v => labels.includes(v)) || new Set(a.value).size !== a.value.length) return 'bad-answer-labels';
    if (t === 'or' && a.value.length !== labels.length) return 'bad-order';
    o.a = a.value.slice();
  } else {
    const v = Array.isArray(a.value) ? a.value.map(str).join('\n') : str(a.value);
    if (!v.trim()) return 'no-answer';
    o.a = v;
  }
  if (Array.isArray(a.accepted) && a.accepted.length && t !== 'mc' && t !== 'ms' && t !== 'or') {
    const acc = [...new Set(a.accepted.map(str).filter(x => x.trim() && x !== o.a))];
    if (acc.length) o.x = acc;
  }
  if (a.display && a.display !== o.a) o.d = str(a.display);
  if (a.unit) o.un = str(a.unit);
  o.e = str(q.explanation);
  const ed = q.explanation_detail;
  if (ed) {
    if (ed.approach) o.ea = str(ed.approach);
    if (Array.isArray(ed.steps) && ed.steps.length) o.es = ed.steps.map(str);
  }
  o.df = (q.difficulty && q.difficulty.score) || 3;
  if (Array.isArray(q.skills) && q.skills.length) o.sk = q.skills[0];
  // 図・表・本文
  const fg = compactFigure(q.figure); if (fg) o.f = fg;
  const tb = compactTable(q.table); if (tb) o.tb = tb;
  let st = q.stimulus || (q.stimulus_ref && setStimuli[q.stimulus_ref]) || null;
  if (q.stimulus_ref && !st) return 'missing-stimulus-ref';
  if (st) {
    const cs = compactStimulus(st), js = JSON.stringify(cs);
    let key = str(st.id || q.stimulus_ref || hash(js)), n = 1;
    while (S[key] && JSON.stringify(S[key]) !== js) key = str(st.id || q.stimulus_ref) + '~' + (++n);
    S[key] = cs; o.st = key;
  }
  if (q.question_type && !fg && !tb && !st) {
    if (MISSING_FIG.test(o.q + ' ' + (o.c || []).map(c => c[1]).join(' '))) return 'refers-to-missing-figure';
  }
  if (q.number) o.n = str(q.number);
  if (q.section) o.sec = str(q.section);
  if (q.variant_group) o.vg = q.variant_group; // 小単元に分けるときだけ使う（出力には残さない）
  if (q.scoring && q.scoring.points != null) o.p = q.scoring.points;
  return o;
}

function main(o) {
  o = o || cliOptions(process.argv.slice(2));
  const SRC = o.src, OUT = path.resolve(ROOT, o.out || 'manabi/data'), CHECK = !!o.check, QUIET = !!o.quiet;
  if (!SRC) { console.error('usage: node tools/build-manabi.js --src <問題データのフォルダ> [--out manabi/data] [--check]'); process.exit(2); }
  const srcDir = path.resolve(SRC);
  const cmap = readJson(path.join(srcDir, 'schemas', 'curriculum_map.json'));
  const unitMeta = loadUnits(cmap);
  const files = walk(path.join(srcDir, 'data'));
  const rep = { files: files.length, questionsIn: 0, kept: 0, skipped: {}, duplicates: 0, byDir: {}, byType: {}, figures: 0, latex: 0, stimuli: 0, units: 0, exams: 0, listeningScript: 0, svgDropped: 0 };
  const skip = r => { rep.skipped[r] = (rep.skipped[r] || 0) + 1; };

  // ファイルを分ける：問題のない授業プリントは読まない／模試はセットのまま／ほかは単元ごとに集める
  const units = {};   // unit_id → { meta, qs: [] }
  const exams = [];
  const seen = new Set();
  // パックの問題プリントを先に（同じ問題は先に来た方を残す）
  const order = f => { const d = path.relative(path.join(srcDir, 'data'), f).split(path.sep)[0]; return ['hs_packs', 'jh_packs', 'junior_high', 'high_school', 'pilot', 'second_stage'].indexOf(d) + 1 || 9; };
  const sorted = files.slice().sort((a, b) => order(a) - order(b) || cmpStr(a, b));
  const isExamFile = (f, d) => /^(mock_exam|common_test)\//.test(f) || /^pilot\/kanagawa_mock/.test(f);
  for (const f of sorted) {
    const d = readJson(f);
    const rel = path.relative(path.join(srcDir, 'data'), f).split(path.sep).join('/');
    const dir = rel.split('/')[0];
    const qs = d.questions || [];
    rep.byDir[dir] = rep.byDir[dir] || { files: 0, in: 0, kept: 0 };
    rep.byDir[dir].files++;
    if (!qs.length) continue;
    const setStimuli = {};
    for (const s of d.stimuli || []) setStimuli[s.id] = s;
    const exam = isExamFile(rel, d);
    const S = {}, out = [];
    for (const q of qs) {
      rep.questionsIn++; rep.byDir[dir].in++;
      const r = convert(q, setStimuli, S, skip);
      if (typeof r === 'string') { skip(r); continue; }
      if (!exam) {
        const key = r.t + '|' + norm(r.q) + '|' + JSON.stringify(r.c || null) + '|' + JSON.stringify(r.a) + '|' + (r.st || '');
        if (seen.has(key)) { rep.duplicates++; continue; }
        seen.add(key);
      }
      out.push([q, r]);
    }
    if (!out.length) continue;
    if (exam) {
      const id = String(d.set_id).toLowerCase();
      const examQs = out.map(([, r]) => r);
      const used = new Set(examQs.map(r => r.st).filter(Boolean));
      const SS = {}; for (const k of Object.keys(S)) if (used.has(k)) SS[k] = S[k];
      const meta = unitMeta[(d.unit_ids || [])[0]] || {};
      exams.push({
        id, title: d.title, subject: d.subject, stage: d.stage, grade: d.grade, minutes: d.time_limit_minutes || (qs.length > 60 ? 250 : 0), // 5教科の通し模試は時間の指定がない：50分×5 kanagawa: d.exam_format === 'kanagawa',
        sections: (d.sections || []).map(s => ({ id: s.id, ti: s.title, ins: s.instructions || '' })), instructions: d.instructions || [], unit: (d.unit_ids || [])[0] || '',
        S: SS, q: examQs, meta, src: rel,
      });
      rep.byDir[dir].kept += examQs.length; rep.kept += examQs.length;
      continue;
    }
    for (const [q, r] of out) {
      const uid = q.unit_id;
      const u = units[uid] || (units[uid] = { id: uid, meta: unitMeta[uid] || null, subject: q.subject, grade: q.grade, stage: d.stage, qs: [], S: {} });
      // 本文は単元の中で共有する（キーがぶつかるときは付け替える）
      if (r.st) {
        const js = JSON.stringify(S[r.st]);
        let key = r.st, n = 1;
        while (u.S[key] && JSON.stringify(u.S[key]) !== js) key = r.st.replace(/~\d+$/, '') + '~' + (++n);
        u.S[key] = S[r.st]; r.st = key;
      }
      u.qs.push(r);
      rep.byDir[dir].kept++; rep.kept++;
    }
  }

  // 単元 → セット
  const SUBS = fs.existsSync(path.join(__dirname, 'manabi-subunits.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'manabi-subunits.json'), 'utf8')) : {};
  const outFiles = {}; // 相対パス → オブジェクト
  const indexUnits = [];
  for (const uid of Object.keys(units).sort(cmpStr)) {
    const u = units[uid];
    u.qs.sort((a, b) => cmpStr(a.i, b.i));
    const subInfo = assignSubs(u.qs, SUBS[uid]);
    const meta = u.meta || { title: uid, domain: '', course: '' };
    const sets = [];
    const nSets = Math.max(1, Math.ceil(u.qs.length / MAX_SET));
    for (let s = 0; s < nSets; s++) {
      const part = nSets === 1 ? u.qs : u.qs.slice(Math.floor(s * u.qs.length / nSets), Math.floor((s + 1) * u.qs.length / nSets));
      const used = new Set(part.map(r => r.st).filter(Boolean));
      const SS = {}; for (const k of Object.keys(u.S).sort(cmpStr)) if (used.has(k)) SS[k] = u.S[k];
      const sid = nSets === 1 ? uid.toLowerCase() : uid.toLowerCase() + '-' + (s + 1);
      const file = 'u/' + sid + '.json';
      outFiles[file] = { v: 1, id: sid, n: part.length, S: SS, q: part };
      const dl = [0, 0, 0];
      for (const r of part) dl[r.df <= 2 ? 0 : r.df === 3 ? 1 : 2]++;
      const tc = {}; for (const r of part) tc[r.t] = (tc[r.t] || 0) + 1;
      sets.push({ id: sid, f: file, n: part.length, dl, ty: tc, h: hash(part.map(r => r.i).join(',')) });
      for (const r of part) delete r.vg;
    }
    const all = u.qs;
    const avg = all.reduce((x, r) => x + r.df, 0) / all.length;
    indexUnits.push({
      id: uid, ti: meta.title, cr: u.stage === 'junior_high' ? 'JH' : 'HS', sub: u.subject, g: Number(String(u.grade).replace(/\D/g, '')) || 1, gr: u.grade,
      co: meta.course || '', dm: meta.domain || '', n: all.length, df: Math.round(avg * 10) / 10, sets, subs: subInfo, sm: u.qs.map(r => String(r.su)).join(''),
    });
    rep.units++;
  }
  // 模試
  const indexExams = [];
  exams.sort((a, b) => cmpStr(a.id, b.id));
  for (const e of exams) {
    const file = 'x/' + e.id + '.json';
    const pts = e.q.reduce((x, r) => x + (r.p || 0), 0);
    outFiles[file] = { v: 1, id: e.id, title: e.title, min: e.minutes, sec: e.sections, ins: e.instructions, S: e.S, q: e.q };
    indexExams.push({ id: e.id, ti: e.title, sub: e.subject, cr: e.stage === 'junior_high' ? 'JH' : 'HS', gr: e.grade, min: e.minutes, n: e.q.length, pts, kng: e.kanagawa ? 1 : 0, f: file });
    rep.exams++;
  }
  // 数え上げ
  for (const [, o] of Object.entries(outFiles)) for (const r of o.q) {
    rep.byType[r.t] = (rep.byType[r.t] || 0) + 1;
    if (r.f || (r.st && o.S[r.st] && o.S[r.st].f)) rep.figures++;
    if (/\$[^$]+\$/.test(r.q + r.e + (r.c || []).map(c => c[1]).join(''))) rep.latex++;
    if (r.st && o.S[r.st] && o.S[r.st].t === 'ls') rep.listeningScript++;
  }
  rep.stimuli = Object.values(outFiles).reduce((x, o) => x + Object.keys(o.S).length, 0);

  // index
  const index = {
    v: 1, credit: CREDIT, note: 'AIが作った問題で、まだ専門家の確認を受けていません。',
    total: indexUnits.reduce((x, u) => x + u.n, 0), examTotal: indexExams.reduce((x, e) => x + e.n, 0),
    subjects: SUBJECTS.map(s => ({ id: s.id, ja: s.ja, en: s.en })),
    courses: COURSES.map(c => ({
      id: c.id, ja: c.ja, en: c.en,
      subjects: SUBJECTS.map(s => ({ id: s.id, units: indexUnits.filter(u => u.cr === c.id && u.sub === s.id).sort((a, b) => a.g - b.g || cmpStr(a.co, b.co) || cmpStr(a.id, b.id)) }))
        .filter(s => s.units.length),
    })),
    exams: indexExams,
  };

  // 書く
  const ser = o => JSON.stringify(o);
  const sizes = { index: 0, units: 0, exams: 0, maxUnit: 0, maxUnitFile: '' };
  const idx = ser(index); sizes.index = Buffer.byteLength(idx);
  for (const [f, o] of Object.entries(outFiles)) {
    const n = Buffer.byteLength(ser(o));
    if (f.startsWith('u/')) { sizes.units += n; if (n > sizes.maxUnit) { sizes.maxUnit = n; sizes.maxUnitFile = f; } } else sizes.exams += n;
  }
  rep.sizes = sizes; rep.totalBytes = sizes.index + sizes.units + sizes.exams; rep.unitFiles = Object.keys(outFiles).filter(f => f.startsWith('u/')).length;
  if (!CHECK) {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(path.join(OUT, 'u'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'x'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'index.json'), idx + '\n');
    for (const f of Object.keys(outFiles).sort(cmpStr)) fs.writeFileSync(path.join(OUT, f), ser(outFiles[f]) + '\n');
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(rep, null, 1) + '\n');
  }
  if (!QUIET) {
    console.log(`manabi build: ${rep.questionsIn} in → ${rep.kept} kept, ${rep.duplicates} duplicates, ${Object.values(rep.skipped).reduce((a, b) => a + b, 0)} skipped`);
    console.log('  skipped:', JSON.stringify(rep.skipped));
    console.log(`  units ${rep.units}, exams ${rep.exams}, figures ${rep.figures}, latex ${rep.latex}, listening scripts ${rep.listeningScript}`);
    console.log('  types:', JSON.stringify(rep.byType));
    console.log(`  size: index ${(sizes.index / 1024).toFixed(0)}KB, units ${(sizes.units / 1048576).toFixed(2)}MB (${rep.unitFiles} files, max ${(sizes.maxUnit / 1024).toFixed(0)}KB ${sizes.maxUnitFile}), exams ${(sizes.exams / 1048576).toFixed(2)}MB; total ${(rep.totalBytes / 1048576).toFixed(2)}MB`);
  }
  return rep;
}

// ---------------------------------------------------------------- 地図（Natural Earth：パブリックドメイン。https://www.naturalearthdata.com/about/terms-of-use/ ）
//   node tools/build-manabi.js --ne-admin1 ne_10m_admin_1_states_provinces_lakes.geojson --ne-countries ne_110m_admin_0_countries.geojson
//   → manabi/content/map-jp.json（47都道府県）・map-world.json（主な国）。簡略化した SVG の path と日本語名だけ（自作の簡略図）
const WORLD_ISO = ['CAN','USA','MEX','CUB','COL','VEN','PER','BRA','BOL','CHL','ARG','ISL','GBR','IRL','FRA','ESP','PRT','DEU','ITA','NOR','SWE','FIN','POL','UKR','TUR','RUS','KAZ','MNG','CHN','IND','PAK','AFG','IRN','IRQ','SAU','EGY','LBY','DZA','MAR','MLI','NER','TCD','SDN','ETH','KEN','TZA','COD','AGO','ZAF','MDG','NGA','THA','VNM','MYS','IDN','PHL','KOR','PRK','AUS','NZL','MMR','BGD','UZB','GRC','ROU','BLR','NAM','ZMB','MOZ','GRL','NPL','LAO','KHM'];
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (pts[i][0] - x1) - dx * (pts[i][1] - y1)) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const ringArea = r => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2); };
function geomToPath(g, proj, tol, minArea) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let d = '';
  for (const poly of polys) {
    const raw = poly[0].map(q => proj(q)); let m = 1, md = -1; raw.forEach((q, i) => { const d = Math.hypot(q[0] - raw[0][0], q[1] - raw[0][1]); if (d > md) { md = d; m = i; } }); const outer = dp(raw.slice(0, m + 1), tol).concat(dp(raw.slice(m), tol).slice(1));
    if (outer.length < 4 || ringArea(outer) < minArea) continue;
    const xs = outer.map(q => q[0]), ys = outer.map(q => q[1]), bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    if (Math.hypot(bw, bh) > 30 && ringArea(outer) < 0.03 * bw * bh) continue; // 細長いごみ（ほぼ面積のない線）は描かない
    d += 'M' + outer.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  }
  return d;
}
function buildMaps(admin1File, countriesFile, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const a = readJson(admin1File), c = readJson(countriesFile);
  const K = 22, cl = Math.cos(37 * Math.PI / 180), X0 = 122, Y0 = 46;
  const H0 = Math.round((Y0 - 24.5) * K), INS = { x: 4, y: H0 - 128, w: 148, h: 124 }; // 沖縄は左下の枠に拡大して置く
  const projMain = ([lon, lat]) => [(lon - X0) * cl * K, (Y0 - lat) * K];
  const projOkinawa = ([lon, lat]) => [INS.x + 6 + (lon - 123.0) * cl * K * 1.35, INS.y + 6 + (27.4 - lat) * K * 1.35];
  const prefs = [];
  for (const f of a.features.filter(f => f.properties.adm0_a3 === 'JPN')) {
    const g = f.geometry, polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).filter(p => { const [lon, lat] = p[0][0]; return !(lon > 141.5 && lat < 30); }); // 小笠原は描かない
    const okin = f.properties.iso_3166_2 === 'JP-47', d = geomToPath({ type: 'MultiPolygon', coordinates: polys }, okin ? projOkinawa : projMain, okin ? 0.3 : 0.55, okin ? 0.2 : 1.2);
    prefs.push({ id: f.properties.iso_3166_2.slice(3), ja: f.properties.name_ja, d });
  }
  prefs.sort((x, y) => cmpStr(x.id, y.id));
  const jp = { v: 1, src: 'Natural Earth 1:10m Admin 1 (public domain), simplified', w: Math.round((147 - X0) * cl * K), h: Math.round((Y0 - 24.5) * K), prefs, inset: INS };
  fs.writeFileSync(path.join(outDir, 'map-jp.json'), JSON.stringify(jp) + '\n');
  const W = 3.0, projW = ([lon, lat]) => [(lon + 180) * W, (84 - lat) * W];
  const countries = [];
  for (const iso of WORLD_ISO) {
    const f = c.features.find(x => x.properties.ISO_A3 === iso || x.properties.ISO_A3_EH === iso);
    if (!f) throw new Error('country missing ' + iso);
    countries.push({ id: iso, ja: f.properties.NAME_JA, d: geomToPath(f.geometry, projW, 0.9, 6), cont: f.properties.CONTINENT });
  }
  const wd = { v: 1, src: 'Natural Earth 1:110m Admin 0 (public domain), simplified', w: 360 * W, h: Math.round((84 + 58) * W), countries };
  fs.writeFileSync(path.join(outDir, 'map-world.json'), JSON.stringify(wd) + '\n');
  return { jp: prefs.length, world: countries.length, jpBytes: JSON.stringify(jp).length, worldBytes: JSON.stringify(wd).length };
}
if (require.main === module) {
  const av = process.argv.slice(2), at = k => { const i = av.indexOf(k); return i >= 0 ? av[i + 1] : null; };
  if (at('--ne-admin1')) console.log(buildMaps(at('--ne-admin1'), at('--ne-countries'), path.join(ROOT, 'manabi/content')));
  else main();
}
module.exports.buildMaps = buildMaps;
module.exports = { convert, cleanSvg, MISSING_FIG, main, CREDIT, TYPE, SUBJECTS };
