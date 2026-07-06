"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ADMIN_LIVE_REFRESH_MS = 5000;

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

export function AdminLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden || activeElementIsEditing() || blockingFormHasDirtyEditableField()) {
        return;
      }

      router.refresh();
    }, ADMIN_LIVE_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [router]);

  return null;
}
