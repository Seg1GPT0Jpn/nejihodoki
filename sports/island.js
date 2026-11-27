// ぽかぽか島スポーツ：島のくらし（pure。データと決まりだけ。UMD：window.SportsIsland / require）。
// 島の人たち（NPC）・いきもの・ランドマークの物語・スタンプ帳・種目のバリエーションの解放・ガイドのおすすめ。すべてオリジナル。
(function (root) {
  'use strict';
  const C = (typeof require === 'function' && typeof module === 'object') ? require('./core.js') : root.SportsCore;
  const { clamp, hash32 } = C;

  const GUIDE = { id: 'pipo', ja: 'ガイドのピポ', en: 'Pipo the guide', av: { k: 3, c: 3, h: 5, f: 1 } };
  // 島の人たち：spot = ふだんいる場所（ランドマークの ID）、col = ふくの色。lines = [[ja, en], …]（日がわりでどれかを言う）
  const NPCS = [
    { id: 'roku', ja: '船のろくさん', en: 'Roku the boatman', spot: 'harbor', av: { k: 0, c: 6, h: 1, f: 1 }, lines: [['港の船は みんな ろくさんの なかま。波が高い日は ジェットレースが おもしろいぞ！', 'Every boat in the harbour is my friend. Big waves make the jet race a blast!'], ['ブイは ぶつかると ガツンと おそくなる。よけるのが コツさ。', 'Buoys slow you down hard. Steer around them!']] },
    { id: 'hina', ja: 'ひなた先生', en: 'Teacher Hinata', spot: 'town', av: { k: 1, c: 1, h: 0, f: 0 }, lines: [['ぽかぽかタウンへ ようこそ。★を ぜんぶ あつめた人は まだ いないんだよ。', 'Welcome to Pokapoka Town. Nobody has collected every star yet!'], ['むずかしさを ひとつ あげると、同じ種目でも 別のゲームみたいに なるよ。', 'Raise the level by one and the same sport feels like a new game.']] },
    { id: 'fuku', ja: 'パンやのふくちゃん', en: 'Fuku the baker', spot: 'town', av: { k: 2, c: 3, h: 2, f: 3 }, lines: [['ゴルフのあとの おにぎりパンは さいこうだよ。9ホールは すぐ おわるからね。', 'A rice-ball bun after golf is the best. Nine holes go by fast!'], ['朝いちばんの パンは、ひこうじょうの パイロットさんに とどけるんだ。', 'The first bread of the morning goes to the pilot at the airstrip.']] },
    { id: 'tomo', ja: 'とうだいのともじい', en: 'Old Tomo of the lighthouse', spot: 'lighthouse', av: { k: 0, c: 7, h: 0, f: 3 }, lines: [['夜になると とうだいは 海のずっと むこうまで 光を とどける。夕方の島は 一番きれいじゃよ。', 'At night the lighthouse shines far over the sea. The island is loveliest at dusk.'], ['ひこうきで 近づいて「さつえい」すると、アルバムに のるぞ。', 'Fly close and press Photo, and it goes into your album.']] },
    { id: 'sora', ja: 'パイロットのそら', en: 'Sora the pilot', spot: 'airstrip', av: { k: 2, c: 4, h: 1, f: 2 }, lines: [['ひこうじょうに おりるとき、機首を すこし 上げると やさしく着陸できるよ。', 'Lift the nose a little before touchdown for a soft landing.'], ['リングは 順番どおり！ 風船は おまけの ごほうびさ。', 'Rings go in order! Balloons are a bonus.']] },
    { id: 'kama', ja: '火山博士のかまどさん', en: 'Dr. Kamado the volcanologist', spot: 'volcano', av: { k: 1, c: 5, h: 2, f: 0 }, lines: [['まるい火山は もう ねむって 百年。てっぺんの穴は、ぐるぐる飛ぶのに ちょうどいい。', 'The round volcano has slept for a hundred years. Its crater is perfect to circle.'], ['火山の土は あたたかくて、まわりの森は よく育つんだ。', 'The warm volcanic soil makes the forest around it grow well.']] },
    { id: 'mame', ja: 'キャディーのまめ', en: 'Mame the caddie', spot: 'golf', av: { k: 3, c: 2, h: 4, f: 1 }, lines: [['風は 旗を見て。池を こえるときは 1つ大きい クラブがおすすめ。', 'Read the wind from the flag. Take one more club to carry water.'], ['グリーンの 矢印は、ボールが ころがる向き。カップの すこし うえを ねらおう。', 'The green arrows show which way the ball rolls. Aim a little uphill of the cup.']] },
    { id: 'take', ja: 'しはんのたけ', en: 'Take the sensei', spot: 'kendo', av: { k: 2, c: 0, h: 5, f: 3 }, lines: [['受けは 「ぴたり」が 大事。矢印の輪が 金色に なる いっしゅんを まて。', 'A perfect parry is everything. Wait for the ring to turn gold.'], ['竹は まっすぐ のびる。切るときも まっすぐ、むねを はるのじゃ。', 'Bamboo grows straight. Cut straight, too, and stand tall.']] },
  ];
  // いきもの：どれも島のどこかに（kind: bird = 空、boat = 海、sea = 海の中、beach = はま）
  const WILD = [
    { id: 'gull', ja: 'かもめ', en: 'Gull', kind: 'bird', note: ['島の空を ぐるぐる飛ぶ。ひこうきの うしろを ついてくることも。', 'Circles over the island and sometimes follows planes.'] },
    { id: 'turtle', ja: 'ウミガメ', en: 'Sea turtle', kind: 'sea', note: ['浅い海を ゆっくり およぐ。100年生きる子もいる。', 'Swims slowly through the shallows. Some live a hundred years.'] },
    { id: 'crab', ja: 'カニ', en: 'Crab', kind: 'beach', note: ['はまを よこ歩き。見つけたら そっとしておこう。', 'Scuttles sideways along the beach. Leave it be.'] },
    { id: 'dolphin', ja: 'イルカ', en: 'Dolphin', kind: 'sea', note: ['ときどき 沖で ジャンプ。タイミングが あえば会えるよ。', 'Sometimes leaps out at sea. Be there at the right moment.'] },
  ];
  // ランドマークの物語（ja, en）。種目の場所も、ちいさなおはなしつき
  const STORIES = {
    archery: ['ここは「風読みの原」。むかしの島の人は、風ふきながしで 明日の天気を 当てていたそうです。', 'The Windreader Meadow. Islanders once guessed tomorrow\'s weather from these windsocks.'],
    disc: ['犬の「こむぎ」が はじめて 空中キャッチを した芝生。いまも ここで 毎朝 練習しています。', 'The lawn where Komugi made the first mid-air catch. The dog still practises here every morning.'],
    bowling: ['雨の日の ための ボウリング場。壁に かざってある 100点ごとの 写真が ほこり。', 'A bowling hall for rainy days. The photos on the wall mark every perfect hundred.'],
    kendo: ['竹林のそばの どうじょう。竹の音は 心を しずめてくれます。', 'A dojo beside the bamboo grove. The sound of bamboo calms the mind.'],
    hoops: ['海風の コート。3ポイントの 白い線は 島の子どもたちが 毎年ひき直します。', 'A sea-breeze court. Island kids repaint the three-point line every year.'],
    golf: ['島で いちばん 古い コース。むかしは 牛が 芝を かっていたそうです。', 'The oldest course on the island. Cows used to mow the fairways.'],
    canoe: ['入り江の カヌー乗り場。朝の 水面は まるで ガラスのよう。', 'The canoe dock in the cove. The morning water is like glass.'],
    pingpong: ['雨よけの 屋根の下の 卓球台。ここでは みんな ラリーを 数えながら 打ちます。', 'The table under the rain roof. Everybody counts the rally out loud.'],
    cycling: ['島を ぐるっと 一周する サイクリングロード。夕やけの 時間が いちばん人気。', 'The road that rings the island. Sunset is the favourite time to ride.'],
    jump: ['ボートが ジャンプ台まで ひっぱってくれる 水上ジャンプ場。ジェットレースも ここから スタート。', 'Boats tow you to the ramp here, and the jet race starts from the same pier.'],
    tennis: ['海が 見える テニスコート。ボールが 海に 落ちると、ウミガメが 見に来るそうです。', 'A court with a sea view. They say turtles come to look when a ball lands in the water.'],
    town: ['ぽかぽかタウン：パンやと 学校と 小さな 広場。島の ニュースは ここで 一番はやく 広まります。', 'Pokapoka Town: a bakery, a school and a little square. Island news travels fastest here.'],
    lighthouse: ['白い とうだい。てっぺんの 光は 100年ずっと 島の 船を まもってきました。', 'The white lighthouse. Its light has guarded the island\'s boats for a hundred years.'],
    harbor: ['のんびり港。朝は 魚を おろす 船、夕方は ジェットレースの 船で にぎわいます。', 'Sleepy Harbour. Fish boats in the morning, jet racers in the evening.'],
    airstrip: ['島の ひこうじょう。みじかい 滑走路ですが、風が いいので 着陸しやすいと 評判です。', 'The island airstrip. The runway is short, but the steady wind makes landings gentle.'],
    volcano: ['まるい火山。ずっと ねむっていて、てっぺんの 穴には 小さな 草が はえています。', 'The round volcano. It has slept for ages, and tiny grass grows in its crater.'],
  };
  const STORY_IDS = Object.keys(STORIES);

  // ---------- スタンプ帳 ----------
  const PHOTO_IDS = C.SPORT_IDS.concat(['town', 'lighthouse', 'harbor', 'airstrip', 'volcano']);
  const VKEYS = Object.keys(C.VARIANTS);
  function stampList(save) {
    const out = [], fl = save.fl || { ph: 0 }, bk = save.bk || { n: 0, w: 0 };
    for (const s of C.SPORTS) out.push({ id: 'play.' + s.id, group: 'play', ja: s.ja + ' をあそぶ', en: 'Play ' + s.en, got: !!(save.tm & (1 << s.bit)) });
    for (const s of C.SPORTS) out.push({ id: 'star.' + s.id, group: 'star', ja: s.ja + ' で★3', en: s.en + ': 3 stars', got: [0, 1, 2].some(d => C.starsOf(save, s.id, d) >= 3) });
    PHOTO_IDS.forEach((id, i) => out.push({ id: 'photo.' + id, group: 'photo', ja: (C.sportOf(id) ? C.sportOf(id).ja : id) + ' をさつえい', en: 'Photograph ' + id, got: !!(fl.ph & (1 << i)) }));
    NPCS.forEach((n, i) => out.push({ id: 'npc.' + n.id, group: 'npc', ja: n.ja + ' とおはなし', en: 'Meet ' + n.en, got: !!(bk.n & (1 << i)) }));
    WILD.forEach((w2, i) => out.push({ id: 'wild.' + w2.id, group: 'wild', ja: w2.ja + ' をみつける', en: 'Spot: ' + w2.en, got: !!(bk.w & (1 << i)) }));
    for (const k of VKEYS) out.push({ id: 'var.' + k, group: 'var', ja: C.VARIANTS[k].ja + ' をクリア', en: C.VARIANTS[k].en + ': clear', got: !!(save.vb && save.vb[k] && save.vb[k].some((v, d) => C.variantStars(k, d, v) >= 1)) });
    return out;
  }
  const stampCount = save => stampList(save).filter(s => s.got).length;

  // ---------- 解放 ----------
  // キー → { sport, stars（その種目の★の合計がこれ以上） }。golf18・golfMatch・doubles は種目のオプション
  const UNLOCK = { bowling100: ['bowling', 2], spares: ['bowling', 3], archeryMoving: ['archery', 2], archeryRounds: ['archery', 3], kendoWave: ['kendo', 2], kendoBamboo: ['kendo', 4], hoopsContest: ['hoops', 2], hoopsPickup: ['hoops', 3], jetRace: ['jump', 3], discGolf: ['disc', 3], golf18: ['golf', 2], golfMatch: ['golf', 3], pingpongDoubles: ['pingpong', 2], tennisDoubles: ['tennis', 2], airGlider: ['cycling', 2], airFormation: ['canoe', 2], airDuel: ['hoops', 2] };
  const unlockNeed = key => (UNLOCK[key] ? { sport: UNLOCK[key][0], stars: UNLOCK[key][1] } : null);
  function isUnlocked(save, key) { const n = unlockNeed(key); return !n || C.sportStars(save, n.sport) >= n.stars; }

  // ---------- ガイドのおすすめ ----------
  function guideTips(save, today) {
    const tips = [], dly = C.dailyOf(today || 20261126);
    const unplayed = C.SPORTS.filter(s => !(save.tm & (1 << s.bit)));
    if (unplayed.length) tips.push({ id: 'new', act: { type: 'sport', id: unplayed[0].id }, ja: unplayed[0].ja + ' に まだ行ったことがないよ。のぞいてみよう！', en: 'You have not visited ' + unplayed[0].en + ' yet. Take a look!' });
    if (!(save.dl && save.dl.k === (today || 20261126))) tips.push({ id: 'daily', act: { type: 'daily' }, ja: 'きょうの「きょうのチャレンジ」は ' + C.sportOf(dly.sport).ja + '。同じ日は みんな同じ条件だよ。', en: 'Today\'s Daily Challenge is ' + C.sportOf(dly.sport).en + '. Everyone gets the same conditions.' });
    let near = null; for (const k of Object.keys(UNLOCK)) { if (isUnlocked(save, k)) continue; const n = unlockNeed(k), have = C.sportStars(save, n.sport), gap = n.stars - have; if (!near || gap < near.gap) near = { k, n, gap }; }
    if (near) tips.push({ id: 'unlock', act: { type: 'sport', id: near.n.sport }, ja: C.sportOf(near.n.sport).ja + ' の★を あと ' + near.gap + ' こ あつめると、新しい あそびかたが ひらくよ。', en: 'Collect ' + near.gap + ' more star(s) in ' + C.sportOf(near.n.sport).en + ' to unlock a new way to play.' });
    const ph = popcount((save.fl && save.fl.ph) || 0); if (ph < 16) tips.push({ id: 'photo', act: { type: 'flight' }, ja: '遊覧飛行で ランドマークを さつえいしよう。アルバムは いま ' + ph + '/16 まい。', en: 'Fly the scenic flight and photograph landmarks. Album: ' + ph + '/16.' });
    const sc = stampCount(save), tot = stampList(save).length; tips.push({ id: 'stamps', act: { type: 'stamps' }, ja: 'スタンプ帳は ' + sc + '/' + tot + '。島の人と おはなしするのも スタンプに なるよ。', en: 'Stamp book: ' + sc + '/' + tot + '. Chatting with islanders earns stamps too.' });
    return tips.slice(0, 4);
  }
  const popcount = n => { let c = 0; n = n | 0; while (n) { c += n & 1; n = n >>> 1; } return c; };
  // 日がわりのNPCのせりふ（dateKey から決まる）
  const npcLine = (npc, dateKey) => npc.lines[hash32(npc.id + ':' + dateKey) % npc.lines.length];

  const api = { GUIDE, NPCS, WILD, STORIES, STORY_IDS, PHOTO_IDS, VKEYS, UNLOCK, stampList, stampCount, unlockNeed, isUnlocked, guideTips, npcLine, popcount };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SportsIsland = api;
})(typeof window !== 'undefined' ? window : globalThis);
