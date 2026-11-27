"use client";

import { PageHeader, Skeleton, StateBlock } from "@/components/domain";
import { ButtonLink } from "@/components/ui/primitives";
import { useReferrals } from "@/lib/api/hooks";
import type { Referral } from "@/lib/api/types";
import { cn, formatDate, relativeTime } from "@/lib/format";
import { MapPin, Plus } from "lucide-react";

const STATUS: Record<Referral["status"], { label: string; dot: string }> = {
  requested: { label: "Requested", dot: "bg-accent-500" },
  acknowledged: { label: "Acknowledged", dot: "bg-low" },
  completed: { label: "Completed", dot: "bg-neutral" },
  cancelled: { label: "Cancelled", dot: "bg-neutral" },
};

export default function ReferralsPage() {
  const { data, isLoading, isError } = useReferrals();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Referrals & visits"
        description="Contact and referral requests you’ve sent to facilities."
        action={<ButtonLink href="/care"><Plus /> New request</ButtonLink>}
      />
      <section className="rounded-[var(--radius-panel)] bg-surface/70 p-4 shadow-[var(--shadow-card)] sm:p-5">
        {isLoading && <Skeleton className="h-40" />}
        {isError && <StateBlock kind="error" title="We couldn't load your requests" />}
        {data?.length === 0 && <StateBlock kind="empty" title="No requests yet" description="Find a facility to send your first request." />}
        <ul className="grid gap-3 md:grid-cols-2">
          {data?.map((r) => (
            <li key={r.id} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
              <span className="grid size-11 place-items-center rounded-xl bg-accent-50 text-accent-600">
                <MapPin className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.reason_category}</p>
                <p className="truncate text-xs text-muted">{r.facility_name}</p>
                <p className="mt-1 text-[11px] text-muted">
                  Sent {relativeTime(r.requested_at)}
                  {r.preferred_date && ` · prefers ${formatDate(r.preferred_date, { day: "numeric", month: "short" })}`}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium">
                <span className={cn("size-1.5 rounded-full", STATUS[r.status].dot)} aria-hidden />
                {STATUS[r.status].label}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
