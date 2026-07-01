create or replace function public.normalized_apply_voting_deadline_locked(
  p_event_id text,
  p_round_number smallint,
  p_now timestamptz
)
returns public.voting_windows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window public.voting_windows%rowtype;
  v_eligible_count integer;
  v_submitted_count integer;
  v_closes_at timestamptz;
  v_extended_closes_at timestamptz;
begin
  select *
    into v_window
  from public.voting_windows
  where event_id = p_event_id
    and round_number = p_round_number
  for update;

  if not found then
    raise exception 'Voting has not opened for this round.';
  end if;

  select count(*)::integer
    into v_eligible_count
  from public.round_player_eligibility as eligibility
  where eligibility.event_id = p_event_id
    and eligibility.round_number = p_round_number;

  select count(distinct ballot.player_id)::integer
    into v_submitted_count
  from public.ballots as ballot
  join public.round_player_eligibility as eligibility
    on eligibility.event_id = ballot.event_id
   and eligibility.round_number = ballot.round_number
   and eligibility.player_id = ballot.player_id
  where ballot.event_id = p_event_id
    and ballot.round_number = p_round_number
    and ballot.submitted = true
    and ballot.invalidated_at is null;

  v_closes_at := v_window.closes_at;

  if v_window.status in ('voting_open', 'extension_1_minute')
     and v_closes_at is not null
     and p_now < v_closes_at
     and v_eligible_count > 0
     and v_submitted_count >= v_eligible_count then
    update public.voting_windows
    set status = 'final_30_seconds',
        final_warning_started_at = coalesce(final_warning_started_at, p_now),
        closes_at = p_now + interval '30 seconds',
        updated_at = p_now
    where event_id = p_event_id
      and round_number = p_round_number
    returning * into v_window;

    return v_window;
  end if;

  if v_window.status in ('voting_open', 'final_30_seconds', 'extension_1_minute')
     and v_closes_at is not null
     and p_now >= v_closes_at then
    if v_window.status = 'voting_open'
       and not v_window.extension_used
       and v_eligible_count > 0
       and (v_submitted_count::numeric / v_eligible_count::numeric) < 0.75 then
      v_extended_closes_at := v_closes_at + interval '1 minute';

      if p_now < v_extended_closes_at then
        update public.voting_windows
        set status = 'extension_1_minute',
            extension_used = true,
            closes_at = v_extended_closes_at,
            updated_at = p_now
        where event_id = p_event_id
          and round_number = p_round_number
        returning * into v_window;

        return v_window;
      end if;

      update public.voting_windows
      set status = 'voting_closed',
          extension_used = true,
          closed_at = coalesce(closed_at, v_extended_closes_at),
          closes_at = coalesce(closed_at, v_extended_closes_at),
          updated_at = p_now
      where event_id = p_event_id
        and round_number = p_round_number
      returning * into v_window;

      return v_window;
    end if;

    update public.voting_windows
    set status = 'voting_closed',
        closed_at = coalesce(closed_at, v_closes_at),
        closes_at = coalesce(closed_at, v_closes_at),
        updated_at = p_now
    where event_id = p_event_id
      and round_number = p_round_number
    returning * into v_window;
  end if;

  return v_window;
end;
$$;

revoke execute on function public.normalized_apply_voting_deadline_locked(text, smallint, timestamptz)
  from public, anon, authenticated;

grant execute on function public.normalized_apply_voting_deadline_locked(text, smallint, timestamptz)
  to service_role;

create or replace function public.normalized_replace_draw_state(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := public.normalized_database_time();
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if coalesce(jsonb_typeof(p_payload->'draws'), '') <> 'array' then
    raise exception 'draws payload must be an array';
  end if;

  delete from public.drawn_charts
  where event_id = p_event_id;

  delete from public.draws
  where event_id = p_event_id;

  insert into public.draws (
    id,
    event_id,
    round_set_id,
    draw_version,
    status,
    eligible_pool_count,
    eligible_chart_ids,
    excluded_chart_keys_snapshot,
    selected_song_keys_snapshot,
    same_round_blocked_song_keys_snapshot,
    created_at,
    superseded_at,
    reason
  )
  select
    (draw_item.value->>'id')::uuid,
    p_event_id,
    (draw_item.value->>'roundSetId')::uuid,
    (draw_item.value->>'version')::integer,
    coalesce(nullif(draw_item.value->>'status', ''), 'active'),
    (draw_item.value->>'eligiblePoolCount')::integer,
    coalesce(
      (
        select array_agg(value::uuid order by ordinal)
        from jsonb_array_elements_text(coalesce(draw_item.value->'eligibleChartIds', '[]'::jsonb))
          with ordinality as eligible(value, ordinal)
      ),
      array[]::uuid[]
    ),
    coalesce(
      (
        select array_agg(value order by ordinal)
        from jsonb_array_elements_text(coalesce(draw_item.value->'excludedChartKeysSnapshot', '[]'::jsonb))
          with ordinality as excluded(value, ordinal)
      ),
      array[]::text[]
    ),
    coalesce(
      (
        select array_agg(value order by ordinal)
        from jsonb_array_elements_text(coalesce(draw_item.value->'selectedSongKeysSnapshot', '[]'::jsonb))
          with ordinality as selected_song(value, ordinal)
      ),
      array[]::text[]
    ),
    coalesce(
      (
        select array_agg(value order by ordinal)
        from jsonb_array_elements_text(coalesce(draw_item.value->'sameRoundBlockedSongKeysSnapshot', '[]'::jsonb))
          with ordinality as blocked_song(value, ordinal)
      ),
      array[]::text[]
    ),
    coalesce((draw_item.value->>'createdAt')::timestamptz, v_now),
    nullif(draw_item.value->>'supersededAt', '')::timestamptz,
    coalesce(nullif(draw_item.value->>'reason', ''), 'Persisted draw state')
  from jsonb_array_elements(p_payload->'draws') as draw_item(value);

  insert into public.drawn_charts (
    event_id,
    draw_id,
    chart_id,
    draw_order,
    created_at
  )
  select
    p_event_id,
    (draw_item.value->>'id')::uuid,
    (chart_item.value->>'id')::uuid,
    chart_item.ordinal::integer,
    coalesce((draw_item.value->>'createdAt')::timestamptz, v_now)
  from jsonb_array_elements(p_payload->'draws') as draw_item(value)
  cross join lateral jsonb_array_elements(coalesce(draw_item.value->'charts', '[]'::jsonb))
    with ordinality as chart_item(value, ordinal);

  return jsonb_build_object(
    'committed', true,
    'rows_changed', (
      select count(*)::integer
      from public.draws
      where event_id = p_event_id
    )
  );
end;
$$;

revoke execute on function public.normalized_replace_draw_state(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_replace_draw_state(text, jsonb) to service_role;

create or replace function public.normalized_submit_ballot(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint;
  v_player_id uuid;
  v_choices jsonb;
  v_edit_token_hash text;
  v_now timestamptz := public.normalized_database_time();
  v_window public.voting_windows%rowtype;
  v_player_username text;
  v_choice jsonb;
  v_draw_id uuid;
  v_round_set_id uuid;
  v_no_bans boolean;
  v_banned_chart_ids uuid[];
  v_seen_draw_ids uuid[] := array[]::uuid[];
  v_seen_round_set_ids uuid[] := array[]::uuid[];
  v_ballot_id uuid;
  v_revision integer;
  v_eligible_count integer;
  v_submitted_count integer;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  v_round_number := (p_payload->>'roundNumber')::smallint;
  v_player_id := (p_payload->>'playerId')::uuid;
  v_choices := p_payload->'choices';
  v_edit_token_hash := nullif(p_payload->>'editTokenHash', '');

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if v_player_id is null then
    raise exception 'playerId is required';
  end if;

  if jsonb_typeof(v_choices) <> 'array' or jsonb_array_length(v_choices) <> 2 then
    raise exception 'Both chart sets must be completed before submitting.';
  end if;

  v_window := public.normalized_apply_voting_deadline_locked(p_event_id, v_round_number, v_now);

  if v_window.status not in ('voting_open', 'final_30_seconds', 'extension_1_minute')
     or (v_window.closes_at is not null and v_now > v_window.closes_at) then
    raise exception 'Voting is not open for ballot changes.';
  end if;

  select player.startgg_username
    into v_player_username
  from public.players as player
  where player.event_id = p_event_id
    and player.id = v_player_id;

  if v_player_username is null then
    raise exception 'This start.gg username is not eligible for the open voting window.';
  end if;

  if not exists (
    select 1
    from public.round_player_eligibility as eligibility
    where eligibility.event_id = p_event_id
      and eligibility.round_number = v_round_number
      and eligibility.player_id = v_player_id
  ) then
    raise exception 'This start.gg username is not eligible for the open voting window.';
  end if;

  for v_choice in select * from jsonb_array_elements(v_choices)
  loop
    v_draw_id := (v_choice->>'drawId')::uuid;
    v_round_set_id := (v_choice->>'roundSetId')::uuid;
    v_no_bans := coalesce((v_choice->>'noBans')::boolean, false);

    select coalesce(array_agg(value::uuid), array[]::uuid[])
      into v_banned_chart_ids
    from jsonb_array_elements_text(coalesce(v_choice->'bannedChartIds', '[]'::jsonb)) as value;

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
        and round_set.round_number = v_round_number
    ) then
      raise exception 'Ballot choice references an unknown draw.';
    end if;

    if (v_no_bans and cardinality(v_banned_chart_ids) <> 0)
       or (not v_no_bans and cardinality(v_banned_chart_ids) not between 1 and 2) then
      raise exception 'Both chart sets must be completed before submitting.';
    end if;

    if (
      select count(*)::integer
      from (select distinct unnest(v_banned_chart_ids) as chart_id) as distinct_bans
    ) <> cardinality(v_banned_chart_ids) then
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

  if cardinality(v_seen_draw_ids) <> 2 or cardinality(v_seen_round_set_ids) <> 2 then
    raise exception 'Ballot must include exactly one completed choice for each active draw.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_event_id || ':' || v_round_number::text || ':' || v_player_id::text, 0)
  );

  select ballot.id, ballot.latest_revision_number + 1
    into v_ballot_id, v_revision
  from public.ballots as ballot
  where ballot.event_id = p_event_id
    and ballot.round_number = v_round_number
    and ballot.player_id = v_player_id
  for update;

  if v_ballot_id is null then
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
      v_edit_token_hash,
      false,
      false,
      v_now,
      v_now
    );
  else
    update public.ballots
    set submitted = true,
        submitted_at = v_now,
        last_revision_at = v_now,
        latest_revision_number = v_revision,
        edit_token_hash = coalesce(v_edit_token_hash, edit_token_hash),
        manual_override = false,
        replaced_existing_ballot = false,
        updated_at = v_now
    where id = v_ballot_id
      and event_id = p_event_id;

    delete from public.ballot_choices
    where event_id = p_event_id
      and ballot_id = v_ballot_id;
  end if;

  for v_choice in select * from jsonb_array_elements(v_choices)
  loop
    v_draw_id := (v_choice->>'drawId')::uuid;
    v_round_set_id := (v_choice->>'roundSetId')::uuid;
    v_no_bans := coalesce((v_choice->>'noBans')::boolean, false);

    select coalesce(array_agg(value::uuid), array[]::uuid[])
      into v_banned_chart_ids
    from jsonb_array_elements_text(coalesce(v_choice->'bannedChartIds', '[]'::jsonb)) as value;

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
      'source', 'player',
      'choices', v_choices
    )
  );

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

  return jsonb_build_object(
    'ballotId', v_ballot_id,
    'revision', v_revision,
    'submittedAt', v_now,
    'playerStartggUsername', v_player_username,
    'submittedCount', v_submitted_count,
    'eligibleCount', v_eligible_count,
    'status', (
      select status
      from public.voting_windows
      where event_id = p_event_id
        and round_number = v_round_number
    )
  );
end;
$$;

revoke execute on function public.normalized_submit_ballot(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_submit_ballot(text, jsonb) to service_role;

create or replace function public.normalized_compute_results(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_number smallint;
  v_now timestamptz := public.normalized_database_time();
  v_window public.voting_windows%rowtype;
  v_result_id uuid := gen_random_uuid();
  v_admin_session_id uuid;
  v_payload_admin_session_id uuid;
  v_admin_action_id uuid := gen_random_uuid();
  v_draw_count integer;
  v_draw record;
  v_least_ban_count integer;
  v_candidate_chart_ids uuid[];
  v_selected_chart_id uuid;
  v_ballot_count_for_set integer;
  v_tiebreak_used boolean;
  v_zero_ballot_tiebreak boolean;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  v_round_number := (p_payload->>'roundNumber')::smallint;

  if v_round_number not between 1 and 4 then
    raise exception 'roundNumber must be 1, 2, 3, or 4';
  end if;

  if nullif(p_payload->>'adminSessionId', '') is not null then
    v_payload_admin_session_id := (p_payload->>'adminSessionId')::uuid;

    select session.id
      into v_admin_session_id
    from public.admin_sessions as session
    where session.event_id = p_event_id
      and session.id = v_payload_admin_session_id;
  end if;

  v_window := public.normalized_apply_voting_deadline_locked(p_event_id, v_round_number, v_now);

  if v_window.status <> 'voting_closed' then
    raise exception 'Voting must be closed before results are computed.';
  end if;

  if exists (
    select 1
    from public.result_snapshots as result
    where result.event_id = p_event_id
      and result.round_number = v_round_number
    for update
  ) then
    raise exception 'Results have already been computed for this round.';
  end if;

  select count(*)::integer
    into v_draw_count
  from public.draws as draw
  join public.round_sets as round_set on round_set.id = draw.round_set_id
  where draw.event_id = p_event_id
    and draw.status = 'active'
    and round_set.round_number = v_round_number;

  if v_draw_count <> 2 then
    raise exception 'Both chart sets must be drawn before results can be computed.';
  end if;

  if exists (
    select 1
    from public.draws as draw
    join public.round_sets as round_set on round_set.id = draw.round_set_id
    where draw.event_id = p_event_id
      and draw.status = 'active'
      and round_set.round_number = v_round_number
      and (
        select count(*)::integer
        from public.drawn_charts as drawn
        where drawn.event_id = p_event_id
          and drawn.draw_id = draw.id
      ) <> 7
  ) then
    raise exception 'Both chart sets must have exactly 7 drawn charts before results can be computed.';
  end if;

  insert into public.admin_actions (
    id,
    event_id,
    admin_session_id,
    action_type,
    action_summary,
    requires_password_reentry,
    created_at,
    metadata
  )
  values (
    v_admin_action_id,
    p_event_id,
    v_admin_session_id,
    'compute_results',
    format('Computed results for Round %s.', v_round_number),
    false,
    v_now,
    jsonb_build_object('roundNumber', v_round_number, 'source', 'normalized_compute_results')
  );

  insert into public.result_snapshots (
    id,
    event_id,
    round_number,
    computed_at,
    reveal_phase,
    reveal_phase_started_at,
    final_revealed_at,
    eligible_players,
    admin_action_id,
    metadata
  )
  values (
    v_result_id,
    p_event_id,
    v_round_number,
    v_now,
    'computed',
    v_now,
    null,
    coalesce(v_window.eligible_players, '[]'::jsonb),
    v_admin_action_id,
    jsonb_build_object('source', 'normalized_compute_results')
  );

  for v_draw in
    select
      draw.id as draw_id,
      draw.round_set_id,
      round_set.set_order
    from public.draws as draw
    join public.round_sets as round_set on round_set.id = draw.round_set_id
    where draw.event_id = p_event_id
      and draw.status = 'active'
      and round_set.round_number = v_round_number
    order by round_set.set_order
  loop
    select count(distinct ballot.id)::integer
      into v_ballot_count_for_set
    from public.ballots as ballot
    join public.ballot_choices as choice
      on choice.event_id = ballot.event_id
     and choice.ballot_id = ballot.id
     and choice.draw_id = v_draw.draw_id
    where ballot.event_id = p_event_id
      and ballot.round_number = v_round_number
      and ballot.submitted = true
      and ballot.invalidated_at is null;

    with counts as (
      select
        drawn.chart_id,
        chart.name,
        count(ballot.id) filter (where drawn.chart_id = any(choice.banned_chart_ids))::integer as ban_count
      from public.drawn_charts as drawn
      join public.charts as chart on chart.id = drawn.chart_id
      left join public.ballot_choices as choice
        on choice.event_id = drawn.event_id
       and choice.draw_id = drawn.draw_id
      left join public.ballots as ballot
        on ballot.event_id = choice.event_id
       and ballot.id = choice.ballot_id
       and ballot.round_number = v_round_number
       and ballot.submitted = true
       and ballot.invalidated_at is null
      where drawn.event_id = p_event_id
        and drawn.draw_id = v_draw.draw_id
      group by drawn.chart_id, chart.name
    )
    select min(ban_count)
      into v_least_ban_count
    from counts;

    with counts as (
      select
        drawn.chart_id,
        chart.name,
        count(ballot.id) filter (where drawn.chart_id = any(choice.banned_chart_ids))::integer as ban_count
      from public.drawn_charts as drawn
      join public.charts as chart on chart.id = drawn.chart_id
      left join public.ballot_choices as choice
        on choice.event_id = drawn.event_id
       and choice.draw_id = drawn.draw_id
      left join public.ballots as ballot
        on ballot.event_id = choice.event_id
       and ballot.id = choice.ballot_id
       and ballot.round_number = v_round_number
       and ballot.submitted = true
       and ballot.invalidated_at is null
      where drawn.event_id = p_event_id
        and drawn.draw_id = v_draw.draw_id
      group by drawn.chart_id, chart.name
    )
    select array_agg(chart_id order by name)
      into v_candidate_chart_ids
    from counts
    where ban_count = v_least_ban_count;

    v_tiebreak_used := cardinality(v_candidate_chart_ids) > 1;
    v_zero_ballot_tiebreak := v_tiebreak_used
      and v_ballot_count_for_set = 0
      and cardinality(v_candidate_chart_ids) = 7;

    if v_tiebreak_used then
      select candidate.chart_id
        into v_selected_chart_id
      from unnest(v_candidate_chart_ids) as candidate(chart_id)
      order by gen_random_uuid()
      limit 1;
    else
      v_selected_chart_id := v_candidate_chart_ids[1];
    end if;

    with counts as (
      select
        drawn.chart_id,
        chart.name,
        count(ballot.id) filter (where drawn.chart_id = any(choice.banned_chart_ids))::integer as ban_count
      from public.drawn_charts as drawn
      join public.charts as chart on chart.id = drawn.chart_id
      left join public.ballot_choices as choice
        on choice.event_id = drawn.event_id
       and choice.draw_id = drawn.draw_id
      left join public.ballots as ballot
        on ballot.event_id = choice.event_id
       and ballot.id = choice.ballot_id
       and ballot.round_number = v_round_number
       and ballot.submitted = true
       and ballot.invalidated_at is null
      where drawn.event_id = p_event_id
        and drawn.draw_id = v_draw.draw_id
      group by drawn.chart_id, chart.name
    ),
    ordered as (
      select
        chart_id,
        ban_count,
        row_number() over (order by ban_count asc, name asc) as reveal_order
      from counts
    )
    insert into public.result_rows (
      event_id,
      result_snapshot_id,
      draw_id,
      round_set_id,
      chart_id,
      ban_count,
      reveal_order,
      is_selected,
      is_tiebreak_candidate,
      created_at
    )
    select
      p_event_id,
      v_result_id,
      v_draw.draw_id,
      v_draw.round_set_id,
      chart_id,
      ban_count,
      reveal_order,
      chart_id = v_selected_chart_id,
      ban_count = v_least_ban_count,
      v_now
    from ordered;

    if v_tiebreak_used then
      insert into public.tiebreaks (
        event_id,
        result_snapshot_id,
        draw_id,
        round_set_id,
        candidate_chart_ids,
        winner_chart_id,
        decided_at,
        decision_source,
        admin_action_id,
        winner_reveal_started_at
      )
      values (
        p_event_id,
        v_result_id,
        v_draw.draw_id,
        v_draw.round_set_id,
        v_candidate_chart_ids,
        v_selected_chart_id,
        v_now,
        case when v_zero_ballot_tiebreak then 'server_zero_ballot' else 'server' end,
        v_admin_action_id,
        null
      );
    end if;
  end loop;

  update public.voting_windows
  set status = 'results_computed',
      updated_at = v_now
  where event_id = p_event_id
    and round_number = v_round_number;

  return jsonb_build_object(
    'resultId', v_result_id,
    'roundNumber', v_round_number,
    'computedAt', v_now,
    'status', 'results_computed',
    'adminActionId', v_admin_action_id
  );
end;
$$;

revoke execute on function public.normalized_compute_results(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_compute_results(text, jsonb) to service_role;

create table if not exists public.rate_limit_buckets (
  event_id text not null,
  bucket_key_hash text not null,
  count integer not null default 0 check (count >= 0),
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, bucket_key_hash),
  constraint rate_limit_buckets_event_id_not_blank check (length(trim(event_id)) > 0),
  constraint rate_limit_buckets_key_hash_not_blank check (length(trim(bucket_key_hash)) > 0)
);

alter table public.rate_limit_buckets enable row level security;

create or replace function public.normalized_check_rate_limit(p_event_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_hash text := nullif(p_payload->>'keyHash', '');
  v_limit integer := (p_payload->>'limit')::integer;
  v_window_ms integer := (p_payload->>'windowMs')::integer;
  v_now timestamptz := public.normalized_database_time();
  v_count integer;
  v_reset_at timestamptz;
  v_allowed boolean;
  v_retry_after_ms integer;
begin
  if length(trim(coalesce(p_event_id, ''))) = 0 then
    raise exception 'p_event_id is required';
  end if;

  if v_key_hash is null then
    raise exception 'keyHash is required';
  end if;

  if v_limit is null or v_limit < 1 then
    raise exception 'limit must be positive';
  end if;

  if v_window_ms is null or v_window_ms < 1 then
    raise exception 'windowMs must be positive';
  end if;

  insert into public.rate_limit_buckets (
    event_id,
    bucket_key_hash,
    count,
    reset_at,
    created_at,
    updated_at
  )
  values (
    p_event_id,
    v_key_hash,
    1,
    v_now + (v_window_ms * interval '1 millisecond'),
    v_now,
    v_now
  )
  on conflict (event_id, bucket_key_hash) do update
  set count = case
        when public.rate_limit_buckets.reset_at <= v_now then 1
        else public.rate_limit_buckets.count + 1
      end,
      reset_at = case
        when public.rate_limit_buckets.reset_at <= v_now then excluded.reset_at
        else public.rate_limit_buckets.reset_at
      end,
      updated_at = v_now
  returning count, reset_at into v_count, v_reset_at;

  v_allowed := v_count <= v_limit;
  v_retry_after_ms := greatest(
    0,
    ceil(extract(epoch from (v_reset_at - v_now)) * 1000)::integer
  );

  return jsonb_build_object(
    'allowed', v_allowed,
    'count', v_count,
    'limit', v_limit,
    'retryAfterMs', v_retry_after_ms,
    'resetAt', v_reset_at
  );
end;
$$;

revoke execute on function public.normalized_check_rate_limit(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.normalized_check_rate_limit(text, jsonb) to service_role;
