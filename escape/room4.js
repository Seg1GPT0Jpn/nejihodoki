// からくり工房からの脱出：部屋4「倉庫」（重さとつり合い・地図・形・絵合わせ）
// なぞ：長ぐつ（2の重り）・道具箱（5の重り。使わない）・メモの地図 → 床の C3（10の重り）・木箱の番号と形 → かんの錠（1の重り）
//       → はかり（小包13 ＝ 10＋2＋1）→ レバー → シャッター → 絵合わせ（紋章）→ 扉
(function (root) {
  'use strict';
  const ER = root.EscapeRooms;
  if (root.KoboI18n) KoboI18n.add({ en: {
    '倉庫': 'The Storeroom',
    '倉庫。木箱と道具がぎっしり積まれている。親方はここで、からくりの部品をこしらえていた。': 'The storeroom, packed with crates and tools. This is where the Master made the parts for the gadgets.',
    '工房の紋章がそろうと、大きな扉がゆっくりひらいた。きしむ階段の上は、屋根裏だ。': 'With the workshop crest complete, the big door slowly opens. Creaking stairs lead up to the attic.',
    '倉庫のメモ\n\nはかりは、ぴったり釣り合ったときだけ引き出しが開く。\n重りの1つは、床下にしまった（×の場所）。': 'Storeroom note\n\nThe scale opens its drawer only when it balances exactly.\nI hid one weight under the floor (at the ×).',
    '1の重り': 'Weight 1', '2の重り': 'Weight 2', '5の重り': 'Weight 5', '10の重り': 'Weight 10', '真ちゅうの重り。数字が刻んである': 'A brass weight with a number stamped on it',
    'レバー': 'Lever', '何かにさして回す、鉄のレバー': 'An iron lever to fit into something and turn',
    '長ぐつ': 'The boots', '床の地図': 'The floor map', 'かんの形の錠': 'The shape lock on the tin', 'はかり': 'The scale', '扉のシャッター': 'The shutter on the door', '絵合わせの錠': 'The picture lock',
    '棚の横に長ぐつがある': 'There are boots next to the shelf', '長ぐつの中をのぞくと…': 'Look inside the boots…', '棚の壁で、長ぐつをタップ': 'On the shelf wall, tap the boots',
    'かべのメモに、床の地図と×の印': 'The note on the wall has a floor map with an ×', '床には A〜D と 1〜4 の文字が書いてある': 'The floor is marked A–D and 1–4',
    '床に近づき、C の列と 3 の行が交わる板をタップ': 'Look at the floor and tap the board where column C meets row 3',
    'かんのふたには、1〜4の番号の木箱の絵': 'The tin lid shows crates numbered 1 to 4', '床の木箱には、番号と形が描いてある': 'The crates on the floor have numbers and shapes',
    '1▲ 2■ 3● 4◆ の順にする': 'Set them to 1▲ 2■ 3● 4◆',
    'はかりは、ぴったり釣り合うと引き出しが開く（メモ）': 'The scale opens its drawer when it balances exactly (the note)', '重りを右の皿にのせると、どちらが重いかわかる。のせた重りは皿をタップで戻る': 'Put weights on the right pan to see which side is heavier. Tap the pan to take them back',
    '小包の重さは13。10と2と1をのせる': 'The parcel weighs 13. Put 10, 2 and 1 on the pan',
    '扉の錠はシャッターでおおわれている': 'The door lock is behind a shutter', 'シャッターの横の穴に、何かをさして回す': 'Something fits into the hole beside the shutter', 'はかりの引き出しのレバーを選んで、シャッターの穴をタップ': 'Select the lever from the scale drawer and tap the hole by the shutter',
    '扉の上の紋章と同じ絵にする': 'Make the same picture as the crest above the door', '空いているマスのとなりの板をタップすると動く。板の小さな数字の順に並べてもよい': 'Tap a tile next to the gap to slide it. The small numbers on the tiles give the order too',
    '左上から 1〜8、右下を空ける。角から順にそろえていく': '1 to 8 from the top left with the gap at the bottom right. Fix the corners first',
    '大きな扉。まん中にシャッター付きの錠の箱': 'A big door with a shuttered lock box in the middle', '扉の上の紋章。工房のしるしだ': 'The crest above the door: the sign of the workshop',
    'シャッターの横に、レバーをさす穴がある': 'There is a hole for a lever beside the shutter', 'シャッターが上がった！絵合わせの錠だ': 'The shutter rolls up! A picture lock',
    '錠が開いた！': 'The lock opens!', '封をされた小包。重さはわからない': 'A sealed parcel. Its weight is unknown', '右の皿。重りをのせられる': 'The right pan. Weights go here',
    'はかりが釣り合った！引き出しが開いた': 'The scale balances! The drawer opens', '引き出しはからっぽ': 'The drawer is empty',
    '古い長ぐつ': 'Old boots', '道具箱': 'A toolbox', '道具箱には、もう何もない': 'Nothing else in the toolbox',
    'しっかりした床板だ': 'A solid floorboard', '木箱。形と数字が描いてある': 'A crate with a shape and a number painted on it', '床板が外れた！': 'The floorboard comes up!',
    'かんのふたに、番号の付いた木箱の絵': 'The tin lid shows numbered crates', 'かんが開いた！': 'The tin opens!', 'かんはからっぽ': 'The tin is empty',
    '棚に古い道具が並んでいる': 'Old tools line the shelf', 'こむぎが木箱の上で眠っている': 'Komugi is asleep on a crate', '床に木箱が置いてある': 'Crates stand on the floor',
  } });

  ER.defs[3] = (K, A, H) => {
    const T = K.T, { spot, circ } = H;
    const PAL = { wall: '#8a6440', pattern: 'plank', floor: '#6a5e52', fy: 236 };
    const end = c => A.vignette(c, 0.45);
    const meow = () => K.tone(760, 0.16, { type: 'triangle', vol: 0.06, slide: 520 });
    const W = { w1: 1, w2: 2, w5: 5, w10: 10 }, PARCEL = 13;
    function weight(c, x, y, s, n) {
      const w = s * (0.5 + Math.min(1, n / 10) * 0.32), h = s * (0.36 + Math.min(1, n / 10) * 0.3);
      A.shadow(c, x, y + h / 2, w * 0.6, 3, 0.3);
      A.rr(c, x - w / 2, y - h / 2, w, h, 4); c.fillStyle = A.lg(c, x - w / 2, 0, x + w / 2, 0, ['#8a5e12', '#f6d070', '#c8962e', '#8a5e12']); c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#4a3008'; c.stroke();
      A.brass(c, x - w * 0.14, y - h / 2 - s * 0.1, w * 0.28, s * 0.12, 2);
      A.text(c, String(n), x, y + 1, { size: Math.max(8, h * 0.6), color: '#3a2406' });
    }
    function lever(c, s) { c.save(); c.translate(s * 0.2, s * 0.75); c.rotate(-0.8); c.fillStyle = A.lg(c, 0, -3, 0, 3, ['#d8dde2', '#6d7a84']); c.fillRect(0, -s * 0.05, s * 0.7, s * 0.1); c.strokeStyle = A.INK; c.lineWidth = 1.2; c.strokeRect(0, -s * 0.05, s * 0.7, s * 0.1); A.rr(c, -s * 0.1, -s * 0.09, s * 0.2, s * 0.18, 3); c.fillStyle = '#c8402a'; c.fill(); c.stroke(); c.fillStyle = '#6d7a84'; c.fillRect(s * 0.66, -s * 0.12, s * 0.08, s * 0.24); c.restore(); }
    const items = {
      w1: { name: '1の重り', desc: '真ちゅうの重り。数字が刻んである', icon: (c, s) => weight(c, s / 2, s * 0.56, s, 1) },
      w2: { name: '2の重り', desc: '真ちゅうの重り。数字が刻んである', icon: (c, s) => weight(c, s / 2, s * 0.56, s, 2) },
      w5: { name: '5の重り', desc: '真ちゅうの重り。数字が刻んである', icon: (c, s) => weight(c, s / 2, s * 0.56, s, 5) },
      w10: { name: '10の重り', desc: '真ちゅうの重り。数字が刻んである', icon: (c, s) => weight(c, s / 2, s * 0.56, s, 10) },
      lever: { name: 'レバー', desc: '何かにさして回す、鉄のレバー', icon: lever },
    };
    // --- floor grid (top view) ---
    const FX = 110, FY = 36, FC = 52;
    const CRATES = [{ c: 0, r: 0, n: 1, k: 'tri' }, { c: 3, r: 1, n: 2, k: 'square' }, { c: 1, r: 3, n: 3, k: 'circle' }, { c: 3, r: 3, n: 4, k: 'diamond' }];
    const HID = [2, 2]; // C3
    const SHAPES = ['circle', 'tri', 'square', 'diamond'], TIN_GOAL = [1, 2, 0, 3];
    const SHCOL = { circle: '#e8604a', tri: '#e8b830', square: '#4a9ae8', diamond: '#6ac85a' };
    function crateTop(c, x, y, s, cr) {
      A.wood(c, x, y, s, s, '#a87a48', { r: 3 });
      c.strokeStyle = A.rgba('#3a2618', 0.6); c.lineWidth = 2; c.strokeRect(x + 5, y + 5, s - 10, s - 10); c.beginPath(); c.moveTo(x + 5, y + 5); c.lineTo(x + s - 5, y + s - 5); c.stroke();
      A.circle(c, x + s / 2, y + s / 2, s * 0.3, '#f3e6c8', A.INK, 1.2);
      A.sym(c, cr.k, x + s * 0.4, y + s * 0.5, s * 0.3, SHCOL[cr.k], { lw: 1.2 });
      A.text(c, String(cr.n), x + s * 0.66, y + s * 0.52, { size: s * 0.26, color: '#3a2618' });
    }
    // --- the sliding picture ---
    const SX = 122, SY = 56, SC = 52;
    const solved = t => t.every((v, i) => v === i);
    function slideMoves(S) {
      const start = S.tiles.join(''), goal = '012345678';
      if (start === goal) return [];
      const prev = { [start]: null }, q = [start];
      for (let h = 0; h < q.length; h++) {
        const s = q[h]; if (s === goal) break;
        const e = s.indexOf('8'), r = Math.floor(e / 3), col = e % 3;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = col + dc; if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue;
          const n = nr * 3 + nc, a = s.split(''); a[e] = a[n]; a[n] = '8'; const t = a.join('');
          if (!(t in prev)) { prev[t] = [s, n]; q.push(t); }
        }
      }
      const out = []; let s = goal; while (prev[s]) { out.unshift(prev[s][1]); s = prev[s][0]; }
      return out;
    }
    function drawTiles(c, S) {
      c.fillStyle = '#1a120c'; c.fillRect(SX - 4, SY - 4, 3 * SC + 8, 3 * SC + 8);
      S.tiles.forEach((id, pos) => {
        if (id === 8 && !S.slideOK) return;
        const x = SX + (pos % 3) * SC, y = SY + Math.floor(pos / 3) * SC, sx = (id % 3) * SC, sy = Math.floor(id / 3) * SC;
        c.save(); c.beginPath(); c.rect(x + 1, y + 1, SC - 2, SC - 2); c.clip(); A.crest(c, x - sx, y - sy, 3 * SC); c.restore();
        c.strokeStyle = A.INK; c.lineWidth = 1.5; c.strokeRect(x + 1, y + 1, SC - 2, SC - 2);
        if (!S.slideOK) { A.circle(c, x + 9, y + 9, 7, A.rgba('#fff3d8', 0.85)); A.text(c, String(id + 1), x + 9, y + 9.5, { size: 9, color: '#3a2618' }); }
      });
    }

    const views = {
      w0: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.light(c, 200, 30, 160, '#ffd8a0', 0.2);
          A.frame(c, 172, 6, 56, 44, '#5a3a22', '#1b3046'); A.crest(c, 177, 11, 46);
          if (S.slideOK) { A.door(c, 118, 56, 82, 180, '#6a4a2e', { open: true }); A.door(c, 200, 56, 82, 180, '#6a4a2e', { open: true }); }
          else {
            A.wood(c, 112, 50, 176, 186, '#4a3220', { r: 2 });
            A.wood(c, 118, 56, 82, 180, '#7a5636', { r: 2, vert: true }); A.wood(c, 200, 56, 82, 180, '#7a5636', { r: 2, vert: true });
            c.strokeStyle = '#3a2618'; c.lineWidth = 6; for (const y of [80, 210]) { c.beginPath(); c.moveTo(118, y); c.lineTo(282, y); c.stroke(); }
            A.box(c, 174, 104, 52, 56, '#5d6a74', { r: 4 });
            if (S.shutterUp) { c.save(); c.translate(178, 110); c.scale(44 / 400 * 2.2, 44 / 300 * 2.2); c.restore(); c.fillStyle = '#1b3046'; c.fillRect(180, 112, 40, 40); A.crest(c, 182, 114, 36); }
            else { c.fillStyle = A.lg(c, 0, 110, 0, 154, ['#c0c6cc', '#7d868e']); c.fillRect(180, 110, 40, 44); c.strokeStyle = A.rgba('#2b3036', 0.5); c.lineWidth = 1; for (let y = 114; y < 154; y += 5) { c.beginPath(); c.moveTo(180, y); c.lineTo(220, y); c.stroke(); } }
          }
          A.wood(c, 20, 170, 66, 66, '#a87a48', { r: 3 }); A.wood(c, 30, 120, 50, 50, '#9a6a3e', { r: 3 }); A.wood(c, 320, 180, 60, 56, '#a87a48', { r: 3 });
          end(c);
        },
        spots: S => [
          spot('crates', 18, 118, 70, 120, { say: '床に木箱が置いてある' }),
          spot('door', 112, 50, 176, 186, { tap: () => { if (S.slideOK) K.exit(); else K.say('大きな扉。まん中にシャッター付きの錠の箱'); } }),
          spot('crest', 170, 4, 60, 48, { go: 'crest4' }),
          ...(S.slideOK ? [] : [spot('lock', 170, 100, 60, 64, { go: 'shut4' })]),
        ],
      },
      w1: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.wood(c, 30, 40, 340, 8, '#5a3a22'); [['#7a3a3a', 40], ['#3a5a7a', 70], ['#5a7a3a', 300], ['#8a6a2a', 330]].forEach(([col, x]) => A.box(c, x, 14, 24, 26, col, { r: 2 }));
          A.wood(c, 30, 172, 340, 14, '#6a4a2e', { r: 2 }); A.wood(c, 40, 186, 320, 50, '#5a3a22', { r: 0 });
          c.save(); c.translate(100, 40); c.scale(200 / 400, 132 / 300); drawScale(c, S, true); c.restore();
          end(c);
        },
        spots: S => [spot('scale', 96, 40, 208, 148, { go: 'scale4' })],
      },
      w2: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.paper(c, 300, 54, 52, 66, 0.04); A.box(c, 312, 50, 28, 8, '#8a8f96', { r: 2 });
          c.strokeStyle = A.rgba(A.INK, 0.5); c.lineWidth = 0.8; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(308 + i * 8, 66); c.lineTo(308 + i * 8, 98); c.stroke(); c.beginPath(); c.moveTo(308, 66 + i * 8); c.lineTo(340, 66 + i * 8); c.stroke(); }
          c.strokeStyle = '#c8402a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(325, 83); c.lineTo(331, 89); c.moveTo(331, 83); c.lineTo(325, 89); c.stroke();
          // floor in perspective: a painted grid and crates
          c.save(); c.beginPath(); c.moveTo(60, 236); c.lineTo(340, 236); c.lineTo(392, 296); c.lineTo(8, 296); c.closePath(); c.fillStyle = A.rgba('#3a3028', 0.35); c.fill(); c.restore();
          const P = (u, v) => [200 + (u - 2) * (70 + v * 12), 236 + v * 15];
          c.strokeStyle = A.rgba('#f3e6c8', 0.5); c.lineWidth = 1.2;
          for (let i = 0; i <= 4; i++) { const [a, b] = P(0, i), [d, e] = P(4, i); c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); const [g, h] = P(i, 0), [k, l] = P(i, 4); c.beginPath(); c.moveTo(g, h); c.lineTo(k, l); c.stroke(); }
          for (const cr of CRATES) { const [x, y] = P(cr.c + 0.5, cr.r + 0.5); A.wood(c, x - 18 - cr.r * 2, y - 26 - cr.r, 36 + cr.r * 4, 30 + cr.r * 2, '#a87a48', { r: 3 }); A.sym(c, cr.k, x, y - 12, 12, SHCOL[cr.k], { lw: 1 }); }
          A.cat(c, 330, 194, 44, t, '#e8a95a');
          end(c);
        },
        spots: S => [
          spot('clip', 296, 46, 60, 80, { go: 'clip4' }),
          spot('floor', 10, 200, 380, 100, { go: 'floor4' }),
          spot('cat', 304, 168, 54, 34, { tap: () => { meow(); K.say('こむぎが木箱の上で眠っている'); } }),
        ],
      },
      w3: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.wood(c, 46, 60, 8, 176, '#5a3a22'); A.wood(c, 246, 60, 8, 176, '#5a3a22');
          for (const y of [96, 196]) A.wood(c, 40, y, 220, 9, '#6a4a2e', { r: 1 });
          for (let i = 0; i < 5; i++) { A.box(c, 62 + i * 34, 70 + (i % 2) * 6, 22, 26 - (i % 2) * 6, ['#7a7a7a', '#a86a3a', '#5a6a8a', '#8a7a5a', '#6a8a6a'][i], { r: 3 }); }
          // toolbox
          A.box(c, 66, 162, 84, 34, '#c8402a', { r: 4 }); c.strokeStyle = A.INK; c.lineWidth = 3; c.beginPath(); c.moveTo(92, 162); c.lineTo(96, 150); c.lineTo(120, 150); c.lineTo(124, 162); c.stroke();
          if (!S.got.w5) weight(c, 108, 156, 22, 5);
          // tin
          A.box(c, 172, 166, 60, 30, '#4a7a9a', { r: 6 }); A.box(c, 170, 160, 64, 10, '#5a8aaa', { r: 4 });
          if (S.tinOpen) { c.fillStyle = '#1a120c'; c.fillRect(176, 164, 52, 6); }
          // boots
          for (const bx of [292, 326]) { A.rr(c, bx, 196, 24, 40, 6); c.fillStyle = A.lg(c, bx, 196, bx + 24, 236, ['#3a5a3a', '#1f3a22']); c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.4; c.stroke(); A.rr(c, bx - 2, 224, 36, 14, 6); c.fill(); c.stroke(); }
          end(c);
        },
        spots: S => [
          spot('shelf', 40, 60, 220, 40, { say: '棚に古い道具が並んでいる' }),
          spot('toolbox', 62, 140, 92, 58, { tap: () => { if (!S.got.w5) K.give('w5'); else K.say('道具箱には、もう何もない'); } }),
          spot('tin', 166, 150, 72, 50, { go: 'tin4' }),
          spot('boots', 284, 190, 84, 50, { tap: () => { if (!S.got.w2) K.give('w2'); else K.say('古い長ぐつ'); } }),
        ],
      },
      crest4: { back: 'w0', draw(c) { A.zoomBg(c, '#8a6440'); A.frame(c, 110, 30, 180, 180, '#5a3a22', '#1b3046'); A.crest(c, 120, 40, 160); A.zoomEnd(c); }, spots: () => [spot('crest', 110, 30, 180, 180, { say: '扉の上の紋章。工房のしるしだ' })] },
      shut4: {
        back: 'w0',
        draw(c, S) {
          A.zoomBg(c, '#7a5636');
          A.box(c, 90, 30, 220, 236, '#5d6a74', { r: 10 });
          if (!S.shutterUp) {
            c.fillStyle = A.lg(c, 0, 50, 0, 230, ['#d0d6dc', '#7d868e']); c.fillRect(112, 50, 176, 172);
            c.strokeStyle = A.rgba('#2b3036', 0.5); c.lineWidth = 1.4; for (let y = 58; y < 222; y += 10) { c.beginPath(); c.moveTo(112, y); c.lineTo(288, y); c.stroke(); }
            A.circle(c, 330, 150, 16, '#2b3036', A.INK, 2); c.fillStyle = '#6d7a84'; c.fillRect(326, 142, 8, 16);
          } else drawTiles(c, S);
          A.zoomEnd(c);
        },
        spots: S => {
          if (!S.shutterUp) return [spot('shutter', 112, 50, 176, 172, { say: 'シャッターの横に、レバーをさす穴がある' }),
            circ('socket', 330, 150, 30, { use: it => { if (it !== 'lever') return false; S.shutterUp = 1; K.take('lever'); K.ok(); K.anim(400); K.say('シャッターが上がった！絵合わせの錠だ'); return true; }, tap: () => K.say('シャッターの横に、レバーをさす穴がある') })];
          const l = [];
          for (let pos = 0; pos < 9; pos++) l.push(spot('tile' + pos, SX + (pos % 3) * SC, SY + Math.floor(pos / 3) * SC, SC, SC, { tap: () => {
            if (S.slideOK) return;
            const e = S.tiles.indexOf(8), er = Math.floor(e / 3), ec = e % 3, r = Math.floor(pos / 3), cc = pos % 3;
            if (Math.abs(er - r) + Math.abs(ec - cc) !== 1) { K.sfx('fail'); return; }
            S.tiles[e] = S.tiles[pos]; S.tiles[pos] = 8; K.sfx('move');
            if (solved(S.tiles)) { S.slideOK = 1; K.ok(); K.say('錠が開いた！'); }
          } }));
          return l;
        },
      },
      scale4: {
        back: 'w1',
        draw(c, S) { drawScale(c, S, false); A.zoomEnd(c); },
        spots: S => {
          const l = [spot('lpan', 30, 110, 140, 120, { say: '封をされた小包。重さはわからない' }),
            spot('rpan', 230, 110, 140, 120, {
              use: it => { if (!(it in W) || S.scaleOK) return false; S.pan.push(it); K.take(it); K.sfx('drop'); K.anim(500); if (S.pan.reduce((a, k) => a + W[k], 0) === PARCEL) { S.scaleOK = 1; K.ok(); K.say('はかりが釣り合った！引き出しが開いた'); } return true; },
              tap: () => { if (S.pan.length && !S.scaleOK) { for (const k of S.pan) K.give(k); S.pan = []; K.anim(500); } else K.say('右の皿。重りをのせられる'); },
            })];
          if (S.scaleOK && !S.got.lever) l.push(spot('lever', 150, 244, 100, 50, { tap: () => K.give('lever') }));
          return l;
        },
      },
      clip4: {
        back: 'w2',
        draw(c) {
          A.zoomBg(c, '#8a6440');
          A.paper(c, 56, 12, 288, 276, 0.01); A.box(c, 160, 6, 80, 18, '#8a8f96', { r: 4 });
          A.fitWrap(c, T('倉庫のメモ\n\nはかりは、ぴったり釣り合ったときだけ引き出しが開く。\n重りの1つは、床下にしまった（×の場所）。'), 76, 34, 248, 124, { size: 13 });
          const gx = 140, gy = 176, gs = 24;
          ['A', 'B', 'C', 'D'].forEach((L, i) => A.text(c, L, gx + i * gs + gs / 2, gy - 9, { size: 12 }));
          [1, 2, 3, 4].forEach((n, i) => A.text(c, String(n), gx - 10, gy + i * gs + gs / 2, { size: 12 }));
          c.strokeStyle = A.INK; c.lineWidth = 1.2; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(gx + i * gs, gy); c.lineTo(gx + i * gs, gy + 4 * gs); c.stroke(); c.beginPath(); c.moveTo(gx, gy + i * gs); c.lineTo(gx + 4 * gs, gy + i * gs); c.stroke(); }
          const xx = gx + HID[0] * gs + gs / 2, xy = gy + HID[1] * gs + gs / 2; c.strokeStyle = '#c8402a'; c.lineWidth = 3; c.beginPath(); c.moveTo(xx - 7, xy - 7); c.lineTo(xx + 7, xy + 7); c.moveTo(xx + 7, xy - 7); c.lineTo(xx - 7, xy + 7); c.stroke();
          for (const cr of CRATES) { c.fillStyle = A.rgba('#a87a48', 0.7); c.fillRect(gx + cr.c * gs + 4, gy + cr.r * gs + 4, gs - 8, gs - 8); }
          A.zoomEnd(c);
        },
        spots: () => [],
      },
      floor4: {
        back: 'w2',
        draw(c, S) {
          A.zoomBg(c, '#6a5e52');
          c.fillStyle = '#5a5046'; c.fillRect(FX - 8, FY - 8, 4 * FC + 16, 4 * FC + 16);
          for (let col = 0; col < 4; col++) for (let r = 0; r < 4; r++) {
            const x = FX + col * FC, y = FY + r * FC;
            A.wood(c, x + 1, y + 1, FC - 2, FC - 2, (col + r) % 2 ? '#8a6a48' : '#7e6040', { r: 2 });
            if (col === HID[0] && r === HID[1] && S.board) { c.fillStyle = '#1a120c'; c.fillRect(x + 4, y + 4, FC - 8, FC - 8); if (!S.got.w10) weight(c, x + FC / 2, y + FC / 2 + 4, 38, 10); }
          }
          ['A', 'B', 'C', 'D'].forEach((L, i) => A.text(c, L, FX + i * FC + FC / 2, FY - 18, { size: 16, color: '#f3e6c8', stroke: '#2a1a10', lw: 3 }));
          [1, 2, 3, 4].forEach((n, i) => A.text(c, String(n), FX - 22, FY + i * FC + FC / 2, { size: 16, color: '#f3e6c8', stroke: '#2a1a10', lw: 3 }));
          for (const cr of CRATES) crateTop(c, FX + cr.c * FC + 3, FY + cr.r * FC + 3, FC - 6, cr);
          A.zoomEnd(c);
        },
        spots: S => {
          const l = [];
          for (let col = 0; col < 4; col++) for (let r = 0; r < 4; r++) {
            const id = 'f' + 'ABCD'[col] + (r + 1), x = FX + col * FC, y = FY + r * FC;
            const crate = CRATES.find(cr => cr.c === col && cr.r === r);
            l.push(spot(id, x, y, FC, FC, { tap: () => {
              if (crate) { K.say('木箱。形と数字が描いてある'); return; }
              if (col === HID[0] && r === HID[1]) { if (!S.board) { S.board = 1; K.sfx('drop'); K.say('床板が外れた！'); } else if (!S.got.w10) K.give('w10'); else K.say('しっかりした床板だ'); return; }
              K.say('しっかりした床板だ');
            } }));
          }
          return l;
        },
      },
      tin4: {
        back: 'w3',
        draw(c, S) {
          A.zoomBg(c, '#8a6440', { table: 250, tableCol: '#6a4a2e' });
          A.box(c, 60, 30, 280, 240, '#4a7a9a', { r: 18 });
          if (S.tinOpen) { A.rr(c, 80, 50, 240, 200, 12); c.fillStyle = '#1a120c'; c.fill(); if (!S.got.w1) weight(c, 200, 150, 60, 1); }
          else {
            A.rr(c, 78, 44, 244, 74, 10); c.fillStyle = '#6a9aba'; c.fill();
            for (let i = 0; i < 4; i++) { const x = 104 + i * 64; A.sym(c, 'crate', x, 80, 40, '#c8a070', { lw: 1.4 }); A.circle(c, x, 80, 11, '#f3e6c8', A.INK, 1.2); A.text(c, String(i + 1), x, 81, { size: 13 }); }
            for (let i = 0; i < 4; i++) { const x = 104 + i * 64; A.circle(c, x, 190, 28, A.rg(c, x - 8, 182, 2, 30, ['#f6efe0', '#c8b896']), A.INK, 2); A.sym(c, SHAPES[S.tin[i]], x, 190, 30, SHCOL[SHAPES[S.tin[i]]], { lw: 1.6 }); A.arrow(c, x, 236, 'D', 18); }
          }
          A.zoomEnd(c);
        },
        spots: S => {
          if (S.tinOpen) return [spot('tin', 60, 30, 280, 240, { say: 'かんはからっぽ' }), ...(!S.got.w1 ? [spot('w1', 160, 110, 80, 80, { tap: () => K.give('w1') })] : [])];
          const l = [spot('lid', 60, 30, 280, 100, { say: 'かんのふたに、番号の付いた木箱の絵' })];
          for (let i = 0; i < 4; i++) l.push(spot('t' + i, 104 + i * 64 - 30, 156, 60, 92, { tap: () => { S.tin[i] = (S.tin[i] + 1) % 4; K.sfx('tap'); if (S.tin.every((v, j) => v === TIN_GOAL[j])) { S.tinOpen = 1; K.ok(); K.say('かんが開いた！'); } } }));
          return l;
        },
      },
    };
    function drawScale(c, S, small) {
      A.zoomBg(c, '#8a6440', { table: 236, tableCol: '#6a4a2e' });
      const sum = S.pan.reduce((a, k) => a + W[k], 0);
      const ang = S.scaleOK ? 0 : Math.max(-0.22, Math.min(0.22, (sum - PARCEL) * 0.04));
      A.box(c, 190, 70, 20, 166, '#c8962e', { r: 4 }); A.box(c, 150, 220, 100, 18, '#a87a28', { r: 4 });
      c.save(); c.translate(200, 70); c.rotate(ang);
      A.brass(c, -110, -5, 220, 10, 4);
      c.restore();
      A.circle(c, 200, 70, 10, '#e6b84e', '#5a3a0c', 1.6);
      const ends = [-1, 1].map(d => [200 + Math.cos(ang) * 105 * d, 70 + Math.sin(ang) * 105 * d]);
      ends.forEach(([x, y], i) => {
        c.strokeStyle = '#5a3a0c'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 50, y + 90); c.moveTo(x, y); c.lineTo(x + 50, y + 90); c.stroke();
        c.beginPath(); c.ellipse(x, y + 92, 58, 12, 0, 0, Math.PI * 2); c.fillStyle = A.lg(c, 0, y + 80, 0, y + 104, ['#fff1b8', '#b8801e']); c.fill(); c.stroke();
        if (i === 0) { A.box(c, x - 30, y + 56, 60, 36, '#c8a878', { r: 3 }); c.strokeStyle = '#7a3a2a'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y + 56); c.lineTo(x, y + 92); c.moveTo(x - 30, y + 74); c.lineTo(x + 30, y + 74); c.stroke(); A.circle(c, x, y + 74, 6, '#c8402a', A.INK, 1); A.text(c, '?', x - 15, y + 66, { size: 12 }); }
        else S.pan.forEach((k, j) => weight(c, x - 34 + j * 30, y + 78, 30, W[k]));
      });
      // drawer under the scale
      A.wood(c, 140, 246, 120, 44, '#7a5636', { r: 4 });
      if (S.scaleOK) { A.wood(c, 134, 256, 132, 44, '#8a6440', { r: 4 }); if (!S.got.lever) { c.save(); c.translate(170, 236); lever(c, 60); c.restore(); } }
      else A.brass(c, 186, 262, 28, 8, 3);
    }

    return {
      id: 'r4', name: '倉庫', par: 14 * 60000,
      intro: '倉庫。木箱と道具がぎっしり積まれている。親方はここで、からくりの部品をこしらえていた。',
      outro: '工房の紋章がそろうと、大きな扉がゆっくりひらいた。きしむ階段の上は、屋根裏だ。',
      init: () => ({ got: {}, tin: [0, 0, 0, 0], tinOpen: 0, board: 0, pan: [], scaleOK: 0, shutterUp: 0, tiles: [5, 0, 2, 1, 8, 7, 4, 3, 6], slideOK: 0 }),
      items, views, combos: [], slideMoves,
      puzzles: [
        { id: 'boots', name: '長ぐつ', done: S => !!S.got.w2, hints: ['棚の横に長ぐつがある', '長ぐつの中をのぞくと…', '棚の壁で、長ぐつをタップ'] },
        { id: 'floor', name: '床の地図', done: S => !!S.got.w10, hints: ['かべのメモに、床の地図と×の印', '床には A〜D と 1〜4 の文字が書いてある', '床に近づき、C の列と 3 の行が交わる板をタップ'] },
        { id: 'tin', name: 'かんの形の錠', done: S => !!S.tinOpen, hints: ['かんのふたには、1〜4の番号の木箱の絵', '床の木箱には、番号と形が描いてある', '1▲ 2■ 3● 4◆ の順にする'] },
        { id: 'scale', name: 'はかり', done: S => !!S.scaleOK, hints: ['はかりは、ぴったり釣り合うと引き出しが開く（メモ）', '重りを右の皿にのせると、どちらが重いかわかる。のせた重りは皿をタップで戻る', '小包の重さは13。10と2と1をのせる'] },
        { id: 'shutter', name: '扉のシャッター', avail: S => !!S.scaleOK, done: S => !!S.shutterUp, hints: ['扉の錠はシャッターでおおわれている', 'シャッターの横の穴に、何かをさして回す', 'はかりの引き出しのレバーを選んで、シャッターの穴をタップ'] },
        { id: 'slide', name: '絵合わせの錠', avail: S => !!S.shutterUp, done: S => !!S.slideOK, hints: ['扉の上の紋章と同じ絵にする', '空いているマスのとなりの板をタップすると動く。板の小さな数字の順に並べてもよい', '左上から 1〜8、右下を空ける。角から順にそろえていく'] },
      ],
      route: ['s:crest', 'B', 'w:3', 's:boots', 's:toolbox', 's:tin', 's:t0', 's:t1', 's:t1', 's:t3', 's:t3', 's:t3', 's:w1', 'B', 'w:2', 's:clip', 'B', 's:floor', 's:fC3', 's:fC3', 'B',
        'w:1', 's:scale', 'i:w10', 's:rpan', 'i:w2', 's:rpan', 'i:w1', 's:rpan', 's:lever', 'B', 'w:0', 's:lock', 'i:lever', 's:socket', 'slide', 'B', 's:door'],
    };
  };
})(window);
