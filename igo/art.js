// 囲碁工房：絵（碁石・ハブのアイコン）。ぜんぶ自作の SVG。node でも読み込める（DOM は使わない）。
// 黒石には金色の細い輪（象眼）、白石には青灰色の細い輪がつく（石の色が見分けにくい人のため、輪の濃さもちがえてある）。
(function (root) {
  'use strict';
  const BLACK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".34" cy=".28" r=".9"><stop offset="0" stop-color="#6a6f80"/><stop offset=".45" stop-color="#2b2e3a"/><stop offset="1" stop-color="#0b0c12"/></radialGradient></defs>' +
    '<circle cx="50" cy="50" r="48" fill="url(#g)"/><circle cx="50" cy="50" r="40" fill="none" stroke="#e8c15c" stroke-opacity=".7" stroke-width="2"/><circle cx="50" cy="50" r="8" fill="#e8c15c" fill-opacity=".55"/>' +
    '<ellipse cx="34" cy="24" rx="15" ry="7" fill="#fff" fill-opacity=".2" transform="rotate(-28 34 24)"/></svg>';
  const WHITE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx=".36" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".62" stop-color="#eeece4"/><stop offset="1" stop-color="#b8b5a8"/></radialGradient></defs>' +
    '<circle cx="50" cy="50" r="48" fill="url(#g)" stroke="#8a8c98" stroke-width="1.5"/><circle cx="50" cy="50" r="40" fill="none" stroke="#6d7894" stroke-opacity=".75" stroke-width="2"/><circle cx="50" cy="50" r="8" fill="none" stroke="#6d7894" stroke-opacity=".8" stroke-width="3"/>' +
    '<ellipse cx="34" cy="24" rx="15" ry="7" fill="#fff" fill-opacity=".85" transform="rotate(-28 34 24)"/></svg>';
  const uri = s => 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';
  const faceURL = k => uri(k === 2 ? WHITE : BLACK);
  // ハブのアイコン（registry の iconSvg と同じ）：木の盤の角に、黒と白の石。ツケ・ハネの形
  const ICON = '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#d9ac62"/><g stroke="#5a3d1a" stroke-width="1.4" stroke-opacity=".8"><path d="M10 10h52M10 24h52M10 38h52M10 52h52M10 66h52M10 10v56M24 10v56M38 10v56M52 10v56M66 10v56"/></g>' +
    '<circle cx="24" cy="24" r="2.3" fill="#5a3d1a"/><circle cx="52" cy="52" r="2.3" fill="#5a3d1a"/>' +
    '<g fill="#2b2e3a" stroke="#e8c15c" stroke-width="1.4"><circle cx="24" cy="38" r="6.6"/><circle cx="38" cy="24" r="6.6"/><circle cx="38" cy="52" r="6.6"/></g>' +
    '<g fill="#f3f1ea" stroke="#6d7894" stroke-width="1.6"><circle cx="38" cy="38" r="6.6"/><circle cx="52" cy="38" r="6.6"/><circle cx="24" cy="52" r="6.6"/></g>' +
    '<g fill="#e8c15c" fill-opacity=".8"><circle cx="24" cy="38" r="1.8"/><circle cx="38" cy="24" r="1.8"/><circle cx="38" cy="52" r="1.8"/></g>' +
    '<g fill="none" stroke="#6d7894" stroke-width="1.6"><circle cx="38" cy="38" r="1.8"/><circle cx="52" cy="38" r="1.8"/><circle cx="24" cy="52" r="1.8"/></g></svg>';
  const API = { faceURL, BLACK, WHITE, ICON };
  root.IgoArt = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
