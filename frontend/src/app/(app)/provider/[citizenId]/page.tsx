"use client";

import { NotDiagnosisNotice, RiskLevelBadge, Skeleton, StateBlock } from "@/components/domain";
import { FeatureGate, PreviewBanner } from "@/components/domain/gated";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui/primitives";
import { ApiRequestError } from "@/lib/api/client";
import { useCitizenOverview, useCreateFollowUp } from "@/lib/api/hooks";
import type { NewFollowUp, ProviderFollowUp } from "@/lib/api/types";
import { formatDate, formatDateTime, formatUseCaseLabel, relativeTime } from "@/lib/format";
import { fieldLabel, formatInputValue } from "@/lib/health-fields";
import { ArrowLeft, BarChart3, ClipboardPen, HeartPulse, Lock, UserRound } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";

const ACTIONS: Record<ProviderFollowUp["action_type"], string> = {
  lifestyle_counselling: "Lifestyle counselling",
  schedule_visit: "Schedule a visit",
  recheck_inputs: "Ask to update inputs",
  refer_to_facility: "Refer to a facility",
};

export default function CitizenOverviewPage({ params }: { params: Promise<{ citizenId: string }> }) {
  const { citizenId } = use(params);
  return (
    <div className="space-y-5">
      <Link href="/provider" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Assigned people
      </Link>
      <FeatureGate flag="provider_portal" name="The provider portal">
        <Overview citizenId={citizenId} />
      </FeatureGate>
    </div>
  );
}

function Overview({ citizenId }: { citizenId: string }) {
  const { data, isLoading, error } = useCitizenOverview(citizenId);

  if (isLoading) return <Skeleton className="h-96" />;
  if (error) {
    return (
      <StateBlock
        kind="unauthorized"
        title="This record is not available to you"
        description="You can only view people with an active assignment who have agreed to share with you."
        className="rounded-[var(--radius-card)] bg-surface/85 py-16"
      />
    );
  }
  if (!data) return null;
  const { citizen } = data;
  const can = (s: (typeof citizen.allowed_scopes)[number]) => citizen.allowed_scopes.includes(s);

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-accent-200 text-accent-600">
          <UserRound className="size-6" aria-hidden />
        </span>
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">{citizen.display_name}</h1>
          <p className="text-sm text-muted">
            {citizen.administrative_area} · born {data.birth_year ?? "unknown"} · {citizen.organization_name}
          </p>
        </div>
      </div>
      <PreviewBanner>
        Synthetic person. You see only what this assignment allows. You can add follow-ups, but you can&apos;t change the person&apos;s own inputs or their indicators.
      </PreviewBanner>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<BarChart3 />} title="Indicators" action={<span className="text-xs text-muted">Rule-generated</span>} />
          {!can("risk_assessments") ? (
            <ScopeLocked what="indicators" />
          ) : data.risk_assessments.length === 0 ? (
            <StateBlock kind="empty" title="No indicators yet" />
          ) : (
            <ul className="space-y-3">
              {data.risk_assessments.map((a) => (
                <li key={a.id} className="rounded-2xl border border-line bg-surface-muted/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{formatUseCaseLabel(a.use_case)}</p>
                    <RiskLevelBadge assessment={a} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {formatDateTime(a.calculated_at)} · {a.rule_model_version}
                  </p>
                  {a.contributing_factors.length > 0 && (
                    <p className="mt-2 text-sm text-ink-soft">
                      Factors: {a.contributing_factors.map((f) => f.label).join(", ")}
                    </p>
                  )}
                  {a.limitations[0] && <p className="mt-2 text-xs text-muted">Limitation: {a.limitations[0]}</p>}
                </li>
              ))}
            </ul>
          )}
          <NotDiagnosisNotice compact className="mt-3" />
        </Card>

        <Card>
          <CardHeader icon={<HeartPulse />} title="Health inputs" action={<span className="text-xs text-muted">Read-only</span>} />
          {!can("health_inputs") ? (
            <ScopeLocked what="health inputs" />
          ) : (
            <ul className="divide-y divide-line">
              {data.health_inputs.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{fieldLabel(i.field_code)}</p>
                    <p className="text-[11px] text-muted">{i.provenance_note}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{formatInputValue(i.field_code, i.value, i.unit)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <FollowUps citizenId={citizenId} allowed={can("follow_ups")} followUps={data.follow_ups} latestAssessmentId={data.risk_assessments[0]?.id ?? null} />
    </>
  );
}

function ScopeLocked({ what }: { what: string }) {
  return (
    <StateBlock
      kind="unauthorized"
      title={`No access to ${what}`}
      description="This person hasn't shared this with your assignment."
      className="py-6"
    />
  );
}

function FollowUps({
  citizenId,
  allowed,
  followUps,
  latestAssessmentId,
}: {
  citizenId: string;
  allowed: boolean;
  followUps: ProviderFollowUp[];
  latestAssessmentId: string | null;
}) {
  const create = useCreateFollowUp(citizenId);
  const [action, setAction] = useState<NewFollowUp["action_type"]>("lifestyle_counselling");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        action_type: action,
        note,
        referenced_assessment_id: latestAssessmentId,
        recommended_follow_up_at: when ? new Date(when).toISOString() : null,
      });
      setNote("");
      setWhen("");
    } catch {
      /* shown below */
    }
  }

  return (
    <Card>
      <CardHeader icon={<ClipboardPen />} title="Follow-ups" />
      {!allowed ? (
        <ScopeLocked what="follow-ups" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={submit} className="space-y-4">
            <Field id="fu-action" label="Action">
              <select id="fu-action" className={inputClass} value={action} onChange={(e) => setAction(e.target.value as NewFollowUp["action_type"])}>
                {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field id="fu-note" label="Note" hint="Structured, factual note. Avoid diagnoses and unnecessary personal details.">
              <textarea
                id="fu-note"
                rows={3}
                maxLength={500}
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-accent-400 focus:outline-none focus:ring-4 focus:ring-accent-100"
              />
            </Field>
            <Field id="fu-when" label="Suggested follow-up date" optional>
              <input id="fu-when" type="date" className={inputClass} value={when} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            {create.isError && (
              <p role="alert" className="text-sm text-high">
                {create.error instanceof ApiRequestError ? create.error.message : "We couldn't save the follow-up."}
              </p>
            )}
            <Button type="submit" disabled={!note.trim() || create.isPending}>
              {create.isPending ? "Saving…" : "Record follow-up"}
            </Button>
          </form>

          <div>
            <p className="mb-2 text-xs font-medium text-muted">History</p>
            {followUps.length === 0 && <StateBlock kind="empty" title="No follow-ups yet" className="py-6" />}
            <ol className="space-y-3">
              {followUps.map((f) => (
                <li key={f.id} className="rounded-2xl border border-line bg-surface-muted/70 p-3.5">
                  <p className="flex items-center justify-between text-sm font-medium">
                    {ACTIONS[f.action_type]}
                    <span className="text-[11px] font-normal text-muted">{relativeTime(f.created_at)}</span>
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">{f.note}</p>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {f.provider_name}
                    {f.recommended_follow_up_at && ` · follow up by ${formatDate(f.recommended_follow_up_at)}`}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
              <Lock className="size-3" aria-hidden /> Follow-ups are added, never edited, so the record stays auditable.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
