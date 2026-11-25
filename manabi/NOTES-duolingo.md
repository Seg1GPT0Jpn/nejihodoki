# Research notes: Duolingo-style UX patterns, and how まなびの工房 (manabi/) uses them

Purpose: a record of which interaction patterns were studied, which were adopted, and which were left out. Only ideas and mechanics are borrowed. No Duolingo name, owl, logo, palette values, fonts, sounds or text are used (see section 8).

Evidence legend: [P] verified on a primary Duolingo page that was fetched; [S] secondary source; [U] unverified general knowledge. Figures marked [P] are relative lifts reported by the company, without methodology. Research was done once, in this project's early phase; nothing here was re-checked online later. Re-verify anything marked [S] or [U] before relying on it.

## Part A. Research notes (original study)


Legend: [P] verified on a primary Duolingo page I fetched. [S] secondary source (press, third-party). [U] unverified: general knowledge or third-party only; confirm before relying on it.

Access note: design.duolingo.com (identity, color, logos, writing) now 301-redirects to https://blog.duolingo.com/hub/design/ and support.duolingo.com redirects to https://www.duolingo.com/help. web.archive.org is blocked here. The official brand pages could not be read directly, so palette, type and brand rules below are [S]/[U].

### 1. Learning path
- Course = units. Each unit has bite-sized lessons on a few vocabulary/grammar topics, built around a communication goal. [P] https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo
- Unit headers carry descriptive labels ("get directions", not "City 3") and a Guidebook (tips) button at the top right of the unit. [P] https://blog.duolingo.com/new-duolingo-home-screen-design/
- Each circle on the path is one level (the old crown level). Completed levels show gold; tapping a node opens a popup with the lesson topic; completed nodes can be revisited. [P] same post.
- Node icons vary by type: star, open book (Story), microphone, barbell (practice), video camera, headphones. [P] duolingo-101 post.
- Crowns were replaced by progress along the path. Legendary applies at unit level: a completed unit is Legendary if more than 50% of its levels belong to skills previously leveled to Legendary. Each unit ends with Legendary challenges. [P] new-home-screen post.
- Practice is built into the path, and quests moved to a Quests tab. A floating arrow jumps back to the current node on long paths. Launched Nov 1, 2022. [P]
- Rationale: spaced repetition and interleaving of new and review content. [P]
- Zig-zag/sinuous placement, a big 3D round button for the active node, and a locked grey state are [U]; they are widely visible in the app but not documented in the posts I read. Design-time reading: node states = locked, available/current (large, highlighted, "START" bubble), completed (gold), legendary.

### 2. Lesson flow and screen layout
Mostly [U] (observed UI; the primary posts I fetched do not describe it). Third-party UX walkthrough: https://uxplanet.org/analyzing-duolingo-from-product-design-perspective-after-400-days-of-non-stop-practice-c4d4809bdb37 [S]
- Top bar: close (X) on the left, a rounded progress bar in the middle, hearts counter on the right (free users).
- Middle: the exercise prompt and answer area. Bottom: a full-width CHECK button, disabled grey until an answer exists, and a SKIP link.
- After Check, a bottom sheet slides up. Correct: green sheet with a praise word and CONTINUE. Wrong: red sheet with "Correct solution" text and CONTINUE. Sound plays and a heart is lost on a wrong answer.
- Hearts: lose one per wrong answer; after five mistakes you complete a practice lesson to earn one back; hearts can be bought with gems; subscribers have unlimited hearts. [P] duolingo-101 post. Passive timed refill exists in the app [U] and the heart system has been revised over time, so verify the current rules.
- In-lesson combo/streak ("n in a row" with a flame and bonus XP) [U].
- End screen: a sequence of cards with a XP total, accuracy % and time taken (three colored stat boxes), then streak-extension animation if it is the first lesson that day. [U] for the stat boxes. [P] for the streak animation: after extending, the owl shows the day count, spins, and bursts into a flame, with bigger animations on milestone days. https://blog.duolingo.com/how-duolingo-streak-builds-habit/
- Units start with easier recognition exercises and progress toward typing. Personalized practice targets due-for-review content and mistakes. [P] duolingo-101.
- Settings expose separate toggles for sound effects, haptic feedback and animations. [S] https://blog.duolingo.com/learning-with-hearing-aids/ (as summarized by search)

### 3. Exercise types and interaction
Named examples [P] (duolingo-101 post): typed word translation ("Translate the word"); tap what you hear from a word bank; speak a response to a dialogue prompt; identify the sound of a character; build a Korean character by dragging partial tiles; draw a missing stroke on a Japanese character. Also Stories and DuoRadio (listening) on the path. [P]
Detailed mechanics below are [U] (observed behavior):
- Match pairs: two columns of tiles; tap one from each column; a correct pair turns green/disabled with a sound, a wrong pair flashes red and resets; finished when all pairs match.
- Word bank (translate by tapping): tiles at the bottom; tapping moves a tile to the answer line, and tapping it again returns it. Distractor tiles included.
- Listen and tap/type: a speaker button plus a slow-speed turtle button.
- Speak: mic button; a skip-for-now link ("Can't speak now") is offered.
- Fill the blank / multiple choice: a numbered list of options, with keyboard shortcuts 1-4 on web.
- Typed translation: a text box; near-misses show "typo" style hints.
- Retry policy: a wrong answer shows the correct solution and moves on. Missed items are queued to repeat at the end of the same lesson, which extends the lesson and the progress bar. The lesson only completes when the queue is clear. [U]
- Character/story exercises: dialogue with character voices; tap-the-answer comprehension questions. Characters' voices appear in speaking and listening exercises in larger courses. [P] new-home-screen post.

### 4. Gamification
- XP: earned from lessons, Stories, practice, timed challenges; time-of-day bonuses and milestone rewards. [P] duolingo-101.
- Streak: consecutive days with a completed lesson, shown as a flame. Early increments feel large (2 to 3 days is +50%, 200 to 201 is +0.5%), and loss aversion dominates later. [P] https://blog.duolingo.com/how-duolingo-streak-builds-habit/
- Streak Freeze: covers one missed day; up to two can be equipped; refill cost shown at 400 gems in that article's screenshot. [P] same. Midnight-local-time rule is [S]. Streak Society (reward tier for long streaks) could not be verified [U].
- Friends: Friend Streak and Friends Quests. [P] duolingo-101. Users with at least one Friend Streak are 22% more likely to complete their daily lesson. [P-summary] https://blog.duolingo.com/friend-streak/ (5 lessons: https://blog.duolingo.com/product-lessons-friend-streak/)
- Daily quests, monthly challenges: quests live in a Quests tab. [P] new-home-screen post. Specific quest lists are [U].
- Gems: in-app currency spent on timer boosts, Streak Freezes and hearts. [P] duolingo-101. The older name was Lingots [U]. Chests (random gem/XP rewards) [U].
- Leagues: weekly XP leaderboards, 10 leagues, Diamond on top; a new week starts each Sunday in your time zone. You are grouped with learners of similar habits and time zone, across all courses. Early versions had 5 leagues. The top 10 in Diamond qualify for a tournament (quarters, semis, finals). Opt-out via profile privacy; accounts with illegitimate XP are removed. [P] https://blog.duolingo.com/duolingo-leagues-leaderboards/ . The official post does NOT give promote/demote counts. Cohorts of about 30 with top ~10 promoted and bottom ~5 demoted are commonly cited by fan sites ([S] https://duolingo.deconstructoroffun.com/mechanics/leagues) but [U].

### 5. Visual design language
Official brand pages unreadable; treat values as [S]/[U].
- Primary green called "Feather Green", about #58CC02. Darker green about #46A302 used as the button underside. [S] https://www.shadcn.io/design/duolingo and https://www.webdesignhot.com/design.md/duolingo/ (reverse-engineered, not official). The color page title "Feather Green" exists at https://design.duolingo.com/identity/color but its content was not retrievable.
- Other hue roles [S]: Eel, dark neutral grey for text (about #4B4B4B); orange (about #FF9600) for streak/flame; purple/pink (about #CE82FF) for gems/accents; blue for info; red for errors; gold for completed levels [P for gold].
- Typography: custom Feather Bold (made by Johnson Banks with Fontsmith, 2019, shaped after the mascot) for headlines; DIN Next Rounded for body/UI. [P-press] https://www.creativebloq.com/news/feather-bold . Reported rules: Feather Bold lowercase; the two faces not mixed in the same sentence [S] https://www.shadcn.io/design/duolingo . In the app UI, buttons use uppercase bold rounded sans with wide tracking [S/U].
- Buttons: chunky pill/rounded-rect, flat fill, 3-4px solid darker bottom edge that collapses on press (translateY) for the 3D press [S/U]. Disabled = light grey fill with grey text. Radii roughly 12-16px for buttons/cards [U].
- Layout principles stated by the design team: consistency must serve a purpose, simplicity must keep clarity; whitespace replaces borders and containers; a minimal set of type styles. [P] https://blog.duolingo.com/core-tabs-redesign/
- Illustration: flat, geometric, rounded, saturated; characters built from simple shapes [S/U]. Sound design/animation: no primary sound-design notes found [U]; correct/incorrect/complete sounds are distinct per [S] accessibility review.
- Character animation [P]: Rive state machines (small files for Android/iOS/web), 10 World Characters, 20+ mouth shapes (visemes) each, mouth states layered on body-pose states, idle blinking/head nods, reaction states for right/wrong. https://blog.duolingo.com/world-character-visemes . Lottie is also used per [S] https://lottiefiles.com/case-studies/duolingo .
- Voice/tone page (https://design.duolingo.com/writing/voice) could not be read.

### 6. Retention, notifications, A/B learnings (all [P] unless noted; relative lifts, no methodology)
- Streak extension animation incl. milestone animations: +1.7% new learners active at day 7. https://blog.duolingo.com/how-duolingo-streak-builds-habit/
- Up to 2 equipped Freezes: +0.38% relative DAU, no sign of more days off. Same post.
- Streak separated from the daily goal: day-14 retention +3.3%, DAU +1%, share of daily learners with a streak +10.5% in 20 days. https://blog.duolingo.com/improving-the-streak/
- Streak Wager (gems on a 7-day streak): about +14% day-7 retention. Weekend Amulet: +4% return after a week, 5% less likely to lose the streak. https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/ (figures via search summary).
- 7-day streak users are about 2.4x more likely to return next day (https://blog.duolingo.com/putting-in-work-the-habit-of-language-learning/) and 3.6x more likely to complete the course (correlation, stated as such).
- Slack in goal pursuit can motivate more than rigid rules (Penn/UCLA study cited). Same streak post.
- Core-tab refresh: engagement across tabs up, core learning metrics steady. https://blog.duolingo.com/core-tabs-redesign/
- Notification cadence, times and copy: no primary detail found [U]. Home-screen widget post exists: https://blog.duolingo.com/widget-feature/ (not read).

### 7. Protected / do not copy
Brand-guideline pages could not be read; the following is [S]/[U] but safe practice.
- Do not use: the name "Duolingo", "Duo", "Super", "Max", "Duoradio", "Legendary" as a product label, league names if they match theirs, Lingots, or "Feather"-named fonts/colors; the owl and any look-alike; World Characters (e.g. Lily and the cast); the logo; the exact sound effects, music and voices; their Feather Bold font (proprietary; DIN Next Rounded is also commercially licensed).
- Brand-guideline summary of "don't" treatments (stretch, skew, rotate, shadow, recolor) is secondary only: https://brand-atoms.pages.dev/brands/duolingo . Official assets/guidelines: https://design.duolingo.com/marketing/assets and https://design.duolingo.com/identity/logos (now redirected).
- Safe to reuse as ideas: mechanics (streaks, XP, leagues, hearts-like limits, quests), the layout pattern, the flat-color-with-thick-bottom-border button technique, and bottom feedback sheets. Use your own palette, mascot, name and audio.

## Implementation checklist for an original web app
1. Path: vertical list of units (header with goal label + guide button); nodes zig-zag via alternating horizontal offsets (sine of index). States: locked, current (largest, bubble label), done (gold ring), mastered. Tap opens a small popover with topic and Start. Floating "jump to current" button.
2. Lesson shell: close, rounded progress bar (animates on correct), lives indicator, content, sticky bottom CHECK (disabled until answer). Keyboard: Enter = check/continue, 1-4 choose options.
3. Feedback sheet: slides up from bottom; success tint with short praise and Continue; error tint with the correct answer and Continue. Never block the user on a wrong answer; show the correct solution.
4. Exercise components: match pairs, word-bank tiles (tap to move up/down), multiple choice, fill-blank, typed answer with typo tolerance, listen (Web Speech API or own audio) with slow button, optional speak (SpeechRecognition with skip), character/dialogue.
5. Retry rule: wrong items re-queue at the end of the session; progress bar counts remaining queue; finish only when the queue is empty.
6. Limits: a lives/energy system with practice-to-refill and a gem-like currency to buy back; keep it optional/forgiving for a study tool.
7. Gamification: XP per lesson (+bonus for accuracy/combo), daily goal separate from streak, streak with up to 2 freezes bought with currency, daily quests, weekly leaderboard (local or friends-only), milestone animations.
8. End screen: cards for XP, accuracy, time; then streak extension animation; then quest progress.
9. Visual system: own palette in CSS variables (one primary hue plus darker "edge" shade, neutral text, warm orange for streak, purple for currency, red for error); rounded sans (e.g. Nunito or Baloo); buttons with border-bottom 4px of a darker shade, :active translateY(4px) and border-bottom-width 0; radii 12-16px; whitespace over borders.
10. Motion: spring/ease-out 150-300ms; confetti only at milestones; honor prefers-reduced-motion and expose toggles for sound, animation, haptics.
11. Sound: create original short cues (correct, wrong, complete, streak) with WebAudio; default on, mute toggle.
12. Mascot: create an original character with 3-5 expressions (idle, happy, sad, cheering) as SVG/Rive; reactions tied to right/wrong and streak.
13. Retention: reminder via Web Push or email with opt-in, streak-at-risk copy in a friendly voice, never guilt-heavy; track experiments (A/B) on streak freeze, animation, goal separation.
14. Legal: original name, logo, mascot, colors slightly distinct, no Duolingo marks or sounds.

## Part B. What manabi/ adopted (all original implementations)

| Pattern | Where in manabi/ | Notes |
|---|---|---|
| Learning path with zig-zag nodes, unit headers with goal labels, jump-to-current arrow | app.js `viewLearn`, `nodeEl`, `startJump` | Nodes are locked / current / done / mastered. A popup opens on tap with topic and start. A "jump" test (placement for a sub-unit) was added. |
| Sub-unit goals ("can do" labels) | tools/build-manabi.js `assignSubs`, tools/manabi-subunits.json | 13,833 questions grouped into goal-labelled sub-units. Leitner box hashes are unchanged by this. |
| Lesson shell: close, progress bar, hearts (optional), sticky check, bottom feedback sheet, keyboard 1-4 and Enter | app.js lesson view | Hearts are off by default (study tool, forgiving). Wrong items repeat at the end of the lesson. |
| Exercise variety: match pairs, word bank, tap tokens, hotspot map, fill table, listen, fill blank | engine.js types, gen.js `variantOf`, app.js renderers | Auto-variants for English short answers. |
| Streak separate from daily goal, streak freeze (max 2), repair, wager | engine.js `streakOf`, app.js gem sheet and SHOP | Following the [P] A/B on separating streak from goal. Freeze and wager are gem sinks. |
| XP, gems, chests, daily quests, monthly badges | app.js `questsFor`, `showChest`, `monthBadge` | Monthly badge has a different design each month. |
| League | app.js `viewLeague`; social.js | Local simulation by default. With login, nickname and the proposed Firestore rules: real cohorts of up to 30 (weekly XP), bots fill empty seats and are labelled, top 30 percent promoted, bottom 30 percent demoted (10-seat cohort: top 3, from rank 8). Promotion counts are fan-site figures [S/U], not official. |
| Friends and friend quest | quests tab, common/friends.js, kbPairs | Uses the platform friend codes. Shared weekly XP goal. Bot friend when signed out. |
| Feed of friends' news | quests tab, kbFeed | Streak milestones, month badges, league promotions. |
| Sound, haptics, animation toggles | fx.js, profile settings | Original WebAudio synth cues (bell / marimba / brass, reverb). No recorded or borrowed audio. |
| Original mascot with expressions | fx.js `mascot` | A round screw-head character (ねじまる), 5 expressions, 6 skins. |
| Speaking, listening, stories, radio | review tab collections | Stories are original texts with evidence-checked questions. Radio hides text until "show text". |
| Conversation: role-play and video call | dialogue.js, app.js dialogue system | 44 scripted scenes with branching. TTS voices and an animated avatar. The page says plainly that it is scripted, not a live AI. No server, no keys. |
| Pronunciation practice | app.js `startSpeaking` | Browser SpeechRecognition with a fuzzy score (dialogue.js `scoreSpeech`, pass at 70). Typed fallback where recognition is missing. |
| Thick bottom-border buttons, rounded sans, whitespace | index.html CSS | Own "pop" palette in `--kb-*` and per-subject themes. Contrast checked by tests. |

## Part C. Deliberate differences and gaps

- No subscription tier, no ads, no energy refill by payment. Gems are earned only.
- No tournament stage or top-league special. League tiers are named after screw/gear parts (ねじ ... 金のはぐるま), not Duolingo's names.
- No push notifications (no backend; Spark plan, no Cloud Functions). A reminder would need Web Push plus a server.
- League XP is written by the client. Security rules can only block impossible values (weekly cap 12000, +2000 per write, 60 s apart). Cheating cannot be prevented, so the league stays casual and no prizes are tied to it.
- Promotion and demotion are computed by each client from the final standings, not by a server job.
- Friend streaks (shared streak count between two people) are not implemented. Only the weekly shared XP quest is.
- Speaking exercises depend on browser SpeechRecognition (Chrome and Edge, including Android Chrome). Not verified on real devices here, only with a fake recognizer in tests.
- Japanese TTS voice quality and availability vary by device.

## Part D. Free-licence learning content (group 8)

- Aozora Bunko: three public-domain works. Index flags (copyright flag "none") and author death years (more than 70 years ago) are verified by tools/build-manabi-aozora.js. Lines are verbatim. Questions are AI-made and unreviewed.
- Tatoeba: the full corpus is CC BY 2.0 FR, with a CC0 subset. Only the CC0 English file is used (500 short sentences, dictation). Japanese CC0 translations are essentially empty, so none are shown.
- Natural Earth (public domain): simplified maps.
- Not ingested: e-Stat (Government Standard Terms 2.0) and NASA/NOAA imagery, because their primary-page terms were not read.
- Every source and licence is shown in the app (Profile, "Sources and licences", content/licenses.json).

## 8. Legal and brand safety (applies to every change)

Do not use: the names Duolingo, Duo, Super, Max or DuoRadio, the owl or any look-alike, Duolingo's characters, logo, fonts (Feather Bold, DIN Next Rounded), exact sounds, voices or music, or their exact colors and league names. Mechanics, layouts and the flat-color-with-thick-bottom-border button technique are ideas, not protected expression. Official brand pages could not be read during the research, so this section is a safe-practice rule, not legal advice.
