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
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
};
const service = createClient(url, serviceRoleKey, options);
const anon = createClient(url, anonKey, options);
const users = [];
const playerIds = [];

function profileRow(userId, timeZone = "UTC") {
  return {
    activity_level: "low_active",
    birth_month: 1,
    birth_year: 1990,
    calculation_policy_version: "protein-v1",
    eligibility_attestation_version: "adult-v1",
    eligibility_attested_at: "2026-01-01T00:00:00.000Z",
    equation_sex: "male",
    goal_direction: "maintain",
    height_inches: 69,
    onboarding_completed_at: "2026-01-01T00:00:00.000Z",
    time_zone: timeZone,
    user_id: userId,
  };
}

function goalRow(userId) {
  return {
    acknowledged_at: "2026-01-01T00:00:00.000Z",
    calculation_input_snapshot: { policyVersion: "protein-v1" },
    calculation_output_snapshot: { calorieRangeDisplayed: { lower: 2200, upper: 2400 } },
    calorie_lower: 2200,
    calorie_upper: 2400,
    direction: "maintain",
    effective_start_date: "2026-01-01",
    eligibility_attestation_version: "adult-v1",
    policy_version: "protein-v1",
    protein_lower: 90,
    protein_upper: 120,
    reason: "onboarding",
    user_id: userId,
  };
}

function weightRow(userId, measuredAt, localDate, timeZone, pounds = 170) {
  return {
    local_date: localDate,
    measured_at: measuredAt,
    pounds,
    time_zone: timeZone,
    user_id: userId,
  };
}

async function createReadyUser(label, weight = null) {
  const email = `protein-phase8-${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}-9x!`;
  const created = await service.auth.admin.createUser({ email, email_confirm: true, password });
  assert.ifError(created.error);
  assert.ok(created.data.user);

  const client = createClient(url, anonKey, options);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  const id = created.data.user.id;

  const initialWeight = weight ?? weightRow(id, "2026-01-01T12:00:00.000Z", "2026-01-01", "UTC");
  assert.ifError(
    (await service.from("protein_profiles").insert(profileRow(id, initialWeight.time_zone))).error,
  );
  assert.ifError((await service.from("protein_goal_periods").insert(goalRow(id))).error);
  const insertedWeight = await service
    .from("protein_weight_entries")
    .insert({ ...initialWeight, user_id: id })
    .select("id")
    .single();
  assert.ifError(insertedWeight.error);

  const user = { client, email, id, initialWeightId: insertedWeight.data.id, password };
  users.push(user);
  return user;
}

function upsertArgs(userId, endpoint) {
  return {
    p_auth_secret: "auth-secret",
    p_endpoint: endpoint,
    p_expires_at: null,
    p_p256dh: "p256dh-key",
    p_platform_metadata: { displayMode: "standalone" },
    p_user_id: userId,
  };
}

async function clearNotificationWork() {
  const cleared = await service
    .from("protein_notification_jobs")
    .delete()
    .in("status", ["pending", "claimed", "completed", "failed", "invalidated"]);
  assert.ifError(cleared.error);
}

after(async () => {
  for (const playerId of playerIds) {
    assert.ifError((await service.from("players").delete().eq("id", playerId)).error);
  }
  for (const user of users) {
    assert.ifError((await service.auth.admin.deleteUser(user.id)).error);
  }
});

test("profile edits atomically create an owned mandatory pending goal", async () => {
  const owner = await createReadyUser("profile-owner");
  const other = await createReadyUser("profile-other");
  const proposalId = crypto.randomUUID();
  const args = {
    p_activity_level: "active",
    p_birth_month: 2,
    p_birth_year: 1991,
    p_equation_sex: "male",
    p_goal_direction: "bulk",
    p_goal_period_id: proposalId,
    p_height_inches: 70,
    p_time_zone: "Asia/Tokyo",
  };

  assert.ok((await anon.rpc("protein_update_profile_and_propose_goal", args)).error);
  const proposed = await owner.client.rpc("protein_update_profile_and_propose_goal", args);
  assert.ifError(proposed.error);
  assert.equal(proposed.data.id, proposalId);
  assert.equal(proposed.data.reason, "profile_change");
  assert.equal(proposed.data.acknowledged_at, null);
  assert.equal(proposed.data.direction, "bulk");

  const replay = await owner.client.rpc("protein_update_profile_and_propose_goal", args);
  assert.ifError(replay.error);
  assert.equal(replay.data.id, proposalId);
  assert.ok((await other.client.rpc("protein_update_profile_and_propose_goal", args)).error);

  const changedProfile = await owner.client
    .from("protein_profiles")
    .select("activity_level,birth_month,goal_direction,height_inches,time_zone")
    .single();
  assert.ifError(changedProfile.error);
  assert.deepEqual(changedProfile.data, {
    activity_level: "active",
    birth_month: 2,
    goal_direction: "bulk",
    height_inches: 70,
    time_zone: "Asia/Tokyo",
  });

  const confirmed = await owner.client.rpc("protein_confirm_goal_period", {
    p_goal_period_id: proposalId,
  });
  assert.ifError(confirmed.error);
  assert.ok(confirmed.data.acknowledged_at);
  const currentGoals = await owner.client
    .from("protein_goal_periods")
    .select("id")
    .not("acknowledged_at", "is", null)
    .is("effective_end_date", null);
  assert.ifError(currentGoals.error);
  assert.deepEqual(
    currentGoals.data.map((goal) => goal.id),
    [proposalId],
  );
});

test("server-only subscription boundaries preserve ownership and support nullable disable", async () => {
  const owner = await createReadyUser("push-owner");
  const other = await createReadyUser("push-other");
  const endpoint = `https://push.example.test/${crypto.randomUUID()}`;

  assert.ok(
    (await owner.client.rpc("protein_upsert_push_subscription", upsertArgs(owner.id, endpoint)))
      .error,
  );
  const inserted = await service.rpc(
    "protein_upsert_push_subscription",
    upsertArgs(owner.id, endpoint),
  );
  assert.ifError(inserted.error);
  assert.ok(inserted.data);
  const replay = await service.rpc("protein_upsert_push_subscription", {
    ...upsertArgs(owner.id, endpoint),
    p_p256dh: "rotated-key",
  });
  assert.ifError(replay.error);
  assert.equal(replay.data, inserted.data);
  assert.ok(
    (await service.rpc("protein_upsert_push_subscription", upsertArgs(other.id, endpoint))).error,
  );
  const secondEndpoint = `https://push.example.test/${crypto.randomUUID()}`;
  assert.ifError(
    (await service.rpc("protein_upsert_push_subscription", upsertArgs(owner.id, secondEndpoint)))
      .error,
  );

  const hidden = await owner.client.from("protein_push_subscriptions").select("id");
  assert.ok(hidden.error);
  const preference = await owner.client
    .from("protein_preferences")
    .select("notifications_enabled")
    .single();
  assert.ifError(preference.error);
  assert.equal(preference.data.notifications_enabled, true);

  const disabledMissing = await service.rpc("protein_delete_push_subscription", {
    p_endpoint: null,
    p_user_id: other.id,
  });
  assert.ifError(disabledMissing.error);
  assert.equal(disabledMissing.data, false);
  const otherPreference = await other.client
    .from("protein_preferences")
    .select("notifications_enabled")
    .single();
  assert.ifError(otherPreference.error);
  assert.equal(otherPreference.data.notifications_enabled, false);

  const removed = await service.rpc("protein_delete_push_subscription", {
    p_endpoint: endpoint,
    p_user_id: owner.id,
  });
  assert.ifError(removed.error);
  assert.equal(removed.data, true);
  assert.equal(
    (await service.from("protein_push_subscriptions").select("id").eq("user_id", owner.id)).data
      .length,
    1,
  );
  const stillEnabled = await owner.client
    .from("protein_preferences")
    .select("notifications_enabled")
    .single();
  assert.ifError(stillEnabled.error);
  assert.equal(stillEnabled.data.notifications_enabled, true);
  const stillPending = await service
    .from("protein_notification_jobs")
    .select("status")
    .eq("user_id", owner.id)
    .single();
  assert.ifError(stillPending.error);
  assert.equal(stillPending.data.status, "pending");

  const globalOptOut = await service.rpc("protein_delete_push_subscription", {
    p_endpoint: null,
    p_user_id: owner.id,
  });
  assert.ifError(globalOptOut.error);
  assert.equal(globalOptOut.data, false);
  assert.equal(
    (await service.from("protein_push_subscriptions").select("id").eq("user_id", owner.id)).data
      .length,
    1,
  );
  const disabled = await owner.client
    .from("protein_preferences")
    .select("notifications_enabled")
    .single();
  assert.ifError(disabled.error);
  assert.equal(disabled.data.notifications_enabled, false);
  const invalidated = await service
    .from("protein_notification_jobs")
    .select("status")
    .eq("user_id", owner.id)
    .single();
  assert.ifError(invalidated.error);
  assert.equal(invalidated.data.status, "invalidated");
});

test("Gemini consent is owner-scoped, paired, revocable, and versioned", async () => {
  const owner = await createReadyUser("gemini-consent-owner");
  const other = await createReadyUser("gemini-consent-other");
  const consentedAt = "2026-07-24T00:00:00.000Z";

  const accepted = await owner.client.from("protein_preferences").insert({
    food_ai_consent_version: "gemini-free-photo-v1",
    food_ai_consented_at: consentedAt,
    user_id: owner.id,
  });
  assert.ifError(accepted.error);

  const visible = await owner.client
    .from("protein_preferences")
    .select("food_ai_consent_version,food_ai_consented_at")
    .single();
  assert.ifError(visible.error);
  assert.deepEqual(visible.data, {
    food_ai_consent_version: "gemini-free-photo-v1",
    food_ai_consented_at: "2026-07-24T00:00:00+00:00",
  });

  const hidden = await other.client
    .from("protein_preferences")
    .select("food_ai_consent_version")
    .eq("user_id", owner.id);
  assert.ifError(hidden.error);
  assert.deepEqual(hidden.data, []);
  assert.ok(
    (
      await other.client
        .from("protein_preferences")
        .update({ food_ai_consent_version: "gemini-free-photo-v2" })
        .eq("user_id", owner.id)
        .select("user_id")
    ).data.length === 0,
  );

  assert.ok(
    (
      await owner.client
        .from("protein_preferences")
        .update({ food_ai_consented_at: null })
        .eq("user_id", owner.id)
    ).error,
  );
  assert.ok(
    (
      await owner.client
        .from("protein_preferences")
        .update({ food_ai_consent_version: " " })
        .eq("user_id", owner.id)
    ).error,
  );

  const revoked = await owner.client
    .from("protein_preferences")
    .update({ food_ai_consent_version: null, food_ai_consented_at: null })
    .eq("user_id", owner.id);
  assert.ifError(revoked.error);
  const cleared = await owner.client
    .from("protein_preferences")
    .select("food_ai_consent_version,food_ai_consented_at")
    .single();
  assert.ifError(cleared.error);
  assert.deepEqual(cleared.data, {
    food_ai_consent_version: null,
    food_ai_consented_at: null,
  });
});

test("14-day reminders are local-calendar correct, deduplicated, and invalidated by a new weight", async () => {
  const user = await createReadyUser(
    "reminder-dst",
    weightRow("placeholder", "2026-03-01T14:00:00.000Z", "2026-03-01", "America/New_York"),
  );
  const endpoint = `https://push.example.test/${crypto.randomUUID()}`;
  assert.ifError(
    (await service.rpc("protein_upsert_push_subscription", upsertArgs(user.id, endpoint))).error,
  );

  const firstJobs = await service
    .from("protein_notification_jobs")
    .select("id,source_weight_entry_id,due_local_date,due_at,time_zone,status")
    .eq("user_id", user.id);
  assert.ifError(firstJobs.error);
  assert.equal(firstJobs.data.length, 1);
  assert.deepEqual(
    {
      dueAt: firstJobs.data[0].due_at,
      dueDate: firstJobs.data[0].due_local_date,
      source: firstJobs.data[0].source_weight_entry_id,
      zone: firstJobs.data[0].time_zone,
    },
    {
      dueAt: "2026-03-15T13:00:00+00:00",
      dueDate: "2026-03-15",
      source: user.initialWeightId,
      zone: "America/New_York",
    },
  );

  for (let index = 0; index < 2; index += 1) {
    assert.ifError(
      (
        await service.rpc("protein_reconcile_weigh_in_reminder", {
          p_now: "2026-07-23T00:00:00.000Z",
          p_user_id: user.id,
        })
      ).error,
    );
  }
  assert.equal(
    (await service.from("protein_notification_jobs").select("id").eq("user_id", user.id)).data
      .length,
    1,
  );

  assert.ifError(
    (
      await service
        .from("protein_profiles")
        .update({ time_zone: "America/Los_Angeles" })
        .eq("user_id", user.id)
    ).error,
  );
  const rescheduled = await service
    .from("protein_notification_jobs")
    .select("due_at,time_zone")
    .eq("user_id", user.id)
    .single();
  assert.ifError(rescheduled.error);
  assert.deepEqual(rescheduled.data, {
    due_at: "2026-03-15T16:00:00+00:00",
    time_zone: "America/Los_Angeles",
  });

  const newer = await service
    .from("protein_weight_entries")
    .insert(
      weightRow(user.id, "2026-06-01T15:00:00.000Z", "2026-06-01", "America/Los_Angeles", 171),
    )
    .select("id")
    .single();
  assert.ifError(newer.error);
  const jobs = await service
    .from("protein_notification_jobs")
    .select("source_weight_entry_id,due_local_date,due_at,status")
    .eq("user_id", user.id)
    .order("due_local_date");
  assert.ifError(jobs.error);
  assert.deepEqual(
    jobs.data.map((job) => [
      job.source_weight_entry_id,
      job.due_local_date,
      job.due_at,
      job.status,
    ]),
    [
      [user.initialWeightId, "2026-03-15", "2026-03-15T16:00:00+00:00", "invalidated"],
      [newer.data.id, "2026-06-15", "2026-06-15T16:00:00+00:00", "pending"],
    ],
  );
});

test("claiming is concurrent-safe and delivery retry is deduplicated", async () => {
  await clearNotificationWork();
  const user = await createReadyUser("claim");
  const endpoint = `https://push.example.test/${crypto.randomUUID()}`;
  assert.ifError(
    (await service.rpc("protein_upsert_push_subscription", upsertArgs(user.id, endpoint))).error,
  );
  const claimArgs = { p_limit: 25, p_now: "2026-08-01T00:00:00.000Z" };
  const [left, right] = await Promise.all([
    service.rpc("protein_claim_due_notifications", claimArgs),
    service.rpc("protein_claim_due_notifications", claimArgs),
  ]);
  assert.ifError(left.error);
  assert.ifError(right.error);
  const claimed = [...left.data, ...right.data];
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].endpoint, endpoint);
  assert.equal(claimed[0].source_weight_entry_id, user.initialWeightId);
  assert.equal(claimed[0].attempts, 1);

  const failed = await service.rpc("protein_finish_notification_delivery", {
    p_claim_token: claimed[0].claim_token,
    p_delivery_id: claimed[0].delivery_id,
    p_error_code: "provider_unavailable",
    p_finished_at: "2026-08-01T00:00:10.000Z",
    p_status: "failed",
  });
  assert.ifError(failed.error);
  assert.equal(failed.data[0].job_status, "failed");
  assert.equal(failed.data[0].retry_at, "2026-08-01T00:05:10+00:00");

  const early = await service.rpc("protein_claim_due_notifications", {
    p_limit: 25,
    p_now: "2026-08-01T00:05:09.000Z",
  });
  assert.ifError(early.error);
  assert.deepEqual(early.data, []);
  const retried = await service.rpc("protein_claim_due_notifications", {
    p_limit: 25,
    p_now: "2026-08-01T00:05:10.000Z",
  });
  assert.ifError(retried.error);
  assert.equal(retried.data.length, 1);
  assert.equal(retried.data[0].delivery_id, claimed[0].delivery_id);
  assert.equal(retried.data[0].attempts, 2);

  const sent = await service.rpc("protein_finish_notification_delivery", {
    p_claim_token: retried.data[0].claim_token,
    p_delivery_id: retried.data[0].delivery_id,
    p_error_code: null,
    p_finished_at: "2026-08-01T00:05:11.000Z",
    p_status: "sent",
  });
  assert.ifError(sent.error);
  assert.equal(sent.data[0].job_status, "completed");
  const deliveries = await service
    .from("protein_notification_deliveries")
    .select("id,status")
    .eq("job_id", claimed[0].job_id);
  assert.ifError(deliveries.error);
  assert.deepEqual(deliveries.data, [{ id: claimed[0].delivery_id, status: "sent" }]);
});

test("terminal provider outcomes remove only the invalid endpoint", async () => {
  await clearNotificationWork();
  const user = await createReadyUser("terminal");
  const endpoint = `https://push.example.test/${crypto.randomUUID()}`;
  assert.ifError(
    (await service.rpc("protein_upsert_push_subscription", upsertArgs(user.id, endpoint))).error,
  );
  const claimed = await service.rpc("protein_claim_due_notifications", {
    p_limit: 1,
    p_now: "2026-08-01T00:00:00.000Z",
  });
  assert.ifError(claimed.error);
  assert.equal(claimed.data.length, 1);
  const finished = await service.rpc("protein_finish_notification_delivery", {
    p_claim_token: claimed.data[0].claim_token,
    p_delivery_id: claimed.data[0].delivery_id,
    p_error_code: "push_gone",
    p_finished_at: "2026-08-01T00:00:01.000Z",
    p_status: "invalid_subscription",
  });
  assert.ifError(finished.error);
  assert.deepEqual(finished.data, [
    { job_status: "completed", retry_at: null, subscription_removed: true },
  ]);
  assert.equal(
    (await service.from("protein_push_subscriptions").select("id").eq("user_id", user.id)).data
      .length,
    0,
  );
});

test("recent-password erase removes tracking only and preserves Auth, settings, push, and shared data", async () => {
  const user = await createReadyUser("erase");
  const other = await createReadyUser("erase-other");
  const endpoint = `https://push.example.test/${crypto.randomUUID()}`;
  assert.ifError(
    (await service.rpc("protein_upsert_push_subscription", upsertArgs(user.id, endpoint))).error,
  );
  assert.ifError(
    (
      await user.client
        .from("protein_preferences")
        .update({
          food_ai_consent_version: "gemini-free-photo-v1",
          food_ai_consented_at: "2026-07-24T00:00:00.000Z",
        })
        .eq("user_id", user.id)
    ).error,
  );

  const evidenceRows = [
    weightRow(user.id, "2026-01-02T12:00:00.000Z", "2026-01-02", "UTC", 169),
    weightRow(user.id, "2026-01-03T12:00:00.000Z", "2026-01-03", "UTC", 168),
  ];
  const evidence = await service
    .from("protein_weight_entries")
    .insert(evidenceRows)
    .select("id")
    .order("id");
  assert.ifError(evidence.error);
  const evidenceIds = [user.initialWeightId, ...evidence.data.map((row) => row.id)];
  assert.ifError(
    (
      await service.from("protein_coaching_events").insert({
        evidence_fingerprint: crypto.randomUUID(),
        evidence_weight_entry_ids: evidenceIds,
        event_type: "cut_too_fast",
        state: "pending",
        user_id: user.id,
        weekly_percent_change: -1.2,
      })
    ).error,
  );
  assert.ifError(
    (
      await service.from("protein_food_entries").insert({
        calories: 200,
        input_method: "manual_entry",
        item_name: "Erase me",
        local_date: "2026-01-03",
        logged_at: "2026-01-03T12:00:00.000Z",
        protein_grams: 20,
        time_zone: "UTC",
        user_id: user.id,
      })
    ).error,
  );
  const playerId = crypto.randomUUID();
  playerIds.push(playerId);
  assert.ifError(
    (
      await service.from("players").insert({
        id: playerId,
        startgg_username: `Shared-${playerId}`,
        startgg_username_normalized: `shared-${playerId}`,
      })
    ).error,
  );

  assert.ok(
    (
      await service.rpc("protein_erase_tracking_data", {
        p_password_reconfirmed_at: "2020-01-01T00:00:00.000Z",
        p_request_id: `erase:${crypto.randomUUID()}`,
        p_user_id: user.id,
      })
    ).error,
  );
  assert.ok(
    (
      await user.client.rpc("protein_erase_tracking_data", {
        p_password_reconfirmed_at: new Date().toISOString(),
        p_request_id: `erase:${crypto.randomUUID()}`,
        p_user_id: user.id,
      })
    ).error,
  );

  const requestId = `erase:${crypto.randomUUID()}`;
  const erased = await service.rpc("protein_erase_tracking_data", {
    p_password_reconfirmed_at: new Date().toISOString(),
    p_request_id: requestId,
    p_user_id: user.id,
  });
  assert.ifError(erased.error);

  for (const table of [
    "protein_goal_periods",
    "protein_food_entries",
    "protein_weight_entries",
    "protein_coaching_events",
    "protein_notification_jobs",
    "protein_notification_deliveries",
  ]) {
    const rows = await service.from(table).select("id").eq("user_id", user.id);
    assert.ifError(rows.error);
    assert.deepEqual(rows.data, [], `${table} should be erased`);
  }
  const profile = await service
    .from("protein_profiles")
    .select("birth_month,height_inches,onboarding_completed_at")
    .eq("user_id", user.id)
    .single();
  assert.ifError(profile.error);
  assert.deepEqual(profile.data, {
    birth_month: 1,
    height_inches: 69,
    onboarding_completed_at: null,
  });
  const preservedPreferences = await service
    .from("protein_preferences")
    .select("food_ai_consent_version,food_ai_consented_at")
    .eq("user_id", user.id)
    .single();
  assert.ifError(preservedPreferences.error);
  assert.deepEqual(preservedPreferences.data, {
    food_ai_consent_version: "gemini-free-photo-v1",
    food_ai_consented_at: "2026-07-24T00:00:00+00:00",
  });
  assert.equal(
    (await service.from("protein_push_subscriptions").select("id").eq("user_id", user.id)).data
      .length,
    1,
  );
  const audit = await service
    .from("protein_security_events")
    .select("event_type")
    .eq("user_id", user.id)
    .eq("request_id", requestId)
    .single();
  assert.ifError(audit.error);
  assert.equal(audit.data.event_type, "tracking_data_erased");
  assert.ok((await service.auth.admin.getUserById(user.id)).data.user);
  assert.equal(
    (await service.from("protein_weight_entries").select("id").eq("user_id", other.id)).data.length,
    1,
  );
  assert.equal((await service.from("players").select("id").eq("id", playerId)).data.length, 1);
});
