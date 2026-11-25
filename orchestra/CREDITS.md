# 指揮者ゲーム (orchestra/) — credits and licences

## Sounds
VSCO 2 Community Edition, Sam Gossner / Versilian Studios, **CC0 1.0**. https://github.com/sgossner/VSCO-2-CE
Details, scope and the rebuild recipe: `orchestra/samples/LICENSES.txt`. Tool: `tools/build-orchestra-samples.js`.

## Scores (all Public Domain)
The note data comes from the MIDI files of the Mutopia Project (https://www.mutopiaproject.org/). On 2026-11-25 each piece's own page
(`cgibin/piece-info.cgi?id=N`) was opened and shows `Copyright: Public Domain`. The MIDI is a mechanical rendering of the LilyPond-engraved score
(no performance data). The raw files are kept in `tools/orchestra-midi/`; `tools/build-orchestra-scores.js` converts them into `orchestra/scores/*.json`.

| id | Composer | Work | Mutopia | MIDI file(s) used | Licence |
|---|---|---|---|---|---|
| beethoven5 | L. v. Beethoven | Symphony No. 5, Op. 67, I | [941](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=941) | Symphony5_1.mid | Public Domain |
| beethoven7 | L. v. Beethoven | Symphony No. 7, Op. 92, II (Allegretto) | [595](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=595) | Symphony7_2.mid | Public Domain |
| nachtmusik | W. A. Mozart | Eine kleine Nachtmusik, K.525, I | [2230](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2230) | MozartWA-KV525-mov-01.mid | Public Domain |
| zauberflote | W. A. Mozart | The Magic Flute, Overture, K.620 (Adagio, Allegro) | [248](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=248) | magicflute-00-overture-mids: adagioIscore.mid, allegroIscore.mid | Public Domain |
| dvorak7 | A. Dvořák | Symphony No. 7, Op. 70, III (Scherzo), first part | [1901](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1901) | DvorakSYMPH7_conductor-2.mid | Public Domain |
| midsummer | F. Mendelssohn | A Midsummer Night's Dream, Op. 61, No. 5 (Intermezzo) | [80](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=80) | Sommernachtstraum.mid | Public Domain |
| rossini | G. Rossini | Eduardo e Cristina, Overture | [1634](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1634) | Eduardo_e_Cristina.mid | Public Domain |
| egmont | L. v. Beethoven | Egmont Overture, Op. 84 | [547](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=547) | Egmont.mid | Public Domain |

Excerpts are cut at bar lines (see `excerpt` in the tool). The "dynamics guide" and "tempo guide" shown in the game are derived by the tool (velocities where the
MIDI carries dynamics, otherwise the number of sounding notes) and are a simplified aid, not the composer's markings. Some tempo marks in the MIDI were adjusted
(Rossini's introduction), see `tempoOverride`. Pieces whose Mutopia licence was CC BY-SA (e.g. Beethoven Eroica, Dvořák 9) were left out.

## Code and art
All code, the procedural hall reverb and the stage art are original to this project. No real people are depicted.
