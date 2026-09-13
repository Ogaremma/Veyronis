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

export function navigateAgreementBack(router: { back: () => void }) {
  router.back();
}

export function navigateAgreementHome(router: { push: (path: "/") => void }) {
  router.push("/");
}
