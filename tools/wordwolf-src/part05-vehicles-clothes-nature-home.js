// 11 乗り物 / 12 服・持ち物 / 13 自然・天気・季節 / 14 家・日用品
'use strict';
module.exports = {
  vocab: `
cl_bath|おふろのあとにも使います。|You use it after a bath too.
nt_chilly|ひんやり涼しい場所です。|It is cool and shady.
vh_road|道路を走ります。|It runs on roads.
vh_rail|線路を走ります。|It runs on rails.
vh_air|空を飛びます。|It flies in the sky.
vh_water|水の上を進みます。|It moves on water.
vh_underwater|水の中にもぐります。|It goes under water.
vh_wheels|タイヤがついています。|It has wheels.
vh_two|車輪が2つのものです。|It has two wheels.
vh_many|たくさんの人が一度に乗れます。|Many people can ride at once.
vh_few|少ない人数で乗ります。|Few people ride at once.
vh_one|ひとりで乗ることが多いです。|It is mostly ridden alone.
vh_pedal|自分の足で動かすものもあります。|Some are powered by your legs.
vh_engine|エンジンやモーターで動きます。|It has an engine or motor.
vh_electric|電気で動くものがあります。|Some run on electricity.
vh_fast|とても速く走ります。|It goes very fast.
vh_slow|ゆっくりのんびり進みます。|It goes at an easy pace.
vh_driver|運転する人がいます。|A driver operates it.
vh_work|仕事のために働く車です。|It works on jobs.
vh_emergency|急いで駆けつけることがあります。|It rushes to emergencies.
vh_law|悪いことをした人を追いかけることがあります。|It may chase wrongdoers.
vh_hospital|けがや病気の人を運びます。|It carries injured or sick people.
vh_babyb|赤ちゃんを乗せることがあります。|It may carry a baby.
vh_chair|自分で座って、手で動かすことがあります。|You sit and wheel it yourself.
vh_siren|サイレンを鳴らします。|It sounds a siren.
vh_cargo|荷物を運びます。|It carries cargo.
vh_dig|土をほったり、おしたりします。|It digs and pushes soil.
vh_city|町の中で見かけます。|You see it in town.
vh_travel|遠くへの旅行に向いています。|It suits long trips.
vh_ticket|乗るときに料金がかかります。|You pay to ride.
vh_high|高いところや空中を進みます。|It travels high up.
vh_cable|ケーブルにつながって動きます。|It moves on cables.
vh_stairs|上や下の階へ運びます。|It carries you up or down.
vh_sail|風を使って進みます。|It sails with the wind.
vh_view|景色を楽しめます。|You can enjoy the view.
vh_hover|宙にうかびます。|It floats in the air.
vh_space|宇宙に行きます。|It goes to space.
vh_baby|赤ちゃんや足が不自由な人のためのものです。|It helps people who cannot walk well.
vh_kids|子どもが乗って遊ぶものです。|Kids ride it for fun.
vh_balance|バランスをとって乗ります。|You balance as you ride.
vh_stand|立って乗るものです。|You ride it standing.
vh_old|昔からある乗り物です。|It has been around for ages.
vh_pull|人が引いて走らせます。|It is pulled by a person.
vh_trash|ごみを集めます。|It collects trash.
cl_top|上半身に着ます。|You wear it on the upper body.
cl_bottom|下半身にはきます。|You wear it on the lower body.
cl_warm|あたたかいです。|It keeps you warm.
cl_cool|すずしく身につけられます。|It feels cool.
cl_winter|冬によく使います。|You use it a lot in winter.
cl_summer|夏によく使います。|You use it a lot in summer.
cl_rain|雨の日に使います。|You use it on rainy days.
cl_sun|日ざしよけに使います。|It protects from the sun.
cl_head|頭に身につけます。|You wear it on your head.
cl_neck|首のまわりに身につけます。|You wear it around your neck.
cl_hand|手に身につけます。|You wear it on your hands.
cl_foot|足に身につけます。|You wear it on your feet.
cl_two|左右でペアになっています。|It comes as a pair.
cl_carry|物を入れて持ち歩きます。|You carry things in it.
cl_back|背中にせおいます。|You carry it on your back.
cl_hold|手でもって使います。|You hold it in your hand.
cl_pocket|ポケットやしきりがあります。|It has pockets or compartments.
cl_money|お金やカードを入れます。|It holds money or cards.
cl_see|目に使います。|It is worn on the eyes.
cl_water|水の中で着ます。|You wear it in water.
cl_sleep|ねるときに着ます。|You wear it to sleep.
cl_work|おうちの仕事やお料理のときに使います。|You wear it for chores or cooking.
cl_wipe|手や汗をふくのに使います。|You use it to wipe.
cl_soft|やわらかい布でできています。|It is made of soft fabric.
cl_knit|あみ物で作られることがあります。|It can be knitted.
cl_leather|革やゴムが使われることがあります。|It may use leather or rubber.
cl_fashion|おしゃれのために身につけます。|You wear it to look nice.
cl_formal|きちんとした場でも使います。|It is used on formal occasions.
cl_safe|頭やからだを守ります。|It protects you.
cl_germ|口や鼻をおおいます。|It covers your mouth and nose.
cl_pipe|細い鎖や、ひもでつくります。|It is a chain or cord.
cl_gift|プレゼントにも選ばれます。|It is chosen as a gift.
cl_wrist|手首につけます。|You wear it on your wrist.
cl_ear|耳をあたためます。|It warms your ears.
cl_house|家の中ではきます。|You wear it indoors.
cl_boots|ぬれてもよいようにできています。|It is made to get wet.
cl_sport|運動のときによく使います。|People use it for sports.
cl_waist|こしにつけます。|You wear it at the waist.
cl_tight|体にぴったりとフィットします。|It fits closely.
cl_loose|ゆったりしています。|It is loose and roomy.
nt_wet|水がふえて、ぬれます。|Things get wet.
nt_cold|寒さを感じます。|It feels cold.
nt_hot|暑さを感じます。|It feels hot.
nt_white|白っぽく見えます。|It looks white.
nt_fall|空から降ってきます。|It falls from the sky.
nt_sound|大きな音がすることがあります。|It can be loud.
nt_sun|日ざしと関わります。|Sunlight is involved.
nt_light|光が見えます。|You see light.
nt_color|色がきれいです。|It is colorful.
nt_night|夜に見えます。|You see it at night.
nt_day|昼間に見えます。|You see it by day.
nt_sky|空に見えます。|You see it in the sky.
nt_water|水が関わります。|Water is involved.
nt_flow|水が流れます。|Water flows.
nt_stand|水がたまって静かです。|Water gathers still.
nt_big|とても広くて大きいです。|It is vast.
nt_high|高くそびえています。|It rises high.
nt_trees|木がたくさんあります。|There are many trees.
nt_sand|砂があります。|There is sand.
nt_wave|波があります。|There are waves.
nt_swim|夏には泳ぐ人もいます。|People swim there in summer.
nt_fish|魚がすんでいます。|Fish live there.
nt_climb|登る人もいます。|People climb it.
nt_season_spring|桜が咲く季節です。|It is the season of cherry blossoms.
nt_season_summer|せみが鳴く季節です。|It is the season of cicadas.
nt_season_autumn|木の葉の色が変わる季節です。|It is the season when leaves change color.
nt_season_winter|雪が降る地域もある季節です。|It is the season when snow falls in some places.
nt_warm|あたたかくなっていきます。|It gets warmer.
nt_cool|すずしくなっていきます。|It gets cooler.
nt_vacation|学校が長い休みになります。|Schools have long breaks.
nt_harvest|おいしいものがたくさんとれます。|Lots of tasty things are harvested.
nt_new|新しい生活が始まります。|New lives begin.
nt_bright|明るくなります。|It gets bright.
nt_dark|暗くなります。|It gets dark.
nt_red|赤っぽい色になります。|It turns reddish.
nt_round|丸く見えます。|It looks round.
nt_phase|形が日によって変わって見えます。|Its shape seems to change.
nt_many|たくさんの数があります。|There are lots of them.
nt_invisible|目には見えません。|You cannot see it itself.
nt_repeat|くり返しやってきます。|It keeps coming in again and again.
nt_evening|夕方に見えます。|You see it in the evening.
nt_dawn|早朝に見えます。|You see it in early morning.
nt_fast|あっという間に通りすぎます。|It passes quickly.
nt_wind|強い風がふきます。|Strong winds blow.
nt_storm|あれた天気になります。|The weather gets rough.
nt_long|長く続くことがあります。|It can last long.
nt_short|短い時間でおわることが多いです。|It is often brief.
nt_umbrella|かさがいります。|You need an umbrella.
nt_ice|氷が関わります。|Ice is involved.
nt_foggy|まわりが見えにくくなります。|Visibility drops.
nt_cloud|雲が関わります。|Clouds are involved.
nt_hot2|熱いもの（とけた岩）があふれることがあります。|Hot molten rock may pour out.
nt_fall2|高いところから水が落ちます。|Water drops from a height.
nt_cave|ほら穴のような空間です。|It is a hollow space.
nt_island|まわりを水で囲まれています。|It is surrounded by water.
nt_pretty|写真に撮りたくなります。|You want to photograph it.
hm_sleep|ねるときに使います。|You use it when sleeping.
hm_sit|すわるときに使います。|You sit on it.
hm_soft|やわらかい感触です。|It feels soft.
hm_window|窓に使います。|It goes on windows.
hm_light|光をさえぎったり通したりします。|It controls light.
hm_store|ものをしまいます。|It stores things.
hm_wash|手や体や顔をあらいます。|It is for washing.
hm_bath|おふろで使います。|You use it in the bath.
hm_clean|そうじで使います。|It is for cleaning.
hm_trash|ごみをすてます。|It is for rubbish.
hm_water|水を使います。|It uses water.
hm_paper|紙でできています。|It is made of paper.
hm_wood|木でできていることが多いです。|It is often wooden.
hm_glass|ガラスが使われています。|It uses glass.
hm_metal|金属が使われています。|It uses metal.
hm_light2|明かりをともします。|It makes light.
hm_fire|火を使います。|It uses fire.
hm_enter|出入りに使います。|It is for going in and out.
hm_lock|カギと関係があります。|Keys are involved.
hm_mirror|姿をうつします。|It reflects you.
hm_bedroom|寝室にあります。|It is in a bedroom.
hm_bathroom|おふろ場や洗面所にあります。|It is in a bathroom.
hm_garden|庭やベランダで使います。|You use it in a garden.
hm_japan|日本の家で使われてきました。|It has been used in Japanese homes.
hm_tatami|和室のものです。|It belongs in a Japanese room.
hm_slide|横にすべって開きます。|It slides open.
hm_swing|ひらいたり、とじたりします。|It swings open and closed.
hm_day|毎日つかいます。|You use it daily.
hm_dry|ふいたりかわかしたりします。|It is for wiping or drying.
hm_big|大きな家具です。|It is a big piece of furniture.
hm_small|手のひらサイズのものが多いです。|Many are palm-sized.
hm_stack|重ねてしまえます。|You can stack it.
hm_hold|ものをのせたり入れたりします。|It holds things.
hm_head|頭をささえます。|It supports your head.
hm_warm|あたたかさを保ちます。|It keeps you warm.
hm_teeth|歯をみがくときに使います。|You use it for teeth.
hm_hairc|かみをととのえます。|It tidies your hair.
hm_soap|あわが立ちます。|It foams.
hm_swim|あぶくやお湯と関係があります。|Bubbles and hot water are involved.
`,
  pairs: {
    11: `
電車|train|vh_rail vh_many vh_electric vh_driver vh_ticket vh_city || バス|bus|vh_road vh_many vh_wheels vh_engine vh_driver vh_ticket vh_city
新幹線|bullet train|vh_rail vh_many vh_electric vh_fast vh_travel vh_ticket || 飛行機|airplane|vh_air vh_many vh_engine vh_fast vh_travel vh_ticket vh_high
自転車|bicycle|vh_road vh_two vh_pedal vh_one vh_wheels vh_city || バイク|motorcycle|vh_road vh_two vh_engine vh_one vh_wheels vh_fast
自動車|car|vh_road vh_wheels vh_engine vh_few vh_driver vh_city || トラック|truck|vh_road vh_wheels vh_engine vh_cargo vh_work vh_driver
タクシー|taxi|vh_road vh_wheels vh_engine vh_few vh_driver vh_ticket vh_city || 人力車|rickshaw|vh_road vh_wheels vh_few vh_pull vh_old vh_ticket vh_view
船|ship|vh_water vh_many vh_engine vh_travel vh_ticket vh_driver || ヨット|sailboat|vh_water vh_few vh_sail vh_slow vh_view
潜水艦|submarine|vh_underwater vh_water vh_engine vh_driver || ロケット|rocket|vh_space vh_air vh_engine vh_fast vh_high
ヘリコプター|helicopter|vh_air vh_few vh_engine vh_hover vh_emergency vh_driver vh_high || 熱気球|hot air balloon|vh_air vh_few vh_hover vh_slow vh_view vh_high
路面電車|tram|vh_rail vh_many vh_electric vh_city vh_ticket vh_slow vh_driver || モノレール|monorail|vh_rail vh_many vh_electric vh_city vh_ticket vh_high vh_view
パトカー|police car|vh_road vh_wheels vh_engine vh_emergency vh_siren vh_work vh_law || 救急車|ambulance|vh_road vh_wheels vh_engine vh_emergency vh_siren vh_work vh_hospital
消防車|fire truck|vh_road vh_wheels vh_engine vh_emergency vh_siren vh_work || ゴミ収集車|garbage truck|vh_road vh_wheels vh_engine vh_trash vh_work vh_cargo vh_city
ロープウェイ|ropeway|vh_cable vh_many vh_high vh_view vh_ticket vh_slow || ケーブルカー|funicular|vh_cable vh_rail vh_many vh_view vh_ticket vh_slow
エスカレーター|escalator|vh_stairs vh_electric vh_many vh_slow vh_city || エレベーター|elevator|vh_stairs vh_electric vh_many vh_high vh_city
スケートボード|skateboard|vh_two vh_one vh_wheels vh_stand vh_balance vh_kids || キックボード|kick scooter|vh_two vh_one vh_wheels vh_stand vh_balance vh_kids vh_city
一輪車|unicycle|vh_one vh_pedal vh_balance vh_kids || 三輪車|tricycle|vh_one vh_pedal vh_wheels vh_kids
ショベルカー|excavator|vh_work vh_dig vh_wheels vh_engine vh_driver || ブルドーザー|bulldozer|vh_work vh_dig vh_engine vh_driver vh_slow
フェリー|ferry|vh_water vh_many vh_cargo vh_ticket vh_travel vh_engine || 遊覧船|sightseeing boat|vh_water vh_many vh_view vh_ticket vh_slow vh_engine
ベビーカー|stroller|vh_baby vh_babyb vh_wheels vh_city vh_slow vh_one || 車いす|wheelchair|vh_baby vh_chair vh_wheels vh_city vh_slow vh_one
`,
    12: `
シャツ|shirt|cl_top cl_cool cl_summer cl_formal cl_fashion || セーター|sweater|cl_top cl_warm cl_winter cl_knit cl_soft
スカート|skirt|cl_bottom cl_loose cl_fashion cl_waist || ズボン|trousers|cl_bottom cl_two cl_pocket cl_waist cl_sport
長靴|rain boots|cl_foot cl_rain cl_boots cl_two cl_leather || スニーカー|sneakers|cl_foot cl_sport cl_two cl_fashion
サンダル|sandals|cl_foot cl_summer cl_cool cl_two || スリッパ|slippers|cl_foot cl_house cl_soft cl_two
マフラー|scarf|cl_neck cl_warm cl_winter cl_knit cl_soft || 手袋|gloves|cl_hand cl_warm cl_winter cl_two cl_knit
帽子|hat|cl_head cl_sun cl_fashion cl_summer || ヘルメット|helmet|cl_head cl_safe cl_sport
リュック|rucksack|cl_carry cl_back cl_pocket cl_sport cl_fashion || ハンドバッグ|handbag|cl_carry cl_hold cl_pocket cl_fashion cl_leather
財布|wallet|cl_money cl_carry cl_pocket cl_leather || ポーチ|pouch|cl_carry cl_pocket cl_fashion cl_soft
傘|umbrella|cl_rain cl_hold cl_sun || レインコート|raincoat|cl_rain cl_top cl_loose
めがね|eyeglasses|cl_see cl_fashion || サングラス|sunglasses|cl_see cl_sun cl_fashion cl_summer
ネクタイ|necktie|cl_neck cl_formal cl_fashion || スカーフ|neckerchief|cl_neck cl_soft cl_fashion cl_warm
パジャマ|pajamas|cl_sleep cl_soft cl_loose cl_top cl_bottom || エプロン|apron|cl_work cl_top cl_waist cl_pocket
水着|swimsuit|cl_water cl_summer cl_tight cl_sport || ウェットスーツ|wetsuit|cl_water cl_tight cl_sport cl_warm
靴下|socks|cl_foot cl_two cl_soft cl_warm cl_knit || タイツ|tights|cl_foot cl_two cl_tight cl_warm cl_bottom
ベルト|belt|cl_waist cl_leather cl_fashion cl_bottom || サスペンダー|suspenders|cl_waist cl_fashion cl_bottom cl_two
ハンカチ|handkerchief|cl_wipe cl_soft cl_gift || タオル|towel|cl_wipe cl_soft cl_sport cl_bath
マスク|face mask|cl_germ cl_soft cl_winter || 耳あて|earmuffs|cl_ear cl_warm cl_winter cl_head cl_two cl_soft
コート|coat|cl_top cl_warm cl_winter cl_loose || ジャケット|jacket|cl_top cl_warm cl_pocket cl_fashion cl_formal
ブレスレット|bracelet|cl_wrist cl_fashion cl_pipe cl_gift || ネックレス|necklace|cl_neck cl_fashion cl_pipe cl_gift
`,
    13: `
雨|rain|nt_wet nt_fall nt_sky nt_umbrella nt_water nt_cloud || 雪|snow|nt_fall nt_cold nt_white nt_sky nt_season_winter nt_cloud
雷|thunder|nt_sound nt_light nt_sky nt_storm nt_short nt_cloud || 台風|typhoon|nt_wind nt_storm nt_wet nt_long nt_big nt_season_autumn
虹|rainbow|nt_color nt_sky nt_light nt_short nt_pretty || 雲|cloud|nt_sky nt_white nt_water nt_day nt_big nt_pretty
霧|fog|nt_foggy nt_wet nt_white nt_cold nt_short || 霜|frost|nt_white nt_cold nt_ice nt_season_winter nt_short
春|spring|nt_warm nt_season_spring nt_new nt_pretty || 秋|autumn|nt_cool nt_season_autumn nt_harvest nt_red nt_pretty
夏|summer|nt_hot nt_season_summer nt_vacation nt_sun || 冬|winter|nt_cold nt_season_winter nt_ice nt_vacation
朝|morning|nt_bright nt_sun nt_day nt_new || 夜|night|nt_dark nt_night nt_sky nt_light nt_long
太陽|sun|nt_sky nt_day nt_sun nt_hot nt_round nt_bright nt_light || 月|moon|nt_sky nt_night nt_round nt_phase nt_light nt_pretty
星|stars|nt_sky nt_night nt_light nt_many nt_pretty || オーロラ|aurora|nt_sky nt_night nt_light nt_color nt_cold nt_pretty
山|mountain|nt_high nt_big nt_trees nt_climb nt_cold nt_pretty || 丘|hill|nt_trees nt_climb nt_pretty
川|river|nt_water nt_flow nt_fish nt_swim nt_long || 湖|lake|nt_water nt_stand nt_fish nt_big nt_pretty nt_swim
海|sea|nt_water nt_wave nt_big nt_fish nt_swim || 砂浜|sandy beach|nt_sand nt_wave nt_swim nt_pretty
森|forest|nt_trees nt_big nt_dark nt_pretty nt_chilly || 草原|grassland|nt_big nt_pretty nt_sky
梅雨|rainy season|nt_wet nt_umbrella nt_long nt_cloud nt_water || 夕立|evening shower|nt_wet nt_umbrella nt_short nt_sound nt_season_summer
風|wind|nt_sound nt_fast nt_invisible || 波|waves|nt_water nt_sound nt_repeat nt_swim
火山|volcano|nt_high nt_big nt_climb nt_hot2 nt_sound || 滝|waterfall|nt_water nt_fall2 nt_sound nt_pretty nt_flow nt_chilly
夕焼け|sunset glow|nt_sky nt_red nt_pretty nt_short nt_sun nt_evening || 朝焼け|dawn glow|nt_sky nt_red nt_pretty nt_short nt_sun nt_dawn
氷|ice|nt_ice nt_cold nt_water nt_white || 水たまり|puddle|nt_water nt_stand nt_wet nt_short nt_umbrella
洞窟|cave|nt_cave nt_dark nt_climb nt_chilly || 島|island|nt_island nt_water nt_wave nt_swim nt_trees
`,
    14: `
ベッド|bed|hm_sleep hm_soft hm_big hm_bedroom hm_day || ソファ|sofa|hm_sit hm_soft hm_big hm_day
カーテン|curtain|hm_window hm_light hm_soft hm_dry || ブラインド|window blinds|hm_window hm_light hm_metal
テーブル|table|hm_hold hm_wood hm_big hm_day hm_sit || 椅子|chair|hm_sit hm_wood hm_day hm_stack
本棚|bookshelf|hm_store hm_wood hm_big hm_paper hm_hold || タンス|chest of drawers|hm_store hm_wood hm_big hm_hold hm_bedroom
洗面台|wash basin|hm_wash hm_water hm_bathroom hm_mirror hm_day || 浴槽|bathtub|hm_wash hm_water hm_bath hm_bathroom hm_big
歯ブラシ|toothbrush|hm_teeth hm_wash hm_small hm_day hm_bathroom || くし|hair comb|hm_hairc hm_small hm_day hm_bathroom hm_mirror
石けん|soap|hm_wash hm_soap hm_bath hm_small hm_bathroom || シャンプー|shampoo|hm_wash hm_soap hm_bath hm_hairc hm_bathroom
ティッシュ|tissue|hm_paper hm_dry hm_small hm_day || トイレットペーパー|toilet paper|hm_paper hm_dry hm_day hm_bathroom
ほうき|broom|hm_clean hm_wood hm_garden || ちりとり|dustpan|hm_clean hm_garden hm_hold
ごみ箱|trash can|hm_trash hm_hold hm_day || 洗濯かご|laundry basket|hm_hold hm_wash hm_day hm_bathroom
布団|futon|hm_sleep hm_soft hm_warm hm_japan hm_tatami hm_bedroom || 毛布|blanket|hm_sleep hm_soft hm_warm hm_bedroom
クッション|cushion|hm_sit hm_soft hm_head hm_day || 枕|pillow|hm_sleep hm_soft hm_head hm_bedroom
電球|light bulb|hm_light2 hm_glass hm_small || ろうそく|candle|hm_light2 hm_fire hm_small
鏡|mirror|hm_mirror hm_glass hm_bathroom hm_day || 窓|window|hm_window hm_glass hm_light hm_day
ドア|door|hm_enter hm_swing hm_wood hm_lock hm_day || ふすま|sliding door|hm_enter hm_slide hm_paper hm_japan hm_tatami hm_wood
かぎ|key|hm_lock hm_enter hm_metal hm_small hm_day || 南京錠|padlock|hm_lock hm_metal hm_small
バケツ|bucket|hm_water hm_hold hm_clean hm_garden || じょうろ|watering can|hm_water hm_garden hm_hold
玄関|entryway|hm_enter hm_lock hm_day hm_store || 縁側|veranda|hm_japan hm_wood hm_garden hm_sit hm_enter
`,
  },
};
