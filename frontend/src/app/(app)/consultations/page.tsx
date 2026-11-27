"use client";

import { PageHeader, Skeleton, StateBlock } from "@/components/domain";
import { FeatureGate, PreviewBanner } from "@/components/domain/gated";
import { Dialog } from "@/components/ui/dialog";
import { Button, Card, Field, inputClass, Segmented } from "@/components/ui/primitives";
import { useCancelConsultation, useConsultations, useRequestConsultation } from "@/lib/api/hooks";
import type { Consultation, ConsultationStatus } from "@/lib/api/types";
import { cn, formatDate, formatDateTime } from "@/lib/format";
import { CalendarClock, Plus, Stethoscope } from "lucide-react";
import { useState } from "react";

const STATUS: Record<ConsultationStatus, { label: string; className: string }> = {
  requested: { label: "Requested", className: "bg-accent-100 text-accent-600" },
  scheduled: { label: "Scheduled", className: "bg-low-bg text-low" },
  completed: { label: "Completed", className: "bg-neutral-bg text-neutral" },
  cancelled: { label: "Cancelled", className: "bg-neutral-bg text-muted" },
};

const PURPOSES = ["Preventive lifestyle review", "Discuss my indicator", "Follow-up on a referral", "General health question"];

export default function ConsultationsPage() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Consultations"
        description="Request a consultation with a provider and track its status."
        action={<Button size="lg" onClick={() => setOpen(true)}><Plus /> Request consultation</Button>}
      />
      <FeatureGate flag="consultations" name="Consultations">
        <PreviewBanner />
        <ConsultationList />
        <RequestDialog open={open} onClose={() => setOpen(false)} />
      </FeatureGate>
    </div>
  );
}

function ConsultationList() {
  const { data, isLoading, isError } = useConsultations();
  const cancel = useCancelConsultation();
  const [filter, setFilter] = useState<"upcoming" | "past">("upcoming");
  const isUpcoming = (c: Consultation) => c.status === "requested" || c.status === "scheduled";
  const shown = data?.filter((c) => (filter === "upcoming" ? isUpcoming(c) : !isUpcoming(c))) ?? [];

  return (
    <Card>
      <div className="mb-4">
        <Segmented
          label="Filter consultations"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "upcoming", label: "Upcoming", count: data?.filter(isUpcoming).length },
            { value: "past", label: "Past", count: data?.filter((c) => !isUpcoming(c)).length },
          ]}
        />
      </div>
      {isLoading && <Skeleton className="h-40" />}
      {isError && <StateBlock kind="unavailable" title="Consultations are unavailable" />}
      {data && shown.length === 0 && (
        <StateBlock kind="empty" title={filter === "upcoming" ? "No upcoming consultations" : "No past consultations"} />
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {shown.map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-surface-muted/70 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-600">
                <Stethoscope className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.purpose}</p>
                <p className="truncate text-xs text-muted">{c.provider_name} · {c.organization_name}</p>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", STATUS[c.status].className)}>
                {STATUS[c.status].label}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">Preferred</dt>
                <dd className="font-medium">{c.requested_for_at ? formatDate(c.requested_for_at) : "Any time"}</dd>
              </div>
              <div>
                <dt className="text-muted">Scheduled</dt>
                <dd className="font-medium">{c.scheduled_at ? formatDateTime(c.scheduled_at) : "Waiting for provider"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-muted">{c.workflow_notice}</p>
            {isUpcoming(c) && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-high"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(c.id)}
              >
                Cancel request
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const request = useRequestConsultation();
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [date, setDate] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await request.mutateAsync({ purpose, requested_for_at: date ? new Date(date).toISOString() : null });
      setDate("");
      onClose();
    } catch {
      /* shown below */
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Request a consultation" description="A provider will confirm a time with you.">
      <form onSubmit={submit} className="space-y-4">
        <Field id="purpose" label="Reason">
          <select id="purpose" className={inputClass} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {PURPOSES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field id="preferred" label="Preferred date" optional>
          <input id="preferred" type="date" className={inputClass} value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <p className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-xs text-ink-soft">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Don&apos;t include symptoms or personal details here. For urgent problems, contact emergency services.
        </p>
        {request.isError && <p role="alert" className="text-sm text-high">We couldn&apos;t send the request. Please try again.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={request.isPending}>{request.isPending ? "Sending…" : "Send request"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
