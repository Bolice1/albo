"use client";

import { FormAlert, PasswordInput } from "@/components/auth/password-input";
import { Button, Field, inputClass } from "@/components/ui/primitives";
import { auth, AuthError, PASSWORD_MIN_LENGTH, validateEmail, validateNewPassword } from "@/lib/auth/auth";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next = { email: validateEmail(email), password: validateNewPassword(password) };
    setErrors(next);
    if (next.email || next.password) return;
    setPending(true);
    try {
      await auth.signUp({ email, password });
      router.push("/onboarding");
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : "We couldn't create your account right now. Please try again shortly.");
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Next, we&apos;ll explain how Albo uses information and let you choose what to allow.
      </p>

      <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
        {formError && <FormAlert>{formError}</FormAlert>}
        <Field id="email" label="Email" error={errors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
        </Field>
        <Field
          id="password"
          label="Password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}
          error={errors.password}
        >
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : "password-hint"}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Continue"} {!pending && <ArrowUpRight />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-ink hover:underline">Sign in</Link>
      </p>
    </>
  );
}
