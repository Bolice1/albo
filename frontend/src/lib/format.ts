import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HOUR = 3_600_000;

export interface Freshness {
  /** 0..1 share of the freshness window still remaining. */
  remaining: number;
  daysLeft: number;
  isStale: boolean;
}

/**
 * Presentation-only freshness of an input relative to its window.
 * The backend decides whether an assessment is `limited`; this only helps the
 * user see how recent their information is (UI_UX §6, §14 "Stale").
 */
export function freshness(observedAt: string, maxAgeHours: number, now: Date = new Date()): Freshness {
  const ageHours = Math.max(0, (now.getTime() - new Date(observedAt).getTime()) / HOUR);
  const leftHours = maxAgeHours - ageHours;
  return {
    remaining: Math.min(1, Math.max(0, leftHours / maxAgeHours)),
    daysLeft: Math.max(0, Math.floor(leftHours / 24)),
    isStale: leftHours <= 0,
  };
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-GB", opts).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function formatUseCaseLabel(code: string): string {
  const labels: Record<string, string> = {
    lifestyle_ncd_preventive: "Lifestyle & long-term conditions",
  };
  return labels[code] ?? code.replace(/_/g, " ");
}
