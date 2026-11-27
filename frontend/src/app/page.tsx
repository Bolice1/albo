import { Logo } from "@/components/shell/sidebar";
import { ButtonLink } from "@/components/ui/primitives";
import { BarChart3, HeartPulse, Lock, MapPin, ShieldCheck } from "lucide-react";

const FEATURES = [
  { icon: HeartPulse, title: "Track what matters", body: "Record a few lifestyle inputs and see how fresh they are." },
  { icon: BarChart3, title: "Explainable indicators", body: "See preventive indicators with their factors, limitations and next steps." },
  { icon: MapPin, title: "Find care", body: "Search facilities with their source and last-verified date." },
  { icon: Lock, title: "You stay in control", body: "Allow or withdraw each use of your data whenever you like." },
];

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-6">
      <header className="flex items-center justify-between">
        <Logo href="/" />
        <nav className="flex items-center gap-2">
          <ButtonLink href="/sign-in" variant="ghost">Sign in</ButtonLink>
          <ButtonLink href="/sign-up">Get started</ButtonLink>
        </nav>
      </header>

      <main className="flex flex-1 flex-col justify-center py-16">
        <p className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-surface/80 px-3 py-1 text-xs font-medium text-ink-soft shadow-[var(--shadow-card)]">
          <ShieldCheck className="size-3.5 text-accent-600" /> Preventive health, privacy first
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Understand your health habits, early and calmly.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-soft">
          Albo turns the information you choose to share into clear, explainable preventive indicators and helps you find care when you need it.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/dashboard" size="lg">Open the demo</ButtonLink>
          <ButtonLink href="#how" variant="secondary" size="lg">How Albo works</ButtonLink>
        </div>

        <ul id="how" className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-[var(--radius-card)] bg-surface/85 p-5 shadow-[var(--shadow-card)]">
              <span className="grid size-10 place-items-center rounded-xl bg-accent-50 text-accent-600">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-line py-6 text-xs text-muted">
        Albo is not a diagnostic tool or emergency service. Indicators are preventive estimates and do not replace a qualified health worker.
        This demo uses synthetic data only.
      </footer>
    </div>
  );
}
