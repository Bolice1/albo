"use client";

import { PageHeader, Skeleton } from "@/components/domain";
import { FeatureGate, PreviewBanner } from "@/components/domain/gated";
import { Card, CardHeader } from "@/components/ui/primitives";
import { useRegionalIndicators } from "@/lib/api/hooks";
import type { RegionalIndicator } from "@/lib/api/types";
import { cn } from "@/lib/format";
import { EyeOff, Info, Map as MapIcon } from "lucide-react";
import { useMemo, useState } from "react";

export default function RegionalHealthPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Regional health" description="Area-level preventive trends from aggregated, de-identified data." />
      <FeatureGate flag="later_previews" name="The regional health map">
        <PreviewBanner phase="later">
          Regional maps are planned for Phase 2. All numbers here are synthetic. Small areas are hidden so that no one can be identified.
        </PreviewBanner>
        <RegionalContent />
      </FeatureGate>
    </div>
  );
}

const band = (share: number) =>
  share >= 0.25 ? { label: "Higher", dot: "bg-accent-600", ring: "ring-accent-200" } : share >= 0.15 ? { label: "Middle", dot: "bg-accent-400", ring: "ring-accent-100" } : { label: "Lower", dot: "bg-accent-200", ring: "ring-accent-50" };

function RegionalContent() {
  const { data, isLoading } = useRegionalIndicators();
  const [selected, setSelected] = useState<string | null>(null);

  const points = useMemo(() => {
    if (!data?.length) return [];
    const lats = data.map((d) => d.location.lat);
    const lngs = data.map((d) => d.location.lng);
    const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    return data.map((d) => ({
      ...d,
      x: 15 + ((d.location.lng - minLng) / (maxLng - minLng || 1)) * 70,
      y: 15 + ((maxLat - d.location.lat) / (maxLat - minLat || 1)) * 70,
    }));
  }, [data]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <CardHeader icon={<Info />} title="Share of elevated indicators" action={<span className="text-xs text-muted">Synthetic</span>} />
        {isLoading && <Skeleton className="h-48" />}
        <ul className="space-y-2.5">
          {data?.map((d) => (
            <AreaRow key={d.area_code} area={d} active={selected === d.area_code} onSelect={() => setSelected(d.area_code)} />
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-muted">
          Indicators describe groups, not individuals, and are not diagnoses. Areas with too few people are hidden.
        </p>
      </Card>

      <section
        aria-label="Regional map (visual only; the list is the accessible alternative)"
        className="relative min-h-[420px] overflow-hidden rounded-[var(--radius-card)] bg-surface/85 shadow-[var(--shadow-card)]"
      >
        <div
          className="absolute inset-0 opacity-60"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <p className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs text-muted shadow-[var(--shadow-card)]">
          <MapIcon className="size-3.5" aria-hidden /> Demo region
        </p>
        {points.map((p) => {
          const b = p.elevated_share !== null ? band(p.elevated_share) : null;
          const size = p.elevated_share !== null ? 44 + p.elevated_share * 160 : 44;
          return (
            <button
              key={p.area_code}
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setSelected(p.area_code)}
              className={cn(
                "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-xs font-semibold ring-8 transition-transform",
                b ? cn(b.dot, b.ring, "text-white") : "hatched bg-surface-muted text-muted ring-surface",
                selected === p.area_code && "scale-110",
              )}
              style={{ left: `${p.x}%`, top: `${p.y}%`, width: size, height: size }}
            >
              {p.suppressed ? <EyeOff className="size-4" /> : `${Math.round((p.elevated_share ?? 0) * 100)}%`}
            </button>
          );
        })}
        <div className="absolute bottom-4 right-4 flex gap-3 rounded-full bg-surface px-3 py-1.5 text-[11px] text-muted shadow-[var(--shadow-card)]" aria-hidden>
          {["Lower", "Middle", "Higher"].map((l, i) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", ["bg-accent-200", "bg-accent-400", "bg-accent-600"][i])} /> {l}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function AreaRow({ area, active, onSelect }: { area: RegionalIndicator; active: boolean; onSelect: () => void }) {
  const b = area.elevated_share !== null ? band(area.elevated_share) : null;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
          active ? "border-accent-300 bg-accent-50" : "border-line bg-surface-muted/70 hover:bg-accent-50/60",
        )}
      >
        <span className={cn("size-3 shrink-0 rounded-full", b?.dot ?? "hatched bg-surface-muted")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{area.area_name}</span>
          <span className="block text-[11px] text-muted">Population {area.population_band}</span>
        </span>
        <span className="text-right text-sm font-semibold">
          {area.suppressed ? (
            <span className="text-xs font-normal text-muted">Hidden (small area)</span>
          ) : (
            <>
              {Math.round((area.elevated_share ?? 0) * 100)}%
              <span className="block text-[11px] font-normal text-muted">{b?.label}</span>
            </>
          )}
        </span>
      </button>
    </li>
  );
}
