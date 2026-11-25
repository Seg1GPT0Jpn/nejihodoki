# 指揮者ゲーム (orchestra/) — credits and licences

## Sounds
VSCO 2 Community Edition, Sam Gossner / Versilian Studios, **CC0 1.0**. https://github.com/sgossner/VSCO-2-CE
Details, scope and the rebuild recipe: `orchestra/samples/LICENSES.txt`. Tool: `tools/build-orchestra-samples.js`.

## Scores (Public Domain, except the Dvořák 9 pieces: CC BY-SA 3.0)
The note data comes from the MIDI files of the Mutopia Project (https://www.mutopiaproject.org/). On 2026-11-25 each piece's own page
(`cgibin/piece-info.cgi?id=N`) was opened and shows the licence given in the table (`Copyright: Public Domain`, or `Creative Commons Attribution-ShareAlike 3.0` for Mutopia 1793). The MIDI is a mechanical rendering of the LilyPond-engraved score
(no performance data). The raw files are kept in `tools/orchestra-midi/`; `tools/build-orchestra-scores.js` converts them into `orchestra/scores/*.json`.

| id | Composer | Work | Mutopia | MIDI file(s) used | Licence |
|---|---|---|---|---|---|
| beethoven5 | L. v. Beethoven | Symphony No. 5, Op. 67, I | [941](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=941) | Symphony5_1.mid | Public Domain |
| beethoven7 | L. v. Beethoven | Symphony No. 7, Op. 92, II (Allegretto) | [595](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=595) | Symphony7_2.mid | Public Domain |
| nachtmusik | W. A. Mozart | Eine kleine Nachtmusik, K.525, I | [2230](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2230) | MozartWA-KV525-mov-01.mid | Public Domain |
| zauberflote | W. A. Mozart | The Magic Flute, Overture, K.620 (Adagio, Allegro) | [248](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=248) | magicflute-00-overture-mids: adagioIscore.mid, allegroIscore.mid | Public Domain |
| dvorak7-1 | A. Dvořák | Symphony No. 7, Op. 70, I. Allegro maestoso | [1901](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1901) | DvorakSYMPH7_conductor.mid | Public Domain |
| dvorak7-2 | A. Dvořák | Symphony No. 7, Op. 70, II. Poco adagio | [1901](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1901) | DvorakSYMPH7_conductor-1.mid | Public Domain |
| dvorak7 | A. Dvořák | Symphony No. 7, Op. 70, III. Scherzo (Vivace), whole movement (earlier builds: first part only) | [1901](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1901) | DvorakSYMPH7_conductor-2.mid | Public Domain |
| dvorak7-4 | A. Dvořák | Symphony No. 7, Op. 70, IV. Finale (Allegro) | [1901](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1901) | DvorakSYMPH7_conductor-3.mid | Public Domain |
| dvorak9-1 | A. Dvořák | Symphony No. 9, Op. 95 "From the New World", I. Adagio - Allegro molto | [1793](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1793) | Mvt1_Adagio.mid | CC BY-SA 3.0 |
| dvorak9-2 | A. Dvořák | Symphony No. 9, Op. 95 "From the New World", II. Largo | [1793](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1793) | Mvt2_Largo.mid | CC BY-SA 3.0 |
| dvorak9-3 | A. Dvořák | Symphony No. 9, Op. 95 "From the New World", III. Scherzo (Molto vivace) | [1793](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1793) | Mvt3_Scherzo.mid | CC BY-SA 3.0 |
| dvorak9-4 | A. Dvořák | Symphony No. 9, Op. 95 "From the New World", IV. Allegro con fuoco | [1793](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1793) | Mvt4_conFuoco.mid | CC BY-SA 3.0 |
| dvorak8-1 | A. Dvořák | Symphony No. 8, Op. 88, I. Allegro con brio | MuseScore.com user 194052, set 5098438 (URL pending) | Dvorak8_Mvt1_AllegroConBrio.mid | CC0 1.0 (as read by the project owner from the MuseScore page; not verified by the build agent) |
| dvorak8-4 | A. Dvořák | Symphony No. 8, Op. 88, IV. Allegro ma non troppo | MuseScore.com user 194052, one of [5379777](https://musescore.com/user/194052/scores/5379777), [5379779](https://musescore.com/user/194052/scores/5379779), [5379782](https://musescore.com/user/194052/scores/5379782) (movements II-IV; which is which is not confirmed) | Dvorak8_Mvt4_Finale.mid | CC0 1.0 (as read by the project owner; not verified by the build agent) |
| coriolan | L. v. Beethoven | Coriolan Overture, Op. 62 | [57](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=57) | coriolan.mid | Public Domain |
| fidelio | L. v. Beethoven | Fidelio Overture, Op. 72b | [377](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=377) | fidelio.mid | Public Domain |
| mozart25-1 | W. A. Mozart | Symphony No. 25, K.183, I (Allegro con brio) | [1380](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1380) | Symphony25_1.mid | Public Domain |
| mozart25-2 | W. A. Mozart | Symphony No. 25, K.183, II (Andante) | [1381](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1381) | Symphony25_2.mid | Public Domain |
| beethoven5-2 | L. v. Beethoven | Symphony No. 5, Op. 67, II (Andante con moto) | [1437](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1437) | Symphony5_2.mid | Public Domain |
| beethoven7-1 | L. v. Beethoven | Symphony No. 7, Op. 92, I (Poco sostenuto - Vivace) | [891](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=891) | Symphony7_1.mid | Public Domain |
| beethoven-q4-1 | L. v. Beethoven | String Quartet No. 4, Op. 18 No. 4, I | [790](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=790) | QuartetOpus18_No4_1.mid | Public Domain |
| beethoven-q4-2 | L. v. Beethoven | String Quartet No. 4, Op. 18 No. 4, II | [791](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=791) | QuartetOpus18_No4_2.mid | Public Domain |
| beethoven-q4-3 | L. v. Beethoven | String Quartet No. 4, Op. 18 No. 4, III | [792](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=792) | QuartetOpus18_No4_3.mid | Public Domain |
| beethoven-q4-4 | L. v. Beethoven | String Quartet No. 4, Op. 18 No. 4, IV | [793](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=793) | QuartetOpus18_No4_4.mid | Public Domain |
| schubert-qs | F. Schubert | String Quartet No. 12 "Quartettsatz", D.703 | [1196](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1196) | SchubertF-D703-Quartettsatz.mid | Public Domain |
| grieg-aase | E. Grieg | Aase's Death from Peer Gynt Suite No. 1, Op. 46 (strings) | [247](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=247) | aasesdeath.mid | Public Domain |
| beethoven-marsch | L. v. Beethoven | March in C, WoO 29 (wind trio reduction) | [991](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=991) | marsch_woo29.mid | Public Domain |
| haydn76-1-1 | F. J. Haydn | String Quartet Op. 76 No. 1, I | [383](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=383) | Haydn_Op76_1_mvt1.mid (score.mid) | Public Domain |
| haydn76-1-4 | F. J. Haydn | String Quartet Op. 76 No. 1, IV | [383](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=383) | Haydn_Op76_1_mvt4.mid (score-3.mid) | Public Domain |
| haydn76-1-2 | F. J. Haydn | String Quartet Op. 76 No. 1, II | [383](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=383) | Haydn_Op76_1_mvt2.mid (score-1.mid) | Public Domain |
| mozart387-1 | W. A. Mozart | String Quartet K.387, I | [245](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=245) | Mozart_K387_mvt1.mid (k387-score.mid) | Public Domain |
| mozart387-2 | W. A. Mozart | String Quartet K.387, II | [245](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=245) | Mozart_K387_mvt2.mid (k387-score-1.mid) | Public Domain |
| mozart387-3 | W. A. Mozart | String Quartet K.387, III | [245](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=245) | Mozart_K387_mvt3.mid (k387-score-2.mid) | Public Domain |
| mozart387-4 | W. A. Mozart | String Quartet K.387, IV | [245](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=245) | Mozart_K387_mvt4.mid (k387-score-3.mid) | Public Domain |
| beethoven-q59-3 | L. v. Beethoven | String Quartet Op. 59 No. 3, II | [1041](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1041) | Beethoven_Op59_3_mvt2.mid | Public Domain |
| dvorak8-3 | A. Dvořák | Symphony No. 8, Op. 88, III. Allegretto grazioso (SIMPLIFIED: 5-part reduction) | [IMSLP Symphony No. 8](https://imslp.org/wiki/Symphony_No.8,_Op.88_(Dvo%C5%99%C3%A1k,_Anton%C3%ADn)) file PMLP8825-Symphony-8-3-Dvorak.mscz | Dvorak8_Mvt3_DeBra_arr.mid | CC BY 4.0 |
| mahler5-1 | G. Mahler | Symphony No. 5, I. Trauermarsch | MIDI by Ben Boot (file names `mahler_symphony_5_1_cboot.mid`; source URL pending) | Mahler5_mvt1.mid | Owner-confirmed copyright-free (source URL pending) |
| mahler5-2 | G. Mahler | Symphony No. 5, II. Stürmisch bewegt | MIDI by Ben Boot (file names `mahler_symphony_5_2_cboot.mid`; source URL pending) | Mahler5_mvt2.mid | Owner-confirmed copyright-free (source URL pending) |
| mahler5-3 | G. Mahler | Symphony No. 5, III. Scherzo | MIDI by Ben Boot (file names `mahler_symphony_5_3_cboot.mid`; source URL pending) | Mahler5_mvt3.mid | Owner-confirmed copyright-free (source URL pending) |
| mahler5-4 | G. Mahler | Symphony No. 5, IV. Adagietto | MIDI by Ben Boot (file names `mahler_symphony_5_4_cboot.mid`; source URL pending) | Mahler5_mvt4.mid | Owner-confirmed copyright-free (source URL pending) |
| mahler5-5 | G. Mahler | Symphony No. 5, V. Rondo-Finale | MIDI by Ben Boot (file names `mahler_symphony_5_5_cboot.mid`; source URL pending) | Mahler5_mvt5.mid | Owner-confirmed copyright-free (source URL pending) |
| midsummer | F. Mendelssohn | A Midsummer Night's Dream, Op. 61, No. 5 (Intermezzo) | [80](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=80) | Sommernachtstraum.mid | Public Domain |
| rossini | G. Rossini | Eduardo e Cristina, Overture | [1634](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1634) | Eduardo_e_Cristina.mid | Public Domain |
| egmont | L. v. Beethoven | Egmont Overture, Op. 84 | [547](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=547) | Egmont.mid | Public Domain |

Excerpts are cut at bar lines (see `excerpt` in the tool). The "dynamics guide" and "tempo guide" shown in the game are derived by the tool (velocities where the
MIDI carries dynamics, otherwise the number of sounding notes) and are a simplified aid, not the composer's markings. Some tempo marks in the MIDI were adjusted
(Rossini's introduction), see `tempoOverride`. 
### Share-alike pieces (Dvořák 9, `dvorak9-1` .. `dvorak9-4`)
Mutopia piece 1793 (typeset with LilyPond 2.14.2, maintainer Keith OHara, source N. Simrock 1894, last updated 2011/Oct/03) is licensed **CC BY-SA 3.0**
(https://creativecommons.org/licenses/by-sa/3.0/). The four score files `orchestra/scores/dvorak9-N.json` are derivative works of that MIDI and are
therefore also licensed **CC BY-SA 3.0** (they carry `src.licence`, `src.licenceUrl` and `src.credit`, and the credit is shown in the app's credits table).
Game code, art and the other pieces are unaffected. Changes: MIDI converted to the compact score format, conductor-beat grid, dynamics and tempo guide and cues derived by
`tools/build-orchestra-scores.js`; the triangle (III) and the single cymbal note (IV) were left out (no sample); the cor anglais has no part of its own in the MIDI.

### Dvořák 7 (Mutopia 1901, Public Domain)
The Mutopia piece page shows `Copyright: Public Domain` and its zip holds all four movements (the conductor's score PDF states "typeset and placed in the public domain ... by J.F. Lucarelli",
2014/01/18). Earlier builds used only the Scherzo; now all four movements are included.

### Dvořák 8, I (`dvorak8-1`): licence status
Source: a MIDI export of a MuseScore.com community score (user 194052, set 5098438), handed over by the project owner, who read the licence on the MuseScore page as CC0 (public-domain dedication).
**I could not open musescore.com from the build environment (HTTP 403), so this licence is NOT verified by me; the page URL is still to be added** (credit text placeholder: "MuseScore.com user 194052, set 5098438 (CC0), URL pending").
Please confirm the licence text on the page and replace the placeholder in `tools/build-orchestra-scores.js` (`credit`, `musescore.url`) before relying on it.
Track mapping (the MIDI has empty track names and non-General-MIDI program numbers, so it was inferred from the full-score track order, the pitch ranges, the note onsets and the entrance bars; track 19 is empty):
0,1 flutes (incl. piccolo) | 2,3 oboes | 4,5 clarinets | 6,7 bassoons | 8-11 horns | 12,13 trumpets | 14,15,16 trombones | 17 tuba | 18 timpani | 20 violins I | 21 violins II | 22 violas | 23 cellos | 24 basses.
Evidence: monophonic parts with ranges inside each instrument's range (bassoons 35-76, horns 38-74, trumpets 58-79, tuba 31-55); clarinets, bassoons and horns enter at beat 0 and trumpets at beat 110 as in the opening of the movement; track 18 has only 5 distinct pitches (timpani); the pairs 0/1, 2/3, 4/5, 10/11 double each other (onset+pitch-class overlap 45-66 %); the five 20-24 tracks have the string ranges 55-100, 55-91, 48-83, 36-67, 26-56. Uncertain: tracks 0-3 (high woodwinds) could be assigned differently within the group (track 3 is polyphonic, so it may hold both oboes), and the viola track has 6746 notes (probably expanded tremolo/divisi). The tuba plays on the tuba samples (new `tu` seat in `engine.js`).
The finale file (`dvorak8-4`, handed over later; its file name called it the first movement, but it is the Finale: it opens with the trumpets, 2/4, 24 tempo events, 116-126 beats/min) has the same 25-track layout and was mapped the same way; checks: trumpets (12,13) sound at beat 0, track 18 has 5 distinct pitches (timpani), ranges fit (tuba 31-43, trombone 3 36-55). Tracks 0,1 (flutes/piccolo up to MIDI 96) and the polyphonic tracks (track 5 here, track 3 in the first movement: two parts merged) are the least certain.
Tempo (first movement): the file has 9 tempo events (138 quarter notes/min at the start, a ritardando to 97 around tick 238080 and back); the 4/4 bars are conducted in two beats per bar at the guide tempo (69-130 beats/min) and the game's 0.6x-1.4x tempo clamp is relative to these marked tempi.

### Notes on the added Mutopia pieces (2026-11-25, all pages show `Copyright: Public Domain`)
Track mapping: Fidelio and Coriolan by the track names in the MIDI; the Beethoven 5 II / 7 I files have the same 12-track layout as the already used 5 I / 7 II (fl ob cl fg hn tp timp + strings); Mozart 25 has no flutes, trumpets or bassoon in I (oboes, horns, strings) and a bassoon in II; the double basses of Mozart 25 are derived from the cellos an octave down (as in Eine kleine Nachtmusik). Coriolan and Mozart 25 I are conducted in four at 150-152 beats per minute (`bpmMax` in the tool), Fidelio in two at up to 140.
Not added: Mozart K.130 (the MIDI is split into parts and small movements), the Gossec symphonies (small string/horn/oboe scoring), Magic Flute march (short), CC BY-SA or solo-concerto pieces.

### Dvořák 8, III (`dvorak8-3`): arrangement credit and method
**Arrangement: Paul De Bra, 2025, CC BY 4.0, IMSLP** (https://imslp.org/wiki/Symphony_No.8,_Op.88_(Dvo%C5%99%C3%A1k,_Anton%C3%ADn); the composition is Dvořák, public domain). The source is a 5-part reduction (four accordions + bass accordion, IMSLP file PMLP8825-Symphony-8-3-Dvorak.mscz, licence CC BY 4.0 as given by the project owner from the IMSLP file page; I did not open that file page myself). The MuseScore file was converted to MIDI by the project owner's converter (`Dvorak8_Mvt3_DeBra_arr.mid`); the app marks the piece as "simplified". Changes: the five parts were spread over the orchestra by doubling (Acc.1 violin I + flutes, Acc.2 violin II + oboes + clarinets, Acc.3 violas + horns, Acc.4 cellos + bassoons, Bass double basses); the written tempo (dotted quarter = 60) was scaled by 50/60 (the original marking), so the movement lasts about 6.3 minutes; the 3/8 bars are conducted one beat to the bar, the 2/4 coda as one beat too at that tempo; guide tempo is floored at 36 for the fermata. The trio is shorter than in the full score (see the converter's NOTES.md). Derived score data for this piece is distributed under CC BY 4.0 with this credit (in `scores/dvorak8-3.json` and the in-app credits).

### Mahler 5 (`mahler5-1` .. `mahler5-5`): licence status
Composition: Mahler, public domain. MIDI data: Ben Boot (named in the file names and credited as such). **The licence evidence is the project owner's statement that the files are copyright-free (著作権フリー); I did not see the source page and the URL is still pending. This is not independently verified.** Please replace the licence line (`tools/orchestra-hold-release.json`, then rebuild) when the page and its exact wording are known; if the page does not allow redistribution, remove the five ids from that file and rebuild to take them out again.
Handling: performance-style MIDI (thousands of tempo events, flat velocities): the guide tempo is a smoothed median per beat and the dynamics guide comes from the note density. Strings come as three merged tracks plus pizzicato, so they are split by register onto violins I/II, violas, cellos, basses (an approximation of the real divisi). The English horn plays on the oboe samples. Percussion: GM bass drum goes to the bass drum, the cymbal notes to the cymbals; other percussion and the glockenspiel are left out. The harp (Adagietto, II) plays on the harp samples (new seats for harp and cymbals). The pieces always load on the light (one-layer) sample tier and are split into parts of about 4-6 minutes.

### Chamber pieces (strings / winds) - batch 1
String quartets and the wind trio are played as small ensembles: the parts sit on the violin I / II, viola, cello (and bass for Grieg) or clarinet / horn / bassoon sections; each section is cued like an orchestral section. The MIDI files are the movement files of the Mutopia zips (`score.mid`, `score-1.mid`, ... = movements I, II, ...). The Mutopia pages 790-793, 1196, 247, 991, 383 were opened on 2026-11-25 and each shows `Copyright: Public Domain`.

### Dvořák: what exists (2026-11-25)
Mutopia has only 5 Dvořák pieces (Symphony 7 and 9, the Op. 4 violin pieces, a quartet movement and a song); IMSLP's work pages for Slavonic Dances, Serenade for Strings/Winds, Op. 96/97, Carnival/Othello/In Nature's Realm, Symphonies 1-6, Legends and others show no MIDI and no source files, apart from a few accordion/quintet MuseScore engravings by an arranger (not orchestral, no licence line shown) which were not used.

### Sources checked and not usable (2026-11-25)
- Dvořák 8: not on Mutopia (the composer listing has only 5 pieces: Symphonies 7 and 9, Op. 4, String Quartet 12 and a song). IMSLP offers PDFs (scans, CC0/PD editions) and one accordion arrangement MuseScore file (not an orchestral score): no machine-readable orchestral file with a clear licence.
- IMSLP Dvořák 7/9: PDFs only ("Source Files (0)"), no MusicXML/MIDI.
- OpenScore / MuseScore.com / GitHub OpenScore: not reachable from the build environment (HTTP 403 from the proxy), so nothing could be verified there. Kunst der Fuge: not reachable. Nothing from these was used.

## Code and art
All code, the procedural hall reverb and the stage art are original to this project. No real people are depicted.
