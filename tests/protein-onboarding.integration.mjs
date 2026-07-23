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

function payload(overrides = {}) {
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

test("anonymous callers cannot execute atomic onboarding", async () => {
  const result = await anonymous.rpc("protein_complete_onboarding", payload());
  assert.ok(result.error);
  assert.match(result.error.message, /permission|authentication|authorized/iu);
});

test("authenticated onboarding derives ownership and exact replay is idempotent", async () => {
  const user = await createUser("replay");
  const request = payload();

  const first = await user.client.rpc("protein_complete_onboarding", request);
  assert.ifError(first.error);
  assert.equal(first.data.id, request.p_goal_period_id);
  assert.equal(first.data.user_id, user.id);
  assert.equal(first.data.acknowledged_at, null);

  const replay = await user.client.rpc("protein_complete_onboarding", request);
  assert.ifError(replay.error);
  assert.equal(replay.data.id, request.p_goal_period_id);
  assert.equal(await countRows("protein_profiles", user.id), 1);
  assert.equal(await countRows("protein_weight_entries", user.id), 1);
  assert.equal(await countRows("protein_goal_periods", user.id), 1);

  const conflict = await user.client.rpc("protein_complete_onboarding", {
    ...request,
    p_calorie_lower: request.p_calorie_lower + 50,
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

  const request = payload({ p_goal_direction: "bulk" });
  const completed = await user.client.rpc("protein_complete_onboarding", request);
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
  const user = await createUser("rollback");
  const request = payload({ p_calorie_lower: 2600, p_calorie_upper: 2500 });
  const result = await user.client.rpc("protein_complete_onboarding", request);
  assert.ok(result.error);
  assert.match(result.error.message, /check constraint/iu);

  assert.equal(await countRows("protein_profiles", user.id), 0);
  assert.equal(await countRows("protein_weight_entries", user.id), 0);
  assert.equal(await countRows("protein_goal_periods", user.id), 0);
});
