"use client";

import { PageHeader, Skeleton, StateBlock } from "@/components/domain";
import { Button } from "@/components/ui/primitives";
import { useConsentPurposes, useConsents, useConsentToggle } from "@/lib/api/hooks";
import { cn, formatDate } from "@/lib/format";
import { ShieldCheck } from "lucide-react";

export default function ConsentPage() {
  const purposes = useConsentPurposes();
  const consents = useConsents();
  const toggle = useConsentToggle();
  const loading = purposes.isLoading || consents.isLoading;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Consent & privacy"
        description="Choose how Albo may use your information. You can change these at any time; withdrawing stops future use."
      />
      {loading && <Skeleton className="h-64" />}
      {(purposes.isError || consents.isError) && <StateBlock kind="error" title="We couldn't load your consent settings" />}

      <ul className="grid gap-4 md:grid-cols-2">
        {purposes.data?.map((p) => {
          const record = consents.data?.find((c) => c.purpose_code === p.code);
          const granted = record?.status === "granted";
          const pending = toggle.isPending && toggle.variables && ("code" in toggle.variables ? toggle.variables.code === p.code : toggle.variables.id === record?.id);
          return (
            <li key={p.code} className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{p.title}</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {p.required ? "Required for core features" : "Optional"} · version {p.version}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                    granted ? "bg-low-bg text-low" : "bg-neutral-bg text-neutral",
                  )}
                >
                  {granted && <ShieldCheck className="size-3.5" aria-hidden />}
                  {granted ? "Allowed" : record ? "Withdrawn" : "Not given"}
                </span>
              </div>
              <p className="mt-3 text-sm text-ink-soft">{p.description}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted">Data involved</dt>
                <dd>{p.data_involved}</dd>
                {record && (
                  <>
                    <dt className="text-muted">{granted ? "Allowed on" : "Withdrawn on"}</dt>
                    <dd>{formatDate((granted ? record.granted_at : record.withdrawn_at) ?? record.granted_at)}</dd>
                  </>
                )}
              </dl>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-[11px] text-muted">
                  {granted ? "If you withdraw, Albo stops using this data for this purpose." : "Nothing is turned on until you choose to allow it."}
                </p>
                <Button
                  size="sm"
                  variant={granted ? "secondary" : "primary"}
                  disabled={!!pending}
                  onClick={() =>
                    granted && record
                      ? toggle.mutate({ action: "withdraw", id: record.id })
                      : toggle.mutate({ action: "grant", code: p.code, version: p.version })
                  }
                >
                  {pending ? "Saving…" : granted ? "Withdraw" : "Allow"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
