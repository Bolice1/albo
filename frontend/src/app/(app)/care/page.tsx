"use client";

import { Skeleton, StateBlock } from "@/components/domain";
import { FacilityMap } from "@/components/domain/facility-map";
import { Dialog } from "@/components/ui/dialog";
import { Button, Field, inputClass } from "@/components/ui/primitives";
import { useCreateReferral, useFacilities } from "@/lib/api/hooks";
import type { Facility } from "@/lib/api/types";
import { cn, relativeTime } from "@/lib/format";
import { AlertTriangle, ArrowUpRight, Building2, Phone, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";

const STALE_AFTER_DAYS = 90;

export default function FindCarePage() {
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const { data, isLoading, isError } = useFacilities(deferredQ);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [referralOpen, setReferralOpen] = useState(false);
  const selected = data?.find((f) => f.id === selectedId) ?? null;

  const isStale = (f: Facility) => Date.now() - new Date(f.last_verified_at).getTime() > STALE_AFTER_DAYS * 86_400_000;
  const recent = data?.filter((f) => !isStale(f)) ?? [];
  const older = data?.filter(isStale) ?? [];

  return (
    <div className="grid gap-5 lg:h-[calc(100dvh-7rem)] lg:grid-cols-[minmax(320px,420px)_1fr]">
      <section className="flex min-h-0 flex-col rounded-[var(--radius-panel)] bg-surface/85 p-5 shadow-[var(--shadow-card)]">
        <h1 className="text-xl font-semibold">Find care</h1>
        <p className="mb-4 text-xs text-muted">Facility details come from the listed source. Always confirm before travelling.</p>

        <div className="relative mb-4">
          <label htmlFor="facility-search" className="sr-only">Search facilities or services</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="facility-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search facilities or services"
            className={cn(inputClass, "rounded-full pl-10")}
          />
        </div>

        <div className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1">
          {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20" />)}
          {isError && <StateBlock kind="unavailable" title="Facility search is unavailable" description="Please try again shortly." />}
          {data?.length === 0 && <StateBlock kind="empty" title="No facilities match your search" description="Try a different service or name." />}

          {recent.length > 0 && (
            <FacilityGroup title="Recently verified" items={recent} selectedId={selectedId} onSelect={setSelectedId} />
          )}
          {older.length > 0 && (
            <FacilityGroup title="Not recently verified" items={older} selectedId={selectedId} onSelect={setSelectedId} stale />
          )}
        </div>

        <div className="mt-4 border-t border-line pt-4">
          {selected ? (
            <dl className="mb-4 space-y-1.5 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-muted">Address</dt><dd className="text-right">{selected.address}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Contact</dt><dd>{selected.contact ?? "Not listed"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Source</dt><dd>{selected.source} · {relativeTime(selected.last_verified_at)}</dd></div>
            </dl>
          ) : (
            <p className="mb-4 text-xs text-muted">Select a facility to see its details and send a contact request.</p>
          )}
          <Button size="lg" className="w-full" disabled={!selected} onClick={() => setReferralOpen(true)}>
            Request referral <ArrowUpRight />
          </Button>
        </div>
      </section>

      <div className="hidden min-h-0 lg:block">
        <FacilityMap facilities={data ?? []} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <ReferralDialog facility={referralOpen ? selected : null} onClose={() => setReferralOpen(false)} />
    </div>
  );
}

function FacilityGroup({
  title,
  items,
  selectedId,
  onSelect,
  stale,
}: {
  title: string;
  items: Facility[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  stale?: boolean;
}) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-medium text-muted">{title}</h2>
      <ul className="space-y-2.5">
        {items.map((f) => {
          const active = f.id === selectedId;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelect(f.id)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border bg-surface-muted/70 p-3.5 text-left transition-colors",
                  active ? "border-accent-400 bg-accent-50 ring-4 ring-accent-100" : "border-line hover:border-accent-200",
                )}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-accent-600 shadow-[var(--shadow-card)]">
                  <Building2 className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{f.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {f.type} · {f.services.slice(0, 2).join(", ")}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-muted">
                  {stale ? (
                    <span className="inline-flex items-center gap-1 font-medium text-moderate">
                      <AlertTriangle className="size-3" /> Check info
                    </span>
                  ) : (
                    <>Verified<br />{relativeTime(f.last_verified_at)}</>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const REASONS = ["Routine check-up", "Lifestyle guidance", "Follow-up on an indicator", "Other"];

function ReferralDialog({ facility, onClose }: { facility: Facility | null; onClose: () => void }) {
  const create = useCreateReferral();
  const [reason, setReason] = useState(REASONS[0]);
  const [date, setDate] = useState("");
  const [done, setDone] = useState(false);

  const close = () => {
    setDone(false);
    create.reset();
    onClose();
  };

  return (
    <Dialog open={!!facility} onClose={close} title="Request referral" description={facility?.name}>
      {done ? (
        <StateBlock
          kind="empty"
          title="Request sent"
          description="The facility will review your request. You can follow its status in Referrals & visits. This is not an emergency service."
          action={<Button onClick={close}>Done</Button>}
        />
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!facility) return;
            create.mutate(
              { facility_id: facility.id, reason_category: reason, preferred_date: date ? new Date(date).toISOString() : null },
              { onSuccess: () => setDone(true) },
            );
          }}
        >
          <Field id="reason" label="Reason">
            <select id="reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field id="date" label="Preferred date" optional>
            <input id="date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <p className="flex items-start gap-2 rounded-xl bg-high-bg px-3 py-2.5 text-xs text-ink">
            <Phone className="mt-0.5 size-3.5 shrink-0 text-high" aria-hidden />
            For urgent symptoms, contact emergency services or go to the nearest facility instead of waiting for a reply.
          </p>
          {create.isError && <p role="alert" className="text-sm text-high">{create.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Sending…" : "Send request"}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
