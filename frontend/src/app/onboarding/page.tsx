"use client";

import { FormAlert } from "@/components/auth/password-input";
import { Logo } from "@/components/shell/sidebar";
import { Button, ButtonLink, Field, inputClass } from "@/components/ui/primitives";
import { Skeleton } from "@/components/domain";
import { api } from "@/lib/api/client";
import { useConsentPurposes, useFeatures, useUpdateProfile } from "@/lib/api/hooks";
import type { ConsentPurpose } from "@/lib/api/types";
import { cn } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  HeartPulse,
  LifeBuoy,
  MapPin,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const STEPS = [
  { key: "about", label: "About Albo" },
  { key: "data", label: "Your data & AI" },
  { key: "consent", label: "Your choices" },
  { key: "profile", label: "Profile" },
] as const;

/** Purposes only shown when the matching gated feature is enabled. */
const GATED_PURPOSES: Record<string, "provider_portal" | "checkins" | "assistant"> = {
  provider_data_sharing: "provider_portal",
  wellbeing_check_ins: "checkins",
  assistant_conversations: "assistant",
};

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: purposes, isLoading } = useConsentPurposes();
  const { data: features } = useFeatures();
  const updateProfile = useUpdateProfile();

  const visiblePurposes = useMemo(
    () => (purposes ?? []).filter((p) => !GATED_PURPOSES[p.code] || features?.[GATED_PURPOSES[p.code]]),
    [purposes, features],
  );
  const missingRequired = visiblePurposes.filter((p) => p.required && !selected.has(p.code));

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  async function finish() {
    const name = displayName.trim();
    if (!name) {
      setNameError("Enter the name you'd like Albo to use.");
      return;
    }
    setNameError(null);
    setFormError(null);
    setSaving(true);
    try {
      for (const p of visiblePurposes.filter((p) => selected.has(p.code))) {
        await api.grantConsent(p.code, p.version);
      }
      await updateProfile.mutateAsync({ display_name: name, preferred_language: "en" });
      await qc.invalidateQueries({ queryKey: ["consents"] });
      router.push("/dashboard");
    } catch {
      setFormError("We couldn't save your choices. Nothing has been lost. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Logo href="/" />
        <ButtonLink href="/dashboard" variant="ghost" size="sm">Finish later</ButtonLink>
      </header>

      <nav aria-label="Onboarding progress" className="mt-8">
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <li key={s.key} aria-current={i === step ? "step" : undefined}>
              <div className={cn("h-1.5 rounded-full", i <= step ? "bg-accent-500" : "hatched bg-surface/60")} />
              <p className={cn("mt-2 hidden text-xs sm:block", i === step ? "font-medium text-ink" : "text-muted")}>
                {i < step && <Check className="mr-1 inline size-3 text-accent-600" aria-hidden />}
                {s.label}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted sm:hidden">
          Step {step + 1} of {STEPS.length}: {STEPS[step].label}
        </p>
      </nav>

      <main id="main" className="mt-6 flex-1 rounded-[var(--radius-panel)] bg-surface/85 p-6 shadow-[var(--shadow-card)] backdrop-blur sm:p-10">
        {step === 0 && <AboutStep />}
        {step === 1 && <DataStep />}
        {step === 2 && (
          <ConsentStep purposes={visiblePurposes} loading={isLoading} selected={selected} onToggle={toggle} />
        )}
        {step === 3 && (
          <div>
            <StepTitle icon={<UserRound />} title="What should we call you?" lead="You can change this any time in Settings." />
            {formError && <div className="mt-6"><FormAlert>{formError}</FormAlert></div>}
            <div className="mt-6 max-w-sm space-y-4">
              <Field id="display-name" label="Display name" error={nameError} hint="Shown only to you.">
                <input
                  id="display-name"
                  className={inputClass}
                  autoComplete="nickname"
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? "display-name-error" : "display-name-hint"}
                />
              </Field>
              <Field id="language" label="Language" hint="More languages will be added once approved.">
                <select id="language" className={inputClass} defaultValue="en" disabled>
                  <option value="en">English</option>
                </select>
              </Field>
            </div>
            <p className="mt-6 text-sm text-ink-soft">
              You&apos;ll add health inputs, such as activity and sleep, from your dashboard when you&apos;re ready. Every field is explained before you fill it in.
            </p>
          </div>
        )}
      </main>

      <footer className="mt-6 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || saving}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex items-center gap-3">
          {step === 2 && missingRequired.length > 0 && (
            <p className="hidden text-xs text-muted sm:block">Accept the required item to continue.</p>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              size="lg"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 2 && (isLoading || missingRequired.length > 0)}
            >
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button size="lg" onClick={finish} disabled={saving}>
              {saving ? "Saving…" : "Go to my dashboard"} {!saving && <ArrowRight />}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function StepTitle({ icon, title, lead }: { icon: React.ReactNode; title: string; lead: string }) {
  return (
    <>
      <span className="grid size-12 place-items-center rounded-2xl bg-accent-100 text-accent-600 [&>svg]:size-5" aria-hidden>
        {icon}
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 text-ink-soft">{lead}</p>
    </>
  );
}

function InfoList({ items }: { items: { icon: React.ReactNode; title: string; body: string }[] }) {
  return (
    <ul className="mt-8 grid gap-3 sm:grid-cols-2">
      {items.map((i) => (
        <li key={i.title} className="rounded-2xl border border-line bg-surface-muted/70 p-4">
          <p className="flex items-center gap-2 font-medium [&>svg]:size-4 [&>svg]:text-accent-600">
            {i.icon}
            {i.title}
          </p>
          <p className="mt-1.5 text-sm text-ink-soft">{i.body}</p>
        </li>
      ))}
    </ul>
  );
}

function AboutStep() {
  return (
    <div>
      <StepTitle
        icon={<HeartPulse />}
        title="Welcome to Albo"
        lead="Albo helps you keep track of everyday health habits, spot preventive risk indicators early, and find care near you."
      />
      <InfoList
        items={[
          { icon: <HeartPulse />, title: "Track a few habits", body: "Record activity, sleep, diet and similar inputs, and see when they need updating." },
          { icon: <ShieldCheck />, title: "Explainable indicators", body: "See what an indicator is based on, how recent it is, and what you could do next." },
          { icon: <MapPin />, title: "Find care", body: "Search facilities with their services, contact details and when the information was last checked." },
          { icon: <Stethoscope />, title: "Not a doctor", body: "Albo does not diagnose, prescribe or replace a health professional." },
        ]}
      />
    </div>
  );
}

function DataStep() {
  return (
    <div>
      <StepTitle
        icon={<ShieldCheck />}
        title="How Albo uses your information"
        lead="Before you share anything, here is what happens to it."
      />
      <InfoList
        items={[
          { icon: <ShieldCheck />, title: "Only what you allow", body: "Each use of your data needs your permission. You can withdraw it later in Consent & privacy." },
          { icon: <Bot />, title: "How indicators are made", body: "Indicators come from documented rules, not a doctor. They can be wrong or limited when information is missing or old." },
          { icon: <UserRound />, title: "Who can see it", body: "You. A provider can see it only if you allow sharing and they are assigned to you." },
          { icon: <LifeBuoy />, title: "Not for emergencies", body: "Albo is not monitored around the clock. In an emergency, contact your local emergency number." },
        ]}
      />
    </div>
  );
}

function ConsentStep({
  purposes,
  loading,
  selected,
  onToggle,
}: {
  purposes: ConsentPurpose[];
  loading: boolean;
  selected: Set<string>;
  onToggle: (code: string) => void;
}) {
  return (
    <div>
      <StepTitle
        icon={<Check />}
        title="Choose what Albo may do"
        lead="Nothing is turned on for you. Optional items can be switched on or off later."
      />
      {loading && <Skeleton className="mt-8 h-64" />}
      <fieldset className="mt-8">
        <legend className="sr-only">Consent choices</legend>
        <ul className="space-y-3">
          {purposes.map((p) => {
            const id = `consent-${p.code}`;
            const checked = selected.has(p.code);
            return (
              <li key={p.code}>
                <label
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                    checked ? "border-accent-300 bg-accent-50" : "border-line bg-surface-muted/70 hover:bg-accent-50/60",
                  )}
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(p.code)}
                    className="mt-1 size-4 shrink-0 accent-[var(--color-accent-500)]"
                    aria-describedby={`${id}-desc`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {p.title}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          p.required ? "bg-ink text-white" : "bg-surface text-muted",
                        )}
                      >
                        {p.required ? "Required" : "Optional"}
                      </span>
                    </span>
                    <span id={`${id}-desc`} className="mt-1 block text-sm text-ink-soft">
                      {p.description}
                      <span className="mt-1 block text-xs text-muted">
                        Data involved: {p.data_involved} · Version {p.version}
                      </span>
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <p className="mt-4 text-xs text-muted">
        The required item lets Albo store what you enter. Without it, Albo can&apos;t save your health inputs.
      </p>
    </div>
  );
}
