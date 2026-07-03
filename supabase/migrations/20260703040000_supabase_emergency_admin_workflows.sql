create or replace function public.normalized_manual_ballot_override(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint;
  v_player_id uuid;
  v_admin_session_id uuid;
  v_reason text;
  v_replace_existing boolean;
  v_choices jsonb;
  v_now timestamptz := public.normalized_database_time();
  v_window public.voting_windows%rowtype;
  v_player_username text;
  v_existing_ballot public.ballots%rowtype;
  v_had_existing_ballot boolean := false;
  v_ballot_id uuid;
  v_revision integer;
  v_choice jsonb;
  v_draw_id uuid;
  v_round_set_id uuid;
  v_no_bans boolean;
  v_banned_chart_ids uuid[];
  v_seen_draw_ids uuid[] := array[]::uuid[];
  v_seen_round_set_ids uuid[] := array[]::uuid[];
  v_active_draw_count integer;
  v_distinct_ban_count integer;
  v_result_id uuid;
  v_result_phase text;
  v_result_ids uuid[] := array[]::uuid[];
  v_admin_action_id uuid := gen_random_uuid();
  v_manual_override boolean;
  v_invalidated_computed_result boolean := false;
  v_eligible_count integer;
  v_submitted_count integer;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  v_round_number := (p_payload->>'roundNumber')::smallint;
  v_player_id := (p_payload->>'playerId')::uuid;
  v_admin_session_id := (p_payload->>'adminSessionId')::uuid;
  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  v_replace_existing := coalesce((p_payload->>'replaceExistingBallot')::boolean, false);
  v_choices := p_payload->'choices';

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_player_id is null then
    raise exception 'playerId is required';
  end if;

  if v_admin_session_id is null then
    raise exception 'adminSessionId is required';
  end if;

  if v_reason is null then
    raise exception 'Audit reason is required.';
  end if;

  if coalesce(jsonb_typeof(v_choices), '') <> 'array' or jsonb_array_length(v_choices) <> 2 then
    raise exception 'Both chart sets must be completed before submitting.';
  end if;

  if not exists (
    select 1
    from public.admin_sessions as session
    where session.event_id = p_event_id
      and session.id = v_admin_session_id
      and session.revoked_at is null
      and session.expires_at > v_now
  ) then
    raise exception 'Admin session is not active.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_event_id || ':manualBallotOverride:' || v_round_number::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_event_id || ':manualBallotOverride:' || v_round_number::text || ':' || v_player_id::text,
      0
    )
  );

  v_window := public.normalized_apply_voting_deadline_locked(p_event_id, v_round_number, v_now);

  if v_window.status not in (
    'voting_open',
    'final_30_seconds',
    'extension_1_minute',
    'voting_closed',
    'results_computed'
  ) then
    raise exception 'Manual ballots are allowed only before results reveal.';
  end if;

  select result.id, result.reveal_phase
    into v_result_id, v_result_phase
  from public.result_snapshots as result
  where result.event_id = p_event_id
    and result.round_number = v_round_number
  for update;

  if v_result_id is not null and v_result_phase <> 'computed' then
    raise exception 'Manual ballots are allowed before result reveal starts. Use result correction after reveal begins.';
  end if;

  select player.startgg_username
    into v_player_username
  from public.players as player
  join public.round_player_eligibility as eligibility
    on eligibility.event_id = player.event_id
   and eligibility.player_id = player.id
   and eligibility.round_number = v_round_number
  where player.event_id = p_event_id
    and player.id = v_player_id;

  if v_player_username is null then
    raise exception 'Manual ballot player must be eligible for the voting window.';
  end if;

  select count(*)::integer
    into v_active_draw_count
  from public.draws as draw
  join public.round_sets as round_set on round_set.id = draw.round_set_id
  where draw.event_id = p_event_id
    and draw.status = 'active'
    and draw.superseded_at is null
    and round_set.round_number = v_round_number;

  if v_active_draw_count <> 2 then
    raise exception 'Both chart sets must be drawn before saving a manual ballot.';
  end if;

  for v_choice in select * from jsonb_array_elements(v_choices)
  loop
    v_draw_id := (v_choice->>'drawId')::uuid;
    v_round_set_id := (v_choice->>'roundSetId')::uuid;
    v_no_bans := coalesce((v_choice->>'noBans')::boolean, false);

    if coalesce(jsonb_typeof(v_choice->'bannedChartIds'), 'array') <> 'array' then
      raise exception 'bannedChartIds must be an array.';
    end if;

    select coalesce(array_agg(value::uuid order by ordinal), array[]::uuid[])
      into v_banned_chart_ids
    from jsonb_array_elements_text(coalesce(v_choice->'bannedChartIds', '[]'::jsonb))
      with ordinality as banned(value, ordinal);

    if v_draw_id is null or v_round_set_id is null then
      raise exception 'Ballot choice references an unknown draw.';
    end if;

    if v_draw_id = any(v_seen_draw_ids) or v_round_set_id = any(v_seen_round_set_ids) then
      raise exception 'Ballot must include exactly one completed choice for each active draw.';
    end if;

    v_seen_draw_ids := array_append(v_seen_draw_ids, v_draw_id);
    v_seen_round_set_ids := array_append(v_seen_round_set_ids, v_round_set_id);

    if not exists (
      select 1
      from public.draws as draw
      join public.round_sets as round_set on round_set.id = draw.round_set_id
      where draw.event_id = p_event_id
        and draw.id = v_draw_id
        and draw.round_set_id = v_round_set_id
        and draw.status = 'active'
        and draw.superseded_at is null
        and round_set.round_number = v_round_number
    ) then
      raise exception 'Ballot choice references an unknown draw.';
    end if;

    if (v_no_bans and cardinality(v_banned_chart_ids) <> 0)
       or (not v_no_bans and cardinality(v_banned_chart_ids) not between 1 and 2) then
      raise exception 'Both chart sets must be completed before submitting.';
    end if;

    select count(*)::integer
      into v_distinct_ban_count
    from (select distinct unnest(v_banned_chart_ids) as chart_id) as distinct_bans;

    if v_distinct_ban_count <> cardinality(v_banned_chart_ids) then
      raise exception 'Duplicate chart bans are not allowed.';
    end if;

    if exists (
      select 1
      from unnest(v_banned_chart_ids) as banned(chart_id)
      where not exists (
        select 1
        from public.drawn_charts as drawn
        where drawn.event_id = p_event_id
          and drawn.draw_id = v_draw_id
          and drawn.chart_id = banned.chart_id
      )
    ) then
      raise exception 'Ballot choice references a chart outside the drawn set.';
    end if;
  end loop;

  if cardinality(v_seen_draw_ids) <> 2
     or cardinality(v_seen_round_set_ids) <> 2
     or exists (
       select 1
       from public.draws as draw
       join public.round_sets as round_set on round_set.id = draw.round_set_id
       where draw.event_id = p_event_id
         and draw.status = 'active'
         and draw.superseded_at is null
         and round_set.round_number = v_round_number
         and not draw.id = any(v_seen_draw_ids)
     ) then
    raise exception 'Ballot must include exactly one completed choice for each active draw.';
  end if;

  select *
    into v_existing_ballot
  from public.ballots as ballot
  where ballot.event_id = p_event_id
    and ballot.round_number = v_round_number
    and ballot.player_id = v_player_id
  for update;

  v_had_existing_ballot := found;

  if v_had_existing_ballot and not v_replace_existing then
    raise exception '% already has a submitted ballot. Confirm replacement before saving a manual override.',
      v_player_username;
  end if;

  v_manual_override := v_window.status in ('voting_closed', 'results_computed');

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
    action_type,
    action_summary,
    reason,
    requires_password_reentry,
    created_at,
    metadata
  )
  values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    'manual_ballot',
    format(
      '%s manual ballot for %s.',
      case when v_had_existing_ballot then 'Replaced' else 'Entered' end,
      v_player_username
    ),
    v_reason,
    true,
    v_now,
    jsonb_build_object(
      'roundNumber', v_round_number,
      'playerId', v_player_id,
      'replacedExistingBallot', v_had_existing_ballot,
      'manualOverride', v_manual_override,
      'dangerous', true,
      'tournamentChanging', true,
      'source', 'normalized_manual_ballot_override'
    )
  );

  if v_had_existing_ballot then
    v_ballot_id := v_existing_ballot.id;
    v_revision := v_existing_ballot.latest_revision_number + 1;

    update public.ballots
    set submitted = true,
        submitted_at = coalesce(submitted_at, v_now),
        last_revision_at = v_now,
        latest_revision_number = v_revision,
        edit_token_hash = null,
        manual_override = v_manual_override,
        override_admin_action_id = v_admin_action_id,
        override_reason = v_reason,
        replaced_existing_ballot = true,
        invalidated_at = null,
        invalidated_by_admin_action_id = null,
        updated_at = v_now
    where event_id = p_event_id
      and id = v_ballot_id;

    delete from public.ballot_choices
    where event_id = p_event_id
      and ballot_id = v_ballot_id;
  else
    v_ballot_id := gen_random_uuid();
    v_revision := 1;

    insert into public.ballots (
      id,
      event_id,
      round_number,
      player_id,
      submitted,
      submitted_at,
      last_revision_at,
      latest_revision_number,
      edit_token_hash,
      manual_override,
      override_admin_action_id,
      override_reason,
      replaced_existing_ballot,
      created_at,
      updated_at
    )
    values (
      v_ballot_id,
      p_event_id,
      v_round_number,
      v_player_id,
      true,
      v_now,
      v_now,
      v_revision,
      null,
      v_manual_override,
      v_admin_action_id,
      v_reason,
      false,
      v_now,
      v_now
    );
  end if;

  for v_choice in select * from jsonb_array_elements(v_choices)
  loop
    v_draw_id := (v_choice->>'drawId')::uuid;
    v_round_set_id := (v_choice->>'roundSetId')::uuid;
    v_no_bans := coalesce((v_choice->>'noBans')::boolean, false);

    select coalesce(array_agg(value::uuid order by ordinal), array[]::uuid[])
      into v_banned_chart_ids
    from jsonb_array_elements_text(coalesce(v_choice->'bannedChartIds', '[]'::jsonb))
      with ordinality as banned(value, ordinal);

    insert into public.ballot_choices (
      event_id,
      ballot_id,
      draw_id,
      round_set_id,
      no_bans,
      banned_chart_ids,
      created_at,
      updated_at
    )
    values (
      p_event_id,
      v_ballot_id,
      v_draw_id,
      v_round_set_id,
      v_no_bans,
      v_banned_chart_ids,
      v_now,
      v_now
    );
  end loop;

  insert into public.ballot_revisions (
    event_id,
    ballot_id,
    revision_number,
    accepted,
    submitted_at,
    payload
  )
  values (
    p_event_id,
    v_ballot_id,
    v_revision,
    true,
    v_now,
    jsonb_build_object(
      'source', 'manual_admin',
      'choices', v_choices,
      'reason', v_reason,
      'adminActionId', v_admin_action_id
    )
  );

  update public.players
  set has_tournament_history = true,
      updated_at = v_now
  where event_id = p_event_id
    and id = v_player_id;

  if v_result_id is not null then
    select coalesce(array_agg(result.id), array[]::uuid[])
      into v_result_ids
    from public.result_snapshots as result
    where result.event_id = p_event_id
      and result.round_number = v_round_number;

    delete from public.tiebreaks
    where event_id = p_event_id
      and result_snapshot_id = any(v_result_ids);

    delete from public.result_rows
    where event_id = p_event_id
      and result_snapshot_id = any(v_result_ids);

    delete from public.result_snapshots
    where event_id = p_event_id
      and id = any(v_result_ids);

    update public.voting_windows
    set status = 'voting_closed',
        closed_at = coalesce(closed_at, v_now),
        closes_at = coalesce(closed_at, v_now),
        final_warning_started_at = null,
        paused_at = null,
        paused_from_status = null,
        remaining_seconds_at_pause = null,
        remaining_ms_when_paused = null,
        updated_at = v_now
    where event_id = p_event_id
      and round_number = v_round_number;

    v_invalidated_computed_result := true;
  else
    select count(*)::integer
      into v_eligible_count
    from public.round_player_eligibility as eligibility
    where eligibility.event_id = p_event_id
      and eligibility.round_number = v_round_number;

    select count(distinct ballot.player_id)::integer
      into v_submitted_count
    from public.ballots as ballot
    join public.round_player_eligibility as eligibility
      on eligibility.event_id = ballot.event_id
     and eligibility.round_number = ballot.round_number
     and eligibility.player_id = ballot.player_id
    where ballot.event_id = p_event_id
      and ballot.round_number = v_round_number
      and ballot.submitted = true
      and ballot.invalidated_at is null;

    if v_eligible_count > 0
       and v_submitted_count >= v_eligible_count
       and v_window.status in ('voting_open', 'extension_1_minute')
       and (v_window.closes_at is null or v_now < v_window.closes_at) then
      update public.voting_windows
      set status = 'final_30_seconds',
          final_warning_started_at = coalesce(final_warning_started_at, v_now),
          closes_at = v_now + interval '30 seconds',
          updated_at = v_now
      where event_id = p_event_id
        and round_number = v_round_number;
    else
      update public.voting_windows
      set updated_at = v_now
      where event_id = p_event_id
        and round_number = v_round_number;
    end if;
  end if;

  return jsonb_build_object(
    'ballotId', v_ballot_id,
    'revision', v_revision,
    'roundNumber', v_round_number,
    'manualOverride', v_manual_override,
    'replacedExistingBallot', v_had_existing_ballot,
    'invalidatedComputedResult', v_invalidated_computed_result,
    'adminActionId', v_admin_action_id
  );
end;
$$;

revoke execute on function public.normalized_manual_ballot_override(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_manual_ballot_override(text, jsonb) to service_role;

create or replace function public.normalized_reopen_voting_window(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint;
  v_duration_minutes integer;
  v_admin_session_id uuid;
  v_reason text;
  v_now timestamptz := public.normalized_database_time();
  v_window public.voting_windows%rowtype;
  v_result_id uuid;
  v_result_phase text;
  v_result_ids uuid[] := array[]::uuid[];
  v_invalidated_computed_result boolean := false;
  v_admin_action_id uuid := gen_random_uuid();
  v_closes_at timestamptz;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  v_round_number := (p_payload->>'roundNumber')::smallint;
  v_duration_minutes := (p_payload->>'durationMinutes')::integer;
  v_admin_session_id := (p_payload->>'adminSessionId')::uuid;
  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_duration_minutes is null or v_duration_minutes < 1 or v_duration_minutes > 10 then
    raise exception 'Reopen duration must be 1-10 minutes.';
  end if;

  if v_admin_session_id is null then
    raise exception 'adminSessionId is required';
  end if;

  if v_reason is null then
    raise exception 'Audit reason is required.';
  end if;

  if not exists (
    select 1
    from public.admin_sessions as session
    where session.event_id = p_event_id
      and session.id = v_admin_session_id
      and session.revoked_at is null
      and session.expires_at > v_now
  ) then
    raise exception 'Admin session is not active.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_event_id || ':reopenVotingWindow:' || v_round_number::text, 0)
  );

  v_window := public.normalized_apply_voting_deadline_locked(p_event_id, v_round_number, v_now);

  select result.id, result.reveal_phase
    into v_result_id, v_result_phase
  from public.result_snapshots as result
  where result.event_id = p_event_id
    and result.round_number = v_round_number
  for update;

  if v_result_id is not null and v_result_phase <> 'computed' then
    raise exception 'Emergency reopen is allowed only before result reveal starts. Use result correction after reveal begins.';
  end if;

  if v_window.status not in ('voting_closed', 'results_computed') then
    raise exception 'Emergency reopen is allowed only after voting closes and before reveal.';
  end if;

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
    action_type,
    action_summary,
    reason,
    requires_password_reentry,
    created_at,
    metadata
  )
  values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    'emergency_reopen_voting',
    format('Reopened Round %s voting for %s minute(s).', v_round_number, v_duration_minutes),
    v_reason,
    true,
    v_now,
    jsonb_build_object(
      'roundNumber', v_round_number,
      'durationMinutes', v_duration_minutes,
      'invalidatedComputedResult', v_result_id is not null,
      'dangerous', true,
      'tournamentChanging', true,
      'source', 'normalized_reopen_voting_window'
    )
  );

  if v_result_id is not null then
    select coalesce(array_agg(result.id), array[]::uuid[])
      into v_result_ids
    from public.result_snapshots as result
    where result.event_id = p_event_id
      and result.round_number = v_round_number;

    delete from public.tiebreaks
    where event_id = p_event_id
      and result_snapshot_id = any(v_result_ids);

    delete from public.result_rows
    where event_id = p_event_id
      and result_snapshot_id = any(v_result_ids);

    delete from public.result_snapshots
    where event_id = p_event_id
      and id = any(v_result_ids);

    v_invalidated_computed_result := true;
  end if;

  v_closes_at := v_now + (v_duration_minutes * interval '1 minute');

  update public.voting_windows
  set status = 'voting_open',
      closes_at = v_closes_at,
      closed_at = null,
      extension_used = true,
      final_warning_started_at = null,
      paused_at = null,
      paused_from_status = null,
      remaining_seconds_at_pause = null,
      remaining_ms_when_paused = null,
      updated_at = v_now
  where event_id = p_event_id
    and round_number = v_round_number;

  return jsonb_build_object(
    'roundNumber', v_round_number,
    'status', 'voting_open',
    'closesAt', v_closes_at,
    'durationMinutes', v_duration_minutes,
    'invalidatedComputedResult', v_invalidated_computed_result,
    'adminActionId', v_admin_action_id
  );
end;
$$;

revoke execute on function public.normalized_reopen_voting_window(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_reopen_voting_window(text, jsonb) to service_role;

create or replace function public.normalized_reset_round(
  p_event_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint;
  v_admin_session_id uuid;
  v_reason text;
  v_now timestamptz := public.normalized_database_time();
  v_admin_action_id uuid := gen_random_uuid();
  v_ballot_ids uuid[] := array[]::uuid[];
  v_result_ids uuid[] := array[]::uuid[];
  v_draw_ids uuid[] := array[]::uuid[];
  v_rows_changed integer := 0;
  v_deleted integer;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  v_round_number := (p_payload->>'roundNumber')::smallint;
  v_admin_session_id := (p_payload->>'adminSessionId')::uuid;
  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_admin_session_id is null then
    raise exception 'adminSessionId is required';
  end if;

  if v_reason is null then
    raise exception 'Audit reason is required.';
  end if;

  if not exists (
    select 1
    from public.admin_sessions as session
    where session.event_id = p_event_id
      and session.id = v_admin_session_id
      and session.revoked_at is null
      and session.expires_at > v_now
  ) then
    raise exception 'Admin session is not active.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_event_id || ':resetRound:' || v_round_number::text, 0)
  );

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
    action_type,
    action_summary,
    reason,
    requires_password_reentry,
    created_at,
    metadata
  )
  values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    'reset_round',
    format('Reset Round %s operational state.', v_round_number),
    v_reason,
    true,
    v_now,
    jsonb_build_object(
      'roundNumber', v_round_number,
      'dangerous', true,
      'tournamentChanging', true,
      'source', 'normalized_reset_round'
    )
  );
  v_rows_changed := v_rows_changed + 1;

  select coalesce(array_agg(ballot.id), array[]::uuid[])
    into v_ballot_ids
  from public.ballots as ballot
  where ballot.event_id = p_event_id
    and ballot.round_number = v_round_number;

  select coalesce(array_agg(result.id), array[]::uuid[])
    into v_result_ids
  from public.result_snapshots as result
  where result.event_id = p_event_id
    and result.round_number = v_round_number;

  select coalesce(array_agg(draw.id), array[]::uuid[])
    into v_draw_ids
  from public.draws as draw
  join public.round_sets as round_set on round_set.id = draw.round_set_id
  where draw.event_id = p_event_id
    and round_set.round_number = v_round_number;

  delete from public.active_voter_presence
  where event_id = p_event_id
    and round_number = v_round_number;
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  delete from public.tiebreaks
  where event_id = p_event_id
    and result_snapshot_id = any(v_result_ids);
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  delete from public.result_rows
  where event_id = p_event_id
    and result_snapshot_id = any(v_result_ids);
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  delete from public.result_snapshots
  where event_id = p_event_id
    and id = any(v_result_ids);
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  delete from public.ballot_revisions
  where event_id = p_event_id
    and ballot_id = any(v_ballot_ids);
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  delete from public.ballot_choices
  where event_id = p_event_id
    and ballot_id = any(v_ballot_ids);
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  delete from public.ballots
  where event_id = p_event_id
    and id = any(v_ballot_ids);
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  delete from public.voting_windows
  where event_id = p_event_id
    and round_number = v_round_number;
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  delete from public.round_player_eligibility
  where event_id = p_event_id
    and round_number = v_round_number;
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  delete from public.drawn_charts
  where event_id = p_event_id
    and draw_id = any(v_draw_ids);
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  delete from public.draws
  where event_id = p_event_id
    and id = any(v_draw_ids);
  get diagnostics v_deleted = row_count;
  v_rows_changed := v_rows_changed + v_deleted;

  return jsonb_build_object(
    'roundNumber', v_round_number,
    'rowsChanged', v_rows_changed,
    'adminActionId', v_admin_action_id
  );
end;
$$;

revoke execute on function public.normalized_reset_round(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_reset_round(text, jsonb) to service_role;
