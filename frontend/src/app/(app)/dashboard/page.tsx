"use client";

import {
  NotDiagnosisNotice,
  RiskLevelIcon,
  Skeleton,
  SourceLine,
  StateBlock,
} from "@/components/domain";
import { ButtonLink, Card, CardHeader, Progress } from "@/components/ui/primitives";
import {
  useActivity,
  useEnvironment,
  useHealthInputs,
  useMe,
  useNotifications,
  useReferrals,
  useRiskAssessments,
  useTrends,
} from "@/lib/api/hooks";
import type { ActivityEvent, Referral } from "@/lib/api/types";
import { cn, formatDate, formatUseCaseLabel, freshness, greeting, relativeTime } from "@/lib/format";
import { HEALTH_FIELDS, PRIMARY_FIELD_CODES, fieldLabel } from "@/lib/health-fields";
import {
  Activity,
  BellRing,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  HeartPulse,
  MapPin,
  Plus,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function DashboardPage() {
  const { data: me } = useMe();
  const { data: notifications } = useNotifications();
  const actionNotice = notifications?.find((n) => !n.read_at && (n.category === "safety" || n.category === "reminder"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {greeting()}, {me?.display_name.split(" ")[0] ?? "there"}
        </h1>
        <ButtonLink href="/health-inputs?add=1" size="lg">
          <Plus /> Add health input
        </ButtonLink>
      </div>

      {actionNotice && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-moderate/20 bg-moderate-bg px-4 py-3 text-sm">
          <BellRing className="mt-0.5 size-4 shrink-0 text-moderate" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">{actionNotice.title}</p>
            <p className="text-ink-soft">{actionNotice.body}</p>
          </div>
          <Link href="/health-inputs" className="shrink-0 font-medium text-ink underline-offset-4 hover:underline">
            Update
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid gap-5">
          <InputsHeroCard />
          <WeeklyTrendCard />
        </div>
        <ReferralsCard />
        <RiskSummaryCard />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <ActivityTimelineCard className="lg:col-span-2" />
        <EnvironmentCard />
      </div>
    </div>
  );
}

/* ------------------------------ Inputs hero ------------------------------- */

function InputsHeroCard() {
  const { data, isLoading } = useHealthInputs();
  const total = PRIMARY_FIELD_CODES.length;
  const fresh = PRIMARY_FIELD_CODES.filter((code) => {
    const input = data?.find((i) => i.field_code === code);
    return input && !freshness(input.observed_at, HEALTH_FIELDS[code].maxAgeHours).isStale;
  }).length;
  const nextDue = data
    ?.map((i) => ({ i, f: freshness(i.observed_at, HEALTH_FIELDS[i.field_code]?.maxAgeHours ?? 720) }))
    .sort((a, b) => a.f.remaining - b.f.remaining)[0];

  return (
    <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-accent-300 via-accent-400 to-accent-500 p-5 text-white shadow-[var(--shadow-card)]">
      <header className="flex items-center justify-between text-sm text-white/85">
        <h2 className="flex items-center gap-2 font-medium">
          <HeartPulse className="size-4" aria-hidden /> Inputs up to date
        </h2>
        {nextDue && (
          <span className="text-right text-xs leading-tight">
            {fieldLabel(nextDue.i.field_code)}
            <br />
            <span className="text-white/70">{nextDue.f.isStale ? "out of date" : `due in ${nextDue.f.daysLeft} d`}</span>
          </span>
        )}
      </header>
      {isLoading ? (
        <Skeleton className="mt-4 h-12 w-32 bg-white/30" />
      ) : (
        <p className="mt-3 text-5xl font-semibold tracking-tight">
          {fresh}
          <span className="text-2xl font-normal text-white/80"> / {total} inputs</span>
        </p>
      )}
      <Progress value={total ? fresh / total : 0} tone="white" label="Share of inputs up to date" className="mt-4 bg-white/20 [background-image:repeating-linear-gradient(-45deg,rgb(255_255_255/0.25)_0_4px,transparent_4px_8px)]" />
    </section>
  );
}

/* ------------------------------ Weekly trend ------------------------------ */

function WeeklyTrendCard() {
  const { data, isLoading, isError } = useTrends();
  const series = data?.find((s) => s.field_code === "physical_activity_minutes_per_week");
  const max = Math.max(1, ...(series?.points.map((p) => p.value ?? 0) ?? [1]));
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader icon={<Activity />} title="Weekly activity" action={<span className="text-xs text-muted">Self-reported</span>} />
      {isLoading && <Skeleton className="h-28" />}
      {isError && <StateBlock kind="unavailable" title="Trend unavailable" className="py-4" />}
      {series && (
        <>
          <ul className="flex h-28 items-end justify-between gap-2" aria-label="Active minutes per day, last 7 days">
            {series.points.map((p) => {
              const isToday = p.date === todayKey;
              const day = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(p.date));
              return (
                <li key={p.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-20 w-full items-end">
                    {p.value === null ? (
                      <div className="hatched h-full w-full rounded-full" title={`${day}: no data`} />
                    ) : (
                      <div
                        className={cn("w-full rounded-full", isToday ? "bg-accent-400" : "bg-surface-muted border border-line")}
                        style={{ height: `${Math.max(12, (p.value / max) * 100)}%` }}
                        title={`${day}: ${p.value} min`}
                      />
                    )}
                  </div>
                  <span className={cn("text-[11px]", isToday ? "font-semibold text-ink" : "text-muted")}>{day}</span>
                  <span className="sr-only">{p.value === null ? "no data" : `${p.value} minutes`}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

/* -------------------------------- Referrals ------------------------------- */

function ReferralsCard() {
  const { data, isLoading } = useReferrals();
  const [offset, setOffset] = useState(0);
  const days = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 3 + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [offset]);
  const today = new Date().toDateString();
  const upcoming = data?.filter((r) => r.status !== "cancelled" && r.status !== "completed") ?? [];

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<CalendarDays />}
        title="Referrals & visits"
        action={
          <div className="flex gap-1">
            <button type="button" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)} className="rounded-full p-1.5 text-muted hover:bg-surface-muted">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" aria-label="Next week" onClick={() => setOffset((o) => o + 1)} className="rounded-full p-1.5 text-muted hover:bg-surface-muted">
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />
      <ol className="mb-4 grid grid-cols-7 text-center">
        {days.map((d) => {
          const isToday = d.toDateString() === today;
          const hasItem = upcoming.some((r) => r.preferred_date && new Date(r.preferred_date).toDateString() === d.toDateString());
          return (
            <li key={d.toISOString()} className="flex flex-col items-center gap-1">
              <span className="text-[11px] text-muted">{new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(d).slice(0, 2)}</span>
              <span
                className={cn(
                  "relative grid size-9 place-items-center rounded-full text-sm",
                  isToday && "border-2 border-accent-400 font-semibold",
                )}
                aria-current={isToday ? "date" : undefined}
              >
                {d.getDate()}
                {hasItem && <span className="absolute -bottom-1 size-1.5 rounded-full bg-accent-500" aria-label="Planned visit" />}
              </span>
            </li>
          );
        })}
      </ol>
      {isLoading && <Skeleton className="h-36" />}
      {!isLoading && upcoming.length === 0 && (
        <StateBlock
          kind="empty"
          title="No referrals or visit requests"
          description="Find a facility and send a contact request when you need one."
          action={<ButtonLink href="/care" variant="secondary" size="sm">Find care</ButtonLink>}
        />
      )}
      <ul className="space-y-3">
        {upcoming.slice(0, 2).map((r, idx) => (
          <ReferralRow key={r.id} referral={r} muted={idx > 0} />
        ))}
      </ul>
    </Card>
  );
}

const REFERRAL_STATUS: Record<Referral["status"], string> = {
  requested: "Requested",
  acknowledged: "Acknowledged",
  completed: "Completed",
  cancelled: "Cancelled",
};

function ReferralRow({ referral, muted }: { referral: Referral; muted?: boolean }) {
  return (
    <li className={cn("rounded-2xl border border-line bg-surface-muted/70 p-4", muted && "opacity-70")}>
      <p className="text-[11px] text-muted">
        {referral.preferred_date ? `Preferred ${formatDate(referral.preferred_date, { weekday: "short", day: "numeric", month: "long" })}` : "No preferred date"}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-accent-100 text-accent-600">
          <MapPin className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{referral.reason_category}</p>
          <p className="truncate text-xs text-muted">{referral.facility_name}</p>
        </div>
        <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-soft">{REFERRAL_STATUS[referral.status]}</span>
      </div>
    </li>
  );
}

/* ------------------------------ Risk summary ------------------------------ */

function RiskSummaryCard() {
  const { data, isLoading, isError } = useRiskAssessments();
  // Latest assessment per use case.
  const latest = useMemo(() => {
    const seen = new Set<string>();
    return (data ?? []).filter((a) => (seen.has(a.use_case) ? false : (seen.add(a.use_case), true)));
  }, [data]);

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<TriangleAlert />}
        title="Risk indicators"
        action={<ButtonLink href="/risk" variant="secondary" size="sm">View all</ButtonLink>}
      />
      {isLoading && <Skeleton className="h-40" />}
      {isError && <StateBlock kind="error" title="We couldn't load your indicators" description="Please try again shortly." />}
      {!isLoading && !isError && latest.length === 0 && (
        <StateBlock
          kind="empty"
          title="No current indicator available"
          description="Add your health inputs so Albo can calculate a preventive indicator. No indicator does not mean no risk."
        />
      )}
      <ul className="space-y-3">
        {latest.map((a) => (
          <li key={a.id}>
            <Link href={`/risk/${a.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-muted/70 p-3.5 transition-colors hover:bg-accent-50">
              <RiskLevelIcon assessment={a} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{formatUseCaseLabel(a.use_case)}</p>
                <p className="text-xs text-muted">Calculated {relativeTime(a.calculated_at)}</p>
              </div>
              <span className="text-xs font-medium text-ink-soft">Details</span>
            </Link>
          </li>
        ))}
      </ul>
      <NotDiagnosisNotice compact className="mt-auto pt-2.5" />
    </Card>
  );
}

/* ----------------------------- Activity timeline --------------------------- */

const OUTCOME_STYLE: Record<NonNullable<ActivityEvent["outcome"]>, { label: string; className: string }> = {
  done: { label: "Done", className: "text-low" },
  pending: { label: "Pending", className: "text-accent-600" },
  limited: { label: "Needs update", className: "text-moderate" },
};

function ActivityTimelineCard({ className }: { className?: string }) {
  const { data, isLoading } = useActivity();
  const now = new Date();
  const nowPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
  const pct = (iso: string) => {
    const d = new Date(iso);
    return ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100;
  };

  return (
    <Card className={className}>
      <CardHeader
        title={<span className="text-base font-semibold text-ink">Today · {formatDate(now.toISOString(), { weekday: "short", day: "numeric", month: "long" })}</span>}
        action={<span className="text-xs text-muted">Your activity</span>}
      />
      {isLoading && <Skeleton className="h-36" />}
      {data && (
        <>
          {/* Desktop: time axis */}
          <div className="relative hidden h-40 md:block" aria-hidden>
            {data.map((e, i) => (
              <div
                key={e.id}
                className="absolute flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-2xl border border-line bg-surface px-3 py-2 shadow-[var(--shadow-card)]"
                style={{ left: `clamp(70px, ${pct(e.at)}%, calc(100% - 70px))`, top: `${(i % 3) * 44}px` }}
              >
                <div>
                  <p className="text-xs font-medium">{e.label}</p>
                  <p className="text-[11px] text-muted">{e.detail}</p>
                </div>
                {e.outcome && <span className={cn("text-[11px] font-medium", OUTCOME_STYLE[e.outcome].className)}>{OUTCOME_STYLE[e.outcome].label}</span>}
              </div>
            ))}
            <div className="absolute bottom-6 top-0 border-l-2 border-dashed border-ink/60" style={{ left: `${nowPct}%` }} />
          </div>
          <div className="relative hidden md:block" aria-hidden>
            <div className="flex justify-between text-[11px] text-muted">
              {Array.from({ length: 13 }, (_, i) => (
                <span key={i}>{String(i * 2).padStart(2, "0")}:00</span>
              ))}
            </div>
          </div>
          {/* Accessible list (and mobile layout) */}
          <ol className="space-y-2 md:sr-only">
            {data.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-xl border border-line bg-surface-muted/70 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{e.label}</span> <span className="text-muted">· {e.detail}</span>
                </span>
                <span className="text-xs text-muted">
                  {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(e.at))}
                  {e.outcome && ` · ${OUTCOME_STYLE[e.outcome].label}`}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

/* ------------------------------- Environment ------------------------------- */

function EnvironmentCard() {
  const { data, isLoading, error } = useEnvironment();
  return (
    <Card>
      <CardHeader icon={<CloudSun />} title="Environmental context" action={<span className="text-xs text-muted">Area-level</span>} />
      {isLoading && <Skeleton className="h-32" />}
      {error && (
        <StateBlock
          kind="unauthorized"
          title="Environmental context is off"
          description="Turn on “Show environmental context” in Consent & privacy to see area-level weather and air quality."
          action={<ButtonLink href="/settings/consent" variant="secondary" size="sm">Manage consent</ButtonLink>}
        />
      )}
      {data && (
        <ul className="space-y-3">
          {data.map((o) => {
            const stale = Date.now() - new Date(o.observed_at).getTime() > 24 * 3_600_000;
            return (
              <li key={o.id} className="flex items-center justify-between rounded-2xl border border-line bg-surface-muted/70 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{o.label}</p>
                  <SourceLine source={o.source} at={o.observed_at} />
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">
                    {o.value}
                    <span className="ml-0.5 text-xs font-normal text-muted">{o.unit}</span>
                  </p>
                  {stale && <p className="text-[11px] font-medium text-moderate">May be out of date</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
