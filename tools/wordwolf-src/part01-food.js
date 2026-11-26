// 0 食べ物・料理 / 1 おやつ・飲み物
// ペアの形：  日本語A|English A|key key key || 日本語B|English B|key key key
'use strict';
module.exports = {
  vocab: `
hotdish|あたたかい料理です。|It is a warm dish.
coldeat|つめたくして食べることがあります。|It is often eaten cold.
soup|汁がたっぷりあります。|It comes with plenty of broth.
noodle|細長い形をしています。|It is long and thin.
thicknoodle|太めで、つるっとしています。|It is thick and slippery.
thinnoodle|細くて、つるつる食べられます。|It is thin and easy to slurp.
chinese|中華の味つけが合います。|It suits Chinese-style flavors.
japanese|日本ではおなじみの味です。|It is a familiar Japanese taste.
western|洋風のイメージがあります。|It has a Western feel.
chopsticks|はしで食べることが多いです。|You usually eat it with chopsticks.
spoon|スプーンで食べることが多いです。|You usually eat it with a spoon.
fork|フォークで食べることが多いです。|You usually eat it with a fork.
hand|手でつかんで食べることができます。|You can eat it with your hands.
slurp|すすって食べます。|You slurp it.
mild|やさしい味わいです。|It has a gentle taste.
spicy|ぴりっとした味つけのことがあります。|It can be spicy.
sweet|あまい味がします。|It tastes sweet.
salty|塩気のある味がします。|It tastes salty.
sour|すっぱさがあります。|It has a sour kick.
bitter|ほろ苦さがあります。|It has a slightly bitter taste.
rice|ごはんといっしょに食べることがあります。|You can eat it with rice.
riceitself|お米が材料です。|Rice is the main ingredient.
bread|パンを使います。|It uses bread.
flour|小麦粉などの粉を使います。|It uses flour.
egg|卵を使います。|It uses eggs.
milk|牛乳をよく使います。|It often uses milk.
cheese|チーズを使うことがあります。|It may use cheese.
meat|お肉が材料になります。|Meat is an ingredient.
beef|牛肉を使うことがあります。|It may use beef.
chicken|とり肉を使うことがあります。|It may use chicken.
seafood|さかなやえびなど、海の食材を使います。|It uses fish or seafood.
rawfish|生の魚介を使います。|It uses raw seafood.
veggie|野菜がたっぷり入ります。|It has plenty of vegetables.
potato|じゃがいもを使います。|It uses potatoes.
beans|豆が材料です。|Beans are the base.
fermented|発酵させたものです。|It is a fermented food.
sticky|ねばねば、もちもちしています。|It is sticky and chewy.
crunchy|サクサク、カリカリした歯ごたえです。|It has a crispy crunch.
soft|やわらかい食感です。|It has a soft texture.
juicy|じゅわっと水分が出ます。|It is juicy.
fried|油であげて作ります。|It is made by deep-frying.
panfried|フライパンや鉄板で焼いて作ります。|It is cooked on a pan or griddle.
baked|オーブンなどで焼いて作ります。|It is baked in an oven.
steamed|蒸して作ります。|It is made by steaming.
boiled|煮たりゆでたりして作ります。|It is made by simmering or boiling.
raw|火を通さずに食べることがあります。|It can be eaten without cooking.
round|丸い形が多いです。|It is often round.
small|ひと口サイズのものもあります。|It can come in bite-sized pieces.
sauce|ソースやタレをかけて食べます。|You eat it with sauce.
soysauce|しょうゆをつけて食べることがあります。|You may dip it in soy sauce.
ketchup|ケチャップが合います。|It goes well with ketchup.
dip|つけだれにつけて食べます。|You dip it in a sauce.
yellow|黄色っぽい色をしています。|It is yellowish.
white|白っぽい色をしています。|It is whitish.
brown|茶色っぽい色をしています。|It is brownish.
breakfast|朝ごはんにも出てきます。|It shows up at breakfast too.
lunchbox|お弁当に入っていることがあります。|It can be in a lunchbox.
festival|お祭りの屋台で見かけます。|You see it at festival stalls.
winter|寒い季節にうれしい味です。|It is welcome in cold weather.
summer|暑い季節によく食べます。|People eat it a lot in summer.
newyear|年末年始に食べることがあります。|It is eaten around New Year.
share|みんなで分けて食べることがあります。|It is often shared.
pot|大きな鍋で作ります。|It is made in a big pot.
bowl|どんぶりに入っています。|It is served in a big bowl.
bigbatch|たくさん作って食べることがあります。|It can be cooked in big batches.
home|家庭の食卓によく出ます。|It is common on the home table.
sidedish|おかずのひとつです。|It is a side dish.
healthy|体によいといわれます。|It is said to be healthy.
sliced|切り分けて食べます。|You cut it into pieces.
stick|串や棒にさしたものがあります。|Some are served on a skewer.
layered|重なった層になっています。|It has layers.
fresh|新鮮さが大事です。|Freshness matters.
dessert|デザートに向いています。|It works as a dessert.
snack|おやつに向いています。|It works as a snack.
cold|冷たくして楽しみます。|You enjoy it cold.
hotdrink|あたたかくして飲むことが多いです。|It is often drunk hot.
colddrink|冷たくして飲むことが多いです。|It is often drunk cold.
drink|飲み物です。|It is a drink.
fizzy|しゅわしゅわしています。|It is fizzy.
fruity|くだものの味や香りがします。|It tastes or smells fruity.
fruitused|くだものを使います。|It uses fruit.
leaf|葉っぱから作ります。|It is made from leaves.
cup|カップやコップで飲みます。|You drink it from a cup.
bottle|ペットボトルや缶で売られています。|It is sold in bottles or cans.
cream|クリームをのせたり、はさんだりします。|It comes with cream.
chocolate|チョコレートを使うことがあります。|It may use chocolate.
beanpaste|あんこが入ります。|It is filled with sweet bean paste.
caramelc|ねっとりと歯にくっつきます。|It sticks to your teeth.
chewy|もちもち、むにむにした食感です。|It has a chewy bounce.
wobbly|ぷるんとゆれます。|It wobbles.
melt|口の中でとけます。|It melts in your mouth.
candy|なめたり、かんだりするおやつです。|It is a candy-type treat.
colorful|カラフルな色のものがあります。|It comes in bright colors.
thin|うすい形をしています。|It is thin and flat.
hole|真ん中に穴があるものがあります。|Some have a hole in the middle.
birthday|お祝いの日に出てきます。|It shows up at celebrations.
movie|映画を見ながらつまむことがあります。|People nibble it at the movies.
sport|運動のときにも飲まれます。|People drink it during exercise.
caffeine|眠気をさます人もいます。|Some drink it to wake up.
cow|牛からとれるものです。|It comes from cows.
soyalike|豆から作った飲み物です。|It is made from beans.
barley|麦から作ります。|It is made from barley.
rolled|くるくる巻いたものがあります。|It can be rolled up.
grid|あみ目の模様があります。|It has a grid pattern.
shape_fish|魚の形をしています。|It is shaped like a fish.
blockshape|四角い形をしています。|It is block-shaped.
seaweed|のりを使うことがあります。|It may be wrapped in seaweed.
triangle|三角の形をしています。|It is often triangular.
pickled|塩や酢につけて作ります。|It is made by pickling.
vinegar|お酢を使うことがあります。|It may use vinegar.
dumpling|皮で具をつつんだ形です。|It wraps filling in dough.
omega|定番の家庭料理です。|It is a classic home dish.
`,
  pairs: {
    0: `
ラーメン|ramen|hotdish soup noodle chinese chopsticks slurp || うどん|udon|hotdish soup thicknoodle japanese chopsticks slurp mild
カレー|curry|hotdish spicy rice spoon boiled bigbatch home || シチュー|stew|hotdish milk spoon boiled bigbatch home winter
寿司|sushi|rice riceitself rawfish seafood japanese hand vinegar || 刺身|sashimi|rawfish seafood japanese chopsticks soysauce cold fresh
天ぷら|tempura|fried japanese seafood veggie crunchy chopsticks dip || とんかつ|pork cutlet|fried meat crunchy hotdish sauce western
唐揚げ|fried chicken|fried chicken crunchy hotdish lunchbox juicy || フライドポテト|french fries|fried potato crunchy hotdish salty ketchup
ハンバーグ|hamburger steak|meat hotdish western round sauce home juicy || ミートボール|meatballs|meat hotdish western round small sauce lunchbox
オムライス|omelet rice|egg rice riceitself western ketchup spoon yellow hotdish || チャーハン|fried rice|rice riceitself chinese spoon hotdish panfried egg
ピザ|pizza|baked cheese round sliced western hotdish share flour || お好み焼き|okonomiyaki|panfried round sliced japanese flour sauce veggie share hotdish
餃子|gyoza|chinese meat veggie small panfried dumpling dip chopsticks || シュウマイ|shumai|chinese meat small steamed dumpling chopsticks dip
焼きそば|yakisoba|noodle panfried hotdish sauce veggie chopsticks festival || パスタ|pasta|noodle boiled hotdish sauce fork western flour
みそ汁|miso soup|soup hotdish japanese beans salty breakfast fermented || ポタージュ|potage soup|soup hotdish western milk spoon mild veggie
納豆|natto|beans fermented sticky japanese breakfast rice chopsticks || 豆腐|tofu|beans japanese soft white chopsticks mild healthy sidedish
卵焼き|rolled omelet|egg japanese yellow lunchbox panfried rolled sweet || 目玉焼き|fried egg|egg yellow breakfast panfried round white
親子丼|chicken and egg bowl|rice egg chicken japanese bowl hotdish chopsticks || 牛丼|beef bowl|rice beef japanese bowl hotdish chopsticks sauce
そば|soba|noodle japanese thinnoodle slurp newyear brown chopsticks || そうめん|somen|noodle japanese thinnoodle slurp summer white coldeat chopsticks
サンドイッチ|sandwich|bread hand lunchbox western sliced coldeat || ハンバーガー|hamburger|bread meat hand western hotdish round sauce
グラタン|gratin|baked cheese milk hotdish western spoon bowl || ドリア|doria|baked cheese rice hotdish western spoon bowl
コロッケ|croquette|fried potato crunchy hotdish round sidedish lunchbox || メンチカツ|minced cutlet|fried meat crunchy hotdish sauce round sidedish
すき焼き|sukiyaki|hotdish japanese beef pot share winter sweet egg || しゃぶしゃぶ|shabu-shabu|hotdish japanese beef pot share winter thin dip
サラダ|salad|veggie coldeat fresh healthy sidedish sauce || 漬物|pickles|veggie pickled salty japanese sidedish rice chopsticks
焼き魚|grilled fish|seafood japanese chopsticks salty panfried rice breakfast || 煮魚|simmered fish|seafood japanese chopsticks boiled soysauce rice home
肉じゃが|meat and potatoes|meat potato japanese boiled sweet soysauce home sidedish || ポトフ|pot-au-feu|meat veggie western soup boiled spoon home
おでん|oden|hotdish japanese soup winter pot boiled chopsticks || 豚汁|pork miso soup|hotdish japanese soup winter veggie meat beans
お茶漬け|ochazuke|rice soup hotdish japanese soft chopsticks mild || おかゆ|rice porridge|rice riceitself soup hotdish soft spoon mild
ナポリタン|ketchup spaghetti|noodle fork ketchup western hotdish panfried || 焼きうどん|fried udon|thicknoodle panfried japanese hotdish chopsticks sauce
たこ焼き|takoyaki|round small flour seafood festival sauce hotdish stick || 肉まん|steamed pork bun|steamed meat flour round hotdish hand winter
`,
    1: `
アイスクリーム|ice cream|cold sweet milk summer cream spoon dessert melt || かき氷|shaved ice|cold sweet summer festival fruity spoon dessert
ジュース|juice|drink sweet colddrink fruity bottle cup || ソーダ|soda|drink sweet colddrink fizzy bottle cup
紅茶|black tea|drink hotdrink leaf cup brown || コーヒー|coffee|drink hotdrink bitter cup brown caffeine
牛乳|milk|drink colddrink white cow breakfast cup || 豆乳|soy milk|drink colddrink white soyalike healthy cup
緑茶|green tea|drink hotdrink leaf japanese bitter cup || 麦茶|barley tea|drink colddrink summer japanese barley brown
チョコレート|chocolate|sweet brown melt chocolate bitter snack || キャラメル|caramel candy|sweet brown caramelc chewy candy snack small
クッキー|cookie|sweet baked crunchy round small flour snack || せんべい|rice cracker|salty crunchy round japanese snack riceitself
グミ|gummy candy|sweet chewy fruity candy small snack colorful || ゼリー|jelly|sweet wobbly cold fruity spoon dessert colorful
ポテトチップス|potato chips|salty crunchy thin potato snack fried || ポップコーン|popcorn|salty crunchy snack movie festival
ドーナツ|donut|sweet fried round hole flour snack || ホットケーキ|pancake|sweet baked round flour breakfast layered cream
ショートケーキ|shortcake|sweet cream fruitused birthday white baked dessert || チーズケーキ|cheesecake|sweet cheese baked cold dessert blockshape
大福|daifuku|sweet japanese sticky white beanpaste round snack || どら焼き|dorayaki|sweet japanese baked round beanpaste snack
まんじゅう|manju|sweet japanese steamed beanpaste small snack || 羊羹|yokan|sweet japanese beanpaste blockshape sliced snack
おにぎり|rice ball|riceitself seaweed triangle lunchbox japanese hand || お稲荷さん|inari sushi|riceitself sweet sidedish japanese vinegar lunchbox hand
たい焼き|taiyaki|sweet baked shape_fish beanpaste hotdish winter snack || 今川焼き|imagawayaki|sweet baked round beanpaste hotdish winter snack
ヨーグルト|yogurt|white sour milk spoon cold healthy breakfast || プリン|pudding|sweet egg wobbly spoon cold dessert yellow
ココア|cocoa|drink hotdrink sweet brown milk chocolate winter cup || ミルクティー|milk tea|drink hotdrink sweet leaf milk brown cup
かりんとう|karinto|sweet crunchy japanese brown fried snack || あられ|rice crackers|salty crunchy japanese riceitself small snack
金平糖|konpeito|sweet small colorful candy japanese || あめ|hard candy|sweet candy colorful round small snack
スポーツドリンク|sports drink|drink colddrink sport bottle sweet salty || ミネラルウォーター|mineral water|drink colddrink bottle sport cup
パフェ|parfait|sweet cold cream layered fruitused dessert spoon || フルーツポンチ|fruit punch|sweet cold fruitused fruity dessert spoon colorful
マドレーヌ|madeleine|sweet baked small snack flour egg || カステラ|castella|sweet baked yellow sliced egg japanese snack
ワッフル|waffle|sweet baked grid snack flour cream || クレープ|crepe|sweet thin rolled cream fruitused snack flour
`,
  },
};
