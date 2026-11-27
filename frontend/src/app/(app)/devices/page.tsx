"use client";

import { PageHeader, Skeleton } from "@/components/domain";
import { FeatureGate, PreviewBanner } from "@/components/domain/gated";
import { Button, Card, CardHeader } from "@/components/ui/primitives";
import { useDeviceSources } from "@/lib/api/hooks";
import { cn } from "@/lib/format";
import { CheckCircle2, Plug, ShieldCheck, Watch } from "lucide-react";

export default function DevicesPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Connected devices" description="Bring in steps, sleep and activity from apps you already use." />
      <FeatureGate flag="later_previews" name="Device connections">
        <PreviewBanner phase="later">
          Device connections are planned for a later phase (FR-010). Nothing is connected or imported in this preview.
        </PreviewBanner>
        <DevicesContent />
      </FeatureGate>
    </div>
  );
}

function DevicesContent() {
  const { data, isLoading } = useDeviceSources();
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="grid gap-4 sm:grid-cols-2">
        {isLoading && <Skeleton className="h-48 sm:col-span-2" />}
        {data?.map((d) => (
          <Card key={d.code} className="flex flex-col">
            <div className="flex items-start justify-between">
              <span className="grid size-12 place-items-center rounded-2xl bg-accent-100 text-accent-600">
                <Watch className="size-5" aria-hidden />
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium",
                  d.status === "planned" ? "bg-accent-50 text-accent-600" : "bg-neutral-bg text-neutral",
                )}
              >
                {d.status === "planned" ? "Planned" : "Not available"}
              </span>
            </div>
            <h2 className="mt-4 font-semibold">{d.name}</h2>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {d.data_types.map((t) => (
                <li key={t} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-ink-soft">{t}</li>
              ))}
            </ul>
            <Button variant="secondary" className="mt-5" disabled>
              <Plug /> Connect
            </Button>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader icon={<ShieldCheck />} title="How connections will work" />
        <ul className="space-y-3 text-sm text-ink-soft">
          {[
            "You choose each app and each type of data. Nothing is imported automatically.",
            "Imported data is labelled “Imported” so you can tell it apart from what you entered.",
            "You can disconnect at any time. Albo stops importing straight away.",
            "Albo never shares imported data with other apps.",
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent-500" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
