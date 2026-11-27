"use client";

import { PageHeader, Skeleton, StateBlock } from "@/components/domain";
import { CrisisCard, FeatureGate, PreviewBanner } from "@/components/domain/gated";
import { Button, ButtonLink, Card, CardHeader, Field } from "@/components/ui/primitives";
import { ApiRequestError } from "@/lib/api/client";
import { useCheckIns, useCreateCheckIn } from "@/lib/api/hooks";
import type { CheckInResponses, WellbeingCheckIn } from "@/lib/api/types";
import { cn, formatDate, relativeTime } from "@/lib/format";
import { CalendarCheck, HeartHandshake, History, Info, SmilePlus } from "lucide-react";
import { useState } from "react";

const SCALE = ["Never", "Rarely", "Sometimes", "Often", "Always"];
const SLEEP_SCALE = ["Very poor", "Poor", "Okay", "Good", "Very good"];

const QUESTIONS: { key: keyof Omit<CheckInResponses, "self_harm_signal">; label: string; scale: string[] }[] = [
  { key: "stress_frequency_score", label: "In the past week, how often did you feel stressed?", scale: SCALE },
  { key: "exhaustion_score", label: "How often did you feel worn out or exhausted?", scale: SCALE },
  { key: "sleep_quality_score", label: "How would you rate your sleep?", scale: SLEEP_SCALE },
];

const STATUS: Record<WellbeingCheckIn["safety_status"], { label: string; className: string }> = {
  routine: { label: "Steady", className: "bg-low-bg text-low" },
  elevated: { label: "Feeling strained", className: "bg-moderate-bg text-moderate" },
  escalated: { label: "Support offered", className: "bg-high-bg text-high" },
};

export default function CheckInsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Wellbeing check-ins" description="A one-minute reflection on stress, tiredness and sleep." />
      <FeatureGate flag="checkins" name="Wellbeing check-ins">
        <PreviewBanner />
        <CheckInsContent />
      </FeatureGate>
    </div>
  );
}

function CheckInsContent() {
  const { data, isLoading, error } = useCheckIns();
  const create = useCreateCheckIn();
  const [answers, setAnswers] = useState<Partial<CheckInResponses>>({});
  const [selfHarm, setSelfHarm] = useState<0 | 1 | null>(null);
  const [result, setResult] = useState<WellbeingCheckIn | null>(null);
  const complete = QUESTIONS.every((q) => answers[q.key] !== undefined) && selfHarm !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    try {
      const row = await create.mutateAsync({
        responses: { ...(answers as CheckInResponses), self_harm_signal: selfHarm ?? 0 },
      });
      setResult(row);
      setAnswers({});
      setSelfHarm(null);
    } catch {
      /* shown below */
    }
  }

  const last = data?.[0];
  const consentMissing = create.error instanceof ApiRequestError && create.error.status === 403;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5">
        {result?.crisis_escalation && <CrisisCard card={result.crisis_escalation} />}
        {result && !result.crisis_escalation && (
          <Card className="border border-accent-200">
            <p role="status" className="flex items-center gap-2 font-medium">
              <CalendarCheck className="size-4 text-accent-600" aria-hidden /> Check-in saved
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {result.safety_status === "elevated"
                ? "It sounds like this week has been heavy. Small steps like a short walk or an earlier night can help. If it keeps feeling this way, consider talking to a health worker."
                : "Thanks for taking a moment for yourself. Regular check-ins help you notice changes over time."}
            </p>
            {result.safety_status === "elevated" && (
              <ButtonLink href="/care" variant="secondary" size="sm" className="mt-3">Find support nearby</ButtonLink>
            )}
          </Card>
        )}

        <Card>
          <CardHeader icon={<SmilePlus />} title="New check-in" action={<span className="text-xs text-muted">wellbeing-v1</span>} />
          <form onSubmit={submit} className="space-y-6">
            {QUESTIONS.map((q) => (
              <fieldset key={q.key}>
                <legend className="text-sm font-medium">{q.label}</legend>
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {q.scale.map((label, value) => {
                    const selected = answers[q.key] === value;
                    return (
                      <label
                        key={label}
                        className={cn(
                          "flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-center text-[11px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-400",
                          selected ? "border-accent-400 bg-accent-100 font-medium text-ink" : "border-line bg-surface-muted/70 text-muted hover:bg-accent-50",
                        )}
                      >
                        <input
                          type="radio"
                          name={q.key}
                          value={value}
                          checked={selected}
                          onChange={() => setAnswers((a) => ({ ...a, [q.key]: value }))}
                          className="sr-only"
                        />
                        <span className="text-base font-semibold">{value}</span>
                        {label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <fieldset className="rounded-2xl border border-line bg-surface-muted/50 p-4">
              <legend className="px-1 text-sm font-medium">Have you had thoughts of harming yourself?</legend>
              <p className="mt-1 text-xs text-muted">
                We ask everyone this. If you answer yes, Albo will show you where to get support straight away.
              </p>
              <div className="mt-3 flex gap-2">
                {([0, 1] as const).map((v) => (
                  <label
                    key={v}
                    className={cn(
                      "cursor-pointer rounded-full border px-4 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-400",
                      selfHarm === v ? "border-accent-400 bg-accent-100 font-medium" : "border-line bg-surface",
                    )}
                  >
                    <input type="radio" name="self_harm" className="sr-only" checked={selfHarm === v} onChange={() => setSelfHarm(v)} />
                    {v ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field id="reflection" label="Anything you'd like to note?" optional hint="Kept on this device only in this preview. It isn't saved.">
              <textarea id="reflection" rows={2} maxLength={500} className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-accent-400 focus:outline-none focus:ring-4 focus:ring-accent-100" />
            </Field>

            {create.isError && (
              <p role="alert" className="text-sm text-high">
                {consentMissing ? (
                  <>Saving check-ins needs your consent. <a href="/settings/consent" className="underline">Manage consent</a></>
                ) : (
                  "We couldn't save your check-in. Please try again."
                )}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" disabled={!complete || create.isPending}>
                {create.isPending ? "Saving…" : "Save check-in"}
              </Button>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Info className="size-3.5" aria-hidden /> Check-ins are for reflection, not a diagnosis.
              </p>
            </div>
          </form>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader icon={<HeartHandshake />} title="Last check-in" />
          {isLoading && <Skeleton className="h-20" />}
          {error && <StateBlock kind="unavailable" title="Check-ins are unavailable" />}
          {data && !last && <StateBlock kind="empty" title="No check-ins yet" description="Your first one takes about a minute." />}
          {last && (
            <div>
              <p className="text-4xl font-semibold tracking-tight">{relativeTime(last.completed_at)}</p>
              <span className={cn("mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium", STATUS[last.safety_status].className)}>
                {STATUS[last.safety_status].label}
              </span>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader icon={<History />} title="History" action={<span className="text-xs text-muted">Higher = more strain</span>} />
          {data && data.length > 0 && (
            <ul className="space-y-3">
              {data.map((c) => {
                const strain = c.responses.stress_frequency_score + c.responses.exhaustion_score + (4 - c.responses.sleep_quality_score);
                return (
                  <li key={c.id} className="rounded-2xl border border-line bg-surface-muted/70 p-3.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{formatDate(c.completed_at, { weekday: "short", day: "numeric", month: "short" })}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS[c.safety_status].className)}>
                        {STATUS[c.safety_status].label}
                      </span>
                    </div>
                    <div
                      className="hatched mt-2.5 h-2 overflow-hidden rounded-full"
                      role="img"
                      aria-label={`Strain ${strain} out of 12`}
                    >
                      <div className="h-full rounded-full bg-accent-300" style={{ width: `${(strain / 12) * 100}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      Stress {SCALE[c.responses.stress_frequency_score].toLowerCase()} · Exhaustion{" "}
                      {SCALE[c.responses.exhaustion_score].toLowerCase()} · Sleep {SLEEP_SCALE[c.responses.sleep_quality_score].toLowerCase()}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-[11px] text-muted">{last?.non_diagnostic_disclaimer}</p>
        </Card>
      </div>
    </div>
  );
}
