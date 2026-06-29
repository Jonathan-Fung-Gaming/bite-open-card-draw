alter table public.draws
  drop constraint if exists draws_round_set_id_fkey;
alter table public.draws
  add constraint draws_round_set_id_fkey
  foreign key (round_set_id) references public.round_sets(id) on update cascade on delete cascade;

alter table public.ballot_choices
  drop constraint if exists ballot_choices_round_set_id_fkey;
alter table public.ballot_choices
  add constraint ballot_choices_round_set_id_fkey
  foreign key (round_set_id) references public.round_sets(id) on update cascade on delete cascade;

alter table public.result_rows
  drop constraint if exists result_rows_round_set_id_fkey;
alter table public.result_rows
  add constraint result_rows_round_set_id_fkey
  foreign key (round_set_id) references public.round_sets(id) on update cascade on delete cascade;

alter table public.tiebreaks
  drop constraint if exists tiebreaks_round_set_id_fkey;
alter table public.tiebreaks
  add constraint tiebreaks_round_set_id_fkey
  foreign key (round_set_id) references public.round_sets(id) on update cascade on delete cascade;

update public.round_sets
set id = case
  when round_number = 1 and set_order = 1 then '00000000-0000-4000-8000-000000000101'::uuid
  when round_number = 1 and set_order = 2 then '00000000-0000-4000-8000-000000000102'::uuid
  when round_number = 2 and set_order = 1 then '00000000-0000-4000-8000-000000000201'::uuid
  when round_number = 2 and set_order = 2 then '00000000-0000-4000-8000-000000000202'::uuid
  when round_number = 3 and set_order = 1 then '00000000-0000-4000-8000-000000000301'::uuid
  when round_number = 3 and set_order = 2 then '00000000-0000-4000-8000-000000000302'::uuid
  when round_number = 4 and set_order = 1 then '00000000-0000-4000-8000-000000000401'::uuid
  when round_number = 4 and set_order = 2 then '00000000-0000-4000-8000-000000000402'::uuid
  else id
end;

alter table public.ballot_choices
  add column if not exists draw_id uuid references public.draws(id) on delete restrict;
alter table public.result_rows
  add column if not exists draw_id uuid references public.draws(id) on delete restrict;
alter table public.tiebreaks
  add column if not exists draw_id uuid references public.draws(id) on delete restrict;

update public.ballot_choices as ballot_choice
set draw_id = draw.id
from public.draws as draw
where ballot_choice.draw_id is null
  and draw.event_id = ballot_choice.event_id
  and draw.round_set_id = ballot_choice.round_set_id
  and draw.status = 'active';

update public.result_rows as result_row
set draw_id = draw.id
from public.draws as draw
where result_row.draw_id is null
  and draw.event_id = result_row.event_id
  and draw.round_set_id = result_row.round_set_id
  and draw.status = 'active';

update public.tiebreaks as tiebreak
set draw_id = draw.id
from public.draws as draw
where tiebreak.draw_id is null
  and draw.event_id = tiebreak.event_id
  and draw.round_set_id = tiebreak.round_set_id
  and draw.status = 'active';

do $$
begin
  if exists (select 1 from public.ballot_choices where draw_id is null) then
    raise exception 'Cannot add non-null ballot_choices.draw_id; unresolved legacy rows exist.';
  end if;

  if exists (select 1 from public.result_rows where draw_id is null) then
    raise exception 'Cannot add non-null result_rows.draw_id; unresolved legacy rows exist.';
  end if;

  if exists (select 1 from public.tiebreaks where draw_id is null) then
    raise exception 'Cannot add non-null tiebreaks.draw_id; unresolved legacy rows exist.';
  end if;
end;
$$;

alter table public.ballot_choices
  alter column draw_id set not null;
alter table public.result_rows
  alter column draw_id set not null;
alter table public.tiebreaks
  alter column draw_id set not null;

alter table public.result_rows
  drop constraint if exists result_rows_event_snapshot_set_chart_unique;
alter table public.result_rows
  drop constraint if exists result_rows_event_snapshot_set_reveal_unique;
alter table public.result_rows
  add constraint result_rows_event_snapshot_draw_chart_unique unique (
    event_id,
    result_snapshot_id,
    draw_id,
    chart_id
  );
alter table public.result_rows
  add constraint result_rows_event_snapshot_draw_reveal_unique unique (
    event_id,
    result_snapshot_id,
    draw_id,
    reveal_order
  );

alter table public.tiebreaks
  drop constraint if exists tiebreaks_event_snapshot_set_unique;
alter table public.tiebreaks
  add constraint tiebreaks_event_snapshot_draw_unique unique (
    event_id,
    result_snapshot_id,
    draw_id
  );

create index if not exists ballot_choices_event_draw_idx
  on public.ballot_choices (event_id, draw_id);
create index if not exists result_rows_event_draw_idx
  on public.result_rows (event_id, draw_id);
create index if not exists tiebreaks_event_draw_idx
  on public.tiebreaks (event_id, draw_id);

create or replace function public.validate_draw_scoped_runtime_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matching_draw record;
  invalid_chart_count integer;
begin
  select event_id, round_set_id
    into matching_draw
  from public.draws
  where id = new.draw_id;

  if not found then
    raise exception '% references an unknown draw_id %', tg_table_name, new.draw_id;
  end if;

  if matching_draw.event_id <> new.event_id then
    raise exception '% draw_id % belongs to event %, not event %',
      tg_table_name, new.draw_id, matching_draw.event_id, new.event_id;
  end if;

  if matching_draw.round_set_id <> new.round_set_id then
    raise exception '% round_set_id % does not match draw_id % round_set_id %',
      tg_table_name, new.round_set_id, new.draw_id, matching_draw.round_set_id;
  end if;

  if tg_table_name = 'ballot_choices' then
    select count(*)
      into invalid_chart_count
    from unnest(new.banned_chart_ids) as banned(chart_id)
    where not exists (
      select 1
      from public.drawn_charts as drawn_chart
      where drawn_chart.event_id = new.event_id
        and drawn_chart.draw_id = new.draw_id
        and drawn_chart.chart_id = banned.chart_id
    );

    if invalid_chart_count > 0 then
      raise exception 'ballot_choices banned_chart_ids must all belong to draw_id %', new.draw_id;
    end if;
  elsif tg_table_name = 'result_rows' then
    if not exists (
      select 1
      from public.drawn_charts as drawn_chart
      where drawn_chart.event_id = new.event_id
        and drawn_chart.draw_id = new.draw_id
        and drawn_chart.chart_id = new.chart_id
    ) then
      raise exception 'result_rows chart_id % must belong to draw_id %', new.chart_id, new.draw_id;
    end if;
  elsif tg_table_name = 'tiebreaks' then
    select count(*)
      into invalid_chart_count
    from unnest(new.candidate_chart_ids || array[new.winner_chart_id]) as tiebreak_chart(chart_id)
    where not exists (
      select 1
      from public.drawn_charts as drawn_chart
      where drawn_chart.event_id = new.event_id
        and drawn_chart.draw_id = new.draw_id
        and drawn_chart.chart_id = tiebreak_chart.chart_id
    );

    if invalid_chart_count > 0 then
      raise exception 'tiebreaks candidates and winner must all belong to draw_id %', new.draw_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_ballot_choices_draw_scope on public.ballot_choices;
create trigger validate_ballot_choices_draw_scope
before insert or update of event_id, draw_id, round_set_id, banned_chart_ids
on public.ballot_choices
for each row
execute function public.validate_draw_scoped_runtime_row();

drop trigger if exists validate_result_rows_draw_scope on public.result_rows;
create trigger validate_result_rows_draw_scope
before insert or update of event_id, draw_id, round_set_id, chart_id
on public.result_rows
for each row
execute function public.validate_draw_scoped_runtime_row();

drop trigger if exists validate_tiebreaks_draw_scope on public.tiebreaks;
create trigger validate_tiebreaks_draw_scope
before insert or update of event_id, draw_id, round_set_id, candidate_chart_ids, winner_chart_id
on public.tiebreaks
for each row
execute function public.validate_draw_scoped_runtime_row();
