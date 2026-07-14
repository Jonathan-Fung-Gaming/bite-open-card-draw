"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  fetchRosterSnapshot,
  ROSTER_SNAPSHOT_EVENT,
  ROSTER_VERSION_CONFIRMED_EVENT,
} from "@/lib/admin/roster-mutation-transport";
import { createBrowserSupabaseClient } from "@/lib/db/browser-client";

const ADMIN_ROSTER_REFRESH_MS = 1000;
const ADMIN_ROSTER_REFRESH_DEBOUNCE_MS = 500;
const ADMIN_LIVE_REFRESH_MS = 5000;
const ADMIN_ACTION_REFRESH_GRACE_MS = 3000;

type AdminLiveRefreshProps = {
  eventScope: string;
  initialRosterVersion: number;
  useSupabaseRosterInvalidation: boolean;
};

type RosterInvalidationRecord = {
  event_id?: unknown;
  scope?: unknown;
  version?: unknown;
};

function activeElementIsEditing() {
  const element = document.activeElement;

  if (!element) {
    return false;
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (element instanceof HTMLSelectElement) {
    return true;
  }

  return element instanceof HTMLElement && element.isContentEditable;
}

function formHasDirtyEditableField(form: HTMLFormElement) {
  if (form.dataset.adminDirty === "true") {
    return true;
  }

  const fields = form.querySelectorAll("input, textarea, select");

  return Array.from(fields).some((field) => {
    if (
      !(field instanceof HTMLInputElement) &&
      !(field instanceof HTMLTextAreaElement) &&
      !(field instanceof HTMLSelectElement)
    ) {
      return false;
    }

    if (field.disabled || (field instanceof HTMLInputElement && field.type === "hidden")) {
      return false;
    }

    if (field instanceof HTMLInputElement) {
      if (field.type === "checkbox" || field.type === "radio") {
        return field.checked !== field.defaultChecked;
      }

      return field.value !== field.defaultValue;
    }

    if (field instanceof HTMLTextAreaElement) {
      return field.value !== field.defaultValue;
    }

    return Array.from(field.options).some((option) => option.selected !== option.defaultSelected);
  });
}

function blockingFormHasDirtyEditableField() {
  const forms = document.querySelectorAll("form[data-admin-live-refresh-blocking='true']");

  return Array.from(forms).some(
    (form) => form instanceof HTMLFormElement && formHasDirtyEditableField(form),
  );
}

function rosterMutationIsPending() {
  return document.querySelector("[data-testid='admin-roster-row'][data-pending='true']") !== null;
}

function shouldDeferRefresh() {
  return (
    document.hidden ||
    activeElementIsEditing() ||
    blockingFormHasDirtyEditableField() ||
    rosterMutationIsPending()
  );
}

function readRosterInvalidationVersion(record: RosterInvalidationRecord, eventScope: string) {
  if (record.event_id !== eventScope || record.scope !== "roster") {
    return null;
  }

  const version =
    typeof record.version === "number"
      ? record.version
      : typeof record.version === "string"
        ? Number(record.version)
        : Number.NaN;

  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

export function AdminLiveRefresh({
  eventScope,
  initialRosterVersion,
  useSupabaseRosterInvalidation,
}: AdminLiveRefreshProps) {
  const router = useRouter();
  const knownRosterVersionRef = useRef(initialRosterVersion);

  useEffect(() => {
    knownRosterVersionRef.current = Math.max(knownRosterVersionRef.current, initialRosterVersion);
  }, [initialRosterVersion]);

  useEffect(() => {
    let disposed = false;
    let fallbackInFlight = false;
    let pendingRosterVersion = knownRosterVersionRef.current;
    let rosterSnapshotInFlight = false;
    let rosterRefreshTimer: number | null = null;
    let refreshBlockedUntil = 0;
    const supabase = useSupabaseRosterInvalidation ? createBrowserSupabaseClient() : null;

    function handleFormSubmit() {
      refreshBlockedUntil = Date.now() + ADMIN_ACTION_REFRESH_GRACE_MS;
    }

    function handleLocalRosterVersion(event: Event) {
      const version = (event as CustomEvent<unknown>).detail;

      if (typeof version === "number" && Number.isSafeInteger(version) && version >= 0) {
        knownRosterVersionRef.current = Math.max(knownRosterVersionRef.current, version);

        if (pendingRosterVersion <= knownRosterVersionRef.current && rosterRefreshTimer !== null) {
          window.clearTimeout(rosterRefreshTimer);
          rosterRefreshTimer = null;
        }
      }
    }

    function liveRefreshShouldDefer() {
      return Date.now() < refreshBlockedUntil || shouldDeferRefresh();
    }

    document.addEventListener("submit", handleFormSubmit, true);
    window.addEventListener(ROSTER_VERSION_CONFIRMED_EVENT, handleLocalRosterVersion);

    async function applyPendingRosterSnapshot() {
      if (
        disposed ||
        rosterSnapshotInFlight ||
        pendingRosterVersion <= knownRosterVersionRef.current ||
        liveRefreshShouldDefer()
      ) {
        return;
      }

      rosterSnapshotInFlight = true;
      const requestedVersion = pendingRosterVersion;

      try {
        const snapshot = await fetchRosterSnapshot();

        if (disposed) {
          return;
        }

        knownRosterVersionRef.current = Math.max(knownRosterVersionRef.current, snapshot.version);
        window.dispatchEvent(new CustomEvent(ROSTER_SNAPSHOT_EVENT, { detail: snapshot }));
      } catch {
        if (!disposed) {
          knownRosterVersionRef.current = Math.max(knownRosterVersionRef.current, requestedVersion);
          router.refresh();
        }
      } finally {
        rosterSnapshotInFlight = false;

        if (
          !disposed &&
          pendingRosterVersion > knownRosterVersionRef.current &&
          !liveRefreshShouldDefer()
        ) {
          void applyPendingRosterSnapshot();
        }
      }
    }

    function refreshForVersion(version: number, immediate = false) {
      if (disposed || version <= knownRosterVersionRef.current || liveRefreshShouldDefer()) {
        return;
      }

      if (!immediate && version <= pendingRosterVersion && rosterRefreshTimer !== null) {
        return;
      }

      pendingRosterVersion = Math.max(pendingRosterVersion, version);

      if (rosterRefreshTimer !== null) {
        window.clearTimeout(rosterRefreshTimer);
        rosterRefreshTimer = null;
      }

      if (immediate) {
        void applyPendingRosterSnapshot();
        return;
      }

      rosterRefreshTimer = window.setTimeout(() => {
        rosterRefreshTimer = null;

        if (
          disposed ||
          pendingRosterVersion <= knownRosterVersionRef.current ||
          liveRefreshShouldDefer()
        ) {
          return;
        }

        void applyPendingRosterSnapshot();
      }, ADMIN_ROSTER_REFRESH_DEBOUNCE_MS);
    }

    async function checkFallbackInvalidation() {
      if (disposed || fallbackInFlight) {
        return;
      }

      fallbackInFlight = true;

      try {
        if (!supabase) {
          return;
        }

        const { data, error } = await supabase
          .from("event_invalidation_generations")
          .select("event_id, scope, version")
          .eq("event_id", eventScope)
          .eq("scope", "roster")
          .maybeSingle();
        const invalidation = data as RosterInvalidationRecord | null;

        if (error) {
          throw error;
        }

        const version = invalidation
          ? readRosterInvalidationVersion(invalidation, eventScope)
          : null;

        if (version !== null) {
          refreshForVersion(version, true);
        }
      } catch {
        // Realtime remains available when a transient fallback request fails.
      } finally {
        fallbackInFlight = false;
      }
    }

    const fallbackInterval = window.setInterval(() => {
      void checkFallbackInvalidation();
    }, ADMIN_ROSTER_REFRESH_MS);
    const generalRefreshInterval = window.setInterval(() => {
      if (
        !disposed &&
        !rosterSnapshotInFlight &&
        rosterRefreshTimer === null &&
        !liveRefreshShouldDefer()
      ) {
        router.refresh();
      }
    }, ADMIN_LIVE_REFRESH_MS);
    const channel = supabase
      ?.channel(`admin-roster-invalidation:${eventScope}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `event_id=eq.${eventScope}`,
          schema: "public",
          table: "event_invalidation_generations",
        },
        (payload) => {
          const version = readRosterInvalidationVersion(
            payload.new as RosterInvalidationRecord,
            eventScope,
          );

          if (version !== null) {
            refreshForVersion(version);
          }
        },
      )
      .subscribe();

    return () => {
      disposed = true;
      document.removeEventListener("submit", handleFormSubmit, true);
      window.removeEventListener(ROSTER_VERSION_CONFIRMED_EVENT, handleLocalRosterVersion);
      window.clearInterval(fallbackInterval);
      window.clearInterval(generalRefreshInterval);

      if (rosterRefreshTimer !== null) {
        window.clearTimeout(rosterRefreshTimer);
      }

      if (supabase && channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [eventScope, router, useSupabaseRosterInvalidation]);

  return null;
}
