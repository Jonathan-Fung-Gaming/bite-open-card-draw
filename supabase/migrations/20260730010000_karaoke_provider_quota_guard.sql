create function public.karaoke_reserve_youtube_quota(
  p_search_limit integer,
  p_total_limit integer,
  p_search_cost integer,
  p_total_cost integer,
  p_now timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, statement_timestamp());
  v_provider_day date;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_search_count integer := 0;
  v_total_count integer := 0;
  v_allowed boolean;
  v_reason text;
begin
  if p_search_limit is null or p_total_limit is null
    or p_search_cost is null or p_total_cost is null
    or p_search_limit not between 1 and 100
    or p_total_limit not between 1 and 100000
    or p_search_cost not between 0 and p_search_limit
    or p_total_cost not between 0 and p_total_limit
    or p_search_cost + p_total_cost < 1 then
    raise exception using errcode = '22023', message = 'youtube_quota_arguments_invalid';
  end if;

  v_provider_day := (v_now at time zone 'America/Los_Angeles')::date;
  v_window_start := pg_catalog.timezone(
    'America/Los_Angeles',
    v_provider_day::timestamp without time zone
  );
  v_window_end := pg_catalog.timezone(
    'America/Los_Angeles',
    (v_provider_day + 1)::timestamp without time zone
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('karaoke-rate:youtube:quota:search', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('karaoke-rate:youtube:quota:total', 0)
  );

  select b.request_count into v_search_count
  from public.karaoke_rate_limit_buckets as b
  where b.bucket_key = 'youtube:quota:search'
    and b.window_start = v_window_start;
  v_search_count := coalesce(v_search_count, 0);

  select b.request_count into v_total_count
  from public.karaoke_rate_limit_buckets as b
  where b.bucket_key = 'youtube:quota:total'
    and b.window_start = v_window_start;
  v_total_count := coalesce(v_total_count, 0);

  v_allowed := v_search_count + p_search_cost <= p_search_limit
    and v_total_count + p_total_cost <= p_total_limit;
  v_reason := case
    when v_search_count + p_search_cost > p_search_limit then 'search'
    when v_total_count + p_total_cost > p_total_limit then 'total'
    else null
  end;

  if v_allowed then
    if p_search_cost > 0 then
      insert into public.karaoke_rate_limit_buckets (
        bucket_key, window_start, request_count, expires_at
      ) values (
        'youtube:quota:search', v_window_start, p_search_cost,
        v_window_end + interval '2 days'
      )
      on conflict (bucket_key, window_start) do update
      set request_count = public.karaoke_rate_limit_buckets.request_count + excluded.request_count,
          expires_at = excluded.expires_at;
      v_search_count := v_search_count + p_search_cost;
    end if;

    if p_total_cost > 0 then
      insert into public.karaoke_rate_limit_buckets (
        bucket_key, window_start, request_count, expires_at
      ) values (
        'youtube:quota:total', v_window_start, p_total_cost,
        v_window_end + interval '2 days'
      )
      on conflict (bucket_key, window_start) do update
      set request_count = public.karaoke_rate_limit_buckets.request_count + excluded.request_count,
          expires_at = excluded.expires_at;
      v_total_count := v_total_count + p_total_cost;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'searchCount', v_search_count,
    'searchRemaining', case
      when v_search_count >= p_search_limit then 0
      else p_search_limit - v_search_count
    end,
    'totalCount', v_total_count,
    'totalRemaining', case
      when v_total_count >= p_total_limit then 0
      else p_total_limit - v_total_count
    end,
    'retryAfterSeconds', case
      when v_allowed then 0
      when v_window_end - v_now <= interval '1 second' then 1
      else pg_catalog.ceil(pg_catalog.date_part('epoch', v_window_end - v_now))::integer
    end,
    'windowStartsAt', v_window_start,
    'windowEndsAt', v_window_end
  );
end;
$$;

revoke all on function public.karaoke_reserve_youtube_quota(integer, integer, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.karaoke_reserve_youtube_quota(integer, integer, integer, integer, timestamptz)
  to service_role;

comment on function public.karaoke_reserve_youtube_quota(integer, integer, integer, integer, timestamptz)
  is 'Atomically reserves granular YouTube quota against a DST-aware Pacific provider day.';
