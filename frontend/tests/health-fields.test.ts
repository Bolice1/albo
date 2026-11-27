import { freshness } from "@/lib/format";
import { validateFieldValue } from "@/lib/health-fields";
import { describe, expect, it } from "vitest";

describe("validateFieldValue", () => {
  it("accepts valid allowlisted values", () => {
    expect(validateFieldValue("physical_activity_minutes_per_week", "150")).toBeNull();
    expect(validateFieldValue("sleep_hours_avg", "7.5")).toBeNull();
    expect(validateFieldValue("tobacco_use_status", "never")).toBeNull();
    expect(validateFieldValue("diet_fruit_veg_servings_per_day", "5")).toBeNull();
  });

  it("rejects out-of-range, non-integer, and unapproved fields", () => {
    expect(validateFieldValue("physical_activity_minutes_per_week", "15.5")).not.toBeNull();
    expect(validateFieldValue("physical_activity_minutes_per_week", "-1")).not.toBeNull();
    expect(validateFieldValue("sleep_hours_avg", "30")).not.toBeNull();
    expect(validateFieldValue("tobacco_use_status", "invalid")).not.toBeNull();
    expect(validateFieldValue("unapproved_biomarker", "42")).not.toBeNull();
  });
});

describe("freshness", () => {
  it("marks inputs beyond maxAgeHours as stale", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const fresh = freshness("2026-11-20T12:00:00Z", 720, now);
    expect(fresh.isStale).toBe(false);
    expect(fresh.daysLeft).toBe(24);

    const stale = freshness("2026-10-01T12:00:00Z", 720, now);
    expect(stale.isStale).toBe(true);
    expect(stale.daysLeft).toBe(0);
    expect(stale.remaining).toBe(0);
  });
});
