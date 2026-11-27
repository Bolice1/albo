"use client";

import { IconButton } from "@/components/ui/primitives";
import { useMarkNotificationRead, useMe, useNotifications } from "@/lib/api/hooks";
import { relativeTime } from "@/lib/format";
import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { data: me } = useMe();
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = notifications?.filter((n) => !n.read_at).length ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const initials = me?.display_name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);

  return (
    <header className="flex items-center gap-3 py-4">
      <IconButton label="Open menu" className="lg:hidden" onClick={onOpenMenu}>
        <Menu />
      </IconButton>

      <form role="search" className="relative w-full max-w-md" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="global-search" className="sr-only">
          Search Albo
        </label>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id="global-search"
          ref={searchRef}
          placeholder="Search"
          className="h-11 w-full rounded-full bg-surface/90 pl-11 pr-16 text-sm shadow-[var(--shadow-card)] placeholder:text-muted focus:outline-none focus:ring-4 focus:ring-accent-100"
        />
        <kbd className="absolute right-4 top-1/2 hidden -translate-y-1/2 text-xs text-muted sm:block">⌘ K</kbd>
      </form>

      <div className="ml-auto flex items-center gap-3">
        <div className="relative" ref={panelRef}>
          <IconButton
            label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <Bell />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-high text-[10px] font-semibold text-white">
                {unread}
              </span>
            )}
          </IconButton>
          {open && (
            <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl bg-surface p-2 shadow-[var(--shadow-pop)]">
              <p className="px-3 py-2 text-xs font-medium text-muted">Notifications</p>
              {!notifications?.length && <p className="px-3 py-4 text-sm text-muted">You have no notifications.</p>}
              <ul>
                {notifications?.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => !n.read_at && markRead.mutate(n.id)}
                      className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-surface-muted"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {!n.read_at && <span className="size-2 rounded-full bg-accent-500" aria-label="Unread" />}
                        {n.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-muted">{relativeTime(n.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button type="button" className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 hover:bg-surface/60">
          <span className="grid size-10 place-items-center rounded-full bg-accent-200 text-sm font-semibold text-accent-600">
            {initials}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight">{me?.display_name ?? "…"}</span>
            <span className="block text-xs text-muted">@{me?.handle ?? ""}</span>
          </span>
          <ChevronDown className="size-4 text-muted" aria-hidden />
        </button>
      </div>
    </header>
  );
}
