# おもちゃ大乱闘 ストーリーモード「サビの工房」 — design note (draft for staging)

Status: proposal only, nothing implemented. All names, places, text and mechanics below are original to this game.

## 1. Premise (original)

A night in the toy workshop. A creeping orange **サビ (Rust)** drifts out of the old scrap bin and seals toys inside
rusty **ネジ缶 (screw tins)**. The toys that are still free scatter across the workshop. The player picks one toy
(the "hero") and walks the workshop map, beating rusted toys in toy-brawls (the Rust makes them fight), opening their
tins to free them, and winning back **ねじ (bolts)** that make the hero stronger. At the top of the junk heap sits the
**ガラクタ大王 (Junk King)** who is feeding the Rust. Beat him, and the workshop wakes up.

No light/spirit/world-of-X concepts: freed toys simply *join the roster* and sometimes cheer from the sidelines on the map.

Tone: gentle, funny, short. Each region has a 4–6 line intro, a 2–3 line outro, and one-line barks per battle (ja/en).

## 2. World map (5 regions, about 50 battles)

| # | Region (ja / en) | Theme | Battles | Special ideas used |
|---|---|---|---|---|
| 1 | おもちゃだな / The Toy Shelf | tutorial, plain rules | 10 | 1v1, 1v2, low HP stock, timed |
| 2 | さいほうかご / The Sewing Basket | soft, bouncy, thread | 10 | low gravity, bouncy walls (box stage), slow-motion zone toy foes |
| 3 | オルゴールのひろま / Music Box Hall | rhythm, moving stage | 11 | moving platforms (shelf/track stages), coin-collect, timed survival |
| 4 | だいどころ / The Kitchen | hot, sticky | 10 | giant opponent, poison/slow toys, handicap start damage, waves |
| 5 | ガラクタやま / The Scrap Heap | final | 9 + boss | many-vs-one (waves), boss with 3 phases |

The overworld is a simple node graph per region (a single canvas or a DOM grid), nodes unlock in order with a few
side branches (optional battles that pay more bolts or a charm). The region map is a scrollable strip so it fits
667x375 landscape and portrait; nodes are 48 px tap targets, arrow-key / gamepad focus movement picks the next node.

## 3. Battle as data

All battles live in `brawl/story.js` (UMD, plain data, no code; loaded like `kits.js`; needs one `sw.js` ENGINES entry).

```js
{ id: 'r1b3', region: 1, at: [x, y],              // map position (0-100)
  name: { ja: 'ぐらぐら ブロックタワー', en: 'Wobbly Block Tower' },
  say:  { ja: '...', en: '...' },                 // one-line bark before the fight
  stage: 'bench',
  foes: [{ ch: 'bear', pal: 3, lvl: 1, stk: 2, size: 1 }],  // lvl 1-3 (+ story scaling), stk stocks, size multiplier
  me:   { stk: 3 },                               // player stocks (optional handicap: pct start)
  rules: { time: 120, mods: ['lowgrav'] },       // see section 4
  reward: { bolts: 3, free: 'ninja', charm: null, first: true },
  needs: ['r1b2'] }
```

CPU level scaling: base `lvl` per battle, plus a *region ramp* (+0..+0.5 reaction/accuracy) — the engine only has three
CPU levels, so the ramp changes how often the CPU picks "level-3 behaviours" (data, deterministic from the match seed).

## 4. Rule modifiers and what the engine needs

| Modifier | Already possible? | Plan |
|---|---|---|
| stocks / time / foe count (up to 3) / start damage (`o.hp`) / stage / CPU level | yes (`E.create`) | data only |
| 1 stock vs many | up to 4 fighters at once | "waves": story layer swaps in the next foe when a foe is KO'd (new `st.waves` queue, see below) |
| low gravity / high gravity | no | `st.mods.g` scales `C.grav` in `physics()`; key only exists when used |
| giant opponent / tiny player | no | per-fighter `f.sz` (hurtbox, hitbox and weight scale); art scales the sprite; key only when used |
| speed / jump scale (handicap) | no | `f.sp` multiplier on run / air speed; only when set |
| coin-collect | no | coins are `nohit` projectiles (`PROJ.coin`) spawned on a seeded schedule; touching one counts for the owner; a time-mode win condition `st.goal = { coins: N }` |
| timed survival | mostly | 1 stock + `mode:'time'` + endless waves; win = survive T seconds |
| stage hazards | partly (moving platforms, trains) | add 2-3 hazard stages as `STAGES` entries with a periodic projectile spawner list (`S.spawn`), purely data driven |
| boss with phases | no | the story layer swaps the boss's `mods` when a stock is lost (3 phases: extra projectile rain, low gravity, minion waves); a small `st.onStock` callback list processed inside `step` (deterministic) |
| poison / slow zone foes | yes | batch 1/2 kinds (zone, dot, slow) |

Rule: every new engine key is **absent unless a story battle sets it**, so hashes of all existing scripted matches stay
byte-identical (the same trick used for `f.ks`). Story matches are offline only; online ignores the new keys. `NETV` is
bumped once when Stage A lands (new code in the sim), and the legacy goldens remain pinned.

## 5. Progress, bolts, upgrade board, charms

- **ねじ (bolts)** are the only currency; first clear of a battle pays full, replays pay 1.
- **Upgrade board**: 4 stats — attack (+4%/lv damage), defence (-4%/lv knockback taken), speed (+3%/lv run/air), recovery
  (+5%/lv up-special reach). A board has **10 slots** total (so you cannot max everything); level N costs N bolts. Stats
  apply to every toy you play in story mode (it is the *player's* tool box, not per toy). Respec is free at any map camp.
  Engine: `fighters[i].up = {a,d,s,r}`, applied as multipliers where damage, launch speed, walk speed and up-special
  speed are computed (flag-gated).
- **ぬいぐるみチャーム (charms)**: ~14 small ones, **2 equip slots** (a third slot after region 3). Each changes exactly one rule, e.g.
  longer shield, ledge grab invincibility +, one extra air jump on the first jump, damage -10% from projectiles, start each
  stock with 15% less knockback, taunt heals 1%. Found as rewards. Implemented as flags in `f.ch2` (flag-gated).
- **Freeing toys**: a boss-like "tin" battle at the end of some nodes; the freed toy is unlocked in the normal roster
  (`save.un.c[id] = 1`) and appears on the map. The 50-toy roster means roughly 32 freed toys across the five regions
  (the rest stay on win/record unlocks).

## 6. Save shape (small, synced)

One new compact field in `kusoge.brawl.save` (default absent):

```js
sv: { v: 1,
      d: 'a3f1…',          // cleared battles, base36 bitset in battle-index order (about 10 chars per 50 battles)
      b: 12,               // bolts in hand
      u: [2, 1, 3, 0],     // board levels a/d/s/r
      c: ['c1','c4'],      // charms owned (ids)   e: ['c1']  equipped
      h: 'robo',           // hero toy   r: 2   // furthest region unlocked
    }
```

The `games.js` sync spec can use `sv: 'newest'` (whole object, no merging). A better merge is `d` bitset union plus max of
region, but that needs a custom merge rule; if you prefer to keep `'newest'`, a player who plays story on two devices
loses the older one's progress, which is acceptable for a first release. The rest of the save is untouched.
Run state (the current battle) is not saved; a battle restarts from the map.

## 7. UI

- Title menu gains "ストーリー (Story)" below the ladder. First entry: hero pick (existing roster picker, unlocked toys only).
- Map screen: region strip, nodes, bolt counter, buttons *Board* / *Charms* / *Back*. All reachable by keyboard (arrows + Enter),
  gamepad (existing `focusMove`), touch (large nodes). Landscape: map on the left 70%, the node card on the right; portrait: card below.
- Pre-battle card: name, bark, rules as icons+text, reward preview. Post-battle: reward, free-the-toy moment (small animation),
  story text on region completion. ja/en strings go through the existing `KoboI18n` table; story text is data (`{ja,en}`).
- Co-op (later): 2 heroes vs the same foes using the existing 2-player input maps; not in the first release.

## 8. Staging

- **Stage A — framework + region 1 (10 battles)**: `story.js` data + loader, map/card/board/charms UI, save field `sv`,
  engine flag-gated hooks (`mods.g`, `f.sz`, `f.sp`, start pct, upgrade multipliers), reward/free flow, tests
  (data validation: every battle's toys/stages/rules exist and every reward unlock id is real; deterministic replay of 3
  scripted story battles; play test of map -> battle -> reward -> save -> reload). `NETV` 4 (or the next number).
- **Stage B — regions 2 and 3 (21 battles)**: coin-collect, waves, hazard stages, timed survival, 3 more charms, second
  charm slot behaviour; the matching tests and balance checks of each rule (win rate of a mid-board hero against each battle's CPU
  must be 40-80% so no battle is a wall).
- **Stage C — regions 4 and 5 + boss (19 battles)**: giant foe, handicaps, the 3-phase Junk King (extend the existing boss
  data with phase mods), ending text, the third charm slot. Full-run test with a scripted bot clearing all nodes.

Each stage stays shippable on its own (later regions are simply "coming soon" nodes locked behind the last battle).

## 9. Risks and open questions

1. `games.js` achievement/save-description edits per stage (I will list them each time).
2. Waves (more foes than 4 fighters) need a small engine queue; if it proves invasive, region 5 uses 1v3 fights instead.
3. Sprite size scaling for the giant foe needs a hitbox-aware art pass (hurtbox scale applies to `C.w/C.h`).
4. 50 battles with real balance need a bot-driven win-rate sweep per battle (build that in Stage A so B/C reuse it).
5. Owner decision wanted: bolts and board global (proposed) or per toy.

## 10. Orientation check (done)

`brawl/` has no `screen.orientation.lock` and no CSS orientation lock; it only listens to `orientationchange` to re-layout.
The manifest is now `orientation: any`. Landscape layouts at 667x375 and 844x390 are covered by `brawl-play.js` section 16
(setup fits, HUD strip under the header on touch, camera keeps everyone in the free band).
