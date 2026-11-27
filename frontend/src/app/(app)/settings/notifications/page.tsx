"use client";

import { PageHeader, Skeleton, StateBlock } from "@/components/domain";
import { FormAlert } from "@/components/auth/password-input";
import { Button, ButtonLink, Card, CardHeader, Field, inputClass } from "@/components/ui/primitives";
import { ApiRequestError } from "@/lib/api/client";
import { useConsents, useFeatures, useNotificationPreferences, useUpdateNotificationPreferences } from "@/lib/api/hooks";
import type { NotificationCategoryCode, NotificationPreferences } from "@/lib/api/types";
import { cn } from "@/lib/format";
import { Bell, Inbox, Mail, MessageSquare, Moon, ShieldAlert, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

type Draft = Omit<NotificationPreferences, "updated_at">;
type ChannelKey = "in_app_enabled" | "email_enabled" | "sms_enabled" | "push_enabled";

const CHANNELS: { key: ChannelKey; label: string; body: string; icon: React.ReactNode; external: boolean }[] = [
  { key: "in_app_enabled", label: "In Albo", body: "Shown in your notification inbox when you sign in.", icon: <Inbox />, external: false },
  { key: "email_enabled", label: "Email", body: "Short message without health details.", icon: <Mail />, external: true },
  { key: "sms_enabled", label: "SMS", body: "Short message without health details.", icon: <MessageSquare />, external: true },
  { key: "push_enabled", label: "Push", body: "Device notification without health details.", icon: <Smartphone />, external: true },
];

const CATEGORIES: { code: NotificationCategoryCode; label: string; body: string; flag?: "checkins" | "provider_portal" }[] = [
  { code: "risk_indicator_update", label: "Indicator updates", body: "When a preventive indicator is recalculated." },
  { code: "report_ready", label: "Report ready", body: "When a report you requested is ready to download." },
  { code: "referral_status_update", label: "Referral updates", body: "When a facility responds to your contact request." },
  { code: "preventive_checkin_reminder", label: "Check-in reminders", body: "Gentle reminders to complete a check-in.", flag: "checkins" },
  { code: "consultation_status_update", label: "Consultation updates", body: "Changes to a consultation with a provider.", flag: "provider_portal" },
];

export default function NotificationSettingsPage() {
  const { data, isLoading, isError } = useNotificationPreferences();
  const { data: consents } = useConsents();
  const { data: features } = useFeatures();
  const save = useUpdateNotificationPreferences();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [quietOn, setQuietOn] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    const { updated_at: _ignored, ...rest } = data;
    void _ignored;
    setDraft(rest);
    setQuietOn(data.quiet_hours_start !== null);
  }, [data]);

  const deliveryConsent = consents?.some((c) => c.purpose_code === "notifications_delivery" && c.status === "granted") ?? false;
  const visibleCategories = CATEGORIES.filter((c) => !c.flag || features?.[c.flag]);
  const update = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const base: Draft = deliveryConsent ? draft : { ...draft, email_enabled: false, sms_enabled: false, push_enabled: false };
    const payload: Draft = quietOn
      ? { ...base, quiet_hours_start: draft.quiet_hours_start ?? "22:00", quiet_hours_end: draft.quiet_hours_end ?? "07:00" }
      : { ...base, quiet_hours_start: null, quiet_hours_end: null };
    try {
      await save.mutateAsync(payload);
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }

  const errorMessage =
    save.error instanceof ApiRequestError ? save.error.message : save.error ? "We couldn't save your preferences. Please try again." : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Choose which reminders and alerts you receive, how, and when Albo should stay quiet."
      />

      {isLoading && <Skeleton className="h-80" />}
      {isError && <StateBlock kind="unavailable" title="Notification settings are unavailable" description="Please try again shortly." />}

      {draft && (
        <form onSubmit={onSubmit} className="space-y-5">
          {!deliveryConsent && (
            <div role="status" className="flex flex-wrap items-start gap-3 rounded-2xl border border-moderate/20 bg-moderate-bg px-4 py-3 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-moderate" aria-hidden />
              <p className="flex-1">
                Email, SMS and push need your <span className="font-medium">“Send me notifications”</span> consent. In-app notifications still work without it.
              </p>
              <ButtonLink href="/settings/consent" variant="secondary" size="sm">Manage consent</ButtonLink>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader icon={<Bell />} title="How to reach you" />
              <ul className="space-y-3">
                {CHANNELS.map((c) => {
                  const locked = c.external && !deliveryConsent;
                  return (
                    <li key={c.key}>
                      <Toggle
                        id={c.key}
                        icon={c.icon}
                        label={c.label}
                        body={locked ? "Needs notifications consent." : c.body}
                        checked={draft[c.key] && !locked}
                        disabled={locked}
                        onChange={(v) => update({ [c.key]: v } as Partial<Draft>)}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card>
              <CardHeader icon={<Inbox />} title="What to tell you about" />
              <ul className="space-y-3">
                {visibleCategories.map((c) => (
                  <li key={c.code}>
                    <Toggle
                      id={c.code}
                      label={c.label}
                      body={c.body}
                      checked={draft.enabled_categories.includes(c.code)}
                      onChange={(v) =>
                        update({
                          enabled_categories: v
                            ? [...draft.enabled_categories, c.code]
                            : draft.enabled_categories.filter((x) => x !== c.code),
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Important safety messages about your account are always shown in Albo.</p>
            </Card>
          </div>

          <Card>
            <CardHeader icon={<Moon />} title="Quiet hours" />
            <Toggle
              id="quiet-hours"
              label="Pause email, SMS and push overnight"
              body="Notifications wait in your Albo inbox until quiet hours end."
              checked={quietOn}
              onChange={(v) => {
                setSaved(false);
                setQuietOn(v);
              }}
            />
            {quietOn && (
              <div className="mt-4 grid max-w-md grid-cols-2 gap-4">
                <Field id="quiet-start" label="From">
                  <input
                    id="quiet-start"
                    type="time"
                    className={inputClass}
                    value={draft.quiet_hours_start ?? "22:00"}
                    onChange={(e) => update({ quiet_hours_start: e.target.value })}
                    required
                  />
                </Field>
                <Field id="quiet-end" label="Until">
                  <input
                    id="quiet-end"
                    type="time"
                    className={inputClass}
                    value={draft.quiet_hours_end ?? "07:00"}
                    onChange={(e) => update({ quiet_hours_end: e.target.value })}
                    required
                  />
                </Field>
              </div>
            )}
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save preferences"}
            </Button>
            {saved && <FormAlert tone="success">Saved. Changes apply to new notifications from now on.</FormAlert>}
            {errorMessage && <FormAlert>{errorMessage}</FormAlert>}
          </div>
        </form>
      )}
    </div>
  );
}

function Toggle({
  id,
  icon,
  label,
  body,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  icon?: React.ReactNode;
  label: string;
  body: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-line bg-surface-muted/70 p-3.5", disabled && "opacity-60")}>
      {icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-600 [&>svg]:size-4" aria-hidden>
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <p id={`${id}-desc`} className="text-xs text-muted">{body}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-desc`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed",
          checked ? "bg-accent-500" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}
