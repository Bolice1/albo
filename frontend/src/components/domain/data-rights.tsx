"use client";

import { StateBlock } from "@/components/domain";
import { Dialog } from "@/components/ui/dialog";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui/primitives";
import { ApiRequestError } from "@/lib/api/client";
import { useDataExports, useRequestAccountDeletion, useRequestDataExport } from "@/lib/api/hooks";
import type { AccountDeletionRequest, DataExport } from "@/lib/api/types";
import { cn, formatDate, relativeTime } from "@/lib/format";
import { Download, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

const EXPORT_STATUS: Record<DataExport["status"], { label: string; className: string }> = {
  requested: { label: "Preparing", className: "bg-accent-100 text-accent-600" },
  ready: { label: "Ready", className: "bg-low-bg text-low" },
  expired: { label: "Expired", className: "bg-neutral-bg text-neutral" },
  failed: { label: "Failed", className: "bg-high-bg text-high" },
};

const CONFIRM_WORD = "DELETE";

/** FR-006: export, and account deletion with a 30-day grace period (DATA_PRIVACY §8.1). */
export function DataRightsCard() {
  const { data: exports, isLoading } = useDataExports();
  const requestExport = useRequestDataExport();
  const requestDeletion = useRequestAccountDeletion();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletion, setDeletion] = useState<AccountDeletionRequest | null>(null);

  const preparing = exports?.some((e) => e.status === "requested");
  const exportError =
    requestExport.error instanceof ApiRequestError ? requestExport.error.message : requestExport.error ? "We couldn't start the export." : null;

  async function confirmDeletion() {
    try {
      setDeletion(await requestDeletion.mutateAsync());
      setDialogOpen(false);
    } catch {
      /* error shown in dialog */
    }
  }

  return (
    <Card>
      <CardHeader icon={<Download />} title="Your data" />

      <p className="text-sm text-ink-soft">
        Download a copy of the information Albo holds about you. Links are private and expire after a short time.
      </p>
      <Button variant="secondary" className="mt-3" onClick={() => requestExport.mutate()} disabled={preparing || requestExport.isPending}>
        {preparing ? <Loader2 className="animate-spin" /> : <Download />}
        {preparing ? "Preparing export…" : "Request data export"}
      </Button>
      {exportError && <p role="alert" className="mt-2 text-xs text-high">{exportError}</p>}

      {isLoading && <p className="mt-3 text-xs text-muted">Loading previous exports…</p>}
      {exports && exports.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Your data exports">
          {exports.slice(0, 3).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-muted/70 px-3 py-2 text-sm">
              <span>
                Requested {relativeTime(e.requested_at)}
                {e.status === "ready" && e.expires_at && (
                  <span className="block text-xs text-muted">Available until {formatDate(e.expires_at)}</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", EXPORT_STATUS[e.status].className)}>
                  {EXPORT_STATUS[e.status].label}
                </span>
                {e.status === "ready" && (
                  <Button size="sm" variant="ghost" disabled title="Download is available once connected to the Albo service">
                    <Download /> Download
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 border-t border-line pt-5">
        {deletion ? (
          <StateBlock
            kind="limited"
            title="Deletion requested"
            description={`Your account is suspended. It will be deleted on ${formatDate(deletion.grace_period_ends_at)} unless you contact support before then.`}
            className="py-4"
          />
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              Deleting your account suspends it straight away. After a 30-day grace period your information is erased, except where the law requires us to keep it.
            </p>
            <Button variant="ghost" className="mt-3 text-high hover:bg-high-bg" onClick={() => setDialogOpen(true)}>
              <Trash2 /> Request account deletion
            </Button>
          </>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setConfirmText("");
        }}
        title="Delete your Albo account?"
        description="This can't be undone after the grace period ends."
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>You&apos;ll be signed out and your account suspended immediately.</li>
          <li>Providers lose access to your information.</li>
          <li>After 30 days, your inputs, indicators, reports and consents are erased.</li>
          <li>Consider requesting a data export first.</li>
        </ul>
        <div className="mt-5">
          <Field id="confirm-delete" label={`Type ${CONFIRM_WORD} to confirm`}>
            <input
              id="confirm-delete"
              className={inputClass}
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </Field>
        </div>
        {requestDeletion.isError && (
          <p role="alert" className="mt-3 text-sm text-high">We couldn&apos;t submit the request. Please try again.</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDialogOpen(false)}>Keep my account</Button>
          <Button
            className="bg-high hover:bg-high/90"
            disabled={confirmText !== CONFIRM_WORD || requestDeletion.isPending}
            onClick={confirmDeletion}
          >
            {requestDeletion.isPending ? "Submitting…" : "Delete account"}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
