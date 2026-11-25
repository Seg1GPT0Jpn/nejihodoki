#!/usr/bin/env node
'use strict';
// tools/release-orchestra-hold.js - publishes pieces that were staged in orchestra/scores-hold/ (licence not yet confirmed).
//
//   node tools/release-orchestra-hold.js --ids mahler5-1,mahler5-2,... --licence "<licence line>" --licence-url <url> --credit "<credit text>" [--url <source page>]
//   node tools/release-orchestra-hold.js --list
//
// What it does (nothing happens without --licence and --credit, which must come from the owner's evidence):
//   1. records the licence / credit / source for each id in tools/orchestra-hold-release.json (the build reads it);
//   2. runs tools/build-orchestra-scores.js, which then (a) writes those pieces into orchestra/scores/ with src.licence, src.licenceUrl, src.credit in the JSON,
//      (b) adds them to orchestra/scores/index.json (new build hash -> sw.js ?b= changes by itself), (c) deletes the staged copy in scores-hold/;
//   3. prints the CREDITS.md row to paste (the in-app credits table is generated from index.json) and the shared-file edits (stars cap, firestore cap).
// To un-release: delete the ids from tools/orchestra-hold-release.json and run the build again.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const args = process.argv.slice(2), opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const REL = path.join(__dirname, 'orchestra-hold-release.json'), HOLD = path.join(__dirname, '..', 'orchestra', 'scores-hold', 'hold-index.json');
const rel = fs.existsSync(REL) ? JSON.parse(fs.readFileSync(REL, 'utf8')) : { ids: [], by: {} };
const held = fs.existsSync(HOLD) ? JSON.parse(fs.readFileSync(HOLD, 'utf8')).pieces : [];
if (args.includes('--list')) { console.log('staged:', held.map(p => p.id).join(' ') || '(none)'); console.log('released:', rel.ids.join(' ') || '(none)'); process.exit(0); }
const ids = (opt('ids') || '').split(',').filter(Boolean), licence = opt('licence'), credit = opt('credit'), licenceUrl = opt('licence-url') || '', url = opt('url') || '';
if (!ids.length || !licence || !credit) { console.error('usage: --ids a,b --licence "..." --credit "..." [--licence-url U] [--url U]   (licence and credit are required: they come from the owner\'s evidence)'); process.exit(2); }
ids.forEach(id => { if (!held.some(p => p.id === id) && !rel.by[id]) { console.error('not a staged piece: ' + id); process.exit(2); } });
ids.forEach(id => { rel.by[id] = { licence, licenceUrl, credit, ...(url ? { releaseUrl: url } : {}) }; if (!rel.ids.includes(id)) rel.ids.push(id); });
fs.writeFileSync(REL, JSON.stringify(rel, null, 1) + '\n');
console.log(execFileSync(process.execPath, [path.join(__dirname, 'build-orchestra-scores.js')], { encoding: 'utf8' }).split('\n').filter(l => /total|rror/.test(l)).join('\n'));
const index = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'orchestra', 'scores', 'index.json'), 'utf8'));
console.log('released: ' + ids.join(', ') + '; index now has ' + index.pieces.length + ' pieces (build ' + index.build + ')');
ids.forEach(id => console.log('| ' + id + ' | CREDITS.md row: | ' + licence + ' | ' + credit + ' |'));
console.log('shared edits: stars cap = 3 x ' + index.pieces.length + ' = ' + 3 * index.pieces.length + '; firestore cap orchestra >= ' + 100 * index.pieces.length);
