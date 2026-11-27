"use client";

import { FormAlert, PasswordInput } from "@/components/auth/password-input";
import { Button, Field, inputClass } from "@/components/ui/primitives";
import { auth, AuthError, validateEmail } from "@/lib/auth/auth";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const invalid = validateEmail(email);
    setEmailError(invalid);
    if (invalid) return;
    if (!password) {
      setFormError("Enter your password.");
      return;
    }
    setPending(true);
    try {
      await auth.signIn(email, password);
      router.push("/dashboard");
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : "We couldn't sign you in right now. Please try again shortly.");
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-ink-soft">Sign in to see your inputs, indicators and care options.</p>

      <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
        {formError && <FormAlert>{formError}</FormAlert>}
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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <Link href="/forgot-password" className="text-xs font-medium text-accent-600 hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"} {!pending && <ArrowUpRight />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        New to Albo?{" "}
        <Link href="/sign-up" className="font-medium text-ink hover:underline">Create an account</Link>
      </p>
      <p className="mt-8 rounded-xl bg-accent-50 px-3.5 py-2.5 text-xs text-ink-soft">
        Demo account (synthetic): <span className="font-medium">demo@albo.example</span> /{" "}
        <span className="font-medium">demo-pass-123</span>
      </p>
    </>
  );
}
