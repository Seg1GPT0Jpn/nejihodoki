// ワードウルフのことば：ジャンル（cats）と、ジャンルぜんたいに当てはまる「ざっくりヒント」（gen）。
// gen は、そのジャンルのどのことばにも当てはまる、あたりさわりのないヒント（CPU も、オンラインのヒントカードも使う）。
// 形：  key|日本語|English   （1行1つ。key は gen.<グループ>.<番号>）
'use strict';
module.exports = {
  cats: [
    // [id, ja, en, gen group]
    ['food', '食べ物・料理', 'Food & dishes', 'food'],
    ['sweets', 'おやつ・飲み物', 'Snacks & drinks', 'food'],
    ['animals', '動物', 'Animals', 'animal'],
    ['birds', '鳥・魚・虫', 'Birds, fish & bugs', 'animal'],
    ['places', '場所・お店', 'Places & shops', 'place'],
    ['school', '学校生活', 'School life', 'school'],
    ['jobs', '仕事・職業', 'Jobs', 'job'],
    ['hobby', '趣味・遊び', 'Hobbies & play', 'play'],
    ['sports', 'スポーツ', 'Sports', 'play'],
    ['tech', '家電・IT・機械', 'Tech & gadgets', 'thing'],
    ['culture', '日本の文化・行事', 'Japanese culture', 'culture'],
    ['vehicles', '乗り物', 'Vehicles', 'vehicle'],
    ['clothes', '服・持ち物', 'Clothes & items', 'thing'],
    ['nature', '自然・天気・季節', 'Nature, weather & seasons', 'nature'],
    ['home', '家・日用品', 'Home & daily goods', 'thing'],
    ['music', '音楽・映画・エンタメ', 'Music, movies & fun', 'ent'],
    ['kitchen', '調理道具・食器', 'Kitchen & tableware', 'thing'],
    ['stationery', '文房具・本', 'Stationery & books', 'thing'],
    ['plants', 'くだもの・やさい', 'Fruit & vegetables', 'food'],
  ],
  gen: `
gen.food.1|口に入れるものです。|You put it in your mouth.
gen.food.2|お店で買うことができます。|You can buy it at shops.
gen.food.3|家でも口にします。|People have it at home too.
gen.food.4|好ききらいが分かれることもあります。|Tastes differ: some like it, some do not.
gen.food.5|食べたり飲んだりすると、ほっとします。|It can make you feel relieved.
gen.food.6|毎日のくらしの中にあります。|It is part of everyday life.
gen.food.7|みんなで分けて楽しめます。|You can share it with others.
gen.food.8|子どもから大人まで知っています。|Kids and adults both know it.
gen.food.9|日本でも手に入ります。|You can get it in Japan.
gen.food.10|味やにおいを楽しめます。|You can enjoy its taste and smell.
gen.food.11|おいしくするための工夫があります。|People find ways to make it tastier.
gen.food.12|作り方や育て方があります。|There is a way to make or grow it.
gen.food.13|食べすぎ・飲みすぎには気をつけます。|You should not overdo it.
gen.animal.1|生きものです。|It is a living creature.
gen.animal.2|ごはんを食べて生きています。|It eats to live.
gen.animal.3|子どもを産んで、数をふやします。|It has young.
gen.animal.4|図鑑にのっています。|It appears in picture books.
gen.animal.5|動きまわることができます。|It can move around.
gen.animal.6|絵本やアニメに出てくることがあります。|It shows up in picture books and cartoons.
gen.animal.7|見ると、思わず目で追ってしまいます。|You tend to watch it when you see it.
gen.animal.8|自然の中でくらす仲間がいます。|Some of them live in the wild.
gen.animal.9|鳴き声や音を出すことがあります。|It sometimes makes sounds.
gen.animal.10|寝たり休んだりします。|It sleeps and rests.
gen.animal.11|大切にしたい生きものです。|It is a creature to care for.
gen.animal.12|動物園や水族館などで見られることがあります。|You may see it at a zoo or aquarium.
gen.thing.1|手に取ったり、さわったりできます。|You can touch and hold it.
gen.thing.2|お店で買うことができます。|You can buy it at shops.
gen.thing.3|使い方を知っていれば、むずかしくありません。|It is easy once you know how to use it.
gen.thing.4|使う人の好みで選びます。|People choose it to suit their taste.
gen.thing.5|長く使うと、古くなります。|It gets old with long use.
gen.thing.6|人からのプレゼントになることがあります。|It can be given as a present.
gen.thing.7|大きさや色がいろいろあります。|It comes in many sizes and colors.
gen.thing.8|ふだんの生活で役に立ちます。|It is useful in daily life.
gen.thing.9|こわれたら、直したり買いかえたりします。|When it breaks you fix or replace it.
gen.thing.10|しまっておく場所が必要です。|You need a place to keep it.
gen.thing.11|名前を聞けば、たいていの人が知っています。|Most people know its name.
gen.thing.12|だれかが作ったものです。|Someone made it.
gen.thing.13|大切に使いたいものです。|You want to take good care of it.
gen.school.1|学校で見かけます。|You see it at school.
gen.school.2|子どものころによく聞きます。|You hear about it a lot as a kid.
gen.school.3|友だちと話題にすることがあります。|Friends talk about it.
gen.school.4|先生に関係があります。|Teachers are involved with it.
gen.school.5|毎年、くり返しやってきます。|It comes around again and again.
gen.school.6|思い出に残ることがあります。|It can become a memory.
gen.school.7|クラスのみんなに関係があります。|It involves the whole class.
gen.school.8|学年が上がっても、ずっと関わります。|You keep running into it as you go up.
gen.school.9|ちゃんとやると、ほめられます。|You get praised for doing it well.
gen.school.10|すこし緊張することもあります。|It can make you a little nervous.
gen.school.11|家に持ち帰ることがあります。|Sometimes you take it home.
gen.school.12|楽しい日も、つらい日もあります。|Some days are fun, some are hard.
gen.place.1|行ったことがある人が多い場所です。|Many people have been there.
gen.place.2|人が集まります。|People gather there.
gen.place.3|建物や場所の名前で呼ばれます。|It has its own name as a place.
gen.place.4|まちの中で見かけます。|You see it around town.
gen.place.5|入るときに、あいさつや気づかいが要ります。|Manners matter when you go in.
gen.place.6|営業の時間や開いている時間があります。|It has opening hours.
gen.place.7|行く目的がはっきりしています。|You go there for a clear reason.
gen.place.8|はたらいている人がいます。|People work there.
gen.place.9|休みの日に行く人もいます。|Some people go on days off.
gen.place.10|家族や友だちと行くこともあります。|You may go with family or friends.
gen.place.11|地図で調べて行くことがあります。|You may look it up on a map.
gen.place.12|ルールやマナーがあります。|It has rules and manners.
gen.job.1|仕事の名前です。|It is the name of a job.
gen.job.2|だれかの役に立つ仕事です。|It helps somebody.
gen.job.3|なるには、勉強や練習が必要です。|You need study or practice to do it.
gen.job.4|その道具や服があります。|It has its own tools or clothes.
gen.job.5|服そうや持ち物に決まりがあることがあります。|It can come with a dress code or gear.
gen.job.6|人と話す場面があります。|You talk with people.
gen.job.7|責任のある仕事です。|It carries responsibility.
gen.job.8|子どもの「なりたいもの」に出てきます。|It shows up in what kids want to be.
gen.job.9|仲間といっしょに働くことがあります。|You may work with a team.
gen.job.10|朝から夜まで、いろいろな時間帯で働く人がいます。|People work at many hours of the day.
gen.job.11|ありがとうと言われることがあります。|People sometimes thank them.
gen.job.12|うまくなるまで時間がかかります。|It takes time to get good.
gen.play.1|楽しみのためにやります。|You do it for fun.
gen.play.2|練習すると、うまくなります。|You get better with practice.
gen.play.3|ひとりでも、みんなとでもできることがあります。|You can do it alone or with others.
gen.play.4|道具や場所が必要です。|You need tools or a place.
gen.play.5|はじめはむずかしくても、だんだん慣れます。|Hard at first, easier with time.
gen.play.6|夢中になる人がいます。|Some people get hooked.
gen.play.7|ルールやコツがあります。|There are rules or tricks.
gen.play.8|子どもから大人までやる人がいます。|From kids to adults, people do it.
gen.play.9|気分転換になります。|It refreshes you.
gen.play.10|友だちと話題になります。|It is something friends talk about.
gen.play.11|体や頭を使います。|It uses your body or brain.
gen.play.12|上手な人を見ると、あこがれます。|Seeing an expert makes you admire them.
gen.ent.1|楽しむためのものです。|It is for enjoyment.
gen.ent.2|見たり聞いたりして味わいます。|You watch or listen to enjoy it.
gen.ent.3|好みが人によって分かれます。|People like different kinds.
gen.ent.4|だれかが作って届けています。|Someone makes it and delivers it.
gen.ent.5|感想を人に話したくなります。|You want to tell others what you thought.
gen.ent.6|気持ちが動きます。|It moves your feelings.
gen.ent.7|おすすめを教え合うことがあります。|People recommend it to each other.
gen.ent.8|時間を忘れて楽しむことがあります。|You can lose track of time.
gen.ent.9|家でも、出かけた先でも楽しめます。|You can enjoy it at home or out.
gen.ent.10|歴史があります。|It has a history.
gen.ent.11|知っている人どうしで盛り上がります。|Fans get excited together.
gen.ent.12|思い出の場面があります。|People have favorite moments.
gen.vehicle.1|人や物を運びます。|It carries people or things.
gen.vehicle.2|動かすには、ルールを守ります。|You follow rules to use it.
gen.vehicle.3|乗ったことがある人がいます。|Many people have ridden one.
gen.vehicle.4|動かす人や、乗る人がいます。|Someone runs it, someone rides it.
gen.vehicle.5|行き先に合わせて選びます。|You choose by where you are going.
gen.vehicle.6|点検や手入れが必要です。|It needs checking and care.
gen.vehicle.7|はやく動けます。|It moves fairly fast.
gen.vehicle.8|乗るときに安全に気をつけます。|You take care to ride safely.
gen.vehicle.9|のりものの絵本や図鑑によく出てきます。|It shows up in books about vehicles.
gen.vehicle.10|種類や大きさがいろいろあります。|There are many kinds and sizes.
gen.vehicle.11|旅行やお出かけで使うことがあります。|You may use it for trips.
gen.vehicle.12|動力があって進みます。|It has some kind of power to go.
gen.nature.1|自然の中で起きたり、感じたりします。|You see or feel it in nature.
gen.nature.2|日本でも経験できます。|You can experience it in Japan.
gen.nature.3|天気や気温と関わりがあります。|It relates to weather or temperature.
gen.nature.4|空や地面や水など、まわりの様子が変わります。|The surroundings change.
gen.nature.5|人の暮らしに関わります。|It affects people's lives.
gen.nature.6|ニュースや天気予報で話題になります。|It comes up in news or forecasts.
gen.nature.7|季節の話題でよく出てきます。|It comes up in talk about seasons.
gen.nature.8|外に出ると気づきます。|You notice it when you go outside.
gen.nature.9|写真や絵にのこす人もいます。|Some people take photos or paint it.
gen.nature.10|見る季節や時間で、ようすが変わります。|It looks different by season or time.
gen.nature.11|ふだんは気にしなくても、ときどき気になります。|You sometimes become aware of it.
gen.nature.12|昔から人が見てきたものです。|People have watched it for ages.
gen.culture.1|日本の暮らしの中にあります。|It is part of life in Japan.
gen.culture.2|昔から続いています。|It has gone on since long ago.
gen.culture.3|家族や地域の人といっしょに楽しみます。|Families and neighbors enjoy it together.
gen.culture.4|決まった時期にあります。|It happens at a set time of year.
gen.culture.5|ならわしや決まりごとがあります。|It has customs.
gen.culture.6|食べ物や飾りが関わることがあります。|Food or decorations may be involved.
gen.culture.7|子どもも大人も知っています。|Kids and adults know it.
gen.culture.8|地域によってやり方がちがいます。|Ways differ by region.
gen.culture.9|写真に残す人が多いです。|Many take photos.
gen.culture.10|祝ったり、感謝したりする気持ちがあります。|It carries feelings of celebration or thanks.
gen.culture.11|外国の人に紹介することがあります。|People introduce it to visitors from abroad.
gen.culture.12|思い出になります。|It becomes a memory.
`,
  // 話し合いのきっかけカード（1台をまわすときの「話題カード」）：日本語|English
  prompts: `
どんな色や形を思いうかべる？|What colors or shapes come to mind?
いつ、どんなときに出会うことが多い？|When do you usually run into it?
どこで見かける？ どこにある？|Where do you see it?
好き？ きらい？ その理由は？|Do you like it? Why or why not?
大きさや重さは、どのくらい？|How big or heavy is it?
子どものころの思い出はある？|Any childhood memories of it?
だれと いっしょにいることが多い？|Who are you usually with?
さわった感じ・においは？|How does it feel or smell?
音や声は出る？ どんな音？|Does it make a sound?
季節でいうと、いつごろ？|Which season does it feel like?
1日のうちの、どの時間帯？|What time of day?
これがないと、こまる？|Would you miss it if it were gone?
値段は高い？ 安い？|Is it expensive or cheap?
流行ったことはある？|Was it ever a fad?
人にすすめたくなる？|Would you recommend it?
いちばん最近、見たり使ったのはいつ？|When did you last meet it?
体にいいと思う？|Is it good for you?
日本以外でも見られる？|Is it found outside Japan?
動かすもの？ じっとしているもの？|Does it move?
なくなったら、どう変わる？|What changes without it?
ひとことで言うと、どんなイメージ？|Say your image of it in a phrase.
友だちにプレゼントするなら？|Would you give it as a gift?
上手・下手が出るもの？|Is there good and bad at it?
お金はかかる？|Does it cost money?
`,
};
