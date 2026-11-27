/**
 * Albo authentication adapter.
 *
 * Authentication is owned by the approved identity provider (Supabase Auth
 * cloud default, ADR-005 / ADR-011) — not by the Albo `/api/v1` API. This
 * module hides the provider behind a small interface so pages never import a
 * vendor SDK directly. Only the mock adapter exists until integration.
 *
 * Safety rules (UI_UX §5, SECURITY):
 *  - Errors never reveal whether an account exists.
 *  - Credentials are never logged, persisted, or sent anywhere by the mock.
 */

export type AuthErrorCode = "INVALID_CREDENTIALS" | "VALIDATION_ERROR" | "UNAVAILABLE";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface SignUpInput {
  email: string;
  password: string;
}

export interface AuthAdapter {
  signIn(email: string, password: string): Promise<void>;
  signUp(input: SignUpInput): Promise<void>;
  /** Always resolves with the same outcome, whether or not the account exists. */
  requestPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}

/** Provisional client-side minimum; the identity provider's policy is authoritative. */
export const PASSWORD_MIN_LENGTH = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GENERIC_SIGN_IN_ERROR = "That email and password combination didn't work. Check them and try again.";
export const RESET_CONFIRMATION =
  "If an account exists for that email, we've sent a link to reset the password. It may take a few minutes to arrive.";

export function validateEmail(email: string): string | null {
  if (!email.trim()) return "Enter your email address.";
  if (!EMAIL.test(email.trim())) return "Enter an email address like name@example.com.";
  return null;
}

export function validateNewPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  return null;
}

/**
 * Mock adapter for UI development. Accepts the synthetic demo account
 * (`demo@albo.example` / `demo-pass-123`) and any account created this session.
 */
export function createMockAuth(delayMs = 300): AuthAdapter {
  const wait = () => new Promise((r) => setTimeout(r, delayMs));
  const accounts = new Map<string, string>([["demo@albo.example", "demo-pass-123"]]);

  return {
    async signIn(email, password) {
      await wait();
      if (accounts.get(email.trim().toLowerCase()) !== password) {
        throw new AuthError("INVALID_CREDENTIALS", GENERIC_SIGN_IN_ERROR);
      }
    },
    async signUp({ email, password }) {
      await wait();
      const emailError = validateEmail(email);
      const passwordError = validateNewPassword(password);
      if (emailError || passwordError) throw new AuthError("VALIDATION_ERROR", (emailError ?? passwordError)!);
      // Do not reveal an existing account: behave identically either way.
      const key = email.trim().toLowerCase();
      if (!accounts.has(key)) accounts.set(key, password);
    },
    async requestPasswordReset() {
      await wait();
    },
    async signOut() {
      await wait();
    },
  };
}

export const auth: AuthAdapter = createMockAuth();
