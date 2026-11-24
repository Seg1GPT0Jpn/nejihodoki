// わくせいシミュレーターの「まなぶ」：子ども（小・中学生）向けの短い説明（なぜ？カード）、まなぶモードの章、3問チェック、ほんものの地球の歴史。
// 文はやさしい言葉で、わからないことは書かない（まちがえるより、かんたんに）。数字は目安（くわしく欄）。
// 学校の理科とのつながり：小5「天気の変化」「流れる水のはたらき」、小6「土地のつくりと変化」「月と太陽」、中1「大地の成り立ちと変化」、中2「気象とその変化」、中3「地球と宇宙」「自然と人間」。
const PLearn = (() => {
'use strict';
const TOPIC = {
  weather: { ja: '小5 天気の変化／中2 気象とその変化', en: 'Weather (grade 5) / Weather and its changes (grade 8)' },
  water: { ja: '小5 流れる水のはたらき', en: 'The work of flowing water (grade 5)' },
  land: { ja: '小6 土地のつくりと変化／中1 大地の成り立ちと変化', en: 'How the land is made and changes (grades 6–7)' },
  space: { ja: '小6 月と太陽／中3 地球と宇宙', en: 'The Moon and the Sun (grade 6) / Earth and space (grade 9)' },
  nature: { ja: '中3 自然と人間', en: 'Nature and people (grade 9)' },
  life: { ja: '中3 生命の連続性／自然と人間', en: 'Life through time / Nature and people (grade 9)' },
};
// ---- なぜ？カード: a short why, and an optional くわしく with real numbers ----
const WHY = {
  ocean: { icon: '🌊', topic: 'water', title: { ja: '海ができた', en: 'An ocean formed' },
    text: { ja: 'できたばかりの星は、とても熱い。冷えてくると、空の水じょう気が雨になってふり、くぼ地にたまって海になった。', en: 'A newborn planet is very hot. As it cooled, the water vapour in the sky fell as rain and filled the low ground: the first ocean.' },
    more: { ja: '地球の海は、約44億〜40億年前にはあったと考えられている。いまは地表の約7割が海。', en: 'Earth probably had oceans by about 4.4–4.0 billion years ago. Today about 70% of the surface is ocean.' } },
  life: { icon: '🦠', topic: 'life', title: { ja: '生命が生まれた', en: 'Life began' },
    text: { ja: '最初の生き物は、海の中の小さな細胞だった。火山のそばの温かい水が、ゆりかごだったのかもしれない。', en: 'The first living things were tiny cells in the sea. Warm water near volcanoes may have been their cradle.' },
    more: { ja: '地球の生命は約38億〜35億年前には生まれていたと考えられている。', en: 'Life on Earth had probably begun by about 3.8–3.5 billion years ago.' } },
  sky: { icon: '🫧', topic: 'life', title: { ja: '空に酸素がふえた', en: 'Oxygen filled the sky' },
    text: { ja: '光合成をする細菌が、日光で酸素をつくった。酸素は空にたまり、やがて紫外線をさえぎるオゾン層ができた。', en: 'Bacteria that photosynthesise made oxygen from sunlight. Oxygen built up in the air, and later an ozone layer formed that blocks ultraviolet light.' },
    more: { ja: '「大酸化イベント」は約24億年前。いまの空気の約21%が酸素。', en: 'The Great Oxidation Event was about 2.4 billion years ago. Today about 21% of the air is oxygen.' } },
  forest: { icon: '🌲', topic: 'life', title: { ja: '陸に森が広がった', en: 'Forests spread over the land' },
    text: { ja: 'オゾン層が紫外線を弱めたので、植物が陸に上がれた。根が岩をくだき、雨が二酸化炭素を岩にとじこめる（風化）。', en: 'The ozone layer weakened the ultraviolet light, so plants could live on land. Roots break up rock, and rain locks carbon dioxide into rock (weathering).' },
    more: { ja: '植物が陸に上がったのは約4億7000万年前ごろ。', en: 'Plants moved onto land about 470 million years ago.' } },
  animals: { icon: '🦕', topic: 'life', title: { ja: '陸に動物があらわれた', en: 'Animals walked on land' },
    text: { ja: '海で生まれた動物の一部が、陸でくらせるようになった。やがて大きな恐竜の時代がくる。', en: 'Some of the animals born in the sea learned to live on land. Later came the age of the great dinosaurs.' },
    more: { ja: '海で動物がいっきにふえた「カンブリア爆発」は約5億4000万年前。恐竜は約2億3000万年前にあらわれた。', en: 'The “Cambrian explosion” of sea animals was about 539 million years ago. Dinosaurs appeared about 230 million years ago.' } },
  civ: { icon: '🏙️', topic: 'nature', title: { ja: '文明が生まれた', en: 'A civilization arose' },
    text: { ja: '人々は火や燃料を使うようになった。燃やすと二酸化炭素が出て、星が暖まる（温室効果）。', en: 'People began to use fire and fuel. Burning releases carbon dioxide, which warms the planet (the greenhouse effect).' },
    more: { ja: '産業革命の前の二酸化炭素は約280ppm、いまは約420ppm。', en: 'Carbon dioxide was about 280 ppm before the industrial revolution and is about 420 ppm today.' } },
  space: { icon: '🚀', topic: 'space', title: { ja: '宇宙へ', en: 'Into space' },
    text: { ja: '星の外から見ると、空気はとてもうすい膜。その中で、水も生き物もめぐっている。', en: 'Seen from outside, the air is a very thin skin. Inside it, water and life go round and round.' },
    more: { ja: '空気の大部分は、地面から高さ約10kmまでにある（地球の半径は約6400km）。', en: 'Most of the air lies within about 10 km of the ground (Earth’s radius is about 6,400 km).' } },
  snow: { icon: '🧊', topic: 'weather', title: { ja: '星がこおりはじめた', en: 'The planet is freezing' },
    text: { ja: '白い氷は日光をはね返す。すると星が冷えて、氷がもっと広がる。この連鎖を「氷とアルベドのフィードバック」という。', en: 'White ice reflects sunlight. The planet cools, so the ice spreads further. This chain is called the ice–albedo feedback.' },
    more: { ja: '地球も約7億年前ごろ、ほぼ全体がこおった（全球凍結）と考えられている。火山の二酸化炭素がたまって、やがてとけた。', en: 'Earth itself probably froze over about 700 million years ago (“Snowball Earth”). Volcanic carbon dioxide built up and thawed it.' } },
  thaw: { icon: '🌤️', topic: 'land', title: { ja: '氷がとけた', en: 'The ice melted' },
    text: { ja: '氷の下でも火山は二酸化炭素を出しつづける。温室効果が強くなって、氷がとけた。', en: 'Volcanoes keep giving out carbon dioxide even under the ice. The greenhouse effect grew stronger and the ice melted.' } },
  boil: { icon: '🔥', topic: 'weather', title: { ja: '暑すぎる', en: 'Too hot' },
    text: { ja: '暑いと海から水じょう気がたくさん出る。水じょう気も熱をとじこめるので、もっと暑くなる。', en: 'When it is hot, lots of water evaporates from the sea. Water vapour also traps heat, so it gets even hotter.' },
    more: { ja: '金星は二酸化炭素の厚い空気につつまれ、表面は約460°C。', en: 'Venus is wrapped in thick carbon dioxide; its surface is about 460 °C.' } },
  impact: { icon: '☄️', topic: 'space', title: { ja: '隕石のふゆ', en: 'An impact winter' },
    text: { ja: '大きな隕石がぶつかると、ちりが空をおおって日光が届かない。星は暗く寒くなり、生き物がへる。', en: 'When a big rock from space hits, dust covers the sky and blocks the sunlight. The planet becomes dark and cold, and life suffers.' },
    more: { ja: '約6600万年前の隕石の衝突のあと、恐竜（鳥をのぞく）は絶滅した。', en: 'After an impact about 66 million years ago, the dinosaurs (apart from birds) died out.' } },
  volcano: { icon: '🌋', topic: 'land', title: { ja: '火山と二酸化炭素', en: 'Volcanoes and carbon dioxide' },
    text: { ja: '火山は地下から二酸化炭素を出す。二酸化炭素は熱を宇宙へにがしにくくする（温室効果）。', en: 'Volcanoes release carbon dioxide from deep underground. Carbon dioxide makes it harder for heat to escape to space (the greenhouse effect).' } },
  rain: { icon: '🌧️', topic: 'water', title: { ja: '水のじゅんかん', en: 'The water cycle' },
    text: { ja: '海の水は日光で水じょう気になり、雲になり、雨になって陸にふる。川は土をけずって運び、海へもどる。', en: 'Sunlight turns sea water into vapour; it becomes clouds, then rain on the land. Rivers wear away and carry soil, and flow back to the sea.' } },
  mountain: { icon: '⛰️', topic: 'land', title: { ja: '山と風化', en: 'Mountains and weathering' },
    text: { ja: '新しい山の岩は雨でくずれやすい。そのとき二酸化炭素をとりこむので、星は少し冷える。', en: 'The rock of new mountains breaks down easily in the rain. It takes in carbon dioxide as it does, so the planet cools a little.' },
    more: { ja: 'プレートは1年に数cmずつ動き、ぶつかるところに山脈ができる。', en: 'Plates move a few centimetres a year, and mountain ranges rise where they collide.' } },
  cloud: { icon: '☁️', topic: 'weather', title: { ja: '白い雲', en: 'White clouds' },
    text: { ja: '白い雲は日光をはね返すので、星を冷やすはたらきがある。', en: 'White clouds reflect sunlight, so they help cool the planet.' } },
  idea: { icon: '💡', topic: 'nature', title: { ja: 'きれいなエネルギー', en: 'Clean energy' },
    text: { ja: '太陽の光や風で電気をつくると、二酸化炭素をほとんど出さない。', en: 'Making electricity from sunlight or wind gives out almost no carbon dioxide.' } },
  season: { icon: '🌗', topic: 'space', title: { ja: '季節', en: 'Seasons' },
    text: { ja: '地軸が約23.4度かたむいたまま太陽のまわりを回るので、太陽の高さが変わり、夏と冬ができる。', en: 'The axis is tilted about 23.4° as the planet goes round the Sun, so the Sun’s height changes, making summer and winter.' } },
};
// ---- the question bank (3 options, one right) ----
const Q = {
  ice: { q: { ja: '氷が広がると、星はどうなる？', en: 'When ice spreads, what happens to the planet?' }, a: [{ ja: '日光をはね返して、もっと冷える', en: 'It reflects sunlight and cools more' }, { ja: '日光をすいこんで暖まる', en: 'It absorbs sunlight and warms' }, { ja: 'なにも変わらない', en: 'Nothing changes' }], ok: 0 },
  co2: { q: { ja: '二酸化炭素がふえると、星はどうなる？', en: 'When carbon dioxide increases, what happens?' }, a: [{ ja: '寒くなる', en: 'It gets colder' }, { ja: '暖かくなる（温室効果）', en: 'It gets warmer (greenhouse effect)' }, { ja: '空がピンクになる', en: 'The sky turns pink' }], ok: 1 },
  volc: { q: { ja: '火山が空気に出すガスで、星を暖めるのは？', en: 'Which volcanic gas warms the planet?' }, a: [{ ja: '酸素', en: 'Oxygen' }, { ja: '二酸化炭素', en: 'Carbon dioxide' }, { ja: 'ヘリウム', en: 'Helium' }], ok: 1 },
  photo: { q: { ja: '空に酸素をふやしたのは？', en: 'What filled the sky with oxygen?' }, a: [{ ja: '光合成をする生き物', en: 'Living things that photosynthesise' }, { ja: '火山', en: 'Volcanoes' }, { ja: '隕石', en: 'Meteorites' }], ok: 0 },
  ozone: { q: { ja: 'オゾン層は何をさえぎる？', en: 'What does the ozone layer block?' }, a: [{ ja: '雨', en: 'Rain' }, { ja: '紫外線', en: 'Ultraviolet light' }, { ja: '風', en: 'Wind' }], ok: 1 },
  cycle: { q: { ja: '雨のもとになる雲は、何からできる？', en: 'What are rain clouds made from?' }, a: [{ ja: '海などから蒸発した水', en: 'Water evaporated from the sea and land' }, { ja: '火山のけむり', en: 'Volcanic smoke' }, { ja: '星のちり', en: 'Stardust' }], ok: 0 },
  river: { q: { ja: '流れる水の3つのはたらきは？', en: 'The three jobs of flowing water are…' }, a: [{ ja: 'しん食・運ぱん・たい積', en: 'Erosion, carrying and depositing' }, { ja: 'こおる・とける・にえる', en: 'Freezing, melting and boiling' }, { ja: '光る・鳴る・ゆれる', en: 'Shining, ringing and shaking' }], ok: 0 },
  plate: { q: { ja: 'プレートは1年にどのくらい動く？', en: 'How far do plates move in a year?' }, a: [{ ja: '数cm', en: 'A few centimetres' }, { ja: '数km', en: 'A few kilometres' }, { ja: 'まったく動かない', en: 'They never move' }], ok: 0 },
  tilt: { q: { ja: '季節があるのはなぜ？', en: 'Why are there seasons?' }, a: [{ ja: '地軸がかたむいているから', en: 'Because the axis is tilted' }, { ja: '太陽が近づいたり遠ざかったりするから', en: 'Because the Sun comes nearer and goes farther' }, { ja: '月が光るから', en: 'Because the Moon shines' }], ok: 0 },
  day: { q: { ja: '昼と夜があるのはなぜ？', en: 'Why are there day and night?' }, a: [{ ja: '地球が自転しているから', en: 'Because the Earth spins' }, { ja: '太陽が消えるから', en: 'Because the Sun goes out' }, { ja: '雲が太陽をかくすから', en: 'Because clouds hide the Sun' }], ok: 0 },
  age: { q: { ja: '地球が生まれたのは、いまから約何年前？', en: 'About how long ago was Earth born?' }, a: [{ ja: '約46億年前', en: 'About 4.6 billion years ago' }, { ja: '約4600年前', en: 'About 4,600 years ago' }, { ja: '約46万年前', en: 'About 460,000 years ago' }], ok: 0 },
  kpg: { q: { ja: '約6600万年前、恐竜が絶滅した大きな原因と考えられているのは？', en: 'What is thought to have mainly ended the dinosaurs 66 million years ago?' }, a: [{ ja: '大きな隕石の衝突', en: 'A huge impact from space' }, { ja: '人間の狩り', en: 'Human hunters' }, { ja: '月の接近', en: 'The Moon coming close' }], ok: 0 },
  temp: { q: { ja: 'いまの地球の平均気温は、だいたい何°C？', en: 'About what is Earth’s average temperature today?' }, a: [{ ja: '約15°C', en: 'About 15 °C' }, { ja: '約50°C', en: 'About 50 °C' }, { ja: '約−40°C', en: 'About −40 °C' }], ok: 0 },
  weath: { q: { ja: '岩が雨でくずれるとき（風化）、空気の何がへる？', en: 'When rock is worn down by rain (weathering), what does the air lose?' }, a: [{ ja: '二酸化炭素', en: 'Carbon dioxide' }, { ja: '酸素', en: 'Oxygen' }, { ja: 'ちっ素', en: 'Nitrogen' }], ok: 0 },
  forest: { q: { ja: '森が広がると、空気の二酸化炭素は？', en: 'When forests spread, the carbon dioxide in the air…' }, a: [{ ja: 'へる', en: 'goes down' }, { ja: 'ふえる', en: 'goes up' }, { ja: '変わらない', en: 'stays the same' }], ok: 0 },
  current: { q: { ja: '海流は何を運ぶ？', en: 'What do ocean currents carry?' }, a: [{ ja: '熱（暖かさ）', en: 'Heat' }, { ja: '光', en: 'Light' }, { ja: '音だけ', en: 'Only sound' }], ok: 0 },
  sun: { q: { ja: '太陽は、長い時間のあいだにどうなる？', en: 'Over a very long time, the Sun…' }, a: [{ ja: '少しずつ明るくなる', en: 'slowly gets brighter' }, { ja: 'だんだん暗くなる', en: 'slowly gets dimmer' }, { ja: 'ずっと同じ', en: 'always stays the same' }], ok: 0 },
  clean: { q: { ja: '二酸化炭素をほとんど出さない発電は？', en: 'Which power gives out almost no carbon dioxide?' }, a: [{ ja: '太陽光や風力', en: 'Solar and wind' }, { ja: '石炭', en: 'Coal' }, { ja: '石油', en: 'Oil' }], ok: 0 },
  cloud: { q: { ja: '白い雲は、星を…', en: 'White clouds…' }, a: [{ ja: '日光をはね返して冷やす', en: 'reflect sunlight and cool the planet' }, { ja: '燃やして暖める', en: 'burn and heat it' }, { ja: '重くする', en: 'make it heavier' }], ok: 0 },
  magma: { q: { ja: '生まれたばかりの地球の表面は？', en: 'The surface of the newborn Earth was…' }, a: [{ ja: 'とけた岩（マグマの海）', en: 'molten rock (a magma ocean)' }, { ja: '森', en: 'forest' }, { ja: '氷だけ', en: 'only ice' }], ok: 0 },
  moon: { q: { ja: '月は自分で光っている？', en: 'Does the Moon make its own light?' }, a: [{ ja: 'いいえ、太陽の光を反射している', en: 'No, it reflects sunlight' }, { ja: 'はい、燃えている', en: 'Yes, it burns' }, { ja: 'はい、電気で', en: 'Yes, electrically' }], ok: 0 },
  fossil: { q: { ja: '化石からわかることは？', en: 'What can fossils tell us?' }, a: [{ ja: '大昔の生き物のすがた', en: 'What living things looked like long ago' }, { ja: 'あしたの天気', en: 'Tomorrow’s weather' }, { ja: '月までのきょり', en: 'The distance to the Moon' }], ok: 0 },
};
// after each scenario: three questions about what it showed
const SC_QUIZ = { cradle: ['volc', 'cycle', 'ice'], snow: ['ice', 'volc', 'co2'], green: ['cycle', 'river', 'forest'], gate: ['current', 'ice', 'plate'], goe: ['photo', 'ozone', 'weath'], sun: ['sun', 'cloud', 'weath'], warm: ['co2', 'clean', 'forest'], dawn: ['fossil', 'clean', 'temp'] };
// ---- まなぶモードの章 ----
// try.k is checked by the page against the model: what the learner must do on the globe
const CHAPTERS = [
  { id: 'birth', icon: '🌋', topic: 'land', world: 'newborn', title: { ja: '地球のなりたち', en: 'How Earth began' },
    explain: { ja: '46億年前、ちりと岩が集まって地球ができた。表面はとけた岩（マグマの海）。時間を進めて、冷えていくようすを見よう。', en: '4.6 billion years ago, dust and rock came together to make Earth. Its surface was molten rock (a magma ocean). Run time and watch it cool.' },
    task: { ja: '▶で時間を進めて、海ができるのを見とどけよう', en: 'Press ▶ and watch until an ocean forms' }, try: { k: 'ms', m: 'ocean' },
    result: { ja: '冷えると、空の水じょう気が雨になって海ができた。', en: 'As it cooled, water vapour fell as rain and made the ocean.' }, quiz: ['magma', 'age', 'cycle'] },
  { id: 'water', icon: '🌧️', topic: 'water', world: 'desert', title: { ja: '水のじゅんかん', en: 'The water cycle' },
    explain: { ja: '海の水は蒸発して雲になり、雨になって陸にふる。雨は川になって土を運び、海へもどる。', en: 'Sea water evaporates and becomes clouds, then rain on the land. The rain becomes rivers that carry soil back to the sea.' },
    task: { ja: '道具「雨」で、かわいた土地に雨をふらせよう（3回）', en: 'Use the Rain tool on dry land (3 times)' }, try: { k: 'tool', tool: 'rain', n: 3 },
    result: { ja: '雨がふると、かわいた土地にも植物が育つ。', en: 'With rain, plants can grow even on dry land.' }, quiz: ['cycle', 'river', 'cloud'] },
  { id: 'green', icon: '🌡️', topic: 'weather', world: 'earth', title: { ja: '温室効果', en: 'The greenhouse effect' },
    explain: { ja: '二酸化炭素などのガスは、地面から宇宙へにげる熱をとじこめる。これが温室効果。ないと地球は約−18°Cになる。', en: 'Gases such as carbon dioxide trap heat that would escape from the ground to space. This is the greenhouse effect. Without it Earth would be about −18 °C.' },
    task: { ja: '火山を3回ふん火させて、気温が上がるのをたしかめよう', en: 'Make 3 volcanoes erupt and see the temperature rise' }, try: { k: 'warm', dT: 1.5, tool: 'volcano' },
    result: { ja: '二酸化炭素がふえて暖かくなった。でも何万年もたつと、岩の風化がまた二酸化炭素をへらす。', en: 'More carbon dioxide made it warmer. Over tens of thousands of years, the weathering of rock takes it back out.' }, quiz: ['co2', 'volc', 'temp'] },
  { id: 'season', icon: '🌗', topic: 'space', world: 'earth', title: { ja: '季節と地軸', en: 'Seasons and the axis' },
    explain: { ja: '地球は1日に1回まわる（自転）ので昼と夜がある。地軸が約23.4度かたむいたまま1年で太陽のまわりを回る（公転）ので、季節がある。', en: 'Earth spins once a day, so there is day and night. Its axis stays tilted about 23.4° as it goes round the Sun once a year, so there are seasons.' },
    task: { ja: '「夏（北）」と「冬（北）」をおして、北極の氷と太陽の当たり方をくらべよう', en: 'Press “Northern summer” and “Northern winter” and compare the Arctic ice and sunlight' }, try: { k: 'season' },
    result: { ja: '北が太陽の方へかたむくと北半球は夏。氷は小さくなり、昼が長くなる。', en: 'When the north leans toward the Sun it is summer in the north: less ice and longer days.' }, quiz: ['tilt', 'day', 'moon'] },
  { id: 'land', icon: '⛰️', topic: 'land', world: 'earth', title: { ja: '大地のつくりと火山', en: 'The land and volcanoes' },
    explain: { ja: '地球の表面はいくつものプレートでできていて、ゆっくり動く。ぶつかると山ができ、火山がふん火する。', en: 'Earth’s surface is made of plates that move slowly. Where they collide, mountains rise and volcanoes erupt.' },
    task: { ja: '道具「山」で地球儀を長おしして、山脈をつくろう', en: 'Hold the Mountain tool on the globe to raise a mountain range' }, try: { k: 'tool', tool: 'raise', n: 6 },
    result: { ja: '新しい山の岩は雨でくずれ、川が土を運んで海の底にためる。それがやがて地層になる。', en: 'Rain wears down the rock of new mountains, and rivers carry the soil to the sea floor, where it becomes layers of rock.' }, quiz: ['plate', 'weath', 'river'] },
  { id: 'life', icon: '🫧', topic: 'life', world: 'goe', title: { ja: '生命と酸素', en: 'Life and oxygen' },
    explain: { ja: '光合成をする小さな生き物が、日光で酸素をつくった。新しい山から栄養が海へ流れると、生き物がふえる。', en: 'Tiny living things made oxygen from sunlight. When nutrients wash into the sea from new mountains, they multiply.' },
    task: { ja: '海岸に山をつくって、空に酸素がたまるのを見よう', en: 'Raise mountains on the coasts and watch oxygen build up' }, try: { k: 'o2', v: 0.004 },
    result: { ja: '酸素がふえると、やがてオゾン層ができ、生き物が陸へ上がれるようになる。', en: 'As oxygen grows, an ozone layer forms, and life can move onto land.' }, quiz: ['photo', 'ozone', 'forest'] },
  { id: 'history', icon: '📜', topic: 'life', world: 'history', title: { ja: '地球の歴史46億年（ほんものの地球）', en: 'Earth’s 4.6-billion-year story (the real Earth)' },
    explain: { ja: 'ほんものの地球の歴史を、地球儀で早まわしで見よう。「つぎへ」で時代を進める。', en: 'Watch the real Earth’s history on the globe, fast. Press Next to move on through the ages.' },
    task: { ja: '最後（いま）まで進もう', en: 'Go all the way to today' }, try: { k: 'history' },
    result: { ja: '46億年のうち、人類がいるのはほんの最後の一瞬。', en: 'Of 4.6 billion years, humans have been here for only the very last moment.' }, quiz: ['age', 'kpg', 'fossil'] },
];
// ---- the real Earth, stop by stop (dates are approximate; scientists still study them) ----
// set: what the globe should look like (life stage, oxygen in PAL, CO2 ppm, ice, molten/ocean)
const HISTORY = [
  { y: 4.6e9, icon: '🔥', t: { ja: '46億年前：地球が生まれる', en: '4.6 billion years ago: Earth is born' }, x: { ja: '表面はマグマの海。月もこのころできたと考えられている。', en: 'The surface is a magma ocean. The Moon probably formed around this time too.' }, set: { t: 1e7 } },
  { y: 4.4e9, icon: '🌧️', t: { ja: '約44億〜40億年前：海ができる', en: 'About 4.4–4.0 billion years ago: oceans form' }, x: { ja: '冷えて雨がふりつづき、海ができた。', en: 'It cooled, rain kept falling, and the oceans formed.' }, set: { t: 2e8, co2: 3e4 } },
  { y: 3.8e9, icon: '🦠', t: { ja: '約38億年前：生命が生まれる', en: 'About 3.8 billion years ago: life begins' }, x: { ja: '海の中に小さな細胞があらわれた。', en: 'Tiny cells appeared in the sea.' }, set: { t: 8e8, st: 1, co2: 2e4 } },
  { y: 2.4e9, icon: '🫧', t: { ja: '約24億年前：大酸化イベント', en: 'About 2.4 billion years ago: the Great Oxidation Event' }, x: { ja: '光合成をする細菌の酸素が、空にたまりはじめた。', en: 'Oxygen from photosynthesising bacteria began to build up in the air.' }, set: { t: 2.2e9, st: 2, o2: 0.01, co2: 3000 } },
  { y: 7.0e8, icon: '🧊', t: { ja: '約7億年前：全球凍結', en: 'About 700 million years ago: Snowball Earth' }, x: { ja: '地球がほぼ全部こおったと考えられている。火山の二酸化炭素で、やがてとけた。', en: 'Earth probably froze almost all over. Volcanic carbon dioxide thawed it in the end.' }, set: { t: 3.9e9, st: 3, o2: 0.1, snow: 1 } },
  { y: 5.39e8, icon: '🐚', t: { ja: '約5億4000万年前：カンブリア爆発', en: 'About 539 million years ago: the Cambrian explosion' }, x: { ja: '海の中に、いろいろな形の動物がいっきにふえた。', en: 'Animals of many shapes suddenly spread through the sea.' }, set: { t: 4.03e9, st: 4, o2: 0.5, co2: 3000 } },
  { y: 4.7e8, icon: '🌿', t: { ja: '約4億7000万年前：植物が陸へ', en: 'About 470 million years ago: plants move onto land' }, x: { ja: 'オゾン層が紫外線を弱め、陸が緑になりはじめた。', en: 'The ozone layer weakened the ultraviolet light, and the land began to turn green.' }, set: { t: 4.1e9, st: 5, o2: 0.8, co2: 2000 } },
  { y: 2.3e8, icon: '🦕', t: { ja: '約2億3000万年前：恐竜の時代', en: 'About 230 million years ago: the age of dinosaurs' }, x: { ja: '暖かい地球で、恐竜が大きくなった。大陸はひとつにまとまっていた（パンゲア）。', en: 'Dinosaurs grew large on a warm Earth. The continents were joined together (Pangaea).' }, set: { t: 4.34e9, st: 6, o2: 1, co2: 1200 } },
  { y: 6.6e7, icon: '☄️', t: { ja: '約6600万年前：巨大隕石', en: 'About 66 million years ago: a giant impact' }, x: { ja: 'ちりで空が暗くなり、恐竜（鳥をのぞく）は絶滅した。生きのこったほ乳類がふえていく。', en: 'Dust darkened the sky, and the dinosaurs (apart from birds) died out. The mammals that survived spread.' }, set: { t: 4.5e9, st: 6, o2: 1, co2: 600, impact: 1 } },
  { y: 3e5, icon: '🧑', t: { ja: '約30万年前：ホモ・サピエンス', en: 'About 300,000 years ago: Homo sapiens' }, x: { ja: 'わたしたち人類があらわれた。46億年を1年にすると、12月31日の夜おそく。', en: 'We humans appeared. If 4.6 billion years were one year, that is late in the evening of 31 December.' }, set: { t: 4.5697e9, st: 6, o2: 1, co2: 280 } },
  { y: 0, icon: '🌍', t: { ja: 'いま', en: 'Today' }, x: { ja: '平均気温は約15°C、二酸化炭素は約420ppm。燃料を燃やして、ふえつづけている。', en: 'The average temperature is about 15 °C and carbon dioxide is about 420 ppm, still rising as fuel is burnt.' }, set: { t: 4.57e9, st: 7, o2: 1, co2: 420, civ: 1 } },
];
function pick(o, lang) { return o ? (lang === 'en' ? o.en : o.ja) : ''; }
return { TOPIC, WHY, Q, SC_QUIZ, CHAPTERS, HISTORY, pick };
})();
if (typeof window !== 'undefined') window.PLearn = PLearn;
if (typeof module !== 'undefined' && module.exports) module.exports = PLearn;
