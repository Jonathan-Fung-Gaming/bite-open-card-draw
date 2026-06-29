"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type DangerousActionSummaryItem = {
  label: string;
  fieldName: string;
};

type DangerousActionDialogProps = {
  action: string;
  consequence: string;
  children?: ReactNode;
  disabled?: boolean;
  passwordId?: string;
  summaryItems?: DangerousActionSummaryItem[];
};

function readSummaryValue(form: HTMLFormElement, fieldName: string) {
  const field = form.elements.namedItem(fieldName);

  if (field instanceof HTMLSelectElement) {
    return field.selectedOptions[0]?.textContent?.trim() || field.value;
  }

  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    return field.value;
  }

  if (field instanceof RadioNodeList) {
    return field.value;
  }

  return "";
}

export function DangerousActionDialog({
  action,
  consequence,
  children,
  disabled = false,
  passwordId = "danger-password",
  summaryItems = [],
}: DangerousActionDialogProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [summaryValues, setSummaryValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const form = sectionRef.current?.closest("form");

    if (!form || summaryItems.length === 0) {
      return undefined;
    }

    const updateSummary = () => {
      setSummaryValues(
        Object.fromEntries(
          summaryItems.map((item) => [item.fieldName, readSummaryValue(form, item.fieldName)]),
        ),
      );
    };

    updateSummary();
    form.addEventListener("input", updateSummary);
    form.addEventListener("change", updateSummary);

    return () => {
      form.removeEventListener("input", updateSummary);
      form.removeEventListener("change", updateSummary);
    };
  }, [summaryItems]);

  return (
    <section ref={sectionRef} className="rounded-lg border border-ember-500/35 bg-ember-900/20 p-4">
      {children}
      <div
        className="mt-4 flex items-start gap-3 rounded border border-ember-300/30 bg-black/25 p-3"
        data-testid="dangerous-action-summary"
      >
        <AlertTriangle aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-ember-300" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ember-300">
            Action summary
          </p>
          <p className="mt-1 font-bold text-white">You are about to {action}.</p>
          {summaryItems.length > 0 ? (
            <dl className="mt-2 grid gap-1 text-sm text-metal-300">
              {summaryItems.map((item) => (
                <div key={item.fieldName} className="grid gap-1 sm:grid-cols-[96px_1fr]">
                  <dt className="font-bold text-metal-400">{item.label}</dt>
                  <dd className="text-white">{summaryValues[item.fieldName] || "Not selected"}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="mt-1 text-sm text-metal-300">This will {consequence}.</p>
        </div>
      </div>
      <label className="mt-4 block text-sm font-semibold text-metal-300" htmlFor={passwordId}>
        Admin password
      </label>
      <input
        id={passwordId}
        name="adminPassword"
        type="password"
        required
        disabled={disabled}
        placeholder="Required before destructive actions"
        className="mt-2 w-full rounded border border-metal-700 bg-black/30 px-3 py-2 text-sm text-metal-300"
      />
    </section>
  );
}
