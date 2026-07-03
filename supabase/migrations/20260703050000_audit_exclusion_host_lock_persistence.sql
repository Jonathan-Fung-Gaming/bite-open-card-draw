with ranked_chart_exclusions as (
  select
    id,
    row_number() over (
      partition by event_id, chart_id
      order by updated_at desc, created_at desc, id desc
    ) as duplicate_rank
  from public.chart_exclusions
)
delete from public.chart_exclusions as exclusion
using ranked_chart_exclusions as ranked
where exclusion.id = ranked.id
  and ranked.duplicate_rank > 1;

alter table public.chart_exclusions
  drop constraint if exists chart_exclusions_event_chart_unique;

alter table public.chart_exclusions
  add constraint chart_exclusions_event_chart_unique unique (event_id, chart_id);
