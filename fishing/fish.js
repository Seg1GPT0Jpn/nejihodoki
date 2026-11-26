// のんびり釣り：生きもの150種のデータ（ずかんの中身）。pure（DOM なし）。
// 並び順＝ずかんの番号（ビット位置）。あとから並べ替えない・途中に入れない（末尾にだけ足す）。
// 1行 = key|ja|en|rarity|minCm|maxCm|場所|時間|天気|季節|えさ|あたり|ひき|力|絵|kind|ja解説|en解説
//  場所 P池 R川 S渓流 E河口 H港 T潮だまり K磯 O沖 C さんご礁 D深海 I氷の穴 N夜の湖
//  時間 a朝(5-8) d昼(8-16) e夕(16-19) n夜(19-5) / x=いつでも   天気 c晴れ o くもり r雨 / x
//  季節 S春 U夏 A秋 W冬 / x   えさ o雑食 p肉食 b底 c甲殻・貝 i虫 f プランクトン g深海
//  あたり n つんつん s じわっと d ガツン y 用心深い   ひき a ダッシュ b もぐる c 持久 d 一定 e ジャンプ
//  絵 shape,長さ,高さ,尾,背びれ,飾り,もよう,色1,色2,色3（色は #rgb の # なし）
//  kind r=実在の生きものがモデル（一般に知られた事実だけ） u=実在・解説に「確かでない」点を含む（印あり） f=架空の生きもの（解説に【架空】と書く）
(function (root) {
  'use strict';
  const RAW = `
crucian|フナ|Crucian Carp|1|12|35|PRNI|x|x|x|o|n|d|2|fus,10,7,rnd,mid,-,scale,987,dc8,cb6|r|ヒゲのない、丸みのあるコイの仲間。水草の多い静かな水辺にすみ、なんでも食べる。|A barbel-less, rounded cousin of the carp. It lives in calm, weedy water and eats almost anything.
carp|コイ|Common Carp|2|30|90|PRN|x|x|x|o|n|b|5|fus,13,8,rnd,long,barb,scale,8a5,fe9,c85|r|口に2対のヒゲがあり、底の泥をさぐって食べる。長生きで、数十年生きる個体もいる。|Two pairs of barbels help it root through bottom mud for food. It can live for several decades.
loach|ドジョウ|Pond Loach|1|8|20|PRS|ne|x|x|b|y|c|1|eel,15,3,rnd,low,barb,mott,a96,dc9,963|r|ヒゲで底のえさをさぐる。水中の酸素が少ないと、腸でも空気を吸える。|Barbels sniff out food on the bottom. In oxygen-poor water it can also take in air through its gut.
gudgeon|モツゴ|Topmouth Gudgeon|1|5|10|PR|x|x|x|o|n|a|1|fus,8,4,fork,low,-,line,998,eed,555|r|ため池や水路に群れる、小さな雑食の魚。|A small omnivore that schools in ponds and ditches.
bluegill|ブルーギル|Bluegill|1|10|25|P|ade|c|SUA|o|n|d|2|dee,9,9,rnd,spin,spot,bars,6a8,fd8,235|r|北アメリカ原産で、日本には1960年に持ちこまれた。えらぶたの黒いふちが目印。|Native to North America and brought to Japan in 1960. A dark flap on the gill cover is its mark.
bass|オオクチバス|Largemouth Bass|3|25|60|PN|ae|co|SUA|p|d|e|5|fus,12,7,rnd,two,-,line,486,ed9,243|r|口が大きく、小魚やカエルをのみこむ。ルアーによく食いつく。|A big-mouthed hunter of small fish and frogs. It readily strikes lures.
goldfish|キンギョ|Goldfish|2|8|25|P|d|c|SUA|o|n|d|1|rou,9,9,fan,long,-,none,f93,fc6,e52|r|フナの仲間から人が育てた観賞魚。長い尾びれの品種がたくさんある。|A pet fish bred by people from a crucian-type carp. Many varieties have long, flowing tails.
pondturtle|イシガメ|Japanese Pond Turtle|3|12|21|PR|d|c|SUA|b|y|c|2|tur,9,7,none,low,-,scale,653,db7,431|r|日本にしかいないカメ。川や池のおだやかな場所で、日なたぼっこをする。|A turtle found only in Japan. It basks on sunny banks of calm rivers and ponds.
snakehead|カムルチー|Snakehead|3|40|80|P|ad|c|U|p|s|b|6|lon,17,5,rnd,long,-,mott,564,ba6,342|r|空気呼吸ができる肉食魚。浅いよどみで、親が卵と子どもを守る。|An air-breathing predator of shallow, still water. The parents guard their eggs and young.
crayfish|アメリカザリガニ|Red Swamp Crayfish|1|6|12|P|x|x|SUA|o|n|d|1|cra,10,8,none,none,-,none,d43,e87,a21|r|1927年に日本へ持ちこまれた。水辺の穴や水草のかげにすむ。|Brought to Japan in 1927. It lives in burrows and weed beds along the water.
tench|テンチ|Tench|2|20|50|PN|an|o|SU|b|y|c|3|fus,11,8,rnd,low,barb,none,563,aa7,342|r|緑がかったぬるぬるの体に、小さなヒゲ。ヨーロッパの池の魚。|Olive-green and slimy, with tiny barbels. A classic pond fish of Europe.
lilypuff|ハスフグ|Lily Pufflet|3|10|22|P|ad|ro|U|f|y|a|3|rou,10,10,fan,low,-,spot,9c6,efd,5a4|f|【架空の生きもの】雨の日、ハスの葉かげでぷくっとふくらむ。ふくらむと葉っぱそっくりの色になる。|[Fictional creature] On rainy days it puffs up beneath lily pads, and its colour turns leaf-green.
longarm|テナガエビ|Long-armed Prawn|1|5|12|PRE|en|x|U|b|n|a|1|shr,11,5,fan,none,-,none,a85,dc9,742|r|オスのはさみ脚は体より長くなる。夜に活発に動く。|Males grow claws that can be longer than the body. It is most active at night.
bitterling|タナゴ|Bitterling|1|5|10|PR|d|c|SUA|o|y|a|1|dee,8,7,fork,low,-,line,6ab,fde,e47|r|二枚貝の中に卵を産む小さな魚。春はオスが色あざやかになる。|A small fish that lays its eggs inside living freshwater mussels. Males turn colourful in spring.
nishikigoi|ニシキゴイ|Ornamental Koi|3|30|90|P|d|c|SUA|o|s|b|5|fus,14,8,rnd,long,barb,saddle,fff,fed,e33|r|コイを観賞用に品種改良したもの。赤・白・黒の模様がある。|Koi are carp bred for colour, with patterns of red, white and black.
zacco|オイカワ|Pale Chub|1|8|15|RS|ad|c|SUA|i|n|a|1|fus,9,5,fork,low,-,bars,8bc,efe,e84|r|夏、オスは赤や青の婚姻色になる。流れのゆるい川に群れる。|In summer the males show red and blue breeding colours. It schools in slow rivers.
ugui|ウグイ|Japanese Dace|1|15|40|RES|x|x|x|o|n|d|2|fus,12,6,fork,low,-,line,876,dd9,c53|r|川から河口まで広くすむ。春の産卵期には腹に赤い線が出る。|It lives from rivers down to estuaries. In the spring breeding season, red stripes appear on its sides.
ayu|アユ|Sweetfish (Ayu)|3|10|28|RS|d|c|U|i|s|a|4|fus,11,5,fork,two,spot,none,9b8,eed,fc3|r|石についた藻を、くしのような歯でけずって食べる。寿命はおよそ1年。|It scrapes algae off stones with comb-like teeth. Its life lasts about a year.
catfish|ナマズ|Japanese Catfish|3|30|80|RN|ne|ro|U|p|y|b|4|cat,13,6,rnd,long,barb,mott,543,a97,321|u|夜に動くヒゲの魚。むかしは地震をおこすと言われたが、感じとれるかは確かでない。|A whiskered night prowler. Old folk tales blamed it for earthquakes; whether it senses quakes is not established.
eel|ウナギ|Japanese Eel|3|40|100|RENS|n|ro|UA|b|s|d|5|eel,20,3,rnd,long,-,none,432,bb9,a85|r|海で生まれ、川で育つ。産卵場所がマリアナ諸島の西の海だとわかったのは2009年。|Born at sea and raised in rivers. Its spawning area, west of the Mariana Islands, was pinned down in 2009.
smallmouth|スモールマウスバス|Smallmouth Bass|3|25|50|RS|ad|co|SUA|p|d|e|5|fus,11,6,rnd,two,-,bars,763,dc8,542|r|流れのある岩場を好む北アメリカ原産の魚。引きが強い。|A fish from North America that likes rocky, flowing water. It pulls hard.
iwana|イワナ|Japanese Char|2|15|40|S|ad|x|SUA|i|n|d|3|fus,11,6,rnd,low,-,spot,765,eec,fa4|r|川の最上流など、冷たい水にすむ。白い点がある。|It lives in the coldest, uppermost streams. Pale spots dot its body.
yamame|ヤマメ|Yamame Trout|2|15|30|S|ad|c|SUA|i|n|a|3|fus,10,5,fork,two,-,spot,8a9,eef,567|r|体の横に小判形の模様がある。海へ下ったものはサクラマスになる。|Oval marks run along its sides. Those that go to sea come back as cherry salmon.
rainbowtrout|ニジマス|Rainbow Trout|2|20|60|SRI|ad|co|SUA|i|n|e|4|fus,12,6,rnd,two,-,spot,8a8,efe,e8a|r|北アメリカ原産で、1877年に日本へ。体の横にピンク色の帯がある。|From North America, brought to Japan in 1877. A pink band runs along its side.
browntrout|ブラウントラウト|Brown Trout|3|25|70|SRI|ae|co|SUA|p|d|b|5|fus,12,6,rnd,low,-,spot,865,eed,c43|r|ヨーロッパ原産で、用心深い大きなマス。赤い点が目印。|A wary European trout. Red spots are its mark.
sculpin|カジカ|Sculpin|1|8|15|S|ne|x|x|b|y|c|1|cat,9,5,fan,low,-,mott,653,ca8,432|r|頭が大きく、川底の石のかげにかくれる。きれいな水の魚。|A big-headed fish that hides under stones. It needs clean water.
sawagani|サワガニ|Freshwater Crab|1|2|4|S|d|x|SU|b|y|a|1|cra,8,7,none,none,-,none,e63,fb8,a31|r|山の沢にすむ小さなカニ。子どもは海に下らず、カニの形で生まれる。|A tiny crab of mountain streams. It never goes to sea; the young hatch already looking like crabs.
giantsalamander|オオサンショウウオ|Giant Salamander|5|50|100|SR|n|ro|x|b|s|c|7|eel,15,6,fan,low,-,mott,653,a97,431|u|日本の特別天然記念物。野生で50年以上生きるとも言われる（確かでない）。|A protected natural monument in Japan. It is said to live over 50 years in the wild (not firmly established).
huchen|イトウ|Sakhalin Taimen|5|60|150|RI|ae|c|SUA|p|d|b|8|lon,18,6,rnd,low,-,spot,675,dca,c54|r|日本の淡水魚で最大級。北海道の川にすむ幻の大魚。|One of Japan's largest freshwater fish, a legendary giant of Hokkaido rivers.
mosstrout|コケセビレマス|Moss-back Trout|4|20|45|S|ad|ro|AS|i|s|b|4|fus,11,6,fan,sail,-,mott,5a6,dec,3a8|f|【架空の生きもの】背中にコケが生えたように見える山の主。雨あがりに姿を見せる。|[Fictional creature] A mountain spirit-fish with a mossy-looking back. It shows itself after the rain.
raindace|アメフリハヤ|Rainfall Dace|2|8|16|R|x|r|x|i|n|a|2|fus,9,5,lun,mid,-,line,7bd,dff,36c|f|【架空の生きもの】雨の日だけ水面近くに集まる、青い小さな魚。|[Fictional creature] A small blue fish that gathers near the surface only on rainy days.
cherrysalmon|サクラマス|Cherry Salmon|4|40|70|RE|a|co|SA|p|d|e|6|fus,13,6,fork,two,-,spot,9ab,eef,e9a|r|ヤマメが海で育ったもの。春、桜のころに川へ戻る。|A sea-going yamame. It returns to rivers around cherry-blossom time.
mullet|ボラ|Grey Mullet|1|25|60|EH|d|c|AW|o|n|a|3|fus,13,6,rnd,two,-,line,889,eef,666|r|大きさで名前が変わる出世魚。胃が丈夫で、泥の中の食べものも食べる。|Its name changes as it grows. A tough stomach lets it feed on bottom mud.
seabass|スズキ|Japanese Seabass|2|30|100|EHK|aen|ro|SUA|p|d|e|5|fus,14,6,fork,two,-,none,899,eef,666|r|セイゴ、フッコ、スズキと大きくなるにつれて名前が変わる。|It gets different names as it grows: seigo, fukko, then suzuki.
blackbream|クロダイ|Black Sea Bream|2|25|55|EHK|ae|co|SUA|c|s|d|4|dee,11,9,fork,spin,-,bars,667,cce,888|r|貝やカニを強いあごでかみ砕く。若いうちはオス、のちにメスになる。|It cracks shellfish and crabs with strong jaws. It begins life male and later becomes female.
haze|マハゼ|Yellowfin Goby|1|8|25|EH|d|co|A|b|n|a|1|cat,8,4,fan,two,-,mott,a96,ed9,863|r|秋の河口のハゼ釣りで有名。多くは1年ほどで一生を終える。|Famed for autumn goby fishing in estuaries. Most live only about a year.
flounder|ヒラメ|Bastard Halibut|3|30|80|HO|ae|c|WS|p|d|b|5|fla,13,10,rnd,long,-,mott,987,eed,654|r|左に両目がある。「左ヒラメに右カレイ」で見分ける。|Both eyes sit on the left side. Remember: left-eyed flounder, right-eyed flatfish.
mudskipper|トビハゼ|Mudskipper|2|7|12|E|d|c|SU|i|y|a|2|fus,9,4,rnd,high,-,spot,775,dd9,4a6|r|干潟で、ひれを使って泥の上をはね歩く。皮ふでも息をする。|It hops over tidal mud on its fins and also breathes through its skin.
barramundi|バラマンディ|Barramundi|4|40|150|E|ae|ro|U|p|d|e|7|fus,13,7,rnd,two,hump,scale,998,eef,775|r|オスからメスに性が変わる大きな魚。熱帯の河口にすむ。|A big fish that changes from male to female. It lives in tropical estuaries.
mudcrab|ノコギリガザミ|Mud Crab|3|10|25|E|ne|x|SUA|c|s|b|5|cra,11,9,none,none,-,mott,563,a96,742|r|大きなはさみを持つ河口のカニ。マングローブの泥にすむ。|A big-clawed estuary crab, living in mangrove mud.
archerfish|テッポウウオ|Archerfish|3|10|25|E|d|c|SU|i|d|a|2|dee,9,7,rnd,mid,-,bars,dd9,eed,333|r|口から水を飛ばして、虫を水面に落として食べる。|It spits a jet of water to knock insects into the water and eats them.
horsemackerel|アジ|Horse Mackerel|1|10|30|HK|aen|x|SUA|o|n|a|2|fus,11,5,fork,two,-,line,688,eef,ca4|r|体の横に、かたいトゲのようなうろこ（ぜいご）が並ぶ。|A row of hard, spiny scales (zeigo) runs along each side.
sardine|イワシ|Sardine|1|10|20|HO|ad|x|x|f|n|a|1|fus,10,4,fork,low,-,spot,57a,eef,333|r|大きな群れで泳ぐ。海の食物連鎖を支える、小さな魚。|It swims in huge schools and is a key food for bigger sea animals.
mackerel|サバ|Chub Mackerel|1|20|45|HO|ad|x|AS|p|d|a|3|tor,12,5,fork,two,-,bars,468,eef,223|r|青い背中に波のような模様。泳ぎつづけて群れでくらす。|Wavy marks cover its blue back. It keeps swimming and lives in schools.
mebaru|メバル|Rockfish|2|15|30|HKN|nea|x|WS|p|s|d|3|dee,10,8,fan,spin,-,mott,785,dc9,554|r|海藻の茂る岩場にすむ。子どもを、卵ではなく稚魚のすがたで産む。|It lives among seaweed and rocks. It gives birth to young fish, not eggs.
kisu|シロギス|Japanese Whiting|1|12|25|HE|d|c|SUA|b|n|a|1|lon,13,4,fork,two,-,none,dcb,fff,ca8|r|砂の海底にすむ。おどろくと砂にもぐる。|It lives on sandy bottoms and burrows into the sand when startled.
greenling|アイナメ|Fat Greenling|2|20|45|KH|ad|co|AW|b|s|c|3|fus,11,6,rnd,long,-,mott,874,db7,653|r|オスが卵の番をする。岩のすき間にひそむ。|The male guards the eggs. It lurks in gaps between rocks.
aoriika|アオリイカ|Bigfin Reef Squid|3|20|45|HKN|nea|c|SUA|p|d|a|4|squ,12,6,fan,mid,-,spot,ebd,fed,c87|r|大きなひれが体のふちを一周する。色を変えて気持ちを伝える。|A big fin frames its whole body. It changes colour to signal to others.
octopus|マダコ|Common Octopus|2|20|60|KTH|nad|co|SUA|c|s|d|4|oct,9,9,none,none,-,mott,a64,eb9,732|r|心臓が3つで、血は青い。体はやわらかく、すき間をすり抜ける。|It has three hearts and blue blood. Its soft body squeezes through tiny gaps.
seabream|マダイ|Red Seabream|3|30|90|HKO|ad|c|SUA|c|s|d|5|dee,11,10,fork,spin,-,spot,e87,fdb,39d|r|赤い色は、エビやカニを食べて得た色素による。日本ではおめでたい魚。|Its red comes from pigments in the shrimp and crabs it eats. A lucky fish in Japan.
kusafugu|クサフグ|Grass Puffer|1|10|25|HT|ade|c|SUA|b|y|a|1|rou,8,7,fan,none,-,spot,775,eed,553|r|ふくらむフグ。体に毒がある。釣れても食べない。|A puffer that inflates. It is toxic, so never eat one.
kasago|カサゴ|Marbled Rockfish|2|15|30|KH|ne|x|x|p|s|c|3|fus,9,8,rnd,spin,hump,mott,a54,fca,632|r|ひれのトゲに毒がある。岩のすき間にじっとかくれる。|Venom lies in its fin spines. It hides motionless between rocks.
conger|アナゴ|Conger Eel|2|30|90|HEN|ne|x|SU|b|s|d|4|eel,18,3,fan,long,-,none,a98,fed,654|r|夜、砂の海底を歩きまわるウナギに似た魚。子どもは透明な葉のような形。|An eel-like fish that roams sandy bottoms at night. Its larvae are clear and leaf-shaped.
yellowtail|ブリ|Japanese Amberjack (Buri)|3|50|110|HO|ad|c|WA|p|d|e|6|tor,13,6,fork,two,-,line,568,eef,fc4|r|ワカシ、イナダ、ワラサ、ブリと大きくなるにつれて名前が変わる。|It takes new names as it grows: wakashi, inada, warasa, then buri.
shako|シャコ|Mantis Shrimp|2|10|18|EH|n|x|SU|b|s|b|3|shr,12,4,fan,none,-,bars,986,ddb,a74|r|エビに似るが、たたく前足を持つ。海底に穴を掘ってすむ。|Not a true shrimp: it has striking front claws and digs burrows in the seabed.
lanternmackerel|ランタンサバ|Lantern Mackerel|3|20|40|H|ne|ro|AW|p|d|a|3|tor,12,5,lun,two,-,glow,468,bde,fd6|f|【架空の生きもの】おなかが小さなランタンのように光る港の魚。夜の水面で見つけやすい。|[Fictional creature] A harbour fish whose belly glows like a tiny lantern. Easy to spot on the night surface.
lamplsquid|ミナトトモシイカ|Harbour Lamp Squid|3|15|30|H|ne|x|W|p|s|a|3|squ,10,5,rnd,mid,-,glow,98b,dde,fe8|f|【架空の生きもの】港の灯りに集まる小さなイカ。体の点がまたたく。|[Fictional creature] A small squid that gathers at harbour lights. The dots on its body twinkle.
anchorpuff|イカリフグ|Anchor Pufferfish|3|20|40|HK|d|c|SUA|b|y|b|4|rou,11,9,fork,high,horn,bars,567,dde,b75|f|【架空の生きもの】いかりの形のひれを持つ、のんびり屋のフグ。|[Fictional creature] A laid-back puffer with anchor-shaped fins.
sakurabream|サクラダイ|Blossom Bream|4|25|55|EH|a|c|S|c|s|d|5|dee,10,10,fork,sail,-,spot,fbc,fee,e68|f|【架空の生きもの】春だけ桜色になる、ふしぎな鯛。河口でそっと姿を見せる。|[Fictional creature] A mystery bream that turns cherry-pink only in spring, appearing quietly in estuaries.
hermitcrab|ヤドカリ|Hermit Crab|1|2|6|T|x|x|x|c|y|a|1|cra,7,6,none,none,-,spot,d86,fdb,a53|r|あき貝をおうちにして、大きくなると引っこしする。|It lives in an empty shell and moves house as it grows.
blenny|ギンポ|Blenny|1|6|12|T|ad|x|x|b|y|a|1|eel,12,3,rnd,long,-,mott,874,dc9,653|r|潮だまりの岩のあなから顔を出す、小さな魚。|A small fish that peeks out of holes in tidepool rocks.
shorecrab|イソガニ|Shore Crab|1|3|6|TK|x|x|x|c|n|a|1|cra,9,8,none,none,-,bars,675,ba8,453|r|岩場を横歩きで走りまわる、小さなカニ。|A small crab that scuttles sideways across rocks.
starfish|ヒトデ|Starfish|1|5|15|T|x|x|x|c|s|c|1|jel,8,8,none,none,-,spot,e75,fb9,a43|r|脳がなく、足の先の管足で歩く。|It has no brain and walks on tiny tube feet.
urchin|ムラサキウニ|Purple Sea Urchin|2|4|8|TK|d|c|SU|c|s|c|2|rou,8,8,none,none,horn,spot,636,a8a,314|r|トゲで身を守り、海藻をかじって食べる。|It shields itself with spines and nibbles seaweed.
seacucumber|ナマコ|Sea Cucumber|1|10|25|T|nd|x|W|b|y|c|1|eel,9,5,none,none,-,spot,764,ca8,432|r|おそわれると、内臓を出してのちに再生することがある。|When threatened it can expel some organs and later regrow them.
clingfish|ウバウオ|Clingfish|3|2|4|T|d|co|SU|b|y|a|1|fus,6,3,rnd,low,-,spot,a86,edc,853|r|おなかに吸盤があり、波の中でも岩にはりつく。|A sucker on its belly lets it cling to rock even in crashing waves.
seahorse|タツノオトシゴ|Seahorse|4|8|15|TC|d|c|SU|f|y|a|2|sea,5,12,none,low,-,spot,eb4,fed,c83|r|オスのおなかの袋で、子どもを育てる。立って泳ぐ。|Males carry the young in a belly pouch. It swims upright.
seaslug|ウミウシ|Sea Slug|3|3|8|T|d|c|WS|c|y|c|1|jel,7,5,none,none,horn,spot,69d,fef,f6a|r|貝のなかま。色あざやかで、名前は「裸のえら」の意味の言葉からきている。|A shell-less mollusc with bright colours. Its group name means naked gills.
turban|サザエ|Turban Shell|2|6|12|KT|d|c|SUA|c|y|c|2|rou,7,7,none,none,horn,scale,764,cb8,432|r|トゲのあるうずまきの貝。ふたはかたい石のよう。|A spiny, spiral shell with a stone-hard lid.
abalone|アワビ|Abalone|4|8|18|K|nd|x|SUA|c|y|c|3|rou,10,6,none,none,-,spot,764,ba9,543|r|岩にはりついて海藻を食べる。殻の穴から水を出す。|It clings to rocks and eats seaweed. Water leaves through the holes in its shell.
seachub|メジナ|Opaleye (Mejina)|2|20|50|K|ad|co|WA|o|s|d|4|fus,11,7,rnd,mid,-,none,556,9a9,445|r|磯のかしこい魚。冬に脂がのって味がよいとされる。|A clever fish of rocky shores, considered at its tastiest in winter.
rockbream|イシダイ|Striped Beakfish|4|30|70|K|ad|c|SUA|c|s|b|7|dee,10,9,rnd,spin,beak,bars,889,dde,222|r|強いくちばしのような歯で、貝やウニをかみ砕く。縞は大人になると薄れる。|Beak-like teeth crush shellfish and urchins. The stripes fade as it ages.
wrasse|キュウセン|Wrasse (Kyusen)|1|12|25|KH|d|c|SUA|b|n|a|1|lon,12,4,rnd,long,-,line,9b7,dec,e83|r|砂にもぐって眠る。生まれはメスで、のちにオスになる魚もいる。|It sleeps buried in sand. Some are born female and later become male.
moray|ウツボ|Moray Eel|3|50|150|KTC|n|x|x|p|d|d|6|eel,20,5,rnd,long,-,mott,675,eb6,442|r|のどの奥に、もう1組のあごがある。岩のあなにひそむ。|A second set of jaws sits deep in its throat. It lurks in rock holes.
amberjack|ヒラマサ|Yellowtail Amberjack|4|60|120|KO|ad|c|SUA|p|d|a|7|tor,14,6,fork,two,-,line,468,eef,fc3|r|ブリに似るが、体がやや細く、とても速い。|Like buri but a bit slimmer and very fast.
spinylobster|イセエビ|Japanese Spiny Lobster|5|20|35|K|n|x|AW|c|s|b|6|cra,12,7,none,none,horn,bars,a43,e87,fdb|r|大きなはさみがなく、長い触角で身を守る。|No big claws, but long, spiny antennae for defence.
glasssprite|ガラスエビノコ|Glass Shrimp Sprite|2|3|6|T|ae|c|SU|f|y|a|1|shr,8,4,fan,none,-,glow,9de,eff,fe9|f|【架空の生きもの】体がガラスのように透けて、光を通す潮だまりの妖精。|[Fictional creature] A tidepool sprite whose body is clear as glass and lets light shine through.
kettlecrab|チャガマガニ|Tea-kettle Crab|3|8|16|K|d|c|x|c|s|d|3|cra,9,8,none,none,tube,scale,b86,fda,643|f|【架空の生きもの】甲らが茶がまの形をした、磯の岩のようなカニ。|[Fictional creature] A rocky-shore crab with a shell shaped like a tea kettle.
sunsetsnapper|ユウヤケダイ|Sunset Snapper|4|30|60|K|e|c|SUA|p|d|e|5|dee,11,8,fork,high,-,grad,f74,fdb,f3a|f|【架空の生きもの】夕焼けの時間だけ全身がオレンジ色にかがやく磯の魚。|[Fictional creature] A rocky-shore fish that glows orange all over, but only at sunset.
damselfish|スズメダイ|Damselfish|1|6|12|TKC|d|c|SU|f|n|a|1|dee,7,7,fork,mid,-,bars,468,dde,fd3|r|小さな群れで岩のそばを泳ぐ。なわばり意識が強い。|It swims in small groups near rocks and defends its territory fiercely.
giantoctopus|ミズダコ|Giant Pacific Octopus|4|100|300|K|nd|co|WS|c|s|b|7|oct,14,10,none,none,-,spot,b66,ecb,843|r|世界最大級のタコ。寒い北の海にすむ。|One of the largest octopuses in the world, living in cold northern seas.
bluefintuna|クロマグロ|Pacific Bluefin Tuna|5|100|300|O|ad|c|AW|p|d|b|10|tor,16,8,lun,sail,-,none,246,dde,ec3|r|泳ぎつづけないと息ができない。大きな群れで海を横断する。|It must keep swimming to breathe, and it crosses oceans in big groups.
skipjack|カツオ|Skipjack Tuna|3|40|80|O|ad|c|SUA|p|d|a|6|tor,13,6,lun,two,-,line,358,dde,333|r|かつおぶしの原料。おなかに縦のしま模様がある。|The source of katsuobushi. Dark stripes run along its belly.
mahimahi|シイラ|Mahi-mahi|3|60|150|O|ad|c|SUA|p|d|e|6|lon,14,7,fork,long,hump,grad,3ba,fe8,fc3|r|成長がとても速く、寿命は数年。ジャンプが得意。|It grows very quickly and lives only a few years. A great jumper.
marlin|カジキ|Blue Marlin|5|200|400|O|ad|c|SU|p|d|e|10|tor,19,5,lun,sail,bill,none,358,dde,69f|u|長い上あごのやりを持つ。最高時速は100kmとも言われる（確かでない）。|It has a long spear-like upper jaw. Some claim it reaches 100 km/h (not firmly established).
saury|サンマ|Pacific Saury|2|25|35|O|ad|c|A|f|n|a|2|lon,15,3,fork,low,beak,line,468,dde,fc4|r|秋の味覚。細長く、くちばしの先が黄色い。|A taste of autumn: slim, with a yellow-tipped beak.
sunfish|マンボウ|Ocean Sunfish|5|100|300|O|d|c|SU|f|s|c|8|rou,12,12,none,high,-,mott,889,ddd,556|r|重い硬骨魚の仲間。尾びれがなく、舵びれで泳ぐ。|One of the heaviest bony fishes. It has no true tail and steers with a rudder-like fin.
blueshark|ヨシキリザメ|Blue Shark|4|120|300|O|nae|x|x|p|s|d|7|sha,16,6,fork,high,-,none,358,dde,246|r|青くスマートなサメ。広い海を長く旅する。|A slim blue shark that travels widely across the oceans.
yellowfin|キハダ|Yellowfin Tuna|4|80|200|O|d|c|SU|p|d|b|8|tor,15,7,lun,long,-,line,356,dd9,fd3|r|ひれが長く、黄色くのびる。速く泳ぐマグロ。|Long yellow fins stretch out behind. A fast tuna.
surumeika|スルメイカ|Japanese Flying Squid|2|20|35|O|nae|x|AW|p|d|a|3|squ,14,5,lun,mid,-,spot,c76,fdb,94c|r|夜、灯りに集まる。海の上へとびだすこともある。|It gathers at lights at night and sometimes leaps clear of the water.
greenturtle|アオウミガメ|Green Sea Turtle|5|80|120|OC|d|c|SU|f|s|c|8|tur,13,8,none,none,-,scale,586,dd9,342|r|大人は海藻や海草を食べる。名前は脂肪の緑色から。|Adults eat seagrass and seaweed. Its name comes from its green fat.
manta|オニイトマキエイ|Giant Manta Ray|5|200|500|OC|d|c|SU|f|s|b|9|ray,20,6,fil,none,horn,saddle,235,eef,89b|r|プランクトンをこして食べる大きなエイ。両手を広げると数メートル。|A big plankton-filtering ray whose wings stretch several metres.
cloudray|クモノエイ|Cloud Ray|4|100|200|O|d|c|x|f|s|c|6|ray,18,7,fil,none,-,mott,9bd,fff,5a7|f|【架空の生きもの】雲のようにふわふわ泳ぐ、白いエイ。晴れた日に空とまちがえそう。|[Fictional creature] A white ray that drifts like a cloud, easy to mistake for the sky on clear days.
kitefish|タコアゲウオ|Kite Fish|3|40|80|O|d|co|AS|f|d|e|4|dee,12,12,fil,sail,-,bars,e65,ffd,35a|f|【架空の生きもの】菱形の体で風にのってとびはねる。尾びれがひらひらした凧のよう。|[Fictional creature] A diamond-bodied fish that skips on the wind, its tail fluttering like a kite.
goldenmarlin|ゴールデンアワーカジキ|Golden Hour Marlin|5|200|350|O|e|c|U|p|d|e|9|tor,20,5,lun,sail,bill,grad,fb3,ffd,e52|f|【架空の生きもの】夕暮れの黄金色の海でだけ現れる、伝説のカジキ。|[Fictional creature] A legendary marlin that only appears in the golden sea of evening.
swordfish|メカジキ|Swordfish|4|150|400|ON|n|x|x|p|d|b|9|tor,17,6,lun,high,bill,none,445,cce,ddd|r|平たい剣のような上あご。夜に深いところから浮かんでくる。|A flat, sword-like upper jaw. It rises from the deep at night.
opah|アカマンボウ|Opah|4|60|150|OD|d|x|x|f|s|c|5|rou,13,11,fork,high,-,spot,c35,fbb,fcf|r|体を温めながら泳ぐ、めずらしい魚。赤くて丸い。|A rare fish that keeps its body warm as it swims. Round and red.
clownfish|カクレクマノミ|Clown Anemonefish|2|6|11|C|d|c|x|f|y|a|2|dee,6,6,rnd,mid,-,bars,f73,fe9,fff|r|イソギンチャクの中でくらす。生まれはみんなオスで、のちにメスになる。|It lives among anemone tentacles. All are born male; the biggest becomes female.
bluetang|ナンヨウハギ|Blue Tang|3|15|30|C|d|c|x|f|n|a|3|dee,9,8,fork,long,-,line,36d,fe5,123|r|しっぽの付け根に、小さなメスのようなするどいトゲがある。|A sharp, scalpel-like spine sits at the base of its tail.
parrotfish|ブダイ|Parrotfish|3|30|70|C|d|c|x|o|s|b|5|fus,12,8,rnd,long,hump,scale,4ab,ded,a5d|r|オウムのくちばしのような歯でサンゴをかじり、砂をつくる。|Parrot-beak teeth scrape coral, and the leftover grit becomes sand.
butterflyfish|チョウチョウウオ|Butterflyfish|2|10|20|C|d|c|x|c|y|a|2|dee,8,9,fan,mid,spot,bars,fe4,fff,222|r|ひらひらと泳ぐ、うすい体。目の模様をにせの目にして身を守る。|A thin, fluttering fish with an eye-mark that confuses enemies.
angelfish|キンチャクダイ|Emperor Angelfish|3|15|35|C|d|c|x|c|y|d|3|dee,10,10,fan,sail,horn,line,35a,fe5,fd0|r|大人と子どもで、まったく模様がちがう。|Adults and juveniles look completely different.
lionfish|ミノカサゴ|Lionfish|3|20|35|C|ne|x|x|p|s|c|4|dee,10,9,fan,long,-,bars,a43,fcb,622|r|ひれのトゲに毒がある。ゆったりと泳ぎ、小魚をねらう。|Venom in its fin spines. It drifts slowly while stalking small fish.
moorishidol|ツノダシ|Moorish Idol|3|12|20|C|d|c|x|c|y|d|3|dee,7,10,fan,sail,beak,bars,fe9,fff,222|r|背びれがながくのびた、白・黄・黒の魚。|A white, yellow and black fish with a long trailing dorsal fin.
triggerfish|モンガラカワハギ|Triggerfish|2|20|40|C|d|c|x|c|s|d|3|dee,10,8,rnd,spin,-,spot,5b9,efc,fd4|r|背びれのトゲを立てて、岩のすき間にしっかり固定できる。|It can lock itself into a crevice by raising a dorsal spine.
boxfish|ハコフグ|Boxfish|2|10|25|C|d|c|x|b|y|a|2|rou,8,8,rnd,none,horn,spot,fd3,ffa,333|r|四角い骨の板でおおわれた体。ゆっくり泳ぐ。|Its body is boxed in bony plates. It swims slowly.
grouper|ハタ|Grouper|4|40|150|CK|nad|x|x|p|d|b|8|fus,14,9,rnd,spin,hump,spot,987,dcb,654|r|大きな口で、小魚を丸のみにする。大きくなると性が変わる種もある。|A big mouth swallows small fish whole. Some species change sex as they grow.
napoleon|メガネモチノウオ|Humphead Wrasse|5|80|200|C|d|c|x|c|s|b|9|fus,15,9,rnd,long,hump,line,3a9,9dc,fe6|r|おでこのこぶが目印の大きなベラ。絶滅が心配されている。|A huge wrasse known by the bump on its forehead. It is endangered.
giantkingfish|ロウニンアジ|Giant Trevally|4|60|130|CO|ad|c|x|p|d|a|8|dee,14,8,fork,two,-,none,788,dde,555|r|サンゴ礁で一番強い肉食魚のひとつ。水面の鳥さえおそう。|One of the reef's toughest hunters; it will even snatch birds from the surface.
reefshark|ネムリブカ|Whitetip Reef Shark|4|100|180|C|nd|x|x|p|s|d|6|sha,15,5,fork,high,-,none,889,eef,fff|r|ひれの先が白い。昼は岩のあなで休む。|White-tipped fins. By day it rests in reef caves.
peacockshrimp|シャコガイ|Peacock Mantis Shrimp|3|8|16|C|d|c|x|c|s|b|4|shr,10,5,fan,none,horn,bars,2b6,fe5,e33|r|おそろしく速いパンチで貝のからを割る。目は人よりずっと多くの色を見分ける。|A lightning-fast punch cracks shells. Its eyes sense many more colours than ours.
cleanerwrasse|ホンソメワケベラ|Cleaner Wrasse|2|6|12|C|d|c|x|c|n|a|1|lon,11,3,rnd,long,-,line,58e,dff,222|r|ほかの魚の体についた寄生虫を食べる「そうじや」さん。|A tiny cleaner that eats parasites off bigger fish.
prismray|ニジイロエイ|Prism Lagoon Ray|4|80|150|C|d|c|x|f|s|c|5|ray,14,6,fil,none,-,grad,6bd,fcf,fe8|f|【架空の生きもの】光があたると虹色にかがやく、ラグーンのエイ。|[Fictional creature] A lagoon ray that shimmers with rainbow colours in sunlight.
coraldasher|サンゴダッシュ|Coral Dasher|3|8|16|C|ad|c|x|c|n|a|2|fus,9,5,lun,mid,tube,line,3cb,fef,f7a|f|【架空の生きもの】サンゴのかげを矢のようにすばやく走る、にじ色の魚。|[Fictional creature] A rainbow-coloured fish that darts like an arrow among the coral.
moonjelly|ミズクラゲ|Moon Jellyfish|1|10|30|HTC|x|x|x|f|s|c|1|jel,10,8,none,none,-,spot,bdf,def,cae|r|透きとおったかさに、4つの輪の模様。ほとんどが水でできている。|A clear bell with four ring marks. It is almost all water.
gardeneel|チンアナゴ|Garden Eel|3|30|40|C|d|c|x|f|y|a|2|eel,14,2,none,none,spot,spot,fed,fff,333|r|砂の中に尾をうめて、からだを立てて流れてくる餌を待つ。|It anchors its tail in sand and stands up to catch drifting food.
nautilus|オウムガイ|Nautilus|4|15|25|CD|nd|x|x|c|s|c|3|squ,9,8,none,none,tube,bars,e86,fed,b53|r|3億年以上前から姿が大きく変わっていないとされる、殻を持つイカやタコの仲間。|A shelled cousin of squid and octopus, little changed for hundreds of millions of years.
anglerfish|チョウチンアンコウ|Anglerfish|4|20|60|D|x|x|x|g|s|b|6|ang,10,10,rnd,low,lure,spot,433,765,fe7|r|頭の上の長い突起の先を光らせて、えものをおびきよせる。|A glowing tip on a long spine on its head lures prey close.
gulper|フウセンウナギ|Gulper Eel|5|50|100|D|x|x|x|g|s|c|6|eel,22,5,fil,none,lure,glow,222,534,f94|r|大きな口と、先が光る長いしっぽを持つ深海魚。|A deep-sea fish with a huge mouth and a long tail whose tip glows.
oarfish|リュウグウノツカイ|Oarfish|5|300|800|D|x|x|WS|f|s|c|6|eel,26,4,fil,sail,-,line,ccd,eef,e33|u|世界で最も長い硬骨魚とされる。8mという記録があるが、それ以上の話は確かでない。|Considered the longest bony fish. About 8 m is reported; larger claims are not well established.
giantisopod|ダイオウグソクムシ|Giant Isopod|4|20|40|D|x|x|x|c|s|c|3|cra,12,6,none,none,-,bars,987,dcd,654|r|ダンゴムシの仲間で、深海では大きくなる。長いあいだ食べなくても生きられる。|A cousin of the pill bug that grows huge in the deep. It can go a long time without food.
viperfish|ホウライエソ|Viperfish|4|20|35|D|x|x|x|p|d|a|5|lon,12,4,fork,high,tube,glow,134,566,6fe|r|長いキバと、体の光る点が特徴。昼は深く、夜はやや浅い場所へ上がる。|Long fangs and glowing dots. It rises from deep water at night.
hatchetfish|ムネエソ|Hatchetfish|3|5|10|D|x|x|x|f|n|a|2|dee,6,10,fork,low,-,glow,bcd,fff,8ef|r|銀色のおのの形。おなかを光らせて、影を消して身を守る。|Silver and axe-shaped. It lights its belly to erase its shadow.
lanternfish|ハダカイワシ|Lanternfish|2|5|12|D|x|x|x|f|n|a|2|fus,9,4,fork,low,-,glow,345,789,7ef|r|海でとくに数が多い魚の仲間。毎晩、浅い所へのぼる。|One of the most abundant fish groups in the sea. It rises toward the surface each night.
barreleye|デメニギス|Barreleye|5|10|15|D|x|x|x|g|y|c|5|fus,10,6,fan,low,-,none,9ba,dee,6c8|r|頭がすきとおり、筒のような目が中に見える。|Its head is transparent, with tube-shaped eyes visible inside.
dumbo|ジュウモンジダコ|Dumbo Octopus|4|20|30|D|x|x|x|c|s|c|4|oct,9,8,none,none,-,grad,e9b,fde,c5a|r|耳のような大きなひれで、ひらひら泳ぐ深海のタコ。|A deep-sea octopus that flaps its ear-like fins to swim.
giantsquid|ダイオウイカ|Giant Squid|5|300|1000|D|n|x|x|p|d|b|9|squ,22,5,fan,mid,-,none,c54,eab,832|u|世界最大級の無脊椎動物。13mという話もあるが、確かでない。|One of the largest invertebrates. Stories of 13 m exist but are not well confirmed.
vampiresquid|コウモリダコ|Vampire Squid|4|15|30|D|x|x|x|f|s|c|4|oct,10,9,none,none,-,glow,422,744,e45|r|イカとタコの中間のなかま。おびやかされると光る粘液を出す。|Neither true squid nor octopus. When alarmed it releases glowing mucus.
frilledshark|ラブカ|Frilled Shark|5|100|200|D|n|x|x|p|s|d|7|sha,19,4,rnd,low,-,none,877,bbb,533|r|えらのふちがひらひらした「生きた化石」のようなサメ。歯は約300本。|A shark with frilly gills, like a living fossil. About 300 teeth fill its jaws.
goblinshark|ミツクリザメ|Goblin Shark|5|150|300|D|n|x|x|p|s|b|7|sha,16,5,rnd,low,horn,none,e9a,fdd,b65|r|あごを前に飛びださせて、えものを一瞬でとらえる。|Its jaws shoot forward to snap up prey in an instant.
fangtooth|オニキンメ|Fangtooth|4|10|16|D|x|x|x|p|d|a|4|dee,8,8,rnd,high,-,none,433,866,ddc|r|体の大きさに対して、魚の中でも最大級の牙を持つ。|Its fangs are among the biggest of any fish for its size.
blobfish|ニュードルフィッシュ|Blobfish|4|20|30|D|x|x|x|b|y|c|3|rou,11,8,rnd,low,-,none,eab,fdd,b78|r|ぶよぶよの顔は、水圧のない水面に上がったときの姿。深い海では普通の魚に見える。|The droopy face appears only after it leaves deep water pressure. Down deep it looks like a normal fish.
coelacanth|シーラカンス|Coelacanth|5|100|180|D|n|x|x|p|s|d|7|fus,14,8,fan,two,-,spot,457,99b,ddf|r|絶滅したと思われていたが、1938年に生きた個体が見つかった。|Once thought extinct, a live one was found in 1938.
abysseel|ヤミトモシウナギ|Abyss Lantern Eel|4|60|120|D|x|x|x|g|s|d|7|eel,24,4,fil,low,lure,glow,123,345,6fa|f|【架空の生きもの】深海の暗やみを小さなランタンで照らしながら進む細長いウナギ。|[Fictional creature] A long eel that lights its way through deep darkness with a little lantern.
velvetdragon|ベルベットドラゴン|Velvet Deep Dragon|5|100|250|D|x|x|x|g|d|b|10|lon,22,6,fan,sail,horn,glow,213,546,e7f|f|【架空の生きもの】ビロードのような黒い体に、星のような光が散る深海の主。|[Fictional creature] The lord of the deep, black as velvet and scattered with starlike lights.
wakasagi|ワカサギ|Pond Smelt|1|8|15|IP|ad|x|W|f|n|a|1|lon,11,3,fork,low,-,none,9ab,eef,566|r|冬、氷にあけた穴から釣る「穴釣り」で人気。|A favourite of winter ice fishing through holes in the ice.
arcticchar|アークティックチャー|Arctic Char|3|25|60|I|ad|x|WA|p|d|d|4|fus,12,6,fork,two,-,spot,456,fdb,f84|r|淡水の魚で、いちばん北まで分布するといわれる。|Said to live farther north than any other freshwater fish.
laketrout|レイクトラウト|Lake Trout|4|40|100|IN|nd|x|WA|p|d|b|7|fus,14,7,fork,two,-,spot,567,cdc,889|r|冷たく深い湖の主。ゆっくり育ち、長生きする。|A lord of cold, deep lakes. It grows slowly and lives long.
burbot|カワメンタイ|Burbot|3|30|80|IN|n|x|W|p|s|c|4|cat,15,5,rnd,long,barb,mott,764,cb8,432|r|淡水にすむタラの仲間。冬にさかんに動いて、氷の下で産卵する。|The freshwater member of the cod family. It is active in winter and spawns under ice.
pike|カワカマス|Northern Pike|4|50|120|IPN|ad|co|WA|p|d|a|7|lon,18,5,rnd,low,-,spot,674,cd9,452|r|水草のかげで待ちぶせして、一気にとびだす。|It ambushes from weeds and bursts out in one dash.
sturgeon|チョウザメ|Sturgeon|5|100|300|NR|an|x|x|b|s|c|9|lon,18,6,rnd,low,barb,scale,566,ddc,433|r|骨のよろいのような板が並ぶ。約2億年前から姿が似た仲間がいたとされる。|Rows of bony plates armour its back. Relatives like it are thought to date back some 200 million years.
wels|ヨーロッパオオナマズ|Wels Catfish|4|100|250|N|n|ro|SU|p|s|b|8|cat,17,6,fan,long,barb,mott,543,cb9,321|r|ヨーロッパ最大の淡水魚のひとつ。2mを超えることもある。|One of Europe's largest freshwater fish, sometimes longer than 2 m.
walleye|ウォールアイ|Walleye|3|30|80|NI|ne|co|SA|p|d|b|4|fus,13,7,rnd,two,-,saddle,987,fed,654|r|目の奥で光を反射して、暗いところでもよく見える。|A reflective layer behind its eyes lets it see well in the dark.
freshjelly|マミズクラゲ|Freshwater Jellyfish|3|1|3|NP|n|c|U|f|y|c|1|jel,6,5,none,none,-,spot,cdf,eff,9bd|r|淡水にすむ小さなクラゲ。夏に湖に突然あらわれることがある。|A tiny freshwater jelly that can appear in lakes suddenly in summer.
moonscale|ツキウロコゴイ|Moonscale Carp|4|40|90|N|n|c|AU|o|s|c|5|fus,14,9,rnd,long,barb,scale,aab,eef,fff|f|【架空の生きもの】満月の夜だけ、うろこが月のように白く光るコイ。|[Fictional creature] A carp whose scales shine white like the moon, but only on full-moon nights.
stardusteel|ホシクズウナギ|Stardust Eel|4|40|90|N|n|c|x|p|y|d|6|eel,19,3,fil,long,-,glow,224,446,aaf|f|【架空の生きもの】体のまわりに星くずのような光をまとう、夜の湖のウナギ。|[Fictional creature] A night-lake eel wrapped in glimmers like stardust.
willowwisp|ヤナギノヒウオ|Willow Wisp Fish|3|12|25|N|n|ro|SU|f|y|a|3|fus,8,4,fil,high,-,glow,357,9dc,efa|f|【架空の生きもの】柳の下の水面で、ぽっと小さな火のように光る魚。|[Fictional creature] A fish that glows like a tiny flame on the water under willow trees.
lanterngoby|ランタンハゼ|Lantern Goby|2|5|9|N|n|x|x|b|n|a|1|cat,7,4,fan,two,spot,glow,563,9d8,ff9|f|【架空の生きもの】頭の上に小さなあかりをともす、おとなしいハゼ。|[Fictional creature] A gentle goby that carries a small light on its head.
frostminnow|ガラスコオリウオ|Frost Glass Minnow|3|6|12|I|d|c|W|f|y|a|2|fus,9,3,fork,low,-,none,cef,fff,9cf|f|【架空の生きもの】氷のかけらのように透きとおる、冬の穴のなかの小魚。|[Fictional creature] A winter minnow clear as a shard of ice, found in the ice hole.
auroracharr|オーロラチャー|Aurora Char|5|40|90|I|n|c|W|p|d|e|8|fus,13,7,rnd,sail,-,grad,5c9,bef,c6f|f|【架空の生きもの】冬の夜、オーロラの色に体がゆれて光る氷の下の主。|[Fictional creature] The lord beneath the ice, shimmering with aurora colours on winter nights.
`;
  const SEASON = { S: 0, U: 1, A: 2, W: 3 }, TIMES = { a: 0, d: 1, e: 2, n: 3 }, WX = { c: 0, o: 1, r: 2 };
  const LOCS = 'PRSEHTKOCDIN';
  const maskOf = (s, map, n) => { if (s === 'x') return (1 << n) - 1; let m = 0; for (const ch of s) { if (!(ch in map)) throw new Error('bad mask ' + s); m |= 1 << map[ch]; } return m; };
  const SHAPES = ['fus', 'dee', 'lon', 'eel', 'fla', 'rou', 'tor', 'cat', 'ang', 'ray', 'sea', 'squ', 'oct', 'cra', 'shr', 'jel', 'tur', 'sha'];
  const FISH = [];
  RAW.split('\n').forEach(line => {
    line = line.trim(); if (!line) return;
    const f = line.split('|'); if (f.length !== 18) throw new Error('fish line has ' + f.length + ' fields: ' + f[0]);
    const a = f[14].split(',');
    FISH.push({
      i: FISH.length, key: f[0], ja: f[1], en: f[2], r: +f[3], min: +f[4], max: +f[5],
      loc: f[6].split('').map(ch => LOCS.indexOf(ch)), time: maskOf(f[7], TIMES, 4), wx: maskOf(f[8], WX, 3), season: maskOf(f[9], SEASON, 4),
      diet: f[10], bite: f[11], fight: f[12], pow: +f[13],
      art: { shape: a[0], L: +a[1], D: +a[2], tail: a[3], fin: a[4], ext: a[5], pat: a[6], c1: '#' + a[7], c2: '#' + a[8], c3: '#' + a[9] },
      kind: f[15], noteJa: f[16], noteEn: f[17],
    });
  });
  const api = { FISH, LOCS, SHAPES, COUNT: FISH.length };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.FishingFish = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
