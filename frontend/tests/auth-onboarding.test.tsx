import { createMockApi } from "@/lib/api/client";
import { createMockDb } from "@/lib/api/mock-data";
import {
  AuthError,
  createMockAuth,
  GENERIC_SIGN_IN_ERROR,
  validateEmail,
  validateNewPassword,
} from "@/lib/auth/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("mock auth adapter (FR-001, safe errors)", () => {
  it("uses one generic message for unknown accounts and wrong passwords", async () => {
    const auth = createMockAuth(0);
    const unknown = await auth.signIn("nobody@albo.example", "whatever1").catch((e) => e);
    const wrong = await auth.signIn("demo@albo.example", "wrong-pass-1").catch((e) => e);
    expect(unknown).toBeInstanceOf(AuthError);
    expect(unknown.message).toBe(GENERIC_SIGN_IN_ERROR);
    expect(wrong.message).toBe(unknown.message);
    await expect(auth.signIn("demo@albo.example", "demo-pass-123")).resolves.toBeUndefined();
  });

  it("password reset never reveals whether the account exists", async () => {
    const auth = createMockAuth(0);
    await expect(auth.requestPasswordReset("demo@albo.example")).resolves.toBeUndefined();
    await expect(auth.requestPasswordReset("nobody@albo.example")).resolves.toBeUndefined();
  });

  it("sign-up does not reveal an existing account or overwrite its password", async () => {
    const auth = createMockAuth(0);
    await expect(auth.signUp({ email: "demo@albo.example", password: "another-pass-9" })).resolves.toBeUndefined();
    await expect(auth.signIn("demo@albo.example", "demo-pass-123")).resolves.toBeUndefined();
  });

  it("validates email and password", () => {
    expect(validateEmail("")).toMatch(/enter/i);
    expect(validateEmail("not-an-email")).toMatch(/like/i);
    expect(validateEmail("a@b.co")).toBeNull();
    expect(validateNewPassword("short1")).toMatch(/at least/i);
    expect(validateNewPassword("onlyletters")).toMatch(/letter and one number/i);
    expect(validateNewPassword("letters123")).toBeNull();
  });
});

describe("notification preferences (FR-015)", () => {
  it("allows in-app changes but requires notifications_delivery consent for external channels", async () => {
    const api = createMockApi(createMockDb(), 0);
    const updated = await api.updateNotificationPreferences({ enabled_categories: ["report_ready"] });
    expect(updated.enabled_categories).toEqual(["report_ready"]);

    await expect(api.updateNotificationPreferences({ email_enabled: true })).rejects.toMatchObject({ status: 403 });

    await api.grantConsent("notifications_delivery", "v1");
    await expect(api.updateNotificationPreferences({ email_enabled: true })).resolves.toMatchObject({ email_enabled: true });
  });

  it("validates quiet hours as HH:MM and requires both ends", async () => {
    const api = createMockApi(createMockDb(), 0);
    await expect(api.updateNotificationPreferences({ quiet_hours_start: "25:00" })).rejects.toMatchObject({ status: 422 });
    await expect(api.updateNotificationPreferences({ quiet_hours_start: null })).rejects.toMatchObject({ status: 422 });
    await expect(
      api.updateNotificationPreferences({ quiet_hours_start: null, quiet_hours_end: null }),
    ).resolves.toMatchObject({ quiet_hours_start: null, quiet_hours_end: null });
  });
});

describe("profile update (FR-005)", () => {
  it("rejects empty display names and saves trimmed ones", async () => {
    const api = createMockApi(createMockDb(), 0);
    await expect(api.updateProfile({ display_name: "   " })).rejects.toMatchObject({ status: 422 });
    await expect(api.updateProfile({ display_name: "  Synthetic Person " })).resolves.toMatchObject({
      display_name: "Synthetic Person",
    });
  });
});

describe("onboarding consent step (FR-002, FR-003)", () => {
  it("preselects nothing and blocks progress until the required item is accepted", async () => {
    vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/onboarding" }));
    const { default: OnboardingPage } = await import("@/app/onboarding/page");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <OnboardingPage />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText(/how indicators are made/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    const required = await screen.findByRole("checkbox", { name: /store my health inputs/i });
    const boxes = screen.getAllByRole("checkbox");
    boxes.forEach((b) => expect(b).not.toBeChecked());
    expect(screen.queryByRole("checkbox", { name: /share with an assigned provider/i })).not.toBeInTheDocument();

    const next = screen.getByRole("button", { name: /continue/i });
    expect(next).toBeDisabled();
    fireEvent.click(required);
    expect(next).toBeEnabled();
  });
});
