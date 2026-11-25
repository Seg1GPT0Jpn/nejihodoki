// 五目ならべ工房：絵（石・ハブのアイコン）。ぜんぶ自作の SVG。node でも読み込める（DOM は使わない）。
// 黒い石には金色の「ナット（六角）」、白い石には「ねじの頭（みぞ）」のしるしがつく（色がわかりにくい人でも見分けられる）。
(function (root) {
  'use strict';
  const nut = '<polygon points="50,36 62,43 62,57 50,64 38,57 38,43" fill="#f0c968"/><circle cx="50" cy="50" r="6.5" fill="#1b2347"/>';
  const BLACK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#5a6aa3"/><stop offset=".55" stop-color="#27305b"/><stop offset="1" stop-color="#121835"/></radialGradient></defs>' +
    '<circle cx="50" cy="50" r="48" fill="url(#g)"/><circle cx="50" cy="50" r="42" fill="none" stroke="#f0c968" stroke-opacity=".75" stroke-width="2" stroke-dasharray="3 4"/>' + nut + '<ellipse cx="34" cy="24" rx="15" ry="7" fill="#fff" fill-opacity=".16" transform="rotate(-28 34 24)"/></svg>';
  const WHITE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f1e8d6"/><stop offset="1" stop-color="#c9bda3"/></radialGradient></defs>' +
    '<circle cx="50" cy="50" r="48" fill="url(#g)"/><circle cx="50" cy="50" r="42" fill="none" stroke="#7c8aa8" stroke-opacity=".7" stroke-width="2" stroke-dasharray="3 4"/>' +
    '<circle cx="50" cy="50" r="17" fill="#e4d9c2" stroke="#8795b3" stroke-width="3"/><path d="M38 50h24" stroke="#5f6e8e" stroke-width="5" stroke-linecap="round" transform="rotate(35 50 50)"/><ellipse cx="34" cy="24" rx="15" ry="7" fill="#fff" fill-opacity=".7" transform="rotate(-28 34 24)"/></svg>';
  const uri = s => 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  const faceURL = k => uri(k === 2 ? WHITE : BLACK);
  // ハブのアイコン（registry の iconSvg と同じもの）：木の盤に、黒の五つ並びと白の石
  const ICON = '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#c99a5b"/><g stroke="#5e3f1f" stroke-width="1.4" stroke-opacity=".75"><path d="M8 8h56M8 22h56M8 36h56M8 50h56M8 64h56M8 8v56M22 8v56M36 8v56M50 8v56M64 8v56"/></g>' +
    '<g fill="#27305b" stroke="#f0c968" stroke-width="1.4" stroke-dasharray="2.2 2.4"><circle cx="8" cy="36" r="6"/><circle cx="22" cy="36" r="6"/><circle cx="36" cy="36" r="6"/><circle cx="50" cy="36" r="6"/><circle cx="64" cy="36" r="6"/></g>' +
    '<g fill="#f0c968"><circle cx="8" cy="36" r="2"/><circle cx="22" cy="36" r="2"/><circle cx="36" cy="36" r="2"/><circle cx="50" cy="36" r="2"/><circle cx="64" cy="36" r="2"/></g>' +
    '<g fill="#f1e8d6" stroke="#7c8aa8" stroke-width="1.4"><circle cx="22" cy="22" r="6"/><circle cx="50" cy="50" r="6"/><circle cx="36" cy="50" r="6"/></g>' +
    '<g stroke="#5f6e8e" stroke-width="2.2" stroke-linecap="round"><path d="M19 22h6"/><path d="M47 50h6"/><path d="M33 50h6"/></g></svg>';
  const API = { faceURL, BLACK, WHITE, ICON };
  root.GomokuArt = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
