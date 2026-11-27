"use client";

import { useFeatures } from "@/lib/api/hooks";
import type { FeatureFlags } from "@/lib/api/types";
import { cn } from "@/lib/format";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Settings,
  ShieldCheck,
  SmilePlus,
  Stethoscope,
  Users,
  Watch,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Icon = React.ComponentType<{ className?: string }>;

interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  flag?: keyof FeatureFlags;
}

interface NavGroup {
  id: string;
  label: string;
  icon: Icon;
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;
const isGroup = (e: NavEntry): e is NavGroup => "items" in e;

/** Grouped so the sidebar fits on screen without scrolling. One group opens at a time. */
const MAIN_NAV: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  {
    id: "health",
    label: "My health",
    icon: HeartPulse,
    items: [
      { href: "/health-inputs", label: "Health inputs", icon: HeartPulse },
      { href: "/risk", label: "Risk indicators", icon: BarChart3 },
      { href: "/check-ins", label: "Check-ins", icon: SmilePlus, flag: "checkins" },
    ],
  },
  {
    id: "care",
    label: "Care",
    icon: MapPin,
    items: [
      { href: "/care", label: "Find care", icon: MapPin },
      { href: "/referrals", label: "Referrals & visits", icon: ClipboardList },
      { href: "/consultations", label: "Consultations", icon: Stethoscope, flag: "consultations" },
    ],
  },
  { href: "/assistant", label: "Assistant", icon: MessageCircle, flag: "assistant" },
  { href: "/reports", label: "Reports", icon: FileText },
  {
    id: "provider",
    label: "Provider",
    icon: Users,
    items: [{ href: "/provider", label: "Assigned people", icon: Users, flag: "provider_portal" }],
  },
  {
    id: "later",
    label: "Coming later",
    icon: FlaskConical,
    items: [
      { href: "/devices", label: "Devices", icon: Watch, flag: "later_previews" },
      { href: "/regional-health", label: "Regional health", icon: MapIcon, flag: "later_previews" },
    ],
  },
];

const FOOT_NAV: NavEntry[] = [
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    items: [
      { href: "/settings", label: "Profile & account", icon: Settings },
      { href: "/settings/consent", label: "Consent & privacy", icon: ShieldCheck },
      { href: "/settings/notifications", label: "Notifications", icon: Bell },
    ],
  },
  { href: "/support", label: "Support", icon: LifeBuoy },
];

export function Logo({ className, href = "/dashboard" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 text-lg font-bold tracking-tight", className)}>
      <Image src="/albo-mark.png" alt="" width={342} height={226} priority className="h-7 w-auto" />
      Albo
    </Link>
  );
}

const itemClass = "flex items-center gap-3 rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-ink";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: features } = useFeatures();

  const isActive = (href: string) =>
    href === "/settings" ? pathname === "/settings" : pathname === href || pathname.startsWith(`${href}/`);

  const allowed = (i: NavItem) => !i.flag || !!features?.[i.flag];
  const filter = (entries: NavEntry[]) =>
    entries
      .map((e) => (isGroup(e) ? { ...e, items: e.items.filter(allowed) } : e))
      .filter((e) => (isGroup(e) ? e.items.length > 0 : allowed(e)));

  const main = filter(MAIN_NAV);
  const foot = filter(FOOT_NAV);
  const activeGroup =
    [...main, ...foot].filter(isGroup).find((g) => g.items.some((i) => isActive(i.href)))?.id ?? null;
  const [open, setOpen] = useState<string | null>(activeGroup);

  // Open the section that contains the current page when navigating.
  useEffect(() => {
    if (activeGroup) setOpen(activeGroup);
  }, [activeGroup]);

  const renderLink = (item: NavItem, nested = false) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(itemClass, nested && "py-1.5 pl-11", active && "bg-surface font-medium text-ink shadow-[var(--shadow-card)]")}
        >
          {!nested && <Icon className={cn("size-[18px]", active ? "text-ink" : "text-muted")} />}
          {item.label}
        </Link>
      </li>
    );
  };

  const renderEntry = (entry: NavEntry) => {
    if (!isGroup(entry)) return renderLink(entry);
    const expanded = open === entry.id;
    const containsActive = activeGroup === entry.id;
    const Icon = entry.icon;
    const panelId = `nav-group-${entry.id}`;
    return (
      <li key={entry.id}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setOpen(expanded ? null : entry.id)}
          className={cn(itemClass, "w-full", containsActive && "text-ink")}
        >
          <Icon className={cn("size-[18px]", containsActive ? "text-ink" : "text-muted")} />
          <span className={cn("flex-1 text-left", containsActive && "font-medium")}>{entry.label}</span>
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
        <div
          id={panelId}
          className={cn("grid transition-[grid-template-rows] duration-200", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
        >
          <ul className="space-y-0.5 overflow-hidden pt-0.5" inert={!expanded}>
            {entry.items.map((i) => renderLink(i, true))}
          </ul>
        </div>
      </li>
    );
  };

  return (
    <nav aria-label="Main" className="flex h-full flex-col px-4 py-6">
      <Logo className="mb-6 px-3" />
      <ul className="space-y-0.5">{main.map(renderEntry)}</ul>
      <ul className="mt-auto space-y-0.5 pt-4">
        {foot.map(renderEntry)}
        <li>
          <Link href="/sign-in" onClick={onNavigate} className={itemClass}>
            <LogOut className="size-[18px]" />
            Log out
          </Link>
        </li>
      </ul>
    </nav>
  );
}
