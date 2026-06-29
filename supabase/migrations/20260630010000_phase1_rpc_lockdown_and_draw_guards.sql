create or replace function public.normalized_runtime_transaction_disabled(
  p_event_id text,
  p_mutation_name text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if length(trim(coalesce(p_mutation_name, ''))) = 0 then
    raise exception 'p_mutation_name is required';
  end if;

  if p_payload is null then
    raise exception 'p_payload is required';
  end if;

  raise exception 'normalized runtime mutation % is disabled until implemented as a row-changing transaction',
    p_mutation_name;
end;
$$;

create or replace function public.normalized_runtime_transaction_ack(
  p_event_id text,
  p_mutation_name text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, p_mutation_name, p_payload);
end;
$$;

create or replace function public.normalized_submit_ballot(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'submitBallot', p_payload);
end;
$$;

create or replace function public.normalized_manual_ballot_override(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'manualBallotOverride', p_payload);
end;
$$;

create or replace function public.normalized_claim_voter_presence(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'claimActiveVoterPresence', p_payload);
end;
$$;

create or replace function public.normalized_touch_voter_presence(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'touchActiveVoterPresence', p_payload);
end;
$$;

create or replace function public.normalized_acquire_host_lock(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'acquireHostLock', p_payload);
end;
$$;

create or replace function public.normalized_heartbeat_host_lock(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'refreshHostLock', p_payload);
end;
$$;

create or replace function public.normalized_release_host_lock(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'releaseHostLock', p_payload);
end;
$$;

create or replace function public.normalized_open_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'openVotingWindow', p_payload);
end;
$$;

create or replace function public.normalized_pause_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'pauseVotingWindow', p_payload);
end;
$$;

create or replace function public.normalized_resume_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'resumeVotingWindow', p_payload);
end;
$$;

create or replace function public.normalized_close_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'closeVotingWindow', p_payload);
end;
$$;

create or replace function public.normalized_reopen_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'reopenVotingWindow', p_payload);
end;
$$;

create or replace function public.normalized_advance_voting_timer(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'advanceVotingTimer', p_payload);
end;
$$;

create or replace function public.normalized_draw_round_set(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'drawRoundSet', p_payload);
end;
$$;

create or replace function public.normalized_reroll_one_chart(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'rerollOneChart', p_payload);
end;
$$;

create or replace function public.normalized_reroll_round_set(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'rerollRoundSet', p_payload);
end;
$$;

create or replace function public.normalized_reroll_full_round(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'rerollFullRound', p_payload);
end;
$$;

create or replace function public.normalized_invalidate_post_vote_reroll_ballots(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'postVoteRerollInvalidation', p_payload);
end;
$$;

create or replace function public.normalized_compute_results(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'computeResults', p_payload);
end;
$$;

create or replace function public.normalized_advance_result_reveal(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'advanceResultReveal', p_payload);
end;
$$;

create or replace function public.normalized_mark_results_revealed(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'markResultsRevealed', p_payload);
end;
$$;

create or replace function public.normalized_override_result(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'overrideResult', p_payload);
end;
$$;

create or replace function public.normalized_reset_round(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'resetRound', p_payload);
end;
$$;

create or replace function public.normalized_create_admin_session(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'adminSessionCreate', p_payload);
end;
$$;

create or replace function public.normalized_touch_admin_session(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'adminSessionTouch', p_payload);
end;
$$;

create or replace function public.normalized_logout_admin_session(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'adminSessionLogout', p_payload);
end;
$$;

create or replace function public.normalized_revoke_admin_session(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_disabled(p_event_id, 'adminSessionRevoke', p_payload);
end;
$$;

revoke execute on function public.normalized_runtime_transaction_ack(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_runtime_transaction_disabled(text, text, jsonb) from public, anon, authenticated;

revoke execute on function public.normalized_submit_ballot(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_manual_ballot_override(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_claim_voter_presence(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_touch_voter_presence(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_acquire_host_lock(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_heartbeat_host_lock(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_release_host_lock(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_open_voting_window(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_pause_voting_window(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_resume_voting_window(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_close_voting_window(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_reopen_voting_window(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_advance_voting_timer(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_draw_round_set(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_reroll_one_chart(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_reroll_round_set(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_reroll_full_round(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_invalidate_post_vote_reroll_ballots(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_compute_results(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_advance_result_reveal(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_mark_results_revealed(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_override_result(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_reset_round(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_create_admin_session(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_touch_admin_session(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_logout_admin_session(text, jsonb) from public, anon, authenticated;
revoke execute on function public.normalized_revoke_admin_session(text, jsonb) from public, anon, authenticated;

grant execute on function public.normalized_submit_ballot(text, jsonb) to service_role;
grant execute on function public.normalized_manual_ballot_override(text, jsonb) to service_role;
grant execute on function public.normalized_claim_voter_presence(text, jsonb) to service_role;
grant execute on function public.normalized_touch_voter_presence(text, jsonb) to service_role;
grant execute on function public.normalized_acquire_host_lock(text, jsonb) to service_role;
grant execute on function public.normalized_heartbeat_host_lock(text, jsonb) to service_role;
grant execute on function public.normalized_release_host_lock(text, jsonb) to service_role;
grant execute on function public.normalized_open_voting_window(text, jsonb) to service_role;
grant execute on function public.normalized_pause_voting_window(text, jsonb) to service_role;
grant execute on function public.normalized_resume_voting_window(text, jsonb) to service_role;
grant execute on function public.normalized_close_voting_window(text, jsonb) to service_role;
grant execute on function public.normalized_reopen_voting_window(text, jsonb) to service_role;
grant execute on function public.normalized_advance_voting_timer(text, jsonb) to service_role;
grant execute on function public.normalized_draw_round_set(text, jsonb) to service_role;
grant execute on function public.normalized_reroll_one_chart(text, jsonb) to service_role;
grant execute on function public.normalized_reroll_round_set(text, jsonb) to service_role;
grant execute on function public.normalized_reroll_full_round(text, jsonb) to service_role;
grant execute on function public.normalized_invalidate_post_vote_reroll_ballots(text, jsonb) to service_role;
grant execute on function public.normalized_compute_results(text, jsonb) to service_role;
grant execute on function public.normalized_advance_result_reveal(text, jsonb) to service_role;
grant execute on function public.normalized_mark_results_revealed(text, jsonb) to service_role;
grant execute on function public.normalized_override_result(text, jsonb) to service_role;
grant execute on function public.normalized_reset_round(text, jsonb) to service_role;
grant execute on function public.normalized_create_admin_session(text, jsonb) to service_role;
grant execute on function public.normalized_touch_admin_session(text, jsonb) to service_role;
grant execute on function public.normalized_logout_admin_session(text, jsonb) to service_role;
grant execute on function public.normalized_revoke_admin_session(text, jsonb) to service_role;

drop index if exists public.draws_one_active_per_event_set;
create unique index draws_one_active_per_event_set
  on public.draws (event_id, round_set_id)
  where status = 'active' and superseded_at is null;

alter table public.draws
  drop constraint if exists draws_status_check;
alter table public.draws
  add constraint draws_status_check
  check (
    (status = 'active' and superseded_at is null)
    or (status = 'superseded' and superseded_at is not null)
  );

create or replace function public.validate_drawn_chart_invariants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  draw_row record;
  set_row record;
  chart_row record;
begin
  select event_id, round_set_id, status
    into draw_row
  from public.draws
  where id = new.draw_id;

  if not found then
    raise exception 'drawn_charts references unknown draw_id %', new.draw_id;
  end if;

  if draw_row.event_id <> new.event_id then
    raise exception 'drawn_charts event_id % does not match draw event_id %',
      new.event_id, draw_row.event_id;
  end if;

  select round_number, chart_type, chart_level
    into set_row
  from public.round_sets
  where id = draw_row.round_set_id;

  select chart_type, chart_level, song_key
    into chart_row
  from public.charts
  where id = new.chart_id;

  if not found then
    raise exception 'drawn_charts references unknown chart_id %', new.chart_id;
  end if;

  if chart_row.chart_type <> set_row.chart_type or chart_row.chart_level <> set_row.chart_level then
    raise exception 'drawn chart % does not match required pool %',
      new.chart_id,
      upper(set_row.chart_type) || set_row.chart_level::text;
  end if;

  if exists (
    select 1
    from public.chart_exclusions as exclusion
    where exclusion.event_id = new.event_id
      and exclusion.chart_id = new.chart_id
      and exclusion.excluded = true
  ) then
    raise exception 'excluded chart % cannot be drawn for event %', new.chart_id, new.event_id;
  end if;

  if exists (
    select 1
    from public.drawn_charts as other_drawn
    join public.draws as other_draw on other_draw.id = other_drawn.draw_id
    join public.round_sets as other_set on other_set.id = other_draw.round_set_id
    join public.charts as other_chart on other_chart.id = other_drawn.chart_id
    where other_drawn.event_id = new.event_id
      and other_draw.id <> new.draw_id
      and other_draw.status = 'active'
      and other_draw.superseded_at is null
      and other_set.round_number = set_row.round_number
      and other_chart.song_key = chart_row.song_key
  ) then
    raise exception 'same-round duplicate song % cannot be drawn twice', chart_row.song_key;
  end if;

  if exists (
    select 1
    from public.result_rows as result_row
    join public.result_snapshots as result_snapshot
      on result_snapshot.id = result_row.result_snapshot_id
    join public.charts as selected_chart on selected_chart.id = result_row.chart_id
    where result_row.event_id = new.event_id
      and result_row.is_selected = true
      and result_snapshot.reveal_phase = 'final'
      and result_snapshot.round_number < set_row.round_number
      and selected_chart.song_key = chart_row.song_key
  ) then
    raise exception 'song % was selected in an earlier round and cannot be drawn', chart_row.song_key;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_drawn_chart_invariants on public.drawn_charts;
create trigger validate_drawn_chart_invariants
before insert or update of event_id, draw_id, chart_id
on public.drawn_charts
for each row
execute function public.validate_drawn_chart_invariants();

create or replace function public.validate_voting_window_draw_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  incomplete_set_count integer;
begin
  if new.status not in ('voting_open', 'final_30_seconds', 'extension_1_minute') then
    return new;
  end if;

  select count(*)
    into incomplete_set_count
  from public.round_sets as round_set
  left join public.draws as draw
    on draw.round_set_id = round_set.id
    and draw.event_id = new.event_id
    and draw.status = 'active'
    and draw.superseded_at is null
  left join lateral (
    select count(*) as drawn_count
    from public.drawn_charts as drawn_chart
    where drawn_chart.event_id = new.event_id
      and drawn_chart.draw_id = draw.id
  ) as drawn_count on true
  where round_set.round_number = new.round_number
    and coalesce(drawn_count.drawn_count, 0) <> round_set.draw_count;

  if incomplete_set_count > 0 then
    raise exception 'voting cannot open until both round sets have exactly 7 drawn charts';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_voting_window_draw_completion on public.voting_windows;
create trigger validate_voting_window_draw_completion
before insert or update of status
on public.voting_windows
for each row
execute function public.validate_voting_window_draw_completion();
