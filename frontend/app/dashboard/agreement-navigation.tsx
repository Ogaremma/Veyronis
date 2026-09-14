import React from "react";

export function AgreementNavigation({
  onBack,
  onHome,
}: {
  onBack: () => void;
  onHome: () => void;
}) {
  return (
    <nav
      className="dash-actions detail-navigation"
      aria-label="Agreement navigation"
    >
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
  push: (path: string) => void;
}

export function navigateAgreementBack(router: AgreementRouter) {
  router.push("/");
}

export function navigateAgreementHome(router: AgreementRouter) {
  router.push("/");
}
