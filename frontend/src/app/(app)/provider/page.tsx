"use client";

import { PageHeader, RiskLevelBadge, Skeleton, StatCard, StateBlock } from "@/components/domain";
import { FeatureGate, PreviewBanner } from "@/components/domain/gated";
import { Card, inputClass } from "@/components/ui/primitives";
import { useAssignedCitizens } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import { ArrowUpRight, ClipboardList, Search, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const SCOPE_LABEL = { health_inputs: "Inputs", risk_assessments: "Indicators", follow_ups: "Follow-ups" } as const;

export default function ProviderHomePage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Assigned people" description="People you are assigned to support, within the scope they have agreed to share." />
      <FeatureGate flag="provider_portal" name="The provider portal">
        <PreviewBanner>
          You are viewing the provider portal with synthetic people. Access is limited to active assignments and the scopes each person has consented to share.
        </PreviewBanner>
        <ProviderContent />
      </FeatureGate>
    </div>
  );
}

function ProviderContent() {
  const { data, isLoading, isError } = useAssignedCitizens();
  const [q, setQ] = useState("");
  const shown = data?.filter((c) => `${c.display_name} ${c.administrative_area}`.toLowerCase().includes(q.toLowerCase())) ?? [];
  const elevated = data?.filter((c) => c.latest_level === "high" || c.latest_level === "moderate").length ?? 0;
  const limited = data?.filter((c) => c.latest_status !== "complete").length ?? 0;

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard icon={<Users />} label="Active assignments" value={data?.length ?? "–"} foot="Synthetic" />
        <StatCard icon={<TriangleAlert />} label="Moderate or high" value={elevated} foot="Latest indicator" />
        <StatCard icon={<ClipboardList />} label="Limited information" value={limited} foot="Inputs missing or old" />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <label htmlFor="provider-search" className="sr-only">Search assigned people</label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id="provider-search" className={`${inputClass} pl-10`} placeholder="Search by name or area" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="size-3.5" aria-hidden /> Every view is recorded in the audit log.
          </p>
        </div>

        {isLoading && <Skeleton className="h-48" />}
        {isError && <StateBlock kind="unavailable" title="Assignments are unavailable" />}
        {data && shown.length === 0 && (
          <StateBlock kind="empty" title="No assigned people" description="People appear here once an administrator assigns them to you and they consent to sharing." />
        )}

        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <li key={c.assignment_id}>
              <Link
                href={`/provider/${c.citizen_user_id}`}
                className="block rounded-2xl border border-line bg-surface-muted/70 p-4 transition-colors hover:bg-accent-50"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-200 text-sm font-semibold text-accent-600">
                    {c.display_name.split(" ").pop()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.display_name}</p>
                    <p className="truncate text-xs text-muted">{c.administrative_area}</p>
                  </div>
                  <ArrowUpRight className="size-4 text-muted" aria-hidden />
                </div>
                <div className="mt-4">
                  {c.latest_status ? (
                    <RiskLevelBadge assessment={{ status: c.latest_status, level: c.latest_level }} />
                  ) : (
                    <span className="text-xs text-muted">No indicator shared</span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {c.allowed_scopes.map((s) => (
                    <span key={s} className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-soft">{SCOPE_LABEL[s]}</span>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted">
                  Assigned {formatDate(c.starts_at)}{c.ends_at ? ` · until ${formatDate(c.ends_at)}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
