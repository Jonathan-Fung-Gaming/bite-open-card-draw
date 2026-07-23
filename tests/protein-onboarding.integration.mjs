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
  const email = `protein-onboarding-${label}-${crypto.randomUUID()}@example.test`;
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

function legacyPayload(overrides = {}) {
  return {
    p_activity_level: "low_active",
    p_birth_month: 3,
    p_birth_year: 1992,
    p_calculation_input_snapshot: {
      normalizedHeightCm: 175.26,
      normalizedWeightKg: 77.1107029,
    },
    p_calculation_output_snapshot: { unroundedEer: 2423.125 },
    p_calorie_lower: 2300,
    p_calorie_upper: 2550,
    p_effective_start_date: "2026-07-23",
    p_eligibility_attestation_version: "eligibility-v1",
    p_equation_sex: "male",
    p_goal_direction: "maintain",
    p_goal_period_id: crypto.randomUUID(),
    p_height_inches: 69,
    p_local_date: "2026-07-23",
    p_measured_at: "2026-07-23T03:00:00.000Z",
    p_policy_version: "nutrition-v1",
    p_protein_lower: 93,
    p_protein_upper: 123,
    p_time_zone: "Asia/Tokyo",
    p_weight_entry_id: crypto.randomUUID(),
    p_weight_pounds: 170,
    ...overrides,
  };
}

function rawPayload(overrides = {}) {
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

async function countRows(table, userId) {
  const result = await service
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  assert.ifError(result.error);
  return result.count;
}

after(async () => {
  for (const user of users) {
    const deleted = await service.auth.admin.deleteUser(user.id);
    assert.ifError(deleted.error);
  }
});

test("legacy caller-supplied calculations and anonymous v2 calls are denied", async () => {
  const user = await createUser("legacy-denied");
  const authenticatedLegacy = await user.client.rpc("protein_complete_onboarding", legacyPayload());
  assert.ok(authenticatedLegacy.error);
  assert.match(authenticatedLegacy.error.message, /permission/iu);

  const serviceLegacy = await service.rpc("protein_complete_onboarding", legacyPayload());
  assert.ok(serviceLegacy.error);
  assert.match(serviceLegacy.error.message, /permission/iu);

  const anonymousV2 = await anonymous.rpc("protein_complete_onboarding_v2", rawPayload());
  assert.ok(anonymousV2.error);
  assert.match(anonymousV2.error.message, /permission|authentication|authorized/iu);
});

test("v2 computes canonical values and complete snapshots", async () => {
  const user = await createUser("canonical");
  const request = rawPayload();
  const result = await user.client.rpc("protein_complete_onboarding_v2", request);
  assert.ifError(result.error);
  assert.equal(result.data.user_id, user.id);
  assert.equal(result.data.policy_version, "protein-v1");
  assert.equal(result.data.eligibility_attestation_version, "adult-v1");

  const heightCm = 69 * 2.54;
  const weightKg = 170 * 0.45359237;
  const expectedEer = 581.47 - 10.83 * 30 + 8.3 * heightCm + 14.94 * weightKg;
  const expectedRawLower = expectedEer * 0.95;
  const expectedRawUpper = expectedEer * 1.05;
  const expectedCalorieLower = Math.floor(expectedRawLower / 50 + 0.5) * 50;
  const expectedCalorieUpper = Math.floor(expectedRawUpper / 50 + 0.5) * 50;
  const expectedProteinLower = Math.floor(weightKg * 1.2 + 0.5);
  const expectedProteinUpper = Math.floor(weightKg * 1.6 + 0.5);

  assert.equal(result.data.calorie_lower, expectedCalorieLower);
  assert.equal(result.data.calorie_upper, expectedCalorieUpper);
  assert.equal(result.data.protein_lower, expectedProteinLower);
  assert.equal(result.data.protein_upper, expectedProteinUpper);

  const input = result.data.calculation_input_snapshot;
  const output = result.data.calculation_output_snapshot;
  assert.equal(input.policyVersion, "protein-v1");
  assert.equal(input.eligibilityAttestationVersion, "adult-v1");
  assert.equal(input.ageYears, 30);
  assert.equal(input.equationAgeBand, "19_plus");
  assert.equal(input.calculationLocalDate, new Date().toISOString().slice(0, 10));
  assert.equal(Number(input.heightCentimeters), heightCm);
  assert.equal(Number(input.weightKilograms), weightKg);
  assert.ok(Number(input.bmi) >= 18.5 && Number(input.bmi) < 30);
  assert.ok(Math.abs(Number(output.eerKcalUnrounded) - expectedEer) < 1e-9);
  assert.ok(Math.abs(Number(output.calorieRangeRaw.lower) - expectedRawLower) < 1e-9);
  assert.ok(Math.abs(Number(output.calorieRangeRaw.upper) - expectedRawUpper) < 1e-9);
  assert.deepEqual(output.calorieRangeDisplayed, {
    lower: expectedCalorieLower,
    upper: expectedCalorieUpper,
  });
  assert.deepEqual(output.proteinRangeDisplayedGrams, {
    lower: expectedProteinLower,
    upper: expectedProteinUpper,
  });
  assert.deepEqual(output.eerEquation, {
    ageCoefficient: -10.83,
    growthAllowanceKcal: 0,
    heightCmCoefficient: 8.3,
    intercept: 581.47,
    weightKgCoefficient: 14.94,
  });
  assert.equal(output.calorieRounding, "nearest_50_half_up");
  assert.equal(output.proteinRounding, "nearest_1_half_up");
});

test("authenticated v2 onboarding derives ownership and exact replay is idempotent", async () => {
  const user = await createUser("replay");
  const request = rawPayload();

  const first = await user.client.rpc("protein_complete_onboarding_v2", request);
  assert.ifError(first.error);
  assert.equal(first.data.id, request.p_goal_period_id);
  assert.equal(first.data.user_id, user.id);
  assert.equal(first.data.acknowledged_at, null);

  const replay = await user.client.rpc("protein_complete_onboarding_v2", request);
  assert.ifError(replay.error);
  assert.equal(replay.data.id, request.p_goal_period_id);
  assert.equal(await countRows("protein_profiles", user.id), 1);
  assert.equal(await countRows("protein_weight_entries", user.id), 1);
  assert.equal(await countRows("protein_goal_periods", user.id), 1);

  const conflict = await user.client.rpc("protein_complete_onboarding_v2", {
    ...request,
    p_weight_pounds: request.p_weight_pounds + 1,
  });
  assert.ok(conflict.error);
  assert.match(conflict.error.message, /already complete/iu);
  assert.equal(await countRows("protein_weight_entries", user.id), 1);
  assert.equal(await countRows("protein_goal_periods", user.id), 1);
});

test("an existing incomplete profile is updated inside onboarding", async () => {
  const user = await createUser("incomplete");
  const seeded = await service.from("protein_profiles").insert({
    activity_level: "inactive",
    birth_month: 1,
    birth_year: 1990,
    calculation_policy_version: "draft",
    eligibility_attestation_version: "draft",
    eligibility_attested_at: "2026-07-22T00:00:00.000Z",
    equation_sex: "female",
    goal_direction: "cut",
    height_inches: 64,
    time_zone: "UTC",
    user_id: user.id,
  });
  assert.ifError(seeded.error);

  const request = rawPayload({ p_goal_direction: "bulk" });
  const completed = await user.client.rpc("protein_complete_onboarding_v2", request);
  assert.ifError(completed.error);

  const profile = await service
    .from("protein_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  assert.ifError(profile.error);
  assert.equal(profile.data.goal_direction, "bulk");
  assert.equal(profile.data.birth_month, request.p_birth_month);
  assert.ok(profile.data.onboarding_completed_at);
});

test("a failed goal insert rolls back profile completion and first weight", async () => {
  const owner = await createUser("collision-owner");
  const existing = rawPayload();
  const seeded = await owner.client.rpc("protein_complete_onboarding_v2", existing);
  assert.ifError(seeded.error);

  const user = await createUser("rollback");
  const request = rawPayload({ p_goal_period_id: existing.p_goal_period_id });
  const result = await user.client.rpc("protein_complete_onboarding_v2", request);
  assert.ok(result.error);
  assert.match(result.error.message, /duplicate key|unique constraint/iu);

  assert.equal(await countRows("protein_profiles", user.id), 0);
  assert.equal(await countRows("protein_weight_entries", user.id), 0);
  assert.equal(await countRows("protein_goal_periods", user.id), 0);
});
