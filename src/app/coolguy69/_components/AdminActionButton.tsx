"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type AdminActionButtonProps = {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  fields?: Record<string, number | string>;
};

export function AdminActionButton({
  action,
  children,
  className,
  disabled = false,
  fields = {},
}: AdminActionButtonProps) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isDisabled = disabled || !hydrated || isPending;

  useEffect(() => {
    setHydrated(true);
  }, []);

  function invokeAction() {
    if (isDisabled) {
      return;
    }

    const formData = new FormData();

    for (const [name, value] of Object.entries(fields)) {
      formData.set(name, String(value));
    }

    startTransition(async () => {
      await action(formData);
      router.refresh();
    });
  }

  return (
    <button
      aria-busy={isPending}
      className={className}
      disabled={isDisabled}
      onClick={invokeAction}
      type="button"
    >
      {children}
    </button>
  );
}
