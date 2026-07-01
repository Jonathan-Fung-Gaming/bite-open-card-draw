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

notify pgrst, 'reload schema';
