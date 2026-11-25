#!/usr/bin/env node
'use strict';
// tools/build-orchestra-scores.js — converts Mutopia Project MIDI files (all Public Domain, licence checked on each piece page) into the compact
// score JSON the 指揮者ゲーム reads (orchestra/scores/<id>.json plus orchestra/scores/index.json).
//
//   node tools/build-orchestra-scores.js [--src tools/orchestra-midi] [--out orchestra/scores]
//
// Input : tools/orchestra-midi/*.mid (the exact files downloaded from mutopiaproject.org, see PIECES[].midi and orchestra/CREDITS.md)
// Output: per piece { id, sec:[{ id, inst, n:[dt,pitch,dur(-=short),vel,...] }], grid, bpm, dyn, cues, ... } (all times in ticks of PPQ=96 or in conductor beats)
// The MIDI is a mechanical rendering of the engraved score (LilyPond), so there is no performance data: the game's "dynamics guide" is derived here from
// the velocities when the file has real dynamics (Dvořák, Mozart, Mendelssohn, Egmont) and otherwise from the orchestral density (Beethoven 5/7, Rossini).
// Deterministic: same inputs -> same bytes. Uses only orchestra/midi.js (our own parser).

const fs = require('fs');
const path = require('path');
const M = require('../orchestra/midi.js');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(opt('src', path.join(__dirname, 'orchestra-midi')));
const OUT = path.resolve(opt('out', path.join(__dirname, '..', 'orchestra', 'scores')));
const PPQ = 96;
const BPM_MIN = 36, BPM_MAX = 132; // the range one conducted beat may have at the guide tempo

// section id -> sample-bank instrument
const SEC_INST = { fl: 'fl', ob: 'ob', cl: 'cl', fg: 'fg', hn: 'hn', tp: 'tp', tb: 'tb', tu: 'tu', timp: 'timp', perc: 'bd', vln1: 'vln', vln2: 'vln', vla: 'vla', vc: 'vc', cb: 'cb' };

const NAMES = { flauti: 'fl', oboi: 'ob', clarinetti: 'cl', fagotti: 'fg', corni: 'hn', trombe: 'tp', trombone: 'tb', trombonebasso: 'tb', timpani: 'timp', violin1: 'vln1', violin2: 'vln2', flute: 'fl', oboe: 'ob', clarinet: 'cl', bassoon: 'fg', trombone: 'tb', corni_first: 'hn', corni_second: 'hn', corni: 'hn', trombe: 'tp', tenor_trombone: 'tb', bass_trombone: 'tb', violin_one: 'vln1', violin_two: 'vln2', violincello: 'vc', contrabass: 'cb', viole: 'vla', violoncellostaff: 'vc', contrabassostaff: 'cb', frenchhorna: 'hn', frenchhornb: 'hn', trumpet: 'tp', cello: 'vc', bass: 'cb', violino1: 'vln1', violinoi: 'vln1', violino2: 'vln2', violinoii: 'vln2', viola: 'vla', violoncello: 'vc', contrabasso: 'cb' };
// Each piece: midi files (concatenated in order), tracks: { fileIndex: { trackIndex: section } }, tempo overrides, excerpt (in quarter notes of the merged timeline).
// `derive`: extra sections made from another one (e.g. double basses doubling the cellos an octave lower in a piece whose MIDI has no bass part).
const PIECES = [
  { id: 'beethoven5', mutopia: 941, level: 3, mvt: { ja: '第1楽章', en: 'I. Allegro con brio' },
    title: { ja: '交響曲 第5番 ハ短調 作品67', en: 'Symphony No. 5 in C minor, Op. 67' }, composer: { ja: 'ベートーヴェン', en: 'Beethoven' }, year: 1808,
    midi: ['Symphony5_1.mid'], tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tp', 7: 'timp', 8: 'vln1', 9: 'vln2', 10: 'vla', 11: 'vc', 12: 'cb' }],
    excerpt: [0, 760], blurb: { ja: '「運命」の動機で始まる、あまりにも有名な楽章。出だしの一振りと、ホルンの呼び出しがヤマ場。', en: 'The famous four-note motto. Your first downbeat and the horn call are the big moments.' } },
  { id: 'beethoven7', mutopia: 595, level: 2, mvt: { ja: '第2楽章', en: 'II. Allegretto' },
    title: { ja: '交響曲 第7番 イ長調 作品92', en: 'Symphony No. 7 in A major, Op. 92' }, composer: { ja: 'ベートーヴェン', en: 'Beethoven' }, year: 1812,
    midi: ['Symphony7_2.mid'], tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tp', 7: 'timp', 8: 'vln1', 9: 'vln2', 10: 'vla', 11: 'vc', 12: 'cb' }],
    excerpt: [0, 300], blurb: { ja: '低弦から静かに積み上がり、少しずつ大きくなる行進曲。クレッシェンドの練習にぴったり。', en: 'A hushed march that grows from the low strings. Perfect for practising a long crescendo.' } },
  { id: 'nachtmusik', mutopia: 2230, level: 1, mvt: { ja: '第1楽章', en: 'I. Allegro' },
    title: { ja: 'アイネ・クライネ・ナハトムジーク K.525', en: 'Eine kleine Nachtmusik, K.525' }, composer: { ja: 'モーツァルト', en: 'Mozart' }, year: 1787,
    midi: ['MozartWA-KV525-mov-01.mid'], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], derive: [{ from: 'vc', to: 'cb', transpose: -12 }],
    excerpt: [0, 548], blurb: { ja: '弦楽だけのやさしい一曲。テンポを安定させる練習に。', en: 'Strings only and friendly: a good first piece for keeping the tempo steady.' } },
  { id: 'zauberflote', mutopia: 248, level: 2, mvt: { ja: 'アダージョ〜アレグロ', en: 'Adagio, Allegro' },
    title: { ja: '歌劇《魔笛》序曲 K.620', en: 'The Magic Flute, Overture, K.620' }, composer: { ja: 'モーツァルト', en: 'Mozart' }, year: 1791,
    midi: ['magicflute-00-overture-mids/adagioIscore.mid', 'magicflute-00-overture-mids/allegroIscore.mid'],
    tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tp', 7: 'tb', 8: 'tb', 9: 'timp', 10: 'vln1', 11: 'vln2', 12: 'vla', 13: 'vc', 14: 'cb' }, { 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tp', 7: 'tb', 8: 'tb', 9: 'timp', 10: 'vln1', 11: 'vln2', 12: 'vla', 13: 'vc', 14: 'cb' }],
    byName: true, excerpt: [0, 1000],
    blurb: { ja: '3つの和音ではじまるゆっくりした導入と、駆けぬける弦のアレグロ。入りのキューが多め。', en: 'Three solemn chords, then a racing string allegro. Lots of entrances to cue.' } },
  // ---- Dvořák 7 (Mutopia 1901, Public Domain, all four movements; the files are the LilyPond MIDI of J.-F. Lucarelli's engraving) and Dvořák 9 (Mutopia 1793, CC BY-SA 3.0) ----
  { id: 'dvorak7-1', mutopia: 1901, level: 3, mvt: { ja: '第1楽章 アレグロ・マエストーソ', en: 'I. Allegro maestoso' }, parts: 2,
    title: { ja: '交響曲 第7番 ニ短調 作品70', en: 'Symphony No. 7 in D minor, Op. 70' }, composer: { ja: 'ドヴォルザーク', en: 'Dvořák' }, year: 1885, work: 'dvorak7',
    midi: ['DvorakSYMPH7-mids/DvorakSYMPH7_conductor.mid'], tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tb', 7: 'tb', 8: 'timp', 9: 'vln1', 10: 'vln2', 11: 'vla', 12: 'vc', 13: 'cb', 14: 'hn', 15: 'tp' }],
    blurb: { ja: '低弦とホルンの暗いささやきから、大きな嵐へ。長い楽章なので前半・後半に分けて指揮もできます。', en: 'From a dark murmur of low strings and horn to a great storm. A long movement: conduct it whole or in two halves.' } },
  { id: 'dvorak7-2', mutopia: 1901, level: 2, mvt: { ja: '第2楽章 ポコ・アダージョ', en: 'II. Poco adagio' }, parts: 2,
    title: { ja: '交響曲 第7番 ニ短調 作品70', en: 'Symphony No. 7 in D minor, Op. 70' }, composer: { ja: 'ドヴォルザーク', en: 'Dvořák' }, year: 1885, work: 'dvorak7',
    midi: ['DvorakSYMPH7-mids/DvorakSYMPH7_conductor-1.mid'], tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'tb', 6: 'tb', 7: 'vln1', 8: 'vln2', 9: 'vla', 10: 'vc', 11: 'cb', 12: 'hn', 13: 'hn', 14: 'tp', 15: 'timp' }],
    blurb: { ja: 'ゆっくり歌う、深く温かい緩徐楽章。4つ振りで息の長いクレッシェンドを。', en: 'A slow, warm and deeply felt movement in four. Long breaths and long crescendos.' } },
  { id: 'dvorak7', mutopia: 1901, level: 3, mvt: { ja: '第3楽章 スケルツォ', en: 'III. Scherzo (Vivace)' }, parts: 2,
    title: { ja: '交響曲 第7番 ニ短調 作品70', en: 'Symphony No. 7 in D minor, Op. 70' }, composer: { ja: 'ドヴォルザーク', en: 'Dvořák' }, year: 1885, work: 'dvorak7',
    midi: ['DvorakSYMPH7-mids/DvorakSYMPH7_conductor-2.mid'], tracks: [{ 1: 'fl', 2: 'fl', 3: 'ob', 4: 'cl', 5: 'fg', 6: 'vln1', 7: 'vln2', 8: 'vla', 9: 'vc', 10: 'vc', 11: 'cb', 12: 'hn', 13: 'hn', 14: 'tp', 15: 'timp' }],
    blurb: { ja: '弾むリズムのスケルツォ。木管、金管が次々に入ってくるので、キューの腕の見せどころ。', en: 'A bouncing scherzo with winds and brass entering one after another: your cueing is the star.' } },
  { id: 'dvorak7-4', mutopia: 1901, level: 3, mvt: { ja: '第4楽章 フィナーレ', en: 'IV. Finale (Allegro)' }, parts: 2,
    title: { ja: '交響曲 第7番 ニ短調 作品70', en: 'Symphony No. 7 in D minor, Op. 70' }, composer: { ja: 'ドヴォルザーク', en: 'Dvořák' }, year: 1885, work: 'dvorak7',
    midi: ['DvorakSYMPH7-mids/DvorakSYMPH7_conductor-3.mid'], tracks: [{ 1: 'fl', 2: 'fl', 3: 'ob', 4: 'cl', 5: 'fg', 6: 'hn', 7: 'tb', 8: 'tb', 9: 'vln1', 10: 'vln2', 11: 'vla', 12: 'vc', 13: 'cb', 14: 'hn', 15: 'timp', 16: 'tp' }],
    blurb: { ja: '力強い主題で駆けぬけるフィナーレ。速い2つ振りで、最後の盛り上がりまで。', en: 'A driving finale in two. Keep the fast beat steady all the way to the blaze at the end.' } },
  ...[['1', '第1楽章 アダージョ ― アレグロ・モルト', 'I. Adagio - Allegro molto', 3, 'Mvt1_Adagio.mid', 'ゆっくりした序奏のあと、一気に主部へ。テンポの切り替えが見せ場。', 'A slow introduction, then the Allegro bursts in. The tempo change is the highlight.'],
    ['2', '第2楽章 ラルゴ', 'II. Largo', 1, 'Mvt2_Largo.mid', '「家路」の名で知られる、イングリッシュホルンの歌。静かな和音と長い息づかいを。（このMIDIにはコーラングレの専用パートがなく、旋律はオーボエ／クラリネットの音で鳴ります）', 'The famous "Going Home" melody. Hushed chords and long breaths. (The Mutopia MIDI has no separate English-horn part; the tune sounds on the oboe / clarinet samples.)'],
    ['3', '第3楽章 スケルツォ（モルト・ヴィヴァーチェ）', 'III. Scherzo (Molto vivace)', 3, 'Mvt3_Scherzo.mid', '3拍子の速いスケルツォ。1小節を1つ振りで。（トライアングルは音源がないため省いています）', 'A fast scherzo in three, conducted one beat per bar. (The triangle is left out: no sample.)'],
    ['4', '第4楽章 アレグロ・コン・フオーコ', 'IV. Allegro con fuoco', 3, 'Mvt4_conFuoco.mid', '「新世界」の大きな終楽章。4つ振りで、金管の主題を堂々と。（シンバルの1音は省いています）', 'The grand finale of the "New World", in four with the big brass theme. (The single cymbal crash is left out.)']].map(([n, ja, en, lvl, f, bj, be]) => ({
    id: 'dvorak9-' + n, mutopia: 1793, level: lvl, mvt: { ja, en }, parts: n === '1' || n === '4' ? 2 : 0, work: 'dvorak9', licence: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    credit: 'Mutopia Project, piece 1793 (typeset with LilyPond, maintainer Keith OHara; source: N. Simrock, 1894), CC BY-SA 3.0',
    title: { ja: '交響曲 第9番 ホ短調 作品95「新世界より」', en: 'Symphony No. 9 in E minor, Op. 95 "From the New World"' }, composer: { ja: 'ドヴォルザーク', en: 'Dvořák' }, year: 1893,
    midi: ['Dvorak9-mids/' + f], byName: true, tracks: [{}], blurb: { ja: bj, en: be } })),
  // ---- Dvořák 8 (MuseScore.com user 194052, set 5098438; supplied by the owner as a MIDI export; licence CC0 as read by the owner from the MuseScore page, see CREDITS.md) ----
  { id: 'dvorak8-1', level: 3, mvt: { ja: '第1楽章 アレグロ・コン・ブリオ', en: 'I. Allegro con brio' }, parts: 2, work: 'dvorak8',
    musescore: { user: 194052, set: 5098438, url: null }, licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    credit: 'MuseScore.com user 194052, set 5098438 (CC0), URL pending',
    title: { ja: '交響曲 第8番 ト長調 作品88', en: 'Symphony No. 8 in G major, Op. 88' }, composer: { ja: 'ドヴォルザーク', en: 'Dvořák' }, year: 1889,
    midi: ['Dvorak8-mids/Dvorak8_Mvt1_AllegroConBrio.mid'],
    // the file has no track names and non-GM program numbers: the order is the full-score order (see CREDITS.md for the evidence); track 19 is empty
    tracks: [{ 0: 'fl', 1: 'fl', 2: 'ob', 3: 'ob', 4: 'cl', 5: 'cl', 6: 'fg', 7: 'fg', 8: 'hn', 9: 'hn', 10: 'hn', 11: 'hn', 12: 'tp', 13: 'tp', 14: 'tb', 15: 'tb', 16: 'tb', 17: 'tu', 18: 'timp', 20: 'vln1', 21: 'vln2', 22: 'vla', 23: 'vc', 24: 'cb' }],
    blurb: { ja: 'チェロとホルンの暗い序奏から、フルートの鳥の歌へ。テンポがよく動く楽章なので、指揮の変化が見せ場。', en: 'A dark opening for cellos and horns, then the flute\'s bird-like song. The tempo moves a lot: a showcase for flexible conducting.' } },
  { id: 'dvorak8-4', level: 3, mvt: { ja: '第4楽章 アレグロ・マ・ノン・トロッポ', en: 'IV. Allegro ma non troppo' }, parts: 2, work: 'dvorak8',
    musescore: { user: 194052, urls: ['https://musescore.com/user/194052/scores/5379777', 'https://musescore.com/user/194052/scores/5379779', 'https://musescore.com/user/194052/scores/5379782'] }, licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    credit: 'MuseScore.com user 194052 (CC0): one of musescore.com/user/194052/scores/5379777, 5379779, 5379782 (movements II-IV; which page is which is not confirmed)',
    title: { ja: '交響曲 第8番 ト長調 作品88', en: 'Symphony No. 8 in G major, Op. 88' }, composer: { ja: 'ドヴォルザーク', en: 'Dvořák' }, year: 1889,
    midi: ['Dvorak8-mids/Dvorak8_Mvt4_Finale.mid'],
    tracks: [{ 0: 'fl', 1: 'fl', 2: 'ob', 3: 'ob', 4: 'cl', 5: 'cl', 6: 'fg', 7: 'fg', 8: 'hn', 9: 'hn', 10: 'hn', 11: 'hn', 12: 'tp', 13: 'tp', 14: 'tb', 15: 'tb', 16: 'tb', 17: 'tu', 18: 'timp', 20: 'vln1', 21: 'vln2', 22: 'vla', 23: 'vc', 24: 'cb' }],
    blurb: { ja: 'トランペットのファンファーレで始まる変奏曲形式のフィナーレ。テンポが細かく変わるので、拍を聴き合わせて。', en: 'A theme-and-variations finale that opens with a trumpet fanfare. The tempo shifts often: listen and follow.' } },
  // ---- more Public Domain Mutopia orchestral pieces (licence checked on each piece page, 2026-11-25) ----
  { id: 'coriolan', mutopia: 57, level: 3, bpmMax: 156, parts: 2, mvt: { ja: '序曲', en: 'Overture' }, byName: true, tracks: [{}], midi: ['Coriolan-mids/coriolan.mid'],
    title: { ja: '《コリオラン》序曲 作品62', en: 'Coriolan Overture, Op. 62' }, composer: { ja: 'ベートーヴェン', en: 'Beethoven' }, year: 1807,
    blurb: { ja: '力強い全奏の一撃から始まる、ハ短調の劇的な序曲。4つ振りで速いので、バトンをしっかり。', en: 'A dramatic C-minor overture that opens with hammer-blow chords. Fast in four: keep the baton firm.' } },
  { id: 'fidelio', mutopia: 377, level: 3, bpmMax: 142, mvt: { ja: '序曲', en: 'Overture' }, byName: true, tracks: [{}], midi: ['Fidelio-mids/fidelio.mid'],
    title: { ja: '歌劇《フィデリオ》序曲 作品72b', en: 'Fidelio Overture, Op. 72b' }, composer: { ja: 'ベートーヴェン', en: 'Beethoven' }, year: 1814,
    blurb: { ja: 'ホルンの呼び声から駆けぬけるアレグロ。ティンパニと管の入りがたくさん。', en: 'A horn call, then a racing Allegro. Lots of timpani and wind entrances to cue.' } },
  { id: 'mozart25-1', mutopia: 1380, level: 2, bpmMax: 156, mvt: { ja: '第1楽章 アレグロ・コン・ブリオ', en: 'I. Allegro con brio' }, parts: 2, work: 'mozart25',
    title: { ja: '交響曲 第25番 ト短調 K.183', en: 'Symphony No. 25 in G minor, K.183' }, composer: { ja: 'モーツァルト', en: 'Mozart' }, year: 1773,
    midi: ['Symphony25_1.mid'], tracks: [{ 1: 'ob', 2: 'hn', 3: 'hn', 4: 'vln1', 5: 'vln2', 6: 'vla', 7: 'vc' }], derive: [{ from: 'vc', to: 'cb', transpose: -12 }],
    blurb: { ja: '「小ト短調」と呼ばれる、疾走するシンコペーション。速い4つ振りで。', en: 'The "little G minor": surging syncopations, in a fast four.' } },
  { id: 'mozart25-2', mutopia: 1381, level: 1, mvt: { ja: '第2楽章 アンダンテ', en: 'II. Andante' }, work: 'mozart25',
    title: { ja: '交響曲 第25番 ト短調 K.183', en: 'Symphony No. 25 in G minor, K.183' }, composer: { ja: 'モーツァルト', en: 'Mozart' }, year: 1773,
    midi: ['Symphony25_2.mid'], tracks: [{ 1: 'ob', 2: 'fg', 3: 'hn', 4: 'vln1', 5: 'vln2', 6: 'vla', 7: 'vc' }], derive: [{ from: 'vc', to: 'cb', transpose: -12 }],
    blurb: { ja: 'ゆったりしたアンダンテ。弱音器つきの弦のやさしい歌。', en: 'A gentle Andante: a soft song for the strings.' } },
  { id: 'beethoven5-2', mutopia: 1437, level: 2, mvt: { ja: '第2楽章 アンダンテ・コン・モート', en: 'II. Andante con moto' }, parts: 2, work: 'beethoven5',
    title: { ja: '交響曲 第5番 ハ短調 作品67', en: 'Symphony No. 5 in C minor, Op. 67' }, composer: { ja: 'ベートーヴェン', en: 'Beethoven' }, year: 1808,
    midi: ['Symphony5_2.mid'], tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tp', 7: 'timp', 8: 'vln1', 9: 'vln2', 10: 'vla', 11: 'vc', 12: 'cb' }],
    blurb: { ja: 'ヴィオラとチェロの歌ではじまる変奏曲。3つ振りの流れるテンポで。', en: 'Variations that begin with violas and cellos singing. A flowing three.' } },
  { id: 'beethoven7-1', mutopia: 891, level: 3, mvt: { ja: '第1楽章 ポコ・ソステヌート ― ヴィヴァーチェ', en: 'I. Poco sostenuto - Vivace' }, parts: 3, work: 'beethoven7',
    title: { ja: '交響曲 第7番 イ長調 作品92', en: 'Symphony No. 7 in A major, Op. 92' }, composer: { ja: 'ベートーヴェン', en: 'Beethoven' }, year: 1812,
    midi: ['Symphony7_1.mid'], tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'tp', 7: 'timp', 8: 'vln1', 9: 'vln2', 10: 'vla', 11: 'vc', 12: 'cb' }],
    blurb: { ja: 'ゆっくりした4つ振りの序奏から、踊るような6/8のヴィヴァーチェへ。', en: 'A slow introduction in four, then the dancing 6/8 Vivace.' } },
  // ---- chamber and small-ensemble pieces from Mutopia (Public Domain, licence checked on each piece page 2026-11-25); the parts sit on the string / wind sections ----
  { id: "beethoven-q4-1", mutopia: 790, level: 2, bpmMax: 142, mvt: { ja: "第1楽章 アレグロ・マ・ノン・タント", en: "I. Allegro ma non tanto" }, work: "beethoven-q4", title: { ja: "弦楽四重奏曲 第4番 ハ短調 作品18-4", en: "String Quartet No. 4 in C minor, Op. 18 No. 4" }, composer: { ja: "ベートーヴェン", en: "Beethoven" }, year: 1801, midi: ["Chamber/QuartetOpus18_No4_1.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "ハ短調の緊張感ある弦楽四重奏。四つの声部が順に入ってくるので、入りのキューを。", en: "A tense C-minor string quartet: the four voices enter one after another. Cue them in." } },
  { id: "beethoven-q4-2", mutopia: 791, level: 1, mvt: { ja: "第2楽章 アンダンテ・スケルツォーソ", en: "II. Andante scherzoso quasi allegretto" }, work: "beethoven-q4", title: { ja: "弦楽四重奏曲 第4番 ハ短調 作品18-4", en: "String Quartet No. 4 in C minor, Op. 18 No. 4" }, composer: { ja: "ベートーヴェン", en: "Beethoven" }, year: 1801, midi: ["Chamber/QuartetOpus18_No4_2.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "軽やかなフーガ風の3つ振り。", en: "A light, fugal movement in three." } },
  { id: "beethoven-q4-3", mutopia: 792, level: 1, mvt: { ja: "第3楽章 メヌエット", en: "III. Menuetto" }, work: "beethoven-q4", title: { ja: "弦楽四重奏曲 第4番 ハ短調 作品18-4", en: "String Quartet No. 4 in C minor, Op. 18 No. 4" }, composer: { ja: "ベートーヴェン", en: "Beethoven" }, year: 1801, midi: ["Chamber/QuartetOpus18_No4_3.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "速いメヌエット。1小節を1つ振りで。", en: "A brisk minuet, one beat to the bar." } },
  { id: "beethoven-q4-4", mutopia: 793, level: 3, mvt: { ja: "第4楽章 アレグロ ― プレスティッシモ", en: "IV. Allegro - Prestissimo" }, work: "beethoven-q4", title: { ja: "弦楽四重奏曲 第4番 ハ短調 作品18-4", en: "String Quartet No. 4 in C minor, Op. 18 No. 4" }, composer: { ja: "ベートーヴェン", en: "Beethoven" }, year: 1801, midi: ["Chamber/QuartetOpus18_No4_4.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "ロンド形式のフィナーレ。最後は猛スピード。", en: "A rondo finale that ends at breakneck speed." } },
  { id: "schubert-qs", mutopia: 1196, level: 2, mvt: { ja: "四重奏断章 ハ短調 D.703", en: "Quartettsatz in C minor, D.703" }, title: { ja: "弦楽四重奏曲 第12番《四重奏断章》", en: "String Quartet No. 12 \"Quartettsatz\"" }, composer: { ja: "シューベルト", en: "Schubert" }, year: 1820, midi: ["Chamber/SchubertF-D703-Quartettsatz.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "ざわめく刻みの上に歌がうたわれる名作。6/8は2つ振りで。", en: "Schubert's surging single movement: a song over restless pulses. Conduct the 6/8 in two." } },
  { id: "grieg-aase", mutopia: 247, level: 1, mvt: { ja: "オーゼの死", en: "Aase's Death" }, title: { ja: "《ペール・ギュント》第1組曲 作品46", en: "Peer Gynt Suite No. 1, Op. 46" }, composer: { ja: "グリーグ", en: "Grieg" }, year: 1875, midi: ["Chamber/aasesdeath.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc', 5: 'cb' }], blurb: { ja: "悲しみに満ちたゆっくりした4つ振り。長いクレッシェンドが見せ場。", en: "A grieving slow four with a long, aching crescendo." } },
  { id: "beethoven-marsch", mutopia: 991, level: 2, mvt: { ja: "行進曲 ハ長調 WoO 29", en: "March in C, WoO 29" }, title: { ja: "行進曲 WoO 29", en: "March, WoO 29" }, composer: { ja: "ベートーヴェン", en: "Beethoven" }, year: 1809, midi: ["Chamber/marsch_woo29.mid"], tracks: [{ 1: 'cl', 2: 'hn', 3: 'fg' }], blurb: { ja: "管楽器だけの小さな行進曲（クラリネット・ホルン・ファゴットの3声部）。", en: "A little march for winds only (clarinet, horn and bassoon parts of the Mutopia reduction)." } },
  { id: "haydn76-1-1", mutopia: 383, level: 2, mvt: { ja: "第1楽章 アレグロ・コン・スピリート", en: "I. Allegro con spirito" }, work: "haydn76-1", title: { ja: "弦楽四重奏曲 ト長調 作品76-1", en: "String Quartet in G major, Op. 76 No. 1" }, composer: { ja: "ハイドン", en: "Haydn" }, year: 1797, midi: ["Chamber/Haydn_Op76_1_mvt1.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "エネルギッシュな2つ振り。", en: "An energetic two-in-a-bar." } },
  { id: "haydn76-1-4", mutopia: 383, level: 3, mvt: { ja: "第4楽章 アレグロ・マ・ノン・トロッポ", en: "IV. Allegro ma non troppo" }, work: "haydn76-1", title: { ja: "弦楽四重奏曲 ト長調 作品76-1", en: "String Quartet in G major, Op. 76 No. 1" }, composer: { ja: "ハイドン", en: "Haydn" }, year: 1797, midi: ["Chamber/Haydn_Op76_1_mvt4.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "明るく駆けぬける終楽章。", en: "A bright, running finale." } },
  { id: "haydn76-1-2", mutopia: 383, level: 1, mvt: { ja: "第2楽章 アダージョ・ソステヌート", en: "II. Adagio sostenuto" }, work: "haydn76-1", title: { ja: "弦楽四重奏曲 ト長調 作品76-1", en: "String Quartet in G major, Op. 76 No. 1" }, composer: { ja: "ハイドン", en: "Haydn" }, year: 1797, midi: ["Chamber/Haydn_Op76_1_mvt2.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "とてもゆっくりした祈りのような楽章。", en: "A very slow, prayer-like movement." } },
  { id: "mozart387-1", mutopia: 245, level: 2, mvt: { ja: "第1楽章 アレグロ・ヴィヴァーチェ・アッサイ", en: "I. Allegro vivace assai" }, work: "mozart387", title: { ja: "弦楽四重奏曲 第14番 ト長調 K.387《春》", en: "String Quartet No. 14 in G major, K.387" }, composer: { ja: "モーツァルト", en: "Mozart" }, year: 1782, midi: ["Chamber/Mozart_K387_mvt1.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "ト長調の軽やかな4つ振り。", en: "A buoyant four in G major." } },
  { id: "mozart387-2", mutopia: 245, level: 1, mvt: { ja: "第2楽章 メヌエット", en: "II. Menuetto: Allegro" }, work: "mozart387", title: { ja: "弦楽四重奏曲 第14番 ト長調 K.387《春》", en: "String Quartet No. 14 in G major, K.387" }, composer: { ja: "モーツァルト", en: "Mozart" }, year: 1782, midi: ["Chamber/Mozart_K387_mvt2.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "堂々としたメヌエット。", en: "A stately minuet." } },
  { id: "mozart387-3", mutopia: 245, level: 1, mvt: { ja: "第3楽章 アンダンテ・カンタービレ", en: "III. Andante cantabile" }, work: "mozart387", title: { ja: "弦楽四重奏曲 第14番 ト長調 K.387《春》", en: "String Quartet No. 14 in G major, K.387" }, composer: { ja: "モーツァルト", en: "Mozart" }, year: 1782, midi: ["Chamber/Mozart_K387_mvt3.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "ゆっくり歌う緩徐楽章。", en: "A singing slow movement." } },
  { id: "mozart387-4", mutopia: 245, level: 3, mvt: { ja: "第4楽章 モルト・アレグロ", en: "IV. Molto allegro" }, work: "mozart387", title: { ja: "弦楽四重奏曲 第14番 ト長調 K.387《春》", en: "String Quartet No. 14 in G major, K.387" }, composer: { ja: "モーツァルト", en: "Mozart" }, year: 1782, midi: ["Chamber/Mozart_K387_mvt4.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "フーガ風の主題で駆けぬける終楽章。", en: "A finale racing along with fugal themes." } },
  { id: "beethoven-q59-3", mutopia: 1041, level: 2, mvt: { ja: "第2楽章 アンダンテ・コン・モート・クワジ・アレグレット", en: "II. Andante con moto quasi allegretto" }, title: { ja: "弦楽四重奏曲 第9番 ハ長調 作品59-3《ラズモフスキー第3番》", en: "String Quartet No. 9 in C major, Op. 59 No. 3" }, composer: { ja: "ベートーヴェン", en: "Beethoven" }, year: 1806, midi: ["Chamber/Beethoven_Op59_3_mvt2.mid"], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc' }], blurb: { ja: "ささやくようなピツィカートの上に哀しい旋律。6/8を2つ振りで。", en: "A sad melody over whispering pizzicato; the 6/8 in two." } },
  // ---- Dvořák 8, III: a 5-part reduction (4 accordions + bass accordion) by Paul De Bra, IMSLP PMLP8825, CC BY 4.0; spread over the orchestra by doubling ----
  { id: 'dvorak8-3', level: 2, tempoScale: 50 / 60, bpmMin: 36, work: 'dvorak8', simplified: true,
    mvt: { ja: '第3楽章 アレグレット・グラツィオーソ（簡略版：5声部の編曲）', en: 'III. Allegretto grazioso (simplified: 5-part arrangement)' },
    imslp: 'https://imslp.org/wiki/Symphony_No.8,_Op.88_(Dvo%C5%99%C3%A1k,_Anton%C3%ADn)', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    credit: 'Arrangement: Paul De Bra, 2025, CC BY 4.0, IMSLP (composition: Dvořák, public domain)',
    title: { ja: '交響曲 第8番 ト長調 作品88', en: 'Symphony No. 8 in G major, Op. 88' }, composer: { ja: 'ドヴォルザーク', en: 'Dvořák' }, year: 1889,
    midi: ['Dvorak8-mids/Dvorak8_Mvt3_DeBra_arr.mid'], tracks: [{ 1: 'vln1', 2: 'vln2', 3: 'vla', 4: 'vc', 5: 'cb' }],
    derive: [{ from: 'vln1', to: 'fl', transpose: 0 }, { from: 'vln2', to: 'ob', transpose: 0 }, { from: 'vln2', to: 'cl', transpose: 0 }, { from: 'vla', to: 'hn', transpose: 0 }, { from: 'vc', to: 'fg', transpose: 0 }],
    blurb: { ja: '優雅な3/8のワルツ。5声部に縮めた編曲（簡略版）を、オーケストラ全体に振り分けて鳴らします。1小節を1つ振りで。', en: 'The graceful 3/8 waltz, played from a 5-part arrangement spread over the whole orchestra (simplified version). One beat to the bar.' } },
  { id: 'midsummer', mutopia: 80, level: 2, mvt: { ja: '間奏曲（No.5）', en: 'Intermezzo (No. 5)' },
    title: { ja: '劇音楽《真夏の夜の夢》 作品61', en: 'A Midsummer Night\'s Dream, Op. 61' }, composer: { ja: 'メンデルスゾーン', en: 'Mendelssohn' }, year: 1843,
    midi: ['Sommernachtstraum-mids/Sommernachtstraum.mid'], tracks: [{ 1: 'fl', 2: 'ob', 3: 'cl', 4: 'fg', 5: 'hn', 6: 'vln1', 7: 'vln2', 8: 'vla', 9: 'vc', 10: 'cb' }],
    excerpt: [0, 421], blurb: { ja: '妖精がかけまわるような6/8拍子。ふたつ振りで軽く。', en: 'A fairy-footed 6/8. Conduct it in two, light and quick.' } },
  { id: 'rossini', mutopia: 1634, level: 3, mvt: { ja: '序曲', en: 'Overture' },
    title: { ja: '歌劇《エドゥアルドとクリスティーナ》序曲', en: 'Eduardo e Cristina, Overture' }, composer: { ja: 'ロッシーニ', en: 'Rossini' }, year: 1819,
    midi: ['Eduardo_e_Cristina.mid'], tempoOverride: [[0, 66], [76.25, 120]],
    tracks: [{ 1: 'fl', 2: 'fl', 3: 'ob', 4: 'cl', 5: 'fg', 6: 'hn', 7: 'tp', 8: 'tb', 9: 'tb', 10: 'timp', 11: 'perc', 12: 'vln1', 13: 'vla', 14: 'vc' }],
    derive: [{ from: 'vc', to: 'cb', transpose: -12 }, { from: 'vln1', to: 'vln2', transpose: 0 }],
    excerpt: [0, 470], blurb: { ja: 'ゆっくりした導入のあと、一気に加速するロッシーニ・クレッシェンド。', en: 'A slow introduction, then the famous Rossini crescendo.' } },
  { id: 'egmont', mutopia: 547, level: 3, mvt: { ja: '序曲', en: 'Overture' },
    title: { ja: '《エグモント》序曲 作品84', en: 'Egmont Overture, Op. 84' }, composer: { ja: 'ベートーヴェン', en: 'Beethoven' }, year: 1810,
    midi: ['Egmont.mid'], tracks: [{ 1: 'fl', 2: 'fl', 3: 'ob', 4: 'cl', 5: 'fg', 6: 'hn', 7: 'hn', 8: 'tp', 9: 'timp', 10: 'vln1', 11: 'vln2', 12: 'vla', 13: 'vc', 14: 'cb' }],
    excerpt: [0, 640], blurb: { ja: '重々しい序奏から、嵐のような主部へ。拍子もテンポも変わる、腕だめしの一曲。', en: 'A heavy introduction that turns into a storm. Changing meters and tempos: a test of your baton.' } },
];

// ------------------------------------------------------------------------------------------------------------------------------------------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function load(file) { return M.parse(new Uint8Array(fs.readFileSync(path.join(SRC, file)))); }

function tempoAt(tempos, q) { let b = 120; for (const t of tempos) { if (t.q > q + 1e-9) break; b = t.bpm; } return b; }

function build(P) {
  const files = P.midi.map(load);
  let off = 0; const notes = []; const sigs = []; const tempos = [];
  files.forEach((mf, fi) => {
    const map = P.tracks[fi] || P.tracks[0], k = PPQ / mf.division;
    mf.tracks.forEach((tr, ti) => {
      const sec = P.byName ? NAMES[tr.name.toLowerCase().replace(/:.*$/, '').replace(/\s+/g, '')] : map[ti]; if (!sec) return;
      M.notes(tr).forEach(n => notes.push({ sec, tick: Math.round(n.tick * k) + off, dur: Math.max(1, Math.round(n.dur * k)), pitch: n.note, vel: n.vel }));
    });
    mf.timeSigs.forEach(s => sigs.push({ tick: Math.round(s.tick * k) + off, num: s.num, den: s.den }));
    let last = -1; mf.tempos.forEach(t => { const tk = Math.round(t.tick * k) + off; if (t.tick === 0 && last === 0) tempos.pop(); tempos.push({ q: tk / PPQ, bpm: 6e7 / t.uspq }); last = t.tick; });
    off += Math.round(mf.endTick * k);
  });
  if (P.tempoScale) tempos.forEach(t => { t.bpm *= P.tempoScale; }); // the written tempo is slower in the original score
  if (P.tempoOverride) { tempos.length = 0; P.tempoOverride.forEach(([q, bpm]) => tempos.push({ q, bpm })); }
  tempos.sort((a, b) => a.q - b.q);
  sigs.sort((a, b) => a.tick - b.tick);
  // derived sections
  (P.derive || []).forEach(d => {
    const src = notes.filter(n => n.sec === d.from);
    if (!src.length) return;
    if (notes.some(n => n.sec === d.to)) return; // the file has that part already
    src.forEach(n => notes.push({ sec: d.to, tick: n.tick, dur: n.dur, pitch: Math.max(28, n.pitch + d.transpose), vel: n.vel }));
  });
  const from = P.excerpt ? Math.round(P.excerpt[0] * PPQ) : 0, to = P.excerpt ? Math.round(P.excerpt[1] * PPQ) : Infinity; // no excerpt = the whole movement

  // ---- bars -> conductor beats ---------------------------------------------------------------------------------------------------------
  const bars = []; // { tick, q, beats, unit(q), bpm }
  let sg = 0, cur = sigs[0] || { tick: 0, num: 4, den: 4 };
  for (let tick = 0; tick < Math.min(off, to + PPQ * 40);) {
    while (sg + 1 < sigs.length && sigs[sg + 1].tick <= tick) cur = sigs[++sg];
    const barQ = cur.num * 4 / cur.den, q = tick / PPQ, T = tempoAt(tempos, q);
    let unit = cur.den === 8 && cur.num % 3 === 0 && cur.num >= 6 ? 1.5 : cur.den === 4 && cur.num % 3 === 0 && cur.num >= 6 ? 3 : cur.den === 2 ? 2 : cur.den === 8 ? 0.5 : 1;
    let beats = Math.round(barQ / unit);
    for (let guard = 0; guard < 6; guard++) {
      const bpm = T / unit;
      if (beats > 4 && beats % 3 === 0) { unit *= beats / 3; beats = 3; continue; }
      if (beats > 4 && beats % 2 === 0) { unit *= 2; beats /= 2; continue; }
      if (bpm > (P.bpmMax || BPM_MAX) && beats % 2 === 0) { unit *= 2; beats /= 2; continue; }
      if (bpm > (P.bpmMax || BPM_MAX) && beats === 3) { unit *= 3; beats = 1; continue; }
      if (bpm < BPM_MIN && unit >= 1 && beats * 2 <= 4) { unit /= 2; beats *= 2; continue; }
      break;
    }
    bars.push({ tick, q, beats, unit, bpm: Math.max(T / unit, P.bpmMin || 0), barQ });
    tick += Math.round(barQ * PPQ);
  }
  // keep only the bars of the excerpt; beat 0 = first beat of the first kept bar
  const kept = bars.filter(b => b.tick >= from && b.tick < to);
  if (!kept.length) throw new Error(P.id + ': empty excerpt');
  const t0 = kept[0].tick, tEnd = kept[kept.length - 1].tick + Math.round(kept[kept.length - 1].barQ * PPQ);
  // beat positions (in ticks) of each conductor beat
  const beatTick = [], beatBpm = [], beatInBar = [];
  kept.forEach(b => { for (let i = 0; i < b.beats; i++) { beatTick.push(b.tick - t0 + Math.round(i * b.unit * PPQ)); beatBpm.push(b.bpm); beatInBar.push(i); } });
  const nBeats = beatTick.length;
  // run-length grid: [startTick, nBars, beatsPerBar, beatTicks]
  const grid = [];
  kept.forEach(b => { const bt = Math.round(b.unit * PPQ), last = grid[grid.length - 1]; if (last && last[2] === b.beats && last[3] === bt) last[1]++; else grid.push([b.tick - t0, 1, b.beats, bt]); });

  // ---- notes of the excerpt --------------------------------------------------------------------------------------------------------------
  const secOrder = ['fl', 'ob', 'cl', 'fg', 'hn', 'tp', 'tb', 'tu', 'timp', 'perc', 'vln1', 'vln2', 'vla', 'vc', 'cb'];
  const bySec = {};
  notes.forEach(n => {
    if (n.tick >= tEnd || n.tick + n.dur <= t0 || n.tick < t0 && n.tick + n.dur <= t0) return;
    const on = Math.max(n.tick, t0) - t0, off2 = Math.min(n.tick + n.dur, tEnd) - t0;
    if (n.tick < t0) return; // notes that started before the excerpt are dropped
    (bySec[n.sec] = bySec[n.sec] || []).push({ tick: on, dur: Math.max(1, off2 - on), pitch: n.pitch, vel: n.vel });
  });
  // quarter-note length in seconds at the guide tempo near a tick (for the short-note rule)
  const secPerTick = tick => 60 / tempoAt(tempos, (tick + t0) / PPQ) / PPQ;
  const sections = [], needs = {};
  secOrder.forEach(id => {
    const ns = bySec[id]; if (!ns || !ns.length) return;
    ns.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
    let prev = 0; const flat = []; const arts = new Set();
    ns.forEach(n => {
      const short = n.dur * secPerTick(n.tick) < 0.30 && id !== 'timp' && id !== 'perc' ? 1 : 0;
      arts.add(short ? 's' : 'l');
      flat.push(n.tick - prev, n.pitch, short ? -n.dur : n.dur, n.vel); prev = n.tick;
    });
    sections.push({ id, inst: SEC_INST[id], n: flat, count: ns.length, arts: [...arts].sort().join('') });
    needs[SEC_INST[id]] = [...new Set([...(needs[SEC_INST[id]] || []), ...arts])];
  });

  // ---- dynamics guide (one digit 0..8 per conductor beat) ----------------------------------------------------------------------------------
  const allNotes = []; sections.forEach(s => { let t = 0; for (let i = 0; i < s.n.length; i += 4) { t += s.n[i]; allNotes.push({ sec: s.id, tick: t, dur: Math.abs(s.n[i + 2]), vel: s.n[i + 3], pitch: s.n[i + 1] }); } });
  const vels = new Set(allNotes.map(n => n.vel));
  const hasDyn = vels.size >= 6;
  const WEIGHT = { timp: 2.2, perc: 2.2, tp: 1.6, tb: 1.6, tu: 1.6, hn: 1.3 };
  const raw = new Array(nBeats).fill(0), cntV = new Array(nBeats).fill(0);
  const beatOfTick = tick => { let lo = 0, hi = nBeats - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (beatTick[m] <= tick) lo = m; else hi = m - 1; } return lo; };
  allNotes.forEach(n => {
    const b0 = beatOfTick(n.tick), b1 = beatOfTick(Math.max(n.tick, n.tick + n.dur - 1));
    const w = WEIGHT[n.sec] || 1;
    for (let b = b0; b <= Math.min(b1, b0 + 3); b++) { raw[b] += w; cntV[b] += (n.vel || 64) * w; }
  });
  let level;
  if (hasDyn) level = raw.map((r, b) => r ? clamp((cntV[b] / r - 42) / (104 - 42), 0, 1) : 0);
  else {
    const sorted = raw.filter(x => x > 0).sort((a, b) => a - b), rankOf = x => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; } return sorted.length ? lo / sorted.length : 0; };
    level = raw.map(r => r ? Math.pow(rankOf(r), 0.9) : 0);
  }
  // smooth over +-1 beat, map to 0.10..0.95, quantise to 9 grades
  const sm = level.map((_, b) => { let s = 0, w = 0; for (let k = -1; k <= 1; k++) { const j = clamp(b + k, 0, nBeats - 1); const ww = k === 0 ? 2 : 1; s += level[j] * ww; w += ww; } return s / w; });
  const lo = Math.min(...sm.filter((x, i) => raw[i] > 0)), hi = Math.max(...sm);
  const dyn = sm.map(x => Math.round(clamp(0.10 + 0.85 * (x - lo) / Math.max(1e-6, hi - lo), 0, 1) * 8)).join('');

  // ---- tempo guide (conducted beats per minute, run-length: [beat, bpm]) -------------------------------------------------------------------
  const bpm = []; beatBpm.forEach((v, b) => { const r = Math.round(v * 10) / 10; if (!bpm.length || bpm[bpm.length - 1][1] !== r) bpm.push([b, r]); });

  // ---- cues: entrances after a long rest, grouped ---------------------------------------------------------------------------------------
  const ev = [];
  sections.forEach(s => {
    let t = 0, endPrev = -1e9, first = true;
    for (let i = 0; i < s.n.length; i += 4) {
      t += s.n[i]; const dur = Math.abs(s.n[i + 2]), b = beatOfTick(t) + (t - beatTick[beatOfTick(t)]) / Math.max(1, (beatTick[beatOfTick(t) + 1] || tEnd - t0) - beatTick[beatOfTick(t)]);
      if ((t - endPrev) * secPerTick(t) >= 6 && (b >= 3.5 || !first)) ev.push({ b: Math.round(b * 4) / 4, sec: s.id });
      endPrev = Math.max(endPrev, t + dur); first = false;
    }
  });
  ev.sort((a, c) => a.b - c.b);
  const cues = [];
  ev.forEach(e => { const l = cues[cues.length - 1]; if (l && e.b - l.b <= 1.5) { if (!l.s.includes(e.sec)) l.s.push(e.sec); } else cues.push({ b: e.b, s: [e.sec] }); });
  const cueOut = cues.map(c => [c.b, c.s]);

  // ---- sanity numbers: how well each wind/brass section's pitch classes agree with the strings (a wrong transposition would show here) -------
  const pcs = {}; // per beat: set of pitch classes of strings
  allNotes.filter(n => /^(vl|vc|cb)/.test(n.sec)).forEach(n => { const b0 = beatOfTick(n.tick), b1 = beatOfTick(n.tick + Math.max(1, n.dur - 1)); for (let b = b0; b <= b1; b++) (pcs[b] = pcs[b] || new Set()).add(n.pitch % 12); });
  const agree = {};
  allNotes.filter(n => !/^(vl|vc|cb)/.test(n.sec)).forEach(n => { const b = beatOfTick(n.tick); const a = agree[n.sec] = agree[n.sec] || [0, 0]; a[1]++; if (pcs[b] && (pcs[b].has(n.pitch % 12) || pcs[b].has((n.pitch + 1) % 12) === false && false)) a[0]++; });

  const endBeat = nBeats;
  const out = {
    v: 1, id: P.id, ppq: PPQ,
    title: P.title, composer: P.composer, mvt: P.mvt, year: P.year, blurb: P.blurb, level: P.level,
    src: { ...(P.musescore ? { musescore: P.musescore } : P.imslp ? { imslp: P.imslp } : { mutopia: P.mutopia }), midi: P.midi.map(f => f.split('/').pop()), licence: P.licence || 'Public Domain' },
    nBeats, grid, bpm, dyn, cues: cueOut, needs,
    sec: sections.map(s => ({ id: s.id, inst: s.inst, n: s.n })),
  };
  const durSec = beatBpm.reduce((s, v) => s + 60 / v, 0);
  const summary = { id: P.id, beats: nBeats, bars: kept.length, minutes: +(durSec / 60).toFixed(2), sections: sections.map(s => s.id + ':' + s.count).join(' '), dynMode: hasDyn ? 'velocity' : 'density',
    dynHist: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(g => dyn.split('').filter(c => +c === g).length).join(','), cues: cueOut.length, patterns: [...new Set(grid.map(g => g[2]))].join('/'),
    bpmRange: Math.round(Math.min(...beatBpm)) + '-' + Math.round(Math.max(...beatBpm)), agree: Object.keys(agree).map(k => k + ' ' + Math.round(100 * agree[k][0] / agree[k][1]) + '%').join(' ') };
  return { out, summary };
}

// long movements: play the whole thing or one of `n` bar-aligned parts of about equal length (the game cuts them with sliceScore in engine.js)
function splitParts(out, n) {
  const bars = []; out.grid.forEach(g => { for (let b = 0; b < g[1]; b++) bars.push(g[2]); }); // beats per bar
  const total = out.nBeats, res = []; let beat = 0, bi = 0;
  for (let k = 0; k < n; k++) {
    const target = Math.round(total * (k + 1) / n); let to = beat;
    while (bi < bars.length && (to < target || k === n - 1) ) { to += bars[bi++]; if (k === n - 1 && bi >= bars.length) break; }
    res.push({ id: String.fromCharCode(97 + k), from: beat, to: Math.min(to, total) }); beat = to;
  }
  return res;
}
fs.mkdirSync(OUT, { recursive: true });
const ERA = { Beethoven: 'classical', Mozart: 'classical', Haydn: 'classical', Gossec: 'classical', Mendelssohn: 'romantic', Rossini: 'romantic', 'Dvořák': 'romantic', Schubert: 'romantic', Grieg: 'romantic', Bach: 'baroque', Handel: 'baroque', Corelli: 'baroque', Vivaldi: 'baroque' };
const index = [];
let total = 0;
PIECES.forEach(P => {
  const { out, summary } = build(P);
  const json = JSON.stringify(out);
  fs.writeFileSync(path.join(OUT, P.id + '.json'), json + '\n');
  total += json.length;
  console.log(JSON.stringify(summary), (json.length / 1024).toFixed(0) + ' KB');
  const cnt = {}; out.grid.forEach(g => { cnt[g[2]] = (cnt[g[2]] || 0) + g[1]; });
  const pattern = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  index.push({ id: P.id, pattern, title: P.title, composer: P.composer, mvt: P.mvt, year: P.year, level: P.level, blurb: P.blurb, minutes: summary.minutes, nBeats: out.nBeats, needs: out.needs,
    src: out.src, sections: out.sec.map(s => s.id) });
  const ix = index[index.length - 1]; ix.ck = P.composer.en; ix.era = ERA[P.composer.en] || 'classical';
  if (P.work) ix.work = P.work; if (P.simplified) ix.simplified = true;
  if (P.licence) { ix.src.licenceUrl = P.licenceUrl; ix.src.credit = P.credit; out.src.licenceUrl = P.licenceUrl; out.src.credit = P.credit; } // share-alike: the derived score carries the licence and the credit
  if (P.parts > 1) ix.parts = splitParts(out, P.parts);
  if (P.licence) fs.writeFileSync(path.join(OUT, P.id + '.json'), JSON.stringify(out) + '\n');
});
const crypto = require('crypto'); const bh = crypto.createHash('sha1'); PIECES.forEach(P => bh.update(fs.readFileSync(path.join(OUT, P.id + '.json'))));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ v: 1, build: bh.digest('hex').slice(0, 10), pieces: index }) + '\n');
console.log('total', (total / 1024).toFixed(0) + ' KB');
