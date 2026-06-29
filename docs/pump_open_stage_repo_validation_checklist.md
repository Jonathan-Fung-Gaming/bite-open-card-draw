# Pump It Up Open Stage App — Codex Repo Validation Checklist

Use this document to validate the repository against the final product decisions from the planning conversation.

This is intended for Codex to use as a **repo validation reference**. Codex should inspect the current codebase, compare it against every decision below, and produce a clear validation report with:

- `PASS`
- `FAIL`
- `PARTIAL`
- `NOT IMPLEMENTED`
- `NEEDS CLARIFICATION`

For every `FAIL`, `PARTIAL`, or `NOT IMPLEMENTED`, Codex should include:

- relevant file paths
- what currently happens
- what should happen instead
- whether the issue is blocking
- suggested fix
- suggested tests

Do **not** change tournament rules unless explicitly instructed.

---

# Highest-priority correction

The stage preview / voting display must use **two horizontal rows of 7 charts**, not 4+3 panels.

Correct stage layout:

```text
Top row:    7 charts from Set 1
Bottom row: 7 charts from Set 2

Example:
Round 1 — S16: [1] [2] [3] [4] [5] [6] [7]
Round 1 — S17: [1] [2] [3] [4] [5] [6] [7]
```

Phone layout is different and should remain:

```text
[1] [2]
[3] [4]
[5] [6]
   [7]
```

Codex should specifically search for old/stale stage-layout language or implementation that still uses:

```text
4 cards on top / 3 cards on bottom
compact 4+3 set panels
```

Those patterns are wrong for the stage preview and should be flagged.

---

# 1. Tournament structure decisions

| Area | Final decision |
|---|---|
| Tournament format | One tournament, not separate divisions. |
| Number of rounds | 4 rounds. |
| Chart sets per round | Each round has 2 chart sets. |
| Round 1 | S16 and S17. |
| Round 2 | S18 and S19. |
| Round 3 | S20 and S21. |
| Round 4 | S22 and D23. |
| Charts drawn per set | 7 charts per set. |
| Charts selected per round | 2 charts total, 1 from each chart set. |
| What players play | After voting, players play the 2 selected charts for that round. |
| Final round reveal | The final stage reveal should end by showing the 2 selected charts together. |
| Terminology | Use “chart set,” not “division,” for S16, S17, etc. |
| Expected player load | Up to 100 eligible players may use the site at once. |
| Project type | Hobby/volunteer website. Free-tier-conscious design is acceptable. |

## Validation checks

- Confirm the app models 4 rounds exactly.
- Confirm each round has exactly 2 chart sets.
- Confirm the round mapping is exactly:
  - Round 1: S16 / S17
  - Round 2: S18 / S19
  - Round 3: S20 / S21
  - Round 4: S22 / D23
- Confirm each set draws exactly 7 charts.
- Confirm each round selects exactly 2 charts: one from each set.
- Flag stale terminology if it causes logic confusion, especially if “division” is treated as a separate tournament.

---

# 2. Voting-window decisions

| Area | Final decision |
|---|---|
| Voting window scope | One 10-minute voting window covers both chart sets in the round. |
| Voting starts when | Voting starts only after both chart sets have been drawn. |
| Voting page flow | Players complete Set 1, then Set 2, then review and submit. |
| Back navigation | Players can go back and forth between Set 1 and Set 2 before submitting. |
| Skip behavior | There should be no vague “skip” option. |
| Required completion | Players must complete both chart sets before final submission. |
| Bans per set | Players may ban up to 2 charts per chart set. |
| Zero bans | Zero bans are allowed only through an explicit `No bans for this set` choice. |
| Partial ballots | Partial round ballots are not allowed. Both sets must be completed. |
| Submit behavior | One final Submit button submits the whole round ballot. |
| Edit behavior | Players may edit their submitted ballot until voting closes. |
| Save failure behavior | If a save fails, the prior server-saved ballot remains valid. |
| Deadline authority | Server/database time is authoritative, not the phone clock. |
| Early close | If every eligible player submits, show a 30-second final-change warning, then close automatically. |
| Final-change warning | Players may still edit during the 30-second warning. |
| Low turnout rule | If turnout is below 75% when the timer expires, extend by 1 minute once. |
| Low turnout after extension | After the 1-minute extension, close regardless of turnout. |
| Pause behavior | Host pause freezes both the timer and voting/editing. |
| Resume behavior | Host resume continues the countdown and allows voting/editing again. |
| Emergency reopen | Admin can reopen voting in an emergency with password confirmation and a chosen reopen duration. |
| Zero ballots | If zero ballots happen, use a spinner among all 7 charts for each chart set separately. |

## Validation checks

- Confirm there is one voting window per round, not one per chart set.
- Confirm the voting window is 10 minutes.
- Confirm voting cannot open before both sets have 7 drawn charts.
- Confirm a player cannot submit until both sets are complete.
- Confirm `No bans for this set` is explicit and separate from accidental non-selection.
- Confirm players can edit before close and cannot edit after close.
- Confirm the server/database deadline is authoritative.
- Confirm the 75% extension happens at most once.
- Confirm the all-submitted 30-second warning allows final edits.
- Confirm pause freezes both countdown and voting/editing.
- Confirm emergency reopen requires admin password confirmation.

---

# 3. Player identity decisions

| Area | Final decision |
|---|---|
| Player identity label | The selector should say `Select your start.gg username`. |
| Username source | Players are listed by start.gg username. |
| Name confirmation | After selecting a name, show `Are you sure you are voting as [start.gg username]?` |
| Credential codes | Do not use player credential codes. |
| Badge QR login | Do not use badge-specific QR codes. |
| General QR | The QR code points to a general room link. |
| Player verification | Name-only selection with confirmation. |
| Duplicate usernames | Duplicate active start.gg usernames are not allowed. |
| Remembered identity | After the first round, the player’s selected username should be remembered on that device. |
| Wrong-name correction | A player can change their name before their first submitted ballot; after that, admin reset is preferred. |
| Second device behavior | If the same username opens on another phone, show a warning and allow the latest valid submitted ballot to count. |
| Event-only identity | Identity/session only needs to last for the event. |
| Inactive players | Inactive/eliminated players should not appear in the voting dropdown. |
| Reactivating players | Admin must be able to reactivate/add back inactive players if they were removed by mistake. |

## Validation checks

- Confirm the selector says `Select your start.gg username`.
- Confirm the confirmation copy includes the selected start.gg username.
- Confirm there are no player credential codes or badge-specific QR assumptions.
- Confirm duplicate active start.gg usernames are blocked.
- Confirm inactive players are hidden from the voting dropdown.
- Confirm reactivation is possible from admin.
- Confirm same-username second-device warning exists.
- Confirm latest valid submitted ballot wins.

---

# 4. Spectator and room-link decisions

| Area | Final decision |
|---|---|
| QR destination | QR points to `/room`, a general room landing page. |
| Room options | `/room` should show `I am a player voting` and `View charts only`. |
| Spectator mode | Spectators can use `View charts only`. |
| Spectator permissions | Spectators can see charts but cannot vote, select a username, affect turnout, or affect ban counts. |
| View-only navigation | View-only users can move between both chart sets. |
| No skip for voters | Voters should not have a skip step; they must complete both sets. |
| Chart visibility | Spectators may see both chart sets once they are drawn. |

## Validation checks

- Confirm the QR points to `/room`, not `/vote` and not a player-specific link.
- Confirm `/room` has both options:
  - `I am a player voting`
  - `View charts only`
- Confirm view-only users cannot submit or affect turnout.
- Confirm view-only mode can see both chart sets.

---

# 5. Roster decisions

| Area | Final decision |
|---|---|
| Initial roster | Admin manually inputs the initial roster. |
| Roster input method | Support copy/paste names line by line. Bulk paste/import is useful. |
| Roster basis | Roster entries are start.gg usernames. |
| Eliminations | Players are eliminated between rounds by marking them inactive. |
| Deletion behavior | Do not hard-delete eliminated players; keep them inactive/eliminated. |
| Active voting dropdown | Only active eligible players appear in the voting dropdown. |
| Admin roster view | Admin can still see inactive/eliminated players. |
| Restore mistake | Admin can add back/reactivate an inactive player if there was an error. |
| Active-round eligibility | When voting opens, snapshot the active eligible roster for that round. |
| Routine roster changes | Routine roster changes after voting opens should apply to future rounds, not silently change the active round. |
| Emergency current-round add | Admin can add a player back to the current round eligibility with password confirmation. |

## Validation checks

- Confirm roster entries are start.gg usernames.
- Confirm inactive/eliminated players are retained, not deleted.
- Confirm only active eligible players appear to voters.
- Confirm admins can reactivate players.
- Confirm current-round eligibility is snapshotted when voting opens.
- Confirm emergency current-round add is treated as dangerous and requires password confirmation.

---

# 6. Chart-pool and data decisions

| Area | Final decision |
|---|---|
| Chart source | Use the uploaded chart CSV. |
| CSV columns | `name`, `name_kr`, `artist`, `label`, `type`, `level`, `bg_img`. |
| Required pools | S16, S17, S18, S19, S20, S21, S22, D23. |
| Pool size | Uploaded CSV has enough charts for all required pools. |
| Eligible by default | Matching charts are eligible by default. |
| Pre-event exclusions | Admin can pre-exclude charts before the event. |
| Exclusion reason | Chart exclusions should store a reason. |
| Chart removal | Use versioned exclusion/soft removal, not destructive deletion. |
| Pool snapshot | The eligible pool should be snapshotted before a draw. |
| Chart image source | Use `bg_img` from the CSV as the source image URL. |
| Image hosting | Cache/download chart images locally before the event. |
| Missing images | Missing art should use a fallback card, not break the draw. |
| Tournament logo | Use the uploaded tournament logo in the app. |
| Song identity | Normalize song identity using name/artist. |
| Chart identity | Normalize chart identity using song + artist + type + level. |

## Validation checks

- Confirm chart import expects the correct columns.
- Confirm only required tournament pools are used for draws.
- Confirm chart exclusions work and store reasons.
- Confirm excluded charts cannot be drawn.
- Confirm local cached images or fallback images are used.
- Confirm remote image failure does not break the draw.
- Confirm the tournament logo is used in the app.

---

# 7. Repeat and eligibility decisions

| Area | Final decision |
|---|---|
| Future-round repeat rule | Selected songs are blocked from future rounds. |
| Drawn-but-not-selected songs | Drawn songs that are not selected may appear in a later round unless blocked by another rule. |
| Same-round duplicate song | Do not draw the same song in both chart sets of the same round. |
| Same chart duplicate | A set cannot draw the same chart twice. |
| Excluded charts | Excluded charts cannot be drawn. |
| Selected prior songs | Songs selected in prior rounds cannot be drawn later. |
| One invalid chart | If one drawn chart is invalid, replace only that invalid chart where possible. |
| Reroll history | Rerolls should preserve prior draw history. |

## Validation checks

- Confirm selected songs from prior rounds are excluded from future draws.
- Confirm drawn-but-not-selected songs are not globally blocked.
- Confirm the same song cannot be drawn in both sets of the same round.
- Confirm exact chart duplicates cannot appear within the same set.
- Confirm rerolls preserve history instead of overwriting silently.

---

# 8. Draw decisions

| Area | Final decision |
|---|---|
| Draw authority | Backend/server decides the draw. |
| Browser randomness | Do not use browser randomness for tournament decisions. |
| Draw animation | Animation only reveals an already-decided draw. |
| Charts per set | Exactly 7 unique charts per set. |
| Draw order | Store draw order for reveal animation. |
| Set reveal order | Reveal all 7 charts from Set 1, then all 7 charts from Set 2. |
| Voting precondition | Voting cannot open until both sets have exactly 7 drawn charts. |
| Reroll allowed | Rerolling is allowed. |
| Reroll confirmation | Rerolling requires an “Are you sure?”-style dangerous action prompt. |
| Reroll password | Rerolling requires admin password re-entry. |
| Reroll types | Support rerolling one chart, one set, or the full round. |
| Post-vote reroll | Rerolling after voting opens is dangerous and should pause/clear/invalidate affected voting state with strong warnings. |
| Audit | Draws and rerolls should be auditable. |

## Validation checks

- Confirm draw/tiebreak/random decisions are made server-side.
- Confirm browser-side animation never decides results.
- Confirm draw history and reroll history are stored.
- Confirm voting is blocked until both sets are complete.
- Confirm reroll one chart, one set, and full round paths exist or are explicitly deferred with a warning.

---

# 9. Stage-display decisions

| Area | Final decision |
|---|---|
| Stage route | Use a separate stage route, such as `/stage`. |
| Stage purpose | Projector/stage visualizer. |
| Stage includes | Logo, round, set labels, chart cards, voting status, timer, QR code. |
| Stage chart preview | **Two rows of 7 charts.** |
| Stage top row | First chart set, e.g. S16. |
| Stage bottom row | Second chart set, e.g. S17. |
| Stage preview correction | Do **not** use compact 4+3 layout for the stage preview after both sets are drawn. |
| Stage reveal correction | Prefer revealing Set 1 into the top 7-card row and Set 2 into the bottom 7-card row. |
| Stage labels | Each row should clearly show its chart set label. |
| Final stage screen | Final screen shows the 2 selected charts together. |
| Stage refresh | Refreshing the stage should reconstruct the current state from the backend. |
| Stage standby | Failure/reconnect state should be themed rather than blank. |

## Required correction text for Codex

Replace any stage implementation or documentation that says:

```text
4 cards on top / 3 cards on bottom
compact 4+3 arrangement inside each set panel
```

with:

```text
The stage preview and voting display should use two horizontal rows of 7 charts.

Top row:
Set 1, labeled with its chart set, such as Round 1 — S16.

Bottom row:
Set 2, labeled with its chart set, such as Round 1 — S17.

During reveal, charts should fill these rows one at a time:
first all 7 charts in the top row, then all 7 charts in the bottom row.

Do not use 4+3 on the stage preview. The 4+3-style decision was superseded by the two-sets-on-one-screen requirement.
```

## Validation checks

- Confirm `/stage` exists.
- Confirm stage preview is exactly two rows of 7 charts.
- Confirm the first row is Set 1 and the second row is Set 2.
- Confirm labels are visible.
- Confirm QR and timer are present during voting.
- Confirm the final screen shows exactly the two selected charts.
- Confirm refresh reconstructs stage state.

---

# 10. Phone-layout decisions

| Area | Final decision |
|---|---|
| Phone chart layout | Two columns. |
| Phone 7th card | The 7th card should be centered in the last row. |
| Phone set flow | Step 1: first chart set; Step 2: second chart set; Step 3: review/submit. |
| Phone navigation | Players can go next/back between sets before final submission. |
| Phone saved ballot | Show saved choices and timestamp after submission. |
| Phone editing | Show `Change vote` until voting closes. |
| Phone after close | Before stage reveal finishes, show that results are being revealed on stage. |
| Phone after reveal | Show the two selected charts first, then expandable full ban counts. |
| Phone result spoiler | Do not spoil full results on phones before the stage reveal finishes. |

## Validation checks

- Confirm phone layout is two columns with centered 7th card.
- Confirm phone does not use the stage two-row 7+7 layout.
- Confirm phones do not show results before stage reveal finishes.
- Confirm phones show selected charts first after reveal.

---

# 11. Visual-theme decisions

| Area | Final decision |
|---|---|
| Theme direction | Doom-inspired original theme, not direct DOOM asset usage. |
| Primary visual concept | Infernal industrial terminal / rune-metal style. |
| Colors | Black/dark metal with orange and red glow. |
| Violence level | Stylized heat, chains, sparks, metal; no graphic gore. |
| Card back | Original mechanical plate with abstract/rune glyph. |
| Reveal style | Dramatic one-at-a-time chart reveal. |
| Reveal speed | Configurable, default around 1.5–2 seconds per chart. |
| Official assets | Do not use official DOOM assets unless permission exists. |
| Tournament logo | Include uploaded tournament logo. |
| Reduced-motion UI | Do not include a reduced-motion option in the UI. |
| Motion caution | Still avoid extreme strobing or unreadable flashing. |
| Audio | Use original/licensed audio cues only, with mute control if audio is included. |
| Winner highlight | Highlight selected chart dramatically, such as pale energy, chain break, or enlarged card. |

## Validation checks

- Confirm no official DOOM assets are bundled unless explicitly authorized.
- Confirm the uploaded tournament logo is used.
- Confirm there is no reduced-motion UI toggle.
- Confirm animations do not rely on flashing/strobing to communicate state.

---

# 12. QR and timer decisions

| Area | Final decision |
|---|---|
| QR target | QR points to the general room link, not a player-specific link. |
| QR route | `/room`. |
| QR placement | Above the cards and to the right of the large timer. |
| QR label | Make clear it is for voting or viewing charts. |
| QR fallback | Show a short URL beneath the QR. |
| Timer style | Large, prominent timer with themed frame. |
| Timer placement | Timer should be large and visually dominant during voting. |
| Timer authority | Timer display is visual; backend deadline is authoritative. |

## Validation checks

- Confirm QR encodes `/room`.
- Confirm short URL is visible under QR.
- Confirm timer is prominent.
- Confirm timer state derives from backend/server deadline.

---

# 13. Result-computation decisions

| Area | Final decision |
|---|---|
| Result metric | Ban counts only. |
| Percentages | Do not show percentages. |
| Result count basis | Count submitted bans per chart. |
| Zero-ban charts | Include charts with zero bans in results. |
| Public pre-result stats | Show ballots submitted and total ban selections cast, but not chart counts. |
| Reveal order | Reveal from least banned to most banned. |
| Winning criterion | Least-banned chart wins the set. |
| Ties above minimum | List sequentially/alphabetically. |
| Winning tie | If least-banned charts tie, use tiebreak spinner. |
| Results per set | Resolve one chart set, then the other. |
| Final round result | Show both selected charts together after both sets are resolved. |
| Phone result display | Selected charts first, expandable full counts after stage reveal. |
| Public results route | Results may be visible after stage reveal. |

## Validation checks

- Confirm no percentages appear in final results.
- Confirm zero-ban charts are counted and displayed.
- Confirm results sort least banned to most banned.
- Confirm least-banned chart wins.
- Confirm results resolve Set 1 and Set 2 separately.
- Confirm final round result shows two selected charts together.

---

# 14. Tiebreak decisions

| Area | Final decision |
|---|---|
| Tiebreak trigger | Only ties for the least-banned chart. |
| Tiebreak per set | Tiebreaks run separately for each chart set. |
| Tiebreak authority | Backend decides winner before animation. |
| Spinner role | Spinner only reveals the pre-decided winner. |
| Spinner duration | 5 seconds. |
| Spinner style | Circular rune selector. |
| Wheel slots | 12-slot rune-style wheel. |
| 2-way tie | Alternate the two chart names around the 12 slots. |
| 3-way tie | Cycle the three chart names around the 12 slots. |
| 4-way tie | Repeat the four chart names around the 12 slots. |
| 5+ tie | Extremely unlikely; do not build special dramatic handling. Use a simple safe fallback if it occurs. |
| Non-minimum tie | No spinner; list alphabetically. |

## Validation checks

- Confirm tiebreak is only used for minimum-ban ties.
- Confirm backend commits winner before animation starts.
- Confirm spinner runs for 5 seconds.
- Confirm 2-, 3-, and 4-way ties populate 12 slots.
- Confirm 5+ ties do not crash the app.
- Confirm non-minimum ties do not trigger spinner.

---

# 15. Admin-route decisions

| Area | Final decision |
|---|---|
| Admin route | `/coolguy69`. |
| Route configurability | Hard-code `/coolguy69`. |
| Admin access | Shared password only. |
| Admin roles | No role permissioning; one admin role. |
| MFA | Not required. |
| Hidden route | Secret/unlinked route plus password. |
| Admin session | Use an admin session after password entry. |
| Password storage | Store password hash, not plaintext password. |
| Admin inactivity | Include inactivity timer. |
| Inactivity duration | 30 minutes is the recommended default. |
| Host lock | Include host lock. |
| Host takeover | Allow takeover if heartbeat expires or with warning. |
| Multiple admin screens | Only active host can operate controls; others are read-only/standby. |
| Active host determination | `Take Host Control` button plus heartbeat. |

## Validation checks

- Confirm `/coolguy69` exists and is password-protected.
- Confirm password hash is used instead of plaintext in source.
- Confirm no admin secrets are exposed client-side.
- Confirm inactivity timeout exists.
- Confirm host lock exists.
- Confirm non-host admin screens cannot trigger host controls.

---

# 16. Dangerous admin-action decisions

| Area | Final decision |
|---|---|
| Dangerous actions | Actions that can change tournament state/result require password confirmation. |
| Password prompt | Prompt must summarize exactly what is about to happen. |
| Prompt content | Include action and consequence. |
| Second admin | Not required. |
| Typed reason | Use reasons for audit-sensitive actions where helpful. |
| Reroll | Dangerous. |
| Replace chart | Dangerous. |
| Reopen voting | Dangerous. |
| Manual ballot | Dangerous. |
| Override existing ballot | Dangerous. |
| Add inactive player to current round | Dangerous. |
| Reset round | Dangerous. |
| Override selected result | Dangerous/emergency only. |
| Live counts | Sensitive but not destructive; warning button only, no password required. |

## Validation checks

- Confirm dangerous actions require password re-entry.
- Confirm the prompt describes the specific action and consequence.
- Confirm live counts have a warning but no extra password.
- Confirm dangerous actions are logged/audited.

Example dangerous-action copy:

```text
You are about to manually replace a ballot for [start.gg username].
This may change the round result.
Enter the admin password to continue.
```

---

# 17. Admin live-count decisions

| Area | Final decision |
|---|---|
| Public live chart counts | Not visible. |
| Admin live chart counts | Available through `/coolguy69`. |
| Live-count visibility | Hidden by default behind a `Show live counts` warning button. |
| Extra password for live counts | No extra password required. |
| Warning purpose | Prevent accidental projection or stream exposure. |
| Turnout visible publicly | Ballots submitted and total ban selections cast may be shown. |
| Vote choices visible to admin | Admin can inspect as needed for manual/audit functions, but normal public screens do not show choices. |

## Validation checks

- Confirm public/stage/phone screens do not show live chart counts before close.
- Confirm admin can reveal live chart counts behind a warning.
- Confirm live count reveal does not require password.
- Confirm live counts are not accidentally rendered by default.

---

# 18. Manual ballot and override decisions

| Area | Final decision |
|---|---|
| Manual ballot support | Admin can manually submit or override a ballot if something breaks. |
| Manual ballot timing | Allowed while voting is open. |
| Post-close manual ballot | Allowed after close but before results reveal. |
| After-reveal override | Not a normal action; should be treated as a correction workflow. |
| Existing ballot check | UI must automatically check if the player already has a ballot. |
| Existing ballot warning | If one exists, ask for confirmation before replacing. |
| Manual ballot fields | Player, Set 1 choices, Set 2 choices, reason, replace-existing confirmation. |
| Manual override export | Manual overrides must be marked in the private CSV. |
| Password | Manual ballot/override requires admin password. |

## Validation checks

- Confirm manual ballot creation exists.
- Confirm existing ballot warning exists.
- Confirm manual post-close ballots are allowed only before results reveal.
- Confirm after-reveal override is not part of normal flow.
- Confirm private CSV marks manual overrides.

---

# 19. Export decisions

| Area | Final decision |
|---|---|
| Export type | Admin/private ballot export. |
| Public export | Not needed. Not intended to be publicly shareable. |
| Export format | CSV. |
| Export timing | After each round. |
| Saved location | Saved to the host computer through browser download. |
| Auto-download | Auto-download once after final reveal. |
| Manual download | Also include manual re-download button. |
| Export contents | Player-level ballot data, selected charts, timestamps, manual override markers. |
| Export privacy | Treat as private/admin-only. |
| Rerolls in export | Rerolls should be stored/auditable and included or traceable in admin data. |

## Suggested private CSV content

```text
round_number
player_startgg_username
submitted
submitted_at
set_1_label
set_1_ban_1
set_1_ban_2
set_1_no_bans
set_2_label
set_2_ban_1
set_2_ban_2
set_2_no_bans
manual_override
override_reason
replaced_existing_ballot
selected_set_1_chart
selected_set_2_chart
set_1_tiebreak_used
set_2_tiebreak_used
```

## Validation checks

- Confirm private CSV export exists.
- Confirm export is admin-only.
- Confirm auto-download occurs once after final reveal, if implemented.
- Confirm manual re-download button exists.
- Confirm player-level ballot data is included.
- Confirm manual overrides are clearly marked.

---

# 20. Routes and page-separation decisions

| Route | Final purpose |
|---|---|
| `/stage` | Public/projector stage display. |
| `/room` | General QR landing page. |
| `/vote` | Player voting flow. |
| `/charts` | View-only chart display. |
| `/results` | Post-reveal results page. |
| `/coolguy69` | Password-protected admin/host console. |

## Validation checks

- Confirm all routes exist or are intentionally redirected.
- Confirm host/admin and player voting screens are separate.
- Confirm `/room` is the QR destination.
- Confirm `/coolguy69` is not linked publicly.

---

# 21. Technical architecture decisions

| Area | Final decision |
|---|---|
| Hosting | Vercel. |
| Database | Supabase Postgres. |
| Framework | Next.js with TypeScript. |
| Mutations | Server-side API routes/server actions for tournament-changing operations. |
| Authoritative state | Database/server state, not browser state. |
| Service key | Never expose service-role key to browser code. |
| Draw randomness | Server-side randomness only. |
| Tiebreak randomness | Server-side randomness only. |
| Realtime usage | Stage/admin can use Realtime; player phones should use normal requests/light polling. |
| Free-tier-conscious | Avoid unnecessary always-on phone Realtime connections. |
| Deadline source | Server/database time. |
| Offline ballots | Do not accept offline/local queued ballots. |
| Failure fallback | Pause and fix the website. |
| Browser support | Recent iOS Safari, Android Chrome, and stage Chrome. |
| Rate limiting | Use basic rate-limiting for sensitive actions where practical. |
| Monitoring | Basic health/status for admin is useful. |
| Image storage | Locally cached chart images or controlled storage. |
| Backup/export | Private CSV exports after rounds; source CSV and logo archived. |

## Validation checks

- Confirm no service-role key is imported into client code.
- Confirm tournament-changing mutations go through server-side code.
- Confirm phones are not using unnecessary always-on Realtime connections.
- Confirm server/database time is used for deadlines.
- Confirm offline/local queued ballots are not accepted.
- Confirm failure fallback is pause/fix, not automatic random selection.

---

# 22. Environment and deployment decisions

| Area | Final decision |
|---|---|
| Public availability | Site can be technically public but not announced before the event. |
| Full-site password gate | Not required. |
| Admin route privacy | `/coolguy69` is hidden/unlinked and password-protected. |
| Hosting plan | Free/hobby-friendly setup is acceptable for this volunteer use case. |
| Development environment | Local development is still needed. |
| Staging environment | Not required as a separate public staging site. |
| Production site | Main deployed site for event use. |
| Venue fallback | If the website fails, pause and fix it. |
| Load test | Test with at least 100 eligible players and some spectators/view-only users. |

## Validation checks

- Confirm no full-site password gate was added unless explicitly requested later.
- Confirm admin route remains protected.
- Confirm app is lightweight enough for hobby/free-tier usage.
- Confirm load-testing scripts or notes exist for 100 eligible players.

---

# 23. Codex/process decisions

| Area | Final decision |
|---|---|
| Codex execution | Codex should receive the execution plan and execute one phase at a time automatically. |
| Phase 0 | Phase 0 manual setup guide exists separately. |
| Execution plan | Phase 1 onward plan excludes Phase 0 manual setup. |
| GitHub Actions | Do not create GitHub Actions workflow until the final phase. |
| CI workflow timing | `.github/workflows/*` should be deferred to Phase 12. |
| Subagents | Use subagents/parallel Codex threads for implementation, testing, rules review, security review, and UI review. |
| Acceptance gates | Each phase should pass its acceptance criteria before moving forward. |
| Project instructions | Use `AGENTS.md` as the Codex source-of-truth instruction file. |
| Source docs | Product spec and implementation plan should be kept in `/docs`. |
| Secrets | `.env.example` only in repo; real secrets stay out of Git. |

## Validation checks

- Confirm `.github/workflows/*` was not created before the final CI phase unless explicitly requested later.
- Confirm `AGENTS.md` exists and reflects the final decisions.
- Confirm docs are consistent with this validation file.
- Confirm real secrets are not committed.
- Confirm `.env.example` contains placeholders only.

---

# 24. Repo validation report format

When Codex validates the repo, it should produce a report like this:

```markdown
# Repo Validation Report

## Summary

- Overall status:
- Blocking issues:
- Non-blocking issues:
- Tests run:
- Build/lint/typecheck status:

## Highest-priority checks

| Check | Status | Notes |
|---|---|---|
| Stage preview is two rows of 7 charts | PASS/FAIL | ... |
| QR points to /room | PASS/FAIL | ... |
| One 10-minute voting window per round | PASS/FAIL | ... |
| Players must complete both sets | PASS/FAIL | ... |
| No percentages in results | PASS/FAIL | ... |
| Server decides draw/tiebreak | PASS/FAIL | ... |
| GitHub Actions deferred to final phase | PASS/FAIL | ... |

## Detailed findings

### Finding 1: [Title]

- Status:
- Severity:
- Files:
- Current behavior:
- Expected behavior:
- Suggested fix:
- Suggested tests:

## Suggested next steps

1.
2.
3.
```

---

# 25. Specific grep/search targets for Codex

Codex should search the repo for these stale or risky terms:

```text
4+3
4 cards
3 cards
compact set panel
division
percentage
percent
Math.random
random()
skip
player code
credential
badge QR
live counts
service_role
SUPABASE_SERVICE_ROLE_KEY
.github/workflows
```

Notes:

- `division` is not automatically wrong if used internally, but it should be flagged if it represents separate tournament divisions instead of chart sets.
- `percentage` or `percent` is not automatically wrong in generic code, but it should be flagged if displayed in results.
- `Math.random` is not allowed for tournament decisions. It may be acceptable for decorative particles only if clearly isolated from draws/tiebreaks.
- `.github/workflows` should be absent until the final CI phase.

---

# 26. Final validation emphasis

The most important checks are:

1. Stage preview must be two rows of 7 charts.
2. QR must point to `/room`.
3. Players must vote through one round ballot covering both sets.
4. Players must complete both sets before submitting.
5. Zero bans must be explicit with `No bans for this set`.
6. Results use ban counts only, not percentages.
7. Least-banned chart wins each set.
8. Tiebreak winner is decided server-side before animation.
9. Final reveal shows exactly two selected charts together.
10. Admin/private CSV export is player-level and not public.
11. Dangerous actions require password re-entry and action summary.
12. No GitHub Actions workflow should exist until the final phase.
