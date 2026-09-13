import { describe, expect, it } from "vitest";
import {
  agreementWizardSteps,
  nextWizardStep,
  previousWizardStep,
  visibleWizardSteps,
  wizardBackLabel,
} from "./wizard-flow";

describe("agreement wizard flow", () => {
  it("uses a mode-first flow with separate work and blockchain requirements", () => {
    expect(agreementWizardSteps).toEqual([
      "Participants",
      "Payment",
      "Verification Mode",
      "Work Requirements",
      "External Blockchain Condition",
      "Review",
      "Deploy & Fund",
    ]);
  });

  it("hides work requirements for external-only agreements", () => {
    expect(visibleWizardSteps("external")).toEqual([
      "Participants",
      "Payment",
      "Verification Mode",
      "External Blockchain Condition",
      "Review",
      "Deploy & Fund",
    ]);
  });

  it("hides the external condition for work-only agreements", () => {
    expect(visibleWizardSteps("work")).toEqual([
      "Participants",
      "Payment",
      "Verification Mode",
      "Work Requirements",
      "Review",
      "Deploy & Fund",
    ]);
  });

  it("keeps both requirement tracks for hybrid agreements", () => {
    expect(visibleWizardSteps("both")).toEqual(agreementWizardSteps);
  });

  it("skips hidden steps in both directions", () => {
    expect(nextWizardStep(3, "external")).toBe(5);
    expect(nextWizardStep(3, "work")).toBe(4);
    expect(previousWizardStep(6, "external")).toBe(5);
    expect(previousWizardStep(6, "work")).toBe(4);
    expect(previousWizardStep(1, "both")).toBe(1);
  });

  it("shows Cancel Agreement on the first step and Back on every later step", () => {
    expect(wizardBackLabel(1, false)).toBe("Cancel Agreement");
    expect(wizardBackLabel(3, false)).toBe("Back");
    expect(wizardBackLabel(3, true)).toBeUndefined();
  });
});
