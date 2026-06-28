# Data Model

This document records the intended data model. Phase 2 adds the first Supabase migration at
`supabase/migrations/20260628050200_initial_schema.sql`.

## Core Entities

- `players`: start.gg usernames, active/inactive status, history guardrails
- `charts`: imported chart rows with normalized song and chart keys
- `chart_exclusions`: pre-event exclusions and reasons
- `rounds`: four tournament rounds
- `round_sets`: two chart sets per round with fixed draw and ban rules
- `draws`: audited draw attempts and reroll versions
- `drawn_charts`: ordered charts drawn into a set
- `voting_windows`: server-time voting windows and pause state
- `ballots`: latest valid player submissions
- `ballot_choices`: per-set bans or explicit no-ban selections
- `ballot_revisions`: ballot history and save attempts
- `result_snapshots`: committed result computation output
- `result_rows`: ban counts and reveal order
- `tiebreaks`: backend-committed tiebreak winners
- `admin_sessions`: HTTP-only admin session records
- `admin_actions`: audit log for tournament-changing actions
- `host_locks`: active host browser and heartbeat state
- `image_assets`: cached chart art and fallback assets
- `round_player_eligibility`: active player snapshot for a round after voting opens

## Locked Round Sets

| Round | Set 1 | Set 2 |
|---:|---|---|
| 1 | S16 | S17 |
| 2 | S18 | S19 |
| 3 | S20 | S21 |
| 4 | S22 | D23 |

Every set draws exactly 7 charts and allows at most 2 bans per player.

## Server Authority

The database and server-side code will be authoritative for draws, ballot acceptance, timer state,
result computation, tiebreaks, manual overrides, and CSV export.

## Security Defaults

The Phase 2 migration enables row level security on every core table and defines no browser-write
policies. Tournament-changing writes are intended to run through server-only modules using the
Supabase service-role client.
