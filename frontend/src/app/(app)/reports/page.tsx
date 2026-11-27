"use client";

import { PageHeader, Skeleton, StateBlock } from "@/components/domain";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui/primitives";
import { useReports, useRequestReport } from "@/lib/api/hooks";
import type { Report } from "@/lib/api/types";
import { cn, formatDate, relativeTime } from "@/lib/format";
import { Download, FileText, Info } from "lucide-react";
import { useState } from "react";

const STATUS: Record<Report["status"], { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-accent-50 text-accent-600" },
  generating: { label: "Generating", className: "bg-accent-50 text-accent-600" },
  ready: { label: "Ready", className: "bg-low-bg text-low" },
  failed: { label: "Failed", className: "bg-high-bg text-high" },
  expired: { label: "Link expired", className: "bg-neutral-bg text-neutral" },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsPage() {
  const { data, isLoading, isError } = useReports();
  const request = useRequestReport();
  const [start, setStart] = useState(iso(new Date(Date.now() - 90 * 86_400_000)));
  const [end, setEnd] = useState(iso(new Date()));
  const invalid = start > end;

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" description="Private summaries of your information for a period you choose." />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="rounded-[var(--radius-panel)] bg-surface/70 p-4 shadow-[var(--shadow-card)] sm:p-5">
          <h2 className="mb-4 text-sm font-medium text-ink-soft">Your reports</h2>
          {isLoading && <Skeleton className="h-40" />}
          {isError && <StateBlock kind="error" title="We couldn't load your reports" />}
          {data?.length === 0 && <StateBlock kind="empty" title="No reports yet" description="Request one using the form." />}
          <ul className="space-y-3">
            {data?.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-4">
                <span className="grid size-11 place-items-center rounded-xl bg-accent-50 text-accent-600">
                  <FileText className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {formatDate(r.period_start)} – {formatDate(r.period_end)}
                  </p>
                  <p className="text-xs text-muted">Requested {relativeTime(r.requested_at)}</p>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS[r.status].className)}>{STATUS[r.status].label}</span>
                <Button variant="secondary" size="sm" disabled={r.status !== "ready"} aria-label={`Download report ${formatDate(r.period_start)} to ${formatDate(r.period_end)}`}>
                  <Download /> Download
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <Card className="h-fit">
          <CardHeader icon={<FileText />} title="Request a report" />
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!invalid) request.mutate({ start, end });
            }}
          >
            <Field id="start" label="From">
              <input id="start" type="date" className={inputClass} value={start} max={end} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field id="end" label="To" error={invalid ? "End date must be after the start date." : null}>
              <input id="end" type="date" className={inputClass} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <p className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-xs text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Reports show where each item came from (self-reported, imported or generated), the rule versions used, and their limitations. Download links expire.
            </p>
            {request.isError && <p role="alert" className="text-sm text-high">{request.error.message}</p>}
            {request.isSuccess && <p role="status" className="text-sm text-low">Report requested. We’ll notify you when it’s ready.</p>}
            <Button type="submit" className="w-full" disabled={invalid || request.isPending}>
              {request.isPending ? "Requesting…" : "Request report"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
