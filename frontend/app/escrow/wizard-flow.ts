export const agreementWizardSteps = [
  "Participants",
  "Payment",
  "Deliverables",
  "Evidence Requirements",
  "Agreement Conditions",
  "Review",
  "Deploy & Fund",
] as const;

export type AgreementWizardStep =
  (typeof agreementWizardSteps)[number];

export function wizardBackLabel(
  step: number,
  deploying: boolean,
): "Cancel Agreement" | "Back" | undefined {
  if (deploying) return undefined;
  return step === 1 ? "Cancel Agreement" : "Back";
}

export function previousWizardStep(step: number): number {
  return Math.max(1, step - 1);
}
