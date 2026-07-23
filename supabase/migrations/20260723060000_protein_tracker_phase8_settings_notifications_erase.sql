-- Protein Tracker Phase 8: atomic settings, Web Push delivery, and safe erase.

drop trigger protein_00_push_subscriptions_tracking_lock
  on public.protein_push_subscriptions;
create trigger protein_00_push_subscriptions_tracking_lock
before insert or update or delete on public.protein_push_subscriptions
for each row execute function public.protein_lock_tracking_mutation();

create function public.protein_update_profile_and_propose_goal(
  p_goal_period_id uuid,
  p_birth_month smallint,
  p_birth_year smallint,
  p_equation_sex text,
  p_height_inches numeric,
  p_activity_level text,
  p_goal_direction text,
  p_time_zone text
)
returns public.protein_goal_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_local_date date;
  v_age_years integer;
  v_age_band text;
  v_height_cm numeric;
  v_weight_kg numeric;
  v_bmi numeric;
  v_intercept numeric;
  v_age_coefficient numeric;
  v_height_coefficient numeric;
  v_weight_coefficient numeric;
  v_growth_allowance numeric;
  v_eer numeric;
  v_raw_calorie_lower numeric;
  v_raw_calorie_upper numeric;
  v_calorie_lower integer;
  v_calorie_upper integer;
  v_calorie_floor integer;
  v_raw_protein_lower numeric;
  v_raw_protein_upper numeric;
  v_protein_lower integer;
  v_protein_upper integer;
  v_profile public.protein_profiles%rowtype;
  v_weight public.protein_weight_entries%rowtype;
  v_current public.protein_goal_periods%rowtype;
  v_goal public.protein_goal_periods%rowtype;
  v_input_snapshot jsonb;
  v_output_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_goal_period_id is null
     or p_birth_month is null
     or p_birth_year is null
     or p_equation_sex is null
     or p_height_inches is null
     or p_activity_level is null
     or p_goal_direction is null
     or p_time_zone is null then
    raise exception 'All profile inputs and the proposal id are required.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('protein_tracking_user:' || v_user_id::text, 0)
  );

  select profile.*
  into v_profile
  from public.protein_profiles as profile
  where profile.user_id = v_user_id
    and profile.onboarding_completed_at is not null
  for update;

  if not found then
    raise exception 'A completed Protein Tracker profile is required.'
      using errcode = '55000';
  end if;

  select goal.*
  into v_goal
  from public.protein_goal_periods as goal
  where goal.id = p_goal_period_id
    and goal.user_id = v_user_id;

  if found then
    if v_goal.reason <> 'profile_change'
       or (v_goal.calculation_input_snapshot ->> 'birthMonth')::smallint <> p_birth_month
       or (v_goal.calculation_input_snapshot ->> 'birthYear')::smallint <> p_birth_year
       or v_goal.calculation_input_snapshot ->> 'equationSex' <> p_equation_sex
       or (v_goal.calculation_input_snapshot ->> 'heightInches')::numeric <> p_height_inches
       or v_goal.calculation_input_snapshot ->> 'activityLevel' <> p_activity_level
       or v_goal.direction <> p_goal_direction
       or v_goal.calculation_input_snapshot ->> 'timeZone' <> p_time_zone then
      raise exception 'The proposal id is already used with different inputs.'
        using errcode = '22023';
    end if;
    return v_goal;
  end if;

  perform 1
  from public.protein_goal_periods as goal
  where goal.user_id = v_user_id
    and goal.acknowledged_at is null
    and goal.superseded_at is null
  for update;

  if found then
    raise exception 'The existing pending goal must be confirmed first.'
      using errcode = '55000';
  end if;

  select goal.*
  into v_current
  from public.protein_goal_periods as goal
  where goal.user_id = v_user_id
    and goal.acknowledged_at is not null
    and goal.effective_end_date is null
  for update;

  if not found then
    raise exception 'A current goal period is required.' using errcode = '55000';
  end if;

  select weight.*
  into v_weight
  from public.protein_weight_entries as weight
  where weight.user_id = v_user_id
    and weight.measured_at <= v_now
  order by weight.measured_at desc, weight.id desc
  limit 1
  for share;

  if not found then
    raise exception 'A current weight is required.' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = p_time_zone
  ) then
    raise exception 'Invalid IANA time zone.' using errcode = '22023';
  end if;

  v_local_date := (v_now at time zone p_time_zone)::date;
  v_age_years := extract(year from v_local_date)::integer - p_birth_year
    - case
        when extract(month from v_local_date)::integer < p_birth_month then 1
        else 0
      end;

  if v_age_years < 18 then
    raise exception 'Automated goals require an adult age of at least 18.'
      using errcode = '22023';
  end if;

  v_height_cm := p_height_inches * 2.54;
  v_weight_kg := v_weight.pounds * 0.45359237;
  v_bmi := v_weight_kg / ((v_height_cm / 100) ^ 2);

  if v_bmi < 18.5 or v_bmi >= 30 then
    raise exception 'Automated goals support BMI from 18.5 up to, but not including, 30.'
      using errcode = '22023';
  end if;

  if v_age_years = 18 then
    v_age_band := '14_to_under_19';
    v_growth_allowance := 20;

    if p_equation_sex = 'male' and p_activity_level = 'inactive' then
      v_intercept := -447.51; v_age_coefficient := 3.68;
      v_height_coefficient := 13.01; v_weight_coefficient := 13.15;
    elsif p_equation_sex = 'male' and p_activity_level = 'low_active' then
      v_intercept := 19.12; v_age_coefficient := 3.68;
      v_height_coefficient := 8.62; v_weight_coefficient := 20.28;
    elsif p_equation_sex = 'male' and p_activity_level = 'active' then
      v_intercept := -388.19; v_age_coefficient := 3.68;
      v_height_coefficient := 12.66; v_weight_coefficient := 20.46;
    elsif p_equation_sex = 'male' and p_activity_level = 'very_active' then
      v_intercept := -671.75; v_age_coefficient := 3.68;
      v_height_coefficient := 15.38; v_weight_coefficient := 23.25;
    elsif p_equation_sex = 'female' and p_activity_level = 'inactive' then
      v_intercept := 55.59; v_age_coefficient := -22.25;
      v_height_coefficient := 8.43; v_weight_coefficient := 17.07;
    elsif p_equation_sex = 'female' and p_activity_level = 'low_active' then
      v_intercept := -297.54; v_age_coefficient := -22.25;
      v_height_coefficient := 12.77; v_weight_coefficient := 14.73;
    elsif p_equation_sex = 'female' and p_activity_level = 'active' then
      v_intercept := -189.55; v_age_coefficient := -22.25;
      v_height_coefficient := 11.74; v_weight_coefficient := 18.34;
    elsif p_equation_sex = 'female' and p_activity_level = 'very_active' then
      v_intercept := -709.59; v_age_coefficient := -22.25;
      v_height_coefficient := 18.22; v_weight_coefficient := 14.25;
    else
      raise exception 'Equation sex or activity level is invalid.' using errcode = '22023';
    end if;
  else
    v_age_band := '19_plus';
    v_growth_allowance := 0;

    if p_equation_sex = 'male' and p_activity_level = 'inactive' then
      v_intercept := 753.07; v_age_coefficient := -10.83;
      v_height_coefficient := 6.50; v_weight_coefficient := 14.10;
    elsif p_equation_sex = 'male' and p_activity_level = 'low_active' then
      v_intercept := 581.47; v_age_coefficient := -10.83;
      v_height_coefficient := 8.30; v_weight_coefficient := 14.94;
    elsif p_equation_sex = 'male' and p_activity_level = 'active' then
      v_intercept := 1004.82; v_age_coefficient := -10.83;
      v_height_coefficient := 6.52; v_weight_coefficient := 15.91;
    elsif p_equation_sex = 'male' and p_activity_level = 'very_active' then
      v_intercept := -517.88; v_age_coefficient := -10.83;
      v_height_coefficient := 15.61; v_weight_coefficient := 19.11;
    elsif p_equation_sex = 'female' and p_activity_level = 'inactive' then
      v_intercept := 584.90; v_age_coefficient := -7.01;
      v_height_coefficient := 5.72; v_weight_coefficient := 11.71;
    elsif p_equation_sex = 'female' and p_activity_level = 'low_active' then
      v_intercept := 575.77; v_age_coefficient := -7.01;
      v_height_coefficient := 6.60; v_weight_coefficient := 12.14;
    elsif p_equation_sex = 'female' and p_activity_level = 'active' then
      v_intercept := 710.25; v_age_coefficient := -7.01;
      v_height_coefficient := 6.54; v_weight_coefficient := 12.34;
    elsif p_equation_sex = 'female' and p_activity_level = 'very_active' then
      v_intercept := 511.83; v_age_coefficient := -7.01;
      v_height_coefficient := 9.07; v_weight_coefficient := 12.56;
    else
      raise exception 'Equation sex or activity level is invalid.' using errcode = '22023';
    end if;
  end if;

  v_eer := v_intercept
    + v_age_coefficient * v_age_years
    + v_height_coefficient * v_height_cm
    + v_weight_coefficient * v_weight_kg
    + v_growth_allowance;

  if p_goal_direction = 'cut' then
    v_raw_calorie_lower := v_eer - 600;
    v_raw_calorie_upper := v_eer - 400;
  elsif p_goal_direction = 'maintain' then
    v_raw_calorie_lower := v_eer * 0.95;
    v_raw_calorie_upper := v_eer * 1.05;
  elsif p_goal_direction = 'bulk' then
    v_raw_calorie_lower := v_eer * 1.05;
    v_raw_calorie_upper := v_eer * 1.10;
  else
    raise exception 'Goal direction is invalid.' using errcode = '22023';
  end if;

  v_calorie_floor := case when p_equation_sex = 'female' then 1200 else 1500 end;
  if p_goal_direction = 'cut' and v_raw_calorie_lower < v_calorie_floor then
    raise exception 'The calculated Cut range is below the automated calorie floor.'
      using errcode = '22023';
  end if;

  v_calorie_lower := (pg_catalog.floor(v_raw_calorie_lower / 50 + 0.5) * 50)::integer;
  v_calorie_upper := (pg_catalog.floor(v_raw_calorie_upper / 50 + 0.5) * 50)::integer;
  v_raw_protein_lower := v_weight_kg * 1.2;
  v_raw_protein_upper := v_weight_kg * 1.6;
  v_protein_lower := pg_catalog.floor(v_raw_protein_lower + 0.5)::integer;
  v_protein_upper := pg_catalog.floor(v_raw_protein_upper + 0.5)::integer;

  v_input_snapshot := pg_catalog.jsonb_build_object(
    'policyVersion', 'protein-v1',
    'eligibilityAttestationVersion', v_profile.eligibility_attestation_version,
    'calculationLocalDate', v_local_date,
    'birthMonth', p_birth_month,
    'birthYear', p_birth_year,
    'ageYears', v_age_years,
    'equationAgeBand', v_age_band,
    'equationSex', p_equation_sex,
    'activityLevel', p_activity_level,
    'goalDirection', p_goal_direction,
    'timeZone', p_time_zone,
    'heightInches', p_height_inches,
    'heightCentimeters', v_height_cm,
    'weightEntryId', v_weight.id,
    'weightPounds', v_weight.pounds,
    'weightKilograms', v_weight_kg,
    'bmi', v_bmi,
    'previousGoalPeriodId', v_current.id
  );

  v_output_snapshot := pg_catalog.jsonb_build_object(
    'eerKcalUnrounded', v_eer,
    'calorieFloorKcal', v_calorie_floor,
    'calorieRangeRaw', pg_catalog.jsonb_build_object(
      'lower', v_raw_calorie_lower, 'upper', v_raw_calorie_upper
    ),
    'calorieRangeDisplayed', pg_catalog.jsonb_build_object(
      'lower', v_calorie_lower, 'upper', v_calorie_upper
    ),
    'proteinRangeRawGrams', pg_catalog.jsonb_build_object(
      'lower', v_raw_protein_lower, 'upper', v_raw_protein_upper
    ),
    'proteinRangeDisplayedGrams', pg_catalog.jsonb_build_object(
      'lower', v_protein_lower, 'upper', v_protein_upper
    ),
    'calorieRounding', 'nearest_50_half_up',
    'proteinRounding', 'nearest_1_half_up'
  );

  update public.protein_profiles
  set birth_month = p_birth_month,
      birth_year = p_birth_year,
      equation_sex = p_equation_sex,
      height_inches = p_height_inches,
      activity_level = p_activity_level,
      goal_direction = p_goal_direction,
      time_zone = p_time_zone,
      calculation_policy_version = 'protein-v1'
  where user_id = v_user_id;

  insert into public.protein_goal_periods (
    id,
    user_id,
    direction,
    effective_start_date,
    calorie_lower,
    calorie_upper,
    protein_lower,
    protein_upper,
    calculation_input_snapshot,
    calculation_output_snapshot,
    policy_version,
    eligibility_attestation_version,
    reason,
    proposed_at
  ) values (
    p_goal_period_id,
    v_user_id,
    p_goal_direction,
    v_local_date,
    v_calorie_lower,
    v_calorie_upper,
    v_protein_lower,
    v_protein_upper,
    v_input_snapshot,
    v_output_snapshot,
    'protein-v1',
    v_profile.eligibility_attestation_version,
    'profile_change',
    v_now
  )
  returning * into v_goal;

  return v_goal;
end;
$$;

-- Internal reconciler. All callers enter the same per-user advisory-lock domain.
create function public.protein_reconcile_weigh_in_reminder_internal(
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
  v_has_subscription boolean;
  v_onboarded boolean;
  v_schedule_time_zone text;
begin
  if p_user_id is null or p_now is null then
    raise exception 'Reminder reconciliation inputs are required.' using errcode = '22023';
  end if;

  -- Erase deletes jobs before weights. Its row-level weight triggers must not
  -- recreate reminder work while the same transaction drains tracking rows.
  if nullif(
    pg_catalog.current_setting('protein_tracker.erase_user_id', true),
    ''
  ) = p_user_id::text then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('protein_tracking_user:' || p_user_id::text, 0)
  );

  select coalesce(preference.notifications_enabled, false)
  into v_enabled
  from public.protein_preferences as preference
  where preference.user_id = p_user_id;

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
    v_weight.local_date + 14,
    v_schedule_time_zone,
    time '09:00:00',
    ((v_weight.local_date + 14) + time '09:00:00') at time zone v_schedule_time_zone
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

create function public.protein_reconcile_weigh_in_reminder(
  p_user_id uuid,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;
  return public.protein_reconcile_weigh_in_reminder_internal(p_user_id, p_now);
end;
$$;

create function public.protein_reconcile_reminder_after_weight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.protein_reconcile_weigh_in_reminder_internal(
    case when tg_op = 'DELETE' then old.user_id else new.user_id end,
    pg_catalog.clock_timestamp()
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create function public.protein_reconcile_reminder_after_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.notifications_enabled is distinct from old.notifications_enabled then
    perform public.protein_reconcile_weigh_in_reminder_internal(
      new.user_id,
      pg_catalog.clock_timestamp()
    );
  end if;
  return new;
end;
$$;

create function public.protein_reconcile_reminder_after_profile_time_zone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.time_zone is distinct from old.time_zone then
    perform public.protein_reconcile_weigh_in_reminder_internal(
      new.user_id,
      pg_catalog.clock_timestamp()
    );
  end if;
  return new;
end;
$$;

create trigger protein_weight_entries_reconcile_reminder
after insert or delete on public.protein_weight_entries
for each row execute function public.protein_reconcile_reminder_after_weight();

create trigger protein_preferences_reconcile_reminder
after insert or update of notifications_enabled on public.protein_preferences
for each row execute function public.protein_reconcile_reminder_after_preference();

create trigger protein_profiles_reconcile_reminder_time_zone
after insert or update of time_zone on public.protein_profiles
for each row execute function public.protein_reconcile_reminder_after_profile_time_zone();

create function public.protein_upsert_push_subscription(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text,
  p_expires_at timestamptz,
  p_platform_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_endpoint is null or p_p256dh is null or p_auth_secret is null then
    raise exception 'Push subscription owner, endpoint, and keys are required.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('protein_tracking_user:' || p_user_id::text, 0)
  );

  insert into public.protein_push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_secret,
    expires_at,
    last_seen_at,
    platform_metadata
  ) values (
    p_user_id,
    p_endpoint,
    p_p256dh,
    p_auth_secret,
    p_expires_at,
    pg_catalog.clock_timestamp(),
    coalesce(p_platform_metadata, '{}'::jsonb)
  )
  on conflict (endpoint) do update
  set p256dh = excluded.p256dh,
      auth_secret = excluded.auth_secret,
      expires_at = excluded.expires_at,
      last_seen_at = excluded.last_seen_at,
      platform_metadata = excluded.platform_metadata
  where protein_push_subscriptions.user_id = p_user_id
  returning id into v_subscription_id;

  if v_subscription_id is null then
    raise exception 'The push endpoint belongs to another user.' using errcode = '23505';
  end if;

  insert into public.protein_preferences (user_id, notifications_enabled)
  values (p_user_id, true)
  on conflict (user_id) do update
  set notifications_enabled = true;

  perform public.protein_reconcile_weigh_in_reminder_internal(
    p_user_id,
    pg_catalog.clock_timestamp()
  );
  return v_subscription_id;
end;
$$;

create function public.protein_delete_push_subscription(
  p_user_id uuid,
  p_endpoint text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted boolean;
  v_has_remaining boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Push subscription owner is required.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('protein_tracking_user:' || p_user_id::text, 0)
  );

  update public.protein_notification_deliveries
  set status = 'invalid_subscription',
      attempted_at = v_now,
      delivered_at = null,
      error_code = 'subscription_removed'
  where user_id = p_user_id
    and subscription_id in (
      select subscription.id
      from public.protein_push_subscriptions as subscription
      where subscription.user_id = p_user_id
        and subscription.endpoint = p_endpoint
    )
    and status in ('pending', 'failed');

  delete from public.protein_push_subscriptions
  where endpoint = p_endpoint
    and user_id = p_user_id
    and p_endpoint is not null;
  v_deleted := found;

  select exists (
    select 1
    from public.protein_push_subscriptions as subscription
    where subscription.user_id = p_user_id
  ) into v_has_remaining;

  insert into public.protein_preferences (user_id, notifications_enabled)
  values (
    p_user_id,
    case when p_endpoint is null then false else v_has_remaining end
  )
  on conflict (user_id) do update
  set notifications_enabled = excluded.notifications_enabled;

  perform public.protein_reconcile_weigh_in_reminder_internal(p_user_id, v_now);
  return v_deleted;
end;
$$;

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
    job.source_weight_entry_id,
    job.claim_token,
    job.attempts
  from public.protein_notification_jobs as job
  join public.protein_notification_deliveries as delivery
    on delivery.job_id = job.id and delivery.status = 'pending'
  join public.protein_push_subscriptions as subscription
    on subscription.id = delivery.subscription_id
  where job.id = any(v_claimed_ids)
    and job.status = 'claimed'
  order by job.due_at, job.id, delivery.id;
end;
$$;

create function public.protein_finish_notification_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_status text,
  p_error_code text,
  p_finished_at timestamptz default pg_catalog.clock_timestamp()
)
returns table (
  job_status text,
  retry_at timestamptz,
  subscription_removed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.protein_notification_deliveries%rowtype;
  v_job public.protein_notification_jobs%rowtype;
  v_subscription_id uuid;
  v_removed boolean := false;
  v_has_remaining boolean;
  v_has_pending boolean;
  v_has_failed boolean;
  v_retry_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;
  if p_delivery_id is null or p_claim_token is null or p_finished_at is null
     or p_status not in ('sent', 'failed', 'invalid_subscription') then
    raise exception 'A delivery, claim, supported status, and finish time are required.'
      using errcode = '22023';
  end if;
  if (p_status = 'sent' and p_error_code is not null)
     or (p_status <> 'sent' and (
       p_error_code is null
       or p_error_code !~ '^[a-z0-9][a-z0-9_:-]{0,127}$'
     )) then
    raise exception 'Delivery error codes must be sanitized and match the outcome.'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from public.protein_notification_deliveries as delivery
  where delivery.id = p_delivery_id;
  if not found then
    raise exception 'Notification delivery was not found.' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('protein_tracking_user:' || v_delivery.user_id::text, 0)
  );

  select delivery.*
  into strict v_delivery
  from public.protein_notification_deliveries as delivery
  where delivery.id = p_delivery_id
  for update;

  select job.*
  into strict v_job
  from public.protein_notification_jobs as job
  where job.id = v_delivery.job_id
    and job.user_id = v_delivery.user_id
  for update;

  if v_job.status <> 'claimed' or v_job.claim_token is distinct from p_claim_token then
    raise exception 'The notification claim is no longer active.' using errcode = '40001';
  end if;
  if v_delivery.status <> 'pending' then
    raise exception 'The notification delivery is already final.' using errcode = '22023';
  end if;

  v_subscription_id := v_delivery.subscription_id;
  update public.protein_notification_deliveries
  set status = p_status,
      attempted_at = p_finished_at,
      delivered_at = case when p_status = 'sent' then p_finished_at else null end,
      error_code = p_error_code
  where id = p_delivery_id;

  if p_status = 'invalid_subscription' and v_subscription_id is not null then
    delete from public.protein_push_subscriptions
    where id = v_subscription_id and user_id = v_delivery.user_id;
    v_removed := found;
    if v_removed then
      select exists (
        select 1
        from public.protein_push_subscriptions as subscription
        where subscription.user_id = v_delivery.user_id
      ) into v_has_remaining;
    end if;
  end if;

  select
    pg_catalog.bool_or(delivery.status = 'pending'),
    pg_catalog.bool_or(delivery.status = 'failed')
  into v_has_pending, v_has_failed
  from public.protein_notification_deliveries as delivery
  where delivery.job_id = v_job.id;

  if coalesce(v_has_pending, false) then
    if v_removed then
      update public.protein_preferences
      set notifications_enabled = v_has_remaining
      where user_id = v_delivery.user_id;
    end if;
    return query select 'claimed'::text, null::timestamptz, v_removed;
    return;
  end if;

  if coalesce(v_has_failed, false) then
    v_retry_at := p_finished_at + least(
      interval '6 hours',
      interval '5 minutes' * pg_catalog.power(2::numeric, greatest(v_job.attempts - 1, 0))
    );
    update public.protein_notification_jobs
    set status = 'failed',
        claim_token = null,
        claimed_at = null,
        retry_at = v_retry_at
    where id = v_job.id;
    if v_removed then
      update public.protein_preferences
      set notifications_enabled = v_has_remaining
      where user_id = v_delivery.user_id;
    end if;
    return query select 'failed'::text, v_retry_at, v_removed;
    return;
  end if;

  update public.protein_notification_jobs
  set status = 'completed', claim_token = null, claimed_at = null, retry_at = null
  where id = v_job.id;
  if v_removed then
    update public.protein_preferences
    set notifications_enabled = v_has_remaining
    where user_id = v_delivery.user_id;
  end if;
  return query select 'completed'::text, null::timestamptz, v_removed;
end;
$$;

drop function public.protein_erase_tracking_data(uuid);

create function public.protein_erase_tracking_data(
  p_user_id uuid,
  p_password_reconfirmed_at timestamptz,
  p_request_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_password_reconfirmed_at is null or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' then
    raise exception 'Erase requires a user, password reconfirmation, and request id.'
      using errcode = '22023';
  end if;
  if p_password_reconfirmed_at < v_now - interval '5 minutes'
     or p_password_reconfirmed_at > v_now + interval '30 seconds' then
    raise exception 'Password reconfirmation is not recent.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.protein_profiles where user_id = p_user_id) then
    raise exception 'Protein Tracker profile was not found.' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('protein_tracking_user:' || p_user_id::text, 0)
  );

  perform pg_catalog.set_config(
    'protein_tracker.erase_user_id',
    p_user_id::text,
    true
  );

  delete from public.protein_notification_deliveries where user_id = p_user_id;
  delete from public.protein_notification_jobs where user_id = p_user_id;
  delete from public.protein_coaching_events where user_id = p_user_id;
  delete from public.protein_food_entries where user_id = p_user_id;
  delete from public.protein_weight_entries where user_id = p_user_id;
  delete from public.protein_goal_periods where user_id = p_user_id;

  -- Reset onboarding last. A concurrent direct profile update reaches its own
  -- lock trigger while erase still owns the user advisory lock and therefore
  -- fails retryably instead of waiting behind an early profile row lock and
  -- re-completing onboarding after erase commits.
  update public.protein_profiles
  set onboarding_completed_at = null
  where user_id = p_user_id;

  insert into public.protein_security_events (user_id, event_type, request_id, metadata)
  values (p_user_id, 'tracking_data_erased', p_request_id, '{}'::jsonb);
end;
$$;

revoke all on function public.protein_update_profile_and_propose_goal(
  uuid, smallint, smallint, text, numeric, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.protein_update_profile_and_propose_goal(
  uuid, smallint, smallint, text, numeric, text, text, text
) to authenticated;

revoke all on function public.protein_reconcile_weigh_in_reminder_internal(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.protein_reconcile_weigh_in_reminder(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.protein_reconcile_weigh_in_reminder(uuid, timestamptz)
  to service_role;
revoke all on function public.protein_reconcile_reminder_after_weight()
  from public, anon, authenticated, service_role;
revoke all on function public.protein_reconcile_reminder_after_preference()
  from public, anon, authenticated, service_role;
revoke all on function public.protein_reconcile_reminder_after_profile_time_zone()
  from public, anon, authenticated, service_role;
revoke all on function public.protein_upsert_push_subscription(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.protein_upsert_push_subscription(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;
revoke all on function public.protein_delete_push_subscription(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.protein_delete_push_subscription(uuid, text)
  to service_role;
revoke all on function public.protein_claim_due_notifications(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.protein_claim_due_notifications(timestamptz, integer)
  to service_role;
revoke all on function public.protein_finish_notification_delivery(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.protein_finish_notification_delivery(
  uuid, uuid, text, text, timestamptz
) to service_role;
revoke all on function public.protein_erase_tracking_data(uuid, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function public.protein_erase_tracking_data(uuid, timestamptz, text)
  to service_role;
