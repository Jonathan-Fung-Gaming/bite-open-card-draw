# Product Specification - Pump It Up Open Stage Voting App

## Purpose

Build a web app for a Pump It Up Open Stage tournament. The app draws charts, displays a dramatic stage visualization, lets players vote to ban drawn charts from their phones, resolves selected charts, and exports a private admin ballot CSV.

## Tournament structure

There is one tournament with 4 rounds.

Each round has 2 chart sets:

| Round | Set 1 | Set 2 |
|---:|---|---|
| 1 | S16 | S17 |
| 2 | S18 | S19 |
| 3 | S20 | S21 |
| 4 | S22 | D23 |

For each chart set:

- Draw 7 charts.
- Players vote to ban charts.
- The chart with the fewest bans is selected.
- If multiple charts tie for fewest bans, use a backend-decided tiebreak and reveal it through a 5-second rune-wheel animation.

After voting and reveal, each round produces 2 final charts: 1 selected chart from each set.

The final stage screen for a round must show both selected charts together.

## Chart source

The chart CSV is stored at:

```text
data/source/charts.csv
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

The tournament logo is stored at:

```text
public/brand/tournament-logo.png
```

## Chart image strategy

Chart images should be cached locally before the event or otherwise served from controlled storage. The app should not rely on live third-party image URLs during the tournament.

Missing chart artwork must not break the app. Use a fallback title card if needed.

## Chart eligibility

All matching charts are eligible by default, but admin can pre-exclude charts before the event.

A chart is eligible for a set if:

- chart type and level match the set
- chart is not excluded
- chart does not use the same song key as a selected chart from an earlier round
- chart does not duplicate a song already drawn in the other set of the same round

Only selected songs are blocked from later rounds.

## Routes

Required routes:

```text
/stage
/room
/vote
/charts
/results
/coolguy69
```

`/stage` is the projector/stage display.

`/room` is the general QR destination.

`/vote` is the player voting flow.

`/charts` is view-only chart display.

`/results` shows results after the stage reveal.

`/coolguy69` is the admin route.

## QR behavior

The QR code points to a general room link, not a player-specific link.

The room page should offer:

```text
I am a player voting
View charts only
```

View-only users can see charts and post-reveal results but cannot submit votes or affect turnout.

## Player identity

Players must select their start.gg username from an alphabetical dropdown.

The label must say:

```text
Select your start.gg username
```

After selecting a username, the app must show:

```text
Are you sure you are voting as [start.gg username]?
```

Duplicate active start.gg usernames are not allowed.

If the same username is opened on another phone, warn the user and allow the latest valid submitted ballot to win.

## Ballot behavior

Each round has one voting form covering both chart sets.

Players may ban up to 2 charts per chart set.

A chart set is complete only if the player either:

- selects 1 or 2 banned charts, or
- explicitly selects `No bans for this set`

Do not include a vague skip button.

Players can move forward and backward between chart sets before final submission.

Players submit one final round ballot.

After submission, players may edit their ballot until voting closes.

If a save fails, the previous server-confirmed ballot remains valid.

## Voting window

Voting opens only after both chart sets in a round have been drawn.

Each round has one 10-minute voting window for both chart sets.

Use server/database time as the official time source. Client timers are visual only.

Before chart-by-chart results are revealed, public screens may show:

```text
Ballots submitted: X / Y
Ban selections cast: Z
```

Public screens must not show live chart-by-chart counts.

Admin may see live chart counts through `/coolguy69`, but counts must be hidden behind a warning button and not shown by default.

## Turnout and timer rules

If turnout is below 75% when the timer expires:

- extend voting by 1 minute once
- then close after that minute regardless of turnout

If every eligible player submits early:

- show a 30-second final-change warning
- allow changes during those 30 seconds
- then close automatically

If host pauses voting:

- freeze timer
- freeze submissions
- freeze edits

## Results behavior

Results use ban counts only, not percentages.

For each chart set:

- reveal from least banned to most banned
- show ban count badges and/or small bars
- reveal non-winning ties alphabetically
- if the least-banned chart is unique, select it
- if multiple charts tie for fewest bans, run the 5-second rune-wheel tiebreak

The backend must choose any tiebreak winner before the animation starts. The animation only reveals the already-decided winner.

## Rune-wheel tiebreak

The normal rune wheel is a 12-slot Doom/rune-inspired selector.

For 2 tied charts, repeat each chart 6 times.

For 3 tied charts, repeat each chart 4 times.

For 4 tied charts, repeat each chart 3 times.

If 5 or more charts tie, use a simple fallback reveal. Do not build a special complex edge-case animation.

## Final reveal

After both sets are resolved, the stage should show:

```text
ROUND X FINAL CHARTS
[Selected Set 1 Chart]
[Selected Set 2 Chart]
```

Phones should not spoil results before the stage reveal finishes.

Before stage reveal finishes, phones should show:

```text
Voting is closed.
Results are being revealed on stage.
```

After stage reveal finishes, phones should show the two selected charts first, then expandable full ban counts.

## Admin behavior

Admin route:

```text
/coolguy69
```

Use one shared admin password.

Store only a password hash, not plaintext.

Include:

- host lock
- admin inactivity timer
- roster management
- chart exclusions
- draw controls
- voting controls
- result reveal controls
- dangerous action confirmations
- private CSV export

Dangerous actions require the admin password again and must summarize what the action will do before asking for the password.

Dangerous actions include:

- rerolling a set
- rerolling a round
- replacing a chart
- reopening voting
- manually entering a ballot
- overwriting an existing ballot
- adding an inactive player back into the current round
- overriding a result
- resetting a round

Live count reveal is sensitive but not destructive. It should have a warning button but does not require another password.

## Host lock

Only one active host should control the tournament.

Host lock behavior:

- Admin logs in.
- Admin clicks `Take Host Control`.
- That browser becomes active host.
- It sends a heartbeat.
- Other admin browsers are read-only unless they take over.
- If heartbeat expires, another admin can take over.

## Roster behavior

Admin can:

- add start.gg usernames
- bulk import start.gg usernames
- mark players active
- mark players inactive/eliminated
- reactivate inactive players
- edit typos before player has tournament history
- see current active player count

Voting dropdown should show only active eligible players.

Admin roster should keep inactive/eliminated players visible and restorable.

When a voting window opens, snapshot the active player list for that round.

Routine roster changes after voting opens apply to future rounds.

Emergency current-round eligibility changes require password and audit reason.

## Private CSV export

Export an admin/private ballot CSV saved to the host computer by browser download.

This is not a public results export.

Recommended behavior:

- auto-download once after the final two charts are revealed
- also provide a manual `Download private ballot CSV` button

CSV should include player-level ballot data, manual overrides, selected charts, and tiebreak flags.

## Visual direction

Use an original Doom-inspired industrial/rune theme:

- black background
- metallic panels
- orange/red glow
- rune accents
- dramatic chart card reveal

Do not use official DOOM assets unless separately licensed or approved.

No reduced-motion toggle should appear in the UI.

Still avoid extreme strobing, full-screen flashing, or unreadable camera shake.

## Technical principles

Use Vercel and Supabase.

Keep the app lightweight and free-tier-conscious.

Player phones should use normal requests and light polling rather than always-on Realtime connections.

Server/database state is authoritative.

Do not rely on browser randomness for draws or tiebreaks.

Do not expose service-role keys or secret keys to browser code.
