"use client";

import { Card, CardHeader } from "@/components/ui/primitives";
import { useFeatures, useSetFeature } from "@/lib/api/hooks";
import type { FeatureFlags } from "@/lib/api/types";
import { cn } from "@/lib/format";
import { FlaskConical } from "lucide-react";

const FLAGS: { flag: keyof FeatureFlags; label: string; body: string }[] = [
  { flag: "checkins", label: "Wellbeing check-ins", body: "Needs an approved escalation process (FR-024)." },
  { flag: "assistant", label: "AI assistant", body: "Needs safety, crisis-contact and vendor approval (OPEN-006, OPEN-011)." },
  { flag: "consultations", label: "Consultations", body: "Needs provider workflow approval (OPEN-009)." },
  { flag: "provider_portal", label: "Provider portal", body: "Needs roles, assignments and consent approval (OPEN-009)." },
  { flag: "later_previews", label: "Later-phase previews", body: "Devices and the regional health map (Phase 2+)." },
];

/** Development-only switches for gated modules (ADR-017, ADR-019). Hidden in live mode. */
export function FeaturePreviewsCard() {
  const { data } = useFeatures();
  const set = useSetFeature();
  if (process.env.NEXT_PUBLIC_API_MODE === "live") return null;

  return (
    <Card className="lg:col-span-2">
      <CardHeader icon={<FlaskConical />} title="Feature previews" action={<span className="text-xs text-muted">Development only</span>} />
      <p className="mb-4 text-sm text-ink-soft">
        These features are built but gated until their approval steps are complete. Switch them off to see what real users see today.
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {FLAGS.map(({ flag, label, body }) => {
          const on = !!data?.[flag];
          return (
            <li key={flag} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-muted/70 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" id={`flag-${flag}`}>{label}</p>
                <p className="text-xs text-muted">{body}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={`flag-${flag}`}
                disabled={!data || set.isPending}
                onClick={() => set.mutate({ flag, enabled: !on })}
                className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-accent-500" : "bg-line")}
              >
                <span className={cn("absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
