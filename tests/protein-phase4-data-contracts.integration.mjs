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
const service = createClient(url, serviceRoleKey, options);
const users = [];

async function createOnboardedUser(label) {
  const email = `protein-phase4-${label}-${crypto.randomUUID()}@example.test`;
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

  const now = new Date();
  const onboarding = await client.rpc("protein_complete_onboarding_v2", {
    p_activity_level: "low_active",
    p_birth_month: now.getUTCMonth() + 1,
    p_birth_year: now.getUTCFullYear() - 30,
    p_eligibility_attested: true,
    p_equation_sex: "male",
    p_goal_direction: "maintain",
    p_goal_period_id: crypto.randomUUID(),
    p_height_inches: 69,
    p_time_zone: "Asia/Tokyo",
    p_weight_entry_id: crypto.randomUUID(),
    p_weight_pounds: 170,
  });
  assert.ifError(onboarding.error);

  const confirmed = await client.rpc("protein_confirm_goal_period", {
    p_goal_period_id: onboarding.data.id,
  });
  assert.ifError(confirmed.error);

  const user = { client, id: created.data.user.id };
  users.push(user);
  return user;
}

after(async () => {
  for (const user of users) {
    const deleted = await service.auth.admin.deleteUser(user.id);
    assert.ifError(deleted.error);
  }
});

test("manual food CRUD is owner-scoped and drives local-day totals", async () => {
  const owner = await createOnboardedUser("food-owner");
  const stranger = await createOnboardedUser("food-stranger");
  const sourceBatchId = crypto.randomUUID();

  const inserted = await owner.client
    .from("protein_food_entries")
    .insert([
      {
        calories: 220,
        confidence: null,
        input_method: "manual_entry",
        item_name: "Greek yogurt",
        local_date: "2026-07-24",
        logged_at: "2026-07-23T15:30:00.000Z",
        protein_grams: 20,
        source_batch_id: sourceBatchId,
        time_zone: "Asia/Tokyo",
        user_id: owner.id,
      },
      {
        calories: 180,
        confidence: null,
        input_method: "manual_entry",
        item_name: "Eggs",
        local_date: "2026-07-24",
        logged_at: "2026-07-24T10:00:00.000Z",
        protein_grams: 12.5,
        source_batch_id: sourceBatchId,
        time_zone: "Asia/Tokyo",
        user_id: owner.id,
      },
    ])
    .select("id,item_name");
  assert.ifError(inserted.error);
  assert.equal(inserted.data.length, 2);

  const totals = await owner.client
    .from("protein_daily_totals")
    .select("protein_grams,calories,entry_count")
    .eq("local_date", "2026-07-24")
    .single();
  assert.ifError(totals.error);
  assert.equal(Number(totals.data.protein_grams), 32.5);
  assert.equal(Number(totals.data.calories), 400);
  assert.equal(Number(totals.data.entry_count), 2);

  const yogurt = inserted.data.find((entry) => entry.item_name === "Greek yogurt");
  assert.ok(yogurt);
  const updated = await owner.client
    .from("protein_food_entries")
    .update({ calories: 250, item_name: "Plain Greek yogurt", protein_grams: 22 })
    .eq("id", yogurt.id);
  assert.ifError(updated.error);

  const hidden = await stranger.client
    .from("protein_food_entries")
    .select("id")
    .eq("source_batch_id", sourceBatchId);
  assert.ifError(hidden.error);
  assert.deepEqual(hidden.data, []);

  const spoofed = await stranger.client.from("protein_food_entries").insert({
    calories: 10,
    input_method: "manual_entry",
    item_name: "Spoofed",
    local_date: "2026-07-24",
    logged_at: "2026-07-24T10:00:00.000Z",
    protein_grams: 1,
    time_zone: "Asia/Tokyo",
    user_id: owner.id,
  });
  assert.ok(spoofed.error);

  const eggs = inserted.data.find((entry) => entry.item_name === "Eggs");
  assert.ok(eggs);
  const removed = await owner.client.from("protein_food_entries").delete().eq("id", eggs.id);
  assert.ifError(removed.error);

  const remainingTotals = await owner.client
    .from("protein_daily_totals")
    .select("protein_grams,calories,entry_count")
    .eq("local_date", "2026-07-24")
    .single();
  assert.ifError(remainingTotals.error);
  assert.equal(Number(remainingTotals.data.protein_grams), 22);
  assert.equal(Number(remainingTotals.data.calories), 250);
  assert.equal(Number(remainingTotals.data.entry_count), 1);
});

test("food and weight local-day provenance remains stable", async () => {
  const user = await createOnboardedUser("local-day");

  const travelEntry = await user.client
    .from("protein_food_entries")
    .insert({
      calories: 90,
      input_method: "manual_entry",
      item_name: "Travel-day snack",
      local_date: "2026-07-23",
      logged_at: "2026-07-24T05:30:00.000Z",
      protein_grams: 5,
      time_zone: "America/Los_Angeles",
      user_id: user.id,
    })
    .select("local_date,time_zone")
    .single();
  assert.ifError(travelEntry.error);
  assert.deepEqual(travelEntry.data, {
    local_date: "2026-07-23",
    time_zone: "America/Los_Angeles",
  });

  const unchangedProfile = await user.client.from("protein_profiles").select("time_zone").single();
  assert.ifError(unchangedProfile.error);
  assert.equal(unchangedProfile.data.time_zone, "Asia/Tokyo");

  const forbiddenProfileUpdate = await user.client
    .from("protein_profiles")
    .update({ time_zone: "America/Los_Angeles" })
    .eq("user_id", user.id);
  assert.ok(forbiddenProfileUpdate.error);

  const wrongFoodDay = await user.client.from("protein_food_entries").insert({
    calories: 100,
    input_method: "manual_entry",
    item_name: "Wrong day",
    local_date: "2026-07-23",
    logged_at: "2026-07-23T15:30:00.000Z",
    protein_grams: 10,
    time_zone: "Asia/Tokyo",
    user_id: user.id,
  });
  assert.ok(wrongFoodDay.error);
  assert.match(wrongFoodDay.error.message, /local date/iu);

  const insertedFood = await user.client
    .from("protein_food_entries")
    .insert({
      calories: 100,
      input_method: "manual_entry",
      item_name: "Stable day",
      local_date: "2026-07-24",
      logged_at: "2026-07-23T15:30:00.000Z",
      protein_grams: 10,
      time_zone: "Asia/Tokyo",
      user_id: user.id,
    })
    .select("id")
    .single();
  assert.ifError(insertedFood.error);

  const movedFood = await user.client
    .from("protein_food_entries")
    .update({ local_date: "2026-07-25" })
    .eq("id", insertedFood.data.id);
  assert.ok(movedFood.error);

  const wrongWeightDay = await user.client.from("protein_weight_entries").insert({
    local_date: "2027-01-01",
    measured_at: "2026-12-31T14:30:00.000Z",
    pounds: 171,
    time_zone: "Asia/Tokyo",
    user_id: user.id,
  });
  assert.ok(wrongWeightDay.error);
  assert.match(wrongWeightDay.error.message, /local date/iu);
});

test("current goal and latest weight queries support Today and the 14-day reminder", async () => {
  const user = await createOnboardedUser("goal-weight");

  const goal = await user.client
    .from("protein_goal_periods")
    .select("id,calorie_lower,calorie_upper,protein_lower,protein_upper")
    .not("acknowledged_at", "is", null)
    .is("effective_end_date", null)
    .single();
  assert.ifError(goal.error);
  assert.ok(goal.data.calorie_lower <= goal.data.calorie_upper);
  assert.ok(goal.data.protein_lower <= goal.data.protein_upper);

  const weight = await user.client
    .from("protein_weight_entries")
    .insert({
      local_date: "2027-01-01",
      measured_at: "2026-12-31T15:30:00.000Z",
      pounds: 171.25,
      time_zone: "Asia/Tokyo",
      user_id: user.id,
    })
    .select("id")
    .single();
  assert.ifError(weight.error);

  const latest = await user.client
    .from("protein_weight_entries")
    .select("id,local_date,time_zone,pounds")
    .order("measured_at", { ascending: false })
    .limit(1)
    .single();
  assert.ifError(latest.error);
  assert.equal(latest.data.id, weight.data.id);
  assert.equal(latest.data.local_date, "2027-01-01");
  assert.equal(Number(latest.data.pounds), 171.25);

  const reminder = await service.from("protein_notification_jobs").insert({
    due_at: "2027-01-15T00:00:00.000Z",
    due_local_date: "2027-01-15",
    due_local_time: "09:00:00",
    reminder_kind: "weigh_in_due",
    source_weight_entry_id: weight.data.id,
    time_zone: "Asia/Tokyo",
    user_id: user.id,
  });
  assert.ifError(reminder.error);

  const privateReminder = await user.client.from("protein_notification_jobs").select("id");
  assert.ok(privateReminder.error);
});
