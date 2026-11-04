// P3-6：お知らせ（common/news.js と common/news.json）の単体テスト。node だけ。
// 実行：node tools/tests/unit/news.test.js
'use strict';
const path = require('path');
const { test, eq, ok, deep, run, FakeStorage, COMMON, readText } = require('./_kobo-env');

function load(init) {
  globalThis.localStorage = new FakeStorage(init || {});
  delete require.cache[path.join(COMMON, 'news.js')]; delete globalThis.KoboNews;
  return require(path.join(COMMON, 'news.js'));
}

test('news.json: valid entries with ids, ja+en title and body, the first one announces XP / achievements', () => {
  const N = load();
  const raw = JSON.parse(readText('common/news.json'));
  const list = N.normalize(raw);
  eq(list.length, raw.length, 'every entry is valid');
  for (const e of list) { ok(e.title.ja && e.title.en, 'title ja/en ' + e.id); ok(e.body.ja && e.body.en, 'body ja/en ' + e.id); ok(/^\d{4}-\d{2}-\d{2}$/.test(e.date), 'date ' + e.id); }
  const first = list[list.length - 1];
  eq(first.id, 1); eq(first.title.ja, 'XP・実績が始まりました');
});

test('normalize: newest first, drops duplicates / bad ids / missing titles / unsafe links', () => {
  const N = load();
  const list = N.normalize([
    { id: 1, date: '2026-11-04', title: { ja: 'a', en: 'A' }, body: { ja: 'x', en: 'X' }, link: 'profile/' },
    { id: 3, title: { ja: 'c' }, link: 'javascript:alert(1)' },
    { id: 3, title: { ja: 'dup' } }, { id: 0, title: { ja: 'zero' } }, { id: 2.5, title: { ja: 'frac' } }, { id: 4 }, null, 'x',
    { id: 5, title: { ja: 'e' }, link: '//evil.example' }, { id: 6, title: { ja: 'f' }, link: 'https://github.com/Seg1GPT0Jpn/nejihodoki/issues' },
  ]);
  deep(list.map(e => e.id), [6, 5, 3, 1]);
  eq(list[3].link, 'profile/'); eq(list[2].link, undefined); eq(list[1].link, undefined); eq(list[0].link, 'https://github.com/Seg1GPT0Jpn/nejihodoki/issues');
  deep(N.normalize({ news: [{ id: 1, title: { ja: 'a' } }] }).map(e => e.id), [1]);
  deep(N.normalize('junk'), []);
});

test('unread: everything is unread at first; markRead stores the max id in kobo.news.read; a new entry is unread again', () => {
  const N = load();
  const list = N.normalize([{ id: 1, title: { ja: 'a' } }, { id: 2, title: { ja: 'b' } }]);
  eq(N.lastRead(), 0); eq(N.unread(list).length, 2); eq(N.hasUnread(list), true);
  eq(N.markRead(list), 2); eq(localStorage.getItem('kobo.news.read'), '2');
  eq(N.hasUnread(list), false);
  const more = N.normalize([{ id: 3, title: { ja: 'c' } }].concat(list));
  deep(N.unread(more).map(e => e.id), [3]);
  // never goes down (another device synced a bigger value with cloud.js 'max')
  localStorage.setItem('kobo.news.read', '7');
  eq(N.markRead(more), 7); eq(localStorage.getItem('kobo.news.read'), '7'); eq(N.hasUnread(more), false);
});

test('lastRead tolerates junk and missing storage; text falls back to Japanese', () => {
  let N = load({ 'kobo.news.read': 'abc' }); eq(N.lastRead(), 0);
  N = load({ 'kobo.news.read': '"4"' }); eq(N.lastRead(), 4);
  delete globalThis.localStorage; eq(N.lastRead(), 0); eq(N.markRead([{ id: 9 }]), 9);
  eq(N.text({ ja: 'あ', en: 'A' }, 'en'), 'A'); eq(N.text({ ja: 'あ' }, 'en'), 'あ'); eq(N.text(null), '');
});

test('load: fetches common/news.json and normalizes; a failed fetch gives []', async () => {
  const N = load();
  globalThis.fetch = async url => ({ ok: true, json: async () => [{ id: 1, title: { ja: 'a' }, url }] });
  const l = await N.load('../'); eq(l.length, 1);
  globalThis.fetch = async () => { throw new Error('offline'); };
  deep(await N.load(), []);
  globalThis.fetch = async () => ({ ok: false });
  deep(await N.load(), []);
  delete globalThis.fetch;
});

run('news (P3-6)');
