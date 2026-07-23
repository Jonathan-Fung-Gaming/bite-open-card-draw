-- Phase 6 Protein Tracker trend coaching contracts.

update public.protein_coaching_events as coaching
set state = 'acknowledged',
    acknowledged_at = coalesce(coaching.acknowledged_at, goal.acknowledged_at)
from public.protein_goal_periods as goal
where coaching.user_id = goal.user_id
  and coaching.proposed_goal_period_id = goal.id
  and goal.acknowledged_at is not null
  and (
    coaching.state <> 'acknowledged'
    or coaching.acknowledged_at is null
  );

create index protein_coaching_events_user_acknowledged_idx
  on public.protein_coaching_events (user_id, acknowledged_at desc)
  where state = 'acknowledged'
    and acknowledged_at is not null
    and proposed_goal_period_id is not null;

create function public.protein_create_trend_goal_proposal(
  p_user_id uuid,
  p_event_type text,
  p_evidence_weight_entry_ids uuid[],
  p_weekly_percent_change numeric
)
returns table (
  outcome text,
  coaching_event_id uuid,
  goal_period_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_onboarding_completed_at timestamptz;
  v_local_date date;
  v_evidence_ids uuid[];
  v_evidence_count integer;
  v_evidence_fingerprint text;
  v_existing_event public.protein_coaching_events%rowtype;
  v_existing_goal public.protein_goal_periods%rowtype;
  v_pending_goal public.protein_goal_periods%rowtype;
  v_pending_event_id uuid;
  v_current public.protein_goal_periods%rowtype;
  v_last_event public.protein_coaching_events%rowtype;
  v_last_evidence_at timestamptz;
  v_new_evidence_count integer;
  v_adjustment integer;
  v_policy_version text;
  v_goal public.protein_goal_periods%rowtype;
  v_event public.protein_coaching_events%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  if p_user_id is null
     or p_event_type is null
     or p_evidence_weight_entry_ids is null
     or p_weekly_percent_change is null then
    raise exception 'Trend proposal inputs are required.' using errcode = '22023';
  end if;

  if p_event_type not in ('cut_too_fast', 'bulk_too_fast') then
    raise exception 'Unsupported coaching event type.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'protein_tracking_user:' || p_user_id::text,
      0
    )
  );

  select profile.onboarding_completed_at,
         (v_now at time zone profile.time_zone)::date
  into strict v_onboarding_completed_at, v_local_date
  from public.protein_profiles as profile
  where profile.user_id = p_user_id;

  if v_onboarding_completed_at is null then
    raise exception 'A completed Protein Tracker profile is required.'
      using errcode = '55000';
  end if;

  select pg_catalog.array_agg(evidence.evidence_id order by evidence.evidence_id::text),
         pg_catalog.count(*)::integer
  into v_evidence_ids, v_evidence_count
  from (
    select distinct requested.evidence_id
    from pg_catalog.unnest(p_evidence_weight_entry_ids) as requested(evidence_id)
    where requested.evidence_id is not null
  ) as evidence;

  if v_evidence_count < 3
     or v_evidence_count <> pg_catalog.cardinality(p_evidence_weight_entry_ids) then
    raise exception 'Trend evidence requires at least three distinct weight entries.'
      using errcode = '22023';
  end if;

  perform weight.id
  from public.protein_weight_entries as weight
  where weight.user_id = p_user_id
    and weight.id = any(v_evidence_ids)
  order by weight.id
  for key share;

  if not found or (
    select pg_catalog.count(*)
    from public.protein_weight_entries as weight
    where weight.user_id = p_user_id
      and weight.id = any(v_evidence_ids)
  ) <> v_evidence_count then
    raise exception 'Trend evidence must reference existing weight entries owned by the same user.'
      using errcode = '23503';
  end if;

  select goal.*
  into v_current
  from public.protein_goal_periods as goal
  where goal.user_id = p_user_id
    and goal.acknowledged_at is not null
    and goal.effective_end_date is null
  for update;

  if not found then
    raise exception 'A current goal period is required.' using errcode = '55000';
  end if;

  if p_event_type = 'cut_too_fast' then
    if v_current.direction <> 'cut' or p_weekly_percent_change >= 0 then
      raise exception 'Cut coaching requires a negative Cut trend.'
        using errcode = '22023';
    end if;
    v_adjustment := 100;
  else
    if v_current.direction <> 'bulk' or p_weekly_percent_change <= 0 then
      raise exception 'Bulk coaching requires a positive Bulk trend.'
        using errcode = '22023';
    end if;
    v_adjustment := -100;
  end if;

  if v_current.calorie_lower + v_adjustment not between 0 and 10000
     or v_current.calorie_upper + v_adjustment not between 0 and 10000 then
    raise exception 'The trend adjustment exceeds the supported calorie bounds.'
      using errcode = '22003';
  end if;

  v_evidence_fingerprint := pg_catalog.encode(
    extensions.digest(
      v_current.id::text || ':'
        || v_current.direction || ':'
        || 'protein-trend-v1:'
        || p_event_type || ':'
        || pg_catalog.array_to_string(v_evidence_ids, ','),
      'sha256'
    ),
    'hex'
  );

  select coaching.*
  into v_existing_event
  from public.protein_coaching_events as coaching
  where coaching.user_id = p_user_id
    and coaching.evidence_fingerprint = v_evidence_fingerprint
  for update;

  if found then
    if v_existing_event.state = 'pending'
       and v_existing_event.proposed_goal_period_id is not null then
      select goal.*
      into v_existing_goal
      from public.protein_goal_periods as goal
      where goal.user_id = p_user_id
        and goal.id = v_existing_event.proposed_goal_period_id;

      if found and v_existing_goal.acknowledged_at is null
         and v_existing_goal.superseded_at is null then
        return query select
          'existing_pending'::text,
          v_existing_event.id,
          v_existing_event.proposed_goal_period_id;
        return;
      end if;
    end if;

    return query select
      'already_processed'::text,
      v_existing_event.id,
      v_existing_event.proposed_goal_period_id;
    return;
  end if;

  select goal.*
  into v_pending_goal
  from public.protein_goal_periods as goal
  where goal.user_id = p_user_id
    and goal.acknowledged_at is null
    and goal.superseded_at is null
  for update;

  if found then
    select coaching.id
    into v_pending_event_id
    from public.protein_coaching_events as coaching
    where coaching.user_id = p_user_id
      and coaching.proposed_goal_period_id = v_pending_goal.id;

    return query select
      'pending_other'::text,
      v_pending_event_id,
      v_pending_goal.id;
    return;
  end if;

  select coaching.*
  into v_last_event
  from public.protein_coaching_events as coaching
  where coaching.user_id = p_user_id
    and coaching.state = 'acknowledged'
    and coaching.acknowledged_at is not null
    and coaching.proposed_goal_period_id is not null
  order by coaching.acknowledged_at desc nulls last, coaching.id
  limit 1
  for update of coaching;

  if found then
    if v_now < v_last_event.acknowledged_at + interval '14 days' then
      return query select 'cooldown'::text, null::uuid, null::uuid;
      return;
    end if;

    select pg_catalog.max(weight.measured_at)
    into v_last_evidence_at
    from public.protein_weight_entries as weight
    where weight.user_id = p_user_id
      and weight.id = any(v_last_event.evidence_weight_entry_ids);

    select pg_catalog.count(*)::integer
    into v_new_evidence_count
    from public.protein_weight_entries as weight
    where weight.user_id = p_user_id
      and weight.id = any(v_evidence_ids)
      and weight.measured_at > v_last_evidence_at;

    if v_new_evidence_count < 2 then
      return query select
        'insufficient_new_evidence'::text,
        null::uuid,
        null::uuid;
      return;
    end if;
  end if;

  v_policy_version := case
    when pg_catalog.strpos(v_current.policy_version, '+protein-trend-v1') > 0
      then v_current.policy_version
    else v_current.policy_version || '+protein-trend-v1'
  end;

  insert into public.protein_goal_periods (
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
    p_user_id,
    v_current.direction,
    v_local_date,
    v_current.calorie_lower + v_adjustment,
    v_current.calorie_upper + v_adjustment,
    v_current.protein_lower,
    v_current.protein_upper,
    v_current.calculation_input_snapshot || pg_catalog.jsonb_build_object(
      'trend_adjustment',
      pg_catalog.jsonb_build_object(
        'event_type', p_event_type,
        'evidence_weight_entry_ids', pg_catalog.to_jsonb(v_evidence_ids),
        'previous_goal_period_id', v_current.id,
        'trend_policy_version', 'protein-trend-v1',
        'weekly_percent_change', p_weekly_percent_change
      )
    ),
    v_current.calculation_output_snapshot || pg_catalog.jsonb_build_object(
      'trend_adjustment',
      pg_catalog.jsonb_build_object(
        'adjustment_calories', v_adjustment,
        'calorie_lower', v_current.calorie_lower + v_adjustment,
        'calorie_upper', v_current.calorie_upper + v_adjustment,
        'previous_calorie_lower', v_current.calorie_lower,
        'previous_calorie_upper', v_current.calorie_upper
      )
    ),
    v_policy_version,
    v_current.eligibility_attestation_version,
    'trend_adjustment',
    v_now
  )
  returning * into v_goal;

  insert into public.protein_coaching_events (
    user_id,
    event_type,
    state,
    evidence_fingerprint,
    evidence_weight_entry_ids,
    weekly_percent_change,
    proposed_goal_period_id,
    created_at
  ) values (
    p_user_id,
    p_event_type,
    'pending',
    v_evidence_fingerprint,
    v_evidence_ids,
    p_weekly_percent_change,
    v_goal.id,
    v_now
  )
  returning * into v_event;

  return query select 'created'::text, v_event.id, v_goal.id;
end;
$$;

create or replace function public.protein_confirm_goal_period(p_goal_period_id uuid)
returns public.protein_goal_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_local_date date;
  v_effective_start_date date;
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

  select (v_now at time zone profile.time_zone)::date
  into strict v_local_date
  from public.protein_profiles as profile
  where profile.user_id = v_user_id
    and profile.onboarding_completed_at is not null;

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
    update public.protein_coaching_events
    set state = 'acknowledged',
        acknowledged_at = coalesce(acknowledged_at, v_target.acknowledged_at)
    where user_id = v_user_id
      and proposed_goal_period_id = v_target.id
      and state = 'pending';

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

  v_effective_start_date := greatest(
    v_target.effective_start_date,
    v_local_date
  );

  if found then
    v_effective_start_date := greatest(
      v_effective_start_date,
      v_current.effective_start_date + 1
    );

    update public.protein_goal_periods
    set effective_start_date = v_effective_start_date
    where id = v_target.id;

    update public.protein_goal_periods
    set effective_end_date = v_effective_start_date,
        superseded_at = v_now
    where id = v_current.id;
  elsif v_target.effective_start_date is distinct from v_effective_start_date then
    update public.protein_goal_periods
    set effective_start_date = v_effective_start_date
    where id = v_target.id;
  end if;

  update public.protein_goal_periods
  set acknowledged_at = v_now
  where id = v_target.id
  returning * into strict v_target;

  update public.protein_coaching_events
  set state = 'acknowledged',
      acknowledged_at = coalesce(acknowledged_at, v_now)
  where user_id = v_user_id
    and proposed_goal_period_id = v_target.id
    and state = 'pending';

  return v_target;
end;
$$;

revoke all on function public.protein_create_trend_goal_proposal(
  uuid,
  text,
  uuid[],
  numeric
) from public, anon, authenticated, service_role;

grant execute on function public.protein_create_trend_goal_proposal(
  uuid,
  text,
  uuid[],
  numeric
) to service_role;

revoke execute on function public.protein_confirm_goal_period(uuid)
  from public, anon, service_role;

grant execute on function public.protein_confirm_goal_period(uuid)
  to authenticated;
