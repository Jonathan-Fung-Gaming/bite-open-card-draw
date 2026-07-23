import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
assert.ok(url && anonKey && serviceRoleKey, "local Supabase values are required");
assert.ok(
  new Set(["127.0.0.1", "localhost", "::1"]).has(new URL(url).hostname),
  "tests may run only against loopback Supabase",
);

const options = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
};
const anonymous = createClient(url, anonKey, options);
const service = createClient(url, serviceRoleKey, options);
const users = [];

async function createUser(label) {
  const email = `protein-training-${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9x!`;
  const created = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  assert.ifError(created.error);
  assert.ok(created.data.user);

  const client = createClient(url, anonKey, options);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  assert.ok(signedIn.data.session);

  const user = { client, id: created.data.user.id };
  users.push(user);
  return user;
}

function onboardingV2Payload(overrides = {}) {
  const now = new Date();
  return {
    p_activity_level: "low_active",
    p_birth_month: now.getUTCMonth() + 1,
    p_birth_year: now.getUTCFullYear() - 30,
    p_eligibility_attested: true,
    p_equation_sex: "male",
    p_goal_direction: "maintain",
    p_goal_period_id: crypto.randomUUID(),
    p_height_inches: 69,
    p_time_zone: "UTC",
    p_weight_entry_id: crypto.randomUUID(),
    p_weight_pounds: 170,
    ...overrides,
  };
}

function onboardingV3Payload(overrides = {}) {
  return {
    ...onboardingV2Payload(),
    p_training_focus: "general",
    ...overrides,
  };
}

function settingsV2Payload(overrides = {}) {
  const now = new Date();
  return {
    p_activity_level: "low_active",
    p_birth_month: now.getUTCMonth() + 1,
    p_birth_year: now.getUTCFullYear() - 30,
    p_equation_sex: "male",
    p_goal_direction: "maintain",
    p_goal_period_id: crypto.randomUUID(),
    p_height_inches: 69,
    p_time_zone: "UTC",
    p_training_focus: "resistance_training",
    ...overrides,
  };
}

function expectedCalories(direction) {
  const heightCm = 69 * 2.54;
  const weightKg = 170 * 0.45359237;
  const eer = 581.47 - 10.83 * 30 + 8.3 * heightCm + 14.94 * weightKg;
  const raw =
    direction === "cut"
      ? { lower: eer - 600, upper: eer - 400 }
      : direction === "bulk"
        ? { lower: eer * 1.05, upper: eer * 1.1 }
        : { lower: eer * 0.95, upper: eer * 1.05 };
  return {
    lower: Math.floor(raw.lower / 50 + 0.5) * 50,
    upper: Math.floor(raw.upper / 50 + 0.5) * 50,
  };
}

function expectedProtein(trainingFocus) {
  const weightKg = 170 * 0.45359237;
  const multipliers =
    trainingFocus === "resistance_training" ? { lower: 1.6, upper: 2 } : { lower: 1.2, upper: 1.6 };
  return {
    lower: Math.floor(weightKg * multipliers.lower + 0.5),
    multipliers,
    upper: Math.floor(weightKg * multipliers.upper + 0.5),
    weightKg,
  };
}

after(async () => {
  for (const user of users) {
    const deleted = await service.auth.admin.deleteUser(user.id);
    assert.ifError(deleted.error);
  }
});

test("legacy onboarding remains compatible and defaults existing profiles to general", async () => {
  const user = await createUser("legacy-default");
  const request = onboardingV2Payload();
  const goal = await user.client.rpc("protein_complete_onboarding_v2", request);
  assert.ifError(goal.error);
  assert.equal(goal.data.policy_version, "protein-v1");

  const profile = await user.client
    .from("protein_profiles")
    .select("training_focus,calculation_policy_version")
    .single();
  assert.ifError(profile.error);
  assert.deepEqual(profile.data, {
    calculation_policy_version: "protein-v1",
    training_focus: "general",
  });

  const invalid = await service.from("protein_profiles").insert({
    activity_level: "inactive",
    birth_month: 1,
    birth_year: 1990,
    calculation_policy_version: "protein-v1",
    eligibility_attestation_version: "adult-v1",
    eligibility_attested_at: "2026-01-01T00:00:00.000Z",
    equation_sex: "male",
    goal_direction: "maintain",
    height_inches: 69,
    time_zone: "UTC",
    training_focus: "invalid",
    user_id: crypto.randomUUID(),
  });
  assert.ok(invalid.error);
  assert.match(invalid.error.message, /training_focus|check constraint/iu);
});

test("v3 applies the direction-by-training-focus policy matrix and complete snapshots", async () => {
  for (const direction of ["cut", "maintain", "bulk"]) {
    for (const trainingFocus of ["general", "resistance_training"]) {
      const user = await createUser(`${direction}-${trainingFocus}`);
      const request = onboardingV3Payload({
        p_goal_direction: direction,
        p_training_focus: trainingFocus,
      });
      const goal = await user.client.rpc("protein_complete_onboarding_v3", request);
      assert.ifError(goal.error);

      const calories = expectedCalories(direction);
      const protein = expectedProtein(trainingFocus);
      assert.equal(goal.data.policy_version, "protein-v2");
      assert.equal(goal.data.calorie_lower, calories.lower);
      assert.equal(goal.data.calorie_upper, calories.upper);
      assert.equal(goal.data.protein_lower, protein.lower);
      assert.equal(goal.data.protein_upper, protein.upper);
      assert.equal(goal.data.calculation_input_snapshot.trainingFocus, trainingFocus);
      assert.equal(
        goal.data.calculation_input_snapshot.proteinReferenceWeightMethod,
        "actual_body_weight",
      );
      assert.ok(
        Math.abs(
          Number(goal.data.calculation_input_snapshot.proteinReferenceWeightKilograms) -
            protein.weightKg,
        ) < 1e-9,
      );
      assert.deepEqual(
        goal.data.calculation_output_snapshot.proteinMultipliersGramsPerKilogram,
        protein.multipliers,
      );
      assert.equal(
        goal.data.calculation_output_snapshot.proteinCalculationMethod,
        "reference_weight_times_training_focus_multiplier",
      );

      const profile = await user.client
        .from("protein_profiles")
        .select("training_focus,calculation_policy_version")
        .single();
      assert.ifError(profile.error);
      assert.deepEqual(profile.data, {
        calculation_policy_version: "protein-v2",
        training_focus: trainingFocus,
      });
    }
  }
});

test("v3 is authenticated, validates focus, and replays only identical requests", async () => {
  const user = await createUser("v3-replay");
  const request = onboardingV3Payload({ p_training_focus: "resistance_training" });

  const anonymousResult = await anonymous.rpc("protein_complete_onboarding_v3", request);
  assert.ok(anonymousResult.error);

  const first = await user.client.rpc("protein_complete_onboarding_v3", request);
  assert.ifError(first.error);
  const replay = await user.client.rpc("protein_complete_onboarding_v3", request);
  assert.ifError(replay.error);
  assert.equal(replay.data.id, first.data.id);

  const incompleteReplay = await user.client.rpc("protein_complete_onboarding_v3", {
    ...request,
    p_training_focus: null,
  });
  assert.ok(incompleteReplay.error);
  assert.match(incompleteReplay.error.message, /all onboarding inputs/iu);

  const conflict = await user.client.rpc("protein_complete_onboarding_v3", {
    ...request,
    p_training_focus: "general",
  });
  assert.ok(conflict.error);
  assert.match(conflict.error.message, /already complete/iu);

  const invalidUser = await createUser("v3-invalid");
  const invalid = await invalidUser.client.rpc(
    "protein_complete_onboarding_v3",
    onboardingV3Payload({ p_training_focus: "cardio" }),
  );
  assert.ok(invalid.error);
  assert.match(invalid.error.message, /training focus/iu);

  const internal = await service.rpc("protein_calculate_goal_v2", {
    p_activity_level: "low_active",
    p_birth_month: 1,
    p_birth_year: 1990,
    p_calculation_time: new Date().toISOString(),
    p_eligibility_attestation_version: "adult-v1",
    p_equation_sex: "male",
    p_goal_direction: "maintain",
    p_height_inches: 69,
    p_previous_goal_period_id: null,
    p_time_zone: "UTC",
    p_training_focus: "general",
    p_weight_entry_id: null,
    p_weight_pounds: 170,
  });
  assert.ok(internal.error);
  assert.match(internal.error.message, /permission/iu);
});

test("settings v2 proposes protein-v2 without rewriting protein-v1 history", async () => {
  const owner = await createUser("settings-owner");
  const other = await createUser("settings-other");
  const onboarding = onboardingV2Payload();
  const original = await owner.client.rpc("protein_complete_onboarding_v2", onboarding);
  assert.ifError(original.error);
  const confirmed = await owner.client.rpc("protein_confirm_goal_period", {
    p_goal_period_id: original.data.id,
  });
  assert.ifError(confirmed.error);

  const args = settingsV2Payload();
  const proposed = await owner.client.rpc("protein_update_profile_and_propose_goal_v2", args);
  assert.ifError(proposed.error);
  assert.equal(proposed.data.policy_version, "protein-v2");
  assert.equal(proposed.data.reason, "profile_change");
  assert.equal(proposed.data.calculation_input_snapshot.previousGoalPeriodId, original.data.id);
  assert.equal(
    proposed.data.calculation_input_snapshot.weightEntryId,
    onboarding.p_weight_entry_id,
  );
  assert.equal(proposed.data.calculation_input_snapshot.trainingFocus, "resistance_training");

  const replay = await owner.client.rpc("protein_update_profile_and_propose_goal_v2", args);
  assert.ifError(replay.error);
  assert.equal(replay.data.id, proposed.data.id);

  const incompleteReplay = await owner.client.rpc("protein_update_profile_and_propose_goal_v2", {
    ...args,
    p_training_focus: null,
  });
  assert.ok(incompleteReplay.error);
  assert.match(incompleteReplay.error.message, /all profile inputs/iu);

  const crossUser = await other.client.rpc("protein_update_profile_and_propose_goal_v2", args);
  assert.ok(crossUser.error);

  const goals = await owner.client
    .from("protein_goal_periods")
    .select("id,policy_version,acknowledged_at,effective_end_date")
    .order("created_at", { ascending: true });
  assert.ifError(goals.error);
  assert.equal(goals.data.length, 2);
  const preserved = goals.data.find((goal) => goal.id === original.data.id);
  assert.equal(preserved.policy_version, "protein-v1");
  assert.ok(preserved.acknowledged_at);
  assert.equal(preserved.effective_end_date, null);

  const profile = await owner.client
    .from("protein_profiles")
    .select("training_focus,calculation_policy_version")
    .single();
  assert.ifError(profile.error);
  assert.deepEqual(profile.data, {
    calculation_policy_version: "protein-v2",
    training_focus: "resistance_training",
  });

  const accepted = await owner.client.rpc("protein_confirm_goal_period", {
    p_goal_period_id: proposed.data.id,
  });
  assert.ifError(accepted.error);

  const historical = await owner.client
    .from("protein_goal_periods")
    .select("policy_version,effective_end_date")
    .eq("id", original.data.id)
    .single();
  assert.ifError(historical.error);
  assert.equal(historical.data.policy_version, "protein-v1");
  assert.ok(historical.data.effective_end_date);
});
