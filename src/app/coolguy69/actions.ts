"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHostToken } from "@/lib/admin/host-lock";
import { adminState } from "@/lib/server/admin-state";
import {
  clearAdminCookies,
  clearHostTokenCookie,
  createAdminSessionCookie,
  getHostTokenCookie,
  requireAdminSession,
  setHostTokenCookie,
  verifyDangerousActionPassword,
} from "@/lib/server/admin-auth";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function redirectWithError(message: string) {
  redirect(`/coolguy69?error=${encodeURIComponent(message)}`);
}

export async function adminLoginAction(formData: FormData) {
  try {
    await createAdminSessionCookie(getString(formData, "password"));
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Admin login failed.");
  }

  redirect("/coolguy69");
}

export async function adminLogoutAction() {
  await clearAdminCookies();
  redirect("/coolguy69");
}

export async function takeHostControlAction() {
  const session = await requireAdminSession();
  const hostToken = createHostToken();

  adminState.hostLockStore.acquire(session.sessionId, hostToken);
  await setHostTokenCookie(hostToken);
  revalidatePath("/coolguy69");
}

export async function refreshHostLockAction() {
  const session = await requireAdminSession();
  const hostToken = await getHostTokenCookie();

  if (hostToken) {
    adminState.hostLockStore.refresh(session.sessionId, hostToken);
  }
}

export async function releaseHostControlAction() {
  const session = await requireAdminSession();
  const hostToken = await getHostTokenCookie();

  if (hostToken) {
    adminState.hostLockStore.release(session.sessionId, hostToken);
  }

  await clearHostTokenCookie();
  revalidatePath("/coolguy69");
}

async function requireActiveHost() {
  const session = await requireAdminSession();
  const hostToken = await getHostTokenCookie();

  if (!hostToken || !adminState.hostLockStore.refresh(session.sessionId, hostToken)) {
    throw new Error("Host control is required for this action.");
  }

  return session;
}

export async function addPlayerAction(formData: FormData) {
  await requireActiveHost();

  try {
    adminState.rosterStore.createOrUpdatePlayer({
      startggUsername: getString(formData, "startggUsername"),
      active: true,
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not add player.");
  }

  revalidatePath("/coolguy69");
}

export async function bulkImportPlayersAction(formData: FormData) {
  await requireActiveHost();
  const usernames = getString(formData, "startggUsernames")
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);

  adminState.rosterStore.bulkImport(usernames);
  revalidatePath("/coolguy69");
}

export async function setPlayerActiveStatusAction(formData: FormData) {
  await requireActiveHost();

  try {
    adminState.rosterStore.setPlayerActiveStatus(
      getString(formData, "playerId"),
      getString(formData, "active") === "true",
    );
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not update player.");
  }

  revalidatePath("/coolguy69");
}

export async function addInactivePlayerToCurrentRoundAction(formData: FormData) {
  await requireActiveHost();

  try {
    await verifyDangerousActionPassword(getString(formData, "adminPassword"));
    adminState.rosterStore.addPlayerToCurrentRoundEligibility({
      playerId: getString(formData, "playerId"),
      roundNumber: Number(getString(formData, "roundNumber")) as 1 | 2 | 3 | 4,
      reason: getString(formData, "reason"),
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Could not update round eligibility.");
  }

  revalidatePath("/coolguy69");
}
