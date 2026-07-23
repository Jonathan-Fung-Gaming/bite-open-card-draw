-- Protein Tracker Phase 2: additive shared-project persistence, integrity,
-- least-privilege grants, and row-level isolation. All objects are prefixed so
-- this migration does not change the sibling tournament application's schema.

create table public.protein_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birth_month smallint not null,
  birth_year smallint not null,
  equation_sex text not null,
  height_inches numeric(5, 2) not null,
  activity_level text not null,
  goal_direction text not null,
  time_zone text not null,
  calculation_policy_version text not null,
  eligibility_attestation_version text not null,
  eligibility_attested_at timestamptz not null,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint protein_profiles_birth_month_range
    check (birth_month between 1 and 12),
  constraint protein_profiles_birth_year_range
    check (birth_year between 1900 and 2100),
  constraint protein_profiles_equation_sex_values
    check (equation_sex in ('female', 'male')),
  constraint protein_profiles_height_inches_range
    check (height_inches between 36 and 96),
  constraint protein_profiles_activity_level_values
    check (activity_level in ('inactive', 'low_active', 'active', 'very_active')),
  constraint protein_profiles_goal_direction_values
    check (goal_direction in ('cut', 'maintain', 'bulk')),
  constraint protein_profiles_time_zone_length
    check (length(time_zone) between 1 and 255 and time_zone = btrim(time_zone)),
  constraint protein_profiles_calculation_policy_version_length
    check (
      length(calculation_policy_version) between 1 and 128
      and calculation_policy_version = btrim(calculation_policy_version)
    ),
  constraint protein_profiles_eligibility_attestation_version_length
    check (
      length(eligibility_attestation_version) between 1 and 128
      and eligibility_attestation_version = btrim(eligibility_attestation_version)
    )
);

create table public.protein_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  default_food_action text,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint protein_preferences_default_food_action_values
    check (
      default_food_action is null
      or default_food_action in (
        'take_photo',
        'photo_library',
        'nutrition_label',
        'manual_entry'
      )
    )
);

create table public.protein_goal_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  direction text not null,
  effective_start_date date not null,
  effective_end_date date,
  calorie_lower integer not null,
  calorie_upper integer not null,
  protein_lower integer not null,
  protein_upper integer not null,
  calculation_input_snapshot jsonb not null,
  calculation_output_snapshot jsonb not null,
  policy_version text not null,
  eligibility_attestation_version text not null,
  reason text not null,
  proposed_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint protein_goal_periods_user_id_id_unique unique (user_id, id),
  constraint protein_goal_periods_direction_values
    check (direction in ('cut', 'maintain', 'bulk')),
  constraint protein_goal_periods_effective_dates_order
    check (
      effective_end_date is null
      or effective_end_date > effective_start_date
    ),
  constraint protein_goal_periods_calorie_bounds_range
    check (
      calorie_lower between 0 and 10000
      and calorie_upper between 0 and 10000
      and calorie_lower <= calorie_upper
    ),
  constraint protein_goal_periods_protein_bounds_range
    check (
      protein_lower between 0 and 1000
      and protein_upper between 0 and 1000
      and protein_lower <= protein_upper
    ),
  constraint protein_goal_periods_calculation_input_object
    check (jsonb_typeof(calculation_input_snapshot) = 'object'),
  constraint protein_goal_periods_calculation_output_object
    check (jsonb_typeof(calculation_output_snapshot) = 'object'),
  constraint protein_goal_periods_policy_version_length
    check (
      length(policy_version) between 1 and 128
      and policy_version = btrim(policy_version)
    ),
  constraint protein_goal_periods_attestation_version_length
    check (
      length(eligibility_attestation_version) between 1 and 128
      and eligibility_attestation_version = btrim(eligibility_attestation_version)
    ),
  constraint protein_goal_periods_reason_values
    check (reason in ('onboarding', 'profile_change', 'trend_adjustment')),
  constraint protein_goal_periods_closed_state_consistent
    check (
      acknowledged_at is null
      or (effective_end_date is null) = (superseded_at is null)
    ),
  constraint protein_goal_periods_pending_has_no_end
    check (acknowledged_at is not null or effective_end_date is null)
);

create table public.protein_food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_batch_id uuid not null default gen_random_uuid(),
  logged_at timestamptz not null,
  local_date date not null,
  time_zone text not null,
  item_name text not null,
  protein_grams numeric(8, 2) not null,
  calories integer not null,
  input_method text not null,
  confidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint protein_food_entries_item_name_length
    check (length(item_name) between 1 and 256 and item_name = btrim(item_name)),
  constraint protein_food_entries_protein_grams_range
    check (protein_grams between 0 and 10000),
  constraint protein_food_entries_calories_range
    check (calories between 0 and 100000),
  constraint protein_food_entries_input_method_values
    check (
      input_method in (
        'take_photo',
        'photo_library',
        'nutrition_label',
        'manual_entry'
      )
    ),
  constraint protein_food_entries_confidence_values
    check (confidence is null or confidence in ('confident', 'uncertain')),
  constraint protein_food_entries_time_zone_length
    check (length(time_zone) between 1 and 255 and time_zone = btrim(time_zone))
);

create table public.protein_weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  local_date date not null,
  time_zone text not null,
  pounds numeric(6, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint protein_weight_entries_user_id_id_unique unique (user_id, id),
  constraint protein_weight_entries_pounds_range
    check (pounds between 50 and 1500),
  constraint protein_weight_entries_time_zone_length
    check (length(time_zone) between 1 and 255 and time_zone = btrim(time_zone))
);

create table public.protein_coaching_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  state text not null,
  evidence_fingerprint text not null,
  evidence_weight_entry_ids uuid[] not null,
  weekly_percent_change numeric(7, 4) not null,
  proposed_goal_period_id uuid unique,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  constraint protein_coaching_events_user_id_fingerprint_unique
    unique (user_id, evidence_fingerprint),
  constraint protein_coaching_events_proposed_goal_owner_fk
    foreign key (user_id, proposed_goal_period_id)
    references public.protein_goal_periods (user_id, id)
    on delete set null (proposed_goal_period_id),
  constraint protein_coaching_events_event_type_values
    check (event_type in ('cut_too_fast', 'bulk_too_fast')),
  constraint protein_coaching_events_state_values
    check (state in ('pending', 'acknowledged', 'superseded')),
  constraint protein_coaching_events_evidence_fingerprint_length
    check (
      length(evidence_fingerprint) between 1 and 256
      and evidence_fingerprint = btrim(evidence_fingerprint)
    ),
  constraint protein_coaching_events_evidence_minimum
    check (
      cardinality(evidence_weight_entry_ids) >= 3
      and array_position(evidence_weight_entry_ids, null) is null
    )
);

create table public.protein_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  expires_at timestamptz,
  last_seen_at timestamptz not null default now(),
  platform_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint protein_push_subscriptions_user_id_id_unique unique (user_id, id),
  constraint protein_push_subscriptions_endpoint_length
    check (length(endpoint) between 1 and 2048 and endpoint = btrim(endpoint)),
  constraint protein_push_subscriptions_p256dh_length
    check (length(p256dh) between 1 and 512 and p256dh = btrim(p256dh)),
  constraint protein_push_subscriptions_auth_secret_length
    check (
      length(auth_secret) between 1 and 512
      and auth_secret = btrim(auth_secret)
    ),
  constraint protein_push_subscriptions_platform_metadata_object
    check (jsonb_typeof(platform_metadata) = 'object')
);

create table public.protein_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reminder_kind text not null,
  source_weight_entry_id uuid not null,
  due_local_date date not null,
  time_zone text not null,
  due_local_time time not null,
  due_at timestamptz not null,
  status text not null default 'pending',
  claim_token uuid,
  claimed_at timestamptz,
  retry_at timestamptz,
  invalidated_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint protein_notification_jobs_user_id_id_unique unique (user_id, id),
  constraint protein_notification_jobs_source_weight_owner_fk
    foreign key (user_id, source_weight_entry_id)
    references public.protein_weight_entries (user_id, id)
    on delete cascade,
  constraint protein_notification_jobs_dedupe
    unique (user_id, reminder_kind, source_weight_entry_id),
  constraint protein_notification_jobs_reminder_kind_values
    check (reminder_kind = 'weigh_in_due'),
  constraint protein_notification_jobs_status_values
    check (status in ('pending', 'claimed', 'completed', 'failed', 'invalidated')),
  constraint protein_notification_jobs_claim_pair
    check ((claim_token is null) = (claimed_at is null)),
  constraint protein_notification_jobs_claimed_state
    check (status <> 'claimed' or claim_token is not null),
  constraint protein_notification_jobs_invalidated_state
    check (status <> 'invalidated' or invalidated_at is not null),
  constraint protein_notification_jobs_attempts_nonnegative
    check (attempts >= 0),
  constraint protein_notification_jobs_time_zone_length
    check (length(time_zone) between 1 and 255 and time_zone = btrim(time_zone))
);

create table public.protein_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null,
  subscription_id uuid,
  subscription_fingerprint text not null,
  reminder_kind text not null,
  due_local_date date not null,
  status text not null default 'pending',
  attempted_at timestamptz,
  delivered_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  constraint protein_notification_deliveries_job_owner_fk
    foreign key (user_id, job_id)
    references public.protein_notification_jobs (user_id, id)
    on delete cascade,
  constraint protein_notification_deliveries_subscription_owner_fk
    foreign key (user_id, subscription_id)
    references public.protein_push_subscriptions (user_id, id)
    on delete set null (subscription_id),
  constraint protein_notification_deliveries_reminder_kind_values
    check (reminder_kind = 'weigh_in_due'),
  constraint protein_notification_deliveries_status_values
    check (status in ('pending', 'sent', 'failed', 'invalid_subscription')),
  constraint protein_notification_deliveries_subscription_fingerprint
    check (
      subscription_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  constraint protein_notification_deliveries_delivery_state
    check (
      (status = 'pending'
        and attempted_at is null
        and delivered_at is null
        and error_code is null)
      or (status = 'sent'
        and attempted_at is not null
        and delivered_at is not null
        and error_code is null)
      or (status in ('failed', 'invalid_subscription')
        and attempted_at is not null
        and delivered_at is null
        and error_code is not null)
    ),
  constraint protein_notification_deliveries_error_code_length
    check (
      error_code is null
      or (
        length(error_code) between 1 and 128
        and error_code = btrim(error_code)
      )
    )
);

create table public.protein_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  request_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint protein_security_events_event_type_length
    check (
      length(event_type) between 1 and 128
      and event_type = btrim(event_type)
    ),
  constraint protein_security_events_request_id_length
    check (
      length(request_id) between 1 and 128
      and request_id = btrim(request_id)
    ),
  constraint protein_security_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index protein_goal_periods_user_effective_dates_idx
  on public.protein_goal_periods (
    user_id,
    effective_start_date desc,
    effective_end_date
  );

create unique index protein_goal_periods_one_pending_idx
  on public.protein_goal_periods (user_id)
  where acknowledged_at is null and superseded_at is null;

create unique index protein_goal_periods_one_current_idx
  on public.protein_goal_periods (user_id)
  where acknowledged_at is not null and effective_end_date is null;

create index protein_food_entries_user_local_date_idx
  on public.protein_food_entries (user_id, local_date, logged_at desc);

create index protein_food_entries_source_batch_idx
  on public.protein_food_entries (user_id, source_batch_id);

create index protein_weight_entries_user_local_date_idx
  on public.protein_weight_entries (user_id, local_date, measured_at desc);

create index protein_coaching_events_user_created_idx
  on public.protein_coaching_events (user_id, created_at desc);

create index protein_push_subscriptions_user_idx
  on public.protein_push_subscriptions (user_id);

create index protein_notification_jobs_due_claim_idx
  on public.protein_notification_jobs (
    status,
    due_at,
    retry_at
  )
  where status in ('pending', 'failed');

create index protein_notification_jobs_user_idx
  on public.protein_notification_jobs (user_id);

create unique index protein_notification_deliveries_job_destination_idx
  on public.protein_notification_deliveries (
    job_id,
    subscription_fingerprint
  );

create index protein_notification_deliveries_user_idx
  on public.protein_notification_deliveries (user_id);

create index protein_notification_deliveries_pending_idx
  on public.protein_notification_deliveries (job_id, status)
  where status in ('pending', 'failed');

create index protein_security_events_user_created_idx
  on public.protein_security_events (user_id, created_at desc);

create function public.protein_validate_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_time_zone text;
begin
  v_time_zone := to_jsonb(new)->>tg_argv[0];

  if v_time_zone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = v_time_zone
  ) then
    raise exception 'Invalid IANA time zone.' using errcode = '22023';
  end if;

  return new;
end;
$$;

create function public.protein_manage_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create function public.protein_enforce_food_entry_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = new.time_zone
  ) then
    raise exception 'Invalid IANA time zone.' using errcode = '22023';
  end if;

  if new.local_date is distinct from
     (new.logged_at at time zone new.time_zone)::date then
    raise exception 'Food local date does not match its logged moment and time zone.'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.source_batch_id is distinct from old.source_batch_id
    or new.logged_at is distinct from old.logged_at
    or new.local_date is distinct from old.local_date
    or new.time_zone is distinct from old.time_zone
    or new.input_method is distinct from old.input_method
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Food ownership, provenance, and local-day fields are immutable.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create function public.protein_enforce_weight_entry_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = new.time_zone
  ) then
    raise exception 'Invalid IANA time zone.' using errcode = '22023';
  end if;

  if new.local_date is distinct from
     (new.measured_at at time zone new.time_zone)::date then
    raise exception 'Weight local date does not match its measured moment and time zone.'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.measured_at is distinct from old.measured_at
    or new.local_date is distinct from old.local_date
    or new.time_zone is distinct from old.time_zone
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Weight ownership, provenance, and local-day fields are immutable.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create function public.protein_enforce_notification_job_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = new.time_zone
  ) then
    raise exception 'Invalid IANA time zone.' using errcode = '22023';
  end if;

  if new.due_at is distinct from
     ((new.due_local_date + new.due_local_time) at time zone new.time_zone) then
    raise exception 'Notification due moment does not match its local schedule and time zone.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create function public.protein_lock_tracking_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_user_id uuid;
  v_new_user_id uuid;
  v_first_user_id uuid;
  v_second_user_id uuid;
  v_lock_acquired boolean;
begin
  if tg_op <> 'INSERT' then
    v_old_user_id := old.user_id;
  end if;

  if tg_op <> 'DELETE' then
    v_new_user_id := new.user_id;
  end if;

  if v_old_user_id is not null
     and v_new_user_id is not null
     and v_old_user_id is distinct from v_new_user_id then
    if v_old_user_id::text < v_new_user_id::text then
      v_first_user_id := v_old_user_id;
      v_second_user_id := v_new_user_id;
    else
      v_first_user_id := v_new_user_id;
      v_second_user_id := v_old_user_id;
    end if;
  else
    v_first_user_id := coalesce(v_new_user_id, v_old_user_id);
  end if;

  -- Row-locking UPDATE/DELETE paths must not wait behind erase. INSERT also
  -- uses try-lock so multi-user service transactions cannot deadlock by taking
  -- user locks in opposite statement order. A caller may retry SQLSTATE 40001.
  v_lock_acquired := pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'protein_tracking_user:' || v_first_user_id::text,
      0
    )
  );

  if not v_lock_acquired then
    raise exception 'Concurrent Protein Tracker mutation; retry the request.'
      using errcode = '40001';
  end if;

  if v_second_user_id is not null then
    v_lock_acquired := pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'protein_tracking_user:' || v_second_user_id::text,
        0
      )
    );

    if not v_lock_acquired then
      raise exception 'Concurrent Protein Tracker mutation; retry the request.'
        using errcode = '40001';
    end if;
  end if;

  -- Every successful tracking-row insert rechecks onboarding while it owns the
  -- same advisory lock used by erase. If erase owns the lock, INSERT fails
  -- retryably; if INSERT owns it first, erase follows and removes that row. The
  -- profile insert itself establishes the profile row, so it is exempt.
  if tg_op = 'INSERT' and tg_table_name <> 'protein_profiles' then
    perform 1
    from public.protein_profiles as profile
    where profile.user_id = v_new_user_id
      and profile.onboarding_completed_at is not null
    for key share;

    if not found then
      raise exception 'Tracking writes require a completed Protein Tracker profile.'
        using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create function public.protein_prevent_referenced_weight_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.protein_coaching_events as coaching
    where coaching.user_id = old.user_id
      and old.id = any(coaching.evidence_weight_entry_ids)
  ) and exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = old.user_id
  ) then
    raise exception 'A weight entry used as coaching evidence cannot be deleted.'
      using errcode = '23503';
  end if;

  return old;
end;
$$;

create function public.protein_enforce_coaching_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_distinct_evidence_count integer;
  v_owned_evidence_count integer;
begin
  select count(distinct evidence_id)::integer
  into v_distinct_evidence_count
  from unnest(new.evidence_weight_entry_ids) as evidence(evidence_id);

  if v_distinct_evidence_count < 3
     or v_distinct_evidence_count <> cardinality(new.evidence_weight_entry_ids) then
    raise exception 'Coaching evidence requires at least three distinct weight entries.'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_owned_evidence_count
  from (
    select weight.id
    from public.protein_weight_entries as weight
    where weight.user_id = new.user_id
      and weight.id = any(new.evidence_weight_entry_ids)
    order by weight.id
    for key share
  ) as locked_evidence;

  if v_owned_evidence_count <> v_distinct_evidence_count then
    raise exception 'Coaching evidence must reference existing weight entries owned by the same user.'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create function public.protein_enforce_goal_period_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
  ) then
    raise exception 'Goal ownership and identity are immutable.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and old.acknowledged_at is not null then
    if new.direction is distinct from old.direction
       or new.effective_start_date is distinct from old.effective_start_date
       or new.calorie_lower is distinct from old.calorie_lower
       or new.calorie_upper is distinct from old.calorie_upper
       or new.protein_lower is distinct from old.protein_lower
       or new.protein_upper is distinct from old.protein_upper
       or new.calculation_input_snapshot is distinct from old.calculation_input_snapshot
       or new.calculation_output_snapshot is distinct from old.calculation_output_snapshot
       or new.policy_version is distinct from old.policy_version
       or new.eligibility_attestation_version is distinct from old.eligibility_attestation_version
       or new.reason is distinct from old.reason
       or new.proposed_at is distinct from old.proposed_at
       or new.acknowledged_at is distinct from old.acknowledged_at
       or new.created_at is distinct from old.created_at then
      raise exception 'Acknowledged goal meaning fields are immutable.'
        using errcode = '22023';
    end if;

    if old.effective_end_date is not null and
       new.effective_end_date is distinct from old.effective_end_date then
      raise exception 'A closed goal period cannot be reopened or re-dated.'
        using errcode = '22023';
    end if;

    if old.superseded_at is not null and
       new.superseded_at is distinct from old.superseded_at then
      raise exception 'A superseded goal period cannot be reopened or re-dated.'
        using errcode = '22023';
    end if;
  end if;

  if new.acknowledged_at is not null and exists (
    select 1
    from public.protein_goal_periods as existing
    where existing.user_id = new.user_id
      and existing.id <> new.id
      and existing.acknowledged_at is not null
      and daterange(
        existing.effective_start_date,
        existing.effective_end_date,
        '[)'
      ) && daterange(
        new.effective_start_date,
        new.effective_end_date,
        '[)'
      )
  ) then
    raise exception 'Acknowledged goal periods cannot overlap.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

create trigger protein_profiles_validate_time_zone
before insert or update of time_zone on public.protein_profiles
for each row execute function public.protein_validate_time_zone('time_zone');

create trigger protein_00_profiles_tracking_lock
before insert or update or delete on public.protein_profiles
for each row execute function public.protein_lock_tracking_mutation();

create trigger protein_profiles_timestamps
before insert or update on public.protein_profiles
for each row execute function public.protein_manage_timestamps();

create trigger protein_00_goal_periods_tracking_lock
before insert or update or delete on public.protein_goal_periods
for each row execute function public.protein_lock_tracking_mutation();

create trigger protein_00_food_entries_tracking_lock
before insert or update or delete on public.protein_food_entries
for each row execute function public.protein_lock_tracking_mutation();

create trigger protein_00_weight_entries_tracking_lock
before insert or update or delete on public.protein_weight_entries
for each row execute function public.protein_lock_tracking_mutation();

create trigger protein_10_coaching_events_tracking_lock
before insert or update or delete on public.protein_coaching_events
for each row execute function public.protein_lock_tracking_mutation();

create trigger protein_00_notification_jobs_tracking_lock
before insert or update or delete on public.protein_notification_jobs
for each row execute function public.protein_lock_tracking_mutation();

create trigger protein_00_notification_deliveries_tracking_lock
before insert or update or delete on public.protein_notification_deliveries
for each row execute function public.protein_lock_tracking_mutation();

create trigger protein_preferences_timestamps
before insert or update on public.protein_preferences
for each row execute function public.protein_manage_timestamps();

create trigger protein_food_entries_integrity
before insert or update on public.protein_food_entries
for each row execute function public.protein_enforce_food_entry_integrity();

create trigger protein_food_entries_timestamps
before insert or update on public.protein_food_entries
for each row execute function public.protein_manage_timestamps();

create trigger protein_weight_entries_integrity
before insert or update on public.protein_weight_entries
for each row execute function public.protein_enforce_weight_entry_integrity();

create trigger protein_weight_entries_timestamps
before insert or update on public.protein_weight_entries
for each row execute function public.protein_manage_timestamps();

create trigger protein_00_coaching_events_evidence_integrity
before insert or update of user_id, evidence_weight_entry_ids
on public.protein_coaching_events
for each row execute function public.protein_enforce_coaching_evidence();

create trigger protein_10_weight_entries_referenced_delete
before delete on public.protein_weight_entries
for each row execute function public.protein_prevent_referenced_weight_delete();

create trigger protein_push_subscriptions_timestamps
before insert or update on public.protein_push_subscriptions
for each row execute function public.protein_manage_timestamps();

create trigger protein_00_push_subscriptions_tracking_lock
before update or delete on public.protein_push_subscriptions
for each row execute function public.protein_lock_tracking_mutation();

create trigger protein_notification_jobs_integrity
before insert or update on public.protein_notification_jobs
for each row execute function public.protein_enforce_notification_job_integrity();

create trigger protein_notification_jobs_timestamps
before insert or update on public.protein_notification_jobs
for each row execute function public.protein_manage_timestamps();

create trigger protein_goal_periods_integrity
before insert or update on public.protein_goal_periods
for each row execute function public.protein_enforce_goal_period_integrity();

create function public.protein_confirm_goal_period(p_goal_period_id uuid)
returns public.protein_goal_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_target public.protein_goal_periods%rowtype;
  v_current public.protein_goal_periods%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_goal_period_id is null then
    raise exception 'Goal period id is required.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'protein_tracking_user:' || v_user_id::text,
      0
    )
  );

  perform 1
  from public.protein_goal_periods as goal
  where goal.user_id = v_user_id
  order by goal.effective_start_date, goal.id
  for update;

  select goal.*
  into v_target
  from public.protein_goal_periods as goal
  where goal.id = p_goal_period_id
    and goal.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Pending goal period was not found.' using errcode = 'P0002';
  end if;

  if v_target.acknowledged_at is not null
     and v_target.effective_end_date is null
     and v_target.superseded_at is null then
    return v_target;
  end if;

  if v_target.acknowledged_at is not null or v_target.superseded_at is not null then
    raise exception 'Goal period is not a pending proposal.' using errcode = '22023';
  end if;

  select goal.*
  into v_current
  from public.protein_goal_periods as goal
  where goal.user_id = v_user_id
    and goal.acknowledged_at is not null
    and goal.effective_end_date is null
    and goal.id <> v_target.id
  for update;

  if found then
    if v_target.effective_start_date <= v_current.effective_start_date then
      raise exception 'A replacement goal must start after the current goal.'
        using errcode = '22023';
    end if;

    update public.protein_goal_periods
    set effective_end_date = v_target.effective_start_date,
        superseded_at = now()
    where id = v_current.id;
  end if;

  update public.protein_goal_periods
  set acknowledged_at = now()
  where id = v_target.id
  returning * into strict v_target;

  return v_target;
end;
$$;

create function public.protein_erase_tracking_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'User id is required.' using errcode = '22023';
  end if;

  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  -- Erase enters the same per-user lock domain before touching rows. Concurrent
  -- trigger-driven mutations use try-lock and fail retryably rather than wait
  -- while holding row or FK-related locks and form a lock cycle.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('protein_tracking_user:' || p_user_id::text, 0)
  );

  delete from public.protein_notification_deliveries where user_id = p_user_id;
  delete from public.protein_notification_jobs where user_id = p_user_id;
  delete from public.protein_coaching_events where user_id = p_user_id;
  delete from public.protein_food_entries where user_id = p_user_id;
  delete from public.protein_weight_entries where user_id = p_user_id;
  delete from public.protein_goal_periods where user_id = p_user_id;

  update public.protein_profiles
  set onboarding_completed_at = null,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

alter table public.protein_profiles enable row level security;
alter table public.protein_preferences enable row level security;
alter table public.protein_goal_periods enable row level security;
alter table public.protein_food_entries enable row level security;
alter table public.protein_weight_entries enable row level security;
alter table public.protein_coaching_events enable row level security;
alter table public.protein_push_subscriptions enable row level security;
alter table public.protein_notification_jobs enable row level security;
alter table public.protein_notification_deliveries enable row level security;
alter table public.protein_security_events enable row level security;

create policy protein_profiles_select_own
on public.protein_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy protein_preferences_select_own
on public.protein_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy protein_preferences_insert_own
on public.protein_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy protein_preferences_update_own
on public.protein_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy protein_goal_periods_select_own
on public.protein_goal_periods
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy protein_food_entries_select_own
on public.protein_food_entries
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy protein_food_entries_insert_own
on public.protein_food_entries
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy protein_food_entries_update_own
on public.protein_food_entries
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy protein_food_entries_delete_own
on public.protein_food_entries
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy protein_weight_entries_select_own
on public.protein_weight_entries
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy protein_weight_entries_insert_own
on public.protein_weight_entries
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy protein_weight_entries_update_own
on public.protein_weight_entries
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy protein_weight_entries_delete_own
on public.protein_weight_entries
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy protein_coaching_events_select_own
on public.protein_coaching_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create view public.protein_daily_totals
with (security_invoker = true)
as
select
  entry.user_id,
  entry.local_date,
  sum(entry.protein_grams)::numeric(12, 2) as protein_grams,
  sum(entry.calories)::bigint as calories,
  count(*)::bigint as entry_count
from public.protein_food_entries as entry
group by entry.user_id, entry.local_date;

revoke all on table public.protein_profiles
  from public, anon, authenticated;
revoke all on table public.protein_preferences
  from public, anon, authenticated;
revoke all on table public.protein_goal_periods
  from public, anon, authenticated;
revoke all on table public.protein_food_entries
  from public, anon, authenticated;
revoke all on table public.protein_weight_entries
  from public, anon, authenticated;
revoke all on table public.protein_coaching_events
  from public, anon, authenticated;
revoke all on table public.protein_push_subscriptions
  from public, anon, authenticated;
revoke all on table public.protein_notification_jobs
  from public, anon, authenticated;
revoke all on table public.protein_notification_deliveries
  from public, anon, authenticated;
revoke all on table public.protein_security_events
  from public, anon, authenticated;
revoke all on table public.protein_daily_totals
  from public, anon, authenticated;

revoke all on function public.protein_validate_time_zone()
  from public, anon, authenticated;
revoke all on function public.protein_manage_timestamps()
  from public, anon, authenticated;
revoke all on function public.protein_enforce_food_entry_integrity()
  from public, anon, authenticated;
revoke all on function public.protein_enforce_weight_entry_integrity()
  from public, anon, authenticated;
revoke all on function public.protein_enforce_notification_job_integrity()
  from public, anon, authenticated;
revoke all on function public.protein_lock_tracking_mutation()
  from public, anon, authenticated;
revoke all on function public.protein_enforce_coaching_evidence()
  from public, anon, authenticated;
revoke all on function public.protein_prevent_referenced_weight_delete()
  from public, anon, authenticated;
revoke all on function public.protein_enforce_goal_period_integrity()
  from public, anon, authenticated;
revoke all on function public.protein_confirm_goal_period(uuid)
  from public, anon, authenticated;
revoke all on function public.protein_erase_tracking_data(uuid)
  from public, anon, authenticated;

grant select on table public.protein_profiles to authenticated;
grant select on table public.protein_preferences to authenticated;
grant insert (
  user_id,
  default_food_action,
  notifications_enabled
) on table public.protein_preferences to authenticated;
grant update (
  default_food_action,
  notifications_enabled
) on table public.protein_preferences to authenticated;
grant select on table public.protein_goal_periods to authenticated;
grant select, delete on table public.protein_food_entries to authenticated;
grant insert (
  user_id,
  source_batch_id,
  logged_at,
  local_date,
  time_zone,
  item_name,
  protein_grams,
  calories,
  input_method,
  confidence
) on table public.protein_food_entries to authenticated;
grant update (
  item_name,
  protein_grams,
  calories,
  confidence
) on table public.protein_food_entries to authenticated;
grant select, delete on table public.protein_weight_entries to authenticated;
grant insert (
  user_id,
  measured_at,
  local_date,
  time_zone,
  pounds
) on table public.protein_weight_entries to authenticated;
grant update (pounds)
  on table public.protein_weight_entries to authenticated;
grant select on table public.protein_coaching_events to authenticated;
grant select on table public.protein_daily_totals to authenticated;
grant execute on function public.protein_confirm_goal_period(uuid)
  to authenticated;

grant select, insert, update, delete on table public.protein_profiles to service_role;
grant select, insert, update, delete on table public.protein_preferences to service_role;
grant select, insert, update, delete on table public.protein_goal_periods to service_role;
grant select, insert, update, delete on table public.protein_food_entries to service_role;
grant select, insert, update, delete on table public.protein_weight_entries to service_role;
grant select, insert, update, delete on table public.protein_coaching_events to service_role;
grant select, insert, update, delete on table public.protein_push_subscriptions to service_role;
grant select, insert, update, delete on table public.protein_notification_jobs to service_role;
grant select, insert, update, delete on table public.protein_notification_deliveries to service_role;
grant select, insert, update, delete on table public.protein_security_events to service_role;
grant select on table public.protein_daily_totals to service_role;

grant execute on function public.protein_lock_tracking_mutation() to service_role;
grant execute on function public.protein_enforce_coaching_evidence() to service_role;
grant execute on function public.protein_prevent_referenced_weight_delete() to service_role;
grant execute on function public.protein_confirm_goal_period(uuid) to service_role;
grant execute on function public.protein_erase_tracking_data(uuid) to service_role;
