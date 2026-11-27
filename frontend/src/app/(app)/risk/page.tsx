"use client";

import { NotDiagnosisNotice, PageHeader, RiskLevelBadge, RiskLevelIcon, Skeleton, StateBlock } from "@/components/domain";
import { Button } from "@/components/ui/primitives";
import { useRequestRiskAssessment, useRiskAssessments } from "@/lib/api/hooks";
import { formatDateTime, formatUseCaseLabel } from "@/lib/format";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function RiskListPage() {
  const { data, isLoading, isError } = useRiskAssessments();
  const recalc = useRequestRiskAssessment();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Risk indicators"
        description="Explainable preventive indicators calculated from your consented inputs."
        action={
          <Button onClick={() => recalc.mutate()} disabled={recalc.isPending}>
            <RefreshCw className={recalc.isPending ? "animate-spin" : undefined} />
            {recalc.isPending ? "Calculating…" : "Recalculate"}
          </Button>
        }
      />
      {recalc.isError && (
        <p role="alert" className="rounded-xl bg-high-bg px-4 py-3 text-sm text-high">{recalc.error.message}</p>
      )}
      <NotDiagnosisNotice />

      <section className="rounded-[var(--radius-panel)] bg-surface/70 p-4 shadow-[var(--shadow-card)] sm:p-5">
        <h2 className="mb-4 text-sm font-medium text-ink-soft">History</h2>
        {isLoading && <Skeleton className="h-48" />}
        {isError && <StateBlock kind="error" title="We couldn't load your indicators" />}
        {data?.length === 0 && (
          <StateBlock kind="empty" title="No current indicator available for this use case" description="Add your health inputs, then recalculate." />
        )}
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((a) => (
            <li key={a.id}>
              <Link href={`/risk/${a.id}`} className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent-300">
                <div className="flex items-start gap-3">
                  <RiskLevelIcon assessment={a} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{formatUseCaseLabel(a.use_case)}</h3>
                    <p className="text-xs text-muted">{formatDateTime(a.calculated_at)}</p>
                  </div>
                  <ArrowUpRight className="size-4 text-muted" aria-hidden />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <RiskLevelBadge assessment={a} />
                  <span className="text-[11px] text-muted">{a.rule_model_version}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
