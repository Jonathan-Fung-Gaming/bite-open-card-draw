# Codex Execution Plan: Pump It Up Open Stage Draw and Voting App

This document is intended to be pasted or added to a repository for Codex to execute automatically. Implement the plan **one phase at a time, in order**. Do not skip phases. Do not implement later-phase behavior before earlier-phase acceptance criteria are met, except for harmless placeholders required for compilation.

There is intentionally **no Phase 0** in this file. This file assumes Codex is responsible for creating any missing project scaffolding, docs, tests, and app files needed to execute the implementation.

---

## 1. Core product behavior

### Tournament structure

The app is for one Pump It Up Open Stage tournament with **4 rounds**.

Each round contains **2 chart sets**:

| Round | Set 1 | Set 2 |
|---:|---|---|
| 1 | S16 | S17 |
| 2 | S18 | S19 |
| 3 | S20 | S21 |
| 4 | S22 | D23 |

For each chart set:

- Draw exactly 7 charts.
- Players may ban up to 2 charts from that set.
- The chart with the fewest bans is selected.
- If multiple charts tie for fewest bans, the backend commits a tiebreak winner before the animation starts.
- The stage then theatrically reveals the already-committed tiebreak winner.

Each round ultimately produces **2 final charts**, one from each chart set. The final reveal screen for a round must show the two selected charts together.

---

### Player room and voting behavior

The QR code points to a general room link, not a player-specific link.

The general room link should offer:

```text
I am a player voting
View charts only
```

Players who vote must:

1. Select their **start.gg username** from an alphabetical dropdown.
2. Confirm:

```text
Are you sure you are voting as [start.gg username]?
```

3. Complete Set 1.
4. Complete Set 2.
5. Review the whole round ballot.
6. Submit once for the full round.

Players may select **up to 2 bans per chart set**.

A chart set is complete only if the player either:

- selects 1 or 2 charts from that set, or
- explicitly selects:

```text
No bans for this set
```

There should be no vague skip button.

Players can move forward and backward between the two chart sets before final submission.

After submitting, players may edit their ballot until voting closes.

If the same start.gg username is opened on another phone, warn the user and allow the latest valid submitted ballot to win.

---

### View-only behavior

View-only users can:

- see both chart sets
- move between sets
- see chart names/art
- see voting status
- see final results after reveal

View-only users cannot:

- select a start.gg username
- submit a ballot
- affect turnout
- affect ban counts

---

### Voting window behavior

Voting opens only after both chart sets for the round have been drawn.

Each round has one **10-minute voting window** for both chart sets.

Before chart-by-chart results are revealed, public screens may show:

```text
Ballots submitted: X / Y
Ban selections cast: Z
```

Public screens must not show live chart-by-chart counts before voting closes.

Admin may see live chart-by-chart counts through `/coolguy69`, but the counts must be hidden behind a warning button and not shown by default.

If turnout is below 75% when the timer expires:

- automatically extend voting by 1 minute once
- then close after that minute no matter what

If everyone submits early:

- enter a 30-second final-change warning period
- allow edits during those 30 seconds
- close automatically when the 30 seconds end

If the host pauses voting:

- freeze the countdown
- freeze submissions
- freeze edits
- resume both time and submissions when the host resumes

---

### Results behavior

Results use **ban counts only**, not percentages.

For each chart set:

- count bans per drawn chart
- include charts with zero bans
- reveal from least banned to most banned
- show ban count badges and small count bars
- ties that are not part of the least-ban decision are revealed alphabetically
- if the least-banned chart is unique, select it
- if multiple charts tie for least banned, run the tiebreak sequence

The result reveal order for each round is:

1. Reveal Set 1 results from least banned to most banned.
2. Resolve Set 1 selected chart.
3. Reveal Set 2 results from least banned to most banned.
4. Resolve Set 2 selected chart.
5. Show final screen with both selected charts together.

Phones should not show the full result until the stage reveal is complete. Before the stage reveal is marked complete, phones should show:

```text
Voting is closed.
Results are being revealed on stage.
```

After reveal is complete, phones should show the two selected charts first, with expandable full ban counts.

---

### Tiebreak behavior

The backend must commit the tiebreak winner before the animation starts.

The stage animation is a reveal only; it must never decide the tournament result.

Use a 5-second Doom/rune-inspired 12-slot wheel for 2-, 3-, and 4-way ties.

For 2 tied charts:

```text
A B A B A B A B A B A B
```

For 3 tied charts:

```text
A B C A B C A B C A B C
```

For 4 tied charts:

```text
A B C D A B C D A B C D
```

For 5+ tied charts, do not build a special dramatic wheel. Use a simple fallback tiebreak reveal that still displays the backend-committed winner. This is only a safety fallback so the app cannot dead-end.

---

### Admin behavior

Admin route:

```text
/coolguy69
```

Use one shared admin password. Store only a password hash in environment variables or secure configuration. Do not store the plaintext password.

Admin features:

- login/logout
- host lock
- admin inactivity timer
- roster management
- chart exclusions
- chart draw controls
- voting controls
- result reveal controls
- dangerous action confirmations
- manual ballot entry/override
- private CSV export

Dangerous actions require the admin password again and must summarize the action before accepting the password.

Examples of dangerous actions:

- rerolling a chart set
- rerolling a full round
- replacing a chart
- reopening voting
- manually entering a ballot
- overwriting an existing ballot
- adding an inactive player back to the current round
- overriding a result
- resetting a round

The password prompt should look conceptually like this:

```text
You are about to reroll Round 2 — S19.
This will replace the currently drawn charts for this set.
Enter the admin password to continue.
```

Live count reveal is sensitive but not destructive. It should be hidden behind a warning button, but does not need a password re-entry.

---

### Host lock behavior

Only one active host should control tournament operations.

Host lock behavior:

1. Admin logs in.
2. Admin clicks `Take Host Control`.
3. That browser becomes the active host.
4. The active host sends a heartbeat every few seconds.
5. Other admin browsers may view status but cannot operate controls unless they take over.
6. If heartbeat expires, another admin can take over.
7. A takeover should show a warning.

---

### Roster behavior

The player list consists of start.gg usernames.

Admin can:

- add a start.gg username
- bulk import start.gg usernames
- mark a player active
- mark a player inactive/eliminated
- reactivate inactive players
- edit a typo before player has tournament history
- see active player count

Duplicate active start.gg usernames are not allowed.

The voting dropdown should show only active eligible players.

Inactive/eliminated players remain visible in the admin roster and can be restored if there was an error.

When voting opens, snapshot the active player list for that round. Routine roster changes after voting opens apply to future rounds. Emergency addition of an inactive player to the current round requires a dangerous action confirmation.

---

### Chart behavior

Use the supplied chart CSV as the source data. Expected source path:

```text
/data/source/charts.csv
```

Expected columns:

```text
name
name_kr
artist
label
type
level
bg_img
```

Only these chart pools matter:

```text
S16
S17
S18
S19
S20
S21
S22
D23
```

All matching charts are eligible by default, but admin must be able to pre-exclude charts before the event and re-include them if needed.

Chart images should be cached locally before the event rather than loaded from third-party URLs during the event.

Recommended local handling:

- preserve original `bg_img` URL for reference
- save local optimized image path
- use local cached image in stage/player UI
- provide acceptable fallback image/card if image caching fails

Draw eligibility rules:

- chart type and level must match the chart set
- chart must not be excluded
- chart must not have the same song key as a selected chart from a prior round
- chart should not duplicate a song already drawn in the other set of the same round

Only selected songs are blocked from future rounds, not merely drawn songs.

---

### Private export behavior

The export is an admin/private ballot CSV saved to the host computer through browser download.

It is not a public shareable export.

Behavior:

- auto-download once after the final two charts are revealed
- provide a manual `Download private ballot CSV` button

Suggested CSV columns:

```text
round_number
player_startgg_username
player_active_at_round_start
submitted
submitted_at
last_revision_at
set_1_label
set_1_ban_1
set_1_ban_2
set_1_no_bans
set_2_label
set_2_ban_1
set_2_ban_2
set_2_no_bans
manual_override
override_admin
override_reason
replaced_existing_ballot
selected_set_1_chart
selected_set_2_chart
set_1_tiebreak_used
set_2_tiebreak_used
```

---

### Visual direction

Use the uploaded tournament logo. Expected repo path:

```text
/public/brand/tournament-logo.png
```

Use an original Doom-inspired industrial/rune/hell-tech theme:

- black background
- metallic panels
- orange/red glow
- rune accents
- industrial card backs
- dramatic but readable animations

Do not use official DOOM assets unless the user separately confirms they have permission.

Do not include a reduced-motion toggle in the UI. Still avoid extreme strobing, full-screen flashing, or unreadable shake.

---

## 2. Global implementation rules for Codex

Implement phases in order. After each phase:

1. Run formatter if configured.
2. Run lint.
3. Run typecheck.
4. Run unit tests.
5. Run end-to-end tests if any exist yet.
6. Run production build.
7. Record phase completion notes in `/docs/phase-status.md`.
8. Continue to the next phase only if acceptance criteria pass.

If a phase cannot pass because of missing secrets, missing external services, or unavailable source files, create the best local mock/stub version, clearly document the blocker in `/docs/phase-status.md`, and continue only if the app still builds and tests pass.

Do not expose secrets to client-side code.

Do not place service-role keys in browser-accessible files.

Tournament decisions must be server-side:

- draws
- rerolls
- ballot acceptance
- voting close
- result computation
- tiebreak winner selection
- manual overrides

Client animations may reveal committed state but must never decide tournament state.


## GitHub Actions / CI workflow timing

Do **not** create a GitHub Actions workflow or any `.github/workflows/*` files during Phases 1 through 11.

During Phases 1 through 11, local scripts are enough:

```text
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

Create the GitHub Actions workflow only in the final phase, Phase 12, after the app structure, scripts, tests, and deployment assumptions have stabilized. Until then, if an agent wants CI, it should document the idea in `/docs/phase-status.md` rather than adding workflow files.

---

## 3. Suggested stack

Use this stack unless the existing repository already uses compatible equivalents:

```text
Next.js
TypeScript
Supabase
Tailwind CSS
Vitest
Playwright
ESLint
Prettier
```

Recommended scripts:

```text
npm run dev
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run import:charts
npm run cache:chart-images
```

Create or update `.env.example` with:

```text
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD_HASH=
SESSION_SECRET=
```

---

# Phase 1 — Project scaffold, docs, and route skeleton

## Goal

Create the application shell, documentation, shared types, and major routes.

## Tasks

Create or update project docs:

```text
/docs/product-spec.md
/docs/implementation-plan.md
/docs/data-model.md
/docs/admin-runbook.md
/docs/event-day-runbook.md
/docs/testing-checklist.md
/docs/phase-status.md
```

Create or update project instruction file:

```text
/AGENTS.md
```

`AGENTS.md` should summarize the locked tournament rules and tell future agents not to alter tournament behavior unless explicitly instructed.

Create routes:

```text
/stage
/room
/vote
/charts
/results
/coolguy69
```

Suggested meanings:

| Route | Purpose |
|---|---|
| `/stage` | Projector/stage display |
| `/room` | QR destination and general room landing page |
| `/vote` | Player voting flow |
| `/charts` | View-only chart display |
| `/results` | Results after stage reveal |
| `/coolguy69` | Admin/host console |

Create placeholder components:

```text
TournamentLogo
ChartCard
ChartSetPanel
RoundHeader
CountdownTimer
QRPanel
AdminLayout
DangerousActionDialog
HostLockBadge
```

Use the uploaded tournament logo if present at:

```text
/public/brand/tournament-logo.png
```

If it is missing, create a placeholder and document the missing asset in `/docs/phase-status.md`.

Start the visual foundation:

- black background
- industrial panels
- orange/red glow
- rune accents
- metallic card backs

## Acceptance criteria

Phase 1 is complete when:

- all required routes load
- uploaded logo or placeholder appears correctly
- documentation files exist
- `AGENTS.md` exists
- lint passes
- typecheck passes
- tests pass or placeholder test exists and passes
- production build succeeds

---

# Phase 2 — Database schema and server foundation

## Goal

Create the Supabase schema, server utilities, API/server-action skeletons, and baseline security boundaries.

## Core tables

Create migrations for tables equivalent to:

```text
players
charts
chart_exclusions
rounds
round_sets
draws
drawn_charts
voting_windows
ballots
ballot_choices
ballot_revisions
result_snapshots
result_rows
tiebreaks
admin_sessions
admin_actions
host_locks
image_assets
```

Use names and structure that are idiomatic for the codebase, but preserve the behavior.

## Round set model

Each round has two `round_sets`.

Each `round_set` stores:

```text
round_number
set_order
chart_type
chart_level
display_label
draw_count = 7
max_bans = 2
```

Seed the round set configuration:

```text
Round 1, Set 1, S16
Round 1, Set 2, S17
Round 2, Set 1, S18
Round 2, Set 2, S19
Round 3, Set 1, S20
Round 3, Set 2, S21
Round 4, Set 1, S22
Round 4, Set 2, D23
```

## Server-side tournament mutations

Create route handlers/server actions/service functions for:

```text
adminLogin
adminLogout
acquireHostLock
refreshHostLock
releaseHostLock
importCharts
updateChartExclusion
createOrUpdatePlayer
setPlayerActiveStatus
addPlayerToCurrentRoundEligibility
drawRoundSet
rerollOneChart
rerollRoundSet
rerollFullRound
openVotingWindow
pauseVotingWindow
resumeVotingWindow
submitBallot
manualBallotOverride
closeVotingWindow
computeResults
commitTiebreak
markResultsRevealed
exportPrivateCsv
```

Early in this phase, these can be skeletons, but they should have typed inputs and clear server-only boundaries.

## Security rule

Browser code may use the public Supabase anon key only for safe reads if needed.

All tournament-changing writes should go through server-side code.

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
SESSION_SECRET
ADMIN_PASSWORD_HASH
```

## Acceptance criteria

Phase 2 is complete when:

- migrations apply cleanly or local schema initializes cleanly
- round set seed data exists
- server-side Supabase client exists
- client-side code cannot import server-only secrets
- placeholder mutation functions exist with typed contracts
- basic database tests pass
- lint, typecheck, tests, and build pass

---

# Phase 3 — Chart import, normalization, image caching, and exclusions

## Goal

Import the supplied chart CSV and prepare reliable tournament chart pools.

## Source file

Use:

```text
/data/source/charts.csv
```

If missing, document the issue and create a small local fixture so tests and UI can still run.

Expected columns:

```text
name
name_kr
artist
label
type
level
bg_img
```

## Normalization

Normalize:

```text
type: "s" or "d"
level: integer
display difficulty: S16, S17, D23, etc.
song key: normalized name + artist
chart key: normalized name + artist + type + level
```

Only these active pools matter:

```text
S16
S17
S18
S19
S20
S21
S22
D23
```

The importer may ignore irrelevant levels or import them as inactive/outside tournament scope.

## Scripts

Create scripts:

```text
npm run import:charts
npm run cache:chart-images
```

`import:charts` should:

- parse CSV
- normalize values
- upsert chart records
- detect duplicate chart keys
- preserve source rows or source identifiers when helpful
- validate that all required pools have at least 7 eligible charts

`cache:chart-images` should:

- fetch unique `bg_img` URLs
- save local optimized images
- update chart/image records with local image paths
- preserve original remote URL
- produce fallback cards/images if a fetch fails

Do not let missing art break the draw or stage display.

## Exclusion control

All matching charts are eligible by default.

Admin should be able to pre-exclude and re-include charts before the event with a reason.

Example reasons:

```text
bad metadata
image missing
event rule exclusion
manual tournament decision
```

## Acceptance criteria

Phase 3 is complete when:

- chart import works from source CSV or fixture
- all required pools have at least 7 eligible charts in normal data mode
- images are cached locally or have fallbacks
- exclusions and re-inclusions work
- duplicate chart keys are handled safely
- import scripts are repeatable
- lint, typecheck, tests, and build pass

---

# Phase 4 — Admin authentication, host lock, and roster management

## Goal

Build the `/coolguy69` admin experience.

## Admin login

Use one shared admin password.

Implementation requirements:

- store only `ADMIN_PASSWORD_HASH`
- set an HTTP-only admin session cookie after login
- expire the admin session after inactivity
- recommended inactivity period: 30 minutes

Any dangerous action still requires password re-entry.

## Host lock

Implement host lock:

1. Admin logs in.
2. Admin clicks `Take Host Control`.
3. Browser becomes active host.
4. Active host sends heartbeat every few seconds.
5. Other admin browsers are read-only unless they take over.
6. If heartbeat expires, another admin can take over.
7. Takeover shows a warning.

## Roster management

Admin can:

- add a start.gg username
- bulk import start.gg usernames
- mark player active
- mark player inactive/eliminated
- reactivate inactive players
- edit typo before player has tournament history
- see current active player count

Duplicate active start.gg usernames must be blocked.

Voting dropdown should show only active eligible players.

Admin roster should still show inactive/eliminated players and provide a restore/reactivate action.

## Active round eligibility

When a voting window opens, snapshot the active player list.

Routine roster changes after voting opens apply to future rounds only.

Emergency action:

```text
Add inactive player to current round eligibility
```

This must require dangerous action confirmation with password and audit reason.

## Dangerous action dialog

Build reusable dialog:

```text
You are about to [specific action].
This will [specific consequence].
Enter the admin password to continue.
```

## Acceptance criteria

Phase 4 is complete when:

- `/coolguy69` requires password
- admin session expires after inactivity
- dangerous actions require password again
- host lock prevents two control screens from acting at once
- active roster can be edited
- inactive players can be restored
- duplicate active usernames are blocked
- eligibility snapshot behavior is implemented or stubbed with tests proving intended behavior
- lint, typecheck, tests, and build pass

---

# Phase 5 — Draw engine and round control

## Goal

Implement the actual chart draw system and round control state.

## Round control flow

For each round:

1. Host chooses the round.
2. Host draws Set 1.
3. Stage can reveal Set 1.
4. Host draws Set 2.
5. Stage can reveal Set 2.
6. Both sets remain visible.
7. Host opens the 10-minute voting window.

Voting cannot open until both sets have exactly 7 drawn charts.

## Draw eligibility

A chart is eligible when:

- chart type and level match the set
- chart is not excluded
- chart does not have the same song key as a selected chart from a prior round
- chart does not duplicate a song already drawn in the other set of the same round

Only selected songs are blocked from future rounds.

## Draw storage

Store enough information to audit:

```text
round
set
eligible pool count
drawn chart IDs
draw order
created timestamp
admin action ID
reroll version, if applicable
```

## Randomness

The backend decides the draw.

Do not use browser randomness for tournament decisions.

A fully formal commit-reveal system is optional for this hobby version, but draw history and reroll history must be preserved.

## Rerolls

Allow rerolls as dangerous actions:

```text
reroll one chart
reroll one chart set
reroll full round
```

Before voting opens, rerolls are allowed with password confirmation and audit reason.

After voting opens, rerolling is dangerous because it invalidates active ballots. Recommended behavior:

- pause voting
- require password
- require reason
- invalidate affected ballots
- redraw
- clearly reopen voting

## Acceptance criteria

Phase 5 is complete when:

- each set draws exactly 7 unique charts
- no excluded chart is drawn
- selected songs from prior rounds are excluded
- same song is not drawn in both sets of the same round
- rerolls preserve history
- voting cannot open until both sets are drawn
- backend draw state survives browser refresh
- lint, typecheck, tests, and build pass

---

# Phase 6 — Stage display and draw visualization

## Goal

Build the dramatic stage experience.

## Stage layout

The stage display should show:

- tournament logo
- current round
- current chart set
- draw status
- voting status
- big countdown timer
- QR code to `/room`
- both drawn chart sets once available

During individual set reveal, fill the projector preview rows one chart at a time:
first all 7 charts from Set 1 in the top row, then all 7 charts from Set 2 in the
bottom row.

Once both sets are visible, show two labeled panels:

```text
Round 1 — S16: [1] [2] [3] [4] [5] [6] [7]

Round 1 — S17: [1] [2] [3] [4] [5] [6] [7]
```

The stage preview and voting display must use two horizontal rows of 7 charts.
Keep this projector layout separate from the phone ballot layout.

## QR placement

During voting:

- large timer should be prominent
- QR code should be above/right of the card area
- short room URL should appear under the QR

Example:

```text
Scan to vote or view charts
example.com/room
```

## Draw animation

Reveal one set at a time.

Recommended sequence:

1. Set title appears.
2. Seven empty slots appear.
3. Card back appears.
4. Industrial/rune animation plays.
5. Chart image and title reveal.
6. Card locks into its slot.
7. Repeat for all seven charts.
8. Move to the next set.

Reveal order:

```text
All 7 charts from Set 1
Then all 7 charts from Set 2
```

Do not alternate sets.

## Motion caution

There is no reduced-motion UI.

Still avoid:

- full-screen strobe flashing
- rapidly alternating white/red frames
- unreadable camera shake
- animations that prevent host control

## Acceptance criteria

Phase 6 is complete when:

- stage can reveal Set 1 and Set 2
- stage shows both sets together
- QR code points to `/room`
- timer and QR are readable on a projector
- missing chart image fallback looks acceptable
- refresh returns stage to the correct current state
- lint, typecheck, tests, and build pass

---

# Phase 7 — Player room, view-only mode, and ballot flow

## Goal

Build the phone/player experience.

## Room landing

Route:

```text
/room
```

Buttons:

```text
I am a player voting
View charts only
```

## View-only mode

View-only users can:

- see both chart sets
- move between sets
- see chart names/art
- see voting status
- see final results after reveal

View-only users cannot:

- select a start.gg username
- submit a ballot
- affect turnout
- affect ban counts

## Player identity

Voting flow:

1. Player opens `/room`.
2. Player taps `I am a player voting`.
3. Player selects from a field labeled:

```text
Select your start.gg username
```

4. App shows:

```text
Are you sure you are voting as [start.gg username]?
```

5. Player confirms.

If a ballot already exists for that username in the current round, show:

```text
A ballot already exists for this start.gg username.
Only continue if you are [username].
The latest valid submitted ballot will count.
```

## Ballot flow

Use steps:

```text
Step 1: Set 1
Step 2: Set 2
Step 3: Review and Submit
```

Do not include a skip button.

For each set, the player must either:

- select 1 or 2 ban charts, or
- select `No bans for this set`

Only then is the set complete.

Players can go back and change selections before submitting.

Final submit sends the whole round ballot.

## Phone card layout

Use two columns:

```text
[1] [2]
[3] [4]
[5] [6]
   [7]
```

The 7th card should be centered.

## Ballot editing

After submission:

- show saved choices
- show server-confirmed timestamp
- allow `Change vote` until voting closes
- changes only count after successful save

If a save fails, keep the previous server-saved ballot.

## After voting closes

Before stage reveal finishes, phones should show:

```text
Voting is closed.
Results are being revealed on stage.
```

After stage reveal finishes, phones should show:

- the two selected charts first
- expandable full ban counts

## Acceptance criteria

Phase 7 is complete when:

- player can complete both sets
- player cannot submit without completing both sets
- explicit `No bans for this set` works
- existing ballot is detected
- latest valid ballot wins
- view-only mode cannot submit
- inactive players do not appear in the voting dropdown
- phones behave correctly after close and after reveal
- lint, typecheck, tests, and build pass

---

# Phase 8 — Voting window, timer logic, pause, turnout, and manual ballots

## Goal

Implement the full voting state machine.

## Voting states

Recommended states:

```text
not_started
drawing
ready_to_vote
voting_open
voting_paused
final_30_seconds
extension_1_minute
voting_closed
results_computed
results_revealing
results_revealed
round_complete
```

Use names that fit the codebase, but preserve these behaviors.

## Timer source

Use server/database time for official deadlines.

Client timers are visual only.

## Opening voting

When host opens voting:

- snapshot active eligible players
- set `opened_at`
- set `closes_at = opened_at + 10 minutes`
- show stage timer
- allow player submissions

## Turnout display

Public screens may show:

```text
Ballots submitted: X / Y
Ban selections cast: Z
```

Do not show public chart-by-chart counts before voting closes.

## 75% turnout rule

At normal expiration:

- if submitted ballots are below 75% of eligible players
- automatically extend once by 1 minute
- show the extension clearly
- after that minute, close regardless of turnout

## Everyone submitted early

If all eligible players submit:

- enter 30-second final-change mode
- allow edits during those 30 seconds
- then close

## Pause behavior

When host pauses:

- freeze countdown
- freeze submissions
- freeze edits
- stage shows paused state
- phones show paused state

When host resumes:

- resume countdown
- reopen submissions and edits

## Manual ballots

Admin can manually enter a ballot:

- while voting is open
- after voting closes but before results reveal

Manual ballots after close should be marked as overrides in the private CSV.

If the player already has a ballot, the admin UI must warn:

```text
This player already has a submitted ballot.
Are you sure you want to replace it?
```

Manual ballot fields:

```text
player
Set 1 choices
Set 2 choices
reason
replace existing ballot? yes/no
```

Manual ballot actions require the admin password.

## Acceptance criteria

Phase 8 is complete when:

- timer uses server time
- one 10-minute window covers both sets
- 75% extension happens once
- all-submitted 30-second warning works
- pause freezes both time and voting
- manual ballots work before reveal
- post-close manual ballots are exported as overrides
- no ballot can change after results reveal without special correction workflow
- lint, typecheck, tests, and build pass

---

# Phase 9 — Results computation, rune-wheel tiebreak, final reveal, and CSV export

## Goal

Compute results and reveal the selected charts dramatically.

## Result computation

For each set:

- count bans per chart
- include zero-ban charts
- sort from least banned to most banned
- identify least-ban chart or tied least-ban group

No percentages.

## Public result reveal

Reveal one set at a time:

1. Show Set 1 results from least banned to most banned.
2. Resolve Set 1 winner.
3. Show Set 2 results from least banned to most banned.
4. Resolve Set 2 winner.
5. Show final two selected charts together.

## Count visualization

Use both:

- ban count badges on cards
- small horizontal bars for total bans

Example:

```text
5 bans
```

## Ties

For non-winning ties:

- reveal tied charts alphabetically
- do not run a spinner

For least-ban ties:

- backend chooses winner first
- stage runs 5-second rune wheel
- selected chart is highlighted

## 12-slot rune wheel

For 2 tied charts:

```text
A B A B A B A B A B A B
```

For 3 tied charts:

```text
A B C A B C A B C A B C
```

For 4 tied charts:

```text
A B C D A B C D A B C D
```

For 5+ tied charts:

- use a plain fallback tiebreak reveal
- do not attempt a special wheel layout
- still commit the backend winner first

## Final screen

After both sets are complete:

```text
ROUND X FINAL CHARTS

[Selected Set 1 Chart]
[Selected Set 2 Chart]
```

This should be the stable final stage screen.

## Private CSV export

After final reveal:

- auto-download private CSV once
- provide manual download button

Suggested columns:

```text
round_number
player_startgg_username
player_active_at_round_start
submitted
submitted_at
last_revision_at
set_1_label
set_1_ban_1
set_1_ban_2
set_1_no_bans
set_2_label
set_2_ban_1
set_2_ban_2
set_2_no_bans
manual_override
override_admin
override_reason
replaced_existing_ballot
selected_set_1_chart
selected_set_2_chart
set_1_tiebreak_used
set_2_tiebreak_used
```

Browser download is the implementation of “saved to the computer.”

## Acceptance criteria

Phase 9 is complete when:

- results include zero-ban charts
- least-ban chart is selected
- tied least-ban charts use tiebreak
- wheel reveals backend-decided winner
- final screen shows exactly two selected charts
- phones wait until stage reveal finishes before showing results
- private CSV downloads correctly
- CSV marks manual overrides clearly
- lint, typecheck, tests, and build pass

---

# Phase 10 — Testing, edge cases, and review hardening

## Goal

Prove the tournament logic is safe enough for event use.

## Unit tests

Test:

- chart import
- active player list
- no duplicate active usernames
- draw exactly 7 charts
- no excluded charts
- selected songs excluded from later rounds
- same song not drawn in both sets of the same round
- ban max of 2 per set
- explicit no-ban completion
- result count sorting
- least-ban selection
- tiebreak candidate detection
- private CSV generation

## Integration tests

Test:

- full Round 1 flow
- full Round 2 flow after selected songs are excluded
- player submits then edits
- same username on second phone
- voting close while save is in flight
- pause and resume
- all players submitted early
- 75% extension
- manual ballot override before reveal
- inactive player restored by admin
- host lock takeover

## End-to-end tests

Using Playwright:

- stage loads
- admin logs in
- host draws both sets
- QR room page loads
- player selects start.gg username
- player completes both sets
- player submits
- voting closes
- results reveal
- final two charts appear
- CSV export downloads

Production-flow full-tournament Playwright evidence must also prove the active voting-player
elimination cadence:

- Round 1 starts with 48 active voting players.
- Before Round 2 voting opens, mark exactly 12 Round 1 voting players inactive/eliminated, leaving
  36 active voting players.
- Before Round 3 voting opens, mark exactly 12 more voting players inactive/eliminated, leaving 24
  active voting players.
- Before Round 4 voting opens, mark exactly 12 more voting players inactive/eliminated, leaving 12
  active voting players for the last round.
- For every round, assert the admin active count, `/vote` eligibility, public turnout denominator,
  ballot submission count, private CSV row count, and round eligibility snapshot match the expected
  48, 36, 24, or 12 count.

## Load-conscious testing

Test at least:

```text
100 eligible players
100 ballot submissions
multiple edits per player
stage screen connected
admin screen connected
view-only spectators opening the room link
```

Player phones should use ordinary requests and light polling, not always-on Realtime connections.

## Acceptance criteria

Phase 10 is complete when:

- all tests pass
- no known issue can change a result incorrectly
- no known issue can lose a submitted ballot
- no known issue allows voting after results reveal
- no known issue exposes service keys
- no known issue lets view-only users submit
- lint, typecheck, tests, and build pass

---

# Phase 11 — Deployment readiness and rehearsal tooling

## Goal

Prepare the app for deployment and rehearsal.

## Deployment readiness

Prepare for:

```text
Vercel project
Supabase project
environment variables configured
production build deployed
```

Because this is a volunteer hobby site, design it to be free-tier-conscious:

- avoid unnecessary Realtime connections from phones
- cache chart images efficiently
- keep API calls small
- avoid large client bundles
- avoid expensive background jobs

## Data setup workflow

Create or document commands/workflows to:

1. Import chart CSV.
2. Cache chart images.
3. Review chart exclusions.
4. Add player start.gg usernames.
5. Mark active players.
6. Confirm duplicate usernames are blocked.
7. Confirm all required chart pools have enough eligible charts.

## Rehearsal mode

Add a safe rehearsal/test mode if practical:

- use test roster
- force a tiebreak
- reset rehearsal data
- prevent accidental mixing of rehearsal and production data

## Venue checklist support

Create `/docs/event-day-runbook.md` or update it with:

- stage laptop checklist
- projector/stream capture checklist
- QR readability checklist
- phone testing checklist
- admin laptop checklist
- host lock checklist
- private CSV download location checklist

## Acceptance criteria

Phase 11 is complete when:

- production build is deployment-ready
- data setup workflow is documented
- rehearsal/reset workflow exists or is clearly documented
- event-day runbook is complete
- app supports a full 4-round rehearsal using test data
- lint, typecheck, tests, and build pass

---

# Phase 12 — Final polish, runbook verification, and release checklist

## Goal

Make the app ready for real tournament use.

## Final polish

Check:

- stage readability
- mobile readability
- QR size
- card title truncation
- timer readability
- selected chart highlight
- final two-chart screen clarity
- admin dangerous action copy
- inactive player restore flow
- manual ballot override flow
- private CSV download behavior

## Event-day runbook

Ensure the runbook includes:

### Before event

1. Open `/coolguy69`.
2. Log in.
3. Take host control.
4. Confirm active roster.
5. Confirm chart pools.
6. Confirm chart image cache.
7. Confirm stage display.
8. Confirm QR opens `/room`.
9. Confirm CSV download works.
10. Confirm admin password is known only by appropriate people.

### Before each round

1. Confirm active players.
2. Restore inactive player if there was an error.
3. Draw Set 1.
4. Reveal Set 1.
5. Draw Set 2.
6. Reveal Set 2.
7. Show both sets.
8. Open voting.
9. Monitor turnout.
10. Do not reveal public chart counts.

### During voting

Host may:

- pause voting if something breaks
- resume voting after fix
- manually enter a ballot if necessary
- show live counts privately through the admin warning button

Host should not show live admin counts on projector or stream.

### After voting closes

1. Allow any approved manual override before reveal.
2. Compute results.
3. Reveal Set 1 results.
4. Resolve Set 1.
5. Reveal Set 2 results.
6. Resolve Set 2.
7. Show final two charts.
8. Download private CSV.
9. Move to next round.

### If the website fails

Use this fallback:

```text
Pause and fix the website.
```

Do not switch to random selection unless the tournament director explicitly decides that outside the app.

## Release checklist

Create `/docs/release-checklist.md` with:

- environment variables present
- chart import completed
- chart images cached
- roster loaded
- duplicate usernames checked
- all required pools validated
- admin password set
- host lock tested
- stage tested
- phone voting tested
- result reveal tested
- CSV export tested
- final production build hash or commit recorded

## GitHub Actions workflow

Create the GitHub Actions workflow in this final phase only.

Do not create `.github/workflows/*` earlier than Phase 12.

Recommended workflow file:

```text
.github/workflows/ci.yml
```

The workflow should run on pull requests and pushes to the main branch, using the same local quality gates that the project has been using throughout the phases:

```text
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

Add `npm run test:e2e` only if the Playwright setup is reliable in CI by this point. If e2e tests require external services or secrets that are not available in CI, keep them documented as local/rehearsal tests rather than forcing the workflow to fail.

The workflow must not require production Supabase secrets unless there is a safe mocked or local test setup. Do not commit secrets into the workflow file.

## Acceptance criteria

Phase 12 is complete when:

- release checklist exists
- event-day runbook is complete
- GitHub Actions workflow exists and runs the stable final quality gates
- all critical UI flows are polished
- full 4-round test run succeeds
- private CSV exports are verified
- final build passes lint, typecheck, tests, and production build locally

---

# 4. Manual review workflow for Codex

After each phase, perform manual reviews against this file and `/docs/product-spec.md`.

Required review areas:

- Tournament rules review: check voting, no-ban behavior, duplicate username behavior, view-only behavior, timer behavior, result reveal behavior, and server-side randomness requirements.
- Security review: check admin password handling, secret leakage, session handling, dangerous action prompts, host lock behavior, manual ballot overrides, live count visibility, and voting after close.
- Data review: check chart import, normalization, pool validation, duplicate song handling, exclusion behavior, and image caching.
- UI review: check stage clarity, phone flow clarity, QR behavior, countdown states, tiebreak reveal behavior, and final selected chart display.
- Test review: confirm acceptance criteria have automated coverage where practical and documented manual coverage where automation is not yet available.

Each phase summary must include blockers, warnings, tests run, and whether it is safe to continue.

---

# 5. Final consistency rules

These rules must remain true throughout the implementation:

1. The QR route is general room access, not player-specific access.
2. View-only users cannot vote or affect turnout.
3. Voting covers both chart sets in one 10-minute round window.
4. Each player may ban up to 2 charts per set.
5. A set can be completed with explicit `No bans for this set`.
6. Players cannot submit unless both sets are complete.
7. Players can edit until voting closes, unless voting is paused.
8. Pause freezes both the timer and ballot changes.
9. Public screens do not show live chart-by-chart counts before close.
10. Admin live chart counts are available only behind a warning button.
11. Draws, ballot acceptance, results, and tiebreaks are decided server-side.
12. The wheel animation never determines the winner.
13. The final stage screen shows exactly two selected charts for the round.
14. Private CSV export is an admin download, not a public result export.
15. Dangerous actions require password re-entry and a clear summary.
16. Host lock prevents two admin browsers from operating controls at the same time.
17. Inactive players are not shown in the voting dropdown but can be restored by admin.
18. No official DOOM assets should be added unless the user confirms permission.
19. No reduced-motion UI should be added, but extreme flashing should still be avoided.
20. The app must be lightweight and avoid unnecessary always-on player phone connections.
21. Do not create GitHub Actions or `.github/workflows/*` until Phase 12.
22. Release-blocking Playwright full-tournament evidence must use the 48 -> 36 -> 24 -> 12
    active voting-player progression across Rounds 1 through 4.
