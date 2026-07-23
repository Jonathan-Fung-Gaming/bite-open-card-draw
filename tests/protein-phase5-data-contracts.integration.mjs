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
const users = [];
const rateLimitNamespaces = [];

async function createUser(label) {
  const email = `protein-phase5-${label}-${crypto.randomUUID()}@example.test`;
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

async function createOnboardedUser(label) {
  const user = await createUser(label);
  const now = new Date();
  const onboarding = await user.client.rpc("protein_complete_onboarding_v2", {
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
  });
  assert.ifError(onboarding.error);

  const confirmed = await user.client.rpc("protein_confirm_goal_period", {
    p_goal_period_id: onboarding.data.id,
  });
  assert.ifError(confirmed.error);
  return user;
}

after(async () => {
  for (const namespace of rateLimitNamespaces) {
    const removed = await service.from("rate_limit_buckets").delete().eq("event_id", namespace);
    assert.ifError(removed.error);
  }

  for (const user of users) {
    const deleted = await service.auth.admin.deleteUser(user.id);
    assert.ifError(deleted.error);
  }
});

test("default food action supports null and all four values without changing notifications", async () => {
  const owner = await createUser("preference-owner");
  const stranger = await createUser("preference-stranger");

  const inserted = await owner.client
    .from("protein_preferences")
    .insert({ default_food_action: null, notifications_enabled: true, user_id: owner.id })
    .select("default_food_action,notifications_enabled")
    .single();
  assert.ifError(inserted.error);
  assert.deepEqual(inserted.data, {
    default_food_action: null,
    notifications_enabled: true,
  });

  for (const action of ["take_photo", "photo_library", "nutrition_label", "manual_entry"]) {
    const updated = await owner.client
      .from("protein_preferences")
      .update({ default_food_action: action })
      .eq("user_id", owner.id)
      .select("default_food_action,notifications_enabled")
      .single();
    assert.ifError(updated.error);
    assert.deepEqual(updated.data, {
      default_food_action: action,
      notifications_enabled: true,
    });
  }

  const cleared = await owner.client
    .from("protein_preferences")
    .update({ default_food_action: null })
    .eq("user_id", owner.id)
    .select("default_food_action,notifications_enabled")
    .single();
  assert.ifError(cleared.error);
  assert.deepEqual(cleared.data, {
    default_food_action: null,
    notifications_enabled: true,
  });

  const invalid = await owner.client
    .from("protein_preferences")
    .update({ default_food_action: "unsupported" })
    .eq("user_id", owner.id);
  assert.ok(invalid.error);

  const hidden = await stranger.client
    .from("protein_preferences")
    .select("user_id")
    .eq("user_id", owner.id);
  assert.ifError(hidden.error);
  assert.deepEqual(hidden.data, []);

  const foreignUpdate = await stranger.client
    .from("protein_preferences")
    .update({ default_food_action: "take_photo" })
    .eq("user_id", owner.id)
    .select("user_id");
  assert.ifError(foreignUpdate.error);
  assert.deepEqual(foreignUpdate.data, []);

  const unchanged = await owner.client
    .from("protein_preferences")
    .select("default_food_action,notifications_enabled")
    .single();
  assert.ifError(unchanged.error);
  assert.deepEqual(unchanged.data, {
    default_food_action: null,
    notifications_enabled: true,
  });
});

test("one statement atomically inserts a reviewed multi-item food batch", async () => {
  const owner = await createOnboardedUser("batch-success");
  const sourceBatchId = crypto.randomUUID();
  const rows = [
    {
      calories: 210,
      confidence: "confident",
      input_method: "take_photo",
      item_name: "Chicken breast",
      local_date: "2026-07-23",
      logged_at: "2026-07-23T12:00:00.000Z",
      protein_grams: 35,
      source_batch_id: sourceBatchId,
      time_zone: "UTC",
      user_id: owner.id,
    },
    {
      calories: 160,
      confidence: "uncertain",
      input_method: "take_photo",
      item_name: "Roasted vegetables",
      local_date: "2026-07-23",
      logged_at: "2026-07-23T12:00:00.000Z",
      protein_grams: 4,
      source_batch_id: sourceBatchId,
      time_zone: "UTC",
      user_id: owner.id,
    },
  ];

  const inserted = await owner.client
    .from("protein_food_entries")
    .insert(rows)
    .select("item_name,source_batch_id")
    .order("item_name");
  assert.ifError(inserted.error);
  assert.equal(inserted.data.length, 2);
  assert.deepEqual(
    inserted.data.map((row) => row.source_batch_id),
    [sourceBatchId, sourceBatchId],
  );
});

test("an invalid food row rolls back the entire multi-item statement", async () => {
  const owner = await createOnboardedUser("batch-rollback");
  const sourceBatchId = crypto.randomUUID();
  const common = {
    confidence: "confident",
    input_method: "photo_library",
    local_date: "2026-07-23",
    logged_at: "2026-07-23T12:00:00.000Z",
    source_batch_id: sourceBatchId,
    time_zone: "UTC",
    user_id: owner.id,
  };

  const inserted = await owner.client.from("protein_food_entries").insert([
    {
      ...common,
      calories: 120,
      item_name: "Valid item",
      protein_grams: 12,
    },
    {
      ...common,
      calories: -1,
      item_name: "Invalid item",
      protein_grams: 1,
    },
  ]);
  assert.ok(inserted.error);

  const remaining = await owner.client
    .from("protein_food_entries")
    .select("id")
    .eq("source_batch_id", sourceBatchId);
  assert.ifError(remaining.error);
  assert.deepEqual(remaining.data, []);
});

test("rate limits are service-only, namespaced, and keyed by a one-way hash", async () => {
  const user = await createUser("rate-limit");
  const namespace = `protein-ai-food-analysis-${crypto.randomUUID()}`;
  const otherNamespace = `${namespace}-other`;
  rateLimitNamespaces.push(namespace, otherNamespace);

  const rawIdentifier = `user:${user.id}:device:private-token`;
  const keyHash = createHash("sha256").update(rawIdentifier).digest("hex");
  const payload = { keyHash, limit: 1, windowMs: 60_000 };

  const first = await service.rpc("normalized_check_rate_limit", {
    p_event_id: namespace,
    p_payload: payload,
  });
  assert.ifError(first.error);
  assert.equal(first.data.allowed, true);
  assert.equal(first.data.count, 1);

  const blocked = await service.rpc("normalized_check_rate_limit", {
    p_event_id: namespace,
    p_payload: payload,
  });
  assert.ifError(blocked.error);
  assert.equal(blocked.data.allowed, false);
  assert.equal(blocked.data.count, 2);
  assert.ok(blocked.data.retryAfterMs > 0);

  const isolatedNamespace = await service.rpc("normalized_check_rate_limit", {
    p_event_id: otherNamespace,
    p_payload: payload,
  });
  assert.ifError(isolatedNamespace.error);
  assert.equal(isolatedNamespace.data.allowed, true);
  assert.equal(isolatedNamespace.data.count, 1);

  const buckets = await service
    .from("rate_limit_buckets")
    .select("event_id,bucket_key_hash")
    .in("event_id", [namespace, otherNamespace])
    .order("event_id");
  assert.ifError(buckets.error);
  assert.equal(buckets.data.length, 2);
  assert.ok(buckets.data.every((row) => row.bucket_key_hash === keyHash));
  assert.ok(buckets.data.every((row) => !row.bucket_key_hash.includes(rawIdentifier)));

  const forbidden = await user.client.rpc("normalized_check_rate_limit", {
    p_event_id: namespace,
    p_payload: payload,
  });
  assert.ok(forbidden.error);
  assert.match(forbidden.error.message, /permission/iu);
});

test("the food entry API catalog contains no image, raw-response, or prompt columns", async () => {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: {
      Accept: "application/openapi+json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  assert.equal(response.ok, true);
  const catalog = await response.json();
  const properties = catalog.definitions?.protein_food_entries?.properties;
  assert.ok(properties, "protein_food_entries must be exposed in the API catalog");

  const columns = Object.keys(properties);
  assert.deepEqual(columns.sort(), [
    "calories",
    "confidence",
    "created_at",
    "id",
    "input_method",
    "item_name",
    "local_date",
    "logged_at",
    "protein_grams",
    "source_batch_id",
    "time_zone",
    "updated_at",
    "user_id",
  ]);
  assert.equal(
    columns.some((column) => /(image|photo|prompt|raw.*response)/iu.test(column)),
    false,
  );
});
