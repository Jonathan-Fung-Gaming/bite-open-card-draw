-- Protein Tracker Phase 7: bounded, authenticated weight-history reads.
--
-- Return contract:
--   * day: bucket_start = local_date and every raw field is populated.
--   * week/month: bucket_start identifies the aggregate bucket, pounds is the
--     continuous median, and raw-entry fields/latest-for-day are null.

create function public.protein_get_weight_history(
  p_interval text,
  p_start_date date,
  p_end_date date
)
returns table (
  bucket_start date,
  entry_id uuid,
  local_date date,
  measured_at timestamptz,
  pounds numeric,
  is_latest_for_day boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_interval is null or p_interval not in ('day', 'week', 'month') then
    raise exception 'Interval must be day, week, or month.' using errcode = '22023';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Start date and end date are required.' using errcode = '22023';
  end if;

  if p_end_date < p_start_date then
    raise exception 'End date must not be before start date.' using errcode = '22023';
  end if;

  if p_end_date - p_start_date > 370 then
    raise exception 'Weight-history spans may not exceed 370 days.' using errcode = '22023';
  end if;

  if p_interval = 'day' then
    return query
    with bounded as (
      select
        weight.id,
        weight.local_date,
        weight.measured_at,
        weight.pounds,
        row_number() over (
          partition by weight.local_date
          order by weight.measured_at desc, weight.id desc
        ) = 1 as latest_for_day
      from public.protein_weight_entries as weight
      where weight.user_id = v_user_id
        and weight.local_date between p_start_date and p_end_date
        and weight.measured_at <= now()
    )
    select
      bounded.local_date as bucket_start,
      bounded.id as entry_id,
      bounded.local_date,
      bounded.measured_at,
      bounded.pounds,
      bounded.latest_for_day as is_latest_for_day
    from bounded
    order by bounded.local_date, bounded.measured_at, bounded.id;

    return;
  end if;

  return query
  with bounded as (
    select
      case p_interval
        when 'week' then date_trunc('week', weight.local_date::timestamp)::date
        else date_trunc('month', weight.local_date::timestamp)::date
      end as aggregate_bucket,
      weight.pounds
    from public.protein_weight_entries as weight
    where weight.user_id = v_user_id
      and weight.local_date between p_start_date and p_end_date
      and weight.measured_at <= now()
  ),
  ranked as (
    select
      bounded.aggregate_bucket,
      bounded.pounds,
      row_number() over (
        partition by bounded.aggregate_bucket
        order by bounded.pounds
      ) as bucket_rank,
      count(*) over (
        partition by bounded.aggregate_bucket
      ) as bucket_count
    from bounded
  )
  select
    ranked.aggregate_bucket as bucket_start,
    null::uuid as entry_id,
    null::date as local_date,
    null::timestamptz as measured_at,
    avg(ranked.pounds)::numeric as pounds,
    null::boolean as is_latest_for_day
  from ranked
  where ranked.bucket_rank in (
    (ranked.bucket_count + 1) / 2,
    (ranked.bucket_count + 2) / 2
  )
  group by ranked.aggregate_bucket
  order by ranked.aggregate_bucket;
end;
$$;

revoke all on function public.protein_get_weight_history(text, date, date)
  from public, anon, service_role;

grant execute on function public.protein_get_weight_history(text, date, date)
  to authenticated;
