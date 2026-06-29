alter table public.players
  add column if not exists event_id text not null default 'local-dev';
alter table public.chart_exclusions
  add column if not exists event_id text not null default 'local-dev';
alter table public.draws
  add column if not exists event_id text not null default 'local-dev';
alter table public.drawn_charts
  add column if not exists event_id text not null default 'local-dev';
alter table public.voting_windows
  add column if not exists event_id text not null default 'local-dev';
alter table public.round_player_eligibility
  add column if not exists event_id text not null default 'local-dev';
alter table public.ballots
  add column if not exists event_id text not null default 'local-dev';
alter table public.ballot_choices
  add column if not exists event_id text not null default 'local-dev';
alter table public.ballot_revisions
  add column if not exists event_id text not null default 'local-dev';
alter table public.result_snapshots
  add column if not exists event_id text not null default 'local-dev';
alter table public.result_rows
  add column if not exists event_id text not null default 'local-dev';
alter table public.tiebreaks
  add column if not exists event_id text not null default 'local-dev';
alter table public.admin_sessions
  add column if not exists event_id text not null default 'local-dev';
alter table public.admin_actions
  add column if not exists event_id text not null default 'local-dev';
alter table public.host_locks
  add column if not exists event_id text not null default 'local-dev';

alter table public.players
  add constraint players_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.chart_exclusions
  add constraint chart_exclusions_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.draws
  add constraint draws_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.drawn_charts
  add constraint drawn_charts_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.voting_windows
  add constraint voting_windows_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.round_player_eligibility
  add constraint round_player_eligibility_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.ballots
  add constraint ballots_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.ballot_choices
  add constraint ballot_choices_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.ballot_revisions
  add constraint ballot_revisions_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.result_snapshots
  add constraint result_snapshots_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.result_rows
  add constraint result_rows_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.tiebreaks
  add constraint tiebreaks_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.admin_sessions
  add constraint admin_sessions_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.admin_actions
  add constraint admin_actions_event_id_not_blank check (length(trim(event_id)) > 0);
alter table public.host_locks
  add constraint host_locks_event_id_not_blank check (length(trim(event_id)) > 0);

drop index if exists public.players_active_username_unique;
create unique index if not exists players_active_event_username_unique
  on public.players (event_id, startgg_username_normalized)
  where active = true;

drop index if exists public.chart_exclusions_chart_idx;
create index if not exists chart_exclusions_event_chart_idx
  on public.chart_exclusions (event_id, chart_id, excluded);

alter table public.admin_sessions
  drop constraint if exists admin_sessions_session_token_hash_key;
alter table public.admin_sessions
  add constraint admin_sessions_event_token_hash_unique unique (event_id, session_token_hash);

create index if not exists admin_actions_event_idx
  on public.admin_actions (event_id, created_at);

alter table public.draws
  drop constraint if exists draws_round_set_id_draw_version_key;
alter table public.draws
  add constraint draws_event_round_set_version_unique unique (event_id, round_set_id, draw_version);

alter table public.drawn_charts
  drop constraint if exists drawn_charts_draw_id_chart_id_key;
alter table public.drawn_charts
  drop constraint if exists drawn_charts_draw_id_draw_order_key;
alter table public.drawn_charts
  add constraint drawn_charts_event_draw_chart_unique unique (event_id, draw_id, chart_id);
alter table public.drawn_charts
  add constraint drawn_charts_event_draw_order_unique unique (event_id, draw_id, draw_order);

alter table public.voting_windows
  drop constraint if exists voting_windows_round_number_key;
alter table public.voting_windows
  add constraint voting_windows_event_round_unique unique (event_id, round_number);

alter table public.round_player_eligibility
  drop constraint if exists round_player_eligibility_round_number_player_id_key;
alter table public.round_player_eligibility
  add constraint round_player_eligibility_event_round_player_unique unique (
    event_id,
    round_number,
    player_id
  );

alter table public.ballots
  drop constraint if exists ballots_round_number_player_id_key;
alter table public.ballots
  add constraint ballots_event_round_player_unique unique (event_id, round_number, player_id);

alter table public.ballot_choices
  drop constraint if exists ballot_choices_ballot_id_round_set_id_key;
alter table public.ballot_choices
  add constraint ballot_choices_event_ballot_set_unique unique (event_id, ballot_id, round_set_id);

alter table public.ballot_revisions
  drop constraint if exists ballot_revisions_ballot_id_revision_number_key;
alter table public.ballot_revisions
  add constraint ballot_revisions_event_ballot_revision_unique unique (
    event_id,
    ballot_id,
    revision_number
  );

alter table public.result_snapshots
  drop constraint if exists result_snapshots_round_number_key;
alter table public.result_snapshots
  add constraint result_snapshots_event_round_unique unique (event_id, round_number);

alter table public.result_rows
  drop constraint if exists result_rows_result_snapshot_id_round_set_id_chart_id_key;
alter table public.result_rows
  drop constraint if exists result_rows_result_snapshot_id_round_set_id_reveal_order_key;
alter table public.result_rows
  add constraint result_rows_event_snapshot_set_chart_unique unique (
    event_id,
    result_snapshot_id,
    round_set_id,
    chart_id
  );
alter table public.result_rows
  add constraint result_rows_event_snapshot_set_reveal_unique unique (
    event_id,
    result_snapshot_id,
    round_set_id,
    reveal_order
  );

alter table public.tiebreaks
  drop constraint if exists tiebreaks_result_snapshot_id_round_set_id_key;
alter table public.tiebreaks
  add constraint tiebreaks_event_snapshot_set_unique unique (
    event_id,
    result_snapshot_id,
    round_set_id
  );

alter table public.host_locks
  drop constraint if exists host_locks_lock_name_key;
alter table public.host_locks
  add constraint host_locks_event_lock_name_unique unique (event_id, lock_name);
