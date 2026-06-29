create table if not exists public.active_voter_presence (
  id uuid primary key default gen_random_uuid(),
  event_id text not null default 'local-dev',
  player_id uuid not null references public.players(id) on delete cascade,
  device_id text not null,
  claimed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text,
  constraint active_voter_presence_event_id_not_blank check (length(trim(event_id)) > 0),
  constraint active_voter_presence_device_id_not_blank check (length(trim(device_id)) > 0),
  unique (event_id, player_id, device_id)
);

alter table public.active_voter_presence enable row level security;

create index if not exists active_voter_presence_event_player_idx
  on public.active_voter_presence (event_id, player_id, expires_at);

alter table public.ballots
  add column if not exists invalidated_at timestamptz;
alter table public.ballots
  add column if not exists invalidated_by_admin_action_id uuid references public.admin_actions(id) on delete set null;
alter table public.ballots
  add column if not exists invalidation_reason text;

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
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if length(trim(coalesce(p_mutation_name, ''))) = 0 then
    raise exception 'p_mutation_name is required';
  end if;

  if p_payload is null then
    raise exception 'p_payload is required';
  end if;

  return jsonb_build_object(
    'event_id', p_event_id,
    'mutation_name', p_mutation_name,
    'committed', true
  );
end;
$$;

create or replace function public.normalized_submit_ballot(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'submitBallot', p_payload);
end;
$$;

create or replace function public.normalized_manual_ballot_override(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'manualBallotOverride', p_payload);
end;
$$;

create or replace function public.normalized_claim_voter_presence(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'claimActiveVoterPresence', p_payload);
end;
$$;

create or replace function public.normalized_touch_voter_presence(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'touchActiveVoterPresence', p_payload);
end;
$$;

create or replace function public.normalized_acquire_host_lock(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'acquireHostLock', p_payload);
end;
$$;

create or replace function public.normalized_heartbeat_host_lock(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'refreshHostLock', p_payload);
end;
$$;

create or replace function public.normalized_release_host_lock(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'releaseHostLock', p_payload);
end;
$$;

create or replace function public.normalized_open_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'openVotingWindow', p_payload);
end;
$$;

create or replace function public.normalized_pause_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'pauseVotingWindow', p_payload);
end;
$$;

create or replace function public.normalized_resume_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'resumeVotingWindow', p_payload);
end;
$$;

create or replace function public.normalized_close_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'closeVotingWindow', p_payload);
end;
$$;

create or replace function public.normalized_reopen_voting_window(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'reopenVotingWindow', p_payload);
end;
$$;

create or replace function public.normalized_advance_voting_timer(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'advanceVotingTimer', p_payload);
end;
$$;

create or replace function public.normalized_draw_round_set(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'drawRoundSet', p_payload);
end;
$$;

create or replace function public.normalized_reroll_one_chart(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'rerollOneChart', p_payload);
end;
$$;

create or replace function public.normalized_reroll_round_set(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'rerollRoundSet', p_payload);
end;
$$;

create or replace function public.normalized_reroll_full_round(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'rerollFullRound', p_payload);
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
  return public.normalized_runtime_transaction_ack(p_event_id, 'postVoteRerollInvalidation', p_payload);
end;
$$;

create or replace function public.normalized_compute_results(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'computeResults', p_payload);
end;
$$;

create or replace function public.normalized_advance_result_reveal(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'advanceResultReveal', p_payload);
end;
$$;

create or replace function public.normalized_mark_results_revealed(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'markResultsRevealed', p_payload);
end;
$$;

create or replace function public.normalized_override_result(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'overrideResult', p_payload);
end;
$$;

create or replace function public.normalized_reset_round(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'resetRound', p_payload);
end;
$$;

create or replace function public.normalized_create_admin_session(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'adminSessionCreate', p_payload);
end;
$$;

create or replace function public.normalized_touch_admin_session(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'adminSessionTouch', p_payload);
end;
$$;

create or replace function public.normalized_logout_admin_session(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'adminSessionLogout', p_payload);
end;
$$;

create or replace function public.normalized_revoke_admin_session(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.normalized_runtime_transaction_ack(p_event_id, 'adminSessionRevoke', p_payload);
end;
$$;
