"use client";

import type { Facility } from "@/lib/api/types";
import { cn, relativeTime } from "@/lib/format";
import { Navigation, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

/**
 * Vendor-neutral map preview. The real map/tiles provider is still an open
 * decision (OPEN-010), so this renders an offline stylised canvas and projects
 * facility coordinates into it. The facility list is always the accessible
 * alternative (UI_UX §11, §16).
 */
export function FacilityMap({
  facilities,
  selectedId,
  onSelect,
}: {
  facilities: Facility[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const bounds = useMemo(() => {
    const lats = facilities.map((f) => f.location.lat);
    const lngs = facilities.map((f) => f.location.lng);
    const pad = 0.01;
    return {
      minLat: Math.min(...lats, -1.99) - pad,
      maxLat: Math.max(...lats, -1.9) + pad,
      minLng: Math.min(...lngs, 30.03) - pad,
      maxLng: Math.max(...lngs, 30.13) + pad,
    };
  }, [facilities]);

  const project = (f: Facility) => ({
    x: ((f.location.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100,
    y: ((bounds.maxLat - f.location.lat) / (bounds.maxLat - bounds.minLat)) * 100,
  });

  const selected = facilities.find((f) => f.id === selectedId);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-[var(--radius-card)] bg-[#f3f4f8]" aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <defs>
          <pattern id="blocks" width="9" height="7" patternUnits="userSpaceOnUse">
            <rect width="9" height="7" fill="#f3f4f8" />
            <rect x="0.6" y="0.6" width="7.8" height="5.8" rx="0.6" fill="#eceef4" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#blocks)" />
        <path d="M-5 70 C 20 60, 35 75, 55 58 S 85 40, 105 46" stroke="#ffffff" strokeWidth="2.2" fill="none" />
        <path d="M30 -5 C 34 25, 26 45, 40 70 S 48 95, 46 105" stroke="#ffffff" strokeWidth="1.8" fill="none" />
        <path d="M-5 25 C 25 30, 60 18, 105 22" stroke="#ffffff" strokeWidth="1.4" fill="none" />
        <path d="M70 -5 C 66 30, 80 60, 72 105" stroke="#ffffff" strokeWidth="1.4" fill="none" />
        <path d="M55 82 C 65 78, 75 88, 90 80" stroke="#dfe7f5" strokeWidth="4" fill="none" strokeLinecap="round" />
      </svg>

      {facilities.map((f) => {
        const p = project(f);
        const active = f.id === selectedId;
        return (
          <button
            key={f.id}
            type="button"
            tabIndex={-1}
            onClick={() => onSelect(active ? null : f.id)}
            className={cn(
              "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white/70 bg-accent-400 shadow-lg transition-all",
              active ? "z-10 size-7 bg-ink" : "size-5 hover:scale-110",
            )}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            title={f.name}
          />
        );
      })}

      {selected && (
        <div
          className="absolute z-20 w-64 -translate-x-1/2 -translate-y-[calc(100%+22px)] overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-pop)]"
          style={{
            left: `clamp(140px, ${project(selected).x}%, calc(100% - 140px))`,
            top: `max(${project(selected).y}%, 230px)`,
          }}
        >
          <div className="h-16 bg-gradient-to-br from-accent-200 to-accent-400" />
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold leading-tight">{selected.name}</p>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium">
                <ShieldCheck className="size-3 text-low" /> Verified
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">{selected.type}</p>
            <p className="mt-2 text-[11px] text-muted">
              {selected.services.slice(0, 2).join(" · ")} · checked {relativeTime(selected.last_verified_at)}
            </p>
          </div>
        </div>
      )}

      <p className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1 text-[11px] text-muted">
        <Navigation className="size-3" /> Map preview · approximate positions
      </p>
    </div>
  );
}
