# Decision Log

## Locked decisions

- The tournament has 4 rounds.
- Each round has 2 chart sets.
- Players play 2 charts per round, 1 selected from each set.
- Round 1: S16 and S17.
- Round 2: S18 and S19.
- Round 3: S20 and S21.
- Round 4: S22 and D23.
- Draw 7 charts per set.
- One 10-minute voting window covers both sets in the round.
- Players may ban up to 2 charts per set.
- A set can be completed with explicit `No bans for this set`.
- No vague skip button.
- Player selector uses start.gg usernames.
- Confirm selected username with `Are you sure you are voting as [start.gg username]?`.
- QR code goes to a general room link.
- Room link has `I am a player voting` and `View charts only`.
- Spectators can view charts but cannot submit votes.
- Results use ban counts only, not percentages.
- Stage count phases show all 7 sorted rows for a set at once; selected/winner reveal remains a
  separate host-advanced phase.
- Admin route is `/coolguy69`.
- Admin uses one shared password.
- Dangerous actions require password re-entry and action summary.
- Use host lock.
- Include admin inactivity timer.
- Admin live counts are allowed but hidden behind a warning button.
- Export is private player-level ballot CSV by browser download.
- Use locally cached or controlled chart images for event reliability.
- Allow pre-event chart exclusions.
- Selected songs are blocked from later rounds.
- Same song should not be drawn in both sets of the same round.
- Normal tiebreak wheel handles 2, 3, or 4 tied charts.
- 5+ chart least-ban tie uses simple fallback reveal, including zero-ballot seven-way ties.
- No reduced-motion UI toggle.
