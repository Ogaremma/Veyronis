import { describe, expect, it } from "vitest";
import {
  agreementWizardSteps,
  previousWizardStep,
  wizardBackLabel,
} from "./wizard-flow";

describe("agreement wizard flow", () => {
  it("uses the seven-step delivery-first flow", () => {
    expect(agreementWizardSteps).toEqual([
      "Participants",
      "Payment",
      "Deliverables",
      "Evidence Requirements",
      "Agreement Conditions",
      "Review",
      "Deploy & Fund",
    ]);
  });

  it("shows Cancel Agreement on the first step and Back on every later step", () => {
    expect(wizardBackLabel(1, false)).toBe("Cancel Agreement");
    for (let step = 2; step <= agreementWizardSteps.length; step += 1) {
      expect(wizardBackLabel(step, false)).toBe("Back");
      expect(previousWizardStep(step)).toBe(step - 1);
    }
    expect(previousWizardStep(1)).toBe(1);
    expect(wizardBackLabel(3, true)).toBeUndefined();
  });
});
