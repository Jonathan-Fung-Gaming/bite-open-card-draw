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

  select *
    into v_window
  from public.voting_windows
  where event_id = p_event_id
    and round_number = v_round_number
  for update;

  if not found
     or v_window.status not in ('voting_open', 'final_30_seconds', 'extension_1_minute')
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

  select count(*)::integer
    into v_submitted_count
  from public.ballots as ballot
  where ballot.event_id = p_event_id
    and ballot.round_number = v_round_number
    and ballot.submitted = true;

  if v_eligible_count > 0 and v_submitted_count >= v_eligible_count and v_window.status = 'voting_open' then
    update public.voting_windows
    set status = 'final_30_seconds',
        final_warning_started_at = coalesce(final_warning_started_at, v_now),
        closes_at = least(coalesce(closes_at, v_now + interval '30 seconds'), v_now + interval '30 seconds'),
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
