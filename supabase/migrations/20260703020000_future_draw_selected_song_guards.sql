create or replace function public.normalized_result_phase_has_selected_songs(p_reveal_phase text)
returns boolean
language sql
immutable
as $$
  select p_reveal_phase in (
    'computed',
    'set_1_counts',
    'set_1_resolved',
    'set_2_counts',
    'set_2_resolved',
    'final'
  );
$$;

revoke execute on function public.normalized_result_phase_has_selected_songs(text)
  from public, anon, authenticated;

grant execute on function public.normalized_result_phase_has_selected_songs(text) to service_role;

create or replace function public.validate_round_draws_against_prior_selected_songs(
  p_event_id text,
  p_round_number smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_row record;
begin
  if p_round_number <= 1 then
    return;
  end if;

  select
    current_set.display_label as display_label,
    current_chart.name as chart_name,
    prior_snapshot.round_number as selected_round_number
    into conflict_row
  from public.draws as current_draw
  join public.round_sets as current_set on current_set.id = current_draw.round_set_id
  join public.drawn_charts as current_drawn on current_drawn.draw_id = current_draw.id
  join public.charts as current_chart on current_chart.id = current_drawn.chart_id
  join public.result_rows as prior_row
    on prior_row.event_id = current_draw.event_id
   and prior_row.is_selected = true
  join public.result_snapshots as prior_snapshot
    on prior_snapshot.id = prior_row.result_snapshot_id
   and prior_snapshot.event_id = prior_row.event_id
  join public.charts as prior_chart on prior_chart.id = prior_row.chart_id
  where current_draw.event_id = p_event_id
    and current_draw.status = 'active'
    and current_draw.superseded_at is null
    and current_set.round_number = p_round_number
    and prior_snapshot.round_number < p_round_number
    and public.normalized_result_phase_has_selected_songs(prior_snapshot.reveal_phase)
    and prior_chart.song_key = current_chart.song_key
  order by prior_snapshot.round_number, current_set.set_order, current_chart.name
  limit 1;

  if found then
    raise exception
      'Round % % includes %, which was selected in Round %. Reroll or reset the affected future draw before opening voting or computing results.',
      p_round_number,
      conflict_row.display_label,
      conflict_row.chart_name,
      conflict_row.selected_round_number;
  end if;
end;
$$;

revoke execute on function public.validate_round_draws_against_prior_selected_songs(text, smallint)
  from public, anon, authenticated;

grant execute on function public.validate_round_draws_against_prior_selected_songs(text, smallint)
  to service_role;

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
  select event_id, round_set_id, status, superseded_at
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

  if draw_row.status = 'active' and draw_row.superseded_at is null and exists (
    select 1
    from public.result_rows as result_row
    join public.result_snapshots as result_snapshot
      on result_snapshot.id = result_row.result_snapshot_id
     and result_snapshot.event_id = result_row.event_id
    join public.charts as selected_chart on selected_chart.id = result_row.chart_id
    where result_row.event_id = new.event_id
      and result_row.is_selected = true
      and public.normalized_result_phase_has_selected_songs(result_snapshot.reveal_phase)
      and result_snapshot.round_number < set_row.round_number
      and selected_chart.song_key = chart_row.song_key
  ) then
    raise exception 'song % was selected in an earlier round and cannot be drawn', chart_row.song_key;
  end if;

  return new;
end;
$$;

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

  perform public.validate_round_draws_against_prior_selected_songs(
    new.event_id,
    new.round_number
  );

  return new;
end;
$$;

create or replace function public.validate_result_snapshot_draw_freshness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.normalized_result_phase_has_selected_songs(new.reveal_phase) then
    perform public.validate_round_draws_against_prior_selected_songs(
      new.event_id,
      new.round_number
    );
  end if;

  return new;
end;
$$;

drop trigger if exists validate_result_snapshot_draw_freshness on public.result_snapshots;
create trigger validate_result_snapshot_draw_freshness
before insert or update of event_id, round_number, reveal_phase
on public.result_snapshots
for each row
execute function public.validate_result_snapshot_draw_freshness();

notify pgrst, 'reload schema';
