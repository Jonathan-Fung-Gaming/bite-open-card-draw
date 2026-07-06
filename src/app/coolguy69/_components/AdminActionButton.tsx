"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
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
  const [locked, setLocked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submittedRef = useRef(false);
  const isDisabled = disabled || !hydrated || isPending || locked;

  useEffect(() => {
    setHydrated(true);
  }, []);

  function invokeAction() {
    if (isDisabled || submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setLocked(true);

    const formData = new FormData();

    for (const [name, value] of Object.entries(fields)) {
      formData.set(name, String(value));
    }

    startTransition(async () => {
      try {
        await action(formData);
        router.refresh();
      } finally {
        submittedRef.current = false;
        setLocked(false);
      }
    });
  }

  return (
    <button
      aria-busy={isPending || locked}
      className={className}
      disabled={isDisabled}
      onClick={invokeAction}
      type="button"
    >
      {children}
    </button>
  );
}
