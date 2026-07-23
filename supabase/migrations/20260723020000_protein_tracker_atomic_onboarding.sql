-- Protein Tracker Phase 3: authenticated, replay-safe onboarding transaction.
-- Nutrition policy calculations remain in the application; this boundary only
-- persists validated profile inputs, the initial weight, and generic snapshots.

create function public.protein_complete_onboarding(
  p_weight_entry_id uuid,
  p_goal_period_id uuid,
  p_birth_month smallint,
  p_birth_year smallint,
  p_equation_sex text,
  p_height_inches numeric,
  p_activity_level text,
  p_goal_direction text,
  p_time_zone text,
  p_policy_version text,
  p_eligibility_attestation_version text,
  p_measured_at timestamptz,
  p_local_date date,
  p_weight_pounds numeric,
  p_effective_start_date date,
  p_calorie_lower integer,
  p_calorie_upper integer,
  p_protein_lower integer,
  p_protein_upper integer,
  p_calculation_input_snapshot jsonb,
  p_calculation_output_snapshot jsonb
)
returns public.protein_goal_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_profile public.protein_profiles%rowtype;
  v_weight public.protein_weight_entries%rowtype;
  v_goal public.protein_goal_periods%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_weight_entry_id is null or p_goal_period_id is null then
    raise exception 'Weight and goal identifiers are required.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'protein_tracking_user:' || v_user_id::text,
      0
    )
  );

  select profile.*
  into v_profile
  from public.protein_profiles as profile
  where profile.user_id = v_user_id
  for update;

  if found and v_profile.onboarding_completed_at is not null then
    select weight_entry.*
    into v_weight
    from public.protein_weight_entries as weight_entry
    where weight_entry.id = p_weight_entry_id
      and weight_entry.user_id = v_user_id;

    select goal.*
    into v_goal
    from public.protein_goal_periods as goal
    where goal.id = p_goal_period_id
      and goal.user_id = v_user_id;

    if v_weight.id is null
       or v_goal.id is null
       or v_profile.birth_month is distinct from p_birth_month
       or v_profile.birth_year is distinct from p_birth_year
       or v_profile.equation_sex is distinct from p_equation_sex
       or v_profile.height_inches is distinct from p_height_inches
       or v_profile.activity_level is distinct from p_activity_level
       or v_profile.goal_direction is distinct from p_goal_direction
       or v_profile.time_zone is distinct from p_time_zone
       or v_profile.calculation_policy_version is distinct from p_policy_version
       or v_profile.eligibility_attestation_version
          is distinct from p_eligibility_attestation_version
       or v_weight.measured_at is distinct from p_measured_at
       or v_weight.local_date is distinct from p_local_date
       or v_weight.time_zone is distinct from p_time_zone
       or v_weight.pounds is distinct from p_weight_pounds
       or v_goal.direction is distinct from p_goal_direction
       or v_goal.effective_start_date is distinct from p_effective_start_date
       or v_goal.effective_end_date is not null
       or v_goal.calorie_lower is distinct from p_calorie_lower
       or v_goal.calorie_upper is distinct from p_calorie_upper
       or v_goal.protein_lower is distinct from p_protein_lower
       or v_goal.protein_upper is distinct from p_protein_upper
       or v_goal.calculation_input_snapshot
          is distinct from p_calculation_input_snapshot
       or v_goal.calculation_output_snapshot
          is distinct from p_calculation_output_snapshot
       or v_goal.policy_version is distinct from p_policy_version
       or v_goal.eligibility_attestation_version
          is distinct from p_eligibility_attestation_version
       or v_goal.reason <> 'onboarding'
       or v_goal.superseded_at is not null then
      raise exception 'Onboarding is already complete with different inputs.'
        using errcode = '22023';
    end if;

    return v_goal;
  end if;

  insert into public.protein_profiles (
    user_id,
    birth_month,
    birth_year,
    equation_sex,
    height_inches,
    activity_level,
    goal_direction,
    time_zone,
    calculation_policy_version,
    eligibility_attestation_version,
    eligibility_attested_at,
    onboarding_completed_at
  )
  values (
    v_user_id,
    p_birth_month,
    p_birth_year,
    p_equation_sex,
    p_height_inches,
    p_activity_level,
    p_goal_direction,
    p_time_zone,
    p_policy_version,
    p_eligibility_attestation_version,
    v_now,
    v_now
  )
  on conflict (user_id) do update
  set birth_month = excluded.birth_month,
      birth_year = excluded.birth_year,
      equation_sex = excluded.equation_sex,
      height_inches = excluded.height_inches,
      activity_level = excluded.activity_level,
      goal_direction = excluded.goal_direction,
      time_zone = excluded.time_zone,
      calculation_policy_version = excluded.calculation_policy_version,
      eligibility_attestation_version = excluded.eligibility_attestation_version,
      eligibility_attested_at = excluded.eligibility_attested_at,
      onboarding_completed_at = excluded.onboarding_completed_at
  where protein_profiles.onboarding_completed_at is null;

  insert into public.protein_weight_entries (
    id,
    user_id,
    measured_at,
    local_date,
    time_zone,
    pounds
  )
  values (
    p_weight_entry_id,
    v_user_id,
    p_measured_at,
    p_local_date,
    p_time_zone,
    p_weight_pounds
  )
  returning * into v_weight;

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
  )
  values (
    p_goal_period_id,
    v_user_id,
    p_goal_direction,
    p_effective_start_date,
    p_calorie_lower,
    p_calorie_upper,
    p_protein_lower,
    p_protein_upper,
    p_calculation_input_snapshot,
    p_calculation_output_snapshot,
    p_policy_version,
    p_eligibility_attestation_version,
    'onboarding',
    v_now
  )
  returning * into v_goal;

  return v_goal;
end;
$$;

revoke all on function public.protein_complete_onboarding(
  uuid,
  uuid,
  smallint,
  smallint,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  date,
  numeric,
  date,
  integer,
  integer,
  integer,
  integer,
  jsonb,
  jsonb
) from public, anon, authenticated;

grant execute on function public.protein_complete_onboarding(
  uuid,
  uuid,
  smallint,
  smallint,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  date,
  numeric,
  date,
  integer,
  integer,
  integer,
  integer,
  jsonb,
  jsonb
) to authenticated, service_role;
