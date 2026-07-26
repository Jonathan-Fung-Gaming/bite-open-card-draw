alter table public.protein_preferences
  add column weigh_in_interval_days smallint not null default 14,
  add constraint protein_preferences_weigh_in_interval_days_values
    check (weigh_in_interval_days in (7, 14, 30));

grant insert (weigh_in_interval_days)
  on table public.protein_preferences to authenticated;
grant update (weigh_in_interval_days)
  on table public.protein_preferences to authenticated;

create or replace function public.protein_reconcile_weigh_in_reminder_internal(
  p_user_id uuid,
  p_now timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weight public.protein_weight_entries%rowtype;
  v_job public.protein_notification_jobs%rowtype;
  v_enabled boolean;
  v_interval_days smallint := 14;
  v_has_subscription boolean;
  v_onboarded boolean;
  v_schedule_time_zone text;
begin
  if p_user_id is null or p_now is null then
    raise exception 'Reminder reconciliation inputs are required.' using errcode = '22023';
  end if;

  if nullif(
    pg_catalog.current_setting('protein_tracker.erase_user_id', true),
    ''
  ) = p_user_id::text then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('protein_tracking_user:' || p_user_id::text, 0)
  );

  select
    coalesce(preference.notifications_enabled, false),
    preference.weigh_in_interval_days
  into v_enabled, v_interval_days
  from public.protein_preferences as preference
  where preference.user_id = p_user_id;

  v_interval_days := coalesce(v_interval_days, 14);

  select profile.onboarding_completed_at is not null, profile.time_zone
  into v_onboarded, v_schedule_time_zone
  from public.protein_profiles as profile
  where profile.user_id = p_user_id;

  select exists (
    select 1
    from public.protein_push_subscriptions as subscription
    where subscription.user_id = p_user_id
  ) into v_has_subscription;

  if coalesce(v_onboarded, false) is not true
     or coalesce(v_enabled, false) is not true
     or not v_has_subscription then
    update public.protein_notification_jobs
    set status = 'invalidated',
        claim_token = null,
        claimed_at = null,
        retry_at = null,
        invalidated_at = p_now
    where user_id = p_user_id
      and reminder_kind = 'weigh_in_due'
      and status in ('pending', 'claimed', 'failed');
    return null;
  end if;

  select weight.*
  into v_weight
  from public.protein_weight_entries as weight
  where weight.user_id = p_user_id
    and weight.measured_at <= p_now
  order by weight.measured_at desc, weight.id desc
  limit 1
  for share;

  if not found then
    return null;
  end if;

  update public.protein_notification_jobs
  set status = 'invalidated',
      claim_token = null,
      claimed_at = null,
      retry_at = null,
      invalidated_at = p_now
  where user_id = p_user_id
    and reminder_kind = 'weigh_in_due'
    and source_weight_entry_id <> v_weight.id
    and status in ('pending', 'claimed', 'failed');

  insert into public.protein_notification_jobs (
    user_id,
    reminder_kind,
    source_weight_entry_id,
    due_local_date,
    time_zone,
    due_local_time,
    due_at
  ) values (
    p_user_id,
    'weigh_in_due',
    v_weight.id,
    v_weight.local_date + v_interval_days,
    v_schedule_time_zone,
    time '09:00:00',
    ((v_weight.local_date + v_interval_days) + time '09:00:00')
      at time zone v_schedule_time_zone
  )
  on conflict (user_id, reminder_kind, source_weight_entry_id) do update
  set status = case
        when protein_notification_jobs.status = 'invalidated' then 'pending'
        else protein_notification_jobs.status
      end,
      claim_token = case
        when protein_notification_jobs.status = 'invalidated' then null
        else protein_notification_jobs.claim_token
      end,
      claimed_at = case
        when protein_notification_jobs.status = 'invalidated' then null
        else protein_notification_jobs.claimed_at
      end,
      retry_at = case
        when protein_notification_jobs.status = 'invalidated' then null
        else protein_notification_jobs.retry_at
      end,
      invalidated_at = case
        when protein_notification_jobs.status = 'invalidated' then null
        else protein_notification_jobs.invalidated_at
      end,
      due_local_date = case
        when protein_notification_jobs.status = 'completed'
          then protein_notification_jobs.due_local_date
        else excluded.due_local_date
      end,
      time_zone = case
        when protein_notification_jobs.status = 'completed'
          then protein_notification_jobs.time_zone
        else excluded.time_zone
      end,
      due_local_time = case
        when protein_notification_jobs.status = 'completed'
          then protein_notification_jobs.due_local_time
        else excluded.due_local_time
      end,
      due_at = case
        when protein_notification_jobs.status = 'completed'
          then protein_notification_jobs.due_at
        else excluded.due_at
      end
  returning * into v_job;

  return v_job.id;
end;
$$;

create or replace function public.protein_reconcile_reminder_after_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.notifications_enabled is distinct from old.notifications_enabled
     or new.weigh_in_interval_days is distinct from old.weigh_in_interval_days then
    perform public.protein_reconcile_weigh_in_reminder_internal(
      new.user_id,
      pg_catalog.clock_timestamp()
    );
  end if;
  return new;
end;
$$;

drop trigger protein_preferences_reconcile_reminder
  on public.protein_preferences;
create trigger protein_preferences_reconcile_reminder
after insert or update of notifications_enabled, weigh_in_interval_days
on public.protein_preferences
for each row execute function public.protein_reconcile_reminder_after_preference();

drop function public.protein_claim_due_notifications(timestamptz, integer);

create function public.protein_claim_due_notifications(
  p_now timestamptz,
  p_limit integer default 25
)
returns table (
  job_id uuid,
  user_id uuid,
  delivery_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_secret text,
  reminder_kind text,
  due_local_date date,
  weigh_in_interval_days smallint,
  source_weight_entry_id uuid,
  claim_token uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_claimed_ids uuid[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;
  if p_now is null or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Claim time and a limit from 1 through 100 are required.'
      using errcode = '22023';
  end if;

  with candidates as (
    select job.id
    from public.protein_notification_jobs as job
    where (
      (job.status = 'pending' and job.due_at <= p_now)
      or (job.status = 'failed' and job.retry_at <= p_now)
      or (job.status = 'claimed' and job.claimed_at <= p_now - interval '10 minutes')
    )
    order by job.due_at, job.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.protein_notification_jobs as job
    set status = 'claimed',
        claim_token = gen_random_uuid(),
        claimed_at = p_now,
        retry_at = null,
        attempts = job.attempts + 1
    from candidates
    where job.id = candidates.id
    returning job.id
  )
  select pg_catalog.array_agg(claimed.id)
  into v_claimed_ids
  from claimed;

  if v_claimed_ids is null then
    return;
  end if;

  update public.protein_notification_deliveries
  set status = 'pending', attempted_at = null, delivered_at = null, error_code = null
  where job_id = any(v_claimed_ids)
    and status = 'failed';

  insert into public.protein_notification_deliveries (
    user_id,
    job_id,
    subscription_id,
    subscription_fingerprint,
    reminder_kind,
    due_local_date
  )
  select
    job.user_id,
    job.id,
    subscription.id,
    pg_catalog.encode(extensions.digest(subscription.endpoint, 'sha256'), 'hex'),
    job.reminder_kind,
    job.due_local_date
  from public.protein_notification_jobs as job
  join public.protein_push_subscriptions as subscription
    on subscription.user_id = job.user_id
  where job.id = any(v_claimed_ids)
  on conflict (job_id, subscription_fingerprint) do nothing;

  update public.protein_notification_jobs as job
  set status = 'completed', claim_token = null, claimed_at = null
  where job.id = any(v_claimed_ids)
    and not exists (
      select 1
      from public.protein_notification_deliveries as delivery
      where delivery.job_id = job.id
        and delivery.status in ('pending', 'failed')
    );

  return query
  select
    job.id,
    job.user_id,
    delivery.id,
    subscription.id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth_secret,
    job.reminder_kind,
    job.due_local_date,
    coalesce(preference.weigh_in_interval_days, 14)::smallint,
    job.source_weight_entry_id,
    job.claim_token,
    job.attempts
  from public.protein_notification_jobs as job
  join public.protein_notification_deliveries as delivery
    on delivery.job_id = job.id and delivery.status = 'pending'
  join public.protein_push_subscriptions as subscription
    on subscription.id = delivery.subscription_id
  left join public.protein_preferences as preference
    on preference.user_id = job.user_id
  where job.id = any(v_claimed_ids)
    and job.status = 'claimed'
  order by job.due_at, job.id, delivery.id;
end;
$$;

revoke all on function public.protein_claim_due_notifications(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.protein_claim_due_notifications(timestamptz, integer)
  to service_role;
