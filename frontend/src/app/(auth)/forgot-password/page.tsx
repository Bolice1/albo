"use client";

import { FormAlert } from "@/components/auth/password-input";
import { Button, ButtonLink, Field, inputClass } from "@/components/ui/primitives";
import { auth, RESET_CONFIRMATION, validateEmail } from "@/lib/auth/auth";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validateEmail(email);
    setEmailError(invalid);
    if (invalid) return;
    setState("pending");
    try {
      await auth.requestPasswordReset(email);
      setState("sent");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent-100 text-accent-600">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Check your email</h1>
        <p role="status" className="mt-3 text-sm text-ink-soft">{RESET_CONFIRMATION}</p>
        <ButtonLink href="/sign-in" variant="secondary" className="mt-8">Back to sign in</ButtonLink>
      </div>
    );
  }

  return (
    <>
      <Link href="/sign-in" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back to sign in
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-sm text-ink-soft">Enter the email you use for Albo and we&apos;ll send you a reset link.</p>

      <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
        {state === "error" && <FormAlert>We couldn&apos;t send the link right now. Please try again shortly.</FormAlert>}
        <Field id="email" label="Email" error={emailError}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "email-error" : undefined}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={state === "pending"}>
          {state === "pending" ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </>
  );
}
