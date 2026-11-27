"use client";

import { useFeatures } from "@/lib/api/hooks";
import { cn } from "@/lib/format";
import {
  BarChart3,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  MapPin,
  MessageCircle,
  Settings,
  ShieldCheck,
  SmilePlus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  flag?: "checkins" | "assistant";
}

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/health-inputs", label: "My health inputs", icon: HeartPulse },
  { href: "/risk", label: "Risk indicators", icon: BarChart3 },
  { href: "/check-ins", label: "Check-ins", icon: SmilePlus, flag: "checkins" },
  { href: "/care", label: "Find care", icon: MapPin },
  { href: "/referrals", label: "Referrals & visits", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/assistant", label: "Assistant", icon: MessageCircle, flag: "assistant" },
];

const FOOT_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings/consent", label: "Consent & privacy", icon: ShieldCheck },
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

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: features } = useFeatures();
  const visible = MAIN_NAV.filter((i) => !i.flag || features?.[i.flag]);

  const isActive = (href: string) =>
    href === "/settings" ? pathname === "/settings" || pathname === "/settings/notifications" : pathname === href || pathname.startsWith(`${href}/`);

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm text-muted transition-colors hover:text-ink",
            active && "bg-surface font-medium text-ink shadow-[var(--shadow-card)]",
          )}
        >
          <Icon className={cn("size-[18px]", active ? "text-ink" : "text-muted")} />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Main" className="flex h-full flex-col px-4 py-6">
      <Logo className="mb-10 px-3" />
      <ul className="space-y-1">{visible.map(renderItem)}</ul>
      <ul className="mt-auto space-y-1 pt-6">
        {FOOT_NAV.map(renderItem)}
        <li>
          <Link
            href="/sign-in"
            className="flex items-center gap-3 rounded-full px-4 py-2.5 text-sm text-muted transition-colors hover:text-ink"
          >
            <LogOut className="size-[18px]" />
            Log out
          </Link>
        </li>
      </ul>
    </nav>
  );
}
