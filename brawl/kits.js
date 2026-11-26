// おもちゃ大乱闘（brawl）のキャラクターの「データ」：どの技・どの数値か、だけを持つ。動かし方は engine.js、絵は art.js。
// node でもブラウザでも動く（window.BrawlKits）。乱数・時刻は使わない（engine.js が読み込んで試合の元にするため、決まった結果の一部）。
//   CH         ：おもちゃ（と、ボス）の定義。kit＝ふつうの技12個とその他の「くせ」、sp＝4つのとくぎ（kind は engine.js の種類表か defineKind で足した種類）
//   META       ：あとから足す印（arch＝タイプ、sig＝そのおもちゃだけの目玉、tm＝なげの強さ、gx＝つかみの大きさ、ul＝開き方）
//   TPL        ：技のひな形（kit.tpl に名前を書くと、ふつうの技の長さ・当たり判定・ふっとばしの下地になる。kit.ov が上書き）
//   palettes() / assignPalettes() ：色ちがい（見た目だけ。試合の状態には入らない）
(function (root) {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sp = (o) => Object.assign({ kind: 'melee', fx: 'body', sm: 0, ll: 0, s: 8, a: 4, t: 36, dmg: 5, bkb: 10, kbg: 10, ang: 40, hb: [] }, o);
  const CH = {
    robo: { id: 'robo', name: { ja: 'ぜんまいロボ ギアン', en: 'Gearo the Wind-up Robot' }, short: { ja: 'ギアン', en: 'Gearo' }, tag: { ja: 'バランスがよい', en: 'All-rounder' },
      desc: { ja: '背中のぜんまいで動くブリキのロボ。クセがなく、飛び道具とパンチで戦う。「ねじまき」で一時的に強くなる。', en: 'A tin robot driven by the key on its back. No quirks: gears, rocket fists, and a "wind-up" power-up.' },
      color: '#e0613a', color2: '#f3b441', w: 30, h: 56, weight: 100, run: 3.7, acc: 0.55, air: 2.9, aacc: 0.2, jump: 11.0, dj: 10.0, grav: 0.44, fall: 8.6, ff: 12.8, stats: { speed: 3, power: 3, weight: 3, reach: 3, recov: 3 },
      kit: { reach: 0.95, sp: 1.05, pw: 0.99, rr: 1, fx: 'punch', ov: { jab: { sp: 0.85 }, ftilt: { fx: 'punch' }, nair: { fx: 'spin' }, dair: { fx: 'kick' }, bair: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'proj', fx: 'cast', s: 10, a: 1, t: 30, proj: { sp: 7.6, vy: 0, g: 0, r: 9, life: 70, dmg: 5, bkb: 10, kbg: 10, ang: 20, kind: 'gear' } }),
        S: sp({ kind: 'proj', fx: 'cast', s: 18, a: 1, t: 52, proj: { sp: 6.2, vy: 0, g: 0, r: 15, life: 50, dmg: 10, bkb: 22, kbg: 28, ang: 30, kind: 'fist' } }),
        U: sp({ kind: 'rise', fx: 'prop', s: 6, a: 24, t: 44, rv: 11.2, dv: 2.6, ang: 80, dmg: 5, bkb: 22, kbg: 22, hb: [[0, -64, 0, -64, 20]] }),
        D: sp({ kind: 'buff', fx: 'key', s: 10, a: 1, t: 40, buff: 480 }),
      } },
    duck: { id: 'duck', name: { ja: 'アヒル騎士 サー・クワック', en: 'Sir Quack, Duck Knight' }, short: { ja: 'クワック', en: 'Sir Quack' }, tag: { ja: 'リーチと反撃', en: 'Long reach, counters' },
      desc: { ja: 'ゴムのアヒルの騎士。剣のリーチが長く、盾で押し込む。「カウンター」で相手の技をはね返す。', en: 'A rubber-duck knight. Long sword reach, a shield bash with armor, and a counter that turns hits around.' },
      color: '#f2d13c', color2: '#5b7fc9', w: 32, h: 58, weight: 108, run: 3.4, acc: 0.5, air: 2.7, aacc: 0.2, jump: 10.8, dj: 9.7, grav: 0.45, fall: 8.8, ff: 13, stats: { speed: 2, power: 3, weight: 4, reach: 5, recov: 3 },
      kit: { reach: 1.4, sp: 1.08, pw: 1.1, rr: 1.05, fx: 'slash', ov: { jab: { fx: 'slash', reach: 1.1 }, utilt: { fx: 'slash' }, dtilt: { fx: 'kick' }, nair: { fx: 'spin' }, dair: { fx: 'slash' }, bair: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'dash', fx: 'slash', s: 8, a: 6, t: 32, v: 7, dmg: 8, bkb: 18, kbg: 24, ang: 40, hb: [[30, -30, 62, -28, 15]] }),
        S: sp({ kind: 'dash', fx: 'shield', s: 14, a: 8, t: 46, v: 5.5, dmg: 13, bkb: 24, kbg: 34, ang: 38, arm: [8, 22], hb: [[26, -28, 40, -28, 26]] }),
        U: sp({ rr: 145, kind: 'multihop', fx: 'slash', s: 5, a: 1, t: 52, n: 3, g: 13, rv: 7.4, dv: 2.6, dmg: 0, hb: [] }),
        D: sp({ kind: 'counter', fx: 'shield', s: 4, a: 20, t: 54, cf: 24, cs: 4, ca: 4, dmg: 8, bkb: 26, kbg: 34, ang: 40, hb: [[34, -30, 62, -28, 24]] }),
      } },
    tin: { id: 'tin', name: { ja: 'ブリキ兵 ティンタ', en: 'Private Tinta' }, short: { ja: 'ティンタ', en: 'Tinta' }, tag: { ja: '飛び道具と地雷', en: 'Ranged, with mines' },
      desc: { ja: 'ラッパとコルク銃のブリキの兵隊。遠くから撃ち、地雷でじゃまをする。近づかれると少しこまる。', en: 'A tin soldier with a cork gun and a bugle. Shoots from afar and lays mines, but dislikes being rushed.' },
      color: '#3f6fb5', color2: '#d0453f', w: 28, h: 62, weight: 104, run: 3.6, acc: 0.5, air: 2.8, aacc: 0.2, jump: 10.7, dj: 9.6, grav: 0.44, fall: 8.4, ff: 12.4, stats: { speed: 2, power: 2, weight: 2, reach: 4, recov: 4 },
      kit: { reach: 1.3, sp: 1.0, pw: 1.09, rr: 1.05, fx: 'slash', ov: { jab: { fx: 'punch' }, ftilt: { fx: 'slash', reach: 1.3 }, nair: { fx: 'spin' }, dair: { fx: 'kick' }, bair: { fx: 'slash' } } },
      sp: {
        N: sp({ kind: 'proj', fx: 'gun', s: 14, a: 1, t: 34, proj: { sp: 12, vy: 0, g: 0, r: 8, life: 50, dmg: 6, bkb: 12, kbg: 12, ang: 15, kind: 'cork' } }),
        S: sp({ kind: 'dash', fx: 'slash', s: 12, a: 10, t: 48, v: 6.2, dmg: 11, bkb: 22, kbg: 30, ang: 35, hb: [[36, -32, 52, -32, 14]] }),
        U: sp({ rr: 180, kind: 'slingshot', fx: 'horn', s: 6, d: 10, a: 14, t: 42, back: 2.2, sp: 7.5, rv: 5.5, dmg: 0, hb: [] }),
        D: sp({ kind: 'mine', fx: 'cast', s: 10, a: 1, t: 38, proj: { r: 20, life: 900, arm: 40, dmg: 12, bkb: 26, kbg: 34, ang: 70, kind: 'mine' } }),
      } },
    bear: { id: 'bear', name: { ja: 'ぬいぐるみクマ モコ', en: 'Moko the Plush Bear' }, short: { ja: 'モコ', en: 'Moko' }, tag: { ja: '重くて一発が強い', en: 'Heavy hitter' },
      desc: { ja: '綿のつまった大きなクマ。のろいけれど、一発が重く、なかなか飛ばされない。「ぎゅっ」はつかみ技。', en: 'A big stuffed bear. Slow, but heavy hits and hard to launch. Its bear hug is a command grab.' },
      color: '#c98a52', color2: '#f2d7b0', w: 42, h: 66, weight: 138, run: 2.7, acc: 0.42, air: 2.3, aacc: 0.16, jump: 10.2, dj: 9.2, grav: 0.46, fall: 9.4, ff: 13.4, stats: { speed: 1, power: 5, weight: 5, reach: 3, recov: 1 },
      kit: { reach: 1.1, sp: 1.18, pw: 1.22, rr: 1.28, fx: 'punch', ov: { nair: { fx: 'spin' }, dair: { fx: 'kick', a: 8 }, dtilt: { fx: 'kick' }, bair: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'cmdgrab', fx: 'hug', s: 9, a: 4, t: 44, dmg: 11, bkb: 30, kbg: 40, ang: 55, hb: [[34, -32, 40, -32, 28]] }),
        S: sp({ kind: 'melee', fx: 'punch', s: 18, a: 5, t: 54, dmg: 17, bkb: 30, kbg: 44, ang: 40, hb: [[20, -62, 56, -14, 32]] }),
        U: sp({ rr: 180, kind: 'chargeleap', fx: 'puff', s: 6, a: 16, t: 34, cmax: 40, sp0: 5.5, sp1: 6.5, dmg: 0, hb: [] }),
        D: sp({ kind: 'pound', fx: 'body', s: 14, t: 56, fv: 14, dmg: 11, bkb: 18, kbg: 26, ang: -78, hb: [[0, 8, 0, 8, 34]], land: { a: 6, dmg: 8, bkb: 24, kbg: 26, ang: 50, hb: [[40, -8, 40, -8, 34], [-40, -8, -40, -8, 34]] } }),
      } },
    top: { id: 'top', name: { ja: 'こま クルリン', en: 'Whirlo the Spinning Top' }, short: { ja: 'クルリン', en: 'Whirlo' }, tag: { ja: '速くて軽い', en: 'Fast and light' },
      desc: { ja: '紐でまわる小さなこま。とても速くて動きまわるが、軽くてすぐ飛ぶ。「スピン」で連続ヒット。', en: 'A tiny top that zips around. Very fast, very light. Its spin hits many times.' },
      color: '#9a59c9', color2: '#4fc0c2', w: 34, h: 46, weight: 84, run: 4.6, acc: 0.7, air: 3.4, aacc: 0.28, jump: 11.4, dj: 10.6, grav: 0.47, fall: 9.4, ff: 13.8, stats: { speed: 5, power: 2, weight: 1, reach: 2, recov: 4 },
      kit: { reach: 1.05, sp: 0.88, pw: 0.95, rr: 1.05, fx: 'spin', ov: { jab: { fx: 'spin' }, ftilt: { fx: 'spin' }, utilt: { fx: 'spin' }, nair: { rr: 1.15, a: 14 } } },
      sp: {
        N: sp({ kind: 'spin', fx: 'spin', s: 6, a: 42, t: 66, rh: 7, dmg: 1.8, bkb: 7, kbg: 0, ang: 50, fin: { dmg: 5, bkb: 22, kbg: 24, ang: 50 }, hb: [[0, -24, 0, -24, 28]] }),
        S: sp({ kind: 'dash', fx: 'spin', s: 8, a: 14, t: 40, v: 8, dmg: 8, bkb: 18, kbg: 22, ang: 45, hb: [[0, -24, 8, -24, 24]] }),
        U: sp({ rr: 280, kind: 'drill', fx: 'drill', s: 4, a: 24, t: 40, rv: 9.4, amp: 3.2, per: 22, dv: 1.2, dmg: 2, bkb: 8, kbg: 0, ang: 80, hb: [[0, -30, 0, -30, 26]] }),
        D: sp({ kind: 'melee', fx: 'ring', s: 7, a: 5, t: 34, dmg: 8, bkb: 22, kbg: 24, ang: 55, hb: [[0, -24, 0, -24, 54]] }),
      } },
    jack: { id: 'jack', name: { ja: 'びっくり箱 ポップ', en: 'Popper the Jack-in-the-box' }, short: { ja: 'ポップ', en: 'Popper' }, tag: { ja: 'ばねで遠くまで届く', en: 'Springy long reach' },
      desc: { ja: 'ふたをあけると飛び出す、ばねのピエロ。手足が長くびよーんと届き、ばねの高いジャンプでもどる。', en: 'A clown on a spring. Attacks stretch far, and the spring launches it high to recover.' },
      color: '#d64b8c', color2: '#4cb2d6', w: 30, h: 58, weight: 86, run: 3.4, acc: 0.5, air: 3.0, aacc: 0.22, jump: 11.8, dj: 11.0, grav: 0.4, fall: 7.9, ff: 12, stats: { speed: 3, power: 3, weight: 2, reach: 5, recov: 5 },
      kit: { reach: 1.45, sp: 1.05, pw: 1.18, rr: 0.92, fx: 'spring', ov: { nair: { fx: 'spin', rr: 1.1 }, dair: { fx: 'spring' }, utilt: { fx: 'spring' }, dtilt: { fx: 'spring' } } },
      sp: {
        N: sp({ kind: 'proj', fx: 'cast', s: 16, a: 1, t: 40, proj: { sp: 4.4, vy: -3.4, g: 0.34, r: 12, life: 150, dmg: 7, bkb: 16, kbg: 16, ang: 40, kind: 'ball', bounce: 1 } }),
        S: sp({ kind: 'melee', fx: 'spring', s: 16, a: 6, t: 50, dmg: 13, bkb: 26, kbg: 32, ang: 35, hb: [[30, -50, 135, -48, 16]] }),
        U: sp({ rr: 225, kind: 'spring', fx: 'springup', s: 5, a: 1, t: 50, g: 14, rv: 11.8, rv2: 10.4, dv: 2.8, dmg: 0, hb: [] }),
        D: sp({ kind: 'melee', fx: 'lid', s: 6, a: 5, t: 48, arm: [6, 22], dmg: 10, bkb: 24, kbg: 30, ang: 60, hb: [[0, -28, 0, -28, 44]] }),
      } },
    // ---- ここから、あとから増えたおもちゃ（12人）
    ninja: { id: 'ninja', name: { ja: '折り紙ニンジャ オリガ', en: 'Origa the Paper Ninja' }, short: { ja: 'オリガ', en: 'Origa' }, tag: { ja: 'ワープと不意うち', en: 'Warping trickster' },
      desc: { ja: '一枚の紙から折られた小さな忍者。手裏剣を投げ、ワープで相手の背中へまわりこむ。軽くて速い。', en: 'A tiny ninja folded from one sheet of paper. Throws stars and warps behind its rival. Light and quick.' },
      color: '#c9374a', color2: '#f4efe2', w: 28, h: 54, weight: 88, run: 4.3, acc: 0.62, air: 3.2, aacc: 0.26, jump: 11.4, dj: 10.8, grav: 0.45, fall: 9.0, ff: 13.6, stats: { speed: 4, power: 2, weight: 1, reach: 2, recov: 4 },
      kit: { reach: 1.05, sp: 0.92, pw: 1.0, rr: 1.0, fx: 'slash', ov: { jab: { sp: 0.8 }, nair: { fx: 'spin' }, dair: { fx: 'kick' }, bair: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'proj', fx: 'cast', s: 9, a: 1, t: 28, proj: { sp: 10, vy: 0, g: 0, r: 7, life: 45, dmg: 4, bkb: 8, kbg: 8, ang: 15, kind: 'shuriken' } }),
        S: sp({ kind: 'tele', fx: 'slash', s: 10, a: 5, t: 34, td: 150, dd: [1, 0], dmg: 7, bkb: 18, kbg: 22, ang: 40, hb: [[16, -30, 40, -30, 18]] }),
        U: sp({ rr: 171, kind: 'tele', fx: 'cast', s: 9, a: 1, t: 36, td: 190, dd: [0, -1], help: true, dmg: 0, bkb: 0, kbg: 0, hb: [] }),
        D: sp({ kind: 'tele', fx: 'ring', s: 8, a: 4, t: 32, td: 110, dd: [-1, 0], fixed: 1, dmg: 5, bkb: 14, kbg: 14, ang: 60, hb: [[0, -28, 0, -28, 26]] }),
      } },
    wiz: { id: 'wiz', name: { ja: '魔法使いパペット マジナ', en: 'Magina the Puppet Wizard' }, short: { ja: 'マジナ', en: 'Magina' }, tag: { ja: '遠くから魔法', en: 'Long-range zoner' },
      desc: { ja: '糸であやつられる魔法使い。光の玉と大きな火の玉で遠くから攻める。「まほうのかべ」で飛び道具をはね返す。', en: 'A puppet wizard on strings. Orbs and a big fireball keep rivals at range, and a magic wall bounces shots back.' },
      color: '#6b46c1', color2: '#f2d13c', w: 30, h: 60, weight: 86, run: 3.0, acc: 0.45, air: 2.6, aacc: 0.2, jump: 10.4, dj: 9.8, grav: 0.38, fall: 7.4, ff: 11.2, stats: { speed: 2, power: 2, weight: 1, reach: 2, recov: 4 },
      kit: { reach: 1.0, sp: 1.02, pw: 1.02, rr: 1.0, fx: 'slash', ov: { jab: { fx: 'punch' }, nair: { fx: 'spin' }, dair: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'proj', fx: 'cast', s: 12, a: 1, t: 34, proj: { sp: 6.2, vy: 0, g: 0, r: 11, life: 90, dmg: 6, bkb: 10, kbg: 12, ang: 22, kind: 'orb' } }),
        S: sp({ kind: 'proj', fx: 'cast', s: 20, a: 1, t: 54, proj: { sp: 4.2, vy: -0.6, g: 0.02, r: 19, life: 80, dmg: 11, bkb: 22, kbg: 28, ang: 32, kind: 'fire' } }),
        U: sp({ rr: 105, kind: 'cloudstep', fx: 'cast', s: 5, a: 40, t: 52, b: 16, rv: 7.6, dv: 2.2, dmg: 0, hb: [] }),
        D: sp({ kind: 'reflect', fx: 'ring', s: 3, a: 20, t: 40, dmg: 3, bkb: 20, kbg: 6, ang: 30, hb: [[26, -30, 40, -30, 28]] }),
      } },
    cat: { id: 'cat', name: { ja: 'ぜんまいネコ タマ', en: 'Tama the Clockwork Cat' }, short: { ja: 'タマ', en: 'Tama' }, tag: { ja: 'すばやいラッシュ', en: 'Fast rushdown' },
      desc: { ja: '背中のぜんまいで走りまわるブリキのネコ。リーチは短いが、速くて手数が多い。「ひっかきの嵐」で連続ヒット。', en: 'A tin cat that never stops running. Short reach, but very fast with lots of hits. Its claw flurry is a multi-hit.' },
      color: '#e59a45', color2: '#fff3d6', w: 32, h: 44, weight: 86, run: 4.9, acc: 0.72, air: 3.3, aacc: 0.27, jump: 11.2, dj: 10.2, grav: 0.46, fall: 9.2, ff: 13.6, stats: { speed: 5, power: 2, weight: 1, reach: 1, recov: 3 },
      kit: { reach: 0.95, sp: 0.8, pw: 0.97, rr: 1.05, fx: 'slash', ov: { jab: { sp: 0.7, fx: 'slash' }, nair: { fx: 'spin' }, dair: { fx: 'kick' }, utilt: { fx: 'slash' }, ftilt: { fx: 'slash' } } },
      sp: {
        N: sp({ kind: 'spin', fx: 'slash', s: 5, a: 36, t: 58, rh: 6, dmg: 1.5, bkb: 6, kbg: 0, ang: 55, fin: { dmg: 4, bkb: 20, kbg: 22, ang: 50 }, hb: [[16, -24, 26, -24, 24]] }),
        S: sp({ kind: 'dash', fx: 'slash', s: 10, a: 10, t: 40, v: 8.4, dmg: 8, bkb: 18, kbg: 24, ang: 40, hb: [[26, -24, 46, -24, 16]] }),
        U: sp({ rr: 205, kind: 'wallbounce', fx: 'kick', s: 5, a: 40, t: 50, sp: 6.6, rv: 9.4, n: 2, dmg: 0, hb: [] }),
        D: sp({ kind: 'melee', fx: 'kick', s: 6, a: 5, t: 30, dmg: 6, bkb: 18, kbg: 18, ang: 60, hb: [[34, -10, 40, -10, 16], [-34, -10, -40, -10, 16]] }),
      } },
    tank: { id: 'tank', name: { ja: 'プラモ戦車 ガッチョ', en: 'Gatcho the Model Tank' }, short: { ja: 'ガッチョ', en: 'Gatcho' }, tag: { ja: 'どっしり大砲', en: 'Heavy artillery' },
      desc: { ja: 'プラスチックの小さな戦車。のろくて、ジャンプも低いが、とても重くて砲弾の一発が重い。ぶつかりは「ふんばり」つき。', en: 'A little plastic tank. Slow, with a low hop, but very heavy and its shells hit hard. The ram has armor.' },
      color: '#5f7f4a', color2: '#c9b27a', w: 54, h: 50, weight: 132, run: 2.2, acc: 0.36, air: 2.0, aacc: 0.13, jump: 9.4, dj: 8.6, grav: 0.5, fall: 9.8, ff: 13.6, stats: { speed: 1, power: 5, weight: 5, reach: 3, recov: 1 },
      kit: { reach: 1.0, sp: 1.2, pw: 1.24, rr: 1.3, fx: 'punch', ov: { nair: { fx: 'spin' }, dair: { fx: 'kick', a: 8 }, dtilt: { fx: 'kick' }, bair: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'proj', fx: 'cast', s: 16, a: 1, t: 44, proj: { sp: 7.2, vy: -1.2, g: 0.16, r: 14, life: 100, dmg: 10, bkb: 20, kbg: 26, ang: 30, kind: 'shell' } }),
        S: sp({ kind: 'dash', fx: 'shield', s: 14, a: 10, t: 50, v: 4.6, arm: [10, 26], dmg: 14, bkb: 26, kbg: 34, ang: 36, hb: [[30, -26, 52, -26, 26]] }),
        U: sp({ rr: 190, kind: 'rocket', fx: 'ring', s: 8, d: 16, a: 20, t: 64, rv: 12.6, dv: 1.8, dmg: 9, bkb: 22, kbg: 28, ang: 85, hb: [[0, -20, 0, -20, 46]] }),
        D: sp({ kind: 'proj', fx: 'cast', s: 14, a: 1, t: 46, proj: { sp: 3.2, vy: -7.4, g: 0.34, r: 14, life: 110, dmg: 9, bkb: 18, kbg: 24, ang: 62, kind: 'shell' } }),
      } },
    giraffe: { id: 'giraffe', name: { ja: '積み木キリン ノッポ', en: 'Noppo the Block Giraffe' }, short: { ja: 'ノッポ', en: 'Noppo' }, tag: { ja: 'いちばん高くて長い', en: 'Tallest, longest reach' },
      desc: { ja: '積み木を重ねてできたキリン。首が長く、攻撃がとても遠くまで届く。足もとは少し苦手。', en: 'A giraffe stacked from building blocks. Its long neck reaches far, though feet-level is a weak spot.' },
      color: '#f0c24a', color2: '#8a5a2b', w: 30, h: 84, weight: 98, run: 3.1, acc: 0.5, air: 2.5, aacc: 0.19, jump: 10.6, dj: 9.6, grav: 0.43, fall: 8.4, ff: 12.4, stats: { speed: 2, power: 3, weight: 3, reach: 5, recov: 3 },
      kit: { reach: 1.6, sp: 1.05, pw: 1.24, rr: 0.95, fx: 'spring', ov: { nair: { fx: 'spin' }, dair: { fx: 'kick' }, dtilt: { fx: 'kick', reach: 1.0 }, jab: { fx: 'punch' } } },
      sp: {
        N: sp({ kind: 'melee', fx: 'spring', s: 14, a: 6, t: 44, dmg: 10, bkb: 22, kbg: 30, ang: 38, hb: [[30, -82, 100, -60, 18]] }),
        S: sp({ kind: 'melee', fx: 'spring', s: 16, a: 6, t: 50, dmg: 13, bkb: 26, kbg: 34, ang: 35, hb: [[40, -70, 140, -50, 16]] }),
        U: sp({ rr: 300, kind: 'tether', fx: 'spring', s: 7, a: 14, t: 40, range: 300, sp: 12, rv: 9, dmg: 0, hb: [] }),
        D: sp({ kind: 'melee', fx: 'kick', s: 10, a: 6, t: 40, arm: [10, 20], dmg: 9, bkb: 22, kbg: 26, ang: 60, hb: [[36, -6, 44, -6, 20], [-36, -6, -44, -6, 20]] }),
      } },
    ball: { id: 'ball', name: { ja: 'ゴムまり ポンタ', en: 'Ponta the Rubber Ball' }, short: { ja: 'ポンタ', en: 'Ponta' }, tag: { ja: 'はずむトリッキー', en: 'Bouncy trickster' },
      desc: { ja: 'よくはずむゴムのまり。ジャンプが高く、空中ジャンプが2回できる。丸まって転がり、地面にバウンドして落ちる。', en: 'A very bouncy rubber ball. Jumps high with two air jumps. Rolls up into a ball and slams down with a bounce.' },
      color: '#3aa6e0', color2: '#ffd23f', w: 36, h: 40, weight: 90, run: 3.6, acc: 0.55, air: 3.0, aacc: 0.24, jump: 12.6, dj: 11.4, grav: 0.5, fall: 9.4, ff: 14, jmax: 2, stats: { speed: 3, power: 2, weight: 2, reach: 1, recov: 5 },
      kit: { reach: 0.9, sp: 0.95, pw: 1.06, rr: 1.15, fx: 'spin', ov: { jab: { fx: 'punch' }, dair: { fx: 'spin' }, bair: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'spin', fx: 'spin', s: 6, a: 30, t: 52, rh: 6, dmg: 1.6, bkb: 6, kbg: 0, ang: 60, fin: { dmg: 4.5, bkb: 22, kbg: 24, ang: 55 }, hb: [[0, -20, 0, -20, 26]] }),
        S: sp({ kind: 'dash', fx: 'spin', s: 9, a: 12, t: 42, v: 7.6, dmg: 8, bkb: 18, kbg: 22, ang: 50, hb: [[0, -20, 10, -20, 24]] }),
        U: sp({ rr: 165, kind: 'rebound', fx: 'springup', s: 4, d: 8, a: 22, t: 46, dive: 8.5, rv: 12.8, dv: 2.4, dmg: 0, hb: [] }),
        D: sp({ kind: 'pound', fx: 'body', s: 12, t: 54, fv: 13, dmg: 10, bkb: 18, kbg: 26, ang: -78, hb: [[0, 8, 0, 8, 28]], land: { a: 5, dmg: 7, bkb: 22, kbg: 24, ang: 55, hb: [[34, -6, 34, -6, 28], [-34, -6, -34, -6, 28]] } }),
      } },
    crab: { id: 'crab', name: { ja: 'ブリキのカニ チョキ', en: 'Chokki the Tin Crab' }, short: { ja: 'チョキ', en: 'Chokki' }, tag: { ja: 'つかみの名人', en: 'Grappler' },
      desc: { ja: 'ハサミが自慢のブリキのカニ。つかみとなげがとても強い。「はさみつかみ」は、まもりも通りぬける。', en: 'A tin crab proud of its claws. Throws hit hardest here. The pincer grab reaches far and ignores shields.' },
      color: '#d6483d', color2: '#f5d6a0', w: 40, h: 40, weight: 114, run: 3.0, acc: 0.5, air: 2.4, aacc: 0.18, jump: 10.0, dj: 9.0, grav: 0.46, fall: 9.0, ff: 13, stats: { speed: 2, power: 4, weight: 4, reach: 1, recov: 2 },
      tw: { f: { dmg: 9, kbg: 60 }, b: { dmg: 10, kbg: 58 }, u: { dmg: 8, kbg: 52 }, d: { dmg: 7, kbg: 42 } },
      kit: { reach: 0.9, sp: 1.1, pw: 1.2, rr: 1.2, fx: 'punch', ov: { nair: { fx: 'spin' }, dair: { fx: 'kick' }, dtilt: { fx: 'kick' }, bair: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'cmdgrab', fx: 'hug', s: 8, a: 5, t: 46, dmg: 14, bkb: 32, kbg: 44, ang: 50, hb: [[34, -22, 52, -22, 30]] }),
        S: sp({ kind: 'dash', fx: 'punch', s: 10, a: 8, t: 44, v: 5.2, dmg: 9, bkb: 22, kbg: 28, ang: 38, hb: [[30, -22, 48, -22, 20]] }),
        U: sp({ rr: 205, kind: 'ripple', fx: 'kick', s: 6, a: 34, t: 50, sp: 6.4, per: 16, amp: 2.6, lift: 2.2, dmg: 0, hb: [] }),
        D: sp({ kind: 'melee', fx: 'punch', s: 7, a: 5, t: 36, arm: [7, 18], dmg: 10, bkb: 24, kbg: 28, ang: 55, hb: [[30, -26, 46, -20, 24]] }),
      } },
    snail: { id: 'snail', name: { ja: 'オルゴールかたつむり ノロリン', en: 'Nororin the Music-Box Snail' }, short: { ja: 'ノロリン', en: 'Nororin' }, tag: { ja: 'しかけて待つ', en: 'Trap-setter' },
      desc: { ja: '背中のからがオルゴールのかたつむり。遅いけれど、音符の地雷を3つまでしかけられる。からに入ればふんばれる。', en: 'A snail with a music box for a shell. Slow, but it can plant up to three note mines. Curl up in the shell to stand firm.' },
      color: '#7fb069', color2: '#e8c07a', w: 40, h: 44, weight: 108, run: 2.5, acc: 0.42, air: 2.1, aacc: 0.15, jump: 9.2, dj: 8.4, grav: 0.44, fall: 7.8, ff: 12, stats: { speed: 1, power: 3, weight: 3, reach: 3, recov: 2 },
      kit: { reach: 1.05, sp: 1.05, pw: 1.18, rr: 1.1, fx: 'punch', ov: { nair: { fx: 'ring' }, dair: { fx: 'kick' }, bair: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'mine', fx: 'cast', s: 10, a: 1, t: 38, proj: { r: 20, life: 1100, arm: 36, dmg: 10, bkb: 24, kbg: 32, ang: 72, kind: 'mine', max: 3 } }),
        S: sp({ kind: 'proj', fx: 'cast', s: 14, a: 1, t: 44, proj: { sp: 3.6, vy: -3, g: 0.22, r: 13, life: 140, dmg: 7, bkb: 14, kbg: 16, ang: 40, kind: 'note', bounce: 1 } }),
        U: sp({ rr: 125, kind: 'bubble', fx: 'puff', s: 6, a: 46, t: 60, rv: 3.0, dv: 1.6, dmg: 6, bkb: 20, kbg: 24, ang: 80, hb: [[0, -30, 0, -30, 40]] }),
        D: sp({ kind: 'melee', fx: 'ring', s: 5, a: 6, t: 44, arm: [5, 22], dmg: 7, bkb: 20, kbg: 24, ang: 70, hb: [[0, -26, 0, -26, 44]] }),
      } },
    kaiju: { id: 'kaiju', name: { ja: 'ソフビ怪獣 ガオロン', en: 'Gaoron the Vinyl Beast' }, short: { ja: 'ガオロン', en: 'Gaoron' }, tag: { ja: 'パワフルな暴れん坊', en: 'Power bruiser' },
      desc: { ja: 'ビニールでできた怪獣のおもちゃ。力が強く、しっぽとかみつきが重い。炎は近くにしか届かない。', en: 'A vinyl monster toy. Strong, with a heavy tail and bite. Its flame only reaches up close.' },
      color: '#2f9e8f', color2: '#f2e36b', w: 46, h: 72, weight: 116, run: 3.1, acc: 0.46, air: 2.4, aacc: 0.17, jump: 10.0, dj: 9.0, grav: 0.46, fall: 9.2, ff: 13.2, stats: { speed: 2, power: 5, weight: 4, reach: 3, recov: 2 },
      kit: { reach: 1.15, sp: 1.14, pw: 1.37, rr: 1.2, fx: 'punch', ov: { nair: { fx: 'spin' }, bair: { fx: 'kick' }, dair: { fx: 'kick' }, dtilt: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'proj', fx: 'cast', s: 12, a: 1, t: 38, proj: { sp: 7, vy: 0, g: 0, r: 15, life: 22, dmg: 6, bkb: 12, kbg: 14, ang: 25, kind: 'flame' } }),
        S: sp({ kind: 'dash', fx: 'punch', s: 12, a: 9, t: 46, v: 5.8, arm: [8, 20], dmg: 13, bkb: 26, kbg: 34, ang: 36, hb: [[34, -50, 52, -40, 26]] }),
        U: sp({ rr: 145, kind: 'copter', fx: 'spin', s: 6, t: 60, fuel: 46, rv: 3.1, dv: 3.4, dmg: 0, hb: [] }),
        D: sp({ kind: 'melee', fx: 'spin', s: 8, a: 7, t: 40, dmg: 11, bkb: 24, kbg: 30, ang: 50, hb: [[44, -14, 60, -14, 20], [-44, -14, -60, -14, 20]] }),
      } },
    samurai: { id: 'samurai', name: { ja: 'こけし侍 コケマル', en: 'Kokemaru the Kokeshi Samurai' }, short: { ja: 'コケマル', en: 'Kokemaru' }, tag: { ja: '居合と見切り', en: 'Swordsman with parry' },
      desc: { ja: '木のこけしの小さなお侍。刀のリーチが長く、居合ぎりで一気に間をつめる。「みきり」で技をはね返す。', en: 'A small samurai made from a wooden kokeshi doll. Long sword reach and a lunging draw-slash. Its parry turns hits around.' },
      color: '#2b3a67', color2: '#f2e4cf', w: 28, h: 62, weight: 94, run: 4.0, acc: 0.58, air: 2.8, aacc: 0.21, jump: 10.8, dj: 9.8, grav: 0.44, fall: 8.8, ff: 13, stats: { speed: 4, power: 3, weight: 2, reach: 5, recov: 3 },
      kit: { reach: 1.55, sp: 0.92, pw: 0.92, rr: 0.95, fx: 'slash', ov: { jab: { fx: 'slash', reach: 1.1 }, nair: { fx: 'spin' }, dair: { fx: 'slash' }, bair: { fx: 'kick' }, dtilt: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'dash', fx: 'slash', s: 11, a: 6, t: 38, v: 9.5, dmg: 10, bkb: 22, kbg: 30, ang: 38, hb: [[30, -30, 70, -30, 16]] }),
        S: sp({ kind: 'melee', fx: 'slash', s: 12, a: 6, t: 40, dmg: 11, bkb: 24, kbg: 32, ang: 50, hb: [[24, -20, 80, -60, 16]] }),
        U: sp({ rr: 235, kind: 'dashglide', fx: 'slash', s: 7, a: 11, tail: 18, t: 48, sp: 8.6, dmg: 0, hb: [] }),
        D: sp({ kind: 'counter', fx: 'slash', s: 4, a: 18, t: 50, cf: 22, cs: 4, ca: 4, dmg: 9, bkb: 26, kbg: 34, ang: 40, hb: [[34, -30, 66, -28, 22]] }),
      } },
    balloon: { id: 'balloon', name: { ja: 'ふうせんウサギ プカ', en: 'Puka the Balloon Bunny' }, short: { ja: 'プカ', en: 'Puka' }, tag: { ja: 'ふわふわ空中戦', en: 'Floaty air fighter' },
      desc: { ja: 'ふうせんでできたウサギ。とても軽くてゆっくり落ち、空中ジャンプが3回。軽いので、すぐ飛ばされる。', en: 'A rabbit made of balloons. Very light, falls slowly and jumps three times in the air. Light enough to fly far.' },
      color: '#f48fb1', color2: '#ffffff', w: 34, h: 56, weight: 84, run: 3.6, acc: 0.55, air: 3.1, aacc: 0.3, jump: 9.8, dj: 8.4, grav: 0.3, fall: 5.8, ff: 9.6, jmax: 3, stats: { speed: 3, power: 1, weight: 1, reach: 2, recov: 5 },
      kit: { reach: 1.05, sp: 0.9, pw: 1.2, rr: 1.05, fx: 'kick', ov: { jab: { fx: 'punch' }, nair: { fx: 'spin' }, uair: { fx: 'kick' } } },
      sp: {
        N: sp({ kind: 'proj', fx: 'cast', s: 10, a: 1, t: 30, proj: { sp: 8.4, vy: 0, g: 0, r: 7, life: 50, dmg: 4, bkb: 8, kbg: 8, ang: 20, kind: 'dart' } }),
        S: sp({ kind: 'melee', fx: 'kick', s: 11, a: 6, t: 38, dmg: 9, bkb: 22, kbg: 28, ang: 40, hb: [[28, -20, 56, -14, 18]] }),
        U: sp({ rr: 165, kind: 'balloon', fx: 'puff', s: 6, a: 64, t: 78, b: 14, rv: 4.2, sink: 0.8, dv: 2.6, dmg: 0, hb: [] }),
        D: sp({ kind: 'melee', fx: 'ring', s: 6, a: 5, t: 34, dmg: 8, bkb: 20, kbg: 24, ang: 70, hb: [[0, -50, 0, -50, 40]] }),
      } },
    penguin: { id: 'penguin', name: { ja: 'ペンギン太鼓 ドンドコ', en: 'Dondoko the Drum Penguin' }, short: { ja: 'ドンドコ', en: 'Dondoko' }, tag: { ja: 'はね返しと衝撃波', en: 'Reflector, shockwaves' },
      desc: { ja: '太鼓をたたくペンギンのおもちゃ。太鼓の音の波を飛ばし、「ドラムシールド」で飛び道具をはね返す。', en: 'A toy penguin with a drum. Sends out sound waves and its drum shield bounces projectiles back.' },
      color: '#2c3e50', color2: '#f8f4ea', w: 38, h: 58, weight: 112, run: 3.0, acc: 0.5, air: 2.5, aacc: 0.19, jump: 10.2, dj: 9.2, grav: 0.45, fall: 8.8, ff: 12.8, stats: { speed: 2, power: 3, weight: 4, reach: 3, recov: 3 },
      kit: { reach: 1.1, sp: 1.0, pw: 1.2, rr: 1.15, fx: 'punch', ov: { nair: { fx: 'spin' }, dair: { fx: 'kick' }, bair: { fx: 'kick' }, ftilt: { fx: 'punch' } } },
      sp: {
        N: sp({ kind: 'proj', fx: 'cast', s: 14, a: 1, t: 40, proj: { sp: 4.8, vy: 0, g: 0, r: 22, life: 60, dmg: 5, bkb: 14, kbg: 12, ang: 20, kind: 'wave' } }),
        S: sp({ kind: 'melee', fx: 'punch', s: 14, a: 6, t: 46, dmg: 12, bkb: 25, kbg: 32, ang: 38, hb: [[26, -40, 66, -22, 20]] }),
        U: sp({ rr: 185, kind: 'arcreturn', fx: 'kick', s: 6, a: 34, t: 46, rv: 8.8, dv: 6.2, sink: 2, dmg: 0, hb: [] }),
        D: sp({ kind: 'reflect', fx: 'shield', s: 3, a: 22, t: 42, dmg: 5, bkb: 22, kbg: 14, ang: 40, hb: [[28, -30, 42, -30, 30]] }),
      } },
    // ボス（ラダーの最後）。えらべない
    junk: { id: 'junk', boss: 1, name: { ja: 'ガラクタ大王', en: 'Junk King' }, short: { ja: 'ガラクタ大王', en: 'Junk King' }, tag: { ja: 'ラスボス', en: 'Final boss' },
      desc: { ja: 'こわれたおもちゃを積みあげた、工房の王さま。重くて大きい。', en: 'The king of the workshop, stacked from broken toys. Huge and heavy.' },
      color: '#7a6a58', color2: '#e8b73a', w: 64, h: 92, weight: 160, run: 2.5, acc: 0.4, air: 2.2, aacc: 0.14, jump: 10.0, dj: 9.2, grav: 0.46, fall: 9.8, ff: 13.4, stats: { speed: 1, power: 5, weight: 5, reach: 4, recov: 2 },
      kit: { reach: 1.2, sp: 1.2, pw: 1.45, rr: 1.55, fx: 'punch', ov: { nair: { fx: 'spin' } } },
      sp: {
        N: sp({ kind: 'proj', fx: 'cast', s: 16, a: 1, t: 40, proj: { sp: 6.5, vy: 0, g: 0, r: 20, life: 80, dmg: 9, bkb: 18, kbg: 20, ang: 25, kind: 'gear' } }),
        S: sp({ kind: 'melee', fx: 'punch', s: 20, a: 6, t: 58, dmg: 19, bkb: 32, kbg: 44, ang: 38, hb: [[30, -80, 90, -20, 42]] }),
        U: sp({ kind: 'rise', fx: 'puff', s: 6, a: 16, t: 42, rv: 9.8, dv: 2.4, ang: 80, dmg: 6, bkb: 18, kbg: 20, hb: [[0, -60, 0, -60, 44]] }),
        D: sp({ kind: 'pound', fx: 'body', s: 16, t: 58, fv: 14, dmg: 13, bkb: 20, kbg: 28, ang: -78, hb: [[0, 8, 0, 8, 50]], land: { a: 7, dmg: 10, bkb: 26, kbg: 28, ang: 50, hb: [[60, -8, 60, -8, 46], [-60, -8, -60, -8, 46]] } }),
      } },
  };

  // ------------------------------------------------------------------------------------------------ 第2弾：新しい16人（Batch 1）
  // どの子も、ほかの子と同じ仕掛け（sig）を持たない。kind は engine.js の defineKind、proj.kind は defineProj / art.js の絵。spr は art.js の組み立て絵のデータ。
  const B1 = (id, o) => { CH[id] = Object.assign({ id, acc: 0.5, air: 2.8, aacc: 0.2, jump: 10.8, dj: 9.8, grav: 0.44, fall: 8.6, ff: 12.6 }, o); };
  const T2 = (ja, en) => ({ ja, en });
  B1('rocketon', { name: T2('ペットロケット ロケットン', 'Rocketon the Bottle Rocket'), short: T2('ロケットン', 'Rocketon'), tag: T2('ジェットでふわっと', 'Hovering jet kid'),
    desc: T2('ペットボトルのロケット。上とくぎで噴射して、ボタンをおし続けるとふわっと進める。ミサイルはだんだん速くなる。', 'A bottle rocket. Up-special blasts up, then hold the button to glide. Its missile speeds up as it flies.'),
    color: '#e8eaf2', color2: '#e0453f', w: 30, h: 58, weight: 90, run: 3.5, acc: 0.5, air: 3.6, aacc: 0.34, jump: 10.4, dj: 10.8, grav: 0.46, fall: 9.0, ff: 13.4, jmax: 2, stats: { speed: 4, power: 2, weight: 1, reach: 3, recov: 5 }, arch: 'air', sig: 'jet-glide', ul: { w: 26 },
    kit: { tpl: 'swift', pw: 1.0, ov: { jab: { hb: [[24, -26, 34, -30, 11]] }, ftilt: { reach: 1.15, ang: 25 }, fair: { hb: [[22, -28, 46, -34, 16]], ll: 7 }, nair: { rr: 1.2, a: 10 }, dair: { ang: -80, hb: [[4, 8, 10, -4, 15]], a: 8 }, fsmash: { hb: [[28, -30, 60, -24, 18]] }, usmash: { hb: [[10, -40, -6, -90, 20]], a: 7 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 12, a: 1, t: 34, proj: { sp: 5.5, vy: 0, g: 0, r: 8, life: 70, dmg: 4.6, bkb: 9, kbg: 8, ang: 25, kind: 'missile' } }),
      S: sp({ kind: 'dash', fx: 'kick', s: 10, a: 12, t: 44, v: 9.5, dmg: 8, bkb: 16, kbg: 20, ang: 38, hb: [[0, -26, 26, -26, 20]] }),
      U: sp({ rr: 205, kind: 'glide', fx: 'prop', s: 6, a: 14, t: 56, rv: 10.8, dv: 3.4, dmg: 0, hb: [] }),
      D: sp({ kind: 'melee', fx: 'kick', s: 9, a: 5, t: 34, dmg: 8, bkb: 18, kbg: 22, ang: 145, hb: [[-28, -26, -62, -22, 22]] }),
    },
    spr: { legs: { k: 'none' }, arms: { sx: 9, sy: -30, rx: 14, ry: -22, w: 5, c: 'b', hand: 'ball' }, back: [{ t: 'poly', pts: [-9, -10, -24, 4, -8, -2], c: 'b' }, { t: 'poly', pts: [9, -10, 22, 4, 8, -2], c: 'b' }, { t: 'flame', x: 0, y: 2, len: 16, c: 'ff' }],
      body: [{ t: 'ell', x: 0, y: -26, w: 26, h: 42, c: 'a' }, { t: 'poly', pts: [-12, -42, 0, -62, 12, -42], c: 'b' }, { t: 'circ', x: 0, y: -30, r: 6, c: 'w', lw: 2 }, { t: 'circ', x: 1, y: -30, r: 3, c: 'k' }], eyes: [] } });
  B1('pumper', { name: T2('ポンプ隊長', 'Captain Pumper'), short: T2('ポンプ', 'Pumper'), tag: T2('水で動きをにぶらせる', 'Slows with water'),
    desc: T2('消防ポンプの隊長。水鉄砲に当たると遅くなり、足もとの水たまりに入った相手も遅くなる。', 'A fire-pump captain. Water shots slow you down, and so does standing in his puddle.'),
    color: '#d94a3a', color2: '#f2d34a', w: 36, h: 60, weight: 100, run: 3.0, stats: { speed: 2, power: 2, weight: 3, reach: 4, recov: 3 }, arch: 'zone', sig: 'slow-pool', ul: { s: ['kos', 30] },
    kit: { tpl: 'zoner', pw: 1.42, ov: { jab: { sp: 1.1, a: 2 }, ftilt: { hb: [[28, -34, 44, -34, 13]] }, fsmash: { hb: [[28, -40, 96, -30, 17]], dt: 5, a: 6 }, usmash: { hb: [[18, -40, -6, -96, 18]] }, dsmash: { hb: [[36, -6, 60, -6, 19], [-36, -6, -60, -6, 19]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 8, a: 1, t: 22, proj: { sp: 9.5, vy: 0, g: 0, r: 10, life: 40, dmg: 2.2, bkb: 3, kbg: 0, ang: 20, kind: 'jet' } }),
      S: sp({ kind: 'melee', fx: 'spring', s: 15, a: 7, t: 46, dmg: 9, bkb: 20, kbg: 26, ang: 38, hb: [[26, -52, 70, -46, 14], [70, -46, 124, -30, 16]] }),
      U: sp({ rr: 175, kind: 'jet', fx: 'cast', s: 6, t: 50, fuel: 28, sp: 4.6, dmg: 0, hb: [] }),
      D: sp({ kind: 'zone', fx: 'cast', s: 14, a: 1, t: 40, proj: { kind: 'pool', r: 60, rad: 110, life: 330, slow: 3, ox: 70, oy: 6, nohit: 1 } }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 7 }, arms: { sx: 12, sy: -38, rx: 18, ry: -28, w: 6, c: 'a', hand: 'nozzle' }, back: [{ t: 'box', x: -17, y: -34, w: 11, h: 26, r: 4, c: 'b', lw: 2 }, { t: 'line', x0: -17, y0: -44, x1: -4, y1: -50, w: 3, c: 'k' }],
      body: [{ t: 'box', x: 0, y: -26, w: 28, h: 30, r: 6, c: 'a' }, { t: 'box', x: 0, y: -22, w: 28, h: 5, r: 1, c: 'b', lw: 0 }, { t: 'circ', x: 0, y: -50, r: 11, c: '#f2c9a0' }, { t: 'poly', pts: [-13, -52, -9, -66, 9, -66, 13, -52], c: 'b' }, { t: 'box', x: 4, y: -53, w: 24, h: 4, r: 2, c: 'b' }], eyes: [{ x: 5, y: -50, r: 3.2 }] } });
  B1('scoopjack', { name: T2('ガリガリショベル', 'Scoop Jack'), short: T2('ショベル', 'Scoop'), tag: T2('フックで引きよせる', 'Hooks foes in'),
    desc: T2('ショベルカー。アームのフックを当てると、相手を引きよせる。つかみも力もち。', 'An excavator. Its hook yanks foes toward it, and its claw grab hits hard.'),
    color: '#e0a030', color2: '#4a4f58', w: 50, h: 60, weight: 116, run: 2.9, acc: 0.42, air: 2.4, aacc: 0.16, jump: 10.0, dj: 9.0, grav: 0.46, fall: 9.2, ff: 13.4, stats: { speed: 2, power: 4, weight: 4, reach: 4, recov: 2 }, arch: 'grab', sig: 'grapple-hook', ul: { w: 30 },
    kit: { tpl: 'blade', reach: 1.1, pw: 1.15, rr: 1.1, ov: { jab: { hb: [[30, -24, 54, -20, 16]] }, ftilt: { reach: 1.3, hb: [[34, -22, 66, -18, 18]] }, dtilt: { hb: [[40, -4, 62, -4, 18]] }, fsmash: { hb: [[30, -50, 78, -10, 26]], a: 6 }, nair: { rr: 1.1 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 14, a: 1, t: 40, proj: { sp: 10, vy: 0, g: 0, r: 12, life: 24, dmg: 3, bkb: 6, kbg: 0, ang: 20, kind: 'hook' } }),
      S: sp({ kind: 'cmdgrab', fx: 'hug', s: 12, a: 4, t: 46, dmg: 10, bkb: 30, kbg: 36, ang: 50, hb: [[30, -18, 52, -12, 24]] }),
      U: sp({ rr: 195, kind: 'pendulum', fx: 'prop', s: 8, a: 30, t: 46, L: 190, D: 50, U: 120, dmg: 0, hb: [] }),
      D: sp({ kind: 'melee', fx: 'lid', s: 17, a: 8, t: 52, dmg: 13, bkb: 26, kbg: 36, ang: 42, hb: [[20, -70, 60, -10, 30]] }),
    },
    spr: { legs: { k: 'tread', w: 40, c: 'k' }, arms: { sx: 14, sy: -40, rx: 26, ry: -50, w: 7, c: 'k', hand: 'bucket' }, back: [],
      body: [{ t: 'box', x: -4, y: -28, w: 34, h: 22, r: 5, c: 'a' }, { t: 'box', x: -8, y: -48, w: 20, h: 22, r: 4, c: 'a' }, { t: 'box', x: -8, y: -48, w: 13, h: 12, r: 2, c: '#bfe6f5' }, { t: 'line', x0: 14, y0: -34, x1: 14, y1: -36, w: 2, c: 'k' }], eyes: [{ x: -6, y: -48, r: 3 }] } });
  B1('sonar', { name: T2('ソナー号', 'Sonar Sub'), short: T2('ソナー', 'Sonar'), tag: T2('しびれるわなを3つ', 'Triple root traps'),
    desc: T2('おもちゃの潜水艦。ソナーの音を出す丸い波は相手を何度も当たる。足もとのわなは、踏んだ相手を動けなくする。', 'A toy submarine. Its slow sonar ring hits again and again, and its traps hold whoever steps on them.'),
    color: '#3a8fc4', color2: '#f2e6a0', w: 48, h: 40, weight: 88, run: 3.7, jump: 10.2, dj: 9.0, grav: 0.4, fall: 8.0, stats: { speed: 3, power: 2, weight: 3, reach: 3, recov: 4 }, arch: 'trap', sig: 'snare-trap', ul: { s: ['block', 15] },
    kit: { tpl: 'brawler', reach: 1.1, pw: 1.2, ov: { jab: { hb: [[30, -24, 44, -24, 14]] }, ftilt: { hb: [[34, -22, 60, -24, 15]], ang: 30 }, utilt: { hb: [[6, -50, 0, -66, 15]] }, fsmash: { hb: [[30, -26, 66, -26, 22]], a: 5 }, dsmash: { hb: [[44, -12, 44, -12, 18], [-44, -12, -44, -12, 18]], a: 7 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 14, a: 1, t: 36, proj: { sp: 3.2, vy: 0, g: 0, r: 24, life: 64, dmg: 3, bkb: 5, kbg: 0, ang: 60, kind: 'ping', pierce: 1, rh: 28 } }),
      S: sp({ kind: 'dash', fx: 'prop', s: 12, a: 10, t: 46, v: 7.5, dmg: 8, bkb: 18, kbg: 22, ang: 38, hb: [[20, -24, 48, -24, 16]] }),
      U: sp({ rr: 225, kind: 'gravflip', fx: 'cast', s: 7, a: 34, t: 46, g: 0.55, vmax: 7.5, dv: 2.2, dmg: 0, hb: [] }),
      D: sp({ kind: 'mine', fx: 'cast', s: 12, a: 1, t: 38, proj: { kind: 'snare', max: 3, r: 20, life: 1100, arm: 30, dmg: 3, bkb: 4, kbg: 0, ang: 80 } }),
    },
    spr: { legs: { k: 'none' }, arms: { sx: 0, sy: 0, rx: 0, ry: 0, w: 0, c: 'a', hand: 'none', none: 1 }, back: [{ t: 'prop', x: -26, y: -22, r: 9, c: 'k' }],
      body: [{ t: 'ell', x: 0, y: -22, w: 50, h: 28, c: 'a' }, { t: 'box', x: 2, y: -42, w: 14, h: 12, r: 3, c: 'a' }, { t: 'line', x0: 4, y0: -46, x1: 4, y1: -58, w: 2.5, c: 'k' }, { t: 'line', x0: 4, y0: -58, x1: 11, y1: -58, w: 2.5, c: 'k' }, { t: 'circ', x: -12, y: -22, r: 4.4, c: 'b', lw: 2 }, { t: 'circ', x: 12, y: -22, r: 4.4, c: 'b', lw: 2 }], eyes: [{ x: 16, y: -26, r: 3.4 }] } });
  B1('dozer', { name: T2('ゴリゴリドーザー', 'Dozer Rumble'), short: T2('ドーザー', 'Dozer'), tag: T2('バリアをくだく重戦車', 'Shield crusher'),
    desc: T2('ブルドーザー。突進は強い当たりでも ひるまず、まもりを大きくけずる。ジャンプは1回で低い。', 'A bulldozer. Its rush shrugs off weak hits and chews shields up. One short jump only.'),
    color: '#e8b02a', color2: '#5a5148', w: 54, h: 52, weight: 142, run: 2.6, acc: 0.4, air: 2.1, aacc: 0.12, jump: 9.2, dj: 8.4, grav: 0.48, fall: 9.8, ff: 13.6, jmax: 1, stats: { speed: 1, power: 5, weight: 5, reach: 2, recov: 1 }, arch: 'power', sig: 'shield-crusher', ul: { w: 34 },
    kit: { tpl: 'bulk', reach: 0.95, pw: 1.28, ov: { jab: { sp: 1.2, a: 4, hb: [[34, -26, 50, -26, 22]] }, ftilt: { hb: [[34, -24, 56, -24, 24]], dt: 4 }, utilt: { hb: [[20, -30, 10, -64, 24]] }, dtilt: { hb: [[40, -6, 60, -6, 22]] }, fsmash: { hb: [[34, -28, 66, -28, 30]], dt: 10, bkb: 34 }, nair: { rr: 1.15, a: 14 }, dair: { ll: 24, a: 8 } } },
    sp: {
      N: sp({ kind: 'melee', fx: 'prop', s: 12, a: 6, t: 38, dmg: 10, bkb: 18, kbg: 24, ang: 70, hb: [[30, -30, 60, -58, 26]] }),
      S: sp({ kind: 'dash', fx: 'shield', s: 16, a: 22, t: 58, v: 4.6, arm: [8, 36], sbk: 16, dmg: 12, bkb: 24, kbg: 30, ang: 36, hb: [[26, -28, 58, -28, 30]] }),
      U: sp({ rr: 165, kind: 'lift', fx: 'prop', s: 10, a: 30, t: 46, rv: 5.8, dv: 1.4, dmg: 0, hb: [] }),
      D: sp({ kind: 'melee', fx: 'ring', s: 16, a: 8, t: 50, sbk: 12, dmg: 12, bkb: 22, kbg: 28, ang: 60, hb: [[40, -6, 64, -6, 30], [-40, -6, -64, -6, 30]] }),
    },
    spr: { legs: { k: 'tread', w: 50, c: 'k' }, arms: { none: 1, sx: 0, sy: 0, rx: 0, ry: 0, w: 0, c: 'a', hand: 'none' }, back: [{ t: 'box', x: -16, y: -58, w: 5, h: 16, r: 1, c: 'k' }],
      body: [{ t: 'box', x: -4, y: -28, w: 42, h: 24, r: 5, c: 'a' }, { t: 'box', x: -8, y: -48, w: 22, h: 22, r: 4, c: 'a' }, { t: 'box', x: -6, y: -49, w: 14, h: 12, r: 2, c: '#bfe6f5' }, { t: 'box', x: 26, y: -22, w: 8, h: 36, r: 2, c: 'b' }, { t: 'poly', pts: [30, -42, 36, -40, 36, -4, 30, -4], c: 'b' }], eyes: [{ x: 0, y: -49, r: 3 }] } });
  B1('paper', { name: T2('かみひこうき ヒコ', 'Paper Glide Hiko'), short: T2('ヒコ', 'Hiko'), tag: T2('ブーメランで飛ぶ', 'Boomerang plane'),
    desc: T2('折り紙の紙ひこうき。紙のひこうきを投げると、飛んでもどってくる。とても軽くて4回ジャンプできる。', 'A paper plane. The plane it throws flies out and comes back. Very light, with four jumps.'),
    color: '#f4f2ea', color2: '#4aa3ff', w: 28, h: 52, weight: 62, run: 3.5, acc: 0.5, air: 3.2, aacc: 0.3, jump: 10.6, dj: 9.8, grav: 0.36, fall: 6.8, ff: 9.8, jmax: 3, stats: { speed: 3, power: 1, weight: 1, reach: 3, recov: 5 }, arch: 'air', sig: 'paper-boomerang', ul: { s: ['ledge', 12] },
    kit: { tpl: 'floaty', pw: 1.5, sp: 0.85, ov: { jab: { hb: [[22, -34, 34, -38, 11]] }, ftilt: { hb: [[24, -34, 52, -42, 13]], ang: 50 }, utilt: { hb: [[10, -44, -8, -76, 14]] }, fair: { hb: [[18, -34, 44, -48, 14]] }, bair: { ang: 160 }, dair: { hb: [[0, 4, 6, 14, 16]] }, fsmash: { hb: [[24, -42, 60, -52, 17]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 12, a: 1, t: 36, proj: { sp: 7, vy: -0.4, g: 0, r: 11, life: 120, dmg: 4, bkb: 7, kbg: 4, ang: 50, kind: 'plane', pierce: 1, rh: 16 } }),
      S: sp({ kind: 'melee', fx: 'slash', s: 10, a: 6, t: 38, dmg: 7, bkb: 14, kbg: 20, ang: 35, hb: [[18, -44, 60, -62, 14], [60, -62, 74, -46, 12]] }),
      U: sp({ rr: 170, kind: 'fold', fx: 'springup', s: 5, a: 60, t: 74, rv: 7.2, sink: 1.1, dv: 3.6, dmg: 0, hb: [] }),
      D: sp({ kind: 'pound', fx: 'body', s: 12, t: 46, fv: 9, dmg: 6, bkb: 12, kbg: 14, ang: -76, hb: [[0, 8, 0, 8, 20]], land: { a: 5, dmg: 5, bkb: 16, kbg: 14, ang: 60, hb: [[30, -8, 30, -8, 22], [-30, -8, -30, -8, 22]] } }),
    },
    spr: { legs: { k: 'legs', c: 'B', w: 4 }, arms: { sx: 8, sy: -36, rx: 14, ry: -30, w: 4, c: 'A', hand: 'none' }, back: [{ t: 'poly', pts: [-4, -44, -26, -34, -4, -20], c: 'A' }],
      body: [{ t: 'poly', pts: [-10, -16, 0, -62, 10, -16], c: 'a' }, { t: 'poly', pts: [0, -62, 0, -16, 10, -16], c: 'B', lw: 0 }, { t: 'poly', pts: [4, -40, 24, -26, 4, -22], c: 'b' }], eyes: [{ x: 2, y: -46, r: 3.2 }] } });
  B1('patrol', { name: T2('パトリン', 'Patrolin'), short: T2('パトリン', 'Patrolin'), tag: T2('サイレンで「手じょう」', 'Siren cuffs'),
    desc: T2('おもちゃのおまわりさん。下とくぎでサイレンをならすと、しばらくのあいだ とくぎが手じょうわざに変わる。', 'A toy cop. Down-special sounds the siren: for a while, his specials become handcuff moves.'),
    color: '#3b5bd0', color2: '#f2f2f2', w: 28, h: 62, weight: 86, run: 4.4, acc: 0.7, air: 3.0, aacc: 0.24, jump: 11.0, dj: 10.2, grav: 0.44, fall: 8.8, ff: 13, stats: { speed: 4, power: 3, weight: 2, reach: 3, recov: 3 }, arch: 'rush', sig: 'siren-cuffs', ul: { w: 38 },
    kit: { tpl: 'brawler', pw: 1.5, ov: { jab: { sp: 0.7, hb: [[26, -34, 38, -34, 12]] }, ftilt: { hb: [[28, -36, 56, -30, 13]], ang: 28 }, utilt: { hb: [[16, -48, -4, -72, 15]] }, fsmash: { hb: [[28, -38, 70, -28, 16]], dt: -2 }, bair: { reach: 1.1 }, dair: { hb: [[8, 4, 12, -8, 16]], ll: 14 } } },
    sp: {
      N: sp({ kind: 'dash', fx: 'punch', s: 8, a: 8, t: 34, v: 6, dmg: 6, bkb: 14, kbg: 18, ang: 40, hb: [[16, -26, 34, -26, 18]] }),
      S: sp({ kind: 'melee', fx: 'slash', s: 8, a: 4, t: 34, dmg: 7, bkb: 14, kbg: 18, ang: 30, hb: [[30, -36, 80, -30, 13]] }),
      U: sp({ rr: 260, kind: 'magnet', fx: 'prop', s: 8, a: 28, t: 42, range: 260, sp: 11, acc: 0.9, rv: 8.8, dmg: 0, hb: [] }),
      D: sp({ kind: 'stance', fx: 'horn', s: 10, a: 1, t: 36, dur: 420, hb: [] }),
    },
    spb: {
      N: sp({ kind: 'cmdgrab', fx: 'hug', s: 9, a: 4, t: 42, dmg: 7, bkb: 22, kbg: 24, ang: 50, hb: [[30, -30, 42, -30, 24]] }),
      S: sp({ kind: 'proj', fx: 'cast', s: 10, a: 1, t: 30, proj: { sp: 9, vy: 0, g: 0, r: 9, life: 30, dmg: 4, bkb: 6, kbg: 0, ang: 20, kind: 'cuff' } }),
      U: sp({ kind: 'rise', fx: 'prop', s: 5, a: 22, t: 44, rv: 11.4, dv: 2.8, ang: 80, dmg: 5, bkb: 16, kbg: 16, hb: [[8, -56, 8, -80, 20]] }),
    },
    spr: { legs: { k: 'legs', c: 'a', w: 7 }, arms: { sx: 12, sy: -36, rx: 18, ry: -26, w: 6, c: 'a', hand: 'baton' }, back: [],
      body: [{ t: 'box', x: 0, y: -24, w: 24, h: 26, r: 5, c: 'a' }, { t: 'box', x: 0, y: -26, w: 6, h: 22, r: 1, c: 'b', lw: 0 }, { t: 'circ', x: 0, y: -48, r: 11, c: '#f2c9a0' }, { t: 'box', x: 0, y: -57, w: 26, h: 8, r: 3, c: 'k' }, { t: 'box', x: 5, y: -52, w: 22, h: 3, r: 1, c: 'k', lw: 0 }, { t: 'siren', x: 0, y: -64 }], eyes: [{ x: 4, y: -47, r: 3 }] } });
  B1('reed', { name: T2('ハモニ', 'Reed Rascal'), short: T2('ハモニ', 'Hamoni'), tag: T2('ため吹きの音波', 'Charged breath'),
    desc: T2('ハーモニカのいたずらっこ。とくぎ横をおし続けると息をためて、はなすと大きな音波を出す。下とくぎで相手を吹きとばす風。', 'A harmonica rascal. Hold side-special to charge a breath, release for a big sound wave. Down-special is a blowing wind.'),
    color: '#cfd8dc', color2: '#e05a5a', w: 30, h: 44, weight: 76, run: 3.2, jump: 11.6, dj: 10.8, grav: 0.4, fall: 7.4, stats: { speed: 3, power: 2, weight: 2, reach: 4, recov: 3 }, arch: 'zone', sig: 'breath-charge', ul: { s: ['grab', 20] },
    kit: { tpl: 'floaty', reach: 1.25, pw: 1.32, sp: 0.85, ov: { jab: { hb: [[26, -26, 38, -26, 12]], sp: 0.9 }, ftilt: { hb: [[26, -26, 56, -26, 12]] }, utilt: { hb: [[6, -36, 6, -62, 16]] }, dtilt: { hb: [[30, -6, 48, -6, 11]] }, fsmash: { hb: [[26, -30, 82, -30, 14]], a: 8 }, nair: { fx: 'kick' } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 10, a: 1, t: 26, proj: { sp: 6.2, vy: 0, g: 0, r: 10, life: 56, dmg: 3.2, bkb: 7, kbg: 6, ang: 30, kind: 'note' } }),
      S: sp({ kind: 'charge', fx: 'cast', s: 10, a: 1, t: 36, cmax: 50, proj: { sp: 6, vy: 0, g: 0, r: 13, life: 70, dmg: 4, bkb: 8, kbg: 8, ang: 28, kind: 'wail' } }),
      U: sp({ rr: 135, kind: 'parachute', fx: 'horn', s: 5, a: 70, t: 82, rv: 3.4, sink: 1.0, dv: 3.0, dmg: 0, hb: [] }),
      D: sp({ kind: 'zone', fx: 'cast', s: 12, a: 1, t: 40, proj: { kind: 'gale', r: 50, rad: 130, life: 28, pw: -1.0, ox: 60, oy: 28, nohit: 1 } }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 4 }, arms: { sx: 10, sy: -30, rx: 14, ry: -22, w: 4, c: 'k', hand: 'ball' }, back: [],
      body: [{ t: 'box', x: 0, y: -28, w: 34, h: 18, r: 3, c: 'a' }, { t: 'box', x: 0, y: -33, w: 34, h: 4, r: 1, c: 'b', lw: 0 }, { t: 'holes', x: -12, y: -26, n: 6, dx: 5 }, { t: 'box', x: 18, y: -28, w: 6, h: 14, r: 2, c: 'b' }], eyes: [{ x: 8, y: -38, r: 4 }, { x: -5, y: -38, r: 3.4 }] } });
  B1('riff', { name: T2('ギターのギル', 'Gil the Guitar'), short: T2('ギル', 'Gil'), tag: T2('はね返る音符', 'Ricochet chords'),
    desc: T2('ギターのおもちゃ。かき鳴らした音符はかべや床で何度もはね返る。大きなスイングは長いリーチ。', 'A toy guitar. His chords ricochet off floors and walls, and his big swing has long reach.'),
    color: '#b0402a', color2: '#f0d080', w: 32, h: 62, weight: 88, run: 4.2, jump: 12.0, dj: 10.6, stats: { speed: 3, power: 4, weight: 3, reach: 4, recov: 3 }, arch: 'reach', sig: 'ricochet-chord', ul: { w: 42 },
    kit: { tpl: 'blade', pw: 1.3, ov: { jab: { hb: [[26, -34, 40, -30, 11]] }, ftilt: { hb: [[28, -34, 78, -26, 12]], a: 6 }, utilt: { hb: [[18, -50, -12, -84, 14]], a: 7 }, fsmash: { hb: [[22, -60, 86, -8, 18]], a: 7, dt: 8 }, usmash: { hb: [[20, -30, 6, -100, 17]] }, bair: { hb: [[-32, -34, -66, -22, 14]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 12, a: 1, t: 32, proj: { sp: 7, vy: -1, g: 0.18, r: 9, life: 110, dmg: 5, bkb: 9, kbg: 8, ang: 30, kind: 'chord', bounce: 1, bnc: 1 } }),
      S: sp({ kind: 'melee', fx: 'slash', s: 14, a: 6, t: 46, dmg: 12, bkb: 24, kbg: 34, ang: 36, hb: [[24, -56, 80, -12, 20]] }),
      U: sp({ rr: 175, kind: 'spinup', fx: 'spin', s: 12, a: 36, t: 56, rv: 5.4, dv: 2.0, dmg: 1.8, bkb: 6, kbg: 0, ang: 80, hb: [[0, -34, 0, -34, 44]] }),
      D: sp({ kind: 'spin', fx: 'spin', s: 6, a: 30, t: 52, rh: 6, dmg: 1.6, bkb: 5, kbg: 0, ang: 60, fin: { dmg: 4, bkb: 18, kbg: 18, ang: 55 }, hb: [[0, -30, 0, -30, 38]] }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 5 }, arms: { sx: 8, sy: -26, rx: 14, ry: -18, w: 4.5, c: 'k', hand: 'ball' }, back: [{ t: 'box', x: -6, y: -66, w: 8, h: 22, r: 2, c: 'k' }, { t: 'box', x: -6, y: -80, w: 10, h: 8, r: 2, c: 'b' }],
      body: [{ t: 'ell', x: 0, y: -14, w: 34, h: 26, c: 'a' }, { t: 'ell', x: -2, y: -34, w: 26, h: 24, c: 'a' }, { t: 'circ', x: -2, y: -22, r: 7, c: 'k' }, { t: 'box', x: 8, y: -12, w: 9, h: 3, r: 1, c: 'b', lw: 0 }, { t: 'line', x0: -8, y0: -10, x1: 12, y1: -10, w: 1.6, c: 'b' }], eyes: [{ x: -6, y: -36, r: 3.6 }, { x: 3, y: -36, r: 3.2 }] } });
  B1('drum', { name: T2('ドラムコ', 'Snare Sentry'), short: T2('ドラムコ', 'Drumko'), tag: T2('飛び道具を吸収', 'Absorbs shots'),
    desc: T2('小太鼓の衛兵。下とくぎで構えると、飛んできた飛び道具を吸いこんで回復し、次の攻撃が強くなる。', 'A snare-drum guard. Down-special catches projectiles: it heals, and the next attack hits harder.'),
    color: '#5a6ab8', color2: '#e8e0d0', w: 30, h: 48, weight: 94, run: 3.7, jump: 11.6, dj: 10.6, grav: 0.42, stats: { speed: 2, power: 3, weight: 4, reach: 3, recov: 2 }, arch: 'counter', sig: 'rhythm-absorb', ul: { s: ['counter', 6] },
    kit: { tpl: 'brawler', reach: 1.1, ov: { jab: { sp: 0.85, a: 2, hb: [[26, -34, 40, -34, 12]] }, ftilt: { hb: [[28, -36, 48, -36, 14]], dt: 0 }, utilt: { hb: [[10, -46, 0, -72, 15]] }, dsmash: { hb: [[40, -10, 40, -10, 20], [-40, -10, -40, -10, 20]], a: 8 }, fair: { hb: [[26, -34, 40, -22, 17]] }, nair: { a: 6, rr: 1.0 } } },
    sp: {
      N: sp({ kind: 'melee', fx: 'punch', s: 6, a: 3, t: 24, dmg: 5, bkb: 12, kbg: 14, ang: 50, hb: [[26, -34, 40, -34, 12]] }),
      S: sp({ kind: 'dash', fx: 'shield', s: 14, a: 14, t: 52, v: 4.4, dmg: 9, bkb: 20, kbg: 26, ang: 40, hb: [[22, -34, 44, -34, 22]] }),
      U: sp({ rr: 210, kind: 'pogo', fx: 'prop', s: 5, a: 42, t: 56, g: 14, rv: 8.6, dv: 2.4, dmg: 3, bkb: 10, kbg: 10, ang: -70, hb: [[0, 6, 0, 6, 26]] }),
      D: sp({ kind: 'absorb', fx: 'ring', s: 4, a: 24, t: 52, hb: [] }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 6 }, arms: { sx: 12, sy: -34, rx: 18, ry: -24, w: 5, c: 'b', hand: 'stick' }, back: [],
      body: [{ t: 'box', x: 0, y: -22, w: 30, h: 30, r: 3, c: 'a' }, { t: 'zig', x: 0, y: -22, w: 30, h: 26 }, { t: 'ell', x: 0, y: -37, w: 30, h: 9, c: 'b' }, { t: 'ell', x: 0, y: -7, w: 30, h: 7, c: 'b' }], eyes: [{ x: 4, y: -28, r: 4 }, { x: -6, y: -28, r: 3.4 }] } });
  B1('belle', { name: T2('オルゴールバレリーナ ベル', 'Music Box Belle'), short: T2('ベル', 'Belle'), tag: T2('おどる助っ人', 'Summons a dancer'),
    desc: T2('オルゴールの上でおどる人形。とくぎ横でちいさな踊り子を呼ぶ。踊り子は相手に近づいて、何度も当たる。', 'A music-box dancer. Side-special calls a little dancer who walks to the foe and keeps hitting.'),
    color: '#f2a0c0', color2: '#fff4f8', w: 30, h: 56, weight: 72, run: 3.4, acc: 0.5, air: 3.0, aacc: 0.26, jump: 11.2, dj: 10.4, grav: 0.4, fall: 7.6, ff: 11.4, jmax: 2, stats: { speed: 3, power: 2, weight: 1, reach: 2, recov: 4 }, arch: 'trick', sig: 'dancer-minion', ul: { w: 46 },
    kit: { tpl: 'floaty', ov: { jab: { sp: 0.9, hb: [[22, -34, 34, -34, 11]] }, ftilt: { hb: [[24, -22, 46, -16, 13]], ang: 55 }, utilt: { hb: [[12, -40, -6, -76, 14]], ang: 90 }, dtilt: { hb: [[28, -6, 48, -4, 12]] }, fsmash: { hb: [[22, -34, 52, -30, 22]], a: 6 }, nair: { rr: 1.3, a: 14 }, uair: { hb: [[4, -64, -4, -84, 20]] } } },
    sp: {
      N: sp({ kind: 'melee', fx: 'ring', s: 7, a: 6, t: 30, dmg: 5, bkb: 14, kbg: 14, ang: 60, hb: [[0, -34, 0, -34, 34]] }),
      S: sp({ kind: 'summon', fx: 'cast', s: 14, a: 1, t: 40, proj: { kind: 'dancer', r: 15, life: 240, dmg: 2.4, bkb: 6, kbg: 6, ang: 60, pierce: 1, rh: 24, ox: 44, oy: 16 } }),
      U: sp({ rr: 185, kind: 'spring', fx: 'spin', s: 5, a: 1, t: 48, g: 18, rv: 9.6, rv2: 9.0, dv: 4.2, dmg: 0, hb: [] }),
      D: sp({ kind: 'melee', fx: 'kick', s: 8, a: 5, t: 34, dmg: 6, bkb: 16, kbg: 18, ang: 85, hb: [[10, -30, -6, -80, 18]] }),
    },
    spr: { legs: { k: 'legs', c: 'A', w: 3.6 }, arms: { sx: 6, sy: -42, rx: 14, ry: -56, w: 3.6, c: 'A', hand: 'none' }, back: [{ t: 'circ', x: -4, y: -64, r: 6, c: 'B' }],
      body: [{ t: 'poly', pts: [-5, -30, -22, -10, 22, -10, 5, -30], c: 'a' }, { t: 'poly', pts: [-5, -30, -9, -46, 9, -46, 5, -30], c: 'b' }, { t: 'circ', x: 0, y: -54, r: 9, c: '#f6d9c4' }, { t: 'circ', x: -4, y: -63, r: 5.4, c: 'B' }], eyes: [{ x: 3, y: -55, r: 2.8 }] } });
  B1('keys', { name: T2('ピアノ騎士', 'Key Knight'), short: T2('ケン', 'Ken'), tag: T2('白鍵と黒鍵の構え', 'White/black stance'),
    desc: T2('ピアノの鍵盤の騎士。下とくぎで「白鍵」と「黒鍵」の構えを切りかえる。白は広くて遅い、黒はせまくて速く重い。', 'A knight of piano keys. Down-special swaps white-key stance (wide, slow) and black-key stance (narrow, fast, heavy).'),
    color: '#262a30', color2: '#f4f4ee', w: 32, h: 60, weight: 112, run: 3.1, stats: { speed: 2, power: 4, weight: 4, reach: 4, recov: 3 }, arch: 'allround', sig: 'key-stance', ul: { s: ['smashKo', 10] },
    kit: { tpl: 'blade', reach: 1.2, pw: 0.9, ov: { jab: { hb: [[26, -34, 46, -34, 12]] }, ftilt: { hb: [[28, -36, 74, -32, 14]] }, utilt: { hb: [[12, -48, -4, -74, 14]] }, dtilt: { hb: [[34, -6, 60, -6, 12]] }, fsmash: { hb: [[26, -44, 80, -22, 18]], a: 6 }, dsmash: { hb: [[42, -8, 56, -8, 15], [-42, -8, -56, -8, 15]] } } },
    sp: {
      N: sp({ kind: 'melee', fx: 'slash', s: 9, a: 6, t: 34, dmg: 6, bkb: 14, kbg: 18, ang: 30, hb: [[24, -30, 84, -30, 16]] }),
      S: sp({ kind: 'proj', fx: 'cast', s: 12, a: 1, t: 36, proj: { sp: 8, vy: 0, g: 0, r: 9, life: 50, dmg: 6, bkb: 10, kbg: 10, ang: 30, kind: 'key' } }),
      U: sp({ rr: 240, kind: 'multihop', fx: 'prop', s: 6, a: 1, t: 50, n: 2, g: 22, rv: 11.2, dv: 1.4, dmg: 0, hb: [] }),
      D: sp({ kind: 'stance', fx: 'horn', s: 8, a: 1, t: 30, dur: 0, hb: [] }),
    },
    spb: {
      N: sp({ kind: 'melee', fx: 'slash', s: 5, a: 3, t: 24, dmg: 9, bkb: 20, kbg: 30, ang: 40, hb: [[30, -34, 54, -34, 9]] }),
      S: sp({ kind: 'proj', fx: 'cast', s: 11, a: 1, t: 46, proj: { sp: 10.5, vy: 0, g: 0, r: 6, life: 40, dmg: 8, bkb: 14, kbg: 14, ang: 25, kind: 'key' } }),
      U: sp({ kind: 'rise', fx: 'prop', s: 5, a: 22, t: 44, rv: 11.6, dv: 2.0, ang: 80, dmg: 6, bkb: 16, kbg: 16, hb: [[10, -56, 6, -84, 16]] }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 7 }, arms: { sx: 13, sy: -38, rx: 18, ry: -28, w: 6, c: 'a', hand: 'sword' }, back: [{ t: 'box', x: -16, y: -40, w: 4, h: 30, r: 1, c: 'b' }],
      body: [{ t: 'box', x: 0, y: -26, w: 26, h: 30, r: 4, c: 'a' }, { t: 'keysrow', x: 0, y: -14, w: 26 }, { t: 'box', x: 0, y: -52, w: 22, h: 20, r: 6, c: 'a' }, { t: 'box', x: 0, y: -56, w: 22, h: 4, r: 1, c: 'b', lw: 0 }, { t: 'box', x: 0, y: -66, w: 6, h: 12, r: 1, c: 'b' }, { t: 'box', x: -9, y: -66, w: 4, h: 8, r: 1, c: 'b' }], eyes: [{ x: 4, y: -50, r: 3 }] } });
  B1('stapler', { name: T2('ガチャンホッチ', 'Clamp Chomp'), short: T2('ホッチ', 'Hotchi'), tag: T2('針の弾数がある', 'Limited staples'),
    desc: T2('ホッチキスのおもちゃ。針の弾は6発まで。なくなったら下とくぎで補充する（その間はすきだらけ）。つかみは強い。', 'A stapler toy. Six staples, then reload with down-special (leaving you open). Strong chomp grab.'),
    color: '#6b7d8a', color2: '#d0453f', w: 48, h: 32, weight: 100, run: 3.9, jump: 10.0, dj: 9.4, stats: { speed: 3, power: 3, weight: 3, reach: 2, recov: 2 }, arch: 'grab', sig: 'staple-ammo', ul: { w: 50 },
    kit: { tpl: 'swift', pw: 1.1, ov: { jab: { hb: [[30, -18, 42, -18, 12]] }, ftilt: { hb: [[30, -18, 54, -18, 14]] }, utilt: { hb: [[18, -26, 6, -50, 16]] }, dtilt: { hb: [[36, -4, 56, -4, 12]] }, fsmash: { hb: [[30, -22, 66, -16, 20]] }, nair: { rr: 0.9 }, fair: { hb: [[26, -20, 44, -14, 16]] } } },
    sp: {
      N: sp({ kind: 'ammo', fx: 'gun', s: 7, a: 1, t: 18, mag: 6, proj: { sp: 11, vy: 0, g: 0, r: 7, life: 36, dmg: 2.6, bkb: 5, kbg: 3, ang: 25, kind: 'staple' } }),
      S: sp({ kind: 'cmdgrab', fx: 'hug', s: 10, a: 4, t: 44, dmg: 11, bkb: 30, kbg: 38, ang: 50, hb: [[30, -26, 46, -22, 22]] }),
      U: sp({ rr: 215, kind: 'slingshot', fx: 'springup', s: 5, d: 6, a: 12, t: 34, back: 1.4, sp: 9.6, rv: 3.6, dmg: 0, hb: [] }),
      D: sp({ kind: 'reload', fx: 'cast', s: 4, a: 1, t: 44, mag: 6, hb: [] }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 7 }, arms: { none: 1, sx: 0, sy: 0, rx: 0, ry: 0, w: 0, c: 'a', hand: 'none' }, back: [{ t: 'box', x: -20, y: -16, w: 8, h: 10, r: 2, c: 'k' }],
      body: [{ t: 'box', x: 0, y: -12, w: 44, h: 14, r: 4, c: 'a' }, { t: 'jaw', x: 2, y: -24, w: 42, h: 12, c: 'b' }, { t: 'box', x: 12, y: -4, w: 12, h: 4, r: 1, c: 'k', lw: 0 }], eyes: [{ x: 8, y: -30, r: 4 }, { x: -6, y: -30, r: 3.4 }] } });
  B1('sushi', { name: T2('スシレーン', 'Conveyor Sushi'), short: T2('スシ', 'Sushi'), tag: T2('転がって加速', 'Rolls up speed'),
    desc: T2('回転ずしのお皿。とくぎ（ふつう）で転がり、だんだん速くなって何度も当たる。お皿を投げるとはね返る。', 'A conveyor sushi plate. Plain special rolls faster and faster, hitting repeatedly. Its thrown plate bounces.'),
    color: '#f06a5a', color2: '#f4efe0', w: 38, h: 40, weight: 82, run: 4.4, acc: 0.65, air: 3.2, aacc: 0.26, jump: 11.2, dj: 10.4, grav: 0.44, fall: 8.8, ff: 13, stats: { speed: 5, power: 2, weight: 2, reach: 2, recov: 3 }, arch: 'rush', sig: 'plate-roll', ul: { s: ['flick', 30] },
    kit: { tpl: 'swift', reach: 0.9, pw: 1.29, ov: { jab: { hb: [[22, -22, 34, -22, 12]] }, ftilt: { hb: [[24, -22, 44, -22, 13]], ang: 42 }, utilt: { hb: [[8, -34, 0, -56, 14]] }, dtilt: { hb: [[26, -4, 42, -4, 12]] }, fsmash: { hb: [[24, -24, 52, -20, 18]] }, nair: { a: 12, rr: 1.15 }, fair: { hb: [[22, -22, 40, -16, 15]] } } },
    sp: {
      N: sp({ kind: 'roll', fx: 'spin', s: 6, a: 28, t: 52, v0: 3.5, vmax: 8.6, acc: 0.25, rh: 7, dmg: 3, bkb: 8, kbg: 6, ang: 55, hb: [[0, -22, 0, -22, 26]] }),
      S: sp({ kind: 'proj', fx: 'cast', s: 12, a: 1, t: 34, proj: { sp: 7, vy: -2, g: 0.3, r: 12, life: 80, dmg: 5, bkb: 9, kbg: 9, ang: 45, kind: 'plate', bounce: 1, bnc: 1 } }),
      U: sp({ rr: 230, kind: 'ripple', fx: 'spin', s: 5, a: 18, t: 34, sp: 10.4, per: 6, amp: 4.2, lift: 3.2, dmg: 0, hb: [] }),
      D: sp({ kind: 'melee', fx: 'prop', s: 13, a: 5, t: 40, dmg: 9, bkb: 20, kbg: 26, ang: 80, hb: [[30, -60, 64, -6, 14]] }),
    },
    spr: { legs: { k: 'wheels', c: 'k', w: 6 }, arms: { sx: 10, sy: -26, rx: 15, ry: -18, w: 4, c: 'b', hand: 'ball' }, back: [],
      body: [{ t: 'ell', x: 0, y: -8, w: 42, h: 12, c: 'b' }, { t: 'box', x: 0, y: -20, w: 28, h: 14, r: 5, c: 'w' }, { t: 'box', x: 0, y: -31, w: 30, h: 10, r: 5, c: 'a' }, { t: 'box', x: 0, y: -20, w: 28, h: 4, r: 1, c: 'k', lw: 0 }, { t: 'circ', x: 8, y: -36, r: 3, c: '#7fcf6a' }], eyes: [{ x: 5, y: -30, r: 3.2 }, { x: -6, y: -30, r: 2.8 }] } });
  B1('void', { name: T2('ブラックホール缶', 'Void Can'), short: T2('ボイド', 'Void'), tag: T2('引きよせる重力', 'Gravity well'),
    desc: T2('なぞの缶詰。下とくぎの「穴」は近くの相手を引きよせる。ゆっくり飛ぶ黒い玉に当たると動きが重くなる。', 'A mysterious can. Down-special opens a well that pulls nearby foes in; its slow dark orb makes you sluggish.'),
    color: '#2f2640', color2: '#9a6bf0', w: 38, h: 44, weight: 118, run: 3.1, jump: 9.4, dj: 8.6, grav: 0.5, fall: 10.2, air: 2.2, stats: { speed: 2, power: 3, weight: 3, reach: 3, recov: 3 }, arch: 'counter', sig: 'gravity-well', ul: { w: 54 },
    kit: { tpl: 'bulk', pw: 1.35, sp: 1.0, ov: { jab: { hb: [[24, -30, 38, -30, 14]] }, ftilt: { hb: [[26, -30, 52, -30, 15]], ang: 40 }, utilt: { hb: [[6, -44, 0, -70, 18]] }, dtilt: { hb: [[28, -6, 48, -6, 14]] }, fsmash: { hb: [[26, -34, 60, -26, 22]], dt: 4 }, usmash: { hb: [[8, -44, -6, -92, 22]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 18, a: 1, t: 46, proj: { sp: 3.0, vy: 0, g: 0, r: 22, life: 100, dmg: 5, bkb: 8, kbg: 8, ang: 30, kind: 'void' } }),
      S: sp({ kind: 'melee', fx: 'lid', s: 14, a: 6, t: 44, dmg: 11, bkb: 22, kbg: 30, ang: 40, hb: [[20, -70, 50, -14, 28]] }),
      U: sp({ rr: 700, kind: 'dropin', fx: 'puff', s: 6, d: 26, t: 46, ox: 0, oy: -60, dmg: 0, hb: [] }),
      D: sp({ kind: 'zone', fx: 'cast', s: 16, a: 1, t: 46, proj: { kind: 'well', r: 44, rad: 140, life: 200, pw: 0.85, ox: 70, oy: 30, nohit: 1 } }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 6 }, arms: { sx: 12, sy: -30, rx: 18, ry: -20, w: 5, c: 'k', hand: 'ball' }, back: [{ t: 'ringo', x: 0, y: -26, w: 56, h: 14, c: 'b' }],
      body: [{ t: 'box', x: 0, y: -26, w: 28, h: 42, r: 5, c: 'a' }, { t: 'box', x: 0, y: -24, w: 28, h: 14, r: 1, c: 'b', lw: 0 }, { t: 'ell', x: 0, y: -48, w: 28, h: 8, c: 'B' }, { t: 'circ', x: 8, y: -52, r: 3, c: 'w' }, { t: 'swirl', x: 0, y: -24, r: 8 }], eyes: [{ x: 5, y: -36, r: 3.6 }, { x: -6, y: -36, r: 3.2 }] } });
  B1('comet', { name: T2('すいせいキッド', 'Comet Kid'), short: T2('キッド', 'Kid'), tag: T2('星のしるしにワープ', 'Star beacon warp'),
    desc: T2('流れ星の子。下とくぎで星のしるしを置いて、もう一度おすとそこへワープして はじける。とても速い。', 'A shooting-star kid. Down-special drops a star; press again to warp back to it with a burst. Very fast.'),
    color: '#4aa3ff', color2: '#ffd23f', w: 26, h: 42, weight: 66, run: 5.0, acc: 0.72, air: 3.5, aacc: 0.3, jump: 11.4, dj: 10.6, grav: 0.42, fall: 8.8, ff: 13.4, jmax: 2, stats: { speed: 5, power: 2, weight: 1, reach: 2, recov: 4 }, arch: 'rush', sig: 'star-beacon', ul: { s: ['maxCmb', 7] },
    kit: { tpl: 'brawler', pw: 1.18, sp: 0.8, ov: { jab: { sp: 0.65, hb: [[22, -28, 32, -28, 10]] }, ftilt: { hb: [[24, -28, 42, -28, 11]], ang: 55 }, utilt: { hb: [[8, -40, 0, -62, 12]] }, dtilt: { hb: [[24, -4, 40, -4, 10]] }, fsmash: { hb: [[24, -30, 54, -26, 15]], dt: -6 }, nair: { a: 8, rr: 1.1 }, fair: { hb: [[20, -28, 42, -20, 13]] }, dair: { hb: [[4, 6, 8, -4, 13]], ll: 10 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 6, a: 1, t: 20, proj: { sp: 12.5, vy: 0, g: 0, r: 7, life: 34, dmg: 3.8, bkb: 7, kbg: 6, ang: 20, kind: 'tailstar' } }),
      S: sp({ kind: 'dash', fx: 'kick', s: 8, a: 10, t: 40, v: 11.5, dmg: 7, bkb: 16, kbg: 20, ang: 40, hb: [[0, -26, 18, -26, 16]] }),
      U: sp({ rr: 220, kind: 'ghostrise', fx: 'cast', s: 5, a: 18, t: 30, i: 6, rv: 12.4, dv: 5.2, dmg: 0, hb: [] }),
      D: sp({ kind: 'beacon', fx: 'ring', s: 10, a: 8, t: 40, dmg: 6, bkb: 18, kbg: 22, ang: 70, hb: [[0, -30, 0, -30, 34]] }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 5 }, arms: { sx: 8, sy: -28, rx: 14, ry: -20, w: 4.4, c: 'b', hand: 'ball' }, back: [{ t: 'poly', pts: [-10, -40, -44, -46, -30, -34, -46, -26, -10, -30], c: 'a', anim: 'wag' }],
      body: [{ t: 'ell', x: 0, y: -20, w: 20, h: 22, c: 'a' }, { t: 'circ', x: 0, y: -40, r: 12, c: 'b' }, { t: 'star', x: 0, y: -56, r: 8, n: 5, c: 'b' }], eyes: [{ x: 5, y: -41, r: 3.4 }] } });

  // ------------------------------------------------------------------------------------------------ 第3弾：さらに16人（Batch 2）
  B1('mirror', { name: T2('てかがみ ミラ', 'Mira the Hand Mirror'), short: T2('ミラ', 'Mira'), tag: T2('飛び道具をはね返す鏡', 'Mirror wall'),
    desc: T2('てかがみ。下とくぎで鏡のかべを立てると、相手の飛び道具が持ち主を変えてはね返る。光の線は相手をつらぬく。', 'A hand mirror. Down-special stands up a mirror wall that turns enemy projectiles back; her light ray pierces.'),
    color: '#8ec9e8', color2: '#f4f4f6', w: 28, h: 56, weight: 78, run: 3.6, acc: 0.55, air: 3.1, aacc: 0.26, jump: 11.2, dj: 10.4, grav: 0.4, fall: 7.6, ff: 11.8, jmax: 2, stats: { speed: 3, power: 2, weight: 1, reach: 3, recov: 4 }, arch: 'zone', sig: 'mirror-wall', ul: { w: 58 },
    kit: { tpl: 'zoner', pw: 1.55, sp: 0.95, reach: 1.1, ov: { jab: { hb: [[24, -30, 36, -30, 11]] }, ftilt: { hb: [[26, -32, 58, -36, 12]] }, utilt: { hb: [[8, -44, 6, -78, 14]] }, fsmash: { hb: [[26, -34, 64, -30, 20]], a: 5 }, nair: { rr: 1.2 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 9, a: 1, t: 26, proj: { sp: 13, vy: 0, g: 0, r: 5, life: 24, dmg: 3.2, bkb: 6, kbg: 4, ang: 15, kind: 'ray', pierce: 1, rh: 99 } }),
      S: sp({ kind: 'melee', fx: 'shield', s: 12, a: 5, t: 38, dmg: 8, bkb: 20, kbg: 26, ang: 40, hb: [[28, -34, 56, -34, 18]] }),
      U: sp({ rr: 136, kind: 'blink', fx: 'spin', s: 12, t: 34, td: 170, dirs: [[1, -1], [0, -1]], dmg: 0, hb: [] }),
      D: sp({ kind: 'zone', fx: 'cast', s: 12, a: 1, t: 38, proj: { kind: 'mirror', r: 14, rad: 52, life: 260, ox: 56, oy: 30, nohit: 1 } }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 4 }, arms: { sx: 8, sy: -30, rx: 13, ry: -22, w: 4, c: 'k', hand: 'ball' }, back: [],
      body: [{ t: 'box', x: 0, y: -24, w: 5, h: 22, r: 2, c: 'b' }, { t: 'ell', x: 0, y: -46, w: 28, h: 34, c: 'b' }, { t: 'ell', x: 0, y: -46, w: 20, h: 26, c: 'a', lw: 1.4 }, { t: 'line', x0: -5, y0: -54, x1: 0, y1: -48, w: 2, c: 'w' }], eyes: [{ x: 3, y: -42, r: 3.2 }, { x: -5, y: -42, r: 2.8 }] } });
  B1('sand', { name: T2('すなどけい サンディ', 'Sandy the Hourglass'), short: T2('サンディ', 'Sandy'), tag: T2('時間をおそくする', 'Time-slow zone'),
    desc: T2('すなどけい。下とくぎの「すなの輪」の中では、相手も飛び道具もゆっくりになる。すなつぶに当たっても遅くなる。', 'An hourglass. Inside its sand ring, foes and projectiles slow right down; sand grains slow you too.'),
    color: '#e8c878', color2: '#7a4a2a', w: 32, h: 60, weight: 100, run: 2.9, acc: 0.46, air: 2.5, aacc: 0.18, jump: 10.2, dj: 9.0, grav: 0.45, fall: 9.0, ff: 13, stats: { speed: 2, power: 3, weight: 3, reach: 3, recov: 2 }, arch: 'trap', sig: 'time-sand', ul: { s: ['hard', 8] },
    kit: { tpl: 'zoner', pw: 1.26, sp: 1.1, ov: { jab: { hb: [[26, -34, 40, -34, 14]], sp: 1.0 }, ftilt: { hb: [[28, -34, 52, -34, 15]], a: 5 }, dtilt: { hb: [[32, -6, 52, -6, 14]] }, usmash: { hb: [[10, -44, -2, -96, 22]], dt: 4 }, dair: { a: 9 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 12, a: 1, t: 34, proj: { sp: 7, vy: -2, g: 0.22, r: 8, life: 60, dmg: 3.6, bkb: 6, kbg: 6, ang: 40, kind: 'grain' } }),
      S: sp({ kind: 'melee', fx: 'prop', s: 14, a: 6, t: 44, dmg: 9, bkb: 22, kbg: 28, ang: 80, hb: [[18, -20, 44, -70, 20]] }),
      U: sp({ rr: 305, kind: 'chargeleap', fx: 'puff', s: 6, a: 30, t: 44, cmax: 14, sp0: 7.2, sp1: 2.2, dmg: 0, hb: [] }),
      D: sp({ kind: 'zone', fx: 'cast', s: 14, a: 1, t: 40, proj: { kind: 'sand', r: 50, rad: 120, life: 300, slow: 5, ox: 60, oy: 30, nohit: 1 } }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 5 }, arms: { sx: 10, sy: -34, rx: 15, ry: -24, w: 4, c: 'k', hand: 'ball' }, back: [],
      body: [{ t: 'box', x: 0, y: -62, w: 26, h: 5, r: 2, c: 'b' }, { t: 'box', x: 0, y: -8, w: 26, h: 5, r: 2, c: 'b' }, { t: 'poly', pts: [-11, -58, 11, -58, 2, -34, 11, -12, -11, -12, -2, -34], c: '#d8ecf4', lw: 2 }, { t: 'poly', pts: [-9, -14, 9, -14, 4, -22, -4, -22], c: 'a', lw: 0 }, { t: 'poly', pts: [-8, -56, 8, -56, 1, -40, -1, -40], c: 'a', lw: 0 }], eyes: [{ x: 4, y: -30, r: 3.2 }, { x: -4, y: -30, r: 2.8 }] } });
  B1('shroom', { name: T2('ドクキノコ キノコロ', 'Shroomo the Toadstool'), short: T2('キノコロ', 'Shroomo'), tag: T2('じわじわ毒', 'Poison over time'),
    desc: T2('おもちゃのキノコ。胞子に当たった相手は、しばらくじわじわダメージを受ける。足もとの胞子ふくろも同じ。', 'A toy toadstool. Spores poison: the foe slowly takes damage for a while. Spore pods on the floor do the same.'),
    color: '#c8392b', color2: '#f4efe0', w: 34, h: 48, weight: 88, run: 3.3, acc: 0.5, air: 2.9, aacc: 0.2, jump: 10.6, dj: 9.6, grav: 0.46, fall: 8.8, ff: 13, jmax: 1, stats: { speed: 3, power: 2, weight: 2, reach: 2, recov: 3 }, arch: 'trap', sig: 'poison-dot', ul: { w: 62 },
    kit: { tpl: 'floaty', pw: 1.08, sp: 0.9, rr: 1.15, ov: { jab: { hb: [[22, -26, 34, -26, 13]] }, ftilt: { hb: [[24, -24, 46, -24, 15]], ang: 55 }, utilt: { hb: [[8, -44, 0, -64, 18]] }, fsmash: { hb: [[24, -30, 50, -26, 22]], a: 6 }, nair: { a: 12 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 10, a: 1, t: 32, proj: { sp: 5.5, vy: -1, g: 0.08, r: 11, life: 60, dmg: 2, bkb: 3, kbg: 0, ang: 60, kind: 'spore' } }),
      S: sp({ kind: 'melee', fx: 'puff', s: 11, a: 6, t: 40, dmg: 8, bkb: 22, kbg: 26, ang: 88, hb: [[10, -60, 40, -70, 26]] }),
      U: sp({ rr: 105, kind: 'bubble', fx: 'springup', s: 6, a: 56, t: 70, rv: 1.9, dv: 2.4, dmg: 4, bkb: 14, kbg: 16, ang: 80, hb: [[0, -26, 0, -26, 34]] }),
      D: sp({ kind: 'mine', fx: 'cast', s: 12, a: 1, t: 38, proj: { kind: 'pod', max: 2, r: 18, life: 900, arm: 30, dmg: 2, bkb: 4, kbg: 0, ang: 80 } }),
    },
    spr: { legs: { k: 'legs', c: 'b', w: 7 }, arms: { sx: 9, sy: -20, rx: 14, ry: -14, w: 5, c: 'b', hand: 'none' }, back: [],
      body: [{ t: 'box', x: 0, y: -20, w: 18, h: 22, r: 6, c: 'b' }, { t: 'ell', x: 0, y: -40, w: 44, h: 28, c: 'a' }, { t: 'circ', x: -9, y: -44, r: 4.4, c: 'w', lw: 0 }, { t: 'circ', x: 8, y: -46, r: 3.6, c: 'w', lw: 0 }, { t: 'circ', x: 1, y: -36, r: 3, c: 'w', lw: 0 }], eyes: [{ x: 4, y: -22, r: 3.4 }, { x: -4, y: -22, r: 3 }] } });
  B1('camp', { name: T2('キャンプファイヤー ボンボ', 'Bonbo the Campfire'), short: T2('ボンボ', 'Bonbo'), tag: T2('たき火で強くなる', 'Fire aura'),
    desc: T2('たき火の精。下とくぎでたき火を灯し、その近くにいるあいだ、自分の攻撃が強くなる。', 'A campfire sprite. Down-special lights a fire, and while standing near it your attacks hit harder.'),
    color: '#ff8a2a', color2: '#6a4a2a', w: 38, h: 54, weight: 112, run: 3.0, acc: 0.46, air: 2.6, aacc: 0.18, jump: 10.0, dj: 9.2, grav: 0.46, fall: 9.0, ff: 13.2, stats: { speed: 2, power: 4, weight: 4, reach: 3, recov: 2 }, arch: 'power', sig: 'buff-aura', ul: { s: ['perfect', 5] },
    kit: { tpl: 'bulk', pw: 1.5, sp: 1.0, ov: { jab: { sp: 0.95, hb: [[26, -28, 40, -28, 16]] }, ftilt: { hb: [[28, -28, 50, -28, 18]], dt: 0 }, utilt: { hb: [[12, -42, 0, -66, 18]], dt: 0 }, fsmash: { hb: [[28, -32, 62, -26, 24]], dt: 4 }, dair: { ll: 14 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 9, a: 1, t: 28, proj: { sp: 5, vy: 0, g: 0, r: 14, life: 22, dmg: 4.5, bkb: 8, kbg: 8, ang: 40, kind: 'flame' } }),
      S: sp({ kind: 'melee', fx: 'slash', s: 13, a: 6, t: 42, dmg: 11, bkb: 24, kbg: 30, ang: 40, hb: [[26, -40, 66, -20, 22]] }),
      U: sp({ rr: 205, kind: 'rocket', fx: 'puff', s: 6, d: 6, a: 26, t: 52, rv: 9.6, dv: 2.2, dmg: 6, bkb: 18, kbg: 20, ang: 85, hb: [[0, -20, 0, -20, 36]] }),
      D: sp({ kind: 'zone', fx: 'cast', s: 14, a: 1, t: 40, proj: { kind: 'camp', r: 30, rad: 80, life: 420, ox: 0, oy: 20, nohit: 1 } }),
    },
    spr: { legs: { k: 'legs', c: 'b', w: 7 }, arms: { sx: 12, sy: -30, rx: 17, ry: -22, w: 6, c: 'a', hand: 'ball' }, back: [{ t: 'poly', pts: [-14, -6, 14, -6, 18, -2, -18, -2], c: 'b' }],
      body: [{ t: 'poly', pts: [-16, -12, 0, -62, 16, -12, 8, -4, -8, -4], c: 'a' }, { t: 'poly', pts: [-8, -14, 0, -42, 8, -14], c: '#ffd23f', lw: 1.6 }, { t: 'line', x0: -18, y0: -4, x1: 18, y1: -12, w: 5, c: 'b' }, { t: 'line', x0: 18, y0: -4, x1: -18, y1: -12, w: 5, c: 'b' }], eyes: [{ x: 3, y: -26, r: 3.4 }, { x: -5, y: -26, r: 3 }] } });
  B1('snow', { name: T2('ゆきだるま ユキダ', 'Yukida the Snowman'), short: T2('ユキダ', 'Yukida'), tag: T2('雪をまとって大きく', 'Grows bigger'),
    desc: T2('ゆきだるま。下とくぎで雪をまとうたびに（3回まで）攻撃が強く、ふっとびにくくなる。時間がたつと少しずつ小さくなる。', 'A snowman. Each down-special (up to 3) packs on snow: stronger hits and harder to launch. It slowly melts back.'),
    color: '#f2f6ff', color2: '#e8553a', w: 40, h: 56, weight: 104, run: 2.9, acc: 0.45, air: 2.5, aacc: 0.16, jump: 9.8, dj: 9.0, grav: 0.47, fall: 9.2, ff: 13.4, jmax: 1, stats: { speed: 2, power: 3, weight: 4, reach: 2, recov: 2 }, arch: 'power', sig: 'snow-grow', ul: { w: 66 },
    kit: { tpl: 'brawler', pw: 1.05, sp: 1.05, rr: 1.2, ov: { jab: { hb: [[24, -30, 38, -30, 16]] }, ftilt: { hb: [[26, -32, 48, -32, 18]] }, usmash: { hb: [[10, -44, -2, -90, 24]] }, dsmash: { hb: [[44, -8, 44, -8, 22], [-44, -8, -44, -8, 22]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 11, a: 1, t: 34, proj: { sp: 6, vy: -1.5, g: 0.2, r: 10, life: 70, dmg: 4, bkb: 8, kbg: 8, ang: 40, kind: 'snowball' } }),
      S: sp({ kind: 'dash', fx: 'body', s: 12, a: 14, t: 46, v: 5.5, dmg: 9, bkb: 20, kbg: 26, ang: 38, hb: [[0, -28, 26, -28, 26]] }),
      U: sp({ rr: 180, kind: 'arcreturn', fx: 'springup', s: 6, a: 42, t: 54, rv: 6.0, dv: 4.2, sink: 3, dmg: 0, hb: [] }),
      D: sp({ kind: 'grow', fx: 'puff', s: 12, a: 1, t: 38, hb: [] }),
    },
    spr: { legs: { k: 'none' }, arms: { sx: 14, sy: -36, rx: 22, ry: -30, w: 4, c: 'b', hand: 'none' }, back: [],
      body: [{ t: 'circ', x: 0, y: -16, r: 17, c: 'a' }, { t: 'circ', x: 0, y: -42, r: 12, c: 'a' }, { t: 'box', x: 0, y: -31, w: 22, h: 5, r: 2, c: 'b' }, { t: 'poly', pts: [3, -42, 18, -40, 3, -38], c: '#f08a2a' }, { t: 'box', x: 0, y: -57, w: 14, h: 8, r: 1, c: 'k' }, { t: 'box', x: 0, y: -53, w: 20, h: 3, r: 1, c: 'k' }, { t: 'circ', x: 0, y: -22, r: 2, c: 'k', lw: 0 }, { t: 'circ', x: 0, y: -12, r: 2, c: 'k', lw: 0 }], eyes: [{ x: 4, y: -45, r: 2.6 }, { x: -4, y: -45, r: 2.6 }] } });
  B1('kite', { name: T2('たこ カイト', 'Kai the Kite'), short: T2('カイト', 'Kai'), tag: T2('自由に飛べる', 'Free flight'),
    desc: T2('たこ。とくぎ（横）をおし続けると、ねんりょうが切れるまで好きな方向へ飛べて、ぶつかった相手にダメージ。', 'A kite. Hold side-special to fly in any direction until the fuel runs out, hitting anyone you fly into.'),
    color: '#ff6a7a', color2: '#ffd23f', w: 30, h: 56, weight: 64, run: 4.0, acc: 0.6, air: 3.8, aacc: 0.36, jump: 11.6, dj: 10.8, grav: 0.36, fall: 6.6, ff: 9.6, jmax: 3, stats: { speed: 4, power: 1, weight: 1, reach: 3, recov: 5 }, arch: 'air', sig: 'free-flight', ul: { w: 70 },
    kit: { tpl: 'floaty', pw: 1.15, sp: 0.85, ov: { jab: { hb: [[22, -34, 32, -36, 11]] }, ftilt: { hb: [[24, -34, 52, -40, 12]] }, utilt: { hb: [[6, -44, -4, -84, 14]] }, fair: { hb: [[18, -34, 44, -44, 14]] }, dair: { hb: [[2, 4, 8, 16, 15]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 8, a: 1, t: 26, proj: { sp: 9, vy: 0.5, g: 0.04, r: 7, life: 50, dmg: 3.4, bkb: 6, kbg: 4, ang: 25, kind: 'dart' } }),
      S: sp({ kind: 'flight', fx: 'spin', s: 6, a: 6, t: 28, fuel: 70, fv: 3.4, dmg: 5, bkb: 10, kbg: 12, ang: 40, hb: [[0, -30, 18, -30, 20]] }),
      U: sp({ rr: 185, kind: 'fold', fx: 'springup', s: 5, a: 50, t: 62, rv: 9, sink: 0.8, dv: 4.6, dmg: 0, hb: [] }),
      D: sp({ kind: 'melee', fx: 'kick', s: 9, a: 5, t: 34, dmg: 7, bkb: 18, kbg: 22, ang: 140, hb: [[-20, -30, -60, -34, 14]] }),
    },
    spr: { legs: { k: 'none' }, arms: { none: 1, sx: 0, sy: 0, rx: 0, ry: 0, w: 0, c: 'a', hand: 'none' }, back: [{ t: 'poly', pts: [-4, -20, -22, -4, -12, -24, -26, -14, -10, -30, -28, -24], c: 'b', anim: 'wag', lw: 1.8 }],
      body: [{ t: 'poly', pts: [0, -64, 15, -42, 0, -14, -15, -42], c: 'a' }, { t: 'line', x0: 0, y0: -64, x1: 0, y1: -14, w: 2, c: 'b' }, { t: 'line', x0: -15, y0: -42, x1: 15, y1: -42, w: 2, c: 'b' }, { t: 'poly', pts: [-5, -14, -12, 0, 12, 0, 5, -14], c: 'b', lw: 1.8 }], eyes: [{ x: 4, y: -38, r: 3 }, { x: -4, y: -38, r: 2.6 }] } });
  B1('door', { name: T2('ツインドア トビラ', 'Tobira the Twin Door'), short: T2('トビラ', 'Tobira'), tag: T2('2つの扉でワープ', 'Portal pair'),
    desc: T2('小さな扉。下とくぎで扉を2つ置くと、ふれた人も飛び道具も、もう一方の扉から出てくる（相手も自分も）。', 'A little door. Down-special places two doors; anything that touches one, foe, you or a projectile, comes out of the other.'),
    color: '#8a5a3a', color2: '#f2c94c', w: 30, h: 58, weight: 92, run: 3.5, acc: 0.52, air: 2.9, aacc: 0.22, jump: 10.8, dj: 9.8, grav: 0.44, fall: 8.6, ff: 12.6, stats: { speed: 3, power: 3, weight: 2, reach: 2, recov: 3 }, arch: 'trick', sig: 'portal-pair', ul: { s: ['tech', 20] },
    kit: { tpl: 'swift', pw: 1.45, sp: 0.95, ov: { jab: { hb: [[24, -34, 36, -34, 12]] }, ftilt: { hb: [[26, -34, 46, -34, 14]], ang: 40 }, utilt: { hb: [[10, -48, 2, -76, 15]] }, fsmash: { hb: [[26, -36, 58, -30, 19]] }, bair: { ang: 150 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 9, a: 1, t: 28, proj: { sp: 8, vy: 0, g: 0, r: 9, life: 40, dmg: 3.5, bkb: 7, kbg: 6, ang: 30, kind: 'knock' } }),
      S: sp({ kind: 'melee', fx: 'lid', s: 14, a: 5, t: 40, dmg: 10, bkb: 24, kbg: 30, ang: 40, hb: [[24, -50, 50, -30, 26]] }),
      U: sp({ rr: 700, kind: 'dropin', fx: 'prop', s: 6, d: 12, t: 34, ox: 70, oy: -20, dmg: 0, hb: [] }),
      D: sp({ kind: 'zone', fx: 'cast', s: 12, a: 1, t: 36, proj: { kind: 'portal', max: 2, r: 22, rad: 30, life: 700, ox: 60, oy: 30, nohit: 1 } }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 5 }, arms: { sx: 11, sy: -34, rx: 16, ry: -24, w: 4.4, c: 'b', hand: 'ball' }, back: [],
      body: [{ t: 'box', x: 0, y: -32, w: 26, h: 44, r: 4, c: 'a' }, { t: 'box', x: 0, y: -32, w: 20, h: 36, r: 3, c: 'B', lw: 1.4 }, { t: 'circ', x: 6, y: -30, r: 2.6, c: 'b' }, { t: 'box', x: 0, y: -58, w: 22, h: 6, r: 2, c: 'b' }], eyes: [{ x: 3, y: -42, r: 3.4 }, { x: -5, y: -42, r: 3 }] } });
  B1('pinball', { name: T2('ピンボール ピンピ', 'Pinpi the Pinball'), short: T2('ピンピ', 'Pinpi'), tag: T2('はじくバンパー', 'Bumper post'),
    desc: T2('ピンボールのたま。下とくぎでバンパーを置くと、さわった相手は強くはじき飛ばされる。はずむ玉も投げる。', 'A pinball. Down-special sets a bumper that flings anyone touching it away; it throws bouncing balls too.'),
    color: '#4a5bd0', color2: '#ff4a8a', w: 34, h: 42, weight: 86, run: 3.8, acc: 0.58, air: 3.0, aacc: 0.26, jump: 11.8, dj: 10.8, grav: 0.46, fall: 9.0, ff: 13.4, jmax: 2, stats: { speed: 4, power: 2, weight: 2, reach: 2, recov: 4 }, arch: 'trick', sig: 'bumper-post', ul: { w: 74 },
    kit: { tpl: 'brawler', pw: 1.05, sp: 0.9, rr: 1.1, ov: { jab: { hb: [[22, -22, 34, -22, 14]] }, ftilt: { hb: [[24, -22, 42, -22, 15]] }, fair: { rr: 1.15 }, nair: { a: 12, rr: 1.2 }, dair: { hb: [[2, 6, 8, -4, 18]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 9, a: 1, t: 30, proj: { sp: 8, vy: -1, g: 0.2, r: 8, life: 90, dmg: 3, bkb: 7, kbg: 6, ang: 40, kind: 'pinball', bounce: 1, bnc: 1 } }),
      S: sp({ kind: 'dash', fx: 'kick', s: 8, a: 10, t: 38, v: 6.5, dmg: 8, bkb: 18, kbg: 22, ang: 36, hb: [[16, -26, 38, -34, 20]] }),
      U: sp({ rr: 160, kind: 'pogo', fx: 'springup', s: 5, a: 34, t: 48, g: 10, rv: 7.2, dv: 3.0, dmg: 2.6, bkb: 12, kbg: 8, ang: 60, hb: [[0, -4, 0, -4, 22]] }),
      D: sp({ kind: 'zone', fx: 'cast', s: 12, a: 1, t: 36, proj: { kind: 'bumper', r: 24, rad: 24, life: 300, dmg: 3, bkb: 14, kbg: 0, ang: 60, pierce: 1, rh: 36, stay: 1, ox: 70, oy: 24 } }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 5 }, arms: { sx: 12, sy: -26, rx: 17, ry: -18, w: 4.4, c: 'b', hand: 'ball' }, back: [],
      body: [{ t: 'circ', x: 0, y: -26, r: 18, c: 'a' }, { t: 'poly', pts: [-14, -32, 14, -32, 10, -26, -10, -26], c: 'b', lw: 0 }, { t: 'star', x: -6, y: -20, r: 5, n: 5, c: 'b' }, { t: 'circ', x: 8, y: -16, r: 3, c: 'w', lw: 0 }], eyes: [{ x: 5, y: -30, r: 3.8 }, { x: -5, y: -30, r: 3.4 }] } });
  B1('bomb', { name: T2('ばくだん ドカンタ', 'Dokanta the Bomb'), short: T2('ドカンタ', 'Dokanta'), tag: T2('時間差で大爆発', 'Fuse bomb'),
    desc: T2('おもちゃの爆弾。投げた爆弾は転がって、ちょっとあとで大きく爆発する（それまでは当たらない）。', 'A toy bomb. Its thrown bombs bounce around and go off a moment later in a big blast (harmless until then).'),
    color: '#303038', color2: '#ff5a2a', w: 36, h: 46, weight: 108, run: 3.2, acc: 0.5, air: 2.7, aacc: 0.2, jump: 10.4, dj: 9.4, grav: 0.46, fall: 9.0, ff: 13.2, stats: { speed: 3, power: 4, weight: 3, reach: 2, recov: 2 }, arch: 'zone', sig: 'fuse-bomb', ul: { s: ['spike', 3] },
    kit: { tpl: 'bulk', pw: 1.8, sp: 1.0, rr: 1.1, ov: { jab: { hb: [[24, -26, 38, -26, 16]] }, ftilt: { hb: [[26, -26, 46, -26, 18]], dt: 0 }, fsmash: { hb: [[28, -28, 56, -24, 24]], dt: 4 }, dair: { a: 8 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 14, a: 1, t: 38, proj: { sp: 5.5, vy: -3.5, g: 0.32, r: 11, life: 120, dmg: 2, bkb: 8, kbg: 8, ang: 40, kind: 'bomb', bounce: 1, bnc: 1, nohit: 1, fz: 50, er: 62, ed: 11, ebk: 26, ekg: 34, ea: 55 } }),
      S: sp({ kind: 'melee', fx: 'punch', s: 12, a: 5, t: 38, dmg: 9, bkb: 20, kbg: 26, ang: 38, hb: [[26, -30, 54, -26, 20]] }),
      U: sp({ rr: 250, kind: 'dashglide', fx: 'puff', s: 6, a: 8, tail: 8, t: 36, sp: 10.5, dmg: 0, hb: [] }),
      D: sp({ kind: 'melee', fx: 'kick', s: 10, a: 4, t: 32, dmg: 6, bkb: 14, kbg: 16, ang: 30, hb: [[26, -8, 50, -14, 20]] }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 6 }, arms: { sx: 14, sy: -26, rx: 19, ry: -18, w: 5, c: 'k', hand: 'ball' }, back: [],
      body: [{ t: 'circ', x: 0, y: -24, r: 20, c: 'a' }, { t: 'box', x: 4, y: -46, w: 10, h: 7, r: 2, c: 'k' }, { t: 'line', x0: 6, y0: -48, x1: 14, y1: -58, w: 2.4, c: 'k' }, { t: 'star', x: 15, y: -60, r: 6, n: 5, c: 'b' }, { t: 'circ', x: -9, y: -32, r: 3.6, c: 'w', lw: 0 }], eyes: [{ x: 6, y: -26, r: 4 }, { x: -5, y: -26, r: 3.6 }] } });
  B1('ghost', { name: T2('ちょうちんおばけ ボンヤ', 'Bonya the Lantern Ghost'), short: T2('ボンヤ', 'Bonya'), tag: T2('すりぬけて現れる', 'Phasing dash'),
    desc: T2('ちょうちんのおばけ。とくぎ（横）で、すりぬけながら進み（その間は当たらない）、出てきたところで相手をはじく。', 'A paper-lantern ghost. Side-special glides through everything (untouchable) and bursts out at the end.'),
    color: '#f2f2ff', color2: '#e8553a', w: 32, h: 52, weight: 74, run: 3.4, acc: 0.5, air: 3.4, aacc: 0.3, jump: 11.0, dj: 10.4, grav: 0.38, fall: 7.2, ff: 10.8, jmax: 2, stats: { speed: 3, power: 2, weight: 1, reach: 3, recov: 4 }, arch: 'trick', sig: 'phase-dash', ul: { w: 78 },
    kit: { tpl: 'floaty', pw: 0.95, sp: 0.9, rr: 1.1, ov: { jab: { hb: [[22, -30, 34, -30, 13]] }, ftilt: { hb: [[24, -30, 50, -34, 14]], ang: 45 }, utilt: { hb: [[8, -44, 2, -76, 16]] }, nair: { a: 14, rr: 1.25 }, fair: { hb: [[20, -30, 44, -26, 16]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 11, a: 1, t: 32, proj: { sp: 3.8, vy: 0, g: 0, r: 12, life: 80, dmg: 3.5, bkb: 6, kbg: 4, ang: 60, kind: 'wisp' } }),
      S: sp({ kind: 'phase', fx: 'ring', s: 6, a: 12, ha: 5, t: 44, v: 8, dmg: 9, bkb: 22, kbg: 28, ang: 45, hb: [[20, -30, 40, -30, 28]] }),
      U: sp({ rr: 220, kind: 'ghostrise', fx: 'spin', s: 6, a: 26, t: 40, i: 14, rv: 10.2, dv: 3.4, dmg: 0, hb: [] }),
      D: sp({ kind: 'melee', fx: 'ring', s: 10, a: 5, t: 34, dmg: 7, bkb: 18, kbg: 22, ang: 60, hb: [[0, -34, 0, -34, 40]] }),
    },
    spr: { legs: { k: 'none' }, arms: { sx: 10, sy: -34, rx: 16, ry: -26, w: 4, c: 'A', hand: 'none' }, back: [{ t: 'poly', pts: [-8, -8, -14, 4, -6, -2, -2, 6, 4, -2, 10, 4, 12, -8], c: 'a', anim: 'wag', lw: 1.6 }],
      body: [{ t: 'ell', x: 0, y: -30, w: 32, h: 44, c: 'a' }, { t: 'box', x: 0, y: -54, w: 12, h: 5, r: 1, c: 'k' }, { t: 'line', x0: -14, y0: -30, x1: 14, y1: -30, w: 1.4, c: 'b' }, { t: 'line', x0: -12, y0: -40, x1: 12, y1: -40, w: 1.4, c: 'b' }, { t: 'line', x0: -12, y0: -20, x1: 12, y1: -20, w: 1.4, c: 'b' }, { t: 'circ', x: 0, y: -13, r: 3.4, c: 'ff', lw: 0 }], eyes: [{ x: 5, y: -34, r: 4 }, { x: -5, y: -34, r: 3.6 }] } });
  B1('thunder', { name: T2('かみなり太鼓 ゴロゴロ', 'Gorogoro the Thunder Drum'), short: T2('ゴロゴロ', 'Gorogoro'), tag: T2('3発でしびれる', 'Shock stun'),
    desc: T2('かみなりさまの太鼓。電気の玉を同じ相手に3回当てると、相手がしびれて動けなくなる。', 'A thunder-god drum. Land three sparks on the same foe and they get shocked, stunned for a moment.'),
    color: '#6a5ad0', color2: '#ffd23f', w: 36, h: 50, weight: 98, run: 3.9, acc: 0.6, air: 3.0, aacc: 0.24, jump: 11.0, dj: 10.0, grav: 0.45, fall: 8.8, ff: 13, stats: { speed: 4, power: 3, weight: 3, reach: 3, recov: 3 }, arch: 'rush', sig: 'shock-stun', ul: { s: ['ffa', 4] },
    kit: { tpl: 'brawler', pw: 0.95, sp: 0.8, ov: { jab: { sp: 0.7, hb: [[24, -30, 36, -30, 13]] }, ftilt: { hb: [[26, -30, 48, -30, 15]], ang: 38 }, dtilt: { hb: [[30, -6, 50, -6, 13]] }, fsmash: { hb: [[26, -34, 56, -30, 20]], dt: -2 }, uair: { hb: [[4, -64, -4, -84, 20]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 10, a: 1, t: 30, proj: { sp: 10, vy: 0, g: 0, r: 8, life: 30, dmg: 2.6, bkb: 4, kbg: 0, ang: 20, kind: 'spark' } }),
      S: sp({ kind: 'melee', fx: 'punch', s: 7, a: 4, t: 28, dmg: 5, bkb: 12, kbg: 14, ang: 40, hb: [[24, -30, 50, -30, 16]] }),
      U: sp({ rr: 176, kind: 'blink', fx: 'drill', s: 6, t: 28, td: 220, dirs: [[1, -1], [1, -1], [1, -1], [0, -1]], dmg: 0, hb: [] }),
      D: sp({ kind: 'melee', fx: 'ring', s: 12, a: 4, t: 38, dmg: 8, bkb: 18, kbg: 22, ang: 70, hb: [[0, -40, 0, -40, 52]] }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 6 }, arms: { sx: 13, sy: -32, rx: 18, ry: -24, w: 5, c: 'b', hand: 'stick' }, back: [{ t: 'ringo', x: 0, y: -48, w: 44, h: 12, c: 'b' }],
      body: [{ t: 'circ', x: 0, y: -28, r: 20, c: 'a' }, { t: 'circ', x: 0, y: -28, r: 13, c: 'w', lw: 1.4 }, { t: 'poly', pts: [3, -38, -4, -26, 1, -26, -3, -18, 6, -30, 1, -30], c: 'b', lw: 1.4 }, { t: 'poly', pts: [-6, -48, -3, -58, 0, -48], c: 'b' }, { t: 'poly', pts: [3, -48, 6, -58, 9, -48], c: 'b' }], eyes: [{ x: 6, y: -34, r: 3.4 }] } });
  B1('cham', { name: T2('カメレオン カメレ', 'Kamere the Chameleon'), short: T2('カメレ', 'Kamere'), tag: T2('姿とダメージをかくす', 'Cloak: hidden %'),
    desc: T2('カメレオンのぬいぐるみ。下とくぎで姿をかくす（自分のダメージ%も見えなくなる）。かくれて出す最初の攻撃は強い。', 'A plush chameleon. Down-special cloaks it (its damage % is hidden too); the first hit out of the cloak is stronger.'),
    color: '#5ac86a', color2: '#ffd23f', w: 32, h: 46, weight: 82, run: 4.0, acc: 0.6, air: 3.2, aacc: 0.28, jump: 10.8, dj: 9.8, grav: 0.44, fall: 8.4, ff: 12.6, stats: { speed: 4, power: 2, weight: 2, reach: 4, recov: 3 }, arch: 'trick', sig: 'cloak-hidden', ul: { w: 82 },
    kit: { tpl: 'swift', reach: 1.2, pw: 0.99, sp: 0.9, ov: { jab: { hb: [[28, -28, 42, -28, 10]] }, ftilt: { hb: [[30, -28, 76, -26, 10]], a: 5 }, utilt: { hb: [[12, -40, 6, -72, 12]] }, dtilt: { hb: [[34, -6, 64, -6, 10]] }, fsmash: { hb: [[30, -30, 84, -28, 14]], a: 6 } } },
    sp: {
      N: sp({ kind: 'melee', fx: 'spring', s: 9, a: 4, t: 30, dmg: 6, bkb: 12, kbg: 14, ang: 30, hb: [[30, -36, 92, -36, 10]] }),
      S: sp({ kind: 'dash', fx: 'kick', s: 9, a: 10, t: 38, v: 7.4, dmg: 7, bkb: 16, kbg: 20, ang: 40, hb: [[16, -24, 36, -24, 16]] }),
      U: sp({ rr: 220, kind: 'tether', fx: 'spring', s: 6, a: 10, t: 32, range: 220, sp: 15, rv: 8.4, dmg: 0, hb: [] }),
      D: sp({ kind: 'cloak', fx: 'cast', s: 8, a: 1, t: 34, dur: 260, hb: [] }),
    },
    spr: { legs: { k: 'legs', c: 'a', w: 5 }, arms: { sx: 8, sy: -24, rx: 14, ry: -16, w: 4.4, c: 'A', hand: 'ball' }, back: [{ t: 'poly', pts: [-10, -16, -30, -22, -34, -10, -24, -4, -16, -10], c: 'a', anim: 'wag', lw: 1.8 }],
      body: [{ t: 'ell', x: 0, y: -20, w: 30, h: 24, c: 'a' }, { t: 'ell', x: 6, y: -34, w: 24, h: 20, c: 'a' }, { t: 'circ', x: 10, y: -38, r: 6.4, c: 'w' }, { t: 'poly', pts: [2, -44, 8, -52, 12, -44], c: 'b' }, { t: 'circ', x: -6, y: -22, r: 3, c: 'b', lw: 0 }, { t: 'circ', x: 4, y: -16, r: 2.4, c: 'b', lw: 0 }], eyes: [{ x: 11, y: -38, r: 3.4 }] } });
  B1('magnet', { name: T2('じしゃく ジシャク', 'Jishaku the Magnet'), short: T2('ジシャク', 'Jishaku'), tag: T2('引いて・おして', 'Pulsing field'),
    desc: T2('U字のじしゃく。下とくぎの磁場は、引きよせては おしやるをくり返して、相手のリズムをくずす。', 'A horseshoe magnet. Its field alternates pulling and pushing, breaking the foe\'s rhythm.'),
    color: '#d0453f', color2: '#4a6ad0', w: 34, h: 52, weight: 106, run: 3.0, acc: 0.48, air: 2.6, aacc: 0.2, jump: 10.0, dj: 9.0, grav: 0.46, fall: 9.2, ff: 13.4, stats: { speed: 2, power: 3, weight: 3, reach: 3, recov: 3 }, arch: 'zone', sig: 'polar-field', ul: { s: ['lad', 3] },
    kit: { tpl: 'zoner', pw: 1.7, sp: 1.0, ov: { jab: { hb: [[24, -30, 38, -30, 15]] }, ftilt: { hb: [[26, -30, 54, -30, 16]], ang: 38 }, utilt: { hb: [[8, -44, 0, -72, 17]] }, dsmash: { hb: [[36, -8, 56, -8, 18], [-36, -8, -56, -8, 18]] }, fsmash: { hb: [[26, -34, 66, -30, 20]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 11, a: 1, t: 34, proj: { sp: 7, vy: 0, g: 0, r: 11, life: 56, dmg: 3.4, bkb: 8, kbg: 8, ang: 30, kind: 'bolt' } }),
      S: sp({ kind: 'melee', fx: 'lid', s: 12, a: 5, t: 38, dmg: 9, bkb: 22, kbg: 28, ang: 40, hb: [[22, -30, 48, -30, 24]] }),
      U: sp({ rr: 285, kind: 'gravflip', fx: 'horn', s: 8, a: 26, t: 42, g: 0.9, vmax: 9.5, dv: 1.6, dmg: 0, hb: [] }),
      D: sp({ kind: 'zone', fx: 'cast', s: 16, a: 1, t: 42, proj: { kind: 'mag', r: 40, rad: 150, life: 240, pw: 0.7, osc: 40, ox: 70, oy: 30, nohit: 1 } }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 6 }, arms: { sx: 11, sy: -30, rx: 16, ry: -22, w: 4.6, c: 'k', hand: 'ball' }, back: [],
      body: [{ t: 'box', x: -11, y: -34, w: 12, h: 38, r: 3, c: 'a' }, { t: 'box', x: 11, y: -34, w: 12, h: 38, r: 3, c: 'a' }, { t: 'box', x: 0, y: -50, w: 34, h: 12, r: 5, c: 'a' }, { t: 'box', x: -11, y: -10, w: 12, h: 9, r: 1, c: 'w' }, { t: 'box', x: 11, y: -10, w: 12, h: 9, r: 1, c: 'w' }, { t: 'box', x: -11, y: -17, w: 12, h: 3, r: 0, c: 'b', lw: 0 }, { t: 'box', x: 11, y: -17, w: 12, h: 3, r: 0, c: 'b', lw: 0 }], eyes: [{ x: 4, y: -48, r: 3.2 }, { x: -4, y: -48, r: 2.8 }] } });
  B1('stamp', { name: T2('ハンコ ポンス', 'Ponsu the Rubber Stamp'), short: T2('ポンス', 'Ponsu'), tag: T2('しるしをつけてドン', 'Mark, then slam'),
    desc: T2('ゴムのハンコ。印を当てた相手に、あとで下とくぎを出すと、どこにいてもまとめてドンとはじく。', 'A rubber stamp. Tag a foe with its mark, then down-special slams every marked foe wherever they are.'),
    color: '#c8282f', color2: '#f4efe0', w: 32, h: 54, weight: 96, run: 3.4, acc: 0.5, air: 2.8, aacc: 0.22, jump: 10.6, dj: 9.6, grav: 0.44, fall: 8.6, ff: 12.8, stats: { speed: 3, power: 3, weight: 2, reach: 3, recov: 3 }, arch: 'counter', sig: 'mark-stamp', ul: { w: 86 },
    kit: { tpl: 'blade', pw: 1.05, reach: 1.0, ov: { jab: { hb: [[24, -34, 38, -34, 13]] }, ftilt: { hb: [[26, -34, 56, -34, 14]] }, utilt: { hb: [[10, -46, 4, -76, 15]] }, fsmash: { hb: [[24, -52, 60, -12, 22]], a: 5 }, dsmash: { hb: [[40, -6, 40, -6, 18], [-40, -6, -40, -6, 18]] } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 10, a: 1, t: 32, proj: { sp: 9, vy: 0, g: 0, r: 12, life: 34, dmg: 3, bkb: 6, kbg: 4, ang: 40, kind: 'tag' } }),
      S: sp({ kind: 'melee', fx: 'lid', s: 14, a: 6, t: 44, dmg: 12, bkb: 26, kbg: 34, ang: 48, hb: [[22, -64, 52, -8, 24]] }),
      U: sp({ rr: 170, kind: 'rebound', fx: 'prop', s: 5, d: 5, a: 18, t: 38, dive: 6, rv: 9.4, dv: 2.6, dmg: 0, hb: [] }),
      D: sp({ kind: 'detonate', fx: 'ring', s: 10, a: 1, t: 36, dmg: 14, bkb: 28, kbg: 36, ang: 60, hb: [] }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 6 }, arms: { sx: 12, sy: -30, rx: 17, ry: -22, w: 5, c: 'k', hand: 'ball' }, back: [],
      body: [{ t: 'box', x: 0, y: -14, w: 30, h: 14, r: 3, c: 'b' }, { t: 'box', x: 0, y: -26, w: 18, h: 14, r: 4, c: 'a' }, { t: 'box', x: 0, y: -48, w: 14, h: 22, r: 5, c: 'a' }, { t: 'circ', x: 0, y: -62, r: 6.4, c: 'a' }, { t: 'box', x: 0, y: -14, w: 22, h: 4, r: 1, c: 'a', lw: 0 }], eyes: [{ x: 4, y: -26, r: 3.4 }, { x: -4, y: -26, r: 3 }] } });
  B1('plaster', { name: T2('ばんそうこう バンコ', 'Banko the Plaster'), short: T2('バンコ', 'Banko'), tag: T2('じっとして治す', 'Channel heal'),
    desc: T2('ばんそうこう。下とくぎをおし続けると、動けないかわりに、すこしずつダメージが治っていく。', 'An adhesive plaster. Hold down-special to stand still and slowly heal your damage, leaving yourself open.'),
    color: '#f4c8a0', color2: '#6ac8e8', w: 30, h: 58, weight: 90, run: 3.7, acc: 0.54, air: 2.9, aacc: 0.22, jump: 10.6, dj: 9.8, grav: 0.43, fall: 8.4, ff: 12.4, stats: { speed: 3, power: 3, weight: 2, reach: 3, recov: 3 }, arch: 'allround', sig: 'channel-heal', ul: { s: ['pshield', 8] },
    kit: { tpl: 'brawler', pw: 0.84, sp: 1.0, reach: 1.05, ov: { jab: { hb: [[24, -34, 38, -34, 13]] }, ftilt: { hb: [[26, -34, 52, -34, 14]] }, utilt: { hb: [[12, -48, 2, -74, 15]] }, dtilt: { hb: [[30, -6, 50, -6, 13]] }, fsmash: { hb: [[26, -38, 58, -32, 19]] } } },
    sp: {
      N: sp({ kind: 'melee', fx: 'punch', s: 6, a: 3, t: 24, dmg: 5, bkb: 12, kbg: 14, ang: 50, hb: [[24, -30, 44, -30, 14]] }),
      S: sp({ kind: 'proj', fx: 'cast', s: 12, a: 1, t: 34, proj: { sp: 8, vy: 0, g: 0, r: 10, life: 40, dmg: 4.4, bkb: 8, kbg: 8, ang: 30, kind: 'patch' } }),
      U: sp({ rr: 95, kind: 'parachute', fx: 'cast', s: 5, a: 50, t: 62, rv: 3.6, sink: 1.4, dv: 2.0, dmg: 0, hb: [] }),
      D: sp({ kind: 'channel', fx: 'cast', s: 6, a: 1, t: 40, cmax: 60, hb: [] }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 5 }, arms: { sx: 9, sy: -34, rx: 14, ry: -26, w: 4.4, c: 'a', hand: 'ball' }, back: [],
      body: [{ t: 'box', x: 0, y: -30, w: 24, h: 46, r: 8, c: 'a' }, { t: 'box', x: 0, y: -30, w: 24, h: 14, r: 0, c: 'b', lw: 0 }, { t: 'holes', x: -8, y: -30, n: 4, dx: 5 }, { t: 'box', x: 0, y: -30, w: 24, h: 46, r: 8, c: 'rgba(0,0,0,0)', lw: 2 }], eyes: [{ x: 4, y: -42, r: 3.2 }, { x: -5, y: -42, r: 2.8 }] } });
  B1('prism', { name: T2('プリズム プリズ', 'Prizzy the Prism'), short: T2('プリズ', 'Prizzy'), tag: T2('光が3つに分かれる', 'Splitting beams'),
    desc: T2('ガラスのプリズム。光の玉は途中で3つに分かれて広がる。下とくぎの光線は、長くてまっすぐ相手をつらぬく。', 'A glass prism. Its light orb splits into three on the way; down-special fires a long piercing beam.'),
    color: '#cfe8ff', color2: '#ff5aa0', w: 30, h: 54, weight: 80, run: 3.5, acc: 0.52, air: 3.1, aacc: 0.26, jump: 11.2, dj: 10.2, grav: 0.4, fall: 7.8, ff: 12, jmax: 2, stats: { speed: 3, power: 2, weight: 1, reach: 4, recov: 4 }, arch: 'zone', sig: 'split-beam', ul: { w: 90 },
    kit: { tpl: 'zoner', pw: 1.0, sp: 1.0, reach: 1.15, ov: { jab: { hb: [[24, -34, 38, -34, 10]] }, ftilt: { hb: [[26, -34, 62, -34, 10]], a: 5 }, utilt: { hb: [[8, -48, 0, -80, 12]] }, fsmash: { hb: [[26, -38, 74, -30, 14]], a: 6 }, bair: { ang: 150 } } },
    sp: {
      N: sp({ kind: 'proj', fx: 'cast', s: 10, a: 1, t: 30, proj: { sp: 7, vy: 0, g: 0, r: 9, life: 50, dmg: 3.2, bkb: 6, kbg: 5, ang: 35, kind: 'prism' } }),
      S: sp({ kind: 'melee', fx: 'slash', s: 11, a: 5, t: 36, dmg: 8, bkb: 18, kbg: 24, ang: 36, hb: [[22, -40, 60, -40, 12]] }),
      U: sp({ rr: 240, kind: 'jet', fx: 'spin', s: 6, t: 40, fuel: 17, sp: 8.0, dmg: 0, hb: [] }),
      D: sp({ kind: 'proj', fx: 'cast', s: 18, a: 1, t: 46, proj: { sp: 15, vy: 0, g: 0, r: 5, life: 26, dmg: 7, bkb: 12, kbg: 14, ang: 20, kind: 'beam', pierce: 1, rh: 99 } }),
    },
    spr: { legs: { k: 'legs', c: 'k', w: 4 }, arms: { sx: 8, sy: -30, rx: 13, ry: -22, w: 3.6, c: 'k', hand: 'ball' }, back: [{ t: 'poly', pts: [-8, -34, -34, -40, -34, -28], c: 'b', anim: 'wag', lw: 0 }],
      body: [{ t: 'poly', pts: [0, -62, 15, -12, -15, -12], c: 'a' }, { t: 'poly', pts: [0, -62, 15, -12, 4, -12], c: 'w', lw: 0 }, { t: 'line', x0: 15, y0: -34, x1: 32, y1: -40, w: 3, c: 'b' }, { t: 'line', x0: 15, y0: -30, x1: 32, y1: -28, w: 3, c: '#ffd23f' }], eyes: [{ x: 2, y: -34, r: 3.4 }] } });

  // 第3弾の体の数字（重さ・速さ・ジャンプ・重力 など）：ほかのどの子ともちがうように、スクリプトで散らして決めた値（ちがいの数字 E.dist が全員 9 以上になる）
  const B2BODY = {"mirror": {"weight": 62, "run": 4.7, "jump": 12, "dj": 11.1, "grav": 0.5, "fall": 10, "air": 2.2, "acc": 0.66, "aacc": 0.14}, "sand": {"weight": 139, "run": 4.8, "jump": 9.5, "dj": 8.6, "grav": 0.5, "fall": 10.2, "air": 3.8, "acc": 0.42, "aacc": 0.34}, "shroom": {"weight": 129, "run": 3.3, "jump": 10.6, "dj": 9.7, "grav": 0.46, "fall": 10.2, "air": 3.2, "acc": 0.5, "aacc": 0.3}, "camp": {"weight": 70, "run": 3.3, "jump": 12.1, "dj": 11.2, "grav": 0.37, "fall": 6.8, "air": 3.3, "acc": 0.42, "aacc": 0.32}, "snow": {"weight": 132, "run": 4.4, "jump": 12.1, "dj": 11.2, "grav": 0.38, "fall": 6.6, "air": 2.3, "acc": 0.68, "aacc": 0.14}, "kite": {"weight": 102, "run": 4.3, "jump": 9.4, "dj": 8.5, "grav": 0.49, "fall": 8.4, "air": 3.8, "acc": 0.64, "aacc": 0.22}, "door": {"weight": 63, "run": 3.1, "jump": 12.1, "dj": 11.2, "grav": 0.46, "fall": 9.6, "air": 3.2, "acc": 0.68, "aacc": 0.34}, "pinball": {"weight": 67, "run": 4.6, "jump": 11.4, "dj": 10.5, "grav": 0.49, "fall": 9.8, "air": 3.8, "acc": 0.42, "aacc": 0.14}, "bomb": {"weight": 63, "run": 4.7, "jump": 9.2, "dj": 8.3, "grav": 0.37, "fall": 6.6, "air": 3.8, "acc": 0.7, "aacc": 0.14}, "ghost": {"weight": 136, "run": 3.4, "jump": 11.4, "dj": 10.5, "grav": 0.46, "fall": 7.2, "air": 2.5, "acc": 0.54, "aacc": 0.14}, "thunder": {"weight": 135, "run": 4.7, "jump": 12.2, "dj": 11.3, "grav": 0.48, "fall": 9.8, "air": 3.3, "acc": 0.66, "aacc": 0.34}, "cham": {"weight": 68, "run": 4.5, "jump": 11.5, "dj": 10.6, "grav": 0.45, "fall": 9.8, "air": 3.7, "acc": 0.54, "aacc": 0.28}, "magnet": {"weight": 65, "run": 4.1, "jump": 9.2, "dj": 8.3, "grav": 0.36, "fall": 6.6, "air": 2.2, "acc": 0.68, "aacc": 0.34}, "stamp": {"weight": 136, "run": 4.8, "jump": 9.5, "dj": 8.6, "grav": 0.37, "fall": 6.6, "air": 3.6, "acc": 0.66, "aacc": 0.32}, "plaster": {"weight": 129, "run": 4.7, "jump": 9.6, "dj": 8.7, "grav": 0.48, "fall": 6.6, "air": 3.5, "acc": 0.62, "aacc": 0.3}, "prism": {"weight": 139, "run": 3.6, "jump": 12.2, "dj": 11.3, "grav": 0.37, "fall": 6.6, "air": 3.7, "acc": 0.44, "aacc": 0.16}};
  for (const id of Object.keys(B2BODY)) Object.assign(CH[id], B2BODY[id]);

  // ------------------------------------------------------------------------------------------------ あとから足す印
  // arch：タイプ（選ぶ画面の絞りこみ・CPU の考え方） sig：そのおもちゃだけの目玉（ほかのおもちゃと同じにしない）
  // tm：なげの強さの倍率（なければ 1） gx：つかみの横の長さの倍率
  const META = {
    robo: { arch: 'allround', sig: 'windup', tm: 1 }, duck: { arch: 'counter', sig: 'shield-counter', tm: 1 }, tin: { arch: 'zone', sig: 'cork-mines', tm: 0.95, tagY: 8 },
    bear: { arch: 'power', sig: 'bear-hug', tm: 1.3 }, top: { arch: 'rush', sig: 'spin-multihit', tm: 0.85 }, jack: { arch: 'reach', sig: 'spring-limbs', tm: 0.95, tagY: 20 },
    junk: { arch: 'power', sig: 'junk-pile', tm: 1.3, gx: 1.5 }, ninja: { arch: 'trick', sig: 'warp', tm: 0.9 }, wiz: { arch: 'zone', sig: 'warp-reflect', tm: 0.9 },
    cat: { arch: 'rush', sig: 'cat-rush', tm: 0.9 }, tank: { arch: 'zone', sig: 'heavy-shell', tm: 1.2 }, giraffe: { arch: 'reach', sig: 'neck-reach', tm: 1 },
    ball: { arch: 'trick', sig: 'bounce-pound', tm: 0.95 }, crab: { arch: 'grab', sig: 'claw-grab', tm: 1 }, snail: { arch: 'trap', sig: 'triple-mines', tm: 1 },
    kaiju: { arch: 'power', sig: 'monster-power', tm: 1.2 }, samurai: { arch: 'counter', sig: 'iai-parry', tm: 1 }, balloon: { arch: 'air', sig: 'triple-float', tm: 0.8 },
    penguin: { arch: 'counter', sig: 'drum-reflect', tm: 1.05 },
  };
  for (const id of Object.keys(META)) Object.assign(CH[id], META[id]);
  // ------------------------------------------------------------------------------------------------ 通常技のリメイク（しゅるいで変える）
  // 数字だけでなく「どんな技か」を変える：連続ヒット（flurry）・遅れてくる大技（delayed）・前へ進む（lunge）・のぼる（rising）・空中でとまる（stall）・飛び道具（proj）・わな（trap）・
  // つかみ（cmd）・まわる（spin）・急降下（pound）・構え（counter）・当たり判定が動く（hb を自分でかく）。engine.js の normals() が読む（ov の kind / seq / lg / lift / stall / rh / mv / proj）。
  const NF = {
    flurry: (n, gap, x) => Object.assign({ seq: Array.from({ length: n }, (_, i) => i < n - 1 ? { at: i * gap, a: 2, dm: 0.42, bk: 0.5, kb: 0.1 } : { at: i * gap, a: 3, dm: 0.8, bk: 1.1, kb: 1.2 }) }, x),
    delayed: (wait, big, x) => Object.assign({ seq: [{ at: 0, a: 2, dm: 0.3, bk: 0.5, kb: 0.1 }, { at: wait, a: 4, dm: big, bk: 1.25, kb: 1.35 }] }, x),
    lunge: (v, x) => Object.assign({ lg: v, lp: 2 }, x),
    rising: (lift, lf, x) => Object.assign({ lift, lf }, x),
    stall: (g, v, x) => Object.assign({ stall: { g, v } }, x),
    proj: (p, x) => Object.assign({ kind: 'proj', proj: Object.assign({ vy: 0, g: 0, bkb: 8, kbg: 6, ang: 25 }, p) }, x),
    trap: (p, x) => Object.assign({ kind: 'mine', proj: Object.assign({ max: 1, arm: 24, bkb: 14, kbg: 18, ang: 70 }, p) }, x),
    spin: (rh, fin, x) => Object.assign({ kind: 'spin', rh, mv: { rh, fin: Object.assign({ dmg: 3, bkb: 14, kbg: 14, ang: 55 }, fin) } }, x),
    pound: (fv, land, x) => Object.assign({ kind: 'pound', mv: { fv, land: Object.assign({ a: 5, dmg: 7, bkb: 16, kbg: 16, ang: 60, hb: [[26, -8, 26, -8, 24], [-26, -8, -26, -8, 24]] }, land) } }, x),
    cmd: x => Object.assign({ kind: 'cmdgrab' }, x),
    counter: (cf, x) => Object.assign({ kind: 'counter', mv: { cf, cs: 4, ca: 4 } }, x),
  };
  // おもちゃごとの、しゅるいのちがう通常技（キーは技の名前）。どの子も 4つ以上
  const NRM = {
    robo: { jab: NF.flurry(3, 4), ftilt: NF.proj({ sp: 8, r: 9, life: 13, dmg: 5, kind: 'fist' }, { s: 9, t: 30 }), dtilt: { hb: [[8, -6, 66, -6, 12]], a: 6, t: 26 },
      nair: NF.spin(6, {}, { a: 26, t: 42 }), fsmash: NF.delayed(16, 1.3, { s: 14 }), dair: NF.pound(12, {}, { s: 12, t: 46, hb: [[0, 8, 0, 8, 22]] }) },
    duck: { jab: NF.flurry(2, 4), ftilt: NF.lunge(4.4, { hb: [[26, -30, 76, -30, 9]], a: 5 }), utilt: NF.rising(5, 7), dtilt: { seq: [{ at: 0, a: 3, hb: [[10, -8, 60, -8, 12]], dm: 0.7 }, { at: 8, a: 3, hb: [[60, -8, 10, -8, 12]], dm: 0.9, kb: 1.2 }] },
      fsmash: { hb: [[-10, -86, 70, -10, 20]], a: 7, t: 50 }, fair: NF.delayed(8, 1.25, { s: 6 }), dair: NF.pound(11, { dmg: 8 }, { s: 11, t: 44, hb: [[8, 6, 8, 6, 16]] }) },
    tin: { jab: NF.proj({ sp: 12, r: 6, life: 12, dmg: 3, kind: 'cork' }, { s: 4, t: 18 }), ftilt: NF.lunge(4.8, { hb: [[28, -32, 64, -32, 9]], a: 4 }), utilt: NF.proj({ sp: 5, vy: -7, g: 0.3, r: 8, life: 40, dmg: 5, ang: 88, kind: 'cork' }, { s: 8, t: 30 }),
      dtilt: NF.proj({ sp: 10, r: 7, life: 22, dmg: 4, kind: 'cork' }, { s: 7, t: 28 }), fair: NF.flurry(3, 5, { s: 6 }), dair: NF.proj({ sp: 1, vy: 8, g: 0.2, r: 8, life: 30, dmg: 7, ang: -80, kind: 'cork' }, { s: 9, t: 34 }) },
    bear: { ftilt: NF.delayed(8, 0.9, { s: 8, seq: [{ at: 0, a: 3, hb: [[20, -42, 54, -30, 22]], dm: 0.8 }, { at: 9, a: 3, hb: [[54, -26, 18, -44, 22]], dm: 1.0, kb: 1.1 }] }), utilt: NF.rising(4, 8), dtilt: { hb: [[44, -8, 44, -8, 26], [-44, -8, -44, -8, 26]], a: 5, ang: 60 },
      fsmash: NF.lunge(5, { lp: 6, a: 8, t: 52 }), dair: NF.pound(11, { dmg: 9, hb: [[40, -8, 40, -8, 30], [-40, -8, -40, -8, 30]] }, { s: 13, t: 50, hb: [[0, 8, 0, 8, 30]] }), jab: NF.cmd({ hb: [[30, -30, 44, -30, 20]], s: 8, t: 34, dmg: 4 }) },
    top: { jab: NF.flurry(4, 3), ftilt: NF.lunge(3.8, { rh: 5, a: 14, t: 34, hb: [[0, -24, 24, -24, 22]] }), dtilt: NF.lunge(4.4, { hb: [[10, -8, 46, -8, 12]], a: 10, rh: 5, t: 28 }), nair: NF.stall(0.1, 0.6, { rh: 5, a: 26, t: 40 }), uair: NF.rising(3, 6, { rh: 5, a: 14, t: 34 }) },
    jack: { jab: NF.delayed(5, 0.8, { s: 3, hb: [[30, -34, 102, -34, 10]] }), ftilt: { hb: [[24, -40, 108, -30, 12]], a: 8, t: 36 }, utilt: NF.rising(5.5, 6), fsmash: NF.delayed(14, 1.2, { s: 14, hb: [[30, -40, 100, -32, 22]] }), dair: { seq: [{ at: 0, a: 2, dm: 0.5, bk: 0.6, kb: 0.3, ang: 60, hb: [[6, -14, 12, -8, 16]] }, { at: 3, a: 3, dm: 1.0, bk: 1.2, kb: 1.4, ang: -80, hb: [[4, 14, 8, 22, 12]] }] } },
    ninja: { jab: NF.flurry(3, 3), ftilt: NF.lunge(7.2, { hb: [[20, -28, 52, -28, 10]], a: 5, t: 28 }), utilt: NF.rising(6.2, 7), dtilt: NF.trap({ r: 11, life: 420, dmg: 5, kind: 'mine' }, { s: 7, t: 26 }),
      fsmash: NF.proj({ sp: 9, r: 9, life: 36, dmg: 11, bkb: 20, kbg: 24, ang: 35, kind: 'shuriken' }, { s: 14, t: 46 }), dair: { hb: [[10, -24, 28, 6, 16]], a: 8, ang: -50 } },
    wiz: { jab: NF.proj({ sp: 9, r: 6, life: 16, dmg: 3, kind: 'orb' }, { s: 5, t: 20 }), utilt: NF.proj({ sp: 1, vy: -8, g: 0.1, r: 8, life: 28, dmg: 5, ang: 88, kind: 'orb' }, { s: 8, t: 30 }), dtilt: NF.trap({ r: 12, life: 360, dmg: 6, kind: 'mine' }, { s: 8, t: 28 }),
      fsmash: NF.proj({ sp: 11, r: 12, life: 24, dmg: 12, bkb: 22, kbg: 28, ang: 32, pierce: 1, rh: 99, kind: 'orb' }, { s: 18, t: 52 }), nair: NF.spin(7, { dmg: 3 }, { a: 28, t: 42 }), dair: NF.proj({ sp: 1, vy: 9, g: 0.2, r: 9, life: 32, dmg: 8, ang: -80, kind: 'orb' }, { s: 10, t: 36 }) },
    cat: { jab: NF.flurry(5, 3), ftilt: NF.lunge(6.2, { hb: [[14, -26, 40, -26, 14]], a: 6 }), dtilt: NF.lunge(4.2, { hb: [[10, -6, 44, -6, 11]], a: 8, t: 26 }), fsmash: NF.lunge(8, { lp: 4, a: 8, t: 46 }), nair: NF.spin(6, {}, { a: 24, t: 38 }), fair: { seq: [{ at: 0, a: 2, hb: [[22, -34, 44, -26, 13]], dm: 0.6 }, { at: 5, a: 3, hb: [[24, -20, 48, -34, 13]], dm: 0.8, kb: 1.2 }] }, dair: NF.lunge(3.4, { ang: -55, lp: 3, a: 9, hb: [[10, -28, 30, 4, 14]] }) },
    tank: { jab: { hb: [[26, -30, 40, -30, 18]], s: 5 }, ftilt: NF.proj({ sp: 6, vy: -1.5, g: 0.18, r: 11, life: 36, dmg: 7, bkb: 14, kbg: 16, ang: 35, kind: 'shell' }, { s: 11, t: 34 }), utilt: NF.proj({ sp: 1.5, vy: -9, g: 0.22, r: 11, life: 40, dmg: 7, ang: 88, kind: 'shell' }, { s: 10, t: 34 }),
      dtilt: NF.trap({ r: 14, life: 500, dmg: 8, kind: 'mine' }, { s: 10, t: 34 }), fsmash: NF.delayed(18, 1.5, { s: 16, hb: [[30, -34, 66, -28, 26]] }), dair: NF.pound(13, { dmg: 10, hb: [[50, -8, 50, -8, 34], [-50, -8, -50, -8, 34]] }, { s: 14, t: 50, hb: [[0, 8, 0, 8, 34]] }) },
    giraffe: { jab: { hb: [[26, -66, 98, -58, 10]], a: 5, t: 22 }, ftilt: { seq: [{ at: 0, a: 4, hb: [[16, -84, 60, -70, 13]], dm: 0.8 }, { at: 4, a: 4, hb: [[60, -62, 100, -30, 13]], dm: 0.9, kb: 1.1 }] }, dtilt: { hb: [[20, -6, 104, -6, 10]], a: 7, t: 30 },
      fsmash: NF.delayed(12, 1.2, { s: 14, hb: [[30, -76, 90, -60, 24]] }), nair: NF.spin(6, {}, { a: 26, t: 42 }), uair: NF.stall(0.12, 0.5, { hb: [[0, -70, 0, -130, 14]], a: 9 }) },
    ball: { jab: NF.lunge(2.6, { lift: 3, lf: 4, s: 3, hb: [[22, -22, 34, -22, 16]] }), ftilt: NF.lunge(6, { rh: 5, a: 14, t: 34, hb: [[0, -20, 22, -20, 22]] }), utilt: NF.rising(5, 6), nair: NF.stall(0.1, 0.8, { rh: 5, a: 26, t: 40 }), dair: NF.pound(13, { dmg: 8 }, { s: 12, t: 48, hb: [[0, 8, 0, 8, 22]] }) },
    crab: { jab: NF.flurry(2, 4), ftilt: NF.cmd({ hb: [[30, -26, 46, -22, 20]], s: 9, t: 38, dmg: 7, bkb: 24, kbg: 30 }), dtilt: NF.lunge(5.4, { hb: [[10, -6, 46, -6, 11]], a: 8, t: 26 }), fsmash: NF.delayed(13, 1.35, { s: 13 }), dsmash: { hb: [[44, -8, 44, -8, 22], [-44, -8, -44, -8, 22]], a: 6 }, nair: NF.spin(6, {}, { a: 26, t: 40 }) },
    snail: { jab: NF.delayed(5, 0.9, { s: 4 }), ftilt: NF.lunge(2.2, { a: 10, t: 36 }), dtilt: NF.trap({ r: 16, life: 600, dmg: 3, bkb: 6, kbg: 0, ang: 80, kind: 'mine' }, { s: 8, t: 30 }), fsmash: NF.spin(7, { dmg: 4 }, { s: 14, a: 28, t: 56, sm: 0 }), nair: NF.stall(0.1, 0.7, { rh: 6, a: 26, t: 40 }), dair: NF.pound(11, { dmg: 8 }, { s: 12, t: 48, hb: [[0, 8, 0, 8, 22]] }) },
    kaiju: { jab: NF.flurry(2, 5), ftilt: { seq: [{ at: 0, a: 4, hb: [[-30, -28, -6, -34, 20]], dm: 0.6, ang: 140 }, { at: 6, a: 4, hb: [[30, -34, 84, -22, 22]], dm: 1.0, kb: 1.2 }], s: 6 }, utilt: NF.proj({ sp: 0.6, vy: -9, g: 0.14, r: 16, life: 22, dmg: 7, ang: 88, kind: 'wave' }, { s: 10, t: 34 }),
      fsmash: NF.proj({ sp: 6, r: 22, life: 16, dmg: 14, bkb: 26, kbg: 36, ang: 36, pierce: 1, rh: 99, kind: 'flame' }, { s: 18, t: 54 }), usmash: NF.rising(5, 8, { hb: [[10, -50, 4, -92, 24]], a: 8 }), dair: NF.pound(12, { dmg: 11, hb: [[56, -8, 56, -8, 36], [-56, -8, -56, -8, 36]] }, { s: 14, t: 52, hb: [[0, 8, 0, 8, 36]] }) },
    samurai: { jab: NF.delayed(7, 0.8, { s: 3, hb: [[30, -32, 78, -32, 8]], seq: [{ at: 0, a: 2, dm: 0.3, hb: [[10, -32, 22, -32, 8]] }, { at: 8, a: 3, dm: 1.2, bk: 1.1, kb: 1.2, hb: [[30, -32, 82, -30, 8]] }] }), ftilt: { seq: [{ at: 0, a: 3, hb: [[24, -8, 66, -8, 9]], dm: 0.6, ang: 70 }, { at: 6, a: 3, hb: [[24, -30, 70, -62, 9]], dm: 0.9, kb: 1.2, ang: 60 }] }, utilt: NF.counter(14, { hb: [[16, -34, 44, -40, 26]], dmg: 8, s: 4, a: 14, t: 44 }),
      dtilt: NF.lunge(3.4, { hb: [[10, -6, 52, -6, 9]], a: 8, t: 28 }), fsmash: NF.flurry(5, 3, { s: 12, hb: [[28, -34, 70, -34, 12]] }), nair: NF.spin(6, {}, { a: 26, t: 40 }), dair: NF.pound(12, { dmg: 9 }, { s: 12, t: 46, hb: [[6, 6, 10, 20, 10]] }) },
    balloon: { jab: NF.proj({ sp: 5, r: 10, life: 14, dmg: 3, kind: 'puff' }, { s: 5, t: 20 }), utilt: NF.rising(2.6, 8, { hb: [[10, -44, 0, -80, 20]] }), ftilt: NF.proj({ sp: 3.4, r: 15, life: 24, dmg: 6, bkb: 12, kbg: 14, kind: 'puff' }, { s: 11, t: 36 }), nair: NF.stall(0.06, 0.5, { rh: 6, a: 26, t: 40 }), uair: NF.stall(0.05, -0.5, { hb: [[0, -62, 0, -96, 22]], a: 12 }), fsmash: NF.delayed(15, 1.25, { s: 12 }), dair: NF.proj({ sp: 0.5, vy: 6, g: 0.1, r: 12, life: 40, dmg: 6, ang: -80, kind: 'puff' }, { s: 11, t: 38 }) },
    penguin: { jab: NF.flurry(3, 3), ftilt: NF.lunge(6.2, { hb: [[8, -10, 48, -10, 14]], a: 8, t: 30 }), dtilt: NF.proj({ sp: 6.5, r: 8, life: 30, dmg: 5, pierce: 1, rh: 99, kind: 'wave' }, { s: 8, t: 30 }), fsmash: NF.delayed(14, 1.3, { s: 14 }), nair: NF.stall(0.1, 0.8, { rh: 6, a: 26, t: 40 }), dair: NF.pound(12, { dmg: 9 }, { s: 12, t: 46, hb: [[0, 8, 0, 8, 22]] }) },
  };
  for (const id of Object.keys(NRM)) { const ov = CH[id].kit.ov = CH[id].kit.ov || {}; for (const key of Object.keys(NRM[id])) ov[key] = Object.assign({}, ov[key], NRM[id][key]); CH[id].rem = 2; }

  // ---- リメイク 2：のこりの32人の通常技。ひとことの書き方：f3=3連打 d8=8フレームおくれて大 lu5=前へ5 ri5=のぼる st=空中でとまる pj:orb=まっすぐ飛び道具 pl:cork=上へ山なり pd:puff=下へ落とす tr=わな sp6=まわる po12=急降下 cg=つかみ
  const RC = (code, S) => {
    const [h, kd] = code.split(':'), t = h.replace(/[0-9.]+$/, ''), n = +(h.slice(t.length) || 0), pk = kd || 'orb', slow = /^(fsmash|usmash|dsmash)$/.test(S);
    switch (t) {
      case 'f': return NF.flurry(n, n > 3 ? 3 : 4, slow ? { s: 12 } : {});
      case 'd': return NF.delayed(n, slow ? 1.3 : 1.15, slow ? { s: 13 } : {});
      case 'lu': return NF.lunge(n, { lp: 2 });
      case 'ri': return NF.rising(n, 6);
      case 'st': return NF.stall(0.1, 0.6, { rh: 6, a: 24, t: 40 });
      case 'pj': return NF.proj({ sp: 9, r: 8, life: 18, dmg: slow ? 9 : 4, kind: pk, bkb: slow ? 18 : 8, kbg: slow ? 22 : 6 }, { s: slow ? 14 : 7, t: slow ? 46 : 28 });
      case 'pl': return NF.proj({ sp: 4, vy: -7, g: 0.28, r: 9, life: 40, dmg: 5, ang: 70, kind: pk }, { s: 9, t: 32 });
      case 'pd': return NF.proj({ sp: 1, vy: 7, g: 0.2, r: 9, life: 34, dmg: 6, ang: -80, kind: pk }, { s: 10, t: 36 });
      case 'tr': return NF.trap({ r: 12, life: 420, dmg: 5, kind: 'mine' }, { s: 8, t: 30 });
      case 'sp': return NF.spin(n || 6, {}, { a: 26, t: 40 });
      case 'po': return NF.pound(n || 12, {}, { s: 12, t: 46 });
      case 'cg': return NF.cmd({ s: 9, t: 36, dmg: 6 });
    }
    throw new Error('RC ' + code);
  };
  const NRM2 = {
    rocketon: 'jab=f2 ftilt=pj:fist utilt=ri6 dtilt=lu5 fsmash=d14 nair=st dair=po13',
    pumper: 'jab=f3 ftilt=lu4 utilt=pl:wave dtilt=pj:wave fsmash=pj:wave nair=sp6 dair=pd:wave',
    scoopjack: 'jab=f3 ftilt=d7 utilt=ri5 dtilt=lu4 fsmash=lu6 nair=sp7 dair=po11',
    sonar: 'jab=pj:wave ftilt=pj:wave utilt=pl:wave dtilt=tr fsmash=d15 nair=st dair=pd:wave',
    dozer: 'jab=d5 ftilt=lu3 utilt=ri4 dtilt=cg fsmash=lu7 nair=sp6 dair=po14',
    paper: 'jab=f4 ftilt=lu5 utilt=ri3 dtilt=pj:cork fsmash=d12 nair=st fair=f3 dair=pd:cork',
    patrol: 'jab=d6 ftilt=cg utilt=pl:orb dtilt=tr fsmash=f4 nair=sp7 dair=po12 fair=lu4',
    reed: 'jab=f2 ftilt=pj:wave utilt=pl:wave dtilt=lu4 fsmash=pj:wave nair=st uair=st',
    riff: 'jab=pj:wave ftilt=f3 utilt=pl:orb dtilt=pj:wave fsmash=f5 nair=sp7 dair=pd:orb',
    drum: 'jab=d6 ftilt=lu4 utilt=ri6 dtilt=cg fsmash=d17 nair=sp6 dair=po13',
    belle: 'jab=f2 ftilt=lu6 utilt=pl:puff dtilt=pj:puff fsmash=d12 nair=st fair=d7 dair=po11',
    keys: 'jab=f5 ftilt=pj:orb utilt=ri4 dtilt=tr fsmash=f4 nair=sp8 dair=pd:orb',
    stapler: 'jab=pj:cork ftilt=cg utilt=pl:cork dtilt=lu4 fsmash=pj:shuriken nair=st dair=po12',
    sushi: 'jab=f3 ftilt=d6 utilt=ri5 dtilt=lu6 fsmash=lu7 nair=sp6 dair=pd:puff',
    void: 'jab=pj:orb ftilt=cg utilt=pl:orb dtilt=tr fsmash=pj:orb nair=st dair=pd:orb',
    comet: 'jab=f3 ftilt=lu7 utilt=ri6 dtilt=pj:flame fsmash=pj:flame nair=st dair=lu4',
    mirror: 'jab=d4 ftilt=d6 utilt=ri4 dtilt=lu5 fsmash=d15 nair=sp7 fair=f2 dair=po12',
    sand: 'jab=pj:puff ftilt=pj:puff utilt=pl:puff dtilt=tr fsmash=lu6 nair=sp6 dair=pd:puff',
    shroom: 'jab=f2 ftilt=pl:puff utilt=ri4 dtilt=tr fsmash=d14 nair=st dair=po11',
    camp: 'jab=f3 ftilt=lu4 utilt=pl:flame dtilt=pj:flame fsmash=pj:flame nair=sp6 dair=pd:flame',
    snow: 'jab=pj:puff ftilt=d6 utilt=ri5 dtilt=tr fsmash=pj:puff nair=st dair=po12',
    kite: 'jab=f2 ftilt=lu5 utilt=ri7 dtilt=lu3 fsmash=d11 nair=sp7 uair=st dair=lu4',
    door: 'jab=d4 ftilt=cg utilt=ri4 dtilt=pj:wave fsmash=d16 nair=sp6 dair=po13',
    pinball: 'jab=f4 ftilt=lu6 utilt=ri5 dtilt=lu4 fsmash=f3 nair=st dair=po12',
    bomb: 'jab=d5 ftilt=pl:shell utilt=cg dtilt=tr fsmash=lu6 nair=sp6 dair=pd:shell',
    ghost: 'jab=f3 ftilt=d7 utilt=ri4 dtilt=lu3 fsmash=d13 nair=st dair=pd:orb',
    thunder: 'jab=f4 ftilt=pj:shuriken utilt=ri6 dtilt=lu6 fsmash=pj:shuriken nair=sp7 dair=lu5',
    cham: 'jab=d5 ftilt=lu6 utilt=cg dtilt=pj:cork fsmash=d12 nair=st fair=f3 dair=po11',
    magnet: 'jab=d5 ftilt=cg utilt=ri5 dtilt=tr fsmash=lu5 nair=sp6 dair=pd:orb',
    stamp: 'jab=f2 ftilt=d6 utilt=ri3 dtilt=cg fsmash=d18 nair=sp6 dair=po14',
    plaster: 'jab=f3 ftilt=pj:puff utilt=ri4 dtilt=pj:puff fsmash=f5 nair=st dair=pd:puff',
    prism: 'jab=pj:orb ftilt=f3 utilt=pl:orb dtilt=lu5 fsmash=pj:orb nair=sp8 fair=d6 dair=po12',
  };
  for (const id of Object.keys(NRM2)) { const ov = CH[id].kit.ov = CH[id].kit.ov || {}; for (const part of NRM2[id].split(' ')) { const [k, c] = part.split('='); ov[k] = Object.assign({}, ov[k], RC(c, k)); } CH[id].rem = 2; }

  // 通常技のリメイクのあとの強さの調整（おもちゃごとの pw のかけ算）
  const PWADJ = {"ninja":1.25,"wiz":1.217,"cat":1.032,"bear":0.811,"tank":0.919,"penguin":0.861,"crab":1.052,"jack":0.777,"giraffe":0.746,"robo":0.993,"duck":0.994,"tin":1.045,"top":1.034,"ball":1.048,"snail":1.087,"kaiju":0.977,"samurai":1.053,"balloon":0.992,"rocketon":1.127,"stapler":1.07,"void":1.01,"bomb":0.969,"magnet":0.936,"plaster":0.923,"prism":1.057,"sand":1.045,"shroom":0.974,"pinball":1.029,"cham":1.031,"patrol":0.973,"pumper":1.031,"sonar":1.036,"paper":0.959,"keys":0.942,"mirror":0.945,"camp":1.055,"kite":0.898,"ghost":0.869,"thunder":1.065,"door":1.031,"snow":1.034,"stamp":0.944}; // @PWADJ
  for (const id of Object.keys(PWADJ)) CH[id].kit.pw = +(CH[id].kit.pw * PWADJ[id]).toFixed(3);

  // はじめの18人の並び（ボスの junk は入れない）
  const CHAR_IDS = ['robo', 'duck', 'tin', 'bear', 'top', 'jack', 'ninja', 'wiz', 'cat', 'tank', 'giraffe', 'ball', 'crab', 'snail', 'kaiju', 'samurai', 'balloon', 'penguin'];
  // はじめの18人。選ぶ画面と開き方の古い決まり（robo / duck / bear が最初から、tin / top / jack がラダー、あとは勝つたび）に使う
  const LEGACY = CHAR_IDS.slice();
  for (const id of Object.keys(CH)) if (!META[id] && id !== 'junk' && CHAR_IDS.indexOf(id) < 0) CHAR_IDS.push(id); // 新しいおもちゃは、書いた順に後ろへ

  // ------------------------------------------------------------------------------------------------ タイプ
  const ARCH = [
    { id: 'allround', ja: 'バランス', en: 'All-round' }, { id: 'rush', ja: 'ラッシュ', en: 'Rushdown' }, { id: 'power', ja: 'パワー', en: 'Power' },
    { id: 'zone', ja: '飛び道具', en: 'Ranged' }, { id: 'grab', ja: 'つかみ', en: 'Grappler' }, { id: 'trick', ja: 'トリッキー', en: 'Trickster' },
    { id: 'reach', ja: 'リーチ', en: 'Reach' }, { id: 'counter', ja: 'カウンター', en: 'Counter' }, { id: 'air', ja: '空中', en: 'Aerial' }, { id: 'trap', ja: 'わな', en: 'Trapper' },
  ];

  // ------------------------------------------------------------------------------------------------ 技のひな形
  // kit.tpl = 名前。ふつうの技を作るとき、ひな形の base（reach/sp/pw/rr/fx）→ kit の値 の順に重ね、ov はひな形 → kit.ov の順に重ねる。
  // ov の中身（技ごと）：sp=速さ s=はじまるまで（フレーム固定） a=あたり判定の長さ t=ぜんぶ（フレーム固定） dt=ぜんぶへの足し算 pw=ちから dmg=ダメージ（固定）
  //   bkb kbg ang=ふっとばし reach rr hb=当たり判定を丸ごと差しかえ ll=空中のおりるすき fx=エフェクト
  const TPL = {
    // 刀・剣：長くて細い当たり判定。はじまりは少し遅い
    blade: { base: { reach: 1.3, sp: 1.04, pw: 1.0, rr: 0.82, fx: 'slash' }, ov: {
      jab: { sp: 0.9, reach: 1.15, a: 2 }, ftilt: { reach: 1.5, a: 5, dt: 3, ang: 30 }, utilt: { rr: 0.9, a: 6, ang: 100 }, dtilt: { reach: 1.4, a: 3, ang: 62 },
      fsmash: { reach: 1.5, a: 6, dt: 6, ang: 32, hb: [[26, -46, 78, -18, 18]] }, usmash: { a: 7, hb: [[26, -28, -6, -92, 20]] }, dsmash: { hb: [[44, -10, 58, -10, 14], [-44, -10, -58, -10, 14]], a: 4 },
      nair: { fx: 'spin', rr: 1.05 }, fair: { reach: 1.5, a: 5, ll: 16 }, bair: { reach: 1.4, ang: 150 }, uair: { reach: 1.1, a: 6 }, dair: { a: 7, ang: -80, hb: [[10, -8, 14, 14, 13]] } } },
    // 殴り：短いリーチで速くて、当たり判定は大きい
    brawler: { base: { reach: 0.95, sp: 0.92, pw: 1.1, rr: 1.15, fx: 'punch' }, ov: {
      jab: { sp: 0.8, a: 4 }, ftilt: { a: 5, ang: 42 }, utilt: { rr: 1.2, ang: 78 }, dtilt: { sp: 0.85, ang: 80 },
      fsmash: { rr: 1.2, a: 5, dt: -2 }, usmash: { rr: 1.15 }, dsmash: { sp: 0.9 }, nair: { a: 12, rr: 1.1 }, fair: { sp: 0.85 }, bair: { sp: 0.85 }, uair: { sp: 0.9 }, dair: { a: 7 } } },
    // 重い：遅いが、一発が強く、ふっとびにくい
    bulk: { base: { reach: 1.05, sp: 1.22, pw: 1.34, rr: 1.28, fx: 'punch' }, ov: {
      jab: { sp: 1.0 }, ftilt: { dt: 4, kbg: 30 }, utilt: { dt: 3 }, dtilt: { dt: 3 }, fsmash: { dt: 8, a: 5, kbg: 52 }, usmash: { dt: 6, a: 6 }, dsmash: { dt: 6, rr: 1.1 },
      nair: { a: 12, ll: 12 }, fair: { dt: 4, ll: 18 }, bair: { dt: 4 }, uair: { dt: 3 }, dair: { dt: 6, ll: 22, ang: -76 } } },
    // 速い：軽くて速い連続技向き。一発は弱い
    swift: { base: { reach: 0.95, sp: 0.82, pw: 0.88, rr: 0.95, fx: 'kick' }, ov: {
      jab: { sp: 0.7, a: 2, dt: -3 }, ftilt: { sp: 0.78, dt: -3, ang: 48 }, utilt: { sp: 0.8, a: 4, ang: 92 }, dtilt: { sp: 0.75, dt: -3 },
      fsmash: { sp: 0.85, dt: -6, pw: 0.95 }, usmash: { sp: 0.85, dt: -6 }, dsmash: { sp: 0.85, dt: -6, a: 5 }, nair: { a: 8, sp: 0.8, ll: 5 }, fair: { sp: 0.8, ll: 8 }, bair: { sp: 0.8, ll: 7 }, uair: { sp: 0.8 }, dair: { sp: 0.85, ll: 12 } } },
    // 飛び道具・遠く：近い技は弱くて遅く、リーチはふつう
    zoner: { base: { reach: 1.15, sp: 1.08, pw: 0.92, rr: 0.95, fx: 'cast' }, ov: {
      jab: { sp: 1.0, pw: 0.85, fx: 'punch' }, ftilt: { reach: 1.2, a: 5, fx: 'slash' }, utilt: { a: 6 }, dtilt: { reach: 1.2 }, fsmash: { reach: 1.2, a: 6, fx: 'slash' }, usmash: { a: 6 }, dsmash: { a: 7 },
      nair: { rr: 1.2, a: 14, fx: 'spin' }, fair: { reach: 1.25 }, bair: { reach: 1.2 }, uair: { reach: 1.2 }, dair: { a: 8 } } },
    // ふわふわ：空中技が長く出て、着地のすきが小さい。地上は弱い
    floaty: { base: { reach: 1.0, sp: 0.95, pw: 0.86, rr: 1.05, fx: 'puff' }, ov: {
      jab: { pw: 0.8 }, ftilt: { pw: 0.85 }, utilt: { a: 8, ang: 90 }, dtilt: { pw: 0.8 }, fsmash: { pw: 0.85, a: 6 }, usmash: { a: 8, pw: 0.9 }, dsmash: { pw: 0.85 },
      nair: { a: 16, rr: 1.2, ll: 4, ac: 0 }, fair: { a: 6, ll: 6 }, bair: { a: 6, ll: 6 }, uair: { a: 8, ll: 4 }, dair: { a: 8, ll: 8, ang: -64 } } },
  };

  // ------------------------------------------------------------------------------------------------ おもちゃの開き方（データと、判定だけ。保存は index.html）
  // 開き方：start＝はじめから / ladder＝ラダーの勝ち（index.html の LADDER の rew）/ win＝通算の勝ち数 / stat＝記録（stats の項目が n 以上）/ cl＝ラダーを n 回クリア
  // はじめの18人は今までどおり：robo・duck・bear は最初から、tin・top・jack はラダー、あとの12人は通算 2・4・…・24 勝、ラダーを1回クリアで全員。
  // あとから足すおもちゃは、データの ul：{ w: 勝ち数 } または { s: ['kos', 40] }（記録）または { cl: 2 }。
  const STARTERS = ['robo', 'duck', 'bear'], LADDER_REWARDS = ['tin', 'top', 'jack'];
  const WIN_ORDER = LEGACY.slice(6);
  const STAT_LABEL = { kos: ['KO した回数', 'KOs'], falls: ['落ちた回数', 'Falls'], maxCmb: ['最大コンボ', 'Best combo'], perfect: ['ノーダメージ勝ち', 'Flawless wins'], hard: ['「つよい」に勝った', 'Wins on Hard'],
    ffa: ['3人以上の試合に勝った', 'Free-for-all wins'], twop: ['ふたり対戦', '2P matches'], smashKo: ['強攻撃での KO', 'Smash KOs'], counter: ['カウンター', 'Counters'], ledge: ['ふちのつかまり', 'Ledge grabs'],
    grab: ['つかみ', 'Grabs'], block: ['まもりで防いだ', 'Blocks'], timed: ['時間制の勝ち', 'Timed wins'], boss: ['ボスに勝った', 'Boss wins'], lad: ['ラダー クリア', 'Ladder clears'], train: ['れんしゅう', 'Practice runs'],
    spike: ['メテオ KO', 'Spikes'], pshield: ['ジャストガード', 'Perfect shields'], tech: ['うけ身', 'Techs'], flick: ['はじき', 'Flicks'], wins: ['勝ち', 'Wins'] };
  function unlockRule(id) {
    if (STARTERS.indexOf(id) >= 0) return { t: 'start' };
    if (LADDER_REWARDS.indexOf(id) >= 0) return { t: 'ladder' };
    const wi = WIN_ORDER.indexOf(id); if (wi >= 0) return { t: 'win', n: (wi + 1) * 2, legacy: 1 };
    const c = CH[id], u = c && c.ul;
    if (u && u.w) return { t: 'win', n: u.w };
    if (u && u.s) return { t: 'stat', k: u.s[0], n: u.s[1] };
    if (u && u.cl) return { t: 'cl', n: u.cl };
    return { t: 'win', n: 9999 };
  }
  // prog：{ wins, cl, stats }。返す値：{ rule, done, have, need }（have / need は進み具合の数）
  function unlockInfo(id, prog) {
    const r = unlockRule(id), stats = prog.stats || {}, cl = prog.cl | 0, wins = prog.wins | 0;
    if (r.t === 'start') return { rule: r, done: true, have: 1, need: 1 };
    if (r.t === 'win') return { rule: r, done: wins >= r.n || (r.legacy && cl >= 1), have: Math.min(wins, r.n), need: r.n };
    if (r.t === 'stat') { const v = stats[r.k] | 0; return { rule: r, done: v >= r.n, have: Math.min(v, r.n), need: r.n }; }
    if (r.t === 'cl') return { rule: r, done: cl >= r.n, have: Math.min(cl, r.n), need: r.n };
    return { rule: r, done: false, have: 0, need: 1 }; // ladder：index.html が un に入れる
  }
  // 「あと何をすれば開く？」の文（ja / en）
  function unlockText(id, prog, en) {
    const i = unlockInfo(id, prog), r = i.rule, left = Math.max(0, i.need - i.have);
    if (r.t === 'win') return en ? (left + ' more win' + (left === 1 ? '' : 's') + ' (' + i.have + '/' + i.need + ')') : ('あと ' + left + ' 勝（' + i.have + '/' + i.need + '）');
    if (r.t === 'stat') { const l = STAT_LABEL[r.k] || [r.k, r.k]; return en ? (l[1] + ': ' + i.have + '/' + i.need) : (l[0] + '：' + i.have + '/' + i.need); }
    if (r.t === 'cl') return en ? ('Clear the ladder ' + r.n + ' time' + (r.n === 1 ? '' : 's') + ' (' + i.have + '/' + r.n + ')') : ('ラダーを ' + r.n + ' 回クリア（' + i.have + '/' + r.n + '）');
    if (r.t === 'ladder') return en ? 'Win a ladder fight' : 'ラダーの勝ちで開く';
    return '';
  }

  // ------------------------------------------------------------------------------------------------ 色ちがい（見た目だけ）
  // palettes(c)：[{ id, col, col2, name }]。0 番はいつもの色。ぜんぶで PAL_N（8）色。同じおもちゃで、ぜんぶちがう色になるようにえらぶ。
  const PAL_N = 8;
  const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s, l];
  }
  function hsl2hex(h, s, l) {
    h = ((h % 360) + 360) % 360; const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return rgb2hex(f(0) * 255, f(8) * 255, f(4) * 255);
  }
  const rot = (hex, deg, lift) => { const [r, g, b] = hex2rgb(hex), [h, s, l] = rgb2hsl(r, g, b); return hsl2hex(h + deg, s < 0.3 ? 0.55 : s, clamp(l + (lift || 0), 0.18, 0.86)); };
  const cdist = (a, b) => { const p = hex2rgb(a), q = hex2rgb(b); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); };
  const HUE_NAMES = [[15, 'あか', 'Red'], [45, 'だいだい', 'Orange'], [70, 'きいろ', 'Yellow'], [105, 'きみどり', 'Lime'], [165, 'みどり', 'Green'], [200, 'みずいろ', 'Teal'], [255, 'あお', 'Blue'], [295, 'むらさき', 'Purple'], [335, 'ももいろ', 'Pink'], [361, 'あか', 'Red']];
  function hueName(hex) {
    const [r, g, b] = hex2rgb(hex), [h, s, l] = rgb2hsl(r, g, b);
    if (s < 0.14) return l < 0.35 ? ['すみいろ', 'Charcoal'] : l > 0.75 ? ['しろ', 'White'] : ['はいいろ', 'Grey'];
    for (const e of HUE_NAMES) if (h < e[0]) return [e[1], e[2]];
    return ['あか', 'Red'];
  }
  const PAL_CACHE = {};
  const MIN_PAL_DIST = 150; // 色ちがいどうしの、2色ぶんの RGB のへだたり（足し算）の下限
  function palettes(c) {
    if (typeof c === 'string') c = CH[c]; if (!c) return [];
    if (PAL_CACHE[c.id]) return PAL_CACHE[c.id];
    const a = c.color, b = c.color2, out = [{ id: 0, col: a, col2: b, name: { ja: 'ふだんの色', en: 'Classic' } }];
    const cand = [
      [b, a, 'swap'], [rot(a, 120), rot(b, 120)], [rot(a, 240), rot(b, 240)], [hsl2hex(rgb2hsl(...hex2rgb(a))[0], 0.06, 0.28), rot(b, 0, 0.04), 'ink'],
      [rot(a, 60), rot(b, 60)], [rot(a, 180), rot(b, 180)], [rot(a, 300), rot(b, 300)], ['#e0b03a', '#fff3cf', 'gold'], [rot(a, 30), rot(b, 210)], [rot(a, 90), rot(b, 270)],
      [rot(a, 150, 0.05), rot(b, 330)], [rot(a, 210, -0.05), rot(b, 30)], ['#f4f1ea', rot(b, 0), 'snow'], ['#2b2a33', rot(b, 120), 'night'], [rot(a, 270), rot(b, 90)], [rot(a, 330), rot(b, 150)],
      // 暗い・うすい色のおもちゃでも足りるように、明るさをずらした候補
      [rot(a, 120, 0.22), rot(b, 120, -0.2)], [rot(a, 240, 0.22), rot(b, 240, -0.2)], [rot(a, 0, 0.3), rot(b, 180, -0.25)], [rot(a, 60, 0.25), rot(b, 240, -0.22)],
      [rot(a, 180, 0.25), rot(b, 0, -0.22)], [rot(a, 300, 0.25), rot(b, 120, -0.22)], [rot(a, 0, -0.2), rot(b, 90, -0.1)], ['#d94a4a', '#fff0d0', 'red'], ['#3f8fd9', '#f7f3d8', 'blue'], ['#4cae5c', '#f6f0c8', 'green'], ['#8a5bd0', '#f6f0e0', 'violet'],
    ];
    for (const [p, q, tag] of cand) {
      if (out.length >= PAL_N) break;
      let okp = true; for (const o of out) if (cdist(p, o.col) + cdist(q, o.col2) < MIN_PAL_DIST) { okp = false; break; }
      if (!okp) continue;
      const nm = tag === 'swap' ? { ja: 'いれかえ', en: 'Swapped' } : tag === 'gold' ? { ja: 'きんいろ', en: 'Gilded' } : tag === 'ink' ? { ja: 'すみ', en: 'Ink' } : tag === 'snow' ? { ja: 'ゆき', en: 'Snow' } : tag === 'night' ? { ja: 'よる', en: 'Night' } : tag === 'red' ? { ja: 'あか', en: 'Red' } : tag === 'blue' ? { ja: 'あお', en: 'Blue' } : tag === 'green' ? { ja: 'みどり', en: 'Green' } : tag === 'violet' ? { ja: 'むらさき', en: 'Violet' } : (() => { const h = hueName(p); return { ja: h[0], en: h[1] }; })();
      out.push({ id: out.length, col: p, col2: q, name: nm });
    }
    for (let k = 0; out.length < PAL_N; k++) { // それでも足りなければ、へだたりを無視して色相をずらして足す（ふつうは起こらない）
      const d = 20 + k * 40; out.push({ id: out.length, col: rot(a, d), col2: rot(b, d + 180), name: { ja: '色' + out.length, en: 'Color ' + out.length } });
    }
    return (PAL_CACHE[c.id] = out);
  }
  // 同じおもちゃを選んだ人どうしで、色がぶつからないようにする。chars＝スロットごとのおもちゃ、prefs＝スロットごとの希望の色（0〜PAL_N-1、なければ null）。
  // 希望がある人を先にスロット順に決める（同じおもちゃですでに使われていたら、ふつうの割りふりへ）。そのあと、のこりを「おなじおもちゃの何人目か」で割りふる
  // （1人目は 0、2人目は 1、…。使われていたら次に空いている色）。返す値：スロットごとの色の番号。同じおもちゃなら、PAL_N 人までかならずちがう色になる。
  function assignPalettes(chars, prefs) {
    const n = chars.length, out = new Array(n).fill(-1), used = {};
    const take = (ch, p) => { (used[ch] = used[ch] || {})[p] = 1; };
    for (let i = 0; i < n; i++) {
      const p = prefs && prefs[i]; if (Number.isInteger(p) && p >= 0 && p < PAL_N && !(used[chars[i]] && used[chars[i]][p])) { out[i] = p; take(chars[i], p); }
    }
    const rank = {};
    for (let i = 0; i < n; i++) {
      if (out[i] >= 0) continue; const ch = chars[i], r = rank[ch] | 0; rank[ch] = r + 1; used[ch] = used[ch] || {};
      let p = r % PAL_N; for (let k = 0; k < PAL_N && used[ch][p]; k++) p = (p + 1) % PAL_N;
      out[i] = p; take(ch, p);
    }
    return out;
  }

  const CH_LIST = Object.keys(CH).map(k => CH[k]); // 並び順＝試合に出てくる順（CHAR_IDS の順もこれ）
  const api = { sp, CH, CH_LIST, CHAR_IDS, LEGACY, META, ARCH, TPL, PAL_N, MIN_PAL_DIST, palettes, assignPalettes, cdist, STARTERS, LADDER_REWARDS, WIN_ORDER, STAT_LABEL, unlockRule, unlockInfo, unlockText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BrawlKits = api;
})(typeof window !== 'undefined' ? window : globalThis);
