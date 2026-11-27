import { cn } from "@/lib/format";
import Link from "next/link";
import { forwardRef } from "react";

/* --------------------------------- Card ---------------------------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("rounded-[var(--radius-card)] bg-surface/85 p-5 shadow-[var(--shadow-card)] backdrop-blur", className)}
      {...props}
    />
  );
}

export function CardHeader({
  icon,
  title,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink-soft">
        {icon && <span className="text-muted [&>svg]:size-4" aria-hidden>{icon}</span>}
        {title}
      </h2>
      {action}
    </header>
  );
}

/* -------------------------------- Button --------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "accent";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-soft",
  accent: "bg-accent-500 text-white hover:bg-accent-600",
  secondary: "bg-surface-muted text-ink hover:bg-accent-50 border border-line",
  ghost: "text-ink-soft hover:bg-surface-muted",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4",
    variants[variant],
    sizes[size],
    className,
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ variant, size, className, type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />;
});

export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-full bg-surface text-ink-soft shadow-[var(--shadow-card)] transition-colors hover:bg-accent-50 [&>svg]:size-[18px]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* --------------------------------- Pill ---------------------------------- */

export function Pill({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-medium text-ink-soft [&>svg]:size-3",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------ Segmented tabs ---------------------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-full bg-surface-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm text-muted transition-colors",
            value === o.value && "bg-surface text-ink shadow-[var(--shadow-card)]",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 text-xs text-muted">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- Progress -------------------------------- */

export function Progress({
  value,
  tone = "accent",
  label,
  className,
}: {
  value: number;
  tone?: "accent" | "moderate" | "high" | "neutral" | "white";
  label: string;
  className?: string;
}) {
  const toneClass = {
    accent: "bg-accent-300",
    moderate: "bg-[#f3c06b]",
    high: "bg-[#ef8f8f]",
    neutral: "bg-neutral/40",
    white: "bg-white",
  }[tone];
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("hatched h-2.5 w-full overflow-hidden rounded-full", className)}
    >
      <div className={cn("h-full rounded-full transition-[width]", toneClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------ Field controls ---------------------------- */

export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-muted">Optional</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-high">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-muted focus:border-accent-400 focus:outline-none focus:ring-4 focus:ring-accent-100";
