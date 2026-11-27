import { cn, freshness, relativeTime } from "@/lib/format";
import type { RiskAssessment, RiskLevel, RiskStatus } from "@/lib/api/types";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Info,
  Loader2,
  Lock,
  ShieldAlert,
  WifiOff,
} from "lucide-react";

/* ----------------------------- Risk level badge ---------------------------- */

interface LevelPresentation {
  label: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Maps a risk result to its visual presentation. A `limited` or `failed`
 * result is NEVER shown as low risk (ADR-003, ADR-014) and always uses neutral
 * styling. Colour is always paired with an icon and a text label (NFR-011).
 */
export function riskPresentation(status: RiskStatus, level: RiskLevel | null): LevelPresentation {
  if (status === "limited") return { label: "Limited information", className: "bg-neutral-bg text-neutral", icon: CircleDashed };
  if (status === "failed" || level === null) return { label: "Unavailable", className: "bg-neutral-bg text-neutral", icon: AlertCircle };
  switch (level) {
    case "high":
      return { label: "Elevated indicator", className: "bg-high-bg text-high", icon: AlertTriangle };
    case "moderate":
      return { label: "Moderate indicator", className: "bg-moderate-bg text-moderate", icon: AlertTriangle };
    case "low":
      return { label: "Low indicator", className: "bg-low-bg text-low", icon: CheckCircle2 };
  }
}

export function RiskLevelBadge({ assessment, className }: { assessment: Pick<RiskAssessment, "status" | "level">; className?: string }) {
  const p = riskPresentation(assessment.status, assessment.level);
  const Icon = p.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", p.className, className)}>
      <Icon className="size-3.5" aria-hidden />
      {p.label}
    </span>
  );
}

export function RiskLevelIcon({ assessment }: { assessment: Pick<RiskAssessment, "status" | "level"> }) {
  const p = riskPresentation(assessment.status, assessment.level);
  const Icon = p.icon;
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", p.className)}>
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{p.label}</span>
    </span>
  );
}

/* ---------------------------- Not-a-diagnosis note ------------------------- */

export function NotDiagnosisNotice({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-xl bg-accent-50 px-3 py-2.5 text-xs text-ink-soft", className)}>
      <Info className="mt-0.5 size-3.5 shrink-0 text-accent-600" aria-hidden />
      {compact
        ? "Preventive indicator, not a diagnosis."
        : "Albo indicators are preventive estimates based on the information available. They are not a diagnosis and do not replace a qualified health worker."}
    </p>
  );
}

/* ------------------------------- Freshness tag ----------------------------- */

export function FreshnessTag({ observedAt, maxAgeHours }: { observedAt: string; maxAgeHours: number }) {
  const f = freshness(observedAt, maxAgeHours);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium",
        f.isStale ? "text-moderate" : "text-muted",
      )}
    >
      <Clock className="size-3" aria-hidden />
      {f.isStale ? "Out of date" : `${f.daysLeft} days left`}
    </span>
  );
}

export function SourceLine({ source, at }: { source: string; at: string }) {
  return (
    <p className="text-[11px] text-muted">
      Source: {source} · updated {relativeTime(at)}
    </p>
  );
}

/* ------------------------------ Reusable states ---------------------------- */

type StateKind = "loading" | "empty" | "error" | "unavailable" | "unauthorized" | "offline" | "limited";

const STATE_ICON: Record<StateKind, React.ComponentType<{ className?: string }>> = {
  loading: Loader2,
  empty: CircleDashed,
  error: AlertCircle,
  unavailable: WifiOff,
  unauthorized: Lock,
  offline: WifiOff,
  limited: ShieldAlert,
};

/** Implements UI_UX §14 reusable interface states. */
export function StateBlock({
  kind,
  title,
  description,
  action,
  className,
}: {
  kind: StateKind;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = STATE_ICON[kind];
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-8 text-center", className)}
    >
      <Icon className={cn("size-6 text-muted", kind === "loading" && "animate-spin")} aria-hidden />
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-muted", className)} aria-hidden />;
}

/* -------------------------------- Page header ------------------------------ */

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* --------------------------------- Stat card ------------------------------- */

export function StatCard({
  icon,
  label,
  value,
  foot,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface/85 p-5 shadow-[var(--shadow-card)]">
      <p className="flex items-center gap-2 text-sm text-muted [&>svg]:size-4">
        {icon}
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="text-4xl font-semibold tracking-tight">{value}</span>
        {foot && <span className="pb-1 text-xs text-muted">{foot}</span>}
      </div>
    </div>
  );
}
