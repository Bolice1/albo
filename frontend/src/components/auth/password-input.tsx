"use client";

import { inputClass } from "@/components/ui/primitives";
import { cn } from "@/lib/format";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PasswordInput({
  id,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={visible ? "text" : "password"} className={cn(inputClass, "pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={id}
        className="absolute inset-y-0 right-1 my-auto grid size-9 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-ink"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

export function FormAlert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "success" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-3.5 py-2.5 text-sm",
        tone === "error" ? "bg-high-bg text-high" : "bg-low-bg text-low",
      )}
    >
      {children}
    </p>
  );
}
