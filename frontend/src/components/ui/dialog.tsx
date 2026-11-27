"use client";

import { cn } from "@/lib/format";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Accessible modal dialog built on the native <dialog> element. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  side = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  side?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
      className={cn(
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-panel)] bg-surface p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-ink/25 backdrop:backdrop-blur-sm",
        side && "mr-0 h-dvh max-h-dvh w-[min(36rem,100vw)] rounded-r-none",
      )}
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
            <div>
              <h2 id="dialog-title" className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-2 text-muted hover:bg-surface-muted"
            >
              <X className="size-4" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
