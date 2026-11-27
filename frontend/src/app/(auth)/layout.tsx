import { Logo } from "@/components/shell/sidebar";
import { HeartPulse, Lock, ShieldCheck } from "lucide-react";

const POINTS = [
  { icon: ShieldCheck, text: "You choose what Albo may use, and can withdraw it any time." },
  { icon: HeartPulse, text: "Preventive indicators explain their factors and limits. They are not a diagnosis." },
  { icon: Lock, text: "Your health information is never sold or shown to others without permission." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl items-center px-4 py-6 sm:px-6">
      <div className="grid w-full overflow-hidden rounded-[var(--radius-panel)] bg-surface/60 shadow-[var(--shadow-pop)] backdrop-blur lg:grid-cols-[1.05fr_1fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-accent-300 via-accent-400 to-accent-600 p-10 text-white lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/15 blur-2xl"
          />
          <Logo href="/" className="relative rounded-full bg-white/90 px-3 py-1.5 text-ink w-fit" />
          <div className="relative">
            <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
              Understand your health habits, early and calmly.
            </h2>
            <ul className="mt-8 space-y-4">
              {POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-sm text-white/90">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/20">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-white/75">
            Albo is not an emergency service. In an emergency, contact your local emergency number.
          </p>
        </aside>

        <main id="main" className="flex flex-col bg-surface/90 p-6 sm:p-10">
          <Logo href="/" className="mb-8 lg:hidden" />
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">{children}</div>
        </main>
      </div>
    </div>
  );
}
