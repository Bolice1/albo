import { NotDiagnosisNotice, RiskLevelBadge, riskPresentation } from "@/components/domain";
import { createMockApi } from "@/lib/api/client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("RiskLevelBadge & non-diagnostic safety boundaries", () => {
  it("never renders a limited or failed assessment as low risk (ADR-003, ADR-014)", () => {
    expect(riskPresentation("limited", null).label).toBe("Limited information");
    expect(riskPresentation("failed", null).label).toBe("Unavailable");

    render(<RiskLevelBadge assessment={{ status: "limited", level: null }} />);
    expect(screen.getByText("Limited information")).toBeInTheDocument();
    expect(screen.queryByText(/low/i)).not.toBeInTheDocument();
  });

  it("pairs text with status levels and shows non-diagnostic notice", () => {
    render(
      <>
        <RiskLevelBadge assessment={{ status: "complete", level: "moderate" }} />
        <NotDiagnosisNotice />
      </>,
    );
    expect(screen.getByText("Moderate indicator")).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument();
  });

  it("enforces consent boundaries in mock API and preserves supersession history", async () => {
    const mockApi = createMockApi(undefined, 0);
    const active = await mockApi.listHealthInputs();
    const first = active[0];
    const corrected = await mockApi.correctHealthInput(first.id, {
      field_code: first.field_code,
      value: 180,
      unit: first.unit,
      observed_at: new Date().toISOString(),
    });
    expect(corrected.supersedes_input_id).toBe(first.id);

    const all = await mockApi.listHealthInputs({ includeHistory: true });
    expect(all.find((i) => i.id === first.id)?.status).toBe("superseded");
  });
});
