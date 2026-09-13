import React from "react";

export function AgreementNavigation({
  onBack,
  onHome,
}: {
  onBack: () => void;
  onHome: () => void;
}) {
  return (
    <nav className="dash-actions detail-navigation" aria-label="Agreement navigation">
      <button className="dash-action" type="button" onClick={onBack}>
        Back
      </button>
      <button className="dash-action" type="button" onClick={onHome}>
        Home
      </button>
    </nav>
  );
}

interface AgreementRouter {
  back: () => void;
  push: (path: string) => void;
}

export function navigateAgreementBack(
  router: AgreementRouter,
  historyState: unknown = typeof window === "undefined"
    ? undefined
    : window.history.state,
) {
  if (hasPreviousInternalRoute(historyState)) router.back();
  else router.push("/");
}

export function navigateAgreementHome(router: AgreementRouter) {
  router.push("/");
}

export function hasPreviousInternalRoute(historyState: unknown) {
  if (typeof historyState !== "object" || historyState === null) return false;
  const index = (historyState as { idx?: unknown }).idx;
  return typeof index === "number" && index > 0;
}
