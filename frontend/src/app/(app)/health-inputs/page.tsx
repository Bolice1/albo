"use client";

import { FreshnessTag, PageHeader, Skeleton, StateBlock, StatCard } from "@/components/domain";
import { Dialog } from "@/components/ui/dialog";
import { Button, Field, Progress, Segmented, inputClass } from "@/components/ui/primitives";
import { useHealthInputs, useRiskAssessments, useSaveHealthInput } from "@/lib/api/hooks";
import type { HealthInput } from "@/lib/api/types";
import { formatDate, freshness, relativeTime } from "@/lib/format";
import { HEALTH_FIELDS, PRIMARY_FIELD_CODES, fieldLabel, formatInputValue, validateFieldValue } from "@/lib/health-fields";
import { ArrowUpRight, BarChart3, CheckCircle2, ClipboardList, Clock, HeartPulse, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

type Tab = "all" | "active" | "stale" | "history";

export default function HealthInputsPage() {
  return (
    <Suspense>
      <HealthInputsView />
    </Suspense>
  );
}

function HealthInputsView() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, isLoading, isError } = useHealthInputs(true);
  const { data: assessments } = useRiskAssessments();
  const [tab, setTab] = useState<Tab>("all");
  const [editing, setEditing] = useState<{ fieldCode?: string; correct?: HealthInput } | null>(
    params.get("add") ? {} : null,
  );

  const active = useMemo(() => data?.filter((i) => i.status === "active") ?? [], [data]);
  const history = useMemo(() => data?.filter((i) => i.status === "superseded") ?? [], [data]);
  const isStale = (i: HealthInput) => freshness(i.observed_at, HEALTH_FIELDS[i.field_code]?.maxAgeHours ?? 720).isStale;
  const stale = active.filter(isStale);
  const missing = PRIMARY_FIELD_CODES.filter((c) => !active.some((i) => i.field_code === c));

  const list = tab === "history" ? history : tab === "stale" ? stale : tab === "active" ? active.filter((i) => !isStale(i)) : active;

  const closeDialog = () => {
    setEditing(null);
    if (params.get("add")) router.replace("/health-inputs");
  };

  return (
    <div className="space-y-5">
      <PageHeader title="My health inputs" description="The lifestyle information you’ve shared. You can review and correct it at any time." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<HeartPulse />} label="Inputs recorded" value={isLoading ? "–" : active.length} foot={`of ${PRIMARY_FIELD_CODES.length} approved`} />
        <StatCard icon={<CheckCircle2 />} label="Up to date" value={isLoading ? "–" : active.length - stale.length} foot="within 30 days" />
        <StatCard icon={<Clock />} label="Need updating" value={isLoading ? "–" : stale.length + missing.length} foot={`${missing.length} missing`} />
        <StatCard
          icon={<BarChart3 />}
          label="Last indicator"
          value={<span className="text-2xl">{assessments?.[0] ? relativeTime(assessments[0].calculated_at) : "–"}</span>}
        />
      </div>

      <section className="rounded-[var(--radius-panel)] bg-surface/70 p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented<Tab>
            label="Filter inputs"
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Up to date" },
              { value: "stale", label: "Out of date" },
              { value: "history", label: "History" },
            ]}
          />
          <Button onClick={() => setEditing({})}>
            <Plus /> Add health input
          </Button>
        </div>

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44" />)}
          </div>
        )}
        {isError && <StateBlock kind="error" title="We couldn't load your inputs" description="Please try again shortly." />}

        {!isLoading && !isError && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((i) => (
              <InputCard key={i.id} input={i} onCorrect={() => setEditing({ correct: i })} />
            ))}
            {tab === "all" &&
              missing.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setEditing({ fieldCode: code })}
                  className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-4 text-center text-sm text-muted transition-colors hover:border-accent-300 hover:bg-accent-50"
                >
                  <Plus className="size-5" aria-hidden />
                  <span className="font-medium text-ink">Add {fieldLabel(code).toLowerCase()}</span>
                  <span className="text-xs">Missing — indicators may be limited without it.</span>
                </button>
              ))}
            {list.length === 0 && !(tab === "all" && missing.length) && (
              <StateBlock
                kind="empty"
                className="md:col-span-2 xl:col-span-3"
                title={tab === "history" ? "No earlier versions yet" : tab === "stale" ? "Nothing out of date" : "No inputs here yet"}
                description={tab === "history" ? "When you correct an input, the earlier version is kept here." : undefined}
              />
            )}
          </div>
        )}
      </section>

      <InputDialog state={editing} onClose={closeDialog} />
    </div>
  );
}

function InputCard({ input, onCorrect }: { input: HealthInput; onCorrect: () => void }) {
  const meta = HEALTH_FIELDS[input.field_code];
  const f = freshness(input.observed_at, meta?.maxAgeHours ?? 720);
  const superseded = input.status === "superseded";
  const tone = superseded ? "neutral" : f.isStale ? "high" : f.remaining < 0.35 ? "moderate" : "accent";

  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-4">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-600">
          <ClipboardList className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{fieldLabel(input.field_code)}</h3>
          <p className="text-xs text-muted">{meta?.category ?? input.category}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium">
          <span className={superseded ? "size-1.5 rounded-full bg-neutral" : f.isStale ? "size-1.5 rounded-full bg-moderate" : "size-1.5 rounded-full bg-low"} aria-hidden />
          {superseded ? "Superseded" : f.isStale ? "Out of date" : "Current"}
        </span>
      </header>

      <div className="mt-4 flex items-end justify-between text-sm">
        <span className="font-semibold">{formatInputValue(input.field_code, input.value, input.unit)}</span>
        {!superseded && <FreshnessTag observedAt={input.observed_at} maxAgeHours={meta?.maxAgeHours ?? 720} />}
      </div>
      <Progress value={superseded ? 0 : f.remaining} tone={tone} label={`Freshness of ${fieldLabel(input.field_code)}`} className="mt-2" />

      <footer className="mt-4 flex items-end justify-between gap-2 border-t border-line pt-3">
        <dl className="grid grid-cols-2 gap-x-6 text-[11px]">
          <dt className="text-muted">Source</dt>
          <dt className="text-muted">Observed</dt>
          <dd className="font-medium">{input.source === "self_reported" ? "Self-reported" : input.source}</dd>
          <dd className="font-medium">{formatDate(input.observed_at)}</dd>
        </dl>
        {!superseded && (
          <button
            type="button"
            onClick={onCorrect}
            aria-label={`Update ${fieldLabel(input.field_code)}`}
            className="grid size-9 place-items-center rounded-full border border-line text-ink-soft transition-colors hover:bg-ink hover:text-white"
          >
            <ArrowUpRight className="size-4" />
          </button>
        )}
      </footer>
    </article>
  );
}

function InputDialog({ state, onClose }: { state: { fieldCode?: string; correct?: HealthInput } | null; onClose: () => void }) {
  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      title={state?.correct ? `Update ${fieldLabel(state.correct.field_code).toLowerCase()}` : "Add health input"}
      description={state?.correct ? "Your earlier answer is kept in your history." : "Only approved lifestyle fields can be added."}
    >
      {state && <InputForm key={state.correct?.id ?? state.fieldCode ?? "new"} state={state} onDone={onClose} />}
    </Dialog>
  );
}

function InputForm({ state, onDone }: { state: { fieldCode?: string; correct?: HealthInput }; onDone: () => void }) {
  const save = useSaveHealthInput();
  const [code, setCode] = useState(state.correct?.field_code ?? state.fieldCode ?? PRIMARY_FIELD_CODES[0]);
  const [value, setValue] = useState(state.correct ? String(state.correct.value) : "");
  const [error, setError] = useState<string | null>(null);
  const meta = HEALTH_FIELDS[code];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateFieldValue(code, value);
    setError(err);
    if (err) return;
    save.mutate(
      {
        correctId: state.correct?.id,
        input: {
          field_code: code,
          value: meta.valueType === "enum" ? value : Number(value),
          unit: meta.unit,
          observed_at: new Date().toISOString(),
        },
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Field id="field" label="What are you updating?">
        <select
          id="field"
          className={inputClass}
          value={code}
          disabled={!!state.correct}
          onChange={(e) => {
            setCode(e.target.value);
            setValue("");
            setError(null);
          }}
        >
          {PRIMARY_FIELD_CODES.map((c) => (
            <option key={c} value={c}>
              {fieldLabel(c)}
            </option>
          ))}
        </select>
      </Field>

      <Field id="value" label={meta.label} hint={meta.helper} error={error}>
        {meta.valueType === "enum" ? (
          <div role="radiogroup" aria-labelledby="value" className="grid grid-cols-3 gap-2" id="value">
            {meta.options!.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center justify-center rounded-xl border border-line px-3 py-2.5 text-sm has-[:checked]:border-accent-400 has-[:checked]:bg-accent-50 has-[:checked]:font-medium"
              >
                <input type="radio" name="value" value={o.value} checked={value === o.value} onChange={() => setValue(o.value)} className="sr-only" />
                {o.label}
              </label>
            ))}
          </div>
        ) : (
          <div className="relative">
            <input
              id="value"
              inputMode={meta.valueType === "integer" ? "numeric" : "decimal"}
              className={inputClass}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "value-error" : "value-hint"}
            />
            {meta.unit && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">{meta.unit}</span>}
          </div>
        )}
      </Field>

      <p className="rounded-xl bg-surface-muted px-3 py-2.5 text-xs text-muted">
        Saved as <strong className="font-medium text-ink">self-reported</strong>. Albo uses it only for the purposes you’ve consented to.
      </p>

      {save.isError && (
        <p role="alert" className="text-sm text-high">
          {save.error.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
