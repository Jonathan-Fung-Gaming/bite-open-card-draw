-- Protein Tracker Phase 3: move all canonical goal calculations behind the
-- authenticated database boundary. The original caller-supplied calculation
-- RPC remains for migration compatibility but is no longer executable.

revoke execute on function public.protein_complete_onboarding(
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
) from authenticated, service_role;

create function public.protein_complete_onboarding_v2(
  p_weight_entry_id uuid,
  p_goal_period_id uuid,
  p_birth_month smallint,
  p_birth_year smallint,
  p_equation_sex text,
  p_height_inches numeric,
  p_activity_level text,
  p_goal_direction text,
  p_time_zone text,
  p_weight_pounds numeric,
  p_eligibility_attested boolean
)
returns public.protein_goal_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_local_date date;
  v_local_year integer;
  v_local_month integer;
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
  v_input_snapshot jsonb;
  v_output_snapshot jsonb;
  v_profile public.protein_profiles%rowtype;
  v_weight public.protein_weight_entries%rowtype;
  v_goal public.protein_goal_periods%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_eligibility_attested is distinct from true then
    raise exception 'Adult eligibility attestation is required.' using errcode = '22023';
  end if;

  if p_weight_entry_id is null
     or p_goal_period_id is null
     or p_birth_month is null
     or p_birth_year is null
     or p_equation_sex is null
     or p_height_inches is null
     or p_activity_level is null
     or p_goal_direction is null
     or p_time_zone is null
     or p_weight_pounds is null then
    raise exception 'All onboarding inputs are required.' using errcode = '22023';
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
       or v_profile.calculation_policy_version <> 'protein-v1'
       or v_profile.eligibility_attestation_version <> 'adult-v1'
       or v_weight.time_zone is distinct from p_time_zone
       or v_weight.pounds is distinct from p_weight_pounds
       or v_goal.direction is distinct from p_goal_direction
       or v_goal.effective_end_date is not null
       or v_goal.policy_version <> 'protein-v1'
       or v_goal.eligibility_attestation_version <> 'adult-v1'
       or v_goal.reason <> 'onboarding'
       or v_goal.superseded_at is not null then
      raise exception 'Onboarding is already complete with different inputs.'
        using errcode = '22023';
    end if;

    return v_goal;
  end if;

  -- PostgreSQL validates the IANA zone name while deriving both canonical dates.
  v_local_date := (v_now at time zone p_time_zone)::date;
  v_local_year := extract(year from v_local_date)::integer;
  v_local_month := extract(month from v_local_date)::integer;
  v_age_years := v_local_year - p_birth_year
    - case when v_local_month < p_birth_month then 1 else 0 end;

  if v_age_years < 18 then
    raise exception 'Automated goals require an adult age of at least 18.'
      using errcode = '22023';
  end if;

  v_height_cm := p_height_inches * 2.54;
  v_weight_kg := p_weight_pounds * 0.45359237;
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
    + (v_age_coefficient * v_age_years)
    + (v_height_coefficient * v_height_cm)
    + (v_weight_coefficient * v_weight_kg)
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

  -- All values are nonnegative here; floor(x + 0.5) is deterministic half-up.
  v_calorie_lower := (pg_catalog.floor(v_raw_calorie_lower / 50 + 0.5) * 50)::integer;
  v_calorie_upper := (pg_catalog.floor(v_raw_calorie_upper / 50 + 0.5) * 50)::integer;
  v_raw_protein_lower := v_weight_kg * 1.2;
  v_raw_protein_upper := v_weight_kg * 1.6;
  v_protein_lower := pg_catalog.floor(v_raw_protein_lower + 0.5)::integer;
  v_protein_upper := pg_catalog.floor(v_raw_protein_upper + 0.5)::integer;

  v_input_snapshot := jsonb_build_object(
    'policyVersion', 'protein-v1',
    'eligibilityAttestationVersion', 'adult-v1',
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
    'weightPounds', p_weight_pounds,
    'weightKilograms', v_weight_kg,
    'bmi', v_bmi
  );

  v_output_snapshot := jsonb_build_object(
    'eerKcalUnrounded', v_eer,
    'eerEquation', jsonb_build_object(
      'intercept', v_intercept,
      'ageCoefficient', v_age_coefficient,
      'heightCmCoefficient', v_height_coefficient,
      'weightKgCoefficient', v_weight_coefficient,
      'growthAllowanceKcal', v_growth_allowance
    ),
    'calorieFloorKcal', v_calorie_floor,
    'calorieRangeRaw', jsonb_build_object(
      'lower', v_raw_calorie_lower,
      'upper', v_raw_calorie_upper
    ),
    'calorieRangeDisplayed', jsonb_build_object(
      'lower', v_calorie_lower,
      'upper', v_calorie_upper
    ),
    'proteinRangeRawGrams', jsonb_build_object(
      'lower', v_raw_protein_lower,
      'upper', v_raw_protein_upper
    ),
    'proteinRangeDisplayedGrams', jsonb_build_object(
      'lower', v_protein_lower,
      'upper', v_protein_upper
    ),
    'calorieRounding', 'nearest_50_half_up',
    'proteinRounding', 'nearest_1_half_up'
  );

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
  ) values (
    v_user_id,
    p_birth_month,
    p_birth_year,
    p_equation_sex,
    p_height_inches,
    p_activity_level,
    p_goal_direction,
    p_time_zone,
    'protein-v1',
    'adult-v1',
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
  ) values (
    p_weight_entry_id,
    v_user_id,
    v_now,
    v_local_date,
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
    'adult-v1',
    'onboarding',
    v_now
  )
  returning * into v_goal;

  return v_goal;
end;
$$;

revoke all on function public.protein_complete_onboarding_v2(
  uuid,
  uuid,
  smallint,
  smallint,
  text,
  numeric,
  text,
  text,
  text,
  numeric,
  boolean
) from public, anon, authenticated, service_role;

grant execute on function public.protein_complete_onboarding_v2(
  uuid,
  uuid,
  smallint,
  smallint,
  text,
  numeric,
  text,
  text,
  text,
  numeric,
  boolean
) to authenticated, service_role;
