// ぴょんぴょん冒険: the level editor. Draw tiles and creatures on a 13-row grid, test-play, check with the validator (physics reach analysis),
// share as a code "HP1:theme:gear:rows" (rows run-length packed) and keep three save slots (this device only).
(function (root) {
  'use strict';
  const PAL = [
    ['#', '地面', 'Ground'], ['B', 'ブロック', 'Brick'], ['?', 'コイン箱', 'Coin box'], ['!', 'プレゼント', 'Gift box'], ['-', 'うす床', 'Plank'], ['^', 'とげ', 'Spikes'], ['v', '天井とげ', 'Ceil spikes'], ['~', '水', 'Water'], ['i', '氷', 'Ice'], ['S', 'ばね', 'Spring'],
    ['>', 'ベルト→', 'Belt →'], ['<', 'ベルト←', 'Belt ←'], ['w', '上昇風', 'Updraft'], ['f', 'かくし壁', 'Fake wall'], ['c', 'コイン', 'Coin'], ['m', 'メダル', 'Medal'], ['h', 'ハート', 'Heart'], ['o', 'わっか', 'Ring'], ['K', 'チェック', 'Checkpoint'], ['G', 'ゴール', 'Goal'], ['P', 'スタート', 'Start'],
    ['D', '穴A', 'Burrow A'], ['d', '穴a', 'Burrow a'], ['b', 'ボタンむし', 'Button bug'], ['n', 'ぜんまい', 'Windup'], ['j', 'ばねガエル', 'Frog'], ['a', 'こうもり', 'Bat'], ['p', 'ふうせん', 'Balloon'], ['t', '大砲', 'Cannon'], ['s', 'はりもち', 'Pin cushion'], ['r', 'ころがり', 'Roller'], ['y', 'しずく', 'Drip'], ['e', 'ぜんまい鳥', 'Bird'], ['l', 'ふりこ', 'Pendulum'], ['u', 'かさもち', 'Umbrella-bug'],
    ['M', '横の足場', 'Slider'], ['N', '縦の足場', 'Lift'], ['F', 'くずれる足場', 'Crumbler'], ['Q', 'ばね靴', 'Boots'], ['C', 'マント', 'Cape'], ['R', 'リボン', 'Ribbon'], [' ', 'けしゴム', 'Eraser'],
  ];
  const VALID = new Set(PAL.map(p => p[0]).concat(['x', 'g']));
  const THEMES = ['meadow', 'factory', 'bath', 'snow', 'night', 'atelier'], GEARS = ['', 'boots', 'cape', 'ribbon'];
  const H = 13, MINW = 20, MAXW = 200;
  const blank = w => { const r = []; for (let y = 0; y < H; y++) r.push(' '.repeat(w)); for (let y = 10; y < H; y++) r[y] = '#'.repeat(w); r[9] = 'P' .padEnd(w, ' '); r[9] = ' P' + ' '.repeat(w - 2); r[9] = r[9].slice(0, w - 3) + ' G '; return r; };
  function encode(d) {
    const rle = d.rows.map(r => { let o = '', i = 0; while (i < r.length) { let j = i; while (j < r.length && r[j] === r[i]) j++; const n = j - i, c = r[i] === ' ' ? '_' : r[i]; o += n >= 3 ? c + n : c.repeat(n); i = j; } return o; }).join('|');
    return 'HP1:' + THEMES.indexOf(d.theme) + ':' + GEARS.indexOf(d.gear || '') + ':' + rle;
  }
  function decode(code) {
    const m = /^HP1:([0-5]):([0-3]):(.+)$/.exec(String(code || '').trim()); if (!m) return null;
    const rows = m[3].split('|'); if (rows.length !== H) return null;
    const out = [];
    for (const r of rows) {
      let s = ''; const re = /([^0-9])(\d*)/g; let t;
      while ((t = re.exec(r))) { const c = t[1] === '_' ? ' ' : t[1]; if (!VALID.has(c)) return null; const n = t[2] ? parseInt(t[2], 10) : 1; if (n > MAXW) return null; s += c.repeat(n); if (s.length > MAXW) return null; }
      out.push(s);
    }
    const w = out[0].length; if (w < MINW || w > MAXW || out.some(r => r.length !== w)) return null;
    return { id: 'ED', theme: THEMES[+m[1]], gear: GEARS[+m[2]] || null, rows: out, name: { ja: 'じぶんのステージ', en: 'My level' }, gimmick: { ja: 'じぶんでつくった', en: 'Made by you' }, par: 0 };
  }
  const API = { PAL, THEMES, GEARS, encode, decode, blank, MINW, MAXW };
  let ST = null;
  function open(cx) {
    const { L, esc, store, toast, VAL, E } = cx, host = document.getElementById('editor'), KEY = 'kusoge.hop.ed';
    const rd = () => { try { const o = JSON.parse(store.get(KEY) || 'null'); return o && Array.isArray(o.slots) ? o : { slots: [null, null, null], cur: '' }; } catch (e) { return { slots: [null, null, null], cur: '' }; } };
    const wr = o => store.set(KEY, JSON.stringify(o));
    const saved = rd(); const d0 = (saved.cur && decode(saved.cur)) || null;
    ST = ST || { rows: d0 ? d0.rows.map(r => r.split('')) : blank(80).map(r => r.split('')), theme: d0 ? d0.theme : 'meadow', gear: d0 ? d0.gear : '', sel: '#', x0: 0, msg: '', checked: '' };
    const S = ST, CELL = 20;
    host.hidden = false;
    host.innerHTML = '<div class="edbar"><button class="icon" id="edBack" type="button" aria-label="' + esc(L('もどる', 'Back')) + '">&#8592;</button><b class="edt">' + esc(L('ステージをつくる', 'Level editor')) + '</b></div>' +
      '<div class="edbtns"><button class="btn sub" id="edTest" type="button">' + esc(L('ためしてあそぶ', 'Test play')) + '</button><button class="btn sub" id="edCheck" type="button">' + esc(L('クリアできるか調べる', 'Check it')) + '</button><button class="btn sub" id="edShare" type="button">' + esc(L('合言葉', 'Share code')) + '</button><button class="btn sub" id="edSlots" type="button">' + esc(L('ほぞん', 'Slots')) + '</button><button class="btn sub" id="edClear" type="button">' + esc(L('まっさら', 'Clear')) + '</button></div>' +
      '<div class="edopts"><label>' + esc(L('せかい', 'Theme')) + ' <select id="edTheme">' + THEMES.map(t => '<option value="' + t + '"' + (t === S.theme ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label><label>' + esc(L('どうぐ', 'Gear')) + ' <select id="edGear">' + GEARS.map(g => '<option value="' + g + '"' + (g === S.gear ? ' selected' : '') + '>' + (g || esc(L('なし', 'none'))) + '</option>').join('') + '</select></label><button class="btn sub" id="edW1" type="button">+10</button><button class="btn sub" id="edW2" type="button">-10</button><span id="edW"></span></div>' +
      '<div class="edpal" id="edPal"></div><div class="edmsg" id="edMsg" role="status"></div><div class="edcv"><canvas id="edCv"></canvas></div><input type="range" id="edScroll" aria-label="' + esc(L('よこにうごかす', 'Scroll')) + '">';
    const $ = id => host.querySelector('#' + id), pal = $('edPal'), cv = $('edCv'), c = cv.getContext('2d'), msg = t => { $('edMsg').textContent = t; };
    pal.innerHTML = PAL.map(p => '<button type="button" class="edp' + (p[0] === S.sel ? ' on' : '') + '" data-c="' + esc(p[0]) + '"><i>' + (p[0] === ' ' ? '␣' : esc(p[0])) + '</i><small>' + esc(L(p[1], p[2])) + '</small></button>').join('');
    pal.onclick = e => { const b = e.target.closest('.edp'); if (!b) return; S.sel = b.dataset.c; pal.querySelectorAll('.edp').forEach(x => x.classList.toggle('on', x === b)); };
    const W = () => S.rows[0].length;
    const COL = { '#': '#c98b57', B: '#e8836b', '?': '#ffd24a', '!': '#6fd3c2', '-': '#d9a566', '^': '#9aa3b2', v: '#9aa3b2', '~': '#5ab4f0', i: '#bfe8ff', S: '#ff5d73', '>': '#3b4352', '<': '#3b4352', w: '#dff3ff', f: '#c98b57', c: '#ffd23f', m: '#ffe066', h: '#ff5a7a', o: '#ffcc33', K: '#4fd36b', G: '#ff5d73', P: '#fff4e6' };
    function draw() {
      const vw = Math.max(200, host.querySelector('.edcv').clientWidth), cols = Math.ceil(vw / CELL) + 1; cv.width = vw; cv.height = H * CELL; cv.style.width = vw + 'px';
      const dark = !!(document.documentElement.dataset.kbTheme === 'dark' || (!document.documentElement.dataset.kbTheme && matchMedia('(prefers-color-scheme: dark)').matches));
      c.fillStyle = dark ? '#16222e' : '#dff0ff'; c.fillRect(0, 0, cv.width, cv.height); c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let y = 0; y < H; y++) for (let x = 0; x < cols; x++) {
        const gx = S.x0 + x; if (gx >= W()) break; const ch = S.rows[y][gx];
        c.strokeStyle = 'rgba(128,128,128,.25)'; c.strokeRect(x * CELL + .5, y * CELL + .5, CELL - 1, CELL - 1);
        if (ch === ' ') continue;
        c.fillStyle = COL[ch] || (/[bnjaptsryelu]/.test(ch) ? '#e86f4d' : /[MNF]/.test(ch) ? '#9ad06b' : /[QCR]/.test(ch) ? '#9b6bd9' : /[Dd]/.test(ch) ? '#3a2a20' : '#888'); c.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        c.fillStyle = /[#BcmoSbKG]/.test(ch) ? '#2a2018' : '#fff'; c.fillText(ch, x * CELL + CELL / 2, y * CELL + CELL / 2 + 1);
      }
      $('edW').textContent = W() + ' x ' + H; const sc = $('edScroll'); sc.max = Math.max(0, W() - cols + 1); sc.value = S.x0;
    }
    let drawing = false;
    const put = e => { const r = cv.getBoundingClientRect(), x = S.x0 + Math.floor((e.clientX - r.left) / CELL), y = Math.floor((e.clientY - r.top) / CELL); if (x < 0 || x >= W() || y < 0 || y >= H) return; const ch = S.sel; if ((ch === 'P' || ch === 'G') && true) { for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W(); xx++) if (S.rows[yy][xx] === ch) S.rows[yy][xx] = ' '; } S.rows[y][x] = ch; S.checked = ''; draw(); };
    cv.onpointerdown = e => { e.preventDefault(); drawing = true; try { cv.setPointerCapture(e.pointerId); } catch (x) {} put(e); };
    cv.onpointermove = e => { if (drawing) put(e); }; cv.onpointerup = cv.onpointercancel = () => { drawing = false; };
    $('edScroll').oninput = e => { S.x0 = +e.target.value; draw(); };
    $('edTheme').onchange = e => { S.theme = e.target.value; }; $('edGear').onchange = e => { S.gear = e.target.value; S.checked = ''; };
    const resize = n => { const w = Math.max(MINW, Math.min(MAXW, W() + n)); S.rows = S.rows.map((r, y) => { if (w < r.length) return r.slice(0, w); return r.concat(Array(w - r.length).fill(y >= 10 ? '#' : ' ')); }); S.checked = ''; draw(); };
    $('edW1').onclick = () => resize(10); $('edW2').onclick = () => resize(-10);
    const def = () => ({ id: 'ED', theme: S.theme, gear: S.gear || null, rows: S.rows.map(r => r.join('')), name: { ja: 'じぶんのステージ', en: 'My level' }, gimmick: { ja: 'じぶんでつくった', en: 'Made by you' }, par: 0 });
    const keep = () => { const o = rd(); o.cur = encode(def()); wr(o); };
    function check() { const d = def(); msg(L('調べています…', 'Checking...')); return new Promise(res => setTimeout(() => { let r; try { r = VAL.validate(d, { medals: null }); } catch (e) { r = { errors: [String(e.message)] }; } if (r.errors.length) { msg(L('まだクリアできません：', 'Not passable yet: ') + r.errors.slice(0, 2).join(' / ')); S.checked = ''; } else { msg(L('だいじょうぶ！ ゴールまで行けます。ためしてクリアすると「合言葉」が使えます。', 'Looks passable! Test-play and clear it to unlock sharing.')); S.checked = 'ok'; } res(!r.errors.length); }, 30)); }
    $('edCheck').onclick = () => { check(); };
    $('edTest').onclick = async () => { const ok = await check(); if (!ok) return; keep(); cx.startTest(def()); };
    $('edShare').onclick = () => { if (S.cleared !== encode(def())) { msg(L('先に「ためしてあそぶ」でクリアしてください。', 'Clear it once in "Test play" first.')); return; } const code = encode(def()); try { const cp = navigator.clipboard.writeText(code); if (cp && cp.catch) cp.catch(() => {}); } catch (e) {} msg(L('合言葉（コピーしました）：', 'Code (copied): ') + code); const o = rd(); o.cur = code; wr(o); };
    $('edClear').onclick = () => { S.rows = blank(80).map(r => r.split('')); S.x0 = 0; S.checked = ''; draw(); };
    $('edSlots').onclick = () => {
      const o = rd(); const h = '<div class="edslots">' + [0, 1, 2].map(i => '<div class="row2"><button class="btn sub" data-sv="' + i + '">' + esc(L('ほぞん', 'Save')) + ' ' + (i + 1) + '</button><button class="btn sub" data-ld="' + i + '"' + (o.slots[i] ? '' : ' disabled') + '>' + esc(L('よみこむ', 'Load')) + ' ' + (i + 1) + '</button></div>').join('') + '<div class="fld"><input id="edIn" placeholder="HP1:..." aria-label="' + esc(L('合言葉', 'Code')) + '"><button class="btn sub" id="edImp" type="button">' + esc(L('よみこむ', 'Import')) + '</button></div></div>';
      msg(''); host.querySelector('.edmsg').innerHTML = h;
      host.querySelectorAll('[data-sv]').forEach(b => { b.onclick = () => { const o2 = rd(); o2.slots[+b.dataset.sv] = encode(def()); wr(o2); msg(L('ほぞんしました', 'Saved')); }; });
      const load = code => { const d = decode(code); if (!d) { msg(L('合言葉の形がちがいます', 'That code does not look right')); return; } S.rows = d.rows.map(r => r.split('')); S.theme = d.theme; S.gear = d.gear || ''; S.x0 = 0; S.checked = ''; $('edTheme').value = S.theme; $('edGear').value = S.gear; msg(L('よみこみました', 'Loaded')); draw(); };
      host.querySelectorAll('[data-ld]').forEach(b => { b.onclick = () => load(rd().slots[+b.dataset.ld]); }); host.querySelector('#edImp').onclick = () => load(host.querySelector('#edIn').value);
    };
    $('edBack').onclick = () => { keep(); host.hidden = true; host.innerHTML = ''; cx.onClose(); };
    window.addEventListener('resize', draw); draw(); msg(L('パレットからえらんで、画面をなぞって描こう。スタート(P)とゴール(G)は1つずつ。', 'Pick from the palette and drag on the grid. One start (P) and one goal (G).'));
  }
  function markCleared(d) { if (ST) ST.cleared = encode(d); }
  API.open = open; API.markCleared = markCleared; API.state = () => ST;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  root.HopEditor = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
