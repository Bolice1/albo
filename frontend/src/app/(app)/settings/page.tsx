"use client";

import { PageHeader } from "@/components/domain";
import { Button, ButtonLink, Card, CardHeader, Field, inputClass } from "@/components/ui/primitives";
import { useMe, useUpdateProfile } from "@/lib/api/hooks";
import { useState } from "react";
import { Bell, Download, ShieldCheck, Trash2, User } from "lucide-react";

export default function SettingsPage() {
  const { data: me } = useMe();
  const updateProfile = useUpdateProfile();
  const [status, setStatus] = useState<string | null>(null);

  async function onSaveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("display_name") ?? "");
    setStatus(null);
    try {
      await updateProfile.mutateAsync({ display_name: name });
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "We couldn't save your profile.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Manage your profile, privacy and account." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<User />} title="Profile" />
          <form className="space-y-4" onSubmit={onSaveProfile}>
            <Field id="display-name" label="Display name">
              <input id="display-name" name="display_name" maxLength={80} required className={inputClass} defaultValue={me?.display_name} key={me?.display_name} />
            </Field>
            <Field id="handle" label="Username" hint="Shown only to you.">
              <input id="handle" className={inputClass} defaultValue={me?.handle} key={me?.handle} disabled />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Saving…" : "Save changes"}
              </Button>
              {status && <p role="status" className="text-sm text-ink-soft">{status}</p>}
            </div>
          </form>
        </Card>

        <div className="grid gap-5">
          <Card>
            <CardHeader icon={<ShieldCheck />} title="Consent & privacy" />
            <p className="mb-4 text-sm text-ink-soft">Review what Albo may use your information for and withdraw at any time.</p>
            <ButtonLink href="/settings/consent" variant="secondary">Manage consent</ButtonLink>
          </Card>
          <Card>
            <CardHeader icon={<Bell />} title="Notifications" />
            <p className="mb-4 text-sm text-ink-soft">Choose reminders, channels and quiet hours.</p>
            <ButtonLink href="/settings/notifications" variant="secondary">Notification settings</ButtonLink>
          </Card>
          <Card>
            <CardHeader icon={<Download />} title="Your data" />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled><Download /> Request data export</Button>
              <Button variant="ghost" className="text-high" disabled><Trash2 /> Request account deletion</Button>
            </div>
            <p className="mt-3 text-xs text-muted">Available once connected to the Albo service.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
