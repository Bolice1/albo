"use client";

import { NotDiagnosisNotice, RiskLevelBadge, Skeleton, StateBlock } from "@/components/domain";
import { ButtonLink, Card, CardHeader } from "@/components/ui/primitives";
import { useRiskAssessment } from "@/lib/api/hooks";
import { formatDateTime, formatUseCaseLabel } from "@/lib/format";
import { fieldLabel } from "@/lib/health-fields";
import { ArrowDown, ArrowLeft, ArrowUp, Footprints, Info, ListChecks, MapPin, Minus, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { use } from "react";

export default function RiskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: a, isLoading, isError } = useRiskAssessment(id);

  return (
    <div className="space-y-5">
      <Link href="/risk" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Risk indicators
      </Link>

      {isLoading && <Skeleton className="h-64" />}
      {isError && <StateBlock kind="unauthorized" title="This indicator isn’t available" description="It may not exist or you may not have access to it." />}

      {a && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{formatUseCaseLabel(a.use_case)}</h1>
              <p className="mt-1 text-sm text-muted">
                Calculated {formatDateTime(a.calculated_at)} · Rule set {a.rule_model_version}
              </p>
            </div>
            <RiskLevelBadge assessment={a} className="px-3.5 py-1.5 text-sm" />
          </header>

          <Card className="bg-surface">
            <p className="text-base leading-relaxed">
              {a.status === "complete" && a.level !== null
                ? `Albo identified a ${a.level === "high" ? "elevated" : a.level} preventive risk indicator based on the available information.`
                : a.status === "limited"
                  ? "Albo could not calculate this indicator because some required information is missing or out of date. This does not mean your risk is low."
                  : "This indicator could not be calculated right now. This does not mean your risk is low."}
            </p>
            <NotDiagnosisNotice className="mt-4" />
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {a.status === "limited" && a.missing_inputs?.length ? (
              <Card className="lg:col-span-2">
                <CardHeader icon={<ShieldAlert />} title="Information needed" />
                <ul className="flex flex-wrap gap-2">
                  {a.missing_inputs.map((m) => (
                    <li key={m} className="rounded-full bg-neutral-bg px-3 py-1 text-sm text-neutral">{fieldLabel(m)}</li>
                  ))}
                </ul>
                <ButtonLink href="/health-inputs" className="mt-4">Update my inputs</ButtonLink>
              </Card>
            ) : null}

            {a.contributing_factors.length > 0 && (
              <Card>
                <CardHeader icon={<ListChecks />} title="Main contributing factors" />
                <ul className="space-y-2">
                  {a.contributing_factors.map((f) => {
                    const Icon = f.direction === "raises" ? ArrowUp : f.direction === "lowers" ? ArrowDown : Minus;
                    return (
                      <li key={f.code} className="flex items-start gap-3 rounded-xl bg-surface-muted px-3 py-2.5 text-sm">
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                        <span>
                          {f.label}
                          <span className="ml-1.5 text-xs text-muted">
                            ({f.direction === "raises" ? "raises the indicator" : f.direction === "lowers" ? "lowers the indicator" : "neutral"})
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-muted">Based on: your self-reported lifestyle inputs.</p>
              </Card>
            )}

            <Card>
              <CardHeader icon={<Footprints />} title="Suggested next steps" />
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {a.recommended_next_steps.map((s) => <li key={s}>{s}</li>)}
              </ul>
              <ButtonLink href="/care" variant="secondary" className="mt-4">
                <MapPin /> Find a health facility
              </ButtonLink>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader icon={<Info />} title="Limitations" />
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
                {a.limitations.map((l) => <li key={l}>{l}</li>)}
              </ul>
              <p className="mt-4 rounded-xl border border-high/20 bg-high-bg px-3 py-2.5 text-sm text-ink">
                If you feel unwell or think you need urgent help, contact a health facility or emergency services right away.
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
