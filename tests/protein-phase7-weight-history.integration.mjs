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
const anon = createClient(url, anonKey, options);
const users = [];

async function createReadyUser(label) {
  const email = `protein-phase7-${label}-${crypto.randomUUID()}@example.test`;
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

  const profile = await service.from("protein_profiles").insert({
    activity_level: "low_active",
    birth_month: 1,
    birth_year: 1990,
    calculation_policy_version: "protein-v1",
    eligibility_attestation_version: "adult-v1",
    eligibility_attested_at: "2024-01-01T00:00:00.000Z",
    equation_sex: "male",
    goal_direction: "maintain",
    height_inches: 69,
    onboarding_completed_at: "2024-01-01T00:00:00.000Z",
    time_zone: "UTC",
    user_id: created.data.user.id,
  });
  assert.ifError(profile.error);

  const user = { client, id: created.data.user.id };
  users.push(user);
  return user;
}

function weightRow(userId, measuredAt, pounds) {
  return {
    local_date: measuredAt.slice(0, 10),
    measured_at: measuredAt,
    pounds,
    time_zone: "UTC",
    user_id: userId,
  };
}

function boundaryRows(userId) {
  return [
    weightRow(userId, "2024-12-29T12:00:00.000Z", 170),
    weightRow(userId, "2024-12-30T08:00:00.000Z", 180),
    weightRow(userId, "2024-12-30T20:00:00.000Z", 182),
    weightRow(userId, "2024-12-31T12:00:00.000Z", 184),
    weightRow(userId, "2025-01-01T12:00:00.000Z", 186),
    weightRow(userId, "2025-01-31T12:00:00.000Z", 190),
    weightRow(userId, "2025-02-01T08:00:00.000Z", 200),
    weightRow(userId, "2025-02-01T20:00:00.000Z", 204),
    weightRow(userId, "2025-02-02T12:00:00.000Z", 210),
  ];
}

function historyArgs(interval, startDate, endDate) {
  return {
    p_end_date: endDate,
    p_interval: interval,
    p_start_date: startDate,
  };
}

async function getHistory(client, interval, startDate, endDate) {
  const result = await client.rpc(
    "protein_get_weight_history",
    historyArgs(interval, startDate, endDate),
  );
  assert.ifError(result.error);
  return result.data;
}

after(async () => {
  for (const user of users) {
    const deleted = await service.auth.admin.deleteUser(user.id);
    assert.ifError(deleted.error);
  }
});

test("day history is owner-only, complete, stable, latest-marked, and future-safe", async () => {
  const owner = await createReadyUser("daily-owner");
  const other = await createReadyUser("daily-other");
  const insertedOwner = await service.from("protein_weight_entries").insert(boundaryRows(owner.id));
  assert.ifError(insertedOwner.error);
  const insertedOther = await service
    .from("protein_weight_entries")
    .insert(weightRow(other.id, "2024-12-30T10:00:00.000Z", 500));
  assert.ifError(insertedOther.error);

  const rows = await getHistory(owner.client, "day", "2024-12-30", "2025-02-01");
  assert.equal(rows.length, 7);
  assert.deepEqual(Object.keys(rows[0]), [
    "bucket_start",
    "entry_id",
    "local_date",
    "measured_at",
    "pounds",
    "is_latest_for_day",
  ]);
  assert.deepEqual(
    rows.map((row) => [row.local_date, Number(row.pounds), row.is_latest_for_day]),
    [
      ["2024-12-30", 180, false],
      ["2024-12-30", 182, true],
      ["2024-12-31", 184, true],
      ["2025-01-01", 186, true],
      ["2025-01-31", 190, true],
      ["2025-02-01", 200, false],
      ["2025-02-01", 204, true],
    ],
  );
  rows.forEach((row) => {
    assert.equal(row.bucket_start, row.local_date);
    assert.ok(row.entry_id);
    assert.ok(row.measured_at);
  });

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(12, 0, 0, 0);
  const futureAt = tomorrow.toISOString();
  const insertedFuture = await service
    .from("protein_weight_entries")
    .insert(weightRow(owner.id, futureAt, 220));
  assert.ifError(insertedFuture.error);
  const today = new Date().toISOString().slice(0, 10);
  const futureRows = await getHistory(owner.client, "day", today, futureAt.slice(0, 10));
  assert.deepEqual(futureRows, []);
});

test("weekly and monthly history use Monday buckets and exact continuous medians", async () => {
  const owner = await createReadyUser("aggregate-boundaries");
  const inserted = await service.from("protein_weight_entries").insert(boundaryRows(owner.id));
  assert.ifError(inserted.error);

  const weekly = await getHistory(owner.client, "week", "2024-12-30", "2025-01-05");
  assert.deepEqual(
    weekly.map((row) => ({
      bucket: row.bucket_start,
      entry: row.entry_id,
      latest: row.is_latest_for_day,
      localDate: row.local_date,
      measuredAt: row.measured_at,
      pounds: Number(row.pounds),
    })),
    [
      {
        bucket: "2024-12-30",
        entry: null,
        latest: null,
        localDate: null,
        measuredAt: null,
        pounds: 183,
      },
    ],
  );

  const monthly = await getHistory(owner.client, "month", "2024-12-30", "2025-02-01");
  assert.deepEqual(
    monthly.map((row) => [row.bucket_start, Number(row.pounds)]),
    [
      ["2024-12-01", 182],
      ["2025-01-01", 188],
      ["2025-02-01", 202],
    ],
  );
  monthly.forEach((row) => {
    assert.equal(row.entry_id, null);
    assert.equal(row.local_date, null);
    assert.equal(row.measured_at, null);
    assert.equal(row.is_latest_for_day, null);
  });
});

test("history rejects unauthenticated, service-role, unsupported, and unsafe requests", async () => {
  const owner = await createReadyUser("invalid-requests");
  const validArgs = historyArgs("day", "2024-01-01", "2024-12-31");

  const deniedAnon = await anon.rpc("protein_get_weight_history", validArgs);
  assert.ok(deniedAnon.error);
  const deniedService = await service.rpc("protein_get_weight_history", validArgs);
  assert.ok(deniedService.error);

  const invalidRequests = [
    historyArgs(null, "2024-01-01", "2024-01-31"),
    historyArgs("quarter", "2024-01-01", "2024-01-31"),
    historyArgs("day", null, "2024-01-31"),
    historyArgs("day", "2024-01-01", null),
    historyArgs("day", "2024-02-01", "2024-01-31"),
    historyArgs("day", "2024-01-01", "2025-01-06"),
  ];
  for (const args of invalidRequests) {
    const result = await owner.client.rpc("protein_get_weight_history", args);
    assert.ok(result.error, `expected request to fail: ${JSON.stringify(args)}`);
  }
});

test("dense history aggregates all source rows and raw results remain deterministically pageable", async () => {
  const owner = await createReadyUser("dense");
  const denseRows = [];
  const start = Date.parse("2025-01-06T00:00:00.000Z");
  for (let index = 0; index < 1_001; index += 1) {
    denseRows.push(
      weightRow(owner.id, new Date(start + index).toISOString(), index < 500 ? 100 : 200),
    );
  }
  denseRows.push(weightRow(owner.id, "2025-02-03T08:00:00.000Z", 300));
  denseRows.push(weightRow(owner.id, "2025-02-03T20:00:00.000Z", 400));
  for (let offset = 0; offset < denseRows.length; offset += 200) {
    const inserted = await service
      .from("protein_weight_entries")
      .insert(denseRows.slice(offset, offset + 200));
    assert.ifError(inserted.error);
  }

  const weekly = await getHistory(owner.client, "week", "2025-01-01", "2025-02-28");
  assert.deepEqual(
    weekly.map((row) => [row.bucket_start, Number(row.pounds)]),
    [
      ["2025-01-06", 200],
      ["2025-02-03", 350],
    ],
  );
  const monthly = await getHistory(owner.client, "month", "2025-01-01", "2025-02-28");
  assert.deepEqual(
    monthly.map((row) => [row.bucket_start, Number(row.pounds)]),
    [
      ["2025-01-01", 200],
      ["2025-02-01", 350],
    ],
  );

  const args = historyArgs("day", "2025-01-01", "2025-02-28");
  const firstPage = await owner.client
    .rpc("protein_get_weight_history", args)
    .order("local_date", { ascending: true })
    .order("measured_at", { ascending: true })
    .order("entry_id", { ascending: true })
    .range(0, 999);
  assert.ifError(firstPage.error);
  const secondPage = await owner.client
    .rpc("protein_get_weight_history", args)
    .order("local_date", { ascending: true })
    .order("measured_at", { ascending: true })
    .order("entry_id", { ascending: true })
    .range(1_000, 1_999);
  assert.ifError(secondPage.error);
  assert.equal(firstPage.data.length, 1_000);
  assert.equal(secondPage.data.length, 3);

  const pagedRows = [...firstPage.data, ...secondPage.data];
  assert.equal(new Set(pagedRows.map((row) => row.entry_id)).size, 1_003);
  assert.deepEqual(
    pagedRows.slice(-3).map((row) => [row.measured_at, Number(row.pounds), row.is_latest_for_day]),
    [
      ["2025-01-06T00:00:01+00:00", 200, true],
      ["2025-02-03T08:00:00+00:00", 300, false],
      ["2025-02-03T20:00:00+00:00", 400, true],
    ],
  );
});
