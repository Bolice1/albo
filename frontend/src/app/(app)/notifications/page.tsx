"use client";

import { PageHeader, Skeleton, StateBlock } from "@/components/domain";
import { Button, ButtonLink, Card, Segmented } from "@/components/ui/primitives";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/lib/api/hooks";
import type { NotificationItem } from "@/lib/api/types";
import { cn, relativeTime } from "@/lib/format";
import { Bell, CheckCheck, FileText, Info, Settings, ShieldAlert } from "lucide-react";
import { useState } from "react";

const CATEGORY: Record<NotificationItem["category"], { label: string; icon: React.ReactNode; className: string }> = {
  safety: { label: "Safety", icon: <ShieldAlert />, className: "bg-high-bg text-high" },
  reminder: { label: "Reminder", icon: <Bell />, className: "bg-moderate-bg text-moderate" },
  report: { label: "Report", icon: <FileText />, className: "bg-accent-100 text-accent-600" },
  system: { label: "Update", icon: <Info />, className: "bg-neutral-bg text-neutral" },
};

export default function NotificationsPage() {
  const { data, isLoading, isError } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const unread = data?.filter((n) => !n.read_at) ?? [];
  const shown = filter === "unread" ? unread : (data ?? []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Reminders and updates about your inputs, indicators, reports and referrals."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/settings/notifications" variant="secondary"><Settings /> Preferences</ButtonLink>
            <Button onClick={() => markAll.mutate()} disabled={!unread.length || markAll.isPending}>
              <CheckCheck /> Mark all read
            </Button>
          </div>
        }
      />
      <Card>
        <div className="mb-4">
          <Segmented
            label="Filter notifications"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: data?.length },
              { value: "unread", label: "Unread", count: unread.length },
            ]}
          />
        </div>
        {isLoading && <Skeleton className="h-60" />}
        {isError && <StateBlock kind="unavailable" title="Notifications are unavailable" description="Please try again shortly." />}
        {!isLoading && !isError && shown.length === 0 && (
          <StateBlock
            kind="empty"
            title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
            description="We'll show reminders and updates here."
          />
        )}
        <ul className="space-y-2">
          {shown.map((n) => {
            const c = CATEGORY[n.category];
            return (
              <li
                key={n.id}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-4",
                  n.read_at ? "border-line bg-surface-muted/50" : "border-accent-200 bg-accent-50/70",
                )}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-full [&>svg]:size-4", c.className)} aria-hidden>
                  {c.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {n.title}
                    <span className="text-[11px] font-normal text-muted">{c.label}</span>
                    {!n.read_at && <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-semibold text-white">New</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{relativeTime(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <Button variant="ghost" size="sm" onClick={() => markRead.mutate(n.id)}>
                    Mark read
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
