// リバーシ工房：絵（石の表と裏・ハブのアイコン）。ぜんぶ自作の SVG。node でも読み込める（DOM は使わない）。
// 黒い石は「歯車」、白い石は「ねじの頭」のしるしがつく（色がわかりにくい人でも見分けられる）。
(function (root) {
  'use strict';
  const gear = (() => {
    let t = '';
    for (let i = 0; i < 8; i++) t += '<rect x="46.5" y="29" width="7" height="9" rx="1.5" transform="rotate(' + i * 45 + ' 50 50)"/>';
    return '<g fill="#f0c968">' + t + '<circle cx="50" cy="50" r="12.5"/></g><circle cx="50" cy="50" r="5.5" fill="#1b2347"/>';
  })();
  const BLACK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#5a6aa3"/><stop offset=".55" stop-color="#27305b"/><stop offset="1" stop-color="#121835"/></radialGradient></defs>' +
    '<circle cx="50" cy="50" r="48" fill="url(#g)"/><circle cx="50" cy="50" r="40" fill="none" stroke="#f0c968" stroke-opacity=".8" stroke-width="2" stroke-dasharray="3 4"/>' + gear + '<ellipse cx="34" cy="24" rx="15" ry="7" fill="#fff" fill-opacity=".16" transform="rotate(-28 34 24)"/></svg>';
  const WHITE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f1e8d6"/><stop offset="1" stop-color="#c9bda3"/></radialGradient></defs>' +
    '<circle cx="50" cy="50" r="48" fill="url(#g)"/><circle cx="50" cy="50" r="40" fill="none" stroke="#7c8aa8" stroke-opacity=".7" stroke-width="2" stroke-dasharray="3 4"/>' +
    '<circle cx="50" cy="50" r="15" fill="#e4d9c2" stroke="#8795b3" stroke-width="3"/><path d="M40 50h20" stroke="#5f6e8e" stroke-width="4.5" stroke-linecap="round" transform="rotate(35 50 50)"/><ellipse cx="34" cy="24" rx="15" ry="7" fill="#fff" fill-opacity=".7" transform="rotate(-28 34 24)"/></svg>';
  const uri = s => 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  const faceURL = k => uri(k === 2 ? WHITE : BLACK);
  // ハブのアイコン（registry の iconSvg と同じもの）
  const ICON = '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#1c5a4e"/><g stroke="#0b2d27" stroke-width="1.6" stroke-opacity=".7"><path d="M6 24h60M6 40h60M6 56h60M24 8v56M40 8v56M56 8v56"/></g>' +
    '<circle cx="24" cy="24" r="10" fill="#27305b" stroke="#f0c968" stroke-width="1.6" stroke-dasharray="2.4 2.6"/><circle cx="24" cy="24" r="3.6" fill="#f0c968"/>' +
    '<circle cx="40" cy="24" r="10" fill="#f1e8d6" stroke="#7c8aa8" stroke-width="1.6"/><path d="M35 24h10" stroke="#5f6e8e" stroke-width="3" stroke-linecap="round" transform="rotate(35 40 24)"/>' +
    '<circle cx="40" cy="40" r="10" fill="#27305b" stroke="#f0c968" stroke-width="1.6" stroke-dasharray="2.4 2.6"/><circle cx="40" cy="40" r="3.6" fill="#f0c968"/>' +
    '<g transform="translate(24 40) scale(.62 1)"><circle r="10" fill="#f1e8d6" stroke="#7c8aa8" stroke-width="1.6"/></g><g transform="translate(56 40)"><circle r="10" fill="#27305b" stroke="#f0c968" stroke-width="1.6" stroke-dasharray="2.4 2.6"/><circle r="3.6" fill="#f0c968"/></g></svg>';
  const API = { faceURL, BLACK, WHITE, ICON };
  root.ReversiArt = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
