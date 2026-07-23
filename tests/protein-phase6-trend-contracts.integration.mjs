import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const service = createClient(url, serviceRoleKey, options);
const anon = createClient(url, anonKey, options);
const users = [];

function dayOffset(offset) {
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offset);
  return value;
}

function localDate(value) {
  return value.toISOString().slice(0, 10);
}

async function createUser(label) {
  const email = `protein-phase6-${label}-${crypto.randomUUID()}@example.test`;
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

  const user = { client, id: created.data.user.id };
  users.push(user);
  return user;
}

function goalRow(userId, direction, startOffset, overrides = {}) {
  return {
    acknowledged_at: dayOffset(startOffset).toISOString(),
    calculation_input_snapshot: { source: "phase6-test" },
    calculation_output_snapshot: { source: "phase6-test" },
    calorie_lower: direction === "bulk" ? 2500 : 1800,
    calorie_upper: direction === "bulk" ? 2700 : 2000,
    direction,
    effective_start_date: localDate(dayOffset(startOffset)),
    eligibility_attestation_version: "adult-v1",
    policy_version: "protein-v1",
    protein_lower: 120,
    protein_upper: 160,
    reason: "onboarding",
    user_id: userId,
    ...overrides,
  };
}

async function createRawReadyUser(label, direction, startOffset = -30) {
  const user = await createUser(label);
  const insertedProfile = await service.from("protein_profiles").insert({
    activity_level: "low_active",
    birth_month: 1,
    birth_year: 1990,
    calculation_policy_version: "protein-v1",
    eligibility_attestation_version: "adult-v1",
    eligibility_attested_at: dayOffset(startOffset).toISOString(),
    equation_sex: "male",
    goal_direction: direction,
    height_inches: 69,
    onboarding_completed_at: dayOffset(startOffset).toISOString(),
    time_zone: "UTC",
    user_id: user.id,
  });
  assert.ifError(insertedProfile.error);

  const insertedGoal = await service
    .from("protein_goal_periods")
    .insert(goalRow(user.id, direction, startOffset))
    .select("*")
    .single();
  assert.ifError(insertedGoal.error);
  return { ...user, currentGoal: insertedGoal.data };
}

async function addWeight(userId, offset, pounds) {
  const measuredAt = dayOffset(offset);
  const inserted = await service
    .from("protein_weight_entries")
    .insert({
      local_date: localDate(measuredAt),
      measured_at: measuredAt.toISOString(),
      pounds,
      time_zone: "UTC",
      user_id: userId,
    })
    .select("id,measured_at")
    .single();
  assert.ifError(inserted.error);
  return inserted.data;
}

async function addEvidence(userId, offsets) {
  return Promise.all(offsets.map((offset, index) => addWeight(userId, offset, 180 - index)));
}

function proposalArgs(userId, eventType, evidence, weeklyPercentChange) {
  return {
    p_event_type: eventType,
    p_evidence_weight_entry_ids: evidence.map((entry) => entry.id),
    p_user_id: userId,
    p_weekly_percent_change: weeklyPercentChange,
  };
}

async function createProposal(args) {
  const result = await service.rpc("protein_create_trend_goal_proposal", args);
  assert.ifError(result.error);
  assert.equal(result.data.length, 1);
  return result.data[0];
}

after(async () => {
  for (const user of users) {
    const deleted = await service.auth.admin.deleteUser(user.id);
    assert.ifError(deleted.error);
  }
});

test("trend proposal is service-only, atomic, canonical, and concurrency-idempotent", async () => {
  const owner = await createRawReadyUser("atomic-owner", "cut");
  const evidence = await addEvidence(owner.id, [-28, -14, 0]);
  const args = proposalArgs(owner.id, "cut_too_fast", evidence, -1.25);

  const deniedOwner = await owner.client.rpc("protein_create_trend_goal_proposal", args);
  assert.ok(deniedOwner.error);
  const deniedAnon = await anon.rpc("protein_create_trend_goal_proposal", args);
  assert.ok(deniedAnon.error);

  const concurrent = await Promise.all([
    service.rpc("protein_create_trend_goal_proposal", args),
    service.rpc("protein_create_trend_goal_proposal", args),
  ]);
  concurrent.forEach((result) => assert.ifError(result.error));
  assert.deepEqual(concurrent.map((result) => result.data[0].outcome).sort(), [
    "created",
    "existing_pending",
  ]);

  const created = concurrent.find((result) => result.data[0].outcome === "created").data[0];
  const reversed = await createProposal(
    proposalArgs(owner.id, "cut_too_fast", [...evidence].reverse(), -1.25),
  );
  assert.equal(reversed.outcome, "existing_pending");
  assert.equal(reversed.coaching_event_id, created.coaching_event_id);
  assert.equal(reversed.goal_period_id, created.goal_period_id);

  const goal = await service
    .from("protein_goal_periods")
    .select("*")
    .eq("id", created.goal_period_id)
    .single();
  assert.ifError(goal.error);
  assert.equal(goal.data.calorie_lower, owner.currentGoal.calorie_lower + 100);
  assert.equal(goal.data.calorie_upper, owner.currentGoal.calorie_upper + 100);
  assert.equal(goal.data.protein_lower, owner.currentGoal.protein_lower);
  assert.equal(goal.data.protein_upper, owner.currentGoal.protein_upper);
  assert.equal(goal.data.reason, "trend_adjustment");
  assert.equal(goal.data.policy_version, "protein-v1+protein-trend-v1");
  assert.equal(goal.data.calculation_output_snapshot.trend_adjustment.adjustment_calories, 100);

  const event = await service
    .from("protein_coaching_events")
    .select("*")
    .eq("id", created.coaching_event_id)
    .single();
  assert.ifError(event.error);
  const sortedIds = evidence.map((entry) => entry.id).sort();
  const expectedFingerprint = createHash("sha256")
    .update(`${owner.currentGoal.id}:cut:protein-trend-v1:cut_too_fast:${sortedIds.join(",")}`)
    .digest("hex");
  assert.equal(event.data.evidence_fingerprint, expectedFingerprint);
  assert.deepEqual(event.data.evidence_weight_entry_ids, sortedIds);

  const rows = await service.from("protein_goal_periods").select("id").eq("user_id", owner.id);
  assert.ifError(rows.error);
  assert.equal(rows.data.length, 2);
});

test("invalid evidence and trend direction leave the current goal unchanged", async () => {
  const owner = await createRawReadyUser("invalid-input", "cut");
  const evidence = await addEvidence(owner.id, [-28, -14, 0]);

  const missingEvidence = await service.rpc(
    "protein_create_trend_goal_proposal",
    proposalArgs(
      owner.id,
      "cut_too_fast",
      [evidence[0], evidence[1], { id: crypto.randomUUID() }],
      -1.5,
    ),
  );
  assert.ok(missingEvidence.error);

  const wrongDirection = await service.rpc(
    "protein_create_trend_goal_proposal",
    proposalArgs(owner.id, "bulk_too_fast", evidence, 1.5),
  );
  assert.ok(wrongDirection.error);

  const goals = await service.from("protein_goal_periods").select("id").eq("user_id", owner.id);
  assert.ifError(goals.error);
  assert.deepEqual(goals.data, [{ id: owner.currentGoal.id }]);
  const events = await service.from("protein_coaching_events").select("id").eq("user_id", owner.id);
  assert.ifError(events.error);
  assert.deepEqual(events.data, []);
});

test("a different evidence window cannot replace an unconfirmed goal", async () => {
  const owner = await createRawReadyUser("pending-other", "bulk");
  const firstEvidence = await addEvidence(owner.id, [-35, -21, -7]);
  const first = await createProposal(proposalArgs(owner.id, "bulk_too_fast", firstEvidence, 0.8));
  assert.equal(first.outcome, "created");

  const extra = await addWeight(owner.id, 0, 184);
  const second = await createProposal(
    proposalArgs(owner.id, "bulk_too_fast", [firstEvidence[1], firstEvidence[2], extra], 0.9),
  );
  assert.equal(second.outcome, "pending_other");
  assert.equal(second.goal_period_id, first.goal_period_id);
});

test("confirmation advances the local boundary and acknowledges linked coaching", async () => {
  const owner = await createRawReadyUser("confirm", "cut", 0);
  const evidence = await addEvidence(owner.id, [-28, -14, 0]);
  const proposal = await createProposal(proposalArgs(owner.id, "cut_too_fast", evidence, -1.2));

  const forcedPastStart = await service
    .from("protein_goal_periods")
    .update({ effective_start_date: localDate(dayOffset(-5)) })
    .eq("id", proposal.goal_period_id);
  assert.ifError(forcedPastStart.error);

  const confirmed = await owner.client.rpc("protein_confirm_goal_period", {
    p_goal_period_id: proposal.goal_period_id,
  });
  assert.ifError(confirmed.error);
  const tomorrow = localDate(dayOffset(1));
  assert.equal(confirmed.data.effective_start_date, tomorrow);

  const periods = await service
    .from("protein_goal_periods")
    .select("id,effective_start_date,effective_end_date,acknowledged_at")
    .eq("user_id", owner.id)
    .order("effective_start_date");
  assert.ifError(periods.error);
  assert.equal(periods.data.length, 2);
  assert.equal(periods.data[0].id, owner.currentGoal.id);
  assert.equal(periods.data[0].effective_end_date, tomorrow);
  assert.equal(periods.data[1].id, proposal.goal_period_id);
  assert.equal(periods.data[1].effective_end_date, null);

  const event = await service
    .from("protein_coaching_events")
    .select("state,acknowledged_at")
    .eq("id", proposal.coaching_event_id)
    .single();
  assert.ifError(event.error);
  assert.equal(event.data.state, "acknowledged");
  assert.ok(event.data.acknowledged_at);

  const replay = await owner.client.rpc("protein_confirm_goal_period", {
    p_goal_period_id: proposal.goal_period_id,
  });
  assert.ifError(replay.error);
  assert.equal(replay.data.id, proposal.goal_period_id);

  const sameEvidenceOnNewCurrent = await createProposal(
    proposalArgs(owner.id, "cut_too_fast", evidence, -1.2),
  );
  assert.equal(sameEvidenceOnNewCurrent.outcome, "cooldown");

  const deniedService = await service.rpc("protein_confirm_goal_period", {
    p_goal_period_id: proposal.goal_period_id,
  });
  assert.ok(deniedService.error);
});

test("cooldown and two-new-weigh-in gates use acknowledged historical evidence", async () => {
  const cooldownOwner = await createRawReadyUser("cooldown", "cut", -5);
  const cooldownEvidence = await addEvidence(cooldownOwner.id, [-28, -14, 0]);
  const seededCooldown = await service.from("protein_coaching_events").insert({
    acknowledged_at: dayOffset(-5).toISOString(),
    event_type: "cut_too_fast",
    evidence_fingerprint: `seed-${crypto.randomUUID()}`,
    evidence_weight_entry_ids: cooldownEvidence.map((entry) => entry.id),
    proposed_goal_period_id: cooldownOwner.currentGoal.id,
    state: "acknowledged",
    user_id: cooldownOwner.id,
    weekly_percent_change: -1.2,
  });
  assert.ifError(seededCooldown.error);
  const cooldown = await createProposal(
    proposalArgs(cooldownOwner.id, "cut_too_fast", cooldownEvidence, -1.3),
  );
  assert.equal(cooldown.outcome, "cooldown");

  const owner = await createUser("new-evidence");
  const insertedProfile = await service.from("protein_profiles").insert({
    activity_level: "low_active",
    birth_month: 1,
    birth_year: 1990,
    calculation_policy_version: "protein-v1",
    eligibility_attestation_version: "adult-v1",
    eligibility_attested_at: dayOffset(-60).toISOString(),
    equation_sex: "male",
    goal_direction: "cut",
    height_inches: 69,
    onboarding_completed_at: dayOffset(-60).toISOString(),
    time_zone: "UTC",
    user_id: owner.id,
  });
  assert.ifError(insertedProfile.error);
  const oldEvidence = await addEvidence(owner.id, [-55, -45, -35]);
  const historicalGoal = await service
    .from("protein_goal_periods")
    .insert(
      goalRow(owner.id, "cut", -60, {
        effective_end_date: localDate(dayOffset(-30)),
        superseded_at: dayOffset(-30).toISOString(),
      }),
    )
    .select("id")
    .single();
  assert.ifError(historicalGoal.error);
  const currentGoal = await service.from("protein_goal_periods").insert(
    goalRow(owner.id, "cut", -30, {
      reason: "trend_adjustment",
    }),
  );
  assert.ifError(currentGoal.error);
  const historicalEvent = await service.from("protein_coaching_events").insert({
    acknowledged_at: dayOffset(-30).toISOString(),
    event_type: "cut_too_fast",
    evidence_fingerprint: `historical-${crypto.randomUUID()}`,
    evidence_weight_entry_ids: oldEvidence.map((entry) => entry.id),
    proposed_goal_period_id: historicalGoal.data.id,
    state: "acknowledged",
    user_id: owner.id,
    weekly_percent_change: -1.1,
  });
  assert.ifError(historicalEvent.error);

  const oneNew = await addWeight(owner.id, -20, 176);
  const insufficient = await createProposal(
    proposalArgs(owner.id, "cut_too_fast", [oldEvidence[1], oldEvidence[2], oneNew], -1.2),
  );
  assert.equal(insufficient.outcome, "insufficient_new_evidence");

  const secondNew = await addWeight(owner.id, -10, 175);
  const created = await createProposal(
    proposalArgs(owner.id, "cut_too_fast", [oldEvidence[2], oneNew, secondNew], -1.25),
  );
  assert.equal(created.outcome, "created");
});
