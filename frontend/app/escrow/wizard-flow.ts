export const agreementWizardSteps = [
  "Participants",
  "Payment",
  "Verification Mode",
  "Work Requirements",
  "External Blockchain Condition",
  "Review",
  "Deploy & Fund",
] as const;

export type AgreementWizardStep = (typeof agreementWizardSteps)[number];

export type AgreementWizardMode = "work" | "external" | "both";

export function isWizardStepVisible(
  step: number,
  mode: AgreementWizardMode,
): boolean {
  if (step === 4) return mode !== "external";
  if (step === 5) return mode !== "work";
  return step >= 1 && step <= agreementWizardSteps.length;
}

export function visibleWizardSteps(
  mode: AgreementWizardMode,
): AgreementWizardStep[] {
  return agreementWizardSteps.filter((_, index) =>
    isWizardStepVisible(index + 1, mode),
  );
}

export function wizardBackLabel(
  step: number,
  deploying: boolean,
): "Cancel Agreement" | "Back" | undefined {
  if (deploying) return undefined;
  return step === 1 ? "Cancel Agreement" : "Back";
}

export function previousWizardStep(
  step: number,
  mode: AgreementWizardMode,
): number {
  let previous = step - 1;
  while (previous > 1 && !isWizardStepVisible(previous, mode)) previous -= 1;
  return Math.max(1, previous);
}

export function nextWizardStep(
  step: number,
  mode: AgreementWizardMode,
): number {
  let next = step + 1;
  while (
    next < agreementWizardSteps.length &&
    !isWizardStepVisible(next, mode)
  ) {
    next += 1;
  }
  return Math.min(agreementWizardSteps.length, next);
}
